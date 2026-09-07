import { prisma } from "./db";

/** India is UTC+5:30 year-round — no daylight saving to complicate this. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The calendar date it currently is *in Chennai*, as midnight UTC so it matches
 * AcademicDay.date (a bare @db.Date).
 *
 * Using the server's own UTC date is wrong for five and a half hours out of
 * every twenty-four: after 18:30 UTC it is already tomorrow on campus, so a
 * student checking in the evening would be shown the previous day's day order —
 * exactly when they're looking up what they have in the morning.
 */
export function istDateOnly(when: Date = new Date()): Date {
  const ist = new Date(when.getTime() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
  );
}

/** Minutes since midnight, in the timezone the campus lives in. */
export function istMinutesNow(when: Date = new Date()): number {
  const ist = new Date(when.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

export interface AcademicToday {
  date: Date;
  /** null on a holiday — the day-order cycle pauses rather than advancing. */
  dayOrder: number | null;
  label: string | null;
  isHoliday: boolean;
}

export async function getAcademicDay(when: Date = new Date()): Promise<AcademicToday> {
  const date = istDateOnly(when);
  const day = await prisma.academicDay.findUnique({ where: { date } });

  return {
    date,
    dayOrder: day?.dayOrder ?? null,
    label: day?.label ?? null,
    isHoliday: day?.isHoliday ?? false,
  };
}
