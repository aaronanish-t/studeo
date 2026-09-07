/**
 * The SRM unified slot grid.
 *
 * Captured from Academia's "Unified Time Table 2025-Batch 1" page on
 * 7 Sep 2026. This is institutional data, not per-student data: every student
 * on a batch shares it, and it changes about once a year. Their personal
 * timetable is just their course list joined against this grid by slot code.
 *
 * That join is the whole trick. Academia tells you "21CSC201J is in slot B",
 * and this table tells you slot B is Day 2 hours 6-7, Day 3 hour 5 and Day 4
 * hour 8. Without the grid a course slot is an opaque letter; with it you have
 * a clock, which is what the free-hour finder needs.
 *
 * -------------------------------------------------------------------------
 * Two things the portal's own rendering gets away with and we can't:
 *
 * 1. Times print in 12-hour form with NO meridiem — "12:30 - 01:20",
 *    "05:30 - 06:10". Parsed naively, half the teaching day lands after
 *    midnight. We store 24-hour minute offsets directly rather than parsing
 *    the displayed strings.
 *
 * 2. A cell can hold two slots — "A / X", "P12/X". X is the alternate-slot
 *    marker, so hour 2 on Day 1 belongs to BOTH slot A and slot X.
 * -------------------------------------------------------------------------
 */

/** Teaching hours 1-12, as minutes from midnight. */
export const HOUR_TIMES: ReadonlyArray<{ hour: number; startMin: number; endMin: number }> = [
  { hour: 1, startMin: 8 * 60, endMin: 8 * 60 + 50 }, // 08:00 - 08:50
  { hour: 2, startMin: 8 * 60 + 50, endMin: 9 * 60 + 40 }, // 08:50 - 09:40
  { hour: 3, startMin: 9 * 60 + 45, endMin: 10 * 60 + 35 }, // 09:45 - 10:35
  { hour: 4, startMin: 10 * 60 + 40, endMin: 11 * 60 + 30 }, // 10:40 - 11:30
  { hour: 5, startMin: 11 * 60 + 35, endMin: 12 * 60 + 25 }, // 11:35 - 12:25
  { hour: 6, startMin: 12 * 60 + 30, endMin: 13 * 60 + 20 }, // 12:30 - 13:20
  { hour: 7, startMin: 13 * 60 + 25, endMin: 14 * 60 + 15 }, // 13:25 - 14:15
  { hour: 8, startMin: 14 * 60 + 20, endMin: 15 * 60 + 10 }, // 14:20 - 15:10
  { hour: 9, startMin: 15 * 60 + 10, endMin: 16 * 60 }, // 15:10 - 16:00
  { hour: 10, startMin: 16 * 60, endMin: 16 * 60 + 50 }, // 16:00 - 16:50
  { hour: 11, startMin: 16 * 60 + 50, endMin: 17 * 60 + 30 }, // 16:50 - 17:30
  { hour: 12, startMin: 17 * 60 + 30, endMin: 18 * 60 + 10 }, // 17:30 - 18:10
];

export const DAY_START_MIN = HOUR_TIMES[0].startMin;

/**
 * The true end of the teaching day, 6:10 pm. This is the institutional fact —
 * period 12 exists and courses are scheduled in it.
 */
export const DAY_END_MIN = HOUR_TIMES[HOUR_TIMES.length - 1].endMin;

/**
 * Where a timeline VIEW stops by default, 4:50 pm (the end of period 10).
 *
 * Distinct from DAY_END_MIN on purpose. Periods 11 and 12 are empty for most
 * students most days, and drawing to 6:10 regardless leaves a stretch of dead
 * track that squeezes the part of the day anything actually happens in.
 *
 * A view must extend past this whenever a real class runs later — slots L11 and
 * L12 cover 4:50–6:10 and are genuinely timetabled — so this is a floor for the
 * axis, never a clip. See getGroupDay.
 */
export const TIMELINE_END_MIN = 16 * 60 + 50;

/**
 * The grid exactly as the portal prints it — rows are Day 1-5, columns are
 * hours 1-12. Kept verbatim so it can be checked against the page by eye;
 * the index below is derived, never hand-maintained.
 */
export const UNIFIED_GRID: ReadonlyArray<ReadonlyArray<string>> = [
  ["A", "A / X", "F / X", "F", "G", "P6", "P7", "P8", "P9", "P10", "L11", "L12"],
  ["P11", "P12/X", "P13/X", "P14", "P15", "B", "B", "G", "G", "A", "L21", "L22"],
  ["C", "C / X", "A / X", "D", "B", "P26", "P27", "P28", "P29", "P30", "L31", "L32"],
  ["P31", "P32/X", "P33/X", "P34", "P35", "D", "D", "B", "E", "C", "L41", "L42"],
  ["E", "E / X", "C / X", "F", "D", "P46", "P47", "P48", "P49", "P50", "L51", "L52"],
];

export interface SlotPlacement {
  slot: string;
  dayOrder: number; // 1-5
  hour: number; // 1-12
  startMin: number;
  endMin: number;
}

/** "A / X" -> ["A","X"]; "P12/X" -> ["P12","X"]; "" -> [] */
function cellSlots(cell: string): string[] {
  return cell
    .split("/")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Course slots arrive hyphen-joined with a trailing hyphen: "P9-P10-",
 * "L11-L12-", "A". Split into the individual codes.
 */
export function expandCourseSlot(slot: string | null | undefined): string[] {
  return (slot ?? "")
    .split("-")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

const INDEX: ReadonlyMap<string, SlotPlacement[]> = (() => {
  const index = new Map<string, SlotPlacement[]>();

  UNIFIED_GRID.forEach((row, rowIndex) => {
    const dayOrder = rowIndex + 1;

    row.forEach((cell, columnIndex) => {
      const time = HOUR_TIMES[columnIndex];
      if (!time) return;

      for (const slot of cellSlots(cell)) {
        const placement: SlotPlacement = {
          slot,
          dayOrder,
          hour: time.hour,
          startMin: time.startMin,
          endMin: time.endMin,
        };

        const existing = index.get(slot);
        if (existing) existing.push(placement);
        else index.set(slot, [placement]);
      }
    });
  });

  return index;
})();

/** Every (day, hour) this slot occupies across the week. */
export function placementsForSlot(slot: string): SlotPlacement[] {
  return INDEX.get(slot.trim().toUpperCase()) ?? [];
}

export function knownSlots(): string[] {
  return [...INDEX.keys()].sort();
}

export interface CourseSlotInput {
  courseCode: string;
  /** As printed by Academia: "A", "P9-P10-", "L11-L12-". */
  slot: string | null | undefined;
  room?: string | null;
}

export interface TimetableEntry extends SlotPlacement {
  courseCode: string;
  room: string | null;
}

/**
 * Join a student's courses against the grid to produce their week.
 *
 * Sorted by day then start time, and de-duplicated: a course whose slot string
 * lists two codes that land on the same hour (or a course listed twice for
 * theory and lab under overlapping slots) must not produce two entries for one
 * moment, or the free-hour sweep counts a single student as two blockers.
 */
export function buildTimetable(courses: CourseSlotInput[]): TimetableEntry[] {
  const seen = new Set<string>();
  const entries: TimetableEntry[] = [];

  for (const course of courses) {
    for (const code of expandCourseSlot(course.slot)) {
      for (const placement of placementsForSlot(code)) {
        const key = `${placement.dayOrder}:${placement.startMin}:${course.courseCode}`;
        if (seen.has(key)) continue;
        seen.add(key);

        entries.push({
          ...placement,
          courseCode: course.courseCode,
          room: course.room ?? null,
        });
      }
    }
  }

  return entries.sort(
    (a, b) => a.dayOrder - b.dayOrder || a.startMin - b.startMin || a.courseCode.localeCompare(b.courseCode)
  );
}
