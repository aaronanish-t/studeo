import { describe, expect, it } from "vitest";

import { daysUntil, nextTeachingHoliday, type CalendarDay } from "./calendar-rules";

/** Midnight UTC, matching AcademicDay.date. */
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function day(iso: string, options: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date: at(iso),
    dayOrder: null,
    label: null,
    isHoliday: false,
    isOutsideTerm: false,
    ...options,
  };
}

describe("nextTeachingHoliday", () => {
  // Real dates from the published 2026-27 ODD calendar.
  const term = [
    day("2026-10-16", { dayOrder: 2 }), // Friday, teaching
    day("2026-10-17", { isHoliday: true }), // Saturday — the weekend
    day("2026-10-18", { isHoliday: true }), // Sunday — the weekend
    day("2026-10-19", { isHoliday: true, label: "Ayutha Pooja" }), // Monday
    day("2026-10-20", { isHoliday: true, label: "Vijaya Dasami" }), // Tuesday
  ];

  it("skips the weekend and names the holiday that costs a class", () => {
    // 40 of the term's 47 suspended days are weekends. "Tomorrow is a holiday"
    // on a Friday is true, useless, and hides Monday.
    expect(nextTeachingHoliday(term, at("2026-10-16"))?.label).toBe("Ayutha Pooja");
  });

  it("includes today when today is itself a suspended teaching day", () => {
    expect(nextTeachingHoliday(term, at("2026-10-19"))?.label).toBe("Ayutha Pooja");
  });

  it("moves on once a holiday has passed", () => {
    expect(nextTeachingHoliday(term, at("2026-10-20"))?.label).toBe("Vijaya Dasami");
  });

  it("returns null when only weekends remain", () => {
    const weekendsOnly = term.filter((d) => [0, 6].includes(d.date.getUTCDay()));
    expect(nextTeachingHoliday(weekendsOnly, at("2026-10-16"))).toBeNull();
  });

  it("ignores teaching days, however they are ordered", () => {
    const shuffled = [...term].reverse();
    expect(nextTeachingHoliday(shuffled, at("2026-10-16"))?.label).toBe("Ayutha Pooja");
  });
});

describe("daysUntil", () => {
  it("counts whole days", () => {
    expect(daysUntil(at("2026-10-16"), at("2026-10-19"))).toBe(3);
  });

  it("is zero for the same day and negative for the past", () => {
    expect(daysUntil(at("2026-10-16"), at("2026-10-16"))).toBe(0);
    expect(daysUntil(at("2026-10-19"), at("2026-10-16"))).toBe(-3);
  });

  it("is unaffected by month boundaries", () => {
    expect(daysUntil(at("2026-10-30"), at("2026-11-02"))).toBe(3);
  });
});
