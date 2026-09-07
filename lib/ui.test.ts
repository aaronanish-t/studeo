import { describe, expect, it } from "vitest";
import { formatClock, formatClockCompact, formatHour, relativeTo } from "./ui";

describe("formatClock", () => {
  it("formats morning times", () => {
    expect(formatClock(8 * 60)).toBe("8:00 am");
    expect(formatClock(9 * 60 + 50)).toBe("9:50 am");
  });

  it("formats afternoon times", () => {
    expect(formatClock(13 * 60 + 25)).toBe("1:25 pm");
    expect(formatClock(18 * 60 + 10)).toBe("6:10 pm");
  });

  it("gets noon right", () => {
    // 12 % 12 is 0, so the naive version prints "0:30 pm".
    expect(formatClock(12 * 60)).toBe("12:00 pm");
    expect(formatClock(12 * 60 + 30)).toBe("12:30 pm");
  });

  it("gets midnight right", () => {
    expect(formatClock(0)).toBe("12:00 am");
    expect(formatClock(30)).toBe("12:30 am");
  });

  it("pads minutes", () => {
    expect(formatClock(13 * 60 + 5)).toBe("1:05 pm");
  });

  it("switches period exactly at noon, not after it", () => {
    expect(formatClock(11 * 60 + 59)).toBe("11:59 am");
    expect(formatClock(12 * 60 + 1)).toBe("12:01 pm");
  });
});

describe("formatHour", () => {
  it("drops the period for a dense axis", () => {
    expect(formatHour(8 * 60)).toBe("8");
    expect(formatHour(12 * 60)).toBe("12");
    expect(formatHour(13 * 60)).toBe("1");
    expect(formatHour(18 * 60)).toBe("6");
  });
});

describe("formatClockCompact", () => {
  it("drops the period for axis labels", () => {
    expect(formatClockCompact(8 * 60)).toBe("8:00");
    expect(formatClockCompact(13 * 60 + 25)).toBe("1:25");
    expect(formatClockCompact(17 * 60 + 30)).toBe("5:30");
  });

  it("still gets noon right", () => {
    expect(formatClockCompact(12 * 60 + 30)).toBe("12:30");
  });
});

describe("relativeTo", () => {
  it("counts minutes under an hour", () => {
    expect(relativeTo(40)).toBe("in 40 min");
  });

  it("switches to hours", () => {
    expect(relativeTo(60)).toBe("in 1h");
    expect(relativeTo(130)).toBe("in 2h 10m");
  });

  it("says now rather than a negative", () => {
    expect(relativeTo(0)).toBe("now");
    expect(relativeTo(-15)).toBe("now");
  });
});
