import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Connect" };

const STEPS = [
  {
    title: "Install the extension",
    detail:
      "Open chrome://extensions, turn on Developer mode, choose “Load unpacked”, and pick the extension folder from the Studeo repo.",
  },
  {
    title: "Sign in to the Student Portal",
    detail:
      "Go to sp.srmist.edu.in and log in as you normally would, CAPTCHA and all. Leave the tab open.",
  },
  {
    title: "Open Academia too, if you want a timetable",
    detail:
      "academia.srmist.edu.in is the only place your course slots exist. Skip it and you still get attendance and marks — just no timetable or free-hour view.",
  },
  {
    title: "Click Sync",
    detail:
      "Open the Studeo Sync extension and press Sync now. It reads the pages you can already see and brings you straight here, signed in.",
  },
];

export default function ConnectPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-24">
      <header className="flex items-center justify-between py-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Studeo
        </Link>
        <ThemeToggle />
      </header>

      <h1 className="pt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Connect your account
      </h1>

      <p className="mt-5 max-w-[52ch] text-lg text-text-muted">
        Studeo can&rsquo;t log in to SRM for you, and deliberately doesn&rsquo;t try.
        You sign in yourself, in your own browser; a small extension then hands
        Studeo the pages you&rsquo;re already looking at.
      </p>

      <ol className="mt-12 space-y-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-5">
            {/* Numbered because these genuinely are sequential — step 4 does
                nothing until 1 through 3 have happened. */}
            <span className="tnum mt-0.5 shrink-0 text-sm font-medium text-text-faint">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <h2 className="font-medium">{step.title}</h2>
              <p className="mt-1 max-w-[54ch] text-sm text-text-muted">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-14 rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="text-sm font-medium">What Studeo never receives</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-text-muted">
          <li>
            <span className="text-text">Your password.</span> It is typed only into
            SRM&rsquo;s own login form, as always.
          </li>
          <li>
            <span className="text-text">Your session cookie.</span> It stays in your
            browser; the extension uses it there and sends only the resulting pages.
          </li>
        </ul>
        <p className="mt-3 text-sm text-text-muted">
          What does arrive is the same attendance, marks and timetable you can read on
          the portal yourself — parsed, stored against your NetID, and shown back to you
          faster.
        </p>
      </section>

      <p className="mt-10 text-sm text-text-muted">
        Just looking around?{" "}
        <Link href="/demo" className="text-text underline underline-offset-4">
          Try the demo instead
        </Link>{" "}
        — no sign-in, no extension.
      </p>
    </div>
  );
}
