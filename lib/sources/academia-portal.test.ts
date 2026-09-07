import { describe, expect, it } from "vitest";

import { buildTimetable } from "./slot-grid";
import { COURSE_TABLE_HTML, STUDENT_PROFILE_HTML } from "./fixtures/academia";
import { facultyName, kindForSlot, parseCourseTable } from "./academia-portal";
import { PortalParseError } from "./html";
import { parseProfile } from "./student-portal";

describe("parseCourseTable", () => {
  const courses = parseCourseTable(COURSE_TABLE_HTML);

  it("reads every registered row", () => {
    expect(courses).toHaveLength(9);
  });

  it("reads a theory row completely", () => {
    expect(courses[0]).toEqual({
      code: "21MAB201T",
      title: "Transforms and Boundary Value Problems",
      credits: 4,
      registration: "Regular",
      category: "Basic Science",
      courseType: "Theory",
      faculty: "Dr. K. Prabakaran",
      slot: "A",
      room: "TP 506",
      academicYear: "AY2026-27-ODD",
      kind: "THEORY",
    });
  });

  it("keeps a lab-based course's two rows apart", () => {
    // 21CSC201J appears twice with the SAME course type, differing only by
    // slot. Collapsing them loses half the timetable.
    const dsa = courses.filter((c) => c.code === "21CSC201J");
    expect(dsa).toHaveLength(2);

    expect(dsa.map((c) => c.slot)).toEqual(["B", "P9-P10-"]);
    expect(dsa.map((c) => c.kind)).toEqual(["THEORY", "PRACTICAL"]);
    expect(dsa.map((c) => c.room)).toEqual(["TP 506", "CLS 403"]);
  });

  it("decides kind from the slot, not the course type", () => {
    // Both DSA rows say "Lab Based Theory". Reading that column would make
    // both rows practicals — or both theory — and lose the distinction.
    const dsa = courses.filter((c) => c.code === "21CSC201J");
    expect(new Set(dsa.map((c) => c.courseType))).toEqual(new Set(["Lab Based Theory"]));
  });

  it("recognises a project-based course", () => {
    const app = courses.find((c) => c.code === "21CSC203P");
    expect(app).toMatchObject({ courseType: "Project Based Theory", kind: "PROJECT" });
  });

  it("keeps multi-hour slots verbatim, trailing hyphen included", () => {
    expect(courses.find((c) => c.code === "21LEM202T")?.slot).toBe("L11-L12-");
    expect(courses.find((c) => c.code === "21LEM201T")?.slot).toBe("P47-");
  });

  it("handles a zero-credit online course", () => {
    expect(courses.find((c) => c.code === "21LEM201T")).toMatchObject({
      credits: 0,
      room: "online",
    });
  });

  it("throws a useful error when the markup changes", () => {
    expect(() => parseCourseTable("<div>Session expired</div>")).toThrow(PortalParseError);
  });
});

describe("facultyName", () => {
  it("strips the staff id", () => {
    expect(facultyName("Dr. S. Joseph James (101959)")).toBe("Dr. S. Joseph James");
  });

  it("leaves a plain name alone", () => {
    expect(facultyName("Dr. S. Vimal")).toBe("Dr. S. Vimal");
  });

  it("passes null through", () => {
    expect(facultyName(null)).toBeNull();
  });
});

describe("kindForSlot", () => {
  it("treats P-prefixed slots as practicals", () => {
    expect(kindForSlot("P9-P10-")).toBe("PRACTICAL");
    expect(kindForSlot("P47-")).toBe("PRACTICAL");
  });

  it("treats lettered and L slots as theory", () => {
    expect(kindForSlot("A")).toBe("THEORY");
    expect(kindForSlot("L11-L12-")).toBe("THEORY");
  });

  it("uses the course type only to spot projects", () => {
    expect(kindForSlot("D", "Project Based Theory")).toBe("PROJECT");
  });
});

describe("course table feeding the slot grid", () => {
  it("produces the real Day 1: eight teaching hours", () => {
    // The whole point of parsing slots. Aaron's real Day 1 is
    //   A A F F · · · · P9 P10 L11 L12
    const courses = parseCourseTable(COURSE_TABLE_HTML);

    const week = buildTimetable(
      courses.map((course) => ({
        courseCode: course.code,
        slot: course.slot,
        room: course.room,
      }))
    );

    const dayOne = week.filter((entry) => entry.dayOrder === 1);
    expect(dayOne).toHaveLength(8);
    expect(dayOne.map((entry) => entry.slot)).toEqual([
      "A", "A", "F", "F", "P9", "P10", "L11", "L12",
    ]);
  });
});

describe("parseProfile", () => {
  const profile = parseProfile(STUDENT_PROFILE_HTML);

  it("reads identity from the profile block", () => {
    expect(profile).toMatchObject({
      name: "AARON ANISH THADATHIL",
      regNo: "RA2511026010060",
      email: "at4152@srmist.edu.in",
      semester: 3,
      section: "R1",
    });
  });

  it("derives the netId from the email", () => {
    // netId is our primary key: it's what a student types to sign in anywhere
    // at SRM, and it's how Academia identifies them too, so the two sources
    // join on it cleanly.
    expect(profile.netId).toBe("at4152");
  });

  it("returns nulls rather than throwing on an unrecognised page", () => {
    const empty = parseProfile("<div>Please log in</div>");
    expect(empty.netId).toBeNull();
    expect(empty.name).toBeNull();
  });
});
