"use server";

import { z } from "zod";

import { prisma } from "@/lib/db";
import { MailNotConfiguredError, sendMagicLink } from "@/lib/mail";
import { CLAIM_TTL_MINUTES, signClaimToken } from "@/lib/session";

/**
 * Email a sign-in link.
 *
 * Studeo has no password. The first time, a student proves who they are by
 * running the extension while signed into the Student Portal. After that they
 * have an account, and this is how they get back into it from anywhere — a
 * phone especially, where the extension can't run.
 *
 * The link goes to `<netid>@srmist.edu.in` and nowhere else. Not to the email
 * the portal reported, not to an address typed into the form. Only the
 * institutional inbox proves the NetID is theirs, which is the whole reason an
 * emailed link is worth more than the extension's: it's the identity check the
 * ingest route has always said it lacks.
 */

const NETID_DOMAIN = "srmist.edu.in";

/** Two sends per minute per NetID is plenty; more is someone hammering it. */
const COOLDOWN_MS = 60_000;

const Input = z.object({
  netId: z
    .string()
    .trim()
    .toLowerCase()
    // Accept the bare NetID or the full address; either way, keep the NetID.
    .transform((value) => value.replace(new RegExp(`@${NETID_DOMAIN}$`), ""))
    .refine((value) => !value.includes("@"), {
      message: `Use your @${NETID_DOMAIN} address — that's the only one we can send to.`,
    })
    .refine((value) => /^[a-z0-9._-]{3,32}$/.test(value), {
      message: "That doesn't look like a NetID — it's the part before @srmist.edu.in.",
    }),
});

export interface SignInState {
  status: "idle" | "sent" | "error";
  message?: string;
  /** Echoed back so the confirmation can say where the link went. */
  sentTo?: string;
}

export async function requestSignInLink(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = Input.safeParse({ netId: formData.get("netId") });
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
        "No Studeo account for that NetID yet. The first sign-in has to come through the extension — it's what brings your data across.",
    };
  }

  const since = user.signInEmailSentAt ? Date.now() - user.signInEmailSentAt.getTime() : Infinity;
  if (since < COOLDOWN_MS) {
    return {
      status: "sent",
      sentTo: to,
      message: "A link went out less than a minute ago — check your inbox, including spam, before asking for another.",
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
      message: "The email didn't send. Try again in a minute; if it keeps failing, sync with the extension instead.",
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { signInEmailSentAt: new Date() },
  });

  return { status: "sent", sentTo: to };
}
