import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

/**
 * Studeo's own sign-in — entirely separate from SRM's.
 *
 * There is no Studeo password. A student proves who they are by being logged
 * into the Student Portal in their own browser: the extension fetches their
 * own pages and posts them here, and possession of a genuine, freshly-fetched
 * profile page is the credential.
 *
 * That is a deliberately modest security claim, and worth being honest about:
 * a determined student could hand-craft a payload for someone else's
 * registration number. The blast radius is small — friendships require
 * acceptance, so impersonation grants no access to anyone else's data — but it
 * would let someone squat on an account that isn't theirs. Verifying the
 * @srmist.edu.in address by email is the fix, and is a to-do rather than a
 * thing this file pretends to have solved.
 */

const COOKIE_NAME = "studeo_session";
const ISSUER = "studeo";
const MAX_AGE_DAYS = 30;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  return new TextEncoder().encode(value);
}

export interface SessionClaims {
  userId: string;
  netId: string;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ netId: claims.netId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(secret());
}

export async function readSession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    if (!payload.sub || typeof payload.netId !== "string") return null;

    return { userId: payload.sub, netId: payload.netId };
  } catch {
    // Expired, tampered with, or signed under a rotated secret. All three mean
    // the same thing to a caller: not signed in.
    return null;
  }
}

/** Set the session cookie. Server actions and route handlers only. */
export async function startSession(claims: SessionClaims): Promise<void> {
  const store = await cookies();

  store.set(COOKIE_NAME, await signSession(claims), {
    httpOnly: true, // never readable from page scripts
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // survives following a link into the app
    path: "/",
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Claim tokens
// ---------------------------------------------------------------------------

const CLAIM_AUDIENCE = "studeo:claim";

/**
 * How a claim token reached the student. Recorded in the token so that
 * consuming it can do the right follow-up: an emailed link proves the
 * @srmist.edu.in address, an extension link proves nothing new.
 */
export type ClaimVia = "extension" | "email";

/** Minutes a claim token lives, by route. */
export const CLAIM_TTL_MINUTES: Record<ClaimVia, number> = {
  // Only has to survive the gap between a sync finishing and a tab opening.
  extension: 5,
  // Has to survive a walk to the phone and an inbox that's slow to refresh.
  email: 15,
};

export interface ClaimClaims extends SessionClaims {
  via: ClaimVia;
}

/**
 * A single short-lived token that opens Studeo already signed in.
 *
 * Two things deliver one: the extension, which gets it back from a successful
 * ingest and opens it in a tab; and the sign-in page, which emails it to the
 * student's institutional address. Same token, same consumer (/claim), one
 * difference recorded inside it.
 *
 * The extension can't set our session cookie itself: it posts from a different
 * origin, and a cross-origin cookie would need SameSite=None plus credentialed
 * CORS — a lot of machinery, and a cookie that then rides along on every
 * cross-site request. Handing back a token the extension puts in a URL keeps
 * the actual session cookie a plain same-origin affair.
 *
 * The separate audience means a claim token can never be replayed as a session
 * token, even though both are signed with the same secret.
 */
export async function signClaimToken(
  claims: SessionClaims,
  via: ClaimVia = "extension"
): Promise<string> {
  return new SignJWT({ netId: claims.netId, via })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(CLAIM_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CLAIM_TTL_MINUTES[via]}m`)
    .sign(secret());
}

export async function readClaimToken(token: string): Promise<ClaimClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: CLAIM_AUDIENCE,
    });
    if (!payload.sub || typeof payload.netId !== "string") return null;

    // Tokens minted before `via` existed carry none; they can only have come
    // from the extension.
    const via: ClaimVia = payload.via === "email" ? "email" : "extension";

    return { userId: payload.sub, netId: payload.netId, via };
  } catch {
    return null;
  }
}

/** The signed-in student, or null. */
export async function currentSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  return readSession(token);
}
