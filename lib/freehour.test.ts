import { describe, expect, it } from "vitest";
import {
  findGaps,
  formatDuration,
  formatMinutes,
  mergeIntervals,
  parseTime,
  type Person,
} from "./freehour";

const at = (start: string, end: string) => ({
  startMin: parseTime(start),
  endMin: parseTime(end),
});

const person = (id: string, name: string, ...busy: Array<[string, string]>): Person => ({
  id,
  name,
  busy: busy.map(([s, e]) => at(s, e)),
});

describe("mergeIntervals", () => {
  it("returns nothing for an empty schedule", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("merges overlapping intervals", () => {
    expect(mergeIntervals([at("09:00", "10:30"), at("10:00", "11:00")])).toEqual([
      at("09:00", "11:00"),
    ]);
  });

  it("joins intervals that merely touch", () => {
    expect(mergeIntervals([at("09:00", "10:00"), at("10:00", "11:00")])).toEqual([
      at("09:00", "11:00"),
    ]);
  });

  it("leaves a genuine gap alone", () => {
    expect(mergeIntervals([at("09:00", "10:00"), at("11:00", "12:00")])).toHaveLength(2);
  });

  it("discards zero and negative length intervals", () => {
    expect(mergeIntervals([at("09:00", "09:00")])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [at("10:00", "11:00"), at("09:00", "09:30")];
    const snapshot = structuredClone(input);
    mergeIntervals(input);
    expect(input).toEqual(snapshot);
  });
});

describe("findGaps", () => {
  it("returns nothing when there is nobody", () => {
    expect(findGaps([])).toEqual([]);
  });

  it("gives the whole day to someone with no classes", () => {
    const gaps = findGaps([person("a", "Aaron")]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      startMin: parseTime("08:00"),
      endMin: parseTime("17:30"),
    });
  });

  it("finds the window between two people's classes", () => {
    const gaps = findGaps(
      [
        person("a", "Aaron", ["08:00", "10:00"]),
        person("b", "Divya", ["08:00", "09:00"], ["11:00", "13:00"]),
      ],
      { dayEndMin: parseTime("13:00") }
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      startMin: parseTime("10:00"),
      endMin: parseTime("11:00"),
      durationMin: 60,
      blockedBy: [],
    });
  });

  it("does not invent a gap between back-to-back classes", () => {
    // Aaron's class ends exactly when Divya's begins. There is no free moment
    // at 10:00, and an off-by-one in event ordering would report one.
    const gaps = findGaps(
      [
        person("a", "Aaron", ["08:00", "10:00"]),
        person("b", "Divya", ["10:00", "12:00"]),
      ],
      { dayStartMin: parseTime("08:00"), dayEndMin: parseTime("12:00") }
    );

    expect(gaps).toEqual([]);
  });

  it("counts one person's overlapping slots as a single blocker", () => {
    // A lab double-booked against a theory slot is a data quirk we actually see
    // on Academia. It must not read as two people being busy.
    const gaps = findGaps([person("a", "Aaron", ["09:00", "11:00"], ["10:00", "12:00"])], {
      dayStartMin: parseTime("08:00"),
      dayEndMin: parseTime("13:00"),
      maxBlockers: 0,
    });

    expect(gaps).toEqual([
      expect.objectContaining({ startMin: parseTime("08:00"), endMin: parseTime("09:00") }),
      expect.objectContaining({ startMin: parseTime("12:00"), endMin: parseTime("13:00") }),
    ]);
  });

  it("filters out slivers below the minimum", () => {
    const group = [
      person("a", "Aaron", ["08:00", "10:00"], ["10:20", "17:30"]),
      person("b", "Divya", ["08:00", "10:00"], ["10:20", "17:30"]),
    ];

    expect(findGaps(group, { minDurationMin: 30 })).toEqual([]);
    expect(findGaps(group, { minDurationMin: 15 })).toHaveLength(1);
  });

  it("coalesces fragments split by an unrelated class boundary", () => {
    // Nobody is free 08:00-09:00. From 09:00 the group is free until 17:30, but
    // Divya's class ending at 11:00 puts a sweep boundary mid-gap. One window
    // should come back, not two.
    const gaps = findGaps([
      person("a", "Aaron", ["08:00", "09:00"]),
      person("b", "Divya", ["08:00", "09:00"]),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      startMin: parseTime("09:00"),
      endMin: parseTime("17:30"),
    });
  });

  it("surfaces near misses and names who is blocking", () => {
    const group = [
      person("a", "Aaron", ["08:00", "09:00"]),
      person("b", "Divya", ["08:00", "09:00"]),
      person("c", "Rahul", ["08:00", "12:00"]),
    ];

    // Strictly, nobody in this trio is free before noon.
    expect(findGaps(group, { dayEndMin: parseTime("12:00"), maxBlockers: 0 })).toEqual([]);

    // Allowing one blocker finds the 09:00-12:00 window and blames Rahul.
    const nearMisses = findGaps(group, { dayEndMin: parseTime("12:00"), maxBlockers: 1 });
    expect(nearMisses).toHaveLength(1);
    expect(nearMisses[0]).toMatchObject({
      startMin: parseTime("09:00"),
      endMin: parseTime("12:00"),
    });
    expect(nearMisses[0].blockedBy.map((p) => p.name)).toEqual(["Rahul"]);
  });

  it("clips classes that run outside the campus day", () => {
    const gaps = findGaps([person("a", "Aaron", ["07:00", "09:00"], ["16:00", "19:00"])], {
      dayStartMin: parseTime("08:00"),
      dayEndMin: parseTime("17:30"),
    });

    expect(gaps).toEqual([
      expect.objectContaining({ startMin: parseTime("09:00"), endMin: parseTime("16:00") }),
    ]);
  });
});

describe("formatting", () => {
  it("pads times to HH:MM", () => {
    expect(formatMinutes(590)).toBe("09:50");
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(1050)).toBe("17:30");
  });

  it("writes durations the way a person would say them", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
  });

  it("round-trips through parseTime", () => {
    expect(parseTime(formatMinutes(725))).toBe(725);
  });

  it("accepts sloppy input but rejects nonsense", () => {
    expect(parseTime("9:50")).toBe(590);
    expect(parseTime("09.50")).toBe(590);
    expect(() => parseTime("25:00")).toThrow();
    expect(() => parseTime("noon")).toThrow();
  });
});
