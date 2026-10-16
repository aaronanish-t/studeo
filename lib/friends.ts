import { prisma } from "./db";

/**
 * Friendships — who may see whose timetable.
 *
 * The free-hour finder is the one thing the official portal structurally
 * cannot do, and it is worth nothing until a student can actually name the
 * people they want to compare days with. This module is that list.
 *
 * Two rules shape everything here.
 *
 * A friendship is **symmetric but stored once**: the row records who asked and
 * who was asked, and every read has to look at both columns. Storing two rows
 * would double every write and invite them to disagree.
 *
 * And it is only real once **accepted**. A pending request grants nothing —
 * not a name, not a timetable, not a free hour. That is what makes it safe for
 * the ingest route to admit it can't fully prove identity: impersonating
 * someone gets you an account, never anyone else's day.
 */

export interface FriendSummary {
  id: string;
  name: string;
  netId: string;
  /** Null until they've synced; the list says so rather than showing 0%. */
  attendanceOverall: number | null;
  /** How many day-orders we hold a timetable for — 0 means they can't be compared yet. */
  timetabledDays: number;
}

export interface PendingRequest {
  id: string;
  name: string;
  netId: string;
  sentAt: Date;
}

export interface FriendsData {
  friends: FriendSummary[];
  /** Requests waiting on this student to answer. */
  incoming: PendingRequest[];
  /** Requests this student sent that haven't been answered. */
  outgoing: PendingRequest[];
}

function summarise(user: {
  id: string;
  name: string;
  netId: string;
  attendanceOverall: number | null;
  timetable: Array<{ dayOrder: number }>;
}): FriendSummary {
  return {
    id: user.id,
    name: user.name,
    netId: user.netId,
    attendanceOverall: user.attendanceOverall,
    timetabledDays: new Set(user.timetable.map((slot) => slot.dayOrder)).size,
  };
}

export async function getFriendsData(netId: string): Promise<FriendsData | null> {
  const me = await prisma.user.findUnique({ where: { netId }, select: { id: true } });
  if (!me) return null;

  const rows = await prisma.friendship.findMany({
    where: {
      status: { in: ["PENDING", "ACCEPTED"] },
      OR: [{ requesterId: me.id }, { addresseeId: me.id }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      requester: {
        select: {
          id: true,
          name: true,
          netId: true,
          attendanceOverall: true,
          timetable: { select: { dayOrder: true } },
        },
      },
      addressee: {
        select: {
          id: true,
          name: true,
          netId: true,
          attendanceOverall: true,
          timetable: { select: { dayOrder: true } },
        },
      },
    },
  });

  const friends: FriendSummary[] = [];
  const incoming: PendingRequest[] = [];
  const outgoing: PendingRequest[] = [];

  for (const row of rows) {
    // The row is stored once; which end is "them" depends on who asked.
    const iAsked = row.requesterId === me.id;
    const them = iAsked ? row.addressee : row.requester;

    if (row.status === "ACCEPTED") {
      friends.push(summarise(them));
      continue;
    }

    const pending = {
      id: row.id,
      name: them.name,
      netId: them.netId,
      sentAt: row.createdAt,
    };

    if (iAsked) outgoing.push(pending);
    else incoming.push(pending);
  }

  friends.sort((a, b) => a.name.localeCompare(b.name));

  return { friends, incoming, outgoing };
}
