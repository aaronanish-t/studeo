import { describe, expect, it } from "vitest";
import {
  canMissHours,
  debtAsSessions,
  mustAttendHours,
  percentageOf,
  slackAsSessions,
  statusOf,
  summarise,
  verdictFor,
} from "./attendance";

/**
 * The fixtures below are real rows captured from the SRM Student Portal on
 * 7 Sep 2026, period 21/Jul/2026–03/Sep/2026. Using genuine numbers means the
 * tests fail if the arithmetic drifts from what a student would verify by hand
 * against their own portal.
 */
const LIVE = {
  dsa: { totalHours: 32, attendedHours: 26 }, // 81.25 %
  os: { totalHours: 32, attendedHours: 25 }, // 78.13 %
  app: { totalHours: 21, attendedHours: 15 }, // 71.43 % — under
  coa: { totalHours: 23, attendedHours: 17 }, // 73.91 % — under
  ethics: { totalHours: 6, attendedHours: 5 }, // 83.33 %
  uhv: { totalHours: 4, attendedHours: 4 }, // 100 %
  maths: { totalHours: 26, attendedHours: 21 }, // 80.77 %
};

describe("percentageOf", () => {
  it("matches the portal's own published percentages", () => {
    expect(percentageOf(LIVE.dsa)).toBeCloseTo(81.25, 2);
    expect(percentageOf(LIVE.app)).toBeCloseTo(71.43, 2);
    expect(percentageOf(LIVE.coa)).toBeCloseTo(73.91, 2);
    expect(percentageOf(LIVE.uhv)).toBe(100);
  });

  it("returns zero rather than NaN before any class is held", () => {
    expect(percentageOf({ totalHours: 0, attendedHours: 0 })).toBe(0);
  });
});

describe("canMissHours", () => {
  it("computes slack in hours", () => {
    // 26/32 = 81.25%. Missing 2 more -> 26/34 = 76.5%; missing 3 -> 26/35 = 74.3%.
    expect(canMissHours(LIVE.dsa)).toBe(2);
  });

  it("is zero at exactly the threshold", () => {
    expect(canMissHours({ totalHours: 40, attendedHours: 30 })).toBe(0); // 75.0%
  });

  it("is zero, never negative, when already below", () => {
    expect(canMissHours(LIVE.app)).toBe(0);
    expect(canMissHours(LIVE.coa)).toBe(0);
  });

  it("is zero before any class is held", () => {
    expect(canMissHours({ totalHours: 0, attendedHours: 0 })).toBe(0);
  });

  it("respects a custom threshold", () => {
    expect(canMissHours(LIVE.dsa, 85)).toBe(0);
    expect(canMissHours(LIVE.uhv, 85)).toBe(0); // 4/4, 85% -> slack 0.7 -> floor 0
  });
});

describe("mustAttendHours", () => {
  it("is zero when at or above the threshold", () => {
    expect(mustAttendHours(LIVE.dsa)).toBe(0);
    expect(mustAttendHours({ totalHours: 40, attendedHours: 30 })).toBe(0);
  });

  it("computes the recovery run for a course that is under", () => {
    // 15/21 = 71.43%. h >= (75*21 - 100*15)/25 = 75/25 = 3.
    // Check: 18/24 = 75.0% exactly.
    expect(mustAttendHours(LIVE.app)).toBe(3);
  });

  it("rounds up, because you cannot attend a fraction of an hour", () => {
    // 17/23 = 73.91%. h >= (75*23 - 1700)/25 = 25/25 = 1.
    expect(mustAttendHours(LIVE.coa)).toBe(1);
    // 27/40 = 67.5%. h >= 300/25 = 12.
    expect(mustAttendHours({ totalHours: 40, attendedHours: 27 })).toBe(12);
  });

  it("is infinite at a 100% threshold once anything has been missed", () => {
    expect(mustAttendHours(LIVE.dsa, 100)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("statusOf", () => {
  it("marks the two genuinely failing courses as under", () => {
    expect(statusOf(LIVE.app)).toBe("under");
    expect(statusOf(LIVE.coa)).toBe("under");
  });

  it("marks comfortable courses as safe", () => {
    expect(statusOf(LIVE.dsa)).toBe("safe");
    expect(statusOf(LIVE.uhv)).toBe("safe");
  });

  it("marks exactly-at-threshold as edge, not safe", () => {
    // Calling 75.0% "safe" is the bug that gets someone detained: they are one
    // hour away from dropping below and the UI must not look reassuring.
    expect(statusOf({ totalHours: 40, attendedHours: 30 })).toBe("edge");
  });

  it("marks a course with slack under one hour as edge", () => {
    // 5/6 = 83.33%, but slack floors to 0 — one more absence breaches.
    expect(statusOf(LIVE.ethics)).toBe("edge");
  });

  it("does not warn before any class is held", () => {
    expect(statusOf({ totalHours: 0, attendedHours: 0 })).toBe("safe");
  });
});

describe("verdictFor", () => {
  it("derives absent hours and matches the portal row", () => {
    expect(verdictFor(LIVE.dsa)).toMatchObject({
      totalHours: 32,
      attendedHours: 26,
      absentHours: 6, // the portal's own "Absent hours" column
      percentage: 81.25,
      status: "safe",
      canMissHours: 2,
      mustAttendHours: 0,
    });
  });
});

describe("hours to sessions", () => {
  it("floors slack so a partial session never reads as a whole one", () => {
    expect(slackAsSessions(3, 2)).toBe(1);
    expect(slackAsSessions(1, 2)).toBe(0);
  });

  it("ceils debt so a partial session still means turning up", () => {
    expect(debtAsSessions(3, 2)).toBe(2);
    expect(debtAsSessions(1, 2)).toBe(1);
  });

  it("passes infinity through untouched", () => {
    expect(debtAsSessions(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("summarise", () => {
  it("talks in hours when the session length is unknown", () => {
    expect(summarise(verdictFor(LIVE.dsa))).toBe("Can miss 2 hours more");
  });

  it("talks in classes when the session length is known", () => {
    // 2 hours of slack on a 1-hour theory slot is 2 classes.
    expect(summarise(verdictFor(LIVE.dsa), 1)).toBe("Can miss 2 classes more");
  });

  it("refuses to claim a whole class of room when there isn't one", () => {
    // 2 hours of slack on a 3-hour lab is real slack but zero whole sessions.
    expect(summarise(verdictFor(LIVE.dsa), 3)).toBe(
      "Not enough room to miss a full class"
    );
  });

  it("gives a recovery plan for a course that is under", () => {
    expect(summarise(verdictFor(LIVE.app))).toBe("Attend 3 hours in a row to recover");
    expect(summarise(verdictFor(LIVE.app), 2)).toBe("Attend 2 classes in a row to recover");
  });

  it("warns when there is no room left", () => {
    expect(summarise(verdictFor({ totalHours: 40, attendedHours: 30 }))).toBe(
      "Next absence drops you below"
    );
  });

  it("singularises correctly", () => {
    expect(summarise(verdictFor(LIVE.coa))).toBe("Attend 1 hour in a row to recover");
  });

  it("says so plainly when nothing has been held", () => {
    expect(summarise(verdictFor({ totalHours: 0, attendedHours: 0 }))).toBe(
      "No classes held yet"
    );
  });
});
