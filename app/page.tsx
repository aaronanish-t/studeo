import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6">
      <header className="flex items-center justify-between py-8">
        <span className="text-lg font-semibold tracking-tight">Studeo</span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
        {/* The headline is the insight, not the category. Everyone building one
            of these leads with "your academic portal, but faster"; the actual
            reason a student opens it is the question below. */}
        <h1 className="max-w-[16ch] text-5xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-6xl">
          How many classes can you actually miss?
        </h1>

        <p className="mt-6 max-w-[46ch] text-lg text-text-muted">
          Studeo reads your attendance, marks and timetable from SRM and answers
          the question the portal never does — in hours, per course, before you
          decide to skip.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/preview"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            See it working
          </Link>
          <span className="text-sm text-text-faint">No sign-in needed</span>
        </div>

        <dl className="mt-16 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-border pt-8 sm:grid-cols-3">
          {[
            { term: "Attendance", detail: "Per course, in hours, with the margin" },
            { term: "Free hours", detail: "When your whole group is actually free" },
            { term: "Marks", detail: "Every component as it's entered" },
          ].map((item) => (
            <div key={item.term}>
              <dt className="text-sm font-medium">{item.term}</dt>
              <dd className="mt-1 text-sm text-text-muted">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="border-t border-border py-6 text-xs text-text-faint">
        Independent project. Not affiliated with, endorsed by, or connected to SRM
        Institute of Science and Technology.
      </footer>
    </div>
  );
}
