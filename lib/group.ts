import { prisma } from "./db";
import { findGaps, mergeIntervals, type Gap, type Interval } from "./freehour";
import { DAY_START_MIN, TIMELINE_END_MIN } from "./sources/slot-grid";

/**
 * The group free-hour view.
 *
 * This is the feature the official portal structurally cannot have: it knows
 * five separate timetables and will never intersect them. See lib/freehour.ts
 * for the sweep itself — this module is only about getting the right people's
 * days out of the database and asking the right question of them.
 *
 * Privacy rule: a friendship must be ACCEPTED, and it is symmetric. Nobody's
 * schedule is readable on the strength of a pending request.
 */

export interface GroupMember {
  id: string;
  name: string;
  netId: string;
  /** Merged so a double-period lab is one block, not two. */
  busy: Interval[];
  /** Whole-day blocks, for the strip visualisation. */
  classes: Array<{ startMin: number; endMin: number; label: string; room: string | null }>;
}

export interface GroupDay {
  dayOrder: number;
  members: GroupMember[];
  /** Windows where every single member is free. */
  common: Gap[];
  /** Windows where all but one are free — usually the more useful answer. */
  nearMisses: Gap[];
  window: { startMin: number; endMin: number };
}

export async function getGroupDay(
  netId: string,
  dayOrder: number
): Promise<GroupDay | null> {
  const me = await prisma.user.findUnique({ where: { netId } });
  if (!me) return null;

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: me.id }, { addresseeId: me.id }],
    },
    select: { requesterId: true, addresseeId: true },
  });

  // A friendship row is stored once but read from both sides.
  const friendIds = friendships.map((f) =>
    f.requesterId === me.id ? f.addresseeId : f.requesterId
  );

  const people = await prisma.user.findMany({
    where: { id: { in: [me.id, ...friendIds] } },
    select: {
      id: true,
      name: true,
      netId: true,
      timetable: {
        where: { dayOrder },
        orderBy: { startMin: "asc" },
        select: {
          startMin: true,
          endMin: true,
          room: true,
          slotCode: true,
          course: { select: { title: true, code: true } },
        },
      },
    },
  });

  // Keep the signed-in student first; everyone else alphabetically. Reading
  // your own row at the top makes the comparison legible.
  const ordered = [
    ...people.filter((p) => p.id === me.id),
    ...people.filter((p) => p.id !== me.id).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  const members: GroupMember[] = ordered.map((person) => ({
    id: person.id,
    name: person.name,
    netId: person.netId,
    busy: mergeIntervals(
      person.timetable.map((slot) => ({ startMin: slot.startMin, endMin: slot.endMin }))
    ),
    classes: person.timetable.map((slot) => ({
      startMin: slot.startMin,
      endMin: slot.endMin,
      label: slot.course?.title ?? `Slot ${slot.slotCode}`,
      room: slot.room,
    })),
  }));

  // Stop at 4:50 unless somebody in the group is actually still in class after
  // it. Trimming dead track is worth doing; hiding a real class to do it is not
  // — slots L11 and L12 run to 6:10 and are genuinely timetabled.
  const latestClassEnd = members.reduce(
    (latest, member) =>
      member.busy.reduce((inner, block) => Math.max(inner, block.endMin), latest),
    0
  );

  const options = {
    dayStartMin: DAY_START_MIN,
    dayEndMin: Math.max(TIMELINE_END_MIN, latestClassEnd),
    minDurationMin: 30,
  };

  const common = findGaps(members, { ...options, maxBlockers: 0 });

  // Anything blocked by exactly one person. With five people a perfect overlap
  // is rare, so without this the feature would usually answer "nothing" — which
  // is true and useless.
  const nearMisses = findGaps(members, { ...options, maxBlockers: 1 }).filter(
    (gap) => gap.blockedBy.length === 1
  );

  return {
    dayOrder,
    members,
    common,
    nearMisses,
    window: { startMin: options.dayStartMin, endMin: options.dayEndMin },
  };
}
