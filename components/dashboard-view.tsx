import Link from "next/link";

import { NavMenu } from "@/components/nav-menu";
import { ThemeToggle } from "@/components/theme-toggle";

import type { DashboardData } from "@/lib/dashboard";
import { cn, formatClock, formatLongDate, relativeTo, STATUS_STYLES } from "@/lib/ui";

/**
 * The dashboard, shared by the public demo and a signed-in student.
 *
 * The two differ only in where their data comes from and where their links
 * point. Keeping one component means the demo can't quietly drift from the real
 * thing — which matters more here than usual, because the demo is what most
 * people will ever see.
 */
export function DashboardView({
  data,
  nowMin,
  basePath,
  badge,
}: {
  data: DashboardData;
  /** Minutes since midnight, IST — passed in so the page controls the clock. */
  nowMin: number;
  /** "/demo" or "" — prefixes the onward links. */
  basePath: string;
  badge?: React.ReactNode;
}) {
  const nextClass = data.schedule.find((slot) => slot.endMin > nowMin) ?? null;
  const later = data.schedule.filter(
    (slot) => nextClass && slot.startMin > nextClass.startMin
  );
  const dayOrder = data.today.dayOrder ?? 1;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-24">
      <header className="flex items-center justify-between gap-3 py-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Studeo
        </Link>
        <div className="flex items-center gap-2">
          {badge}
          <NavMenu basePath={basePath} />
          <ThemeToggle />
        </div>
      </header>

      {/* ---- the one number ------------------------------------------- */}
      <section className="pt-6">
        <p className="text-sm text-text-muted">
          {data.today.dayOrder !== null ? (
            <>
              <span className="font-medium text-text">Day {data.today.dayOrder}</span>
              <span className="mx-2 text-text-faint">·</span>
            </>
          ) : null}
          {formatLongDate(data.today.date)}
          {data.today.isHoliday && data.today.label ? (
            <>
              <span className="mx-2 text-text-faint">·</span>
              {data.today.label}
            </>
          ) : null}
        </p>

        <p className="tnum mt-8 text-7xl font-semibold tracking-tighter sm:text-8xl">
          {data.overall.percentage.toFixed(1)}
          <span className="text-4xl text-text-faint sm:text-5xl">%</span>
        </p>
        <p className="mt-3 text-text-muted">
          overall attendance ·{" "}
          <span className="tnum">
            {data.overall.attendedHours} of {data.overall.totalHours} hours
          </span>
        </p>
      </section>

      {/* ---- what needs attention -------------------------------------- */}
      {data.courses.length === 0 ? (
        <p className="mt-10 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          No attendance yet. Run a sync from the extension to pull it in.
        </p>
      ) : data.atRisk.length > 0 ? (
        <section className="mt-10 space-y-2">
          {data.atRisk.map((course) => {
            const style = STATUS_STYLES[course.verdict.status];
            return (
              <div
                key={course.id}
                className={cn(
                  "flex items-baseline gap-3 rounded-xl border px-4 py-3",
                  style.bg,
                  style.border
                )}
              >
                <span className={cn("tnum text-sm font-semibold", style.text)}>
                  {course.verdict.percentage.toFixed(2)}%
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{course.title}</p>
                  <p className={cn("text-xs", style.text)}>{course.summary}</p>
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <p className="mt-10 rounded-xl border border-safe/25 bg-safe-soft px-4 py-3 text-sm text-safe">
          Every course is comfortably above 75%.
        </p>
      )}

      {/* ---- next class ------------------------------------------------ */}
      <section className="mt-12">
        <h2 className="text-xs font-medium tracking-[0.16em] text-text-faint uppercase">
          Next
        </h2>

        {nextClass ? (
          <div className="mt-4 flex items-baseline gap-4">
            <span className="tnum text-2xl font-medium">
              {formatClock(nextClass.startMin)}
            </span>
            <div className="min-w-0">
              <p className="font-medium">
                {nextClass.courseTitle ?? `Slot ${nextClass.slotCode}`}
              </p>
              <p className="text-sm text-text-muted">
                {nextClass.room ? `${nextClass.room} · ` : ""}
                {relativeTo(nextClass.startMin - nowMin)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-text-muted">
            {data.today.isHoliday
              ? "Holiday — nothing scheduled."
              : "Nothing left today."}
          </p>
        )}

        {later.length > 0 ? (
          <ul className="mt-6 space-y-2 border-t border-border pt-4">
            {later.map((slot) => (
              <li
                key={`${slot.slotCode}-${slot.startMin}`}
                className="flex items-baseline gap-4 text-sm"
              >
                <span className="tnum w-20 shrink-0 text-text-faint">
                  {formatClock(slot.startMin)}
                </span>
                <span className="min-w-0 flex-1 truncate text-text-muted">
                  {slot.courseTitle ?? `Slot ${slot.slotCode}`}
                </span>
                {slot.room ? (
                  <span className="shrink-0 text-xs text-text-faint">{slot.room}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ---- onward ------------------------------------------------------ */}
      <nav className="mt-12 grid gap-2 sm:grid-cols-2">
        {[
          {
            href: `${basePath}/timetable?day=${dayOrder}`,
            title: "Your timetable",
            detail: "The whole day, gaps included",
          },
          {
            href: `${basePath}/free?day=${dayOrder}`,
            title: "When is everyone free?",
            detail: "Your day against your friends’",
          },
          {
            href: `${basePath}/marks`,
            title: "Internal marks",
            detail: "Every component, as it lands",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-border-strong"
          >
            <span>
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="mt-0.5 block text-xs text-text-muted">{item.detail}</span>
            </span>
            <span aria-hidden className="text-text-faint">
              &rarr;
            </span>
          </Link>
        ))}
      </nav>

      {/* ---- everything else, below the fold on purpose ---------------- */}
      {data.courses.length > 0 ? (
        <section className="mt-16 border-t border-border pt-8">
          <h2 className="text-xs font-medium tracking-[0.16em] text-text-faint uppercase">
            All courses
          </h2>

          <ul className="mt-4 divide-y divide-border">
            {data.courses.map((course) => {
              const style = STATUS_STYLES[course.verdict.status];
              return (
                <li key={course.id} className="flex items-center gap-4 py-3.5">
                  <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{course.title}</p>
                    <p className="mt-0.5 text-xs text-text-faint">
                      <span className="font-mono">{course.code}</span>
                      <span className="mx-1.5">·</span>
                      {course.summary}
                    </p>
                  </div>

                  <span className="tnum shrink-0 text-sm font-medium">
                    {course.verdict.percentage.toFixed(2)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
