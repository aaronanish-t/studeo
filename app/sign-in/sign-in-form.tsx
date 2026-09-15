"use client";

import { useActionState } from "react";

import { requestSignInLink, type SignInState } from "./actions";

const INITIAL: SignInState = { status: "idle" };

/**
 * The one form in Studeo.
 *
 * Client component only because the result has to render in place — "we sent
 * it to at4152@srmist.edu.in" — without a navigation. Validation and sending
 * live in the server action; this file owns nothing but the pending state.
 */
export function SignInForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(requestSignInLink, INITIAL);

  if (state.status === "sent") {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-5">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1.5 max-w-[46ch] text-sm text-text-muted">
          {state.message ?? (
            <>
              We sent a sign-in link to{" "}
              <span className="font-mono text-text">{state.sentTo}</span>. It works
              once and expires in 15 minutes.
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-text-faint">
          Nothing there after a minute? Check spam — and that the NetID was right.
        </p>
      </div>
    );
  }

  // A stale link from the URL (?error=expired-link) and a rejection from the
  // action are shown in the same place; the action's message wins once there
  // is one, because it's the more recent thing that happened.
  const error = state.status === "error" ? state.message : initialError;

  return (
    <form action={action} className="mt-2">
      <label htmlFor="netId" className="block text-sm font-medium">
        NetID
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center rounded-full border border-border bg-surface transition-colors focus-within:border-border-strong">
          <input
            id="netId"
            name="netId"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="at4152"
            aria-describedby={error ? "netid-error" : "netid-hint"}
            aria-invalid={error ? true : undefined}
            className="min-w-0 flex-1 bg-transparent py-2.5 pl-4 text-base outline-none placeholder:text-text-faint sm:text-sm"
          />
          <span className="tnum pr-4 text-sm text-text-faint select-none">
            @srmist.edu.in
          </span>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : "Email me a link"}
        </button>
      </div>

      {error ? (
        <p id="netid-error" className="mt-3 max-w-[54ch] text-sm text-under">
          {error}
        </p>
      ) : (
        <p id="netid-hint" className="mt-3 text-sm text-text-muted">
          The link goes to your SRM inbox only — that&rsquo;s how we know the NetID is
          yours.
        </p>
      )}
    </form>
  );
}
