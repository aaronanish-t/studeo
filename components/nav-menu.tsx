"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/ui";

/**
 * Section menu.
 *
 * A dropdown rather than a row of tabs: there are five destinations and some of
 * their names are two words, which on a phone either wraps or turns into a
 * horizontally scrolling strip that hides half its own contents. A menu costs
 * one tap and always shows every option.
 *
 * The button shows where you ARE, not what the menu does — "Marks ▾" tells you
 * something on every page; a hamburger tells you nothing.
 */

interface Section {
  label: string;
  /** Path relative to the base; "" is the section root. */
  path: string;
}

const SECTIONS: Section[] = [
  { label: "Overview", path: "" },
  { label: "Attendance", path: "/attendance" },
  { label: "Timetable", path: "/timetable" },
  { label: "Free hours", path: "/free" },
  { label: "Marks", path: "/marks" },
];

/** The demo's overview lives at /demo; a signed-in one at /dashboard. */
function hrefFor(section: Section, basePath: string): string {
  if (section.path === "") return basePath || "/dashboard";
  return `${basePath}${section.path}`;
}

export function NavMenu({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Longest match wins: "/demo/marks" must resolve to Marks, not Overview,
  // and Overview is a prefix of every other path under the same base.
  const current =
    [...SECTIONS]
      .sort((a, b) => b.path.length - a.path.length)
      .find((section) => pathname === hrefFor(section, basePath)) ?? SECTIONS[0];

  // Subscribing to document events — the legitimate use of an effect. Nothing
  // is set synchronously here; state changes only when something happens.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pr-2.5 pl-3.5 text-sm font-medium text-text transition-colors hover:border-border-strong"
      >
        {current.label}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn(
            "size-3.5 text-text-faint transition-transform",
            open && "rotate-180"
          )}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1.5 min-w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg shadow-black/5"
        >
          {SECTIONS.map((section) => {
            const href = hrefFor(section, basePath);
            const isCurrent = section === current;

            return (
              <Link
                key={section.label}
                href={href}
                role="menuitem"
                aria-current={isCurrent ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between gap-4 px-3.5 py-2 text-sm transition-colors",
                  isCurrent
                    ? "font-medium text-text"
                    : "text-text-muted hover:bg-surface-sunk hover:text-text"
                )}
              >
                {section.label}
                {isCurrent ? (
                  <span aria-hidden className="size-1.5 rounded-full bg-text" />
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
