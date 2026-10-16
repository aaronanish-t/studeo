/**
 * Calendar rules, with no database behind them.
 *
 * Split from the query for the same reason lib/attendance.ts is split from
 * lib/dashboard.ts: the decisions worth testing shouldn't need a Postgres
 * connection to exercise, and these two encode real decisions rather than
 * plumbing.
 */

export interface CalendarDay {
  date: Date;
  /** null on a holiday, and on any date the published calendar doesn't cover. */
  dayOrder: number | null;
  label: string | null;
  isHoliday: boolean;
  /** Outside the published term — rendered as a gap, not as a holiday. */
  isOutsideTerm: boolean;
}

/**
 * Monday to Friday.
 *
 * SRM does occasionally hold class on a Saturday, and those days carry a day
 * order and are not suspended — so this is only ever used to decide whether a
 * *suspended* day is news, never to decide whether teaching happens.
 */
export function isTeachingWeekday(date: Date): boolean {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/**
 * The next suspended teaching day on or after `today`.
 *
 * Weekends are suspended days too and make up the overwhelming majority of
 * them — 40 of 47 in the published term — so "the next suspended day" is
 * almost always tomorrow, and announcing that Saturday is coming buries the
 * one holiday that actually takes a class away.
 */
export function nextTeachingHoliday(
  days: CalendarDay[],
  today: Date
): CalendarDay | null {
  return (
    days
      .filter(
        (day) =>
          day.isHoliday &&
          isTeachingWeekday(day.date) &&
          day.date.getTime() >= today.getTime()
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null
  );
}

/** Whole days from `from` to `to`, both already midnight UTC. */
export function daysUntil(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
