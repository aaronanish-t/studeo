import type { CSSProperties } from "react";

export const metadata = { title: "Palettes" };

/**
 * A design-review page, not a product page. It renders the same miniature
 * dashboard under each candidate palette so they can be judged on real content
 * — a percentage, a warning row, a button — rather than on swatches, which
 * always look better than they turn out to be.
 *
 * Every component in Studeo reads its colours from CSS custom properties, so a
 * palette is applied here simply by setting those properties on a wrapper.
 * That is the whole benefit of semantic tokens: swapping a scheme is data, not
 * a refactor.
 *
 * Delete this route before shipping, or keep it — it's a decent thing for an
 * interviewer to stumble on.
 */

type Tokens = Record<string, string>;

/** Status colours that work on any warm-white ground. Palettes override only
 *  when their accent would otherwise collide with one of them. */
const STATUS_ON_LIGHT: Tokens = {
  "--safe": "#147a4f",
  "--safe-soft": "#e6f4ec",
  "--edge": "#8a5a00",
  "--edge-soft": "#fbf0dc",
  "--under": "#b3261e",
  "--under-soft": "#fceae8",
};

interface Palette {
  id: string;
  name: string;
  note: string;
  tokens: Tokens;
}

const PALETTES: Palette[] = [
  {
    id: "indigo",
    name: "Ink & Indigo",
    note: "Warm paper, saturated indigo. Confident and a little corporate.",
    tokens: {
      "--ground": "#f7f6f2",
      "--surface": "#ffffff",
      "--border": "#e3e1d8",
      "--border-strong": "#cfccc0",
      "--text": "#16151f",
      "--text-muted": "#5c5a66",
      "--text-faint": "#8e8b82",
      "--accent": "#3b37c4",
      "--accent-hover": "#302cad",
      "--accent-fg": "#ffffff",
      "--accent-soft": "#ebeafb",
      ...STATUS_ON_LIGHT,
    },
  },
  {
    id: "mono",
    name: "Monochrome — in use",
    note: "The current scheme. No accent hue at all, so the ONLY colour on screen is attendance status and nothing competes with the one thing that matters.",
    tokens: {
      "--ground": "#f7f6f3",
      "--surface": "#ffffff",
      "--border": "#e4e2dc",
      "--border-strong": "#c8c5bd",
      "--text": "#141414",
      "--text-muted": "#5a5a58",
      "--text-faint": "#8d8b86",
      "--accent": "#1a1a1a",
      "--accent-hover": "#000000",
      "--accent-fg": "#ffffff",
      "--accent-soft": "#eeece7",
      ...STATUS_ON_LIGHT,
    },
  },
  {
    id: "petrol",
    name: "Petrol",
    note: "Cool grey-green paper with a deep teal. Reads as instrumentation. Safe-green is pushed cooler so it stays distinct from the accent.",
    tokens: {
      "--ground": "#f1f4f4",
      "--surface": "#ffffff",
      "--border": "#dbe2e2",
      "--border-strong": "#bfc9c9",
      "--text": "#101a1c",
      "--text-muted": "#4d5c5e",
      "--text-faint": "#7d8b8c",
      "--accent": "#0f5b6b",
      "--accent-hover": "#0b4653",
      "--accent-fg": "#ffffff",
      "--accent-soft": "#e0eef1",
      ...STATUS_ON_LIGHT,
      "--safe": "#1d7a3f",
      "--safe-soft": "#e6f3e9",
    },
  },
  {
    id: "plum",
    name: "Plum",
    note: "Slightly pink paper, deep plum accent. Warmer and more editorial; the least likely thing to be mistaken for another student project.",
    tokens: {
      "--ground": "#faf6f6",
      "--surface": "#ffffff",
      "--border": "#e9e0e2",
      "--border-strong": "#d3c5c8",
      "--text": "#1d1418",
      "--text-muted": "#645760",
      "--text-faint": "#948791",
      "--accent": "#7a2e68",
      "--accent-hover": "#652456",
      "--accent-fg": "#ffffff",
      "--accent-soft": "#f5e9f2",
      ...STATUS_ON_LIGHT,
      "--under": "#a52822",
    },
  },
  {
    id: "cobalt",
    name: "Cobalt",
    note: "Neutral cool grey and a bright technical blue. The crispest of the set — closest to a well-made developer tool.",
    tokens: {
      "--ground": "#f4f5f7",
      "--surface": "#ffffff",
      "--border": "#e0e3e9",
      "--border-strong": "#c4c9d3",
      "--text": "#12151c",
      "--text-muted": "#525a6b",
      "--text-faint": "#858c9a",
      "--accent": "#1b4fd8",
      "--accent-hover": "#1740b4",
      "--accent-fg": "#ffffff",
      "--accent-soft": "#e6ecfd",
      ...STATUS_ON_LIGHT,
    },
  },
  {
    id: "sand",
    name: "Sand & Ink",
    note: "The warmest ground here, nearly manuscript. Accent is a dark olive-ink rather than a hue, so amber warnings still stand out against it.",
    tokens: {
      "--ground": "#f6f2e9",
      "--surface": "#fffdf8",
      "--border": "#e5ddcc",
      "--border-strong": "#cbc0a9",
      "--text": "#1a1710",
      "--text-muted": "#5d5745",
      "--text-faint": "#8d8672",
      "--accent": "#3f4426",
      "--accent-hover": "#2f331b",
      "--accent-fg": "#fffdf8",
      "--accent-soft": "#eae5d3",
      ...STATUS_ON_LIGHT,
      "--edge": "#7a4d05",
      "--edge-soft": "#f4e8ce",
    },
  },
];

function Preview({ palette }: { palette: Palette }) {
  return (
    <section
      style={palette.tokens as CSSProperties}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="bg-ground p-6">
        {/* swatches */}
        <div className="mb-6 flex gap-1.5">
          {["--ground", "--surface", "--text", "--accent", "--safe", "--edge", "--under"].map(
            (token) => (
              <div
                key={token}
                title={token}
                className="size-6 rounded-md border border-border"
                style={{ background: `var(${token})` }}
              />
            )
          )}
        </div>

        {/* the miniature dashboard */}
        <p className="text-xs text-text-muted">
          <span className="font-medium text-text">Day 2</span>
          <span className="mx-1.5 text-text-faint">·</span>
          Monday 7 September
        </p>

        <p className="tnum mt-3 text-5xl font-semibold tracking-tighter text-text">
          85.4
          <span className="text-2xl text-text-faint">%</span>
        </p>
        <p className="mt-1 text-xs text-text-muted">
          overall attendance · 152 of 178 hours
        </p>

        <div className="mt-5 rounded-xl border border-under/30 bg-under-soft px-3 py-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="tnum text-xs font-semibold text-under">69.44%</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-text">
                Discrete Mathematics
              </p>
              <p className="text-[11px] text-under">Attend 8 hours in a row to recover</p>
            </div>
          </div>
        </div>

        <ul className="mt-5 divide-y divide-border border-t border-border">
          {[
            { dot: "bg-edge", name: "Design and Analysis of Algorithms", pct: "78.95%" },
            { dot: "bg-safe", name: "Data Structures and Algorithms", pct: "92.86%" },
          ].map((row) => (
            <li key={row.name} className="flex items-center gap-3 py-2.5">
              <span className={`size-1.5 shrink-0 rounded-full ${row.dot}`} />
              <span className="min-w-0 flex-1 truncate text-xs text-text">{row.name}</span>
              <span className="tnum shrink-0 text-xs font-medium text-text">{row.pct}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center gap-2">
          <span className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg">
            See it working
          </span>
          <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text">
            Sign in
          </span>
        </div>
      </div>
    </section>
  );
}

export default function PalettesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-24">
      <header className="py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Palettes</h1>
        <p className="mt-3 max-w-[60ch] text-text-muted">
          The same dashboard under six schemes. Green, amber and red are reserved for
          attendance status in all of them — which is why none of these accents is
          green, amber or red. An accent that collides with a status colour would make
          the one urgent thing on the page ambiguous.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PALETTES.map((palette) => (
          <div key={palette.id} className="flex flex-col gap-3">
            <Preview palette={palette} />
            <div className="px-1">
              <h2 className="text-sm font-semibold">{palette.name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                {palette.note}
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-text-faint">
                {palette.tokens["--ground"]} · {palette.tokens["--accent"]}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
