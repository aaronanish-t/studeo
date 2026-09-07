/**
 * Attendance arithmetic.
 *
 * The portal shows you "71.43%". Nobody wants that number — they want the
 * decision it implies: can I skip tomorrow's 8am, or am I already in trouble?
 * Everything here converts a percentage into an action.
 *
 * ---------------------------------------------------------------------------
 * The unit is HOURS, not classes.
 * ---------------------------------------------------------------------------
 * Verified against the live SRM Student Portal, whose attendance table reads
 * `Max. hours | Att. hours | Absent hours | Total Percentage`. A theory slot is
 * one hour; a lab is two or three. So "you can miss 3 more" is meaningless
 * without saying 3 *what* — and rendering hours as though they were classes
 * tells a student with a 2-hour lab they have twice the slack they really do.
 *
 * We therefore compute strictly in hours and convert to sessions only where the
 * caller knows the hours-per-session for that specific course.
 *
 * On-duty is already folded into `Att. hours` upstream — on the live page
 * Att + Absent == Max for every row — so there is no separate OD term here.
 */

export const DEFAULT_THRESHOLD = 75;

export type AttendanceStatus = "safe" | "edge" | "under";

export interface AttendanceInput {
  /** "Max. hours" — teaching hours held so far for this course. */
  totalHours: number;
  /** "Att. hours" — hours credited as attended, OD included. */
  attendedHours: number;
}

export interface AttendanceVerdict {
  totalHours: number;
  attendedHours: number;
  absentHours: number;
  percentage: number;
  status: AttendanceStatus;
  /** Further hours you can miss and stay at or above the threshold. */
  canMissHours: number;
  /** Consecutive hours you must attend to climb back to the threshold. */
  mustAttendHours: number;
}

export function percentageOf(input: AttendanceInput): number {
  if (input.totalHours <= 0) return 0;
  return (input.attendedHours / input.totalHours) * 100;
}

/**
 * Hours that can still be missed while staying >= threshold.
 *
 *   attended / (total + h) >= t/100
 *   100 * attended >= t * (total + h)
 *   h <= (100 * attended - t * total) / t
 */
export function canMissHours(
  input: AttendanceInput,
  threshold = DEFAULT_THRESHOLD
): number {
  if (threshold <= 0) return Number.POSITIVE_INFINITY;
  if (input.totalHours <= 0) return 0;

  const slack = (100 * input.attendedHours - threshold * input.totalHours) / threshold;
  return Math.max(0, Math.floor(slack));
}

/**
 * Consecutive hours that must be attended to reach the threshold.
 *
 *   (attended + h) / (total + h) >= t/100
 *   h * (100 - t) >= t * total - 100 * attended
 *
 * At a threshold of 100 there is no finite answer once anything has been
 * missed — you cannot average back up to perfect.
 */
export function mustAttendHours(
  input: AttendanceInput,
  threshold = DEFAULT_THRESHOLD
): number {
  const deficit = threshold * input.totalHours - 100 * input.attendedHours;

  if (deficit <= 0) return 0;
  if (threshold >= 100) return Number.POSITIVE_INFINITY;

  return Math.ceil(deficit / (100 - threshold));
}

/**
 * Three states, because two aren't enough to be useful: someone sitting exactly
 * on 75% is not "fine", they are one hour from trouble, and the interface has
 * to say so in a different colour.
 */
export function statusOf(
  input: AttendanceInput,
  threshold = DEFAULT_THRESHOLD
): AttendanceStatus {
  if (input.totalHours <= 0) return "safe"; // nothing held yet; not a warning

  if (percentageOf(input) < threshold) return "under";
  return canMissHours(input, threshold) === 0 ? "edge" : "safe";
}

export function verdictFor(
  input: AttendanceInput,
  threshold = DEFAULT_THRESHOLD
): AttendanceVerdict {
  return {
    totalHours: input.totalHours,
    attendedHours: input.attendedHours,
    absentHours: Math.max(0, input.totalHours - input.attendedHours),
    percentage: Number(percentageOf(input).toFixed(2)),
    status: statusOf(input, threshold),
    canMissHours: canMissHours(input, threshold),
    mustAttendHours: mustAttendHours(input, threshold),
  };
}

/**
 * Hours -> whole sessions for a given course.
 *
 * Rounds DOWN for slack (three hours of room is one session of a 2-hour lab,
 * not one and a half) and UP for debt (needing three hours of a 2-hour lab
 * means turning up twice). Rounding either the other way would quietly
 * mislead in the dangerous direction.
 */
export function slackAsSessions(hours: number, hoursPerSession: number): number {
  if (!Number.isFinite(hours)) return hours;
  if (hoursPerSession <= 0) return hours;
  return Math.floor(hours / hoursPerSession);
}

export function debtAsSessions(hours: number, hoursPerSession: number): number {
  if (!Number.isFinite(hours)) return hours;
  if (hoursPerSession <= 0) return hours;
  return Math.ceil(hours / hoursPerSession);
}

/** "1 hour" / "2 hours" / "1 class" / "2 classes" — sibilants take -es. */
const plural = (n: number, unit: string) => {
  if (n === 1) return `${n} ${unit}`;
  return `${n} ${unit}${/(s|x|z|ch|sh)$/i.test(unit) ? "es" : "s"}`;
};

/**
 * The one line shown under the percentage.
 *
 * Pass `hoursPerSession` when the course's slot length is known and the line
 * becomes concrete ("can miss 1 class"); without it we stay honest and talk in
 * hours rather than implying a session count we can't justify.
 */
export function summarise(
  verdict: AttendanceVerdict,
  hoursPerSession?: number
): string {
  if (verdict.totalHours === 0) return "No classes held yet";

  if (verdict.status === "under") {
    if (!Number.isFinite(verdict.mustAttendHours)) {
      return "Cannot recover this semester";
    }
    const debt = hoursPerSession
      ? plural(debtAsSessions(verdict.mustAttendHours, hoursPerSession), "class")
      : plural(verdict.mustAttendHours, "hour");
    return `Attend ${debt} in a row to recover`;
  }

  if (verdict.canMissHours === 0) return "Next absence drops you below";

  const slack = hoursPerSession
    ? slackAsSessions(verdict.canMissHours, hoursPerSession)
    : verdict.canMissHours;

  // A 3-hour cushion on a 4-hour lab is real slack in hours but zero whole
  // sessions — say that plainly rather than claiming "0 classes".
  if (hoursPerSession && slack === 0) return "Not enough room to miss a full class";

  return `Can miss ${plural(slack, hoursPerSession ? "class" : "hour")} more`;
}
