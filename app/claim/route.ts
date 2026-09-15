import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { readClaimToken, startSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchange a claim token for a session.
 *
 * Two things open this URL: the extension, in a tab after a successful sync;
 * and a student, from the link the sign-in page emailed them. Because the
 * request is same-origin and top-level either way, we can set an httpOnly
 * session cookie normally — which is the whole reason the token detour exists.
 *
 * The token is consumed by being used: it lives minutes and the session it
 * mints lasts thirty days, so there is nothing worth replaying afterwards.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/sign-in?error=missing-token", url.origin));
  }

  const claims = await readClaimToken(token);
  if (!claims) {
    // Expired or tampered with. Both mean "get a new one" to the student, so
    // don't distinguish them in the message.
    return NextResponse.redirect(new URL("/sign-in?error=expired-link", url.origin));
  }

  // An emailed link could only have been opened by someone who can read the
  // <netid>@srmist.edu.in inbox. That is the identity check the ingest route
  // has never had, so record it — once; the first time is the proof.
  if (claims.via === "email") {
    await prisma.user.updateMany({
      where: { id: claims.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  await startSession(claims);
  return NextResponse.redirect(new URL("/dashboard", url.origin));
}
