"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Attendance jokes, because every SRM student has the same anxiety and a 404
 * is a free opportunity to be on their side about it.
 *
 * The list is deliberately domain-specific — "page not found" is the same on
 * every website, "this page has 0% attendance" only works on ours.
 */
const EXCUSES = [
  "This page has 0% attendance.",
  "This page didn't make it to class.",
  "Marked absent. No OD submitted.",
  "Detained — this page never hit 75%.",
  "There's no day order for this page.",
  "This page dropped the course.",
  "Not on the timetable. Not in any slot.",
  "This page is on OD and hasn't come back.",
  "Bunked. Again.",
  "Faculty advisor has been informed.",
] as const;

/** Tiny stable string hash — djb2-ish, enough to spread ten buckets. */
function hash(value: string): number {
  let h = 0;
  for (let index = 0; index < value.length; index++) {
    h = (h * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(h);
}

export default function NotFound() {
  const pathname = usePathname();

  // Derived from the URL rather than picked at random.
  //
  // Random would need either a setState-in-effect (cascading renders, and the
  // linter is right to object) or a hydration mismatch, since the server and
  // the client would roll different numbers. Hashing the path is deterministic,
  // so server and client agree, and it still varies the joke across different
  // wrong URLs — while giving the same one back if you reload, which reads as
  // deliberate rather than glitchy.
  const excuse = EXCUSES[hash(pathname ?? "") % EXCUSES.length];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="tnum font-mono text-sm tracking-[0.2em] text-text-faint uppercase">
        Error 404
      </p>

      <h1 className="mt-6 max-w-[18ch] text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
        {excuse}
      </h1>

      <p className="mt-5 max-w-[42ch] text-text-muted">
        The page you were after doesn&rsquo;t exist. Everything else is where you left
        it.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Back to Studeo
        </Link>
        <Link
          href="/preview"
          className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface"
        >
          See it working
        </Link>
      </div>
    </main>
  );
}
