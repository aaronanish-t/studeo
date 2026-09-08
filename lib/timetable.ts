import { prisma } from "./db";
import { isBatchSupported, parseBatch } from "./sources/slot-grid";

/**
 * A student's own day, as an unbroken sequence of periods and gaps.
 *
 * One period per row, deliberately unmerged. A lab in P9 and P10 shows as two
 * rows, not one two-hour block — it reads straight against the timetable a
 * student already knows, where those are two entries, and it keeps the row
 * count equal to the hour count SRM measures attendance in.
 *
 * Gaps between periods ARE collapsed into rows of their own. The empty time is
 * what people open a timetable to find, so it gets stated rather than left as
 * whitespace to infer.
 */

/** Below this, a "gap" is just the walk between rooms, not free time. */
const MEANINGFUL_GAP_MIN = 15;

export interface ClassBlock {
  kind: "class";
  startMin: number;
  endMin: number;
  durationMin: number;
  courseCode: string | null;
  courseTitle: string;
  room: string | null;
  slotCode: string;
}

export interface GapBlock {
  kind: "gap";
  startMin: number;
  endMin: number;
  durationMin: number;
}

export type TimetableBlock = ClassBlock | GapBlock;

export interface TimetableDay {
  dayOrder: number;
  /**
   * False when we don't hold the slot grid for this student's batch.
   *
   * Distinct from "no classes today". An empty day is a fact; an unplaceable
   * batch is us not knowing, and the two must not look the same on screen.
   */
  batchSupported: boolean;
  blocks: TimetableBlock[];
  /**
   * Teaching periods. One row each, and the number a student says out loud —
   * "I have 8 classes on Day 1" — because SRM schedules, and measures
   * attendance, in hours.
   */
  classCount: number;
  /** Wall-clock minutes actually spent in class. */
  teachingMin: number;
  firstStartMin: number | null;
  lastEndMin: number | null;
}

export async function getTimetableDay(
  netId: string,
  dayOrder: number
): Promise<TimetableDay | null> {
  const user = await prisma.user.findUnique({
    where: { netId },
    select: { id: true, batch: true },
  });
  if (!user) return null;

  const batchSupported = isBatchSupported(
    parseBatch(user.batch === null ? null : String(user.batch))
  );

  const slots = await prisma.timetableSlot.findMany({
    where: { userId: user.id, dayOrder },
    orderBy: { startMin: "asc" },
    select: {
      startMin: true,
      endMin: true,
      room: true,
      slotCode: true,
      course: { select: { code: true, title: true } },
    },
  });

  // One row per period, in order. No merging — see the note at the top.
  const classes: ClassBlock[] = slots.map((slot) => ({
    kind: "class",
    startMin: slot.startMin,
    endMin: slot.endMin,
    durationMin: slot.endMin - slot.startMin,
    courseCode: slot.course?.code ?? null,
    courseTitle: slot.course?.title ?? `Slot ${slot.slotCode}`,
    room: slot.room,
    slotCode: slot.slotCode,
  }));

  // --- interleave the gaps -------------------------------------------------
  // Only between the first and last class. Time before the day starts and after
  // it ends isn't a gap in your timetable, it's just not being at college.
  const blocks: TimetableBlock[] = [];

  classes.forEach((block, index) => {
    const previous = classes[index - 1];

    if (previous) {
      const gap = block.startMin - previous.endMin;
      if (gap >= MEANINGFUL_GAP_MIN) {
        blocks.push({
          kind: "gap",
          startMin: previous.endMin,
          endMin: block.startMin,
          durationMin: gap,
        });
      }
    }

    blocks.push(block);
  });

  return {
    dayOrder,
    batchSupported,
    blocks,
    classCount: classes.length,
    teachingMin: classes.reduce((sum, block) => sum + block.durationMin, 0),
    firstStartMin: classes[0]?.startMin ?? null,
    lastEndMin: classes[classes.length - 1]?.endMin ?? null,
  };
}
