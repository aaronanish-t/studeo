/**
 * Seed data for the public demo.
 *
 * The demo is the most important surface on this site: nobody evaluating the
 * project — a recruiter, an interviewer, a student deciding whether to trust it
 * — is going to type their SRM password to find out what it does. So it has to
 * look like a real account.
 *
 * "Looks real" turned out to mean more than plausible course codes. The course
 * LOAD has to be real too. An earlier version of this file gave each student
 * four or five courses in slots that barely touched Day 1, and the demo
 * timetable came out with a single class on a day where a real student has
 * eight teaching hours. The whole page read as broken.
 *
 * So the catalogue below is modelled on an actual semester-3 CSE-AIML load
 * captured from Academia: nine rows, including the two lab components that
 * appear as separate entries from their parent theory course. The slot codes
 * are the real ones, which means placements are derived from the Unified Time
 * Table by buildTimetable() rather than invented here.
 *
 * A full-load student's Day 1 comes out as:
 *   A A F F · · · · P9 P10 L11 L12   — eight teaching hours, which is the point.
 *
 * None of this touches a real credential. prisma/seed.ts writes it, and every
 * row is flagged isDemo.
 */

import { HOUR_TIMES } from "../sources/slot-grid";

// The hour grid is institutional fact, verified against Academia's Unified
// Time Table — twelve 50-minute hours running 08:00 to 18:10. Re-exported
// rather than copied, so demo data can never drift from what students see.
export { DAY_END_MIN, DAY_START_MIN, HOUR_TIMES as HOUR_GRID } from "../sources/slot-grid";

export function hourToInterval(hour: number) {
  const found = HOUR_TIMES.find((h) => h.hour === hour);
  if (!found) throw new Error(`No such teaching hour: ${hour} (the day has 12)`);
  return { startMin: found.startMin, endMin: found.endMin };
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------
// SRM course codes encode the type in the trailing letter:
//   T = theory only, J = joint theory + lab, P = project-based, L = lab only.
//
// A "J" course occupies TWO rows — a lettered theory slot and a P-prefixed lab
// slot — under the same course code. That is how Academia presents them, and
// it is why the schema keys courses on (user, code, kind).

export interface DemoCourse {
  code: string;
  title: string;
  credits: number;
  faculty: string;
  kind: "THEORY" | "PRACTICAL" | "PROJECT";
  /** Real slot codes, exactly as Academia prints them. */
  slot: string;
  room: string;
  /** Teaching hours a week — how often this slot recurs on the grid. */
  hoursPerWeek: number;
}

export const COURSE_CATALOGUE = {
  maths: {
    code: "21MAB201T",
    title: "Transforms and Boundary Value Problems",
    credits: 4,
    faculty: "Dr. K. Prabakaran",
    kind: "THEORY",
    slot: "A",
    room: "TP 506",
    hoursPerWeek: 4,
  },
  dsa: {
    code: "21CSC201J",
    title: "Data Structures and Algorithms",
    credits: 4,
    faculty: "Dr. S. Joseph James",
    kind: "THEORY",
    slot: "B",
    room: "TP 506",
    hoursPerWeek: 4,
  },
  dsaLab: {
    code: "21CSC201J",
    title: "Data Structures and Algorithms — Lab",
    credits: 0,
    faculty: "Dr. S. Joseph James",
    kind: "PRACTICAL",
    slot: "P9-P10-",
    room: "CLS 403",
    hoursPerWeek: 2,
  },
  coa: {
    code: "21CSS201T",
    title: "Computer Organization and Architecture",
    credits: 4,
    faculty: "Dr. S. Sadagopan",
    kind: "THEORY",
    slot: "C",
    room: "TP 506",
    hoursPerWeek: 4,
  },
  app: {
    code: "21CSC203P",
    title: "Advanced Programming Practice",
    credits: 4,
    faculty: "Dr. M. Salomi Samsudeen",
    kind: "PROJECT",
    slot: "D",
    room: "TP 506",
    hoursPerWeek: 4,
  },
  os: {
    code: "21CSC202J",
    title: "Operating Systems",
    credits: 4,
    faculty: "Dr. S. Vimal",
    kind: "THEORY",
    slot: "F",
    room: "TP 506",
    hoursPerWeek: 3,
  },
  osLab: {
    code: "21CSC202J",
    title: "Operating Systems — Lab",
    credits: 0,
    faculty: "Dr. S. Vimal",
    kind: "PRACTICAL",
    slot: "P33-P34-",
    room: "UB 713B",
    hoursPerWeek: 2,
  },
  uhv: {
    code: "21LEM202T",
    title: "Universal Human Values II",
    credits: 3,
    faculty: "Dr. M. Kanipriya",
    kind: "THEORY",
    slot: "L11-L12-",
    room: "UB 801",
    hoursPerWeek: 2,
  },
  ethics: {
    code: "21LEM201T",
    title: "Professional Ethics",
    credits: 1,
    faculty: "Dr. D. Sundar Singh",
    kind: "THEORY",
    slot: "P47-",
    room: "online",
    hoursPerWeek: 1,
  },
} satisfies Record<string, DemoCourse>;

type CourseKey = keyof typeof COURSE_CATALOGUE;

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export interface DemoAttendance {
  /** Hours held. SRM counts attendance in hours, not classes. */
  conducted: number;
  present: number;
  /** On-duty. Counted as attended when computing the percentage. */
  onDuty: number;
}

export interface DemoMark {
  testCode: string;
  maxMarks: number;
  obtained: number;
  weightage: number;
}

export interface DemoEnrolment {
  course: CourseKey;
  attendance: DemoAttendance;
  marks: DemoMark[];
}

export interface DemoStudent {
  netId: string;
  name: string;
  regNo: string;
  department: string;
  program: string;
  year: number;
  section: string;
  enrolments: DemoEnrolment[];
}

/** Seven teaching weeks elapsed, matching the live portal's reporting period. */
const WEEKS_ELAPSED = 7;

/**
 * Build an attendance row from a target percentage.
 *
 * Hand-writing conducted/present pairs produced percentages nobody chose, and a
 * demo where the interesting states — just under the line, exactly on it —
 * only turned up by accident. Stating the intent and deriving the counts means
 * the demo reliably shows every state the UI can render, and the hours stay
 * consistent with how often the slot actually recurs.
 */
function attendanceAt(
  course: CourseKey,
  targetPercent: number,
  onDuty = 0
): DemoAttendance {
  const conducted = COURSE_CATALOGUE[course].hoursPerWeek * WEEKS_ELAPSED;
  const attended = Math.round((conducted * targetPercent) / 100);

  return { conducted, present: Math.max(attended - onDuty, 0), onDuty };
}

const marks = (ft1: number): DemoMark[] => [
  { testCode: "FT-I", maxMarks: 5, obtained: ft1, weightage: 5 },
];

/**
 * Five students on overlapping-but-different loads.
 *
 * Aarav carries the full nine-row load, so his week matches a real student's —
 * eight hours on Day 1. The others drop one or two courses each, which is what
 * makes the group free-hour view non-trivial: with identical timetables every
 * gap would be common, and the feature would look like a coincidence rather
 * than arithmetic.
 *
 * Attendance is chosen to exercise every state the UI has: comfortable,
 * exactly on the line, and already below it.
 */
export const DEMO_STUDENTS: DemoStudent[] = [
  {
    netId: "demo01",
    name: "Aarav Menon",
    regNo: "RA2511026010001",
    department: "Computing Technologies",
    program: "B.Tech CSE (AIML)",
    year: 2,
    section: "AA1",
    enrolments: [
      { course: "maths", attendance: attendanceAt("maths", 80.8, 2), marks: marks(4.6) },
      { course: "dsa", attendance: attendanceAt("dsa", 81.3), marks: marks(4.2) },
      { course: "dsaLab", attendance: attendanceAt("dsaLab", 92.9), marks: [] },
      { course: "coa", attendance: attendanceAt("coa", 73.9), marks: marks(3.4) },
      // The cautionary tale: below the line, and the dashboard has to say so
      // loudly rather than showing a neutral percentage.
      { course: "app", attendance: attendanceAt("app", 71.4), marks: marks(3.1) },
      { course: "os", attendance: attendanceAt("os", 78.1), marks: marks(4.0) },
      { course: "osLab", attendance: attendanceAt("osLab", 85.7), marks: [] },
      { course: "uhv", attendance: attendanceAt("uhv", 100), marks: marks(5.0) },
      { course: "ethics", attendance: attendanceAt("ethics", 85.7), marks: marks(4.4) },
    ],
  },
  {
    netId: "demo02",
    name: "Divya Raghunathan",
    regNo: "RA2511026010042",
    department: "Computing Technologies",
    program: "B.Tech CSE (AIML)",
    year: 2,
    section: "AA1",
    enrolments: [
      { course: "maths", attendance: attendanceAt("maths", 96.4), marks: marks(4.9) },
      { course: "dsa", attendance: attendanceAt("dsa", 92.9, 1), marks: marks(4.8) },
      { course: "dsaLab", attendance: attendanceAt("dsaLab", 100), marks: [] },
      { course: "coa", attendance: attendanceAt("coa", 89.3), marks: marks(4.5) },
      { course: "os", attendance: attendanceAt("os", 90.5), marks: marks(4.6) },
      { course: "osLab", attendance: attendanceAt("osLab", 92.9), marks: [] },
      { course: "ethics", attendance: attendanceAt("ethics", 100), marks: marks(5.0) },
    ],
  },
  {
    netId: "demo03",
    name: "Rahul Iyer",
    regNo: "RA2511026010117",
    department: "Computing Technologies",
    program: "B.Tech CSE (AIML)",
    year: 2,
    section: "AA2",
    enrolments: [
      { course: "maths", attendance: attendanceAt("maths", 67.9), marks: marks(2.8) },
      { course: "dsa", attendance: attendanceAt("dsa", 75.0), marks: marks(3.6) },
      { course: "dsaLab", attendance: attendanceAt("dsaLab", 78.6), marks: [] },
      { course: "app", attendance: attendanceAt("app", 71.4), marks: marks(3.0) },
      { course: "os", attendance: attendanceAt("os", 71.4), marks: marks(3.2) },
      { course: "osLab", attendance: attendanceAt("osLab", 85.7), marks: [] },
      { course: "uhv", attendance: attendanceAt("uhv", 92.9), marks: marks(4.3) },
    ],
  },
  {
    netId: "demo04",
    name: "Nikhil Prasad",
    regNo: "RA2511026010208",
    department: "Computing Technologies",
    program: "B.Tech CSE (AIML)",
    year: 2,
    section: "AA2",
    enrolments: [
      { course: "dsa", attendance: attendanceAt("dsa", 89.3), marks: marks(4.4) },
      { course: "dsaLab", attendance: attendanceAt("dsaLab", 92.9), marks: [] },
      { course: "coa", attendance: attendanceAt("coa", 92.9, 2), marks: marks(4.7) },
      { course: "app", attendance: attendanceAt("app", 85.7), marks: marks(4.1) },
      { course: "os", attendance: attendanceAt("os", 95.2), marks: marks(4.8) },
      { course: "osLab", attendance: attendanceAt("osLab", 100), marks: [] },
      { course: "uhv", attendance: attendanceAt("uhv", 85.7), marks: marks(4.2) },
      { course: "ethics", attendance: attendanceAt("ethics", 71.4), marks: marks(3.5) },
    ],
  },
  {
    netId: "demo05",
    name: "Sneha Balakrishnan",
    regNo: "RA2511026010311",
    department: "Computing Technologies",
    program: "B.Tech CSE (AIML)",
    year: 2,
    section: "AA1",
    enrolments: [
      { course: "maths", attendance: attendanceAt("maths", 85.7, 3), marks: marks(4.5) },
      { course: "dsa", attendance: attendanceAt("dsa", 82.1), marks: marks(4.0) },
      { course: "dsaLab", attendance: attendanceAt("dsaLab", 85.7), marks: [] },
      { course: "coa", attendance: attendanceAt("coa", 75.0), marks: marks(3.8) },
      { course: "app", attendance: attendanceAt("app", 78.6), marks: marks(3.9) },
      { course: "uhv", attendance: attendanceAt("uhv", 92.9), marks: marks(4.6) },
      { course: "ethics", attendance: attendanceAt("ethics", 100), marks: marks(5.0) },
    ],
  },
];

/** Everyone in the demo is friends with everyone else, by netId pair. */
export const DEMO_FRIENDSHIPS: Array<[string, string]> = DEMO_STUDENTS.flatMap(
  (student, index) =>
    DEMO_STUDENTS.slice(index + 1).map(
      (other) => [student.netId, other.netId] as [string, string]
    )
);

/** SRM counts on-duty as present when computing the percentage. */
export function attendancePercentage(a: DemoAttendance): number {
  if (a.conducted === 0) return 0;
  return Number((((a.present + a.onDuty) / a.conducted) * 100).toFixed(2));
}
