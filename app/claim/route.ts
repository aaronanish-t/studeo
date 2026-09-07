import { NextResponse } from "next/server";

import { readClaimToken, startSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchange a claim token for a session.
 *
 * The extension opens this URL in a tab after a successful sync. Because the
 * request is same-origin and top-level, we can set an httpOnly session cookie
 * normally — which is the whole reason the token detour exists.
 *
 * The token is consumed by being used: it lives five minutes and the session it
 * mints lasts thirty days, so there is nothing worth replaying afterwards.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/?error=missing-token", url.origin));
  }

  const claims = await readClaimToken(token);
  if (!claims) {
    // Expired or tampered with. Both mean "sync again" to the student, so
    // don't distinguish them in the message.
    return NextResponse.redirect(new URL("/?error=expired-link", url.origin));
  }

  await startSession(claims);
  return NextResponse.redirect(new URL("/dashboard", url.origin));
}
