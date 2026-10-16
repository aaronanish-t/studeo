"use client";

import { useActionState } from "react";

import {
  removeFriend,
  respondToRequest,
  sendFriendRequest,
  type FriendActionState,
} from "./actions";

const INITIAL: FriendActionState = { status: "idle" };

/**
 * The interactive half of the friends page.
 *
 * Split out so the preview can render the same layout without shipping any of
 * it: that page shows seeded students and has nothing to submit.
 */

export function AddFriendForm() {
  const [state, action, pending] = useActionState(sendFriendRequest, INITIAL);

  return (
    <form action={action}>
      <label htmlFor="friend-netid" className="block text-sm font-medium">
        Add someone by NetID
      </label>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center rounded-full border border-border bg-surface transition-colors focus-within:border-border-strong">
          <input
            id="friend-netid"
            name="netId"
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="rk9823"
            className="min-w-0 flex-1 bg-transparent py-2.5 pl-4 text-base outline-none placeholder:text-text-faint sm:text-sm"
          />
          <span className="pr-4 text-sm text-text-faint select-none">@srmist.edu.in</span>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send request"}
        </button>
      </div>

      {state.status !== "idle" && state.message ? (
        <p
          className={
            state.status === "error"
              ? "mt-3 max-w-[54ch] text-sm text-under"
              : "mt-3 max-w-[54ch] text-sm text-safe"
          }
        >
          {state.message}
        </p>
      ) : (
        <p className="mt-3 max-w-[54ch] text-sm text-text-muted">
          They need a Studeo account first, and they&rsquo;ll have to accept — nothing
          of theirs is visible until they do.
        </p>
      )}
    </form>
  );
}

export function RespondButtons({ id }: { id: string }) {
  const [state, action, pending] = useActionState(respondToRequest, INITIAL);

  return (
    <form action={action} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="id" value={id} />

      <button
        type="submit"
        name="decision"
        value="accept"
        disabled={pending}
        className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        Accept
      </button>
      <button
        type="submit"
        name="decision"
        value="decline"
        disabled={pending}
        className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
      >
        Decline
      </button>

      {state.status === "error" && state.message ? (
        <span className="text-xs text-under">{state.message}</span>
      ) : null}
    </form>
  );
}

export function RemoveButton({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState(removeFriend, INITIAL);

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-under/40 hover:text-under disabled:opacity-60"
      >
        {pending ? "…" : label}
      </button>
      {state.status === "error" && state.message ? (
        <span className="ml-2 text-xs text-under">{state.message}</span>
      ) : null}
    </form>
  );
}
