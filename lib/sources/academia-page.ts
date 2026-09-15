import * as cheerio from "cheerio";

import { clean } from "./html";

/**
 * Fetching and unwrapping Academia's pages with a signed-in cookie.
 *
 * Two Academia-specific facts live here.
 *
 * First, Creator serves its page bodies as a JavaScript string passed to
 * `pageSanitizer.sanitize('…')`, hex-escaped. The XHR the app itself makes gets
 * the same thing, so this isn't a server-side quirk — it's just how the page
 * arrives, and every parser downstream wants real HTML.
 *
 * Second, page names carry stale academic-year suffixes: `My_Time_Table_2023_24`
 * has been serving 2026-27 content for years. Hardcoding one rots, so we probe
 * a short list and keep the one that answers with a course table.
 */

const BASE = "https://academia.srmist.edu.in/srm_university/academia-academic-services/page/";

const PAGE_HEADERS = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "x-requested-with": "XMLHttpRequest",
  Referer: "https://academia.srmist.edu.in/",
} as const;

/**
 * Unwrap `pageSanitizer.sanitize('…')` into HTML.
 *
 * Tolerant by design: the extension's same-origin fetch sometimes hands back
 * plain markup already, and one function serving both paths is one fewer thing
 * to keep in step.
 */
export function decodeAcademiaPage(raw: string): string {
  const wrapped = raw.match(/pageSanitizer\.sanitize\s*\(\s*'([\s\S]*?)'\s*\)/);
  if (!wrapped?.[1]) return raw;

  return wrapped[1]
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\\/g, "")
    .replace(/\\'/g, "'");
}

/** Academic-year suffixes worth trying, newest first. */
function yearSuffixes(now: Date): string[] {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Jan–Jun is the EVEN half of the previous year's academic session.
  const current = month <= 6 ? year - 1 : year;

  return [current, current - 1, current - 2].map(
    (start) => `${start}_${String(start + 1).slice(-2)}`
  );
}

export function timetablePageCandidates(now: Date = new Date()): string[] {
  return [
    ...yearSuffixes(now).map((suffix) => `My_Time_Table_${suffix}`),
    // Observed in the wild long after its year passed.
    "My_Time_Table_2023_24",
    "My_Time_Table",
  ].filter((page, index, all) => all.indexOf(page) === index);
}

/** The real page has a course-registration table; a rejection has neither header. */
export function looksLikeCourseTable(html: string): boolean {
  return /Course\s*Code/i.test(html) && /Slot/i.test(html);
}

/**
 * SRM gates some Creator pages per role. `My_Attendance` is gated for ordinary
 * students, which is the entire reason attendance comes from the Student
 * Portal instead — worth detecting by name so a locked page never reads as a
 * parser failure.
 */
export function isLockedPage(html: string): boolean {
  return /Page\s+inaccessible|contact\s+your\s+administrator/i.test(html);
}

export interface AcademiaPageResult {
  ok: boolean;
  page?: string;
  html?: string;
  reason?: "SIGNED_OUT" | "LOCKED" | "NOT_FOUND";
}

async function fetchPage(page: string, cookie: string): Promise<string | null> {
  const response = await fetch(BASE + encodeURIComponent(page), {
    method: "GET",
    headers: { ...PAGE_HEADERS, cookie },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return decodeAcademiaPage(await response.text());
}

/** Find and return the course table, trying each candidate page name. */
export async function fetchCourseTable(cookie: string): Promise<AcademiaPageResult> {
  let sawSignedOut = false;

  for (const page of timetablePageCandidates()) {
    const html = await fetchPage(page, cookie).catch(() => null);
    if (!html) continue;

    if (looksLikeCourseTable(html)) return { ok: true, page, html };
    if (isLockedPage(html)) return { ok: false, page, reason: "LOCKED" };

    // A login screen means the cookie didn't survive the bridge hop.
    if (/signin|Zoho Accounts/i.test(html) && html.length < 20_000) sawSignedOut = true;
  }

  return { ok: false, reason: sawSignedOut ? "SIGNED_OUT" : "NOT_FOUND" };
}

/**
 * Try the attendance page anyway.
 *
 * Expected to come back LOCKED — but the gate is SRM's to change, and a sign-in
 * that silently never checked would hide the day it opens. Costs one request.
 */
export async function fetchAttendancePage(cookie: string): Promise<AcademiaPageResult> {
  const html = await fetchPage("My_Attendance", cookie).catch(() => null);
  if (!html) return { ok: false, reason: "NOT_FOUND" };
  if (isLockedPage(html)) return { ok: false, page: "My_Attendance", reason: "LOCKED" };

  return { ok: true, page: "My_Attendance", html };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface AcademiaProfile {
  name: string | null;
  regNo: string | null;
  program: string | null;
  department: string | null;
  section: string | null;
  semester: number | null;
  /** "1" or "2" — kept as text so parseBatch owns the interpretation. */
  batch: string | null;
}

/**
 * Read the registration details Academia prints above the course table.
 *
 * Matched over the page's text rather than its structure: the block is a
 * loose run of label/value pairs whose markup differs between the timetable
 * and course pages, while the labels themselves have been stable.
 *
 * Batch is the one that matters most — the two batches run different slot
 * grids, so a wrong batch produces a complete, plausible, wrong timetable.
 */
export function parseAcademiaProfile(html: string): AcademiaProfile {
  const text = cheerio.load(html).text().replace(/\s+/g, " ");

  const field = (pattern: RegExp): string | null => {
    const value = text.match(pattern)?.[1];
    return value ? clean(value) || null : null;
  };

  // Digits belong in this class: the section rides along inside the department
  // as "… - (R1)", and a class without 0-9 fails the whole match rather than
  // just dropping the section.
  const department = field(
    /Department\s*:?\s*([-A-Za-z0-9\s()]+?)(?:\s*(?:Specialization|Semester|Batch)\b|$)/i
  );

  // "Computer Science and Engineering - (R1)" packs the section into the
  // department, exactly as the page prints it.
  let section: string | null = null;
  let plainDepartment = department;

  if (department?.includes("-")) {
    const [head, ...rest] = department.split("-");
    plainDepartment = clean(head) || null;
    section = clean(rest.join("-").replace(/[()]/g, "").replace(/section/i, "")) || null;
  }

  const semesterRaw = field(/Semester\s*:?\s*(\d+)/i);
  const semester = semesterRaw ? Number(semesterRaw) : null;

  return {
    name: field(/Name\s*:?\s*([A-Za-z.\s]+?)(?:\s*(?:Program|Department|Registration)\b|$)/i),
    regNo: field(/Registration\s*Number\s*:?\s*([A-Za-z0-9]+)/i),
    program: field(/Program\s*:?\s*([A-Za-z.\s]+?)(?:\s*(?:Department|Specialization|Semester)\b|$)/i),
    department: plainDepartment,
    section,
    semester: semester && semester >= 1 && semester <= 10 ? semester : null,
    batch: field(/Batch\s*:?\s*(\d+)/i),
  };
}
