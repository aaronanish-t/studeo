"use client";

import { useActionState, useId, useState } from "react";

import { requestSignInLink, signInWithAcademia, type SignInState } from "./actions";

const INITIAL: SignInState = { status: "idle" };

/**
 * NetID and SRM password, with an emailed link as the alternative.
 *
 * The NetID lives in this component rather than in either form so that
 * switching to the email route doesn't make the student type it again — the
 * two paths differ only in what else they need.
 */
export function SignInForm({ initialError }: { initialError?: string }) {
  const [netId, setNetId] = useState("");
  const [showEmail, setShowEmail] = useState(false);

  return (
    <div>
      <PasswordForm netId={netId} onNetId={setNetId} initialError={initialError} />

      <div className="mt-8 border-t border-border pt-6">
        {showEmail ? (
          <EmailForm netId={netId} />
        ) : (
          <p className="text-sm text-text-muted">
            Rather not type your SRM password here?{" "}
            <button
              type="button"
              onClick={() => setShowEmail(true)}
              className="text-text underline underline-offset-4"
            >
              Email me a link instead
            </button>
            .
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PasswordForm({
  netId,
  onNetId,
  initialError,
}: {
  netId: string;
  onNetId: (value: string) => void;
  initialError?: string;
}) {
  const [state, action, pending] = useActionState(signInWithAcademia, INITIAL);
  const errorId = useId();

  // A stale link from the URL and a rejection from the action share one slot;
  // the action's message wins once there is one, being the more recent thing
  // that happened.
  const error = state.status === "error" ? state.message : initialError;

  return (
    <form action={action}>
      <label htmlFor="netId" className="block text-sm font-medium">
        NetID
      </label>
      <div className="mt-2 flex items-center rounded-full border border-border bg-surface transition-colors focus-within:border-border-strong">
        <input
          id="netId"
          name="netId"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={netId}
          onChange={(event) => onNetId(event.target.value)}
          placeholder="at4152"
          className="min-w-0 flex-1 bg-transparent py-2.5 pl-4 text-base outline-none placeholder:text-text-faint sm:text-sm"
        />
        <span className="pr-4 text-sm text-text-faint select-none">@srmist.edu.in</span>
      </div>

      <label htmlFor="password" className="mt-5 block text-sm font-medium">
        SRM password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className="mt-2 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-base outline-none transition-colors focus:border-border-strong sm:text-sm"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {error ? (
        <div className="mt-4">
          <p id={errorId} className="max-w-[54ch] text-sm text-under">
            {error}
          </p>
          {state.code ? (
            <p className="mt-1 font-mono text-xs text-text-faint">{state.code}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 max-w-[54ch] text-sm text-text-muted">
          The same password you use for Academia. It&rsquo;s sent to SRM to sign you in
          and never stored — but if you&rsquo;d rather not, the email link below does the
          same job.
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------

function EmailForm({ netId }: { netId: string }) {
  const [state, action, pending] = useActionState(requestSignInLink, INITIAL);

  if (state.status === "sent") {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-5">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1.5 max-w-[46ch] text-sm text-text-muted">
          {state.message ?? (
            <>
              We sent a sign-in link to{" "}
              <span className="font-mono text-text">{state.sentTo}</span>. It works once
              and expires in 15 minutes.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <form action={action}>
      <p className="text-sm font-medium">Email me a link instead</p>
      <p className="mt-1 max-w-[52ch] text-sm text-text-muted">
        Goes to your SRM inbox only — no password typed anywhere but SRM&rsquo;s own site.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center rounded-full border border-border bg-surface">
          <input
            name="netId"
            type="text"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={netId}
            placeholder="at4152"
            className="min-w-0 flex-1 bg-transparent py-2.5 pl-4 text-base outline-none placeholder:text-text-faint sm:text-sm"
          />
          <span className="pr-4 text-sm text-text-faint select-none">@srmist.edu.in</span>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-border-strong disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send link"}
        </button>
      </div>

      {state.status === "error" ? (
        <p className="mt-3 max-w-[54ch] text-sm text-under">{state.message}</p>
      ) : null}
    </form>
  );
}
