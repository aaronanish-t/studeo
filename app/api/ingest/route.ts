import { NextResponse } from "next/server";
import { z } from "zod";

import { ingest, IngestError } from "@/lib/ingest";
import { signClaimToken } from "@/lib/session";
import { PortalParseError } from "@/lib/sources/html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the browser extension posts a student's own portal pages.
 *
 * No credential ever arrives here. The extension fetched these pages in the
 * student's browser, with their cookies, after they logged in and completed
 * SRM's CAPTCHA themselves. What we receive is the same markup they're looking
 * at, and possession of a freshly-fetched profile page is what identifies them.
 *
 * The honest limit of that: a determined student could hand-craft a payload
 * naming someone else's registration number. Friendships require acceptance, so
 * it grants access to nobody else's data — but it would let someone squat on an
 * account. Verifying the @srmist.edu.in address by email is the fix and is not
 * done yet.
 */

/** Portal pages are tens of kilobytes; a megabyte each is already generous. */
const MAX_FIELD_BYTES = 1_000_000;

const htmlField = z
  .string()
  .max(MAX_FIELD_BYTES, "That page is unexpectedly large — is it really a portal page?");

const PayloadSchema = z.object({
  profileHtml: htmlField,
  attendanceHtml: htmlField.optional(),
  marksHtml: htmlField.optional(),
  marksDetail: z
    .array(z.object({ courseCode: z.string().max(32), html: htmlField }))
    // One entry per graded course. A semester has well under this many.
    .max(40)
    .optional(),
  calendarHtml: htmlField.optional(),
  coursesHtml: htmlField.optional(),
});

/**
 * The extension posts from its own origin, so this endpoint answers preflight.
 * It is deliberately open: there is no cookie or credential on this request, so
 * a permissive CORS policy grants an attacker nothing they couldn't do with
 * curl. The interesting authorisation question is the payload, above.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Name the field. Zod's default ("expected string, received undefined")
    // is true and useless when four of the five fields are optional.
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");

    return NextResponse.json(
      {
        error: field
          ? `${field}: ${issue.message}`
          : (issue?.message ?? "That payload didn't look right."),
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const result = await ingest(parsed.data);
    const claimToken = await signClaimToken({
      userId: result.userId,
      netId: result.netId,
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

    return NextResponse.json(
      {
        ok: true,
        netId: result.netId,
        wrote: result.wrote,
        // The extension opens this to land the student in Studeo, signed in.
        claimUrl: `${base}/claim?token=${encodeURIComponent(claimToken)}`,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    // A parse failure means SRM changed their markup — worth saying plainly
    // rather than as a generic 500, because it tells the student it isn't
    // something they did.
    if (error instanceof PortalParseError || error instanceof IngestError) {
      return NextResponse.json(
        { error: error.message },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    console.error("ingest failed", error);
    return NextResponse.json(
      { error: "Something went wrong saving that. Try again in a minute." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
