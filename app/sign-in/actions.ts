"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isDatabaseUnreachable, prisma } from "@/lib/db";
import { ingestFromAcademia } from "@/lib/ingest";
import { MailNotConfiguredError, sendMagicLink } from "@/lib/mail";
import { CLAIM_TTL_MINUTES, signClaimToken, startSession } from "@/lib/session";
import { signInToAcademia } from "@/lib/sources/academia-auth";
import { fetchCourseTable, parseAcademiaProfile } from "@/lib/sources/academia-page";
import {
  checkSignInAllowed,
  clearSignInFailures,
  recordSignInFailure,
} from "@/lib/throttle";

/**
 * Signing in.
 *
 * Two ways in, both starting from a NetID.
 *
 * The primary one takes the student's SRM password and completes Academia's
 * Zoho login server-side. What that buys is a session and a fresh timetable —
 * Academia gates attendance and marks behind a page students can't open, so
 * those still arrive through the extension and the Student Portal. The password
 * is used for exactly one upstream request and is never stored, never logged,
 * and never included in anything returned to the page.
 *
 * The second emails a one-time link, for anyone who'd rather not type their SRM
 * password into a site that isn't SRM's. That is the safer habit and the copy
 * says so.
 */

const NETID_DOMAIN = "srmist.edu.in";
const EMAIL_COOLDOWN_MS = 60_000;

const NetId = z
  .string()
  .trim()
  .toLowerCase()
  // Accept the bare NetID or the full address; either way, keep the NetID.
  .transform((value) => value.replace(new RegExp(`@${NETID_DOMAIN}$`), ""))
  .refine((value) => !value.includes("@"), {
    message: `Use your @${NETID_DOMAIN} address — that's the only one we recognise.`,
  })
  .refine((value) => /^[a-z0-9._-]{3,32}$/.test(value), {
    message: "That doesn't look like a NetID — it's the part before @srmist.edu.in.",
  });

export interface SignInState {
  status: "idle" | "sent" | "error";
  message?: string;
  /**
   * A short machine-readable tag for the step that failed, rendered faintly
   * under the message. Remote debugging of this page means asking a student
   * what they saw, and "it didn't work" costs a round trip that one token
   * saves.
   */
  code?: string;
  /** Echoed back so the confirmation can say where the link went. */
  sentTo?: string;
}

/** Best-effort client address, for the per-address half of the throttle. */
async function clientAddress(): Promise<string | null> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");

  return forwarded?.split(",")[0]?.trim() || store.get("x-real-ip") || null;
}

// ---------------------------------------------------------------------------
// Password sign-in, via Academia
// ---------------------------------------------------------------------------

const PasswordInput = z.object({
  netId: NetId,
  // Not trimmed and not shaped: a password is bytes the student chose, and
  // "tidying" it here would reject correct ones.
  password: z.string().min(1, "Enter your SRM password."),
});

export async function signInWithAcademia(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = PasswordInput.safeParse({
    netId: formData.get("netId"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const { netId, password } = parsed.data;
  const address = await clientAddress();

  // Before anything reaches SRM. A refusal here costs them nothing.
  //
  // If the throttle itself can't be read we refuse rather than wave the
  // attempt through: a credential relay with its rate limiter down is the one
  // state where failing open is worse than failing shut.
  let verdict;
  try {
    verdict = await checkSignInAllowed(netId, address);
  } catch (error) {
    if (isDatabaseUnreachable(error)) {
      return {
        status: "error",
        message:
          "Studeo can't reach its database right now, so sign-in is paused. If you're running Studeo locally on campus WiFi, that network blocks the database ports.",
      };
    }
    throw error;
  }

  if (!verdict.allowed) {
    return {
      status: "error",
      message: `Too many failed attempts. Try again in ${verdict.retryInMinutes} minutes, or use the email link below.`,
    };
  }

  const auth = await signInToAcademia(`${netId}@${NETID_DOMAIN}`, password);

  if (!auth.ok || !auth.cookie) {
    // Only a rejected credential counts toward a lockout. An outage or a
    // session cap isn't evidence of guessing, and locking someone out because
    // SRM was down would be our bug wearing a security costume.
    if (auth.failure === "BAD_PASSWORD" || auth.failure === "UNKNOWN_USER") {
      await recordSignInFailure(netId, address);
    }

    return {
      status: "error",
      message: describeAuthFailure(auth.failure),
      code: auth.failure,
    };
  }

  await clearSignInFailures(netId, address);

  const page = await fetchCourseTable(auth.cookie);
  if (!page.ok || !page.html) {
    return {
      status: "error",
      code: `COURSE_TABLE_${page.reason ?? "UNKNOWN"}`,
      message:
        page.reason === "SIGNED_OUT"
          ? "Academia accepted the password but wouldn't hand over your pages. Try once more."
          : "Signed in, but your course table wasn't where Academia usually keeps it. This normally means SRM renamed the page — it's ours to fix, not yours.",
    };
  }

  let result;
  try {
    result = await ingestFromAcademia({
      netId,
      profile: parseAcademiaProfile(page.html),
      coursesHtml: page.html,
    });
  } catch (error) {
    console.error("sign-in: academia ingest failed", error);
    return {
      status: "error",
      code: "INGEST_FAILED",
      message: "Signed in, but saving your timetable failed. Try again in a minute.",
    };
  }

  await startSession({ userId: result.userId, netId });

  // Outside the try: redirect throws by design, and catching it would turn a
  // successful sign-in into an error message.
  redirect("/dashboard");
}

function describeAuthFailure(failure: string | undefined): string {
  switch (failure) {
    case "UNKNOWN_USER":
      return "SRM doesn't recognise that NetID.";
    case "BAD_PASSWORD":
      return "That password was rejected by SRM. It's the same one you use for Academia.";
    case "TOO_MANY_SESSIONS":
      return "SRM says you're signed in on too many devices and wouldn't let us clear them. Sign out of Academia somewhere else, then try again.";
    case "CAPTCHA_REQUIRED":
      return "SRM is asking for a CAPTCHA, which Studeo can't answer. Sign in at academia.srmist.edu.in directly, then come back.";
    default:
      return "Academia didn't respond. That's usually SRM being down rather than anything you did.";
  }
}

// ---------------------------------------------------------------------------
// Email sign-in
// ---------------------------------------------------------------------------

export async function requestSignInLink(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = z.object({ netId: NetId }).safeParse({ netId: formData.get("netId") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const { netId } = parsed.data;
  const to = `${netId}@${NETID_DOMAIN}`;

  const user = await prisma.user.findUnique({
    where: { netId },
    select: { id: true, netId: true, isDemo: true, signInEmailSentAt: true },
  });

  // Saying so plainly rather than a uniform "check your inbox" is a deliberate
  // trade: it lets someone confirm a NetID has a Studeo account, but NetIDs are
  // email addresses on a campus of tens of thousands, not secrets — and a new
  // student staring at an inbox that never fills up is the worse outcome.
  if (!user || user.isDemo) {
    return {
      status: "error",
      message:
        "No Studeo account for that NetID yet. Sign in with your SRM password above, or run the extension once — either one creates it.",
    };
  }

  const since = user.signInEmailSentAt ? Date.now() - user.signInEmailSentAt.getTime() : Infinity;
  if (since < EMAIL_COOLDOWN_MS) {
    return {
      status: "sent",
      sentTo: to,
      message:
        "A link went out less than a minute ago — check your inbox, including spam, before asking for another.",
    };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    console.error("sign-in: NEXT_PUBLIC_APP_URL is not set; can't build a link");
    return { status: "error", message: "Sign-in isn't configured on this server yet." };
  }

  const token = await signClaimToken({ userId: user.id, netId: user.netId }, "email");
  const url = `${base.replace(/\/+$/, "")}/claim?token=${encodeURIComponent(token)}`;

  try {
    await sendMagicLink({ to, url, minutes: CLAIM_TTL_MINUTES.email });
  } catch (error) {
    if (error instanceof MailNotConfiguredError) {
      console.error("sign-in:", error.message);
      return { status: "error", message: "Sign-in email isn't configured on this server yet." };
    }

    console.error("sign-in: send failed", error);
    return {
      status: "error",
      message: "The email didn't send. Try again in a minute, or use your SRM password above.",
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { signInEmailSentAt: new Date() },
  });

  return { status: "sent", sentTo: to };
}
