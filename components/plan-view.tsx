import Link from "next/link";

import { Planner } from "@/app/plan/planner";
import { NavMenu } from "@/components/nav-menu";
import { ThemeToggle } from "@/components/theme-toggle";

import type { PlanData } from "@/lib/plan";

/**
 * The bunk planner, shared by the preview and a signed-in account.
 *
 * Deliberately a separate page from Attendance rather than sliders bolted onto
 * it. Attendance is a record and should read as one — a page you can trust at a
 * glance. This is a sandbox, and mixing the two would leave a student unsure
 * which number is their actual standing.
 */
export function PlanView({
  data,
  basePath,
  badge,
  footnote,
}: {
  data: PlanData;
  /** "/preview" or "" — prefixes every onward link. */
  basePath: string;
  badge?: React.ReactNode;
  footnote?: React.ReactNode;
}) {
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
        Plan
      </h1>

      {data.courses.length === 0 ? (
        <>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-balance">
            Nothing to plan against yet.
          </p>
          <p className="mt-3 max-w-[48ch] text-text-muted">
            This works out what skipping would cost you, which needs your attendance
            first. Run a sync and it&rsquo;ll fill in.
          </p>
          <Link
            href="/connect"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Set up syncing
            <span aria-hidden>&rarr;</span>
          </Link>
        </>
      ) : (
        <Planner data={data} />
      )}

      <p className="mt-10 max-w-[60ch] text-xs text-text-faint">
        Nothing here is saved or sent anywhere — it&rsquo;s arithmetic on the numbers
        already on your attendance page. Missing an hour still counts as an hour
        held, which is why attendance falls faster than it feels like it should.
      </p>

      {footnote ? <p className="mt-6 text-xs text-text-faint">{footnote}</p> : null}
    </div>
  );
}
