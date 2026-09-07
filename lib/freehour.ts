/**
 * Free-hour intersection.
 *
 * The problem: given N students' timetables for one day order, when is the
 * whole group simultaneously free?
 *
 * The naive route is to complement each person's schedule into their own free
 * set and then intersect N sets pairwise. That works but it's fiddly and it
 * throws away information.
 *
 * The observation that simplifies it: a moment is commonly free if and only if
 * *nobody* is busy then. So take the union of every busy interval across every
 * person and complement it once against the campus day. One sort, one linear
 * sweep.
 *
 * Running the sweep with a count rather than a boolean costs nothing extra and
 * buys the feature people actually want — "everyone is free except Rahul" is a
 * more useful answer than "there is no common gap", because in a group of five
 * there is very often no common gap at all.
 *
 * All times are minutes from midnight. Integers, not Dates: the arithmetic is
 * exact, timezone-free, and trivial to test.
 */

export interface Interval {
  startMin: number;
  endMin: number;
}

export interface Person {
  id: string;
  name: string;
  busy: Interval[];
}

export interface Gap extends Interval {
  durationMin: number;
  /** Empty for a true common gap; otherwise the people who can't make it. */
  blockedBy: Array<{ id: string; name: string }>;
}

export interface FindGapsOptions {
  /** Start of the campus day. Default 08:00. */
  dayStartMin?: number;
  /** End of the campus day. Default 17:30. */
  dayEndMin?: number;
  /** Ignore slivers. Default 30 minutes — shorter isn't worth walking for. */
  minDurationMin?: number;
  /**
   * How many people may be busy and still have the window reported.
   * 0 = strict common gaps only. 1 = also surface "all but one".
   */
  maxBlockers?: number;
}

const DEFAULTS = {
  dayStartMin: 8 * 60,
  dayEndMin: 17 * 60 + 30,
  minDurationMin: 30,
  maxBlockers: 0,
} satisfies Required<FindGapsOptions>;

/**
 * Merge overlapping/adjacent intervals into a minimal disjoint set.
 * Exported because the per-person "busy today" strip in the UI wants it too.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals]
    .filter((i) => i.endMin > i.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  if (sorted.length === 0) return [];

  const merged: Interval[] = [{ ...sorted[0] }];

  for (const next of sorted.slice(1)) {
    const tail = merged[merged.length - 1];
    if (next.startMin <= tail.endMin) {
      // Overlapping or touching — extend rather than append.
      tail.endMin = Math.max(tail.endMin, next.endMin);
    } else {
      merged.push({ ...next });
    }
  }

  return merged;
}

/**
 * Find windows where at most `maxBlockers` of the group are in class.
 *
 * Returns gaps in chronological order. A gap with an empty `blockedBy` is a
 * true common free hour; one with entries is a near miss, and the caller can
 * decide whether to show it.
 */
export function findGaps(people: Person[], options: FindGapsOptions = {}): Gap[] {
  const { dayStartMin, dayEndMin, minDurationMin, maxBlockers } = {
    ...DEFAULTS,
    ...options,
  };

  if (people.length === 0 || dayEndMin <= dayStartMin) return [];

  const nameById = new Map(people.map((p) => [p.id, p.name]));

  // Build the sweep events, clipped to the campus day so a stray 07:00 slot
  // can't drag the timeline outside the window we're reporting on.
  type Event = { at: number; delta: 1 | -1; who: string };
  const events: Event[] = [];

  for (const person of people) {
    // Merge per person first: two overlapping slots for the SAME student must
    // not count as two blockers, or the near-miss threshold misreads.
    for (const busy of mergeIntervals(person.busy)) {
      const start = Math.max(busy.startMin, dayStartMin);
      const end = Math.min(busy.endMin, dayEndMin);
      if (end <= start) continue;

      events.push({ at: start, delta: 1, who: person.id });
      events.push({ at: end, delta: -1, who: person.id });
    }
  }

  // Boundaries are every event time plus the two ends of the day.
  const boundaries = Array.from(
    new Set<number>([dayStartMin, dayEndMin, ...events.map((e) => e.at)])
  ).sort((a, b) => a - b);

  const byTime = new Map<number, Event[]>();
  for (const event of events) {
    const bucket = byTime.get(event.at);
    if (bucket) bucket.push(event);
    else byTime.set(event.at, [event]);
  }

  const active = new Set<string>();
  const segments: Gap[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i];
    const to = boundaries[i + 1];

    // Apply everything happening at `from` before measuring the segment.
    // Ends are processed first so a class ending at 10:00 and another starting
    // at 10:00 don't briefly look like an overlap.
    const here = byTime.get(from) ?? [];
    for (const e of here) if (e.delta === -1) active.delete(e.who);
    for (const e of here) if (e.delta === 1) active.add(e.who);

    if (to <= from) continue;
    if (active.size > maxBlockers) continue;

    segments.push({
      startMin: from,
      endMin: to,
      durationMin: to - from,
      blockedBy: [...active].map((id) => ({ id, name: nameById.get(id) ?? id })),
    });
  }

  return coalesce(segments).filter((gap) => gap.durationMin >= minDurationMin);
}

/**
 * Join touching segments that have the identical blocker set. The sweep emits a
 * new segment at every boundary, so without this a two-hour gap interrupted
 * only by someone else's class boundary comes back as several fragments.
 */
function coalesce(segments: Gap[]): Gap[] {
  const out: Gap[] = [];

  for (const segment of segments) {
    const tail = out[out.length - 1];
    const sameBlockers =
      tail &&
      tail.endMin === segment.startMin &&
      tail.blockedBy.length === segment.blockedBy.length &&
      tail.blockedBy.every((b, idx) => b.id === segment.blockedBy[idx]?.id);

    if (sameBlockers) {
      tail.endMin = segment.endMin;
      tail.durationMin = tail.endMin - tail.startMin;
    } else {
      out.push({ ...segment, blockedBy: [...segment.blockedBy] });
    }
  }

  return out;
}

/** 590 -> "09:50" */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 95 -> "1h 35m" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "09:50" -> 590. Tolerates "9:50" and "09.50". */
export function parseTime(value: string): number {
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) throw new Error(`Unparseable time: "${value}"`);

  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) throw new Error(`Out-of-range time: "${value}"`);

  return hours * 60 + mins;
}
