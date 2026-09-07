import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

import type { MarksData } from "@/lib/marks";
import { cn } from "@/lib/ui";

/**
 * Internal marks, shared by the demo and a signed-in account.
 *
 * No status colours here, deliberately. Green/amber/red mean attendance —
 * comfortable, on the line, below 75% — and a mark of 4.2/5 is not a warning
 * about anything. Spending those hues on a second meaning would make the one
 * urgent signal in the app ambiguous.
 */
export function MarksView({
  marks,
  basePath,
  badge,
}: {
  marks: MarksData;
  /** "/demo" or "" — prefixes onward links. */
  basePath: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-24">
      <header className="flex items-center justify-between py-8">
        <Link href={basePath || "/"} className="text-lg font-semibold tracking-tight">
          Studeo
        </Link>
        <div className="flex items-center gap-2">
          {badge}
          <ThemeToggle />
        </div>
      </header>

      <h1 className="pt-4 text-sm font-medium tracking-[0.16em] text-text-faint uppercase">
        Internal marks
      </h1>

      {marks.overall ? (
        <div className="mt-5">
          <p className="tnum text-6xl font-semibold tracking-tighter sm:text-7xl">
            {marks.overall.obtained}
            <span className="text-3xl text-text-faint sm:text-4xl">
              {" / "}
              {marks.overall.maxMarks}
            </span>
          </p>
          <p className="mt-3 text-text-muted">
            <span className="tnum">{marks.overall.percentage}%</span> across{" "}
            <span className="tnum">{marks.graded}</span>{" "}
            {marks.graded === 1 ? "course" : "courses"} marked so far
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-3xl font-semibold tracking-tight text-balance">
            Nothing marked yet.
          </p>
          <p className="mt-3 max-w-[46ch] text-text-muted">
            Internal marks appear here as your faculty enter them — usually a week or
            two after each test.
          </p>
        </div>
      )}

      {marks.courses.length > 0 ? (
        <ul className="mt-12 divide-y divide-border border-t border-border">
          {marks.courses.map((course) => (
            <li key={course.id} className="py-5">
              <div className="flex items-baseline gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{course.title}</p>
                  <p className="mt-0.5 font-mono text-xs text-text-faint">
                    {course.code}
                  </p>
                </div>

                <span className="tnum shrink-0 text-right">
                  {course.obtained === null ? (
                    <span className="text-sm text-text-faint">not marked</span>
                  ) : (
                    <>
                      <span className="text-lg font-medium">{course.obtained}</span>
                      <span className="text-sm text-text-faint">
                        {" / "}
                        {course.maxMarks}
                      </span>
                    </>
                  )}
                </span>
              </div>

              {course.components.length > 0 ? (
                <ul className="mt-3 space-y-1.5 pl-0">
                  {course.components.map((component) => (
                    <li
                      key={component.id}
                      className="flex items-baseline gap-3 text-sm"
                    >
                      <span className="w-16 shrink-0 text-text-muted">
                        {component.testCode}
                      </span>

                      {/* A proportion bar rather than a number alone: five
                          components at different maximums are hard to compare
                          as raw pairs, and the eye reads length instantly. */}
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunk">
                        <span
                          className={cn(
                            "block h-full rounded-full bg-text/70",
                            component.obtained === null && "bg-transparent"
                          )}
                          style={{
                            width:
                              component.obtained === null || component.maxMarks === 0
                                ? "0%"
                                : `${Math.min(100, (component.obtained / component.maxMarks) * 100)}%`,
                          }}
                        />
                      </span>

                      <span className="tnum shrink-0 text-xs text-text-muted">
                        {component.obtained === null
                          ? "—"
                          : `${component.obtained} / ${component.maxMarks}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : course.totalOnly ? (
                <p className="mt-2 text-xs text-text-faint">
                  Course total only — open this course on the portal once to pull the
                  component breakdown.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        // The demo's dashboard is /demo; a signed-in one is /dashboard.
        href={basePath || "/dashboard"}
        className="mt-12 inline-block text-sm text-text-muted underline underline-offset-4 hover:text-text"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
