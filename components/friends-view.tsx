import Link from "next/link";

import { AddFriendForm, RemoveButton, RespondButtons } from "@/app/friends/friend-forms";
import { NavMenu } from "@/components/nav-menu";
import { ThemeToggle } from "@/components/theme-toggle";

import type { FriendsData } from "@/lib/friends";

/**
 * The group, shared by the preview and a signed-in account.
 *
 * No status colours here. Green/amber/red mean attendance in this app and
 * nothing else — a friend is not a warning, and spending those hues on a
 * second meaning would make the one urgent signal ambiguous.
 */
export function FriendsView({
  data,
  basePath,
  interactive,
  badge,
  footnote,
}: {
  data: FriendsData;
  /** "/preview" or "" — prefixes every onward link. */
  basePath: string;
  /** The preview shows the same layout with nothing to submit. */
  interactive: boolean;
  badge?: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  const { friends, incoming, outgoing } = data;

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
        Friends
      </h1>

      <p className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
        <span className="tnum">{friends.length}</span>{" "}
        <span className="text-text-faint">
          {friends.length === 1 ? "friend" : "friends"}
        </span>
      </p>

      <p className="mt-3 max-w-[50ch] text-text-muted">
        {friends.length === 0
          ? "The free-hour finder compares your day against theirs, so it needs at least one."
          : "Their timetables are what the free-hour finder intersects with yours."}
      </p>

      {/* ---- add ---------------------------------------------------------- */}
      {interactive ? (
        <section className="mt-10">
          <AddFriendForm />
        </section>
      ) : null}

      {/* ---- waiting on you ----------------------------------------------- */}
      {incoming.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xs font-medium tracking-[0.16em] text-text-faint uppercase">
            Waiting on you
          </h2>

          <ul className="mt-4 divide-y divide-border border-t border-border">
            {incoming.map((request) => (
              <li key={request.id} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{request.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-text-faint">{request.netId}</p>
                </div>
                {interactive ? <RespondButtons id={request.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- the group ---------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xs font-medium tracking-[0.16em] text-text-faint uppercase">
          Your group
        </h2>

        {friends.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
            Nobody yet.
            {interactive ? " Add someone by their NetID above." : null}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {friends.map((friend) => (
              <li key={friend.id} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{friend.name}</p>
                  <p className="mt-0.5 text-xs text-text-faint">
                    <span className="font-mono">{friend.netId}</span>
                    <span className="mx-1.5">·</span>
                    {/* Says what the free-hour finder can actually do with them,
                        which is the only reason this list exists. A friend who
                        has never synced contributes nothing to a gap. */}
                    {friend.timetabledDays === 0
                      ? "no timetable synced yet"
                      : `${friend.timetabledDays} of 5 days timetabled`}
                  </p>
                </div>

                {interactive ? <RemoveButton id={friend.id} label="Remove" /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- sent, unanswered --------------------------------------------- */}
      {outgoing.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xs font-medium tracking-[0.16em] text-text-faint uppercase">
            Sent
          </h2>

          <ul className="mt-4 divide-y divide-border border-t border-border">
            {outgoing.map((request) => (
              <li key={request.id} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-muted">{request.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-text-faint">{request.netId}</p>
                </div>
                <span className="shrink-0 text-xs text-text-faint">waiting</span>
                {interactive ? <RemoveButton id={request.id} label="Withdraw" /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {friends.length > 0 ? (
        <Link
          href={`${basePath}/free`}
          className="mt-12 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-border-strong"
        >
          <span>
            <span className="block text-sm font-medium">When is everyone free?</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              Your day against {friends.length === 1 ? "theirs" : "all of theirs"}
            </span>
          </span>
          <span aria-hidden className="text-text-faint">
            &rarr;
          </span>
        </Link>
      ) : null}

      {footnote ? <p className="mt-6 text-xs text-text-faint">{footnote}</p> : null}
    </div>
  );
}
