"use client";

import { useSyncExternalStore } from "react";

/**
 * Light / dark toggle.
 *
 * Studeo is light by default and deliberately does NOT follow
 * prefers-color-scheme — see the note in app/globals.css. Most developers and a
 * good share of students run their OS dark, so honouring the system preference
 * would mean almost nobody ever saw the design we chose. Dark is properly built
 * and one click away; it just has to be asked for.
 */

const STORAGE_KEY = "studeo-theme";
export type Theme = "light" | "dark";

/**
 * Runs before first paint, injected into the document by the layout.
 *
 * Without it, the server renders light, and a viewer who chose dark sees a
 * white flash before hydration swaps it. Reading localStorage and stamping the
 * attribute synchronously in the document head is the only way to avoid that —
 * React can't help, because it hasn't run yet.
 *
 * Wrapped in try/catch because localStorage throws outright in some contexts
 * (private windows with site data blocked, embedded previews), and a theme
 * preference is never worth breaking the page over.
 */
export const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
} catch (e) {}
`.trim();

/**
 * The theme is external state — it lives on the document element, put there
 * before React ran — so it's read with useSyncExternalStore rather than mirrored
 * into component state.
 *
 * The obvious alternative, useState plus an effect that reads localStorage, is
 * what most theme toggles do and it's wrong twice over: it triggers a cascading
 * render, and it means the component briefly believes the theme is light when
 * the page is already dark. This hook exists for exactly this shape of problem
 * and handles hydration properly via a separate server snapshot.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab switching theme should update this one too.
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The DOM is the source of truth — the pre-paint script already set it. */
function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** Server-rendered markup is always the light default. */
function getServerSnapshot(): Theme {
  return "light";
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";

    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference won't persist — a private window, or site data blocked.
      // The toggle still works for this page view; not worth surfacing.
    }

    listeners.forEach((notify) => notify());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={
        className ??
        "grid size-8 place-items-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text"
      }
    >
      {/* Both icons ship; CSS shows the one that matches the active theme, so
          the button is correct even before the effect runs. */}
      <SunIcon className="size-4 dark-hidden" />
      <MoonIcon className="size-4 light-hidden" />
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
