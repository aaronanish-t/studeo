import * as cheerio from "cheerio";

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
  /** Internal id needed to request the per-component breakdown. */
  internalId: string | null;
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

export class PortalParseError extends Error {
  constructor(what: string) {
    super(
      `Could not find the ${what} table. The Student Portal's markup has probably changed — ` +
        `re-capture lib/sources/fixtures/student-portal.ts and update the parser.`
    );
    this.name = "PortalParseError";
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();

/** The portal writes "-" for "no value". Treat it as absent, not as text. */
const orNull = (value: string): string | null => {
  const text = clean(value);
  return text === "" || text === "-" ? null : text;
};

function toNumber(value: string): number {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: string): number | null {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

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

type Row = string[];

/**
 * Find the one table whose header row contains every required phrase, and
 * return its body rows as arrays of cell text.
 */
function tableRows(html: string, required: string[], label: string): Row[] {
  const $ = cheerio.load(html);

  const match = $("table")
    .toArray()
    .find((table) => {
      const header = $(table)
        .find("tr")
        .first()
        .find("th, td")
        .toArray()
        .map((cell) => clean($(cell).text()).toLowerCase())
        .join(" | ");

      return required.every((needle) => header.includes(needle.toLowerCase()));
    });

  if (!match) throw new PortalParseError(label);

  return $(match)
    .find("tbody tr")
    .toArray()
    .map((tr) =>
      $(tr)
        .find("td")
        .toArray()
        .map((td) => clean($(td).text()))
    )
    .filter((cells) => cells.length > 0 && cells.some((cell) => cell !== ""));
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

      // The internal id lives only in the expander's onclick handler; without
      // it we can't request that course's component breakdown.
      const onclick = $(tr).find("[onclick]").attr("onclick") ?? "";
      const idMatch = onclick.match(/funViewComponentWiseMarks\(\s*'([^']+)'/);

      return {
        courseCode: cells[0],
        title: cells[1],
        obtained,
        maxMark,
        internalId: idMatch ? idMatch[1] : null,
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
