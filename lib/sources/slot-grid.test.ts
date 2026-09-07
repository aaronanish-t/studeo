import { describe, expect, it } from "vitest";

import { findGaps, formatMinutes, type Person } from "../freehour";
import {
  buildTimetable,
  DAY_END_MIN,
  DAY_START_MIN,
  expandCourseSlot,
  HOUR_TIMES,
  knownSlots,
  placementsForSlot,
  UNIFIED_GRID,
} from "./slot-grid";

/**
 * A real course list, captured from Academia on 7 Sep 2026 (B.Tech CSE-AIML,
 * semester 3). Two courses appear twice — once for their theory slot and once
 * for their lab — which is how Academia actually presents lab-based courses.
 */
const REAL_COURSES = [
  { courseCode: "21MAB201T", slot: "A", room: "TP 506" },
  { courseCode: "21CSC201J", slot: "B", room: "TP 506" },
  { courseCode: "21CSS201T", slot: "C", room: "TP 506" },
  { courseCode: "21CSC203P", slot: "D", room: "TP 506" },
  { courseCode: "21CSC202J", slot: "F", room: "TP 506" },
  { courseCode: "21LEM202T", slot: "L11-L12-", room: "UB 801" },
  { courseCode: "21LEM201T", slot: "P47-", room: "online" },
  { courseCode: "21CSC201J", slot: "P9-P10-", room: "CLS 403" },
  { courseCode: "21CSC202J", slot: "P33-P34-", room: "UB 713B" },
];

describe("the grid itself", () => {
  it("covers five day orders of twelve hours", () => {
    expect(UNIFIED_GRID).toHaveLength(5);
    for (const row of UNIFIED_GRID) expect(row).toHaveLength(12);
    expect(HOUR_TIMES).toHaveLength(12);
  });

  it("runs 08:00 to 18:10", () => {
    expect(formatMinutes(DAY_START_MIN)).toBe("08:00");
    expect(formatMinutes(DAY_END_MIN)).toBe("18:10");
  });

  it("places the afternoon in the afternoon", () => {
    // The portal prints hour 7 as "01:25 - 02:15" with no meridiem. If that
    // string were parsed literally the class would land at 1:25 in the morning.
    expect(formatMinutes(HOUR_TIMES[6].startMin)).toBe("13:25");
    expect(formatMinutes(HOUR_TIMES[11].endMin)).toBe("18:10");
  });

  it("never lets an hour start before the previous one ends", () => {
    for (let i = 1; i < HOUR_TIMES.length; i++) {
      expect(HOUR_TIMES[i].startMin).toBeGreaterThanOrEqual(HOUR_TIMES[i - 1].endMin);
    }
  });
});

describe("expandCourseSlot", () => {
  it("splits the trailing-hyphen format Academia uses", () => {
    expect(expandCourseSlot("P9-P10-")).toEqual(["P9", "P10"]);
    expect(expandCourseSlot("L11-L12-")).toEqual(["L11", "L12"]);
  });

  it("passes a single slot through", () => {
    expect(expandCourseSlot("A")).toEqual(["A"]);
  });

  it("handles absent slots", () => {
    expect(expandCourseSlot(null)).toEqual([]);
    expect(expandCourseSlot("")).toEqual([]);
  });
});

describe("placementsForSlot", () => {
  it("finds every occurrence of a theory slot across the week", () => {
    // Slot A: Day 1 hours 1 and 2, Day 2 hour 10, Day 3 hour 3.
    const a = placementsForSlot("A").map((p) => `${p.dayOrder}/${p.hour}`);
    expect(a).toEqual(["1/1", "1/2", "2/10", "3/3"]);
  });

  it("reads both slots out of a shared cell", () => {
    // Day 1 hour 2 prints as "A / X" — it belongs to A and to X.
    const x = placementsForSlot("X");
    expect(x.length).toBeGreaterThan(0);
    expect(x.some((p) => p.dayOrder === 1 && p.hour === 2)).toBe(true);
  });

  it("handles a two-hour lab block", () => {
    expect(placementsForSlot("P9")).toEqual([
      expect.objectContaining({ dayOrder: 1, hour: 9 }),
    ]);
    expect(placementsForSlot("P10")).toEqual([
      expect.objectContaining({ dayOrder: 1, hour: 10 }),
    ]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(placementsForSlot(" a ")).toEqual(placementsForSlot("A"));
  });

  it("returns nothing for a slot that isn't on the grid", () => {
    expect(placementsForSlot("Z99")).toEqual([]);
  });

  it("knows the full slot vocabulary", () => {
    const slots = knownSlots();
    expect(slots).toContain("A");
    expect(slots).toContain("G");
    expect(slots).toContain("P47");
    expect(slots).toContain("L52");
  });
});

describe("buildTimetable with a real course list", () => {
  const timetable = buildTimetable(REAL_COURSES);

  it("places every course somewhere", () => {
    const codes = new Set(timetable.map((e) => e.courseCode));
    expect(codes).toEqual(
      new Set([
        "21MAB201T",
        "21CSC201J",
        "21CSS201T",
        "21CSC203P",
        "21CSC202J",
        "21LEM202T",
        "21LEM201T",
      ])
    );
  });

  it("puts the lab in the lab room and the theory in the lecture room", () => {
    const dsa = timetable.filter((e) => e.courseCode === "21CSC201J");
    const lab = dsa.filter((e) => e.room === "CLS 403");
    const theory = dsa.filter((e) => e.room === "TP 506");

    expect(lab).toHaveLength(2); // P9, P10 — a double period on Day 1
    expect(lab.every((e) => e.dayOrder === 1)).toBe(true);
    expect(theory.length).toBeGreaterThan(0);
  });

  it("returns entries in chronological order within each day", () => {
    for (let i = 1; i < timetable.length; i++) {
      const previous = timetable[i - 1];
      const current = timetable[i];
      if (previous.dayOrder !== current.dayOrder) continue;
      expect(current.startMin).toBeGreaterThanOrEqual(previous.startMin);
    }
  });

  it("never books one course into the same moment twice", () => {
    const keys = timetable.map((e) => `${e.dayOrder}:${e.startMin}:${e.courseCode}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("grid feeding the free-hour finder", () => {
  it("finds this student's real gaps on Day 1", () => {
    // Day 1 from the live grid and the live course list:
    //   h1 A     08:00  Maths
    //   h2 A/X   08:50  Maths
    //   h3 F/X   09:45  OS
    //   h4 F     10:40  OS
    //   h9  P9   15:10  DSA lab
    //   h10 P10  16:00  DSA lab
    //   h11 L11  16:50  UHV
    //   h12 L12  17:30  UHV
    // Leaving 11:30 -> 15:10 free in the middle of the day.
    const day1 = buildTimetable(REAL_COURSES).filter((e) => e.dayOrder === 1);

    const student: Person = {
      id: "aaron",
      name: "Aaron",
      busy: day1.map((e) => ({ startMin: e.startMin, endMin: e.endMin })),
    };

    const gaps = findGaps([student], {
      dayStartMin: DAY_START_MIN,
      dayEndMin: DAY_END_MIN,
      minDurationMin: 30,
    });

    expect(gaps).toHaveLength(1);
    expect(formatMinutes(gaps[0].startMin)).toBe("11:30");
    expect(formatMinutes(gaps[0].endMin)).toBe("15:10");
    expect(gaps[0].durationMin).toBe(220);
  });

  it("counts a double-period lab as one blocker, not two", () => {
    // P9 and P10 are consecutive hours of the same lab. The sweep must merge
    // them into one busy block for this student.
    const labOnly = buildTimetable([
      { courseCode: "21CSC201J", slot: "P9-P10-", room: "CLS 403" },
    ]);

    const gaps = findGaps(
      [
        {
          id: "aaron",
          name: "Aaron",
          busy: labOnly.map((e) => ({ startMin: e.startMin, endMin: e.endMin })),
        },
      ],
      { dayStartMin: 15 * 60, dayEndMin: 17 * 60, minDurationMin: 10 }
    );

    // The lab runs 15:10-16:50 as ONE solid block. The interesting boundary is
    // 16:00, where P9 hands over to P10 — a sweep that failed to merge the two
    // would emit a zero-width gap there, or worse, count Aaron twice.
    expect(gaps.some((gap) => gap.startMin === 16 * 60)).toBe(false);
    expect(
      gaps.every((gap) => gap.endMin <= 15 * 60 + 10 || gap.startMin >= 16 * 60 + 50)
    ).toBe(true);
  });
});
