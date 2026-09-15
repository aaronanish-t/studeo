import { prisma } from "./db";

/**
 * Rate limiting for the Academia sign-in.
 *
 * This is the one place in Studeo where a form relays a credential to a system
 * that isn't ours. Without a limit, the sign-in page is a credential-stuffing
 * proxy aimed at SRM's IAM: an attacker with a NetID list would get unlimited
 * attempts from someone else's infrastructure, and the lockouts would land on
 * students who never used Studeo.
 *
 * Two keys, both counted. NetID stops one account being hammered from many
 * addresses; client address stops one address sweeping many accounts. Either
 * hitting the limit is enough to refuse, and refusing costs SRM nothing because
 * we stop before the password is ever sent.
 */

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

export interface ThrottleVerdict {
  allowed: boolean;
  /** Whole minutes until the lock lifts, for the message. */
  retryInMinutes?: number;
}

function keysFor(netId: string, clientAddress: string | null): string[] {
  const keys = [`netid:${netId.toLowerCase()}`];
  if (clientAddress) keys.push(`ip:${clientAddress}`);
  return keys;
}

/** Check before sending anything upstream. */
export async function checkSignInAllowed(
  netId: string,
  clientAddress: string | null
): Promise<ThrottleVerdict> {
  const now = new Date();

  const rows = await prisma.signInAttempt.findMany({
    where: { key: { in: keysFor(netId, clientAddress) } },
  });

  const locked = rows
    .filter((row) => row.lockedUntil && row.lockedUntil > now)
    .sort((a, b) => b.lockedUntil!.getTime() - a.lockedUntil!.getTime())[0];

  if (!locked) return { allowed: true };

  return {
    allowed: false,
    retryInMinutes: Math.max(
      1,
      Math.ceil((locked.lockedUntil!.getTime() - now.getTime()) / 60_000)
    ),
  };
}

/**
 * Record a rejected password.
 *
 * Only genuine credential rejections count. An upstream outage or a session-cap
 * message isn't evidence of guessing, and locking someone out because SRM was
 * down would be our bug wearing a security costume.
 */
export async function recordSignInFailure(
  netId: string,
  clientAddress: string | null
): Promise<void> {
  const now = new Date();
  const windowOpenedAfter = new Date(now.getTime() - WINDOW_MINUTES * 60_000);

  for (const key of keysFor(netId, clientAddress)) {
    const existing = await prisma.signInAttempt.findUnique({ where: { key } });

    // A window that has aged out starts again at one, so a failure last month
    // doesn't combine with one today.
    const continuing = existing && existing.windowStart > windowOpenedAfter;
    const count = continuing ? existing.count + 1 : 1;

    const data = {
      count,
      windowStart: continuing ? existing.windowStart : now,
      lockedUntil: count >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
    };

    await prisma.signInAttempt.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
  }
}

/** A correct password clears the slate for both keys. */
export async function clearSignInFailures(
  netId: string,
  clientAddress: string | null
): Promise<void> {
  await prisma.signInAttempt.deleteMany({
    where: { key: { in: keysFor(netId, clientAddress) } },
  });
}
