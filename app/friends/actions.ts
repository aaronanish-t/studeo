"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isDatabaseUnreachable, prisma } from "@/lib/db";
import { currentSession } from "@/lib/session";

/**
 * Adding, accepting and removing friends.
 *
 * Every action re-reads the session rather than trusting anything the form
 * sent. A server action is reachable by a direct POST, not only through the
 * page that renders it, so "who is doing this" is never an input.
 */

const NETID_DOMAIN = "srmist.edu.in";

const NetId = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(new RegExp(`@${NETID_DOMAIN}$`), ""))
  .refine((value) => /^[a-z0-9._-]{3,32}$/.test(value), {
    message: "That doesn't look like a NetID — it's the part before @srmist.edu.in.",
  });

export interface FriendActionState {
  status: "idle" | "ok" | "error";
  message?: string;
}

/** Shared wrapper: resolve the signed-in user, and turn outages into sentences. */
async function withMe<T>(
  run: (meId: string) => Promise<T>
): Promise<T | FriendActionState> {
  const session = await currentSession();
  if (!session) return { status: "error", message: "You're signed out. Sign in and try again." };

  const me = await prisma.user.findUnique({
    where: { netId: session.netId },
    select: { id: true },
  }).catch((error: unknown) => {
    if (isDatabaseUnreachable(error)) return null;
    throw error;
  });

  if (!me) {
    return {
      status: "error",
      message: "Studeo can't reach its database right now. Try again in a minute.",
    };
  }

  try {
    return await run(me.id);
  } catch (error) {
    if (isDatabaseUnreachable(error)) {
      return {
        status: "error",
        message: "Studeo can't reach its database right now. Try again in a minute.",
      };
    }
    throw error;
  }
}

export async function sendFriendRequest(
  _previous: FriendActionState,
  formData: FormData
): Promise<FriendActionState> {
  const parsed = NetId.safeParse(formData.get("netId"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }
  const netId = parsed.data;

  const result = await withMe(async (meId): Promise<FriendActionState> => {
    const them = await prisma.user.findUnique({
      where: { netId },
      select: { id: true, name: true, isDemo: true },
    });

    // Sample accounts back the public preview; befriending one would put
    // invented data in a real student's group.
    if (!them || them.isDemo) {
      return {
        status: "error",
        message: `Nobody with the NetID ${netId} is on Studeo yet. They'll need to sign in once first.`,
      };
    }

    if (them.id === meId) {
      return { status: "error", message: "That's you. You're already in your own group." };
    }

    // The unique index is on (requester, addressee), so the reverse direction
    // is a different row — both have to be checked by hand.
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: meId, addresseeId: them.id },
          { requesterId: them.id, addresseeId: meId },
        ],
      },
    });

    if (existing?.status === "ACCEPTED") {
      return { status: "error", message: `You and ${them.name} are already friends.` };
    }

    if (existing?.status === "BLOCKED") {
      // Deliberately the same wording as "no such account". Confirming a block
      // exists tells the blocked person something they shouldn't learn.
      return {
        status: "error",
        message: `Nobody with the NetID ${netId} is on Studeo yet. They'll need to sign in once first.`,
      };
    }

    if (existing?.status === "PENDING") {
      // They already asked us. Asking back is unambiguously a yes, so treat it
      // as one rather than making both people wait on each other.
      if (existing.addresseeId === meId) {
        await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: "ACCEPTED", respondedAt: new Date() },
        });
        revalidatePath("/friends");
        revalidatePath("/free");
        return { status: "ok", message: `${them.name} had already asked you — you're now friends.` };
      }

      return { status: "error", message: `You've already asked ${them.name}.` };
    }

    await prisma.friendship.create({
      data: { requesterId: meId, addresseeId: them.id, status: "PENDING" },
    });

    revalidatePath("/friends");
    return { status: "ok", message: `Request sent to ${them.name}.` };
  });

  return result as FriendActionState;
}

/** Accept or decline a request addressed to the signed-in student. */
export async function respondToRequest(
  _previous: FriendActionState,
  formData: FormData
): Promise<FriendActionState> {
  const id = String(formData.get("id") ?? "");
  const accept = formData.get("decision") === "accept";

  const result = await withMe(async (meId): Promise<FriendActionState> => {
    // Scoped to rows addressed to ME: without that, anyone could accept any
    // request by guessing an id.
    const row = await prisma.friendship.findFirst({
      where: { id, addresseeId: meId, status: "PENDING" },
      include: { requester: { select: { name: true } } },
    });

    if (!row) return { status: "error", message: "That request is no longer waiting." };

    if (accept) {
      await prisma.friendship.update({
        where: { id: row.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
    } else {
      // Deleted rather than marked, so they can ask again later. A decline is
      // "not now", and a row that blocks a future request would make it final.
      await prisma.friendship.delete({ where: { id: row.id } });
    }

    revalidatePath("/friends");
    revalidatePath("/free");

    return {
      status: "ok",
      message: accept
        ? `You and ${row.requester.name} are now friends.`
        : "Request declined.",
    };
  });

  return result as FriendActionState;
}

/** Remove a friend, or withdraw a request you sent. */
export async function removeFriend(
  _previous: FriendActionState,
  formData: FormData
): Promise<FriendActionState> {
  const id = String(formData.get("id") ?? "");

  const result = await withMe(async (meId): Promise<FriendActionState> => {
    // Either end may remove — but only an end. Scoping by both columns is what
    // stops a guessed id deleting somebody else's friendship.
    const { count } = await prisma.friendship.deleteMany({
      where: { id, OR: [{ requesterId: meId }, { addresseeId: meId }] },
    });

    if (count === 0) return { status: "error", message: "That friendship is already gone." };

    revalidatePath("/friends");
    revalidatePath("/free");
    return { status: "ok", message: "Removed." };
  });

  return result as FriendActionState;
}
