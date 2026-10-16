"use client";

import { useMemo, useState } from "react";

import {
  afterMissing,
  DEFAULT_THRESHOLD,
  percentageOf,
  statusOf,
  verdictFor,
} from "@/lib/attendance";
import type { PlanData } from "@/lib/plan";
import { cn, STATUS_STYLES } from "@/lib/ui";

/**
 * The what-if.
 *
 * Everything recomputes in the browser from the same pure functions the server
 * uses — no round trip, because the whole value of this page is watching the
 * number move while you drag. `lib/attendance.ts` has no server dependencies
 * precisely so it can be imported on both sides rather than reimplemented here
 * and left to drift.
 */
export function Planner({ data }: { data: PlanData }) {
  /** Extra hours the student is considering missing, per course id. */
  const [missed, setMissed] = useState<Record<string, number>>({});

  const set = (courseId: string, hours: number) =>
    setMissed((current) => ({ ...current, [courseId]: Math.max(0, hours) }));

  const planned = Object.values(missed).reduce((sum, hours) => sum + hours, 0);

  /** Apply a whole day's classes on top of what's already planned. */
  const skipDay = (hoursByCourse: Record<string, number>) =>
    setMissed((current) => {
      const next = { ...current };
      for (const [courseId, hours] of Object.entries(hoursByCourse)) {
        next[courseId] = (next[courseId] ?? 0) + hours;
      }
      return next;
    });

  const rows = useMemo(
    () =>
      data.courses.map((course) => {
        const now = { totalHours: course.totalHours, attendedHours: course.attendedHours };
        const extra = missed[course.id] ?? 0;
        const projected = afterMissing(now, extra);

        return {
          course,
          extra,
          nowPercentage: percentageOf(now),
          verdict: verdictFor(projected),
          // The ceiling for the slider: how far past the threshold you could
          // go before the question stops being interesting.
          headroom: Math.max(4, verdictFor(now).canMissHours + 4),
        };
      }),
    [data.courses, missed]
  );

  const overallNow = totals(data.courses.map((c) => [c.totalHours, c.attendedHours]));
  const overallNext = totals(
    rows.map(({ course, extra }) => [course.totalHours + extra, course.attendedHours])
  );

  const overallStatus = statusOf(overallNext);
  const overallStyle = STATUS_STYLES[overallStatus];
  const delta = percentageOf(overallNext) - percentageOf(overallNow);

  return (
    <div>
      {/* ---- the projected number ---------------------------------------- */}
      <p className={cn("tnum mt-5 text-6xl font-semibold tracking-tighter sm:text-7xl", overallStyle.text)}>
        {percentageOf(overallNext).toFixed(1)}
        <span className="text-3xl text-text-faint sm:text-4xl">%</span>
      </p>

      <p className="mt-3 text-text-muted">
        {planned === 0 ? (
          <>where you stand now · threshold <span className="tnum">{DEFAULT_THRESHOLD}%</span></>
        ) : (
          <>
            after missing <span className="tnum">{planned}</span>{" "}
            {planned === 1 ? "hour" : "hours"} more
            <span className="mx-2 text-text-faint">·</span>
            <span className="tnum">{delta.toFixed(2)}</span> from{" "}
            <span className="tnum">{percentageOf(overallNow).toFixed(1)}%</span>
          </>
        )}
      </p>

      {/* ---- skip a whole day -------------------------------------------- */}
      {data.days.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xs font-medium tracking-[0.16em] text-text-faint uppercase">
            Skip a day
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.days.map((day) => (
              <button
                key={day.dayOrder}
                type="button"
                onClick={() => skipDay(day.hoursByCourse)}
                className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text"
              >
                Day {day.dayOrder}
                <span className="tnum ml-1.5 text-xs text-text-faint">
                  +{day.totalHours}h
                </span>
              </button>
            ))}
            {planned > 0 ? (
              <button
                type="button"
                onClick={() => setMissed({})}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-text-faint underline underline-offset-4 transition-colors hover:text-text"
              >
                Reset
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ---- per course --------------------------------------------------- */}
      <ul className="mt-10 divide-y divide-border border-t border-border">
        {rows.map(({ course, extra, verdict, nowPercentage, headroom }) => {
          const style = STATUS_STYLES[verdict.status];
          const changed = extra > 0;

          return (
            <li key={course.id} className="py-5">
              <div className="flex items-baseline gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{course.title}</p>
                  <p className="mt-0.5 font-mono text-xs text-text-faint">{course.code}</p>
                </div>

                <span className="shrink-0 text-right">
                  {changed ? (
                    <span className="tnum text-xs text-text-faint line-through">
                      {nowPercentage.toFixed(1)}%
                    </span>
                  ) : null}
                  <span className={cn("tnum ml-2 text-lg font-medium", style.text)}>
                    {verdict.percentage.toFixed(2)}%
                  </span>
                </span>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={headroom}
                  step={1}
                  value={extra}
                  onChange={(event) => set(course.id, Number(event.target.value))}
                  aria-label={`Hours to miss of ${course.title}`}
                  className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-sunk accent-[var(--accent)]"
                />

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => set(course.id, extra - 1)}
                    disabled={extra === 0}
                    aria-label={`Miss one hour less of ${course.title}`}
                    className="size-7 rounded-full border border-border text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
                  >
                    &minus;
                  </button>
                  <span className="tnum w-10 text-center text-sm">{extra}h</span>
                  <button
                    type="button"
                    onClick={() => set(course.id, extra + 1)}
                    aria-label={`Miss one hour more of ${course.title}`}
                    className="size-7 rounded-full border border-border text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text"
                  >
                    +
                  </button>
                </div>
              </div>

              <p className={cn("mt-2 text-sm", style.text)}>
                {verdict.status === "under"
                  ? Number.isFinite(verdict.mustAttendHours)
                    ? `Below ${DEFAULT_THRESHOLD}% — attend ${verdict.mustAttendHours} in a row to recover`
                    : `Below ${DEFAULT_THRESHOLD}% — cannot recover this semester`
                  : verdict.canMissHours === 0
                    ? "On the line — the next hour drops you below"
                    : `${verdict.canMissHours} more ${verdict.canMissHours === 1 ? "hour" : "hours"} of room after this`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Sum [total, attended] pairs into one input. */
function totals(pairs: Array<[number, number]>) {
  return pairs.reduce(
    (sum, [total, attended]) => ({
      totalHours: sum.totalHours + total,
      attendedHours: sum.attendedHours + attended,
    }),
    { totalHours: 0, attendedHours: 0 }
  );
}
