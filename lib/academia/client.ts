/**
 * The one and only place that knows Academia exists.
 *
 * Everything upstream of here speaks Studeo's own vocabulary. That boundary is
 * deliberate: we depend on `reddy-api-srm`, a single-maintainer package that
 * shipped thirteen versions in four months, to do the actual scraping. It is
 * good code — audited, MIT, talks to nothing but the college portal — but it is
 * one person's side project against an undocumented portal that changes between
 * semesters. When it breaks or goes unmaintained, the blast radius should be
 * this file, not the application.
 *
 * So: no Academia types leak past this module, and no caller anywhere else
 * imports `reddy-api-srm` directly.
 */

import {
  getAllData,
  login as academiaLogin,
  logoutUser,
  type AttendanceDetail,
  type CourseSlot,
  type MarkDetail,
  type UserInfoResponse,
} from "reddy-api-srm";

import { parseTime } from "@/lib/freehour";

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

export type AcademiaFailure =
  | "BAD_CREDENTIALS"
  | "CAPTCHA_REQUIRED"
  | "SESSION_DEAD"
  | "CONCURRENT_LIMIT"
  | "UPSTREAM_UNAVAILABLE";

export class AcademiaError extends Error {
  constructor(
    readonly kind: AcademiaFailure,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "AcademiaError";
  }

  /** Whether a retry could plausibly succeed without the user doing anything. */
  get retryable(): boolean {
    return this.kind === "UPSTREAM_UNAVAILABLE" || this.kind === "CONCURRENT_LIMIT";
  }

  /** What we actually put in front of the student. */
  get userMessage(): string {
    switch (this.kind) {
      case "BAD_CREDENTIALS":
        return "That NetID or password didn't work. Note this is your Academia password, not your Studeo one.";
      case "CAPTCHA_REQUIRED":
        return "Academia is asking for a captcha. Sign in on the official portal once, then try again here.";
      case "SESSION_DEAD":
        return "Your Academia session expired. Sign in again to resume syncing.";
      case "CONCURRENT_LIMIT":
        return "Academia allows only two active sessions. Close one and try again.";
      case "UPSTREAM_UNAVAILABLE":
        return "Academia isn't responding right now. We'll keep your last synced data and retry shortly.";
    }
  }
}

// ---------------------------------------------------------------------------
// Our domain shapes
// ---------------------------------------------------------------------------

export interface AcademiaSessionHandle {
  cookie: string;
  /**
   * Our estimate of how long the cookie lives. Zoho doesn't tell us, so this is
   * a conservative guess that gets corrected the first time a sync 401s — the
   * worker writes back the observed lifetime.
   */
  estimatedExpiry: Date;
}

export interface NormalisedCourse {
  code: string;
  title: string;
  faculty: string | null;
  slot: string | null;
  room: string | null;
  kind: "THEORY" | "PRACTICAL" | "PROJECT";
  credits: number;
}

export interface NormalisedAttendance {
  courseCode: string;
  kind: NormalisedCourse["kind"];
  conducted: number;
  absent: number;
  present: number;
  percentage: number;
  /** Positive: classes you can still miss. Negative: classes you must attend. */
  margin: number;
}

export interface NormalisedMark {
  courseCode: string;
  testCode: string;
  obtained: number | null;
  maxMarks: number;
}

export interface NormalisedSlot {
  dayOrder: number;
  slotCode: string;
  startMin: number;
  endMin: number;
  courseCode: string | null;
  room: string | null;
}

export interface AcademiaSnapshot {
  fetchedAt: Date;
  profile: {
    name: string | null;
    regNo: string | null;
    program: string | null;
    department: string | null;
    section: string | null;
    semester: number | null;
  };
  currentDayOrder: number | null;
  courses: NormalisedCourse[];
  attendance: NormalisedAttendance[];
  marks: NormalisedMark[];
  timetable: NormalisedSlot[];
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Exchange a password for a session cookie — the only moment a password exists
 * in this system. The caller seals the returned cookie into the vault and drops
 * the password on the floor. It is never written anywhere.
 *
 * Note we pass maxRetries: 0. The library will otherwise "helpfully" terminate
 * the student's other Academia sessions to force its way in, which at campus
 * scale means logging people out of their own portal. We'd rather fail and tell
 * them.
 */
export async function signIn(
  email: string,
  password: string
): Promise<AcademiaSessionHandle> {
  let result;
  try {
    result = await academiaLogin(email, password, 0);
  } catch (cause) {
    throw new AcademiaError("UPSTREAM_UNAVAILABLE", "Academia login threw", cause);
  }

  if (!result.isAuthenticated || !result.cookies) {
    throw new AcademiaError(classifyLoginError(result.error), result.error ?? "Login failed");
  }

  return {
    cookie: result.cookies,
    // Conservative until measured. See the note on AcademiaSessionHandle.
    estimatedExpiry: new Date(Date.now() + 6 * 60 * 60 * 1000),
  };
}

function classifyLoginError(error?: string): AcademiaFailure {
  const text = (error ?? "").toLowerCase();
  if (text.includes("captcha")) return "CAPTCHA_REQUIRED";
  if (text.includes("concurrent") || text.includes("session limit")) return "CONCURRENT_LIMIT";
  if (text.includes("password") || text.includes("credential") || text.includes("not found")) {
    return "BAD_CREDENTIALS";
  }
  return "UPSTREAM_UNAVAILABLE";
}

/** Politely hand the session back when a user disconnects their account. */
export async function signOut(cookie: string): Promise<void> {
  try {
    await logoutUser(cookie);
  } catch {
    // Best effort. A failed logout just means the cookie expires on its own.
  }
}

// ---------------------------------------------------------------------------
// Fetch + normalise
// ---------------------------------------------------------------------------

/**
 * One round trip for everything, using only the stored cookie.
 *
 * `getAllData` fans out in parallel internally, which is seven concurrent
 * requests per student. That's fine for one user and antisocial for a thousand,
 * which is why the sync worker staggers callers rather than parallelising here.
 */
export async function fetchSnapshot(cookie: string): Promise<AcademiaSnapshot> {
  let raw;
  try {
    raw = await getAllData(cookie);
  } catch (cause) {
    throw new AcademiaError("UPSTREAM_UNAVAILABLE", "Academia fetch threw", cause);
  }

  // The library reports auth failure as a status on each sub-response rather
  // than throwing, so an expired cookie shows up as a 401 here.
  if (raw.attendance.status === 401 || raw.userInfo.status === 401) {
    throw new AcademiaError("SESSION_DEAD", "Stored cookie rejected by Academia");
  }

  return {
    fetchedAt: new Date(),
    profile: normaliseProfile(raw.userInfo),
    currentDayOrder: toDayOrder(raw.dayOrder?.dayOrder),
    courses: normaliseCourses(raw.attendance.attendance ?? []),
    attendance: normaliseAttendance(raw.attendance.attendance ?? []),
    marks: normaliseMarks(raw.marks.markList ?? []),
    timetable: normaliseTimetable(raw.timetable.timetable ?? []),
  };
}

function normaliseProfile(response: UserInfoResponse): AcademiaSnapshot["profile"] {
  const info = response.userInfo;

  // Academia leaves fields as empty strings rather than omitting them, so
  // coerce blanks to null — the difference matters when we decide whether a
  // sync actually learned anything new about the student.
  const text = (value: string | undefined) => value?.trim() || null;

  return {
    name: text(info?.name),
    regNo: text(info?.regNumber),
    program: text(info?.program),
    department: text(info?.department),
    section: text(info?.section),
    semester: toSemester(info?.semester),
  };
}

/** "Semester 5" | "5" -> 5 */
function toSemester(value: string | undefined): number | null {
  const match = value?.match(/(\d+)/);
  if (!match) return null;

  const semester = Number(match[1]);
  return semester >= 1 && semester <= 10 ? semester : null;
}

/**
 * Decide theory vs practical from the SLOT, not the course type.
 *
 * Verified against a live portal: a lab-based course appears as two rows with
 * the *same* code and the *same* Course Type ("Lab Based Theory"), separated
 * only by slot —
 *
 *   21CSC201J | Lab Based Theory | B         | TP 506
 *   21CSC201J | Lab Based Theory | P9-P10-   | CLS 403
 *
 * So course type tells you the course has a lab somewhere; the slot tells you
 * which row you're looking at. Reading the type here silently collapses both
 * rows into one and loses half the timetable.
 *
 * Slot vocabulary: bare letters (A, B, C…) are theory hours, P-prefixed are
 * practicals, L-prefixed are the longer lecture blocks. Multi-hour slots are
 * hyphen-joined with a trailing hyphen: "P9-P10-", "L11-L12-".
 */
function toKind(slot: string | undefined, courseType?: string): NormalisedCourse["kind"] {
  const codes = parseSlotCodes(slot);

  if (codes.some((code) => /^P\d+$/i.test(code))) return "PRACTICAL";
  if ((courseType ?? "").toLowerCase().includes("project")) return "PROJECT";
  return "THEORY";
}

/** "P9-P10-" -> ["P9","P10"]; "A" -> ["A"]; "" -> [] */
export function parseSlotCodes(slot: string | undefined): string[] {
  return (slot ?? "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normaliseCourses(rows: AttendanceDetail[]): NormalisedCourse[] {
  return rows.map((row) => ({
    code: row.courseCode,
    title: row.courseTitle,
    faculty: row.courseFaculty || null,
    slot: row.courseSlot || null,
    room: null, // attendance rows don't carry a room; the timetable does
    kind: toKind(row.courseSlot, row.courseCategory),
    credits: 0, // filled in from the course-details page when available
  }));
}

function normaliseAttendance(rows: AttendanceDetail[]): NormalisedAttendance[] {
  return rows.map((row) => {
    const conducted = Number(row.courseConducted) || 0;
    const absent = Number(row.courseAbsent) || 0;
    const present = Math.max(conducted - absent, 0);
    const percentage = Number.parseFloat(row.courseAttendance) || 0;

    // The library already computes this; we re-express it with a sign so the UI
    // doesn't have to branch on a status string. Positive means slack.
    const status = row.courseAttendanceStatus;
    const margin =
      status?.status === "required" ? -Math.abs(status.classes) : Math.abs(status?.classes ?? 0);

    return {
      courseCode: row.courseCode,
      kind: toKind(row.courseSlot, row.courseCategory),
      conducted,
      absent,
      present,
      percentage,
      margin,
    };
  });
}

function normaliseMarks(rows: MarkDetail[]): NormalisedMark[] {
  return rows.flatMap((row) =>
    row.marks.map((mark) => ({
      courseCode: row.course,
      testCode: mark.exam,
      obtained: Number.isFinite(mark.obtained) ? mark.obtained : null,
      maxMarks: mark.maxMark,
    }))
  );
}

function normaliseTimetable(days: Array<{ dayOrder: string; class: CourseSlot[] }>): NormalisedSlot[] {
  const slots: NormalisedSlot[] = [];

  for (const day of days) {
    const dayOrder = toDayOrder(day.dayOrder);
    if (dayOrder === null) continue;

    for (const entry of day.class) {
      if (!entry.isClass) continue;

      const window = parseSlotTime(entry.time);
      if (!window) continue;

      slots.push({
        dayOrder,
        slotCode: entry.slot,
        startMin: window.startMin,
        endMin: window.endMin,
        courseCode: entry.courseCode ?? null,
        room: entry.courseRoomNo ?? null,
      });
    }
  }

  return slots;
}

/** "Day 3" | "3" -> 3 */
function toDayOrder(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  if (!match) return null;

  const order = Number(match[1]);
  return order >= 1 && order <= 5 ? order : null;
}

/** "08:00 - 08:50" -> minutes. Returns null rather than throwing on junk. */
function parseSlotTime(value: string | undefined): { startMin: number; endMin: number } | null {
  if (!value) return null;

  const [from, to] = value.split(/[-–]/).map((part) => part.trim());
  if (!from || !to) return null;

  try {
    return { startMin: parseTime(from), endMin: parseTime(to) };
  } catch {
    return null;
  }
}
