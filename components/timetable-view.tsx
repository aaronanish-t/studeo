import Link from "next/link";

import { NavMenu } from "@/components/nav-menu";
import { ThemeToggle } from "@/components/theme-toggle";

import { formatDuration } from "@/lib/freehour";
import type { TimetableDay } from "@/lib/timetable";
import type { AcademicToday } from "@/lib/today";
import { cn, formatClock } from "@/lib/ui";

/**
 * A student's day, shared by the preview and a signed-in account.
 *
 * One row per teaching period, deliberately unmerged — a lab in P9 and P10
 * shows as two rows, which reads straight against the timetable a student
 * already knows and keeps the row count equal to the hour count SRM measures
 * attendance in.
 */
export function TimetableView({
  day,
  dayOrder,
  today,
  basePath,
  badge,
  footnote,
}: {
  day: TimetableDay;
  dayOrder: number;
  today: AcademicToday;
  /** "/preview" or "" — prefixes every onward link. */
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
  const isToday = today.dayOrder === dayOrder;

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
        Timetable
      </h1>

      <p className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
        Day {dayOrder}
        {isToday ? <span className="ml-3 text-text-faint">· today</span> : null}
      </p>

      <p className="mt-3 text-text-muted">
        {day.classCount === 0 ? (
          "Nothing timetabled."
        ) : (
          <>
            <span className="tnum">{day.classCount}</span>{" "}
            {day.classCount === 1 ? "class" : "classes"}
            <span className="mx-2 text-text-faint">·</span>
            <span className="tnum">{formatDuration(day.teachingMin)}</span>
            {day.firstStartMin !== null && day.lastEndMin !== null ? (
              <>
                <span className="mx-2 text-text-faint">·</span>
                <span className="tnum">
                  {formatClock(day.firstStartMin)}–{formatClock(day.lastEndMin)}
                </span>
              </>
            ) : null}
          </>
        )}
      </p>

      {/* ---- day order switcher ----------------------------------------- */}
      <nav
        className="-mx-6 mt-8 flex w-[calc(100%+3rem)] gap-1.5 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Day order"
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <Link
            key={value}
            href={`${basePath}/timetable?day=${value}`}
            aria-current={value === dayOrder ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3.5",
              value === dayOrder
                ? "border-accent bg-accent text-accent-fg"
                : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text"
            )}
          >
            Day {value}
            {today.dayOrder === value ? (
              <span className="ml-1.5 text-[10px] opacity-60">today</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {/* ---- the day ------------------------------------------------------ */}
      <section className="mt-10">
        {!day.batchSupported ? (
          // Deliberately not "no classes". We don't hold this student's batch
          // grid, so we don't know when their classes are — and saying "no
          // classes" would be a confident wrong answer rather than an honest
          // absent one.
          <div className="rounded-xl border border-edge/30 bg-edge-soft px-4 py-5">
            <p className="text-sm font-medium text-edge">
              We couldn&rsquo;t work out which batch you&rsquo;re in.
            </p>
            <p className="mt-1.5 max-w-[54ch] text-sm text-edge">
              Batch 1 and Batch 2 run the same hours in a different order, so the same
              slot is a morning class for one and an afternoon class for the other.
              Without knowing yours we&rsquo;d be guessing, and a guess here looks exactly
              like an answer. Sync again with the Student Portal open — your batch is on
              your profile page. Attendance and marks are unaffected.
            </p>
          </div>
        ) : day.blocks.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
            No classes on Day {dayOrder}.
          </p>
        ) : (
          <ol className="space-y-px">
            {day.blocks.map((block) =>
              block.kind === "gap" ? (
                <li
                  key={`gap-${block.startMin}`}
                  className="flex items-center gap-4 py-3"
                >
                  {/* Empty gutter, not a time: a gap starts exactly when the
                      class above ends, and printing it again puts the same
                      timestamp twice in consecutive rows. The spacer keeps the
                      rule aligned with the class rows' text column. */}
                  <span aria-hidden className="w-20 shrink-0" />
                  <span className="flex flex-1 items-center gap-3 text-xs text-text-faint">
                    <span className="h-px flex-1 bg-border" />
                    <span className="tnum whitespace-nowrap">
                      free · {formatDuration(block.durationMin)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </span>
                </li>
              ) : (
                <li
                  key={`class-${block.startMin}`}
                  className="flex items-start gap-4 rounded-lg py-3"
                >
                  <span className="tnum w-20 shrink-0 pt-0.5 text-sm font-medium">
                    {formatClock(block.startMin)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{block.courseTitle}</p>
                    <p className="mt-0.5 text-xs text-text-faint">
                      {block.courseCode ? (
                        <span className="font-mono">{block.courseCode}</span>
                      ) : null}
                      {block.room ? (
                        <>
                          <span className="mx-1.5">·</span>
                          {block.room}
                        </>
                      ) : null}
                      <span className="mx-1.5">·</span>
                      {block.slotCode}
                    </p>
                  </div>

                  <span className="tnum shrink-0 pt-0.5 text-xs text-text-faint">
                    {formatClock(block.endMin)}
                  </span>
                </li>
              )
            )}
          </ol>
        )}
      </section>

      <Link
        href={`${basePath}/free?day=${dayOrder}`}
        className="mt-10 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-border-strong"
      >
        <span>
          <span className="block text-sm font-medium">
            When is everyone free on Day {dayOrder}?
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            The same day, across your friends&rsquo; timetables
          </span>
        </span>
        <span aria-hidden className="text-text-faint">
          &rarr;
        </span>
      </Link>

      {footnote ? (
        <p className="mt-6 text-xs text-text-faint">{footnote}</p>
      ) : null}
    </div>
  );
}
