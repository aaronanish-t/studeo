import { describe, expect, it } from "vitest";

import { COURSE_TABLE_HTML } from "./fixtures/academia";
import { parseCourseTable } from "./academia-portal";
import {
  decodeAcademiaPage,
  findCourseTable,
  isLockedPage,
  looksLikeCourseTable,
  parseAcademiaProfile,
  timetablePageCandidates,
} from "./academia-page";

/**
 * The pure half of the Academia sign-in. The network half can't be tested
 * without a live account and a real password, so everything that can be a
 * function over captured text is one.
 */

describe("decodeAcademiaPage", () => {
  it("unwraps the pageSanitizer envelope Creator wraps bodies in", () => {
    const raw = `zc.pageSanitizer.sanitize('\\x3Ctable\\x3E\\x3Ctr\\x3E\\x3Ctd\\x3EA\\x3C/td\\x3E\\x3C/tr\\x3E\\x3C/table\\x3E')`;
    expect(decodeAcademiaPage(raw)).toBe("<table><tr><td>A</td></tr></table>");
  });

  it("restores escaped apostrophes, which course titles genuinely contain", () => {
    const raw = String.raw`pageSanitizer.sanitize('\x3Cp\x3ELagrange\'s Theorem\x3C/p\x3E')`;
    expect(decodeAcademiaPage(raw)).toBe("<p>Lagrange's Theorem</p>");
  });

  it("passes plain HTML straight through", () => {
    // The extension's same-origin fetch sometimes gets unwrapped markup, and
    // one function has to serve both callers.
    const html = "<table><tr><td>Course Code</td></tr></table>";
    expect(decodeAcademiaPage(html)).toBe(html);
  });
});

describe("isLockedPage", () => {
  it("recognises the gate SRM puts on My_Attendance", () => {
    expect(
      isLockedPage('<div class="error">Page inaccessible — contact your administrator</div>')
    ).toBe(true);
  });

  it("does not mistake a real course table for a locked page", () => {
    expect(isLockedPage("<table><th>Course Code</th><th>Slot</th></table>")).toBe(false);
  });
});

describe("looksLikeCourseTable", () => {
  const REAL = `<table><tr><th>S.No</th><th>Course Code</th><th>Course Title</th>
    <th>Credit</th><th>Slot</th></tr><tr><td>1</td><td>21MAB201T</td>
    <td>Transforms</td><td>4</td><td>A</td></tr></table>`;

  it("accepts a table whose first row carries all three headers", () => {
    expect(looksLikeCourseTable(REAL)).toBe(true);
  });

  it("rejects Academia's page shell, which names the fields but has no table", () => {
    // This is the case that broke production: Zoho serves an 8KB shell whose
    // template markup mentions the column names, the client fills it in
    // later, and a word-match check called that a course table. The parser
    // then threw "the markup has probably changed" about a page that was
    // simply empty, and the extension never fell back to the rendered DOM.
    const shell = `<div data-field="Course Code"></div><div data-field="Slot"></div>`;
    expect(looksLikeCourseTable(shell)).toBe(false);
  });

  it("rejects a table missing one of the three headers", () => {
    expect(
      looksLikeCourseTable("<table><tr><th>Course Code</th><th>Credits</th></tr></table>")
    ).toBe(false);
  });

  it("agrees with the parser: whatever it accepts, parseCourseTable can read", () => {
    // The invariant worth protecting. These two drifting apart is precisely
    // what produced a "success" that threw one step later.
    expect(looksLikeCourseTable(COURSE_TABLE_HTML)).toBe(true);
    expect(() => parseCourseTable(COURSE_TABLE_HTML)).not.toThrow();
    expect(parseCourseTable(COURSE_TABLE_HTML).length).toBeGreaterThan(0);
  });
});

describe("findCourseTable", () => {
  it("returns just the table, so the shell around it is never posted", () => {
    const page = `<div><p>Registration Number : RA1</p>${COURSE_TABLE_HTML}<footer>x</footer></div>`;
    const found = findCourseTable(page);
    expect(found).not.toBeNull();
    expect(found).toContain("Course Code");
    expect(found).not.toContain("<footer>");
  });
});

describe("timetablePageCandidates", () => {
  it("leads with the name Academia actually serves, not the current year", () => {
    // Measured against a signed-in session in Sep 2026: My_Time_Table_2026_27
    // and _2025_26 both 404, while the stale _2023_24 returns 200. Probing
    // chronologically spent 655ms and 2083ms failing before reaching it.
    expect(timetablePageCandidates(new Date("2026-09-16"))[0]).toBe("My_Time_Table_2023_24");
  });

  it("still generates the current academic year, as insurance behind it", () => {
    // SRM will rename this eventually. September 2026 sits in AY2026-27.
    expect(timetablePageCandidates(new Date("2026-09-16"))).toContain("My_Time_Table_2026_27");
  });

  it("treats January as the back half of the previous academic year", () => {
    // February 2026 is the EVEN semester of AY2025-26, not the start of a new
    // one — the off-by-one that would put every spring student on the wrong page.
    const spring = timetablePageCandidates(new Date("2026-02-10"));
    expect(spring).toContain("My_Time_Table_2025_26");
    expect(spring).not.toContain("My_Time_Table_2026_27");
  });

  it("keeps the stale name that has outlived its year", () => {
    // My_Time_Table_2023_24 was still serving 2026-27 content when this was written.
    expect(timetablePageCandidates(new Date("2026-09-16"))).toContain("My_Time_Table_2023_24");
  });

  it("lists each page once", () => {
    const pages = timetablePageCandidates(new Date("2024-09-16"));
    expect(new Set(pages).size).toBe(pages.length);
  });
});

describe("parseAcademiaProfile", () => {
  // The registration block as Academia prints it above the course table.
  const PAGE = `
    <div>
      <p>Registration Number : RA2511026010060</p>
      <p>Name : AARON ANISH THADATHIL</p>
      <p>Program : B.Tech.</p>
      <p>Department : Computer Science and Engineering - (R1)</p>
      <p>Semester : 3</p>
      <p>Batch : 2</p>
    </div>
  `;

  it("reads the registration number", () => {
    expect(parseAcademiaProfile(PAGE).regNo).toBe("RA2511026010060");
  });

  it("reads the batch, which decides which slot grid the timetable is built on", () => {
    expect(parseAcademiaProfile(PAGE).batch).toBe("2");
  });

  it("splits the section out of the department, as the page packs them together", () => {
    const profile = parseAcademiaProfile(PAGE);
    expect(profile.department).toBe("Computer Science and Engineering");
    expect(profile.section).toBe("R1");
  });

  it("reads the semester as a number", () => {
    expect(parseAcademiaProfile(PAGE).semester).toBe(3);
  });

  it("returns nulls rather than guessing when the block is absent", () => {
    const profile = parseAcademiaProfile("<table><tr><td>nothing here</td></tr></table>");
    expect(profile.regNo).toBeNull();
    expect(profile.batch).toBeNull();
    expect(profile.semester).toBeNull();
  });

  it("rejects an out-of-range semester instead of storing it", () => {
    // A mis-parse that yields 47 must not become year 24.
    expect(parseAcademiaProfile("<p>Semester : 47</p>").semester).toBeNull();
  });
});
