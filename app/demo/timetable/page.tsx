import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDuration } from "@/lib/freehour";
import { getTimetableDay } from "@/lib/timetable";
import { getAcademicDay } from "@/lib/today";
import { cn, formatClock } from "@/lib/ui";

export const metadata = { title: "Timetable" };
export const dynamic = "force-dynamic";

const DEMO_NET_ID = "demo01";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const today = await getAcademicDay();

  // Default to today's day order, falling back to Day 1 on a holiday — a
  // holiday has no day order at all, and an empty screen would look broken.
  const requested = Number(params.day);
  const dayOrder =
    requested >= 1 && requested <= 5 ? requested : (today.dayOrder ?? 1);

  const day = await getTimetableDay(DEMO_NET_ID, dayOrder);
  if (!day) notFound();

  const isToday = today.dayOrder === dayOrder;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-24">
      <header className="flex items-center justify-between py-8">
        <Link href="/demo" className="text-lg font-semibold tracking-tight">
          Studeo
        </Link>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
          Demo data
        </span>
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
            href={`/demo/timetable?day=${value}`}
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
        {day.blocks.length === 0 ? (
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
        href={`/demo/free?day=${dayOrder}`}
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
    </div>
  );
}
