import * as cheerio from "cheerio";

import {
  clean,
  labelledValues,
  orNull,
  PortalParseError,
  tableRows,
  toNullableNumber,
  toNumber,
} from "./html";

export { PortalParseError } from "./html";

/**
 * Parsers for the SRM Student Portal (sp.srmist.edu.in).
 *
 * Navigation there is a plain JSP form post — no Zoho, no dynamic URL
 * discovery, no versioned page names:
 *
 *   POST /srmiststudentportal/students/template/HRDSystem.jsp
 *        hdnFormId=<id>  &  csrfPreventionSalt=<token>
 *        Cookie: JSESSIONID=...
 *
 * Fetching is the caller's job; everything here is a pure HTML -> data
 * function, which is what makes it testable against captured fixtures.
 *
 * Tables are located by their HEADER TEXT rather than by index. The portal
 * renders two structurally identical `table.mb-0` elements on the attendance
 * page, and indexing into them means a future layout tweak silently parses the
 * monthly rollup as course data instead of failing.
 */

export const FORM_IDS = {
  dashboard: 1,
  attendance: 9,
  timetable: 10, // present in the menu but empty for at least some students
  internalMarks: 13,
  gradeAndCredit: 8,
  academicCalendar: 129,
  courseStatus: 84,
} as const;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface PortalAttendanceRow {
  courseCode: string;
  title: string;
  /** SRM counts attendance in HOURS, not classes. See lib/attendance.ts. */
  totalHours: number;
  attendedHours: number;
  absentHours: number;
  /** The portal's own figure, kept so we can assert our maths agrees. */
  percentage: number;
}

export interface PortalMonthlyRow {
  month: string; // "Jul-2026"
  present: number;
  absent: number;
}

export interface PortalAttendance {
  periodFrom: string | null; // ISO date
  periodTo: string | null;
  courses: PortalAttendanceRow[];
  monthly: PortalMonthlyRow[];
}

export interface PortalMarkSummary {
  courseCode: string;
  title: string;
  obtained: number | null;
  maxMark: number | null;
  /**
   * Internal subject id, needed to request the component breakdown. It exists
   * nowhere in the markup except the expander's onclick handler.
   */
  internalId: string | null;
  /**
   * The `status` argument that same handler passes along. Its meaning isn't
   * documented anywhere we can see — it has been 2 on every row observed — but
   * the endpoint expects it, so it's carried through verbatim rather than
   * assumed.
   */
  status: number | null;
}

export interface PortalMarkComponent {
  enteredOn: string | null; // ISO date
  component: string; // "FT-I"
  obtained: number | null;
  maxMark: number | null;
}

export interface PortalCalendarDay {
  date: string; // ISO date
  weekday: string;
  isHoliday: boolean;
  /** null on holidays — the cycle pauses rather than advancing. */
  dayOrder: number | null;
  week: number | null;
  remark: string | null;
}

export interface PortalProfile {
  name: string | null;
  regNo: string | null;
  email: string | null;
  /** The part before @srmist.edu.in — our primary key for a student. */
  netId: string | null;
  program: string | null;
  institution: string | null;
  semester: number | null;
  section: string | null;
  batch: string | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** "21-07-2026" (calendar) and "31/Aug/2026" (marks) both appear. */
export function parsePortalDate(value: string | null | undefined): string | null {
  const text = clean(value ?? "");
  if (!text) return null;

  const numeric = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (numeric) return iso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const named = text.match(/^(\d{1,2})[-/]([A-Za-z]{3,})[-/](\d{4})$/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return iso(Number(named[3]), month, Number(named[1]));
  }

  return null;
}

/** "4.20 / 5.00" -> { obtained: 4.2, maxMark: 5 } */
export function parseMarkPair(value: string): {
  obtained: number | null;
  maxMark: number | null;
} {
  const [left, right] = clean(value).split("/");
  return {
    obtained: left === undefined ? null : toNullableNumber(left),
    maxMark: right === undefined ? null : toNullableNumber(right),
  };
}

/** "Day 3" -> 3, "-" -> null */
function parseDayOrder(value: string): number | null {
  const match = clean(value).match(/(\d+)/);
  if (!match) return null;
  const order = Number(match[1]);
  return order >= 1 && order <= 5 ? order : null;
}

// ---------------------------------------------------------------------------
// Attendance — form 9
// ---------------------------------------------------------------------------

export function parseAttendance(html: string): PortalAttendance {
  const courseRows = tableRows(html, ["code", "max. hours", "att. hours"], "attendance");

  const courses: PortalAttendanceRow[] = courseRows
    .filter((cells) => cells.length >= 6 && /^[0-9A-Z]{6,}$/i.test(cells[0]))
    .map((cells) => ({
      courseCode: cells[0],
      title: cells[1],
      totalHours: toNumber(cells[2]),
      attendedHours: toNumber(cells[3]),
      absentHours: toNumber(cells[4]),
      percentage: toNumber(cells[5]),
    }));

  // The monthly rollup is optional — it's absent before the first month closes.
  let monthly: PortalMonthlyRow[] = [];
  try {
    monthly = tableRows(html, ["month", "present", "absent"], "monthly attendance")
      .filter((cells) => cells.length >= 3)
      .map((cells) => ({
        month: cells[0],
        present: toNumber(cells[1]),
        absent: toNumber(cells[2]),
      }));
  } catch {
    monthly = [];
  }

  const period = clean(cheerio.load(html).root().text()).match(
    /During the Period:\s*([\d/A-Za-z-]+)\s*To\s*([\d/A-Za-z-]+)/i
  );

  return {
    periodFrom: period ? parsePortalDate(period[1]) : null,
    periodTo: period ? parsePortalDate(period[2]) : null,
    courses,
    monthly,
  };
}

// ---------------------------------------------------------------------------
// Internal marks — form 13
// ---------------------------------------------------------------------------

export function parseMarksSummary(html: string): PortalMarkSummary[] {
  const $ = cheerio.load(html);

  const table = $("table")
    .toArray()
    .find((el) => clean($(el).text()).toLowerCase().includes("mark / max. mark"));

  if (!table) throw new PortalParseError("internal marks");

  return $(table)
    .find("tbody tr")
    .toArray()
    .map((tr) => {
      const cells = $(tr).find("td").toArray().map((td) => clean($(td).text()));
      if (cells.length < 3 || !cells[0]) return null;

      const { obtained, maxMark } = parseMarkPair(cells[2]);

      // Both the id and the status live only in the expander's onclick, which
      // reads:
      //   funViewComponentWiseMarks('39137', '21CSS201T', 'COMPUTER ORG…', 2)
      // Capture the first and fourth arguments; the middle two are the code and
      // title, which we already have from the row's own cells.
      const onclick = $(tr).find("[onclick]").attr("onclick") ?? "";
      const call = onclick.match(
        /funViewComponentWiseMarks\(\s*'([^']*)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*(\d+)\s*\)/
      );

      // Fall back to the id alone if the signature ever changes shape — the id
      // is the part we can't do without.
      const idOnly = call ? null : onclick.match(/funViewComponentWiseMarks\(\s*'([^']+)'/);

      return {
        courseCode: cells[0],
        title: cells[1],
        obtained,
        maxMark,
        internalId: call?.[1] ?? idOnly?.[1] ?? null,
        status: call ? Number(call[2]) : null,
      };
    })
    .filter((row): row is PortalMarkSummary => row !== null);
}

export function parseMarksDetail(html: string): PortalMarkComponent[] {
  return tableRows(html, ["entered on", "component"], "mark components")
    .filter((cells) => cells.length >= 3)
    .map((cells) => {
      const { obtained, maxMark } = parseMarkPair(cells[2]);
      return {
        enteredOn: parsePortalDate(cells[0]),
        component: cells[1],
        obtained,
        maxMark,
      };
    });
}

// ---------------------------------------------------------------------------
// Student profile — form 1
// ---------------------------------------------------------------------------

/**
 * The profile block, which is what tells us WHO a payload belongs to.
 *
 * Keyed on netId (the part before @srmist.edu.in) rather than the registration
 * number: it's what a student types to sign in anywhere else at SRM, it's
 * stable, and Academia identifies people by it too, so the two sources join
 * cleanly.
 */
export function parseProfile(html: string): PortalProfile {
  const values = labelledValues(html);
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = values.get(key);
      if (value && value !== "-") return value;
    }
    return null;
  };

  const email = get("email id", "email")?.toLowerCase() ?? null;

  return {
    name: get("student name", "name"),
    regNo: get("register no.", "register no", "registration number"),
    email,
    netId: email ? (email.split("@")[0] ?? null) : null,
    program: get("program", "programme"),
    institution: get("institution"),
    semester: (() => {
      const raw = get("semester");
      const match = raw?.match(/(\d+)/);
      const value = match ? Number(match[1]) : null;
      return value !== null && value >= 1 && value <= 10 ? value : null;
    })(),
    section: get("section"),
    batch: get("batch"),
  };
}

// ---------------------------------------------------------------------------
// Academic calendar — form 129
// ---------------------------------------------------------------------------

export function parseCalendar(html: string): PortalCalendarDay[] {
  return tableRows(html, ["date", "status", "day order"], "academic calendar")
    .filter((cells) => cells.length >= 5)
    .map((cells) => {
      const date = parsePortalDate(cells[0]);
      if (!date) return null;

      const status = clean(cells[2]).toLowerCase();

      return {
        date,
        weekday: cells[1],
        isHoliday: status.includes("holiday"),
        dayOrder: parseDayOrder(cells[4]),
        week: toNullableNumber((cells[3].match(/(\d+)/) ?? ["", ""])[1]),
        remark: orNull(cells[5] ?? ""),
      };
    })
    .filter((day): day is PortalCalendarDay => day !== null);
}
