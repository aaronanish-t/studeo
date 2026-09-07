import Link from "next/link";

import { NavMenu } from "@/components/nav-menu";
import { ThemeToggle } from "@/components/theme-toggle";

import { formatDuration } from "@/lib/freehour";
import type { GroupDay } from "@/lib/group";
import { HOUR_TIMES } from "@/lib/sources/slot-grid";
import { cn, formatClock, formatClockCompact } from "@/lib/ui";

/**
 * Ticks sit on TEACHING-HOUR boundaries, not clock hours.
 *
 * SRM's periods are 50 minutes with staggered breaks — 8:00, 8:50, 9:45,
 * 10:40, 11:35 — so a clock-hour axis puts "10" a full 40 minutes from where
 * the 10:40 class actually starts, and every block floats between gridlines
 * instead of sitting on them.
 *
 * BOTH ends of every period are included. Periods don't butt up against each
 * other — there's a five-minute break — so ticking only the starts leaves the
 * right-hand edge of most blocks hanging in open space.
 */
function ticksFor(endMin: number): number[] {
  return Array.from(new Set(HOUR_TIMES.flatMap((hour) => [hour.startMin, hour.endMin])))
    .filter((min) => min <= endMin)
    .sort((a, b) => a - b);
}

/**
 * Period times, grouped into stacked pairs — one column per pair.
 *
 * Labels mark period starts, not every tick: 9:40 and 9:45 are three pixels
 * apart at this scale and would print on top of one another. Columns of two
 * give each label roughly double the room, so all of them fit.
 *
 * The trade: the lower time in a column sits above its partner's gridline
 * rather than its own. The gridlines remain the truth for position, and the
 * labels read as a legend for the column.
 */
function labelColumnsFor(endMin: number): number[][] {
  const labels = [
    ...HOUR_TIMES.map((hour) => hour.startMin),
    HOUR_TIMES[HOUR_TIMES.length - 1].endMin,
  ].filter((min) => min <= endMin);

  // Always finish on the window's own edge, so the axis is closed.
  if (labels[labels.length - 1] !== endMin) labels.push(endMin);

  return Array.from({ length: Math.ceil(labels.length / 2) }, (_, index) =>
    labels.slice(index * 2, index * 2 + 2)
  );
}

/** Position on the shared time axis, as a percentage. */
function track(min: number, window: GroupDay["window"]): number {
  const span = window.endMin - window.startMin;
  return ((min - window.startMin) / span) * 100;
}

/**
 * The group free-hour view, shared by the demo and a signed-in account.
 *
 * The answer is legible as alignment — the point where every row falls quiet at
 * once — rather than as something you read off a list.
 */
export function FreeHoursView({
  group,
  dayOrder,
  basePath,
  badge,
}: {
  group: GroupDay;
  dayOrder: number;
  /** "/demo" or "" — prefixes every onward link. */
  basePath: string;
  badge?: React.ReactNode;
}) {
  const { window } = group;
  const best = group.common[0] ?? null;
  const ticks = ticksFor(window.endMin);
  const labelColumns = labelColumnsFor(window.endMin);

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
        Free together
      </h1>

      {/* ---- the answer ------------------------------------------------- */}
      {best ? (
        <div className="mt-5">
          <p className="tnum text-5xl font-semibold tracking-tighter sm:text-6xl">
            {formatClock(best.startMin)}
            <span className="mx-2 text-text-faint">–</span>
            {formatClock(best.endMin)}
          </p>
          <p className="mt-3 text-text-muted">
            all {group.members.length} of you, {formatDuration(best.durationMin)}
            {group.common.length > 1 ? (
              <>
                {" "}
                · plus {group.common.length - 1} more window
                {group.common.length > 2 ? "s" : ""}
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-3xl font-semibold tracking-tight text-balance">
            No window works for everyone.
          </p>
          <p className="mt-3 text-text-muted">
            {group.nearMisses.length > 0
              ? "The closest options are below — each is missing one person."
              : "Try another day order."}
          </p>
        </div>
      )}

      {/* ---- day order switcher ----------------------------------------- */}
      {/* Five pills don't fit on a narrow phone. They scroll in their own
          track — bleeding to the screen edges so the row reads as scrollable —
          rather than making the whole page scroll sideways. */}
      <nav
        className="-mx-6 mt-8 flex w-[calc(100%+3rem)] gap-1.5 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Day order"
      >
        {[1, 2, 3, 4, 5].map((day) => (
          <Link
            key={day}
            href={`${basePath}/free?day=${day}`}
            aria-current={day === dayOrder ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3.5",
              day === dayOrder
                ? "border-accent bg-accent text-accent-fg"
                : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text"
            )}
          >
            Day {day}
          </Link>
        ))}
      </nav>

      {/* ---- the strips -------------------------------------------------- */}
      <section className="mt-10">
        {/* Shared axis: period times stacked two per column. */}
        <div className="tnum relative mb-2 ml-24 h-9 text-[10px] leading-[1.35] text-text-faint">
          {labelColumns.map((column, index) => {
            const isFirst = index === 0;
            const isLast = index === labelColumns.length - 1;

            return (
              <span
                key={column[0]}
                className={cn(
                  "absolute top-0 flex flex-col whitespace-nowrap",
                  // Pin the outer columns to the track edges so they aren't clipped.
                  isFirst
                    ? "translate-x-0 items-start"
                    : isLast
                      ? "-translate-x-full items-end"
                      : "-translate-x-1/2 items-center"
                )}
                style={{ left: `${track(column[0], window)}%` }}
              >
                {column.map((min) => (
                  <span key={min}>{formatClockCompact(min)}</span>
                ))}
              </span>
            );
          })}
        </div>

        <div className="relative">
          <ul className="space-y-1.5">
            {group.members.map((member, index) => (
              <li key={member.id} className="flex items-center gap-3">
                <span
                  className={cn(
                    "shrink-0 truncate text-xs",
                    index === 0 ? "font-medium text-text" : "text-text-muted"
                  )}
                  // 5.25rem + the 0.75rem flex gap = the 6rem (ml-24) the axis
                  // is offset by, so the two layers line up exactly.
                  style={{ width: "5.25rem" }}
                >
                  {index === 0 ? "You" : member.name.split(" ")[0]}
                </span>

                <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-surface-sunk">
                  {/* Period boundaries, drawn before the blocks so a class
                      covers the lines it spans. Every block starts and ends
                      exactly on a gridline, which is the point. */}
                  {ticks.map((min) => (
                    <span
                      key={min}
                      aria-hidden
                      className="absolute inset-y-0 w-px bg-border"
                      style={{ left: `${track(min, window)}%` }}
                    />
                  ))}

                  {member.classes.map((cls) => (
                    <div
                      key={`${cls.startMin}-${cls.label}`}
                      title={`${cls.label}${cls.room ? ` · ${cls.room}` : ""} · ${formatClock(cls.startMin)}–${formatClock(cls.endMin)}`}
                      className="absolute inset-y-0 rounded-[5px] bg-text/85"
                      style={{
                        left: `${track(cls.startMin, window)}%`,
                        width: `${track(cls.endMin, window) - track(cls.startMin, window)}%`,
                      }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- near misses -------------------------------------------------- */}
      {group.nearMisses.length > 0 ? (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-xs font-medium tracking-[0.16em] text-text-faint uppercase">
            Almost everyone
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            With several timetables a perfect overlap is rare, so these are usually the
            windows you actually use.
          </p>

          <ul className="mt-5 divide-y divide-border">
            {group.nearMisses.map((gap) => (
              <li
                key={`${gap.startMin}-${gap.endMin}`}
                className="flex items-baseline gap-4 py-3"
              >
                <span className="tnum shrink-0 text-sm font-medium">
                  {formatClock(gap.startMin)}–{formatClock(gap.endMin)}
                </span>
                <span className="flex-1 text-sm text-text-muted">
                  everyone except{" "}
                  <span className="text-text">
                    {gap.blockedBy.map((person) => person.name.split(" ")[0]).join(", ")}
                  </span>
                </span>
                <span className="tnum shrink-0 text-xs text-text-faint">
                  {formatDuration(gap.durationMin)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-12 text-xs text-text-faint">
        Schedules are only visible between students who have accepted each other.
      </p>
    </div>
  );
}
