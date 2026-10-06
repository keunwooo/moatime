/**
 * Session pacing: raids on the colony (and, when a session would otherwise pass without
 * anything happening, one planet sight) are placed to fit the focus sessions as they were
 * started. Raids come every 4–6½ minutes of a session, the first within its first few minutes,
 * so a 5-minute countdown sees one and a 25-minute one sees four or five. Most are small
 * skirmishes; every third is a full raid (raid.ts decides which).
 *
 * The world records one segment per session: the world time at its start, its planned length
 * (countdown T, or null for a stopwatch) and the world time at its end. Everything here is a
 * pure function of the seed and those segments. Segments are only ever appended at a session's
 * start (with times at or after the world time then) and closed at its end (dropping what had
 * not happened yet), so the past never changes.
 *
 * Raids only touch damage, repairs and the garrison, never what the colony builds, so the
 * colony's growth stays the same however the time was split into sessions.
 */

import { hash32 } from '../core/rng';
import { dayAt } from './clock';
import { EVENT_DEFS } from './events';
import { BLOCK_MS, eventAt, eventOfBlock, type EventDef, type WorldEvent } from './timeline';
import type { ThemeId } from '../core/session';

export interface PaceSeg {
  /** World time when the session started. */
  w0: number;
  /** Planned length: the countdown's T, null for a stopwatch, 0 for a raid called up in dev. */
  len: number | null;
  /** World time when it ended (null while it is open). */
  w1: number | null;
  /** Dev only: a raid called up at this world time. */
  raid?: number;
}

const MIN = 60_000;

export const PACE = {
  /** Segments kept in the save (older raids have long been repaired). */
  keep: 600,
  /** Shorter countdowns get no raid (a full raid takes up to 100 s). */
  minLenMs: 4 * MIN,
  /** The first raid starts no earlier than this into a session... */
  earliestMs: 60_000,
  /** ...and every raid starts at least this long before a countdown ends. */
  endMarginMs: 140_000,
  /** Where in a countdown the first raid falls (share of T), and its latest start. */
  firstFrac: [0.25, 0.45] as [number, number],
  firstCapMs: [1.5 * MIN, 3.5 * MIN] as [number, number],
  /** First raid of a stopwatch session. */
  openFirstMs: [1.5 * MIN, 3 * MIN] as [number, number],
  /** Between raids within a session. */
  gapMs: [4 * MIN, 6.5 * MIN] as [number, number],
  /** Never closer than this to the previous raid (back-to-back short sessions each get one). */
  minGapMs: 3.5 * MIN,
  /** Sessions this short get no sight of their own either. */
  minSightLenMs: 2 * MIN,
  /** A planet sight is added when a session would otherwise go this long without anything. */
  quietMs: 25 * MIN,
};

const u01 = (...xs: number[]) => (hash32(...xs) >>> 0) / 4294967296;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** End of a segment for planning: its end, else the next one's start, else open. */
function segEnd(segs: readonly PaceSeg[], i: number): number {
  const s = segs[i];
  if (s.w1 !== null) return s.w1;
  if (i + 1 < segs.length) return segs[i + 1].w0;
  return Infinity;
}

/** Latest planned start in a segment (exclusive end of the window). */
function segLatest(s: PaceSeg): number {
  if (s.len === null) return Infinity;
  return s.w0 + s.len - PACE.endMarginMs;
}

/** A headline sight of the planet's own timeline overlapping [t0, t1), or null. */
function headline(seed: number, t0: number, t1: number): WorldEvent | null {
  for (let b = Math.floor(Math.max(0, t0) / BLOCK_MS); b <= Math.floor(Math.max(0, t1) / BLOCK_MS); b++) {
    const e = eventOfBlock(EVENT_DEFS, 'space', seed, b);
    if (e && e.t1 > t0 && e.t0 < t1) return e;
  }
  return null;
}

/** Moves a raid start out of a headline sight if it fits elsewhere in [lo, hi). */
function clear(seed: number, t: number, lo: number, hi: number): number {
  const e = headline(seed, t - 20_000, t + 120_000);
  if (!e) return t;
  const after = e.t1 + 30_000;
  if (after < hi && !headline(seed, after - 20_000, after + 120_000)) return after;
  const before = e.t0 - 130_000;
  if (before >= lo && !headline(seed, before - 20_000, before + 120_000)) return before;
  return t;
}

const raidMemo = new WeakMap<readonly PaceSeg[], Map<number, number[]>>();

/** Raid start times (sorted) for the sessions so far. */
export function pacedRaids(seed: number, segs: readonly PaceSeg[]): number[] {
  let m = raidMemo.get(segs);
  if (!m) {
    m = new Map();
    raidMemo.set(segs, m);
  }
  const hit = m.get(seed);
  if (hit) return hit;
  const out: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.raid !== undefined) {
      out.push(s.raid);
      last = Math.max(last, s.raid);
      continue;
    }
    const end = segEnd(segs, i);
    const latest = Math.min(segLatest(s), end);
    if (s.len !== null && s.len < PACE.minLenMs) continue;
    const key = Math.floor(s.w0);
    let t: number;
    if (s.len === null) {
      t = s.w0 + Math.round(lerp(PACE.openFirstMs[0], PACE.openFirstMs[1], u01(seed, key, 71)));
    } else {
      const cap = lerp(PACE.firstCapMs[0], PACE.firstCapMs[1], u01(seed, key, 72));
      const frac = lerp(PACE.firstFrac[0], PACE.firstFrac[1], u01(seed, key, 73));
      t = s.w0 + Math.round(Math.max(PACE.earliestMs, Math.min(s.len * frac, cap)));
      // a short countdown still gets its raid, as late as it can start
      t = Math.min(t, latest - 1000);
    }
    let n = 0;
    while (t < latest && out.length < 100_000) {
      if (t < last + PACE.minGapMs) t = last + PACE.minGapMs;
      if (t >= latest) break;
      t = clear(seed, t, Math.max(s.w0 + PACE.earliestMs, last + PACE.minGapMs), latest);
      out.push(t);
      last = t;
      n++;
      t += Math.round(lerp(PACE.gapMs[0], PACE.gapMs[1], u01(seed, key, 74, n)));
      if (!Number.isFinite(end) && t > s.w0 + 72 * 3600_000) break;
    }
  }
  out.sort((a, b) => a - b);
  if (m.size > 8) m.clear();
  m.set(seed, out);
  return out;
}

/** The first raid start at or after T (Infinity if none is planned). */
export function nextRaidAt(raids: readonly number[], T: number): number {
  let lo = 0;
  let hi = raids.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (raids[mid] < T) lo = mid + 1;
    else hi = mid;
  }
  return lo < raids.length ? raids[lo] : Infinity;
}

// ---- planet sights for quiet sessions ----------------------------------------------------

/** Sights that need no stage and change nothing in the colony, with their weights. */
const FILLERS: { kind: string; w: number; night?: boolean }[] = [
  { kind: 'comet', w: 3 },
  { kind: 'bigShip', w: 3 },
  { kind: 'fleet', w: 2 },
  { kind: 'meteorShower', w: 2, night: true },
  { kind: 'dustStorm', w: 1 },
  { kind: 'elecStorm', w: 1 },
];

function defOf(kind: string): EventDef {
  return EVENT_DEFS.find((d) => d.theme === 'space' && d.kind === kind)!;
}

const fillMemo = new WeakMap<readonly PaceSeg[], Map<number, WorldEvent[]>>();

/**
 * Planet sights added to sessions that would otherwise see nothing for a long stretch (no raid,
 * no sight of the planet's own timeline). Presentation only: the colony never reacts to them.
 */
export function pacedSights(seed: number, segs: readonly PaceSeg[]): WorldEvent[] {
  let m = fillMemo.get(segs);
  if (!m) {
    m = new Map();
    fillMemo.set(segs, m);
  }
  const hit = m.get(seed);
  if (hit) return hit;
  const raids = pacedRaids(seed, segs);
  const out: WorldEvent[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.raid !== undefined || (s.len !== null && s.len < PACE.minSightLenMs)) continue;
    const end = Math.min(segEnd(segs, i), s.len === null ? s.w0 + 12 * 3600_000 : s.w0 + s.len);
    const key = Math.floor(s.w0);
    // what already happens in this session: raids (also one running on from the session
    // before) and the planet's own sights
    const busy: [number, number][] = [];
    let raidIn = false;
    let ownIn = false;
    for (const r of raids) {
      if (r + 130_000 > s.w0 && r - 30_000 < end) busy.push([r - 30_000, r + 130_000]);
      if (r >= s.w0 && r < end) raidIn = true;
    }
    for (let b = Math.floor(Math.max(0, s.w0 - BLOCK_MS) / BLOCK_MS); b <= Math.floor(Math.min(end, s.w0 + 12 * 3600_000) / BLOCK_MS); b++) {
      const e = eventOfBlock(EVENT_DEFS, 'space', seed, b);
      if (e && e.t1 + 30_000 > s.w0 && e.t0 - 30_000 < end) busy.push([e.t0 - 30_000, e.t1 + 30_000]);
      // (one that only grazes the session's start or end does not count)
      if (e && Math.min(e.t1, end) - Math.max(e.t0, s.w0) >= 60_000) ownIn = true;
    }
    busy.sort((a, b) => a[0] - b[0]);
    // quiet: no raid starts in it and the planet shows nothing of its own
    const sessionQuiet = !raidIn && !ownIn;
    // the quiet stretches (a whole short session counts as one)
    const quiet: [number, number][] = [];
    let from = s.w0;
    for (const [a, b] of busy) {
      if (a > from) quiet.push([from, a]);
      from = Math.max(from, b);
    }
    if (end > from) quiet.push([from, end]);
    // a quiet session gets its sight in its longest quiet stretch
    let longest = -1;
    quiet.forEach(([a, b], k) => {
      if (longest < 0 || b - a > quiet[longest][1] - quiet[longest][0]) longest = k;
    });
    let n = 0;
    for (const [k, [a, b]] of quiet.entries()) {
      const span = b - a;
      const here = sessionQuiet && k === longest && span >= 70_000;
      if (!(here || span >= PACE.quietMs)) continue;
      // one sight in the middle of the stretch (two or more in a very long one)
      const count = Math.max(here ? 1 : 0, Math.floor(span / PACE.quietMs));
      for (let k = 0; k < count; k++) {
        const mid = a + (span * (k + 0.5)) / count;
        const t0 = Math.round(Math.max(a + Math.min(60_000, span * 0.25), mid - 60_000 + u01(seed, key, 81, n) * 60_000));
        const night = dayAt('space', t0).phase !== 'day';
        const pool = FILLERS.filter((f) => !f.night || night);
        let x = u01(seed, key, 82, n) * pool.reduce((acc, f) => acc + f.w, 0);
        let pick = pool[0];
        for (const f of pool) {
          x -= f.w;
          if (x < 0) {
            pick = f;
            break;
          }
        }
        const d = defOf(pick.kind);
        const dur = Math.round(lerp(d.durMs[0], d.durMs[1], u01(seed, key, 83, n)));
        // a short session sees the whole sight
        const room = Math.max(60_000, b - t0 - 10_000);
        out.push({ kind: pick.kind, prio: d.prio, t0, t1: t0 + Math.min(dur, room), seed: hash32(seed, key, 84, n) >>> 0 });
        n++;
      }
    }
  }
  out.sort((a, b) => a.t0 - b.t0);
  if (m.size > 8) m.clear();
  m.set(seed, out);
  return out;
}

// ---- the segments of the world on view (set by the app; presentation lookups only) --------

let current: readonly PaceSeg[] = [];

export function setPace(segs: readonly PaceSeg[] | undefined) {
  current = segs ?? [];
}

export function currentPace(): readonly PaceSeg[] {
  return current;
}

/**
 * The headline event on view at W: the planet's own timeline, or a sight added for a quiet
 * session. The simulation only ever looks at the timeline (`eventAt`).
 */
export function headlineAt(theme: ThemeId, seed: number, W: number, segs: readonly PaceSeg[] = current): WorldEvent | null {
  const e = eventAt(EVENT_DEFS, theme, seed, W);
  if (e || theme !== 'space' || segs.length === 0) return e;
  for (const f of pacedSights(seed, segs)) {
    if (f.t0 > W) break;
    if (W < f.t1) return f;
  }
  return null;
}

