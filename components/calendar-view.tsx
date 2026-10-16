import Link from "next/link";

import { NavMenu } from "@/components/nav-menu";
import { ThemeToggle } from "@/components/theme-toggle";

import { daysUntil, type CalendarData, type CalendarDay } from "@/lib/calendar";
import { cn, formatLongDate } from "@/lib/ui";

/**
 * The academic calendar, shared by the preview and a signed-in account.
 *
 * The cell shows the DAY ORDER, not the date, because the date is already its
 * position in the grid and the day order is the thing you came to look up. A
 * holiday shows no day order at all — which is the honest rendering, since the
 * cycle pauses rather than advancing, and printing one would invent a class.
 */
export function CalendarView({
  data,
  basePath,
  badge,
  footnote,
}: {
  data: CalendarData;
  /** "/preview" or "" — prefixes every onward link. */
  basePath: string;
  badge?: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  const { nextHoliday, counts, range } = data;

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
        Calendar
      </h1>

      {range === null ? (
        <>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-balance">
            No calendar synced yet.
          </p>
          <p className="mt-3 max-w-[48ch] text-text-muted">
            The day-order calendar is campus-wide, so one sync covers everybody — it
            just hasn&rsquo;t happened yet.
          </p>
        </>
      ) : (
        <>
          {/* ---- the one question worth a headline ---------------------- */}
          {nextHoliday ? (
            <div className="mt-5">
              <p className="text-4xl font-semibold tracking-tight sm:text-5xl">
                {describeGap(daysUntil(data.today, nextHoliday.date))}
              </p>
              <p className="mt-3 text-text-muted">
                {nextHoliday.label ?? "Classes suspended"}
                <span className="mx-2 text-text-faint">·</span>
                {formatLongDate(nextHoliday.date)}
              </p>
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-3xl font-semibold tracking-tight text-balance">
                No more holidays this term.
              </p>
              <p className="mt-3 max-w-[46ch] text-text-muted">
                Nothing left that falls on a teaching day, anyway — the weekends are
                still there.
              </p>
            </div>
          )}

          <p className="mt-6 text-sm text-text-muted">
            <span className="tnum">{counts.working}</span> working days
            <span className="mx-2 text-text-faint">·</span>
            <span className="tnum">{counts.holidays}</span> holidays on teaching days
            <span className="mx-2 text-text-faint">·</span>
            {formatLongDate(range.from)} to {formatLongDate(range.to)}
          </p>

          {/* ---- the grids ----------------------------------------------- */}
          <div className="mt-10 space-y-10">
            {data.months.map((month) => (
              <section key={month.start.toISOString()}>
                <h2 className="text-xs font-medium tracking-[0.16em] text-text-faint uppercase">
                  {month.label}
                </h2>

                <div
                  className="mt-3 grid grid-cols-7 gap-1"
                  role="grid"
                  aria-label={month.label}
                >
                  {["S", "M", "T", "W", "T", "F", "S"].map((initial, index) => (
                    <div
                      key={index}
                      aria-hidden
                      className="pb-1 text-center text-[10px] font-medium tracking-wider text-text-faint uppercase"
                    >
                      {initial}
                    </div>
                  ))}

                  {Array.from({ length: month.leadingBlanks }, (_, index) => (
                    <div key={`blank-${index}`} aria-hidden />
                  ))}

                  {month.days.map((day) => (
                    <Cell
                      key={day.date.toISOString()}
                      day={day}
                      isToday={day.date.getTime() === data.today.getTime()}
                      basePath={basePath}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex size-5 items-center justify-center rounded border border-border bg-surface text-[10px] font-medium">
                3
              </span>
              day order
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex size-5 items-center justify-center rounded bg-surface-sunk text-[10px] text-text-faint">
                &mdash;
              </span>
              suspended
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex size-5 items-center justify-center rounded bg-accent text-[10px] font-medium text-accent-fg">
                3
              </span>
              today
            </span>
          </div>

          <p className="mt-8 max-w-[60ch] text-xs text-text-faint">
            A holiday pauses the cycle rather than advancing it — if Day 5 falls on a
            suspended Monday, Tuesday is still Day 5. That is why a date has to be
            looked up here rather than counted from the weekday.
          </p>
        </>
      )}

      {footnote ? <p className="mt-6 text-xs text-text-faint">{footnote}</p> : null}
    </div>
  );
}

function Cell({
  day,
  isToday,
  basePath,
}: {
  day: CalendarDay;
  isToday: boolean;
  basePath: string;
}) {
  const date = day.date.getUTCDate();

  if (day.isOutsideTerm) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center rounded text-[11px] text-text-faint/40">
        {date}
      </div>
    );
  }

  const body = (
    <>
      <span className={cn("text-[10px] leading-none", isToday ? "opacity-70" : "text-text-faint")}>
        {date}
      </span>
      <span className="tnum mt-0.5 text-sm leading-none font-medium">
        {day.dayOrder ?? <span className="text-text-faint">&mdash;</span>}
      </span>
    </>
  );

  const className = cn(
    "flex aspect-square flex-col items-center justify-center rounded border transition-colors",
    isToday
      ? "border-accent bg-accent text-accent-fg"
      : day.isHoliday
        ? "border-transparent bg-surface-sunk"
        : "border-border bg-surface hover:border-border-strong"
  );

  // Only a day with a day order leads anywhere — a suspended day has no
  // timetable to show, and a link that returns nothing is worse than no link.
  if (day.dayOrder === null) {
    return (
      <div className={className} title={day.label ?? undefined}>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`${basePath}/timetable?day=${day.dayOrder}`}
      className={className}
      title={day.label ?? `Day ${day.dayOrder}`}
    >
      {body}
    </Link>
  );
}

/** "Tomorrow" beats "in 1 day"; "Today" beats both. */
function describeGap(days: number): string {
  if (days <= 0) return "Today is a holiday.";
  if (days === 1) return "Tomorrow is a holiday.";
  if (days < 14) return `${days} days until the next holiday.`;

  // Past a fortnight the exact count stops being something anyone holds in
  // their head, and "about three weeks" is the answer they'd give anyway.
  const weeks = Math.round(days / 7);
  return `About ${weeks} weeks until the next holiday.`;
}
