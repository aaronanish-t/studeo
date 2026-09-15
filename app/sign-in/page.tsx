import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";

import { currentSession } from "@/lib/session";

import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

/**
 * Why a sign-in link can fail, in words a student can act on. Anything else in
 * the query string is ignored rather than echoed.
 */
const ERRORS: Record<string, string> = {
  "expired-link": "That link has expired or was already used. Ask for a fresh one.",
  "missing-token": "That link was incomplete — it may have been cut off when copied. Ask for a fresh one.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Already signed in: there's nothing to do here.
  if (await currentSession()) redirect("/dashboard");

  const { error } = await searchParams;
  const initialError = error ? ERRORS[error] : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-24">
      <header className="flex items-center justify-between py-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Studeo
        </Link>
        <ThemeToggle />
      </header>

      <h1 className="pt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Sign in
      </h1>

      <p className="mt-5 max-w-[50ch] text-lg text-text-muted">
        Your SRM NetID and password, the same ones Academia takes. Studeo
        doesn&rsquo;t keep either.
      </p>

      <section className="mt-10">
        <SignInForm initialError={initialError} />
      </section>

      <section className="mt-14 border-t border-border pt-8">
        <h2 className="text-sm font-medium">What this does and doesn&rsquo;t reach</h2>
        <p className="mt-2 max-w-[56ch] text-sm text-text-muted">
          Signing in here logs you into <span className="text-text">Academia</span>,
          which brings your timetable and course list with it. Your{" "}
          <span className="text-text">attendance and marks live on the Student Portal
          </span>
          , and SRM&rsquo;s login there can&rsquo;t be completed by a server — so those
          arrive through the{" "}
          <Link href="/connect" className="text-text underline underline-offset-4">
            browser extension
          </Link>
          , once, on a laptop. After that this page works from anywhere.
        </p>
        <p className="mt-3 max-w-[56ch] text-sm text-text-muted">
          Your password is used for a single request to SRM and is never written down,
          logged, or kept. Studeo stores no credential of any kind.
        </p>
      </section>

      <p className="mt-10 text-sm text-text-muted">
        Just looking?{" "}
        <Link href="/preview" className="text-text underline underline-offset-4">
          See it working
        </Link>{" "}
        — no sign-in, no extension.
      </p>
    </div>
  );
}
