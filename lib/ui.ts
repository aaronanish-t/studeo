import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, letting later Tailwind utilities beat earlier ones.
 * Without twMerge, `cn("px-4", "px-6")` emits both and the winner depends on
 * stylesheet order rather than call order.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import type { AttendanceStatus } from "./attendance";

/** One place that decides what each attendance state looks like. */
export const STATUS_STYLES: Record<
  AttendanceStatus,
  { text: string; bg: string; border: string; dot: string; label: string }
> = {
  safe: {
    text: "text-safe",
    bg: "bg-safe-soft",
    border: "border-safe/25",
    dot: "bg-safe",
    label: "Comfortable",
  },
  edge: {
    text: "text-edge",
    bg: "bg-edge-soft",
    border: "border-edge/30",
    dot: "bg-edge",
    label: "On the line",
  },
  under: {
    text: "text-under",
    bg: "bg-under-soft",
    border: "border-under/30",
    dot: "bg-under",
    label: "Below 75%",
  },
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Monday 7 September" — no year; nobody needs the year on a dashboard. */
export function formatLongDate(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * 12-hour display time: 590 -> "9:50 am", 805 -> "1:25 pm".
 *
 * Minutes stay 24-hour everywhere internally — the arithmetic in freehour.ts
 * and attendance.ts depends on it — and this is the only place the conversion
 * happens. The two cases worth being careful about are noon and midnight:
 * hour 12 is "12 pm" (not "0 pm") and hour 0 is "12 am", because `h % 12` is
 * zero for both and a naive implementation prints "0:30".
 */
export function formatClock(minutes: number): string {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${hours12}:${String(mins).padStart(2, "0")} ${period}`;
}

/** Just the hour, for a dense time axis: 780 -> "1". */
export function formatHour(minutes: number): string {
  const hours24 = Math.floor(minutes / 60) % 24;
  return String(hours24 % 12 === 0 ? 12 : hours24 % 12);
}

/**
 * 12-hour time with the period dropped: 805 -> "1:25".
 *
 * For axis labels only, where the sequence runs left to right across a single
 * teaching day and "1:25" after "12:30" can't be misread as the small hours.
 * Anywhere a time stands alone, use formatClock and keep the am/pm.
 */
export function formatClockCompact(minutes: number): string {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${hours12}:${String(mins).padStart(2, "0")}`;
}

/** "in 40 min" / "in 2h 10m" / "now" */
export function relativeTo(minutesFromNow: number): string {
  if (minutesFromNow <= 0) return "now";
  if (minutesFromNow < 60) return `in ${minutesFromNow} min`;

  const hours = Math.floor(minutesFromNow / 60);
  const mins = minutesFromNow % 60;
  return mins === 0 ? `in ${hours}h` : `in ${hours}h ${mins}m`;
}
