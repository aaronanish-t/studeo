import Link from "next/link";

import { NavMenu } from "@/components/nav-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import type { DashboardData } from "@/lib/dashboard";
import { DEFAULT_THRESHOLD } from "@/lib/attendance";
import { cn, STATUS_STYLES } from "@/lib/ui";

/**
 * Attendance in full, shared by the preview and a signed-in account.
 *
 * The dashboard answers "am I in trouble" in one number. This page answers
 * "where exactly, and what do I do about it" — every course, its hours, and the
 * margin, with the ones that need action at the top.
 */
export function AttendanceView({
  data,
  basePath,
  badge,
  footnote,
}: {
  data: DashboardData;
  basePath: string;
  badge?: React.ReactNode;
  /**
   * A quiet line at the very bottom. The preview uses it to say the data is
   * invented — in the footer rather than as a header badge, so the page reads
   * as a finished product while nobody can mistake a seeded student's
   * attendance for a real person's record.
   */
  footnote?: React.ReactNode;
}) {
  const overall = data.overall;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-24">
      <header className="flex items-center justify-between gap-3 py-8">
        <Link href={basePath || "/"} className="text-lg font-semibold tracking-tight">
          Studeo
        </Link>
        <div className="flex items-center gap-2">
          {badge}
          <NavMenu basePath={basePath} />
          <ThemeToggle />
        </div>
      </header>

      <h1 className="pt-4 text-sm font-medium tracking-[0.16em] text-text-faint uppercase">
        Attendance
      </h1>

      <p className="tnum mt-5 text-6xl font-semibold tracking-tighter sm:text-7xl">
        {overall.percentage.toFixed(1)}
        <span className="text-3xl text-text-faint sm:text-4xl">%</span>
      </p>
      <p className="mt-3 text-text-muted">
        <span className="tnum">
          {overall.attendedHours} of {overall.totalHours} hours
        </span>{" "}
        · threshold <span className="tnum">{DEFAULT_THRESHOLD}%</span>
      </p>

      {data.courses.length === 0 ? (
        <p className="mt-10 rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
          No attendance recorded yet.
        </p>
      ) : (
        <ul className="mt-12 divide-y divide-border border-t border-border">
          {data.courses.map((course) => {
            const style = STATUS_STYLES[course.verdict.status];
            const { verdict } = course;

            // A bar per course, filled to the actual percentage, with the 75%
            // line drawn across it. The threshold is the whole point of this
            // page, and a number alone makes you do the comparison yourself.
            const filled = Math.min(100, verdict.percentage);

            return (
              <li key={course.id} className="py-5">
                <div className="flex items-baseline gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{course.title}</p>
                    <p className="mt-0.5 font-mono text-xs text-text-faint">
                      {course.code}
                    </p>
                  </div>

                  <span className={cn("tnum shrink-0 text-lg font-medium", style.text)}>
                    {verdict.percentage.toFixed(2)}%
                  </span>
                </div>

                <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
                  <span
                    className={cn("absolute inset-y-0 left-0 rounded-full", style.dot)}
                    style={{ width: `${filled}%` }}
                  />
                  {/* The 75% line, drawn over the fill so it stays visible
                      whether you're above it or below. */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-text/40"
                    style={{ left: `${DEFAULT_THRESHOLD}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className={cn("text-sm", style.text)}>{course.summary}</p>
                  <p className="tnum text-xs text-text-faint">
                    {verdict.attendedHours} attended · {verdict.absentHours} missed ·{" "}
                    {verdict.totalHours} held
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-10 text-xs text-text-faint">
        Attendance is counted in hours, not classes — a lab is two or three. On-duty
        hours count as attended.
      </p>
      {footnote ? (
        <p className="mt-6 text-xs text-text-faint">{footnote}</p>
      ) : null}
    </div>
  );
}
