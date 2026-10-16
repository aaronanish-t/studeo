import {
  type CalendarDay,
  isTeachingWeekday,
  nextTeachingHoliday,
} from "./calendar-rules";
import { prisma } from "./db";
import { istDateOnly } from "./today";

/**
 * The academic calendar.
 *
 * SRM schedules by DAY ORDER, not weekday, and a separate calendar maps each
 * date to one. The subtlety that makes this worth a page of its own: a holiday
 * does not blank a day, it **pauses** the cycle. Day 5 falling on a suspended
 * Monday means Tuesday is still Day 5. So "what do I have on the 24th" is only
 * answerable by looking the date up here first — there is no arithmetic from
 * the weekday that gets you there.
 *
 * The calendar is campus-wide rather than per-student, which is why one
 * student's sync serves everybody and why nothing here is scoped to a user.
 */

export interface CalendarMonth {
  /** Midnight UTC on the first of the month, matching AcademicDay.date. */
  start: Date;
  label: string;
  /** Sunday-first offset, so the grid lines up under its weekday headers. */
  leadingBlanks: number;
  days: CalendarDay[];
}

export interface CalendarData {
  today: Date;
  months: CalendarMonth[];
  /**
   * The next suspended *teaching* day on or after today.
   *
   * Weekends are suspended days too and make up the overwhelming majority of
   * them — 40 of 47 in the published term — so "the next suspended day" is
   * almost always tomorrow or the day after, and announcing that Saturday is
   * coming tells a student nothing they didn't know. Only a holiday that takes
   * a class away is news.
   */
  nextHoliday: CalendarDay | null;
  counts: {
    working: number;
    /** Suspended Mon-Fri: holidays that actually cost a day of teaching. */
    holidays: number;
    /** Suspended Sat/Sun, counted separately so neither number misleads. */
    weekendDays: number;
  };
  /** Null when nothing has been synced — the page says so rather than showing an empty grid. */
  range: { from: Date; to: Date } | null;
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export async function getCalendar(when: Date = new Date()): Promise<CalendarData> {
  const today = istDateOnly(when);

  const rows = await prisma.academicDay.findMany({ orderBy: { date: "asc" } });

  if (rows.length === 0) {
    return {
      today,
      months: [],
      nextHoliday: null,
      counts: { working: 0, holidays: 0, weekendDays: 0 },
      range: null,
    };
  }

  const byTime = new Map(
    rows.map((row) => [
      row.date.getTime(),
      {
        date: row.date,
        dayOrder: row.dayOrder,
        label: row.label,
        isHoliday: row.isHoliday,
        isOutsideTerm: false,
      } satisfies CalendarDay,
    ])
  );

  const from = rows[0].date;
  const to = rows[rows.length - 1].date;

  // Whole months, so each grid is a real month rather than a ragged slice.
  // Dates inside a month but outside the term are marked rather than omitted:
  // a hole in the grid reads as a bug, a greyed cell reads as "not term time".
  const months: CalendarMonth[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  while (cursor <= last) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    const days: CalendarDay[] = [];
    for (let day = 1; day <= dayCount; day++) {
      const date = new Date(Date.UTC(year, month, day));
      days.push(
        byTime.get(date.getTime()) ?? {
          date,
          dayOrder: null,
          label: null,
          isHoliday: false,
          isOutsideTerm: true,
        }
      );
    }

    months.push({
      start: new Date(cursor),
      label: MONTH_LABEL.format(cursor),
      leadingBlanks: new Date(Date.UTC(year, month, 1)).getUTCDay(),
      days,
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const nextHoliday = nextTeachingHoliday([...byTime.values()], today);

  const suspended = rows.filter((row) => row.isHoliday);

  return {
    today,
    months,
    nextHoliday,
    counts: {
      working: rows.length - suspended.length,
      holidays: suspended.filter((row) => isTeachingWeekday(row.date)).length,
      weekendDays: suspended.filter((row) => !isTeachingWeekday(row.date)).length,
    },
    range: { from, to },
  };
}

export { daysUntil, nextTeachingHoliday } from "./calendar-rules";
export type { CalendarDay } from "./calendar-rules";
