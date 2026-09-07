import { describe, expect, it } from "vitest";

import { percentageOf, statusOf } from "../attendance";
import {
  ATTENDANCE_PAGE_HTML,
  CALENDAR_HTML,
  MARKS_DETAIL_HTML,
  MARKS_SUMMARY_HTML,
} from "./fixtures/student-portal";
import {
  parseAttendance,
  parseCalendar,
  parseMarkPair,
  parseMarksDetail,
  parseMarksSummary,
  parsePortalDate,
  PortalParseError,
} from "./student-portal";

describe("parsePortalDate", () => {
  it("reads the calendar's DD-MM-YYYY", () => {
    expect(parsePortalDate("21-07-2026")).toBe("2026-07-21");
  });

  it("reads the marks page's DD/Mon/YYYY", () => {
    expect(parsePortalDate("31/Aug/2026")).toBe("2026-08-31");
  });

  it("is not fooled into reading 07-09 as September 7th", () => {
    // Day-first, not month-first. Getting this backwards silently shifts the
    // entire academic calendar and every day-order lookup with it.
    expect(parsePortalDate("07-09-2026")).toBe("2026-09-07");
  });

  it("returns null for blanks and dashes", () => {
    expect(parsePortalDate("-")).toBeNull();
    expect(parsePortalDate("")).toBeNull();
    expect(parsePortalDate(undefined)).toBeNull();
  });
});

describe("parseMarkPair", () => {
  it("splits obtained from maximum", () => {
    expect(parseMarkPair("4.20 / 5.00")).toEqual({ obtained: 4.2, maxMark: 5 });
  });

  it("survives a missing half", () => {
    expect(parseMarkPair("- / 5.00")).toEqual({ obtained: null, maxMark: 5 });
  });
});

describe("parseAttendance", () => {
  const result = parseAttendance(ATTENDANCE_PAGE_HTML);

  it("reads every course row", () => {
    expect(result.courses).toHaveLength(7);
    expect(result.courses.map((c) => c.courseCode)).toEqual([
      "21CSC201J",
      "21CSC202J",
      "21CSC203P",
      "21CSS201T",
      "21LEM201T",
      "21LEM202T",
      "21MAB201T",
    ]);
  });

  it("reads hours and percentage exactly", () => {
    expect(result.courses[0]).toEqual({
      courseCode: "21CSC201J",
      title: "DATA STRUCTURES AND ALGORITHMS",
      totalHours: 32,
      attendedHours: 26,
      absentHours: 6,
      percentage: 81.25,
    });
  });

  it("keeps long wrapped titles intact", () => {
    expect(result.courses[5].title).toBe(
      "UNIVERSAL HUMAN VALUES - II: UNDERSTANDING HARMONY AND ETHICAL HUMAN CONDUCT"
    );
  });

  it("reads the reporting period", () => {
    expect(result.periodFrom).toBe("2026-07-21");
    expect(result.periodTo).toBe("2026-09-03");
  });

  it("reads the monthly rollup without confusing it for course data", () => {
    // Both tables are `table mb-0` with identical structure — the reason we
    // select on header text rather than index.
    expect(result.monthly).toEqual([
      { month: "Jul-2026", present: 39, absent: 9 },
      { month: "Aug-2026", present: 62, absent: 20 },
      { month: "Sep-2026", present: 12, absent: 2 },
    ]);
  });

  it("agrees with the portal's own percentages", () => {
    // If our arithmetic ever drifts from SRM's, this catches it against real
    // published figures rather than our assumptions about them.
    for (const course of result.courses) {
      expect(percentageOf(course)).toBeCloseTo(course.percentage, 1);
    }
  });

  it("identifies exactly the two courses that are below the line", () => {
    const under = result.courses.filter((c) => statusOf(c) === "under");
    expect(under.map((c) => c.courseCode)).toEqual(["21CSC203P", "21CSS201T"]);
  });

  it("throws a useful error when the markup changes", () => {
    expect(() => parseAttendance("<div>Session expired</div>")).toThrow(PortalParseError);
    expect(() => parseAttendance("<div>Session expired</div>")).toThrow(/markup has probably changed/);
  });

  it("tolerates a page with no monthly table yet", () => {
    const early = ATTENDANCE_PAGE_HTML.replace(/Cumulative[\s\S]*$/, "</div>");
    const parsed = parseAttendance(early);
    expect(parsed.courses.length).toBeGreaterThan(0);
    expect(parsed.monthly).toEqual([]);
  });
});

describe("parseMarksSummary", () => {
  const marks = parseMarksSummary(MARKS_SUMMARY_HTML);

  it("reads the graded courses", () => {
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({
      courseCode: "21CSS201T",
      obtained: 4.2,
      maxMark: 5,
    });
  });

  it("extracts the internal id from the expander's onclick", () => {
    // Without this id there is no way to request the component breakdown, and
    // it appears nowhere else in the markup.
    expect(marks.map((m) => m.internalId)).toEqual(["39137", "39210"]);
  });
});

describe("parseMarksDetail", () => {
  it("reads the per-component breakdown", () => {
    expect(parseMarksDetail(MARKS_DETAIL_HTML)).toEqual([
      { enteredOn: "2026-08-31", component: "FT-I", obtained: 4.2, maxMark: 5 },
    ]);
  });
});

describe("parseCalendar", () => {
  const days = parseCalendar(CALENDAR_HTML);

  it("reads every dated row", () => {
    expect(days).toHaveLength(7);
  });

  it("assigns day orders to working days", () => {
    expect(days[0]).toEqual({
      date: "2026-07-21",
      weekday: "Tuesday",
      isHoliday: false,
      dayOrder: 1,
      week: 1,
      remark: null,
    });
  });

  it("leaves holidays without a day order and keeps the reason", () => {
    const holiday = days.find((d) => d.date === "2026-08-26");
    expect(holiday).toMatchObject({
      isHoliday: true,
      dayOrder: null,
      remark: "Milad-un-nabi",
    });
  });

  it("confirms holidays pause the cycle rather than advancing it", () => {
    // 24 Aug suspended, 25 Aug is Day 5 — the order picks up where it stopped
    // instead of skipping ahead. This is the single assumption the whole
    // timetable rests on, so it is asserted against real portal data.
    const suspended = days.find((d) => d.date === "2026-08-24");
    const next = days.find((d) => d.date === "2026-08-25");

    expect(suspended?.dayOrder).toBeNull();
    expect(suspended?.remark).toBe("Classes Suspended");
    expect(next?.dayOrder).toBe(5);
  });

  it("normalises the dash weekend remark", () => {
    expect(days.find((d) => d.date === "2026-07-25")).toMatchObject({
      isHoliday: true,
      remark: "Saturday",
    });
  });
});
