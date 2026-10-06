/**
 * World timeline: headline events (rare sights, planet events, raids) placed on world time.
 * Pure: the same seed and W always give the same events, whatever the sessions were.
 *
 * Time is cut into blocks. Each event kind may have a candidate only in some blocks (its
 * grid), with a chance and an eligibility rule (season, time of day, weather, stage). A block
 * keeps at most one event: the candidate with the highest priority. Events sit inside their
 * block, so events of neighbouring blocks never overlap.
 */

import { hash32 } from '../core/rng';
import type { ThemeId } from '../core/session';

export const PRIORITY = { NORMAL: 0, AMBIENT: 1, WEATHER: 2, RARE: 3, COMBAT: 4 } as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export const BLOCK_MS = 30 * 60_000;
/** Events start within this part of their block and must end inside it. */
const START_SPAN: [number, number] = [0.08, 0.62];

export interface EventCtx {
  /** World time of the candidate's start. */
  W: number;
  /** Block index. */
  block: number;
  /** World seed (for rules that look at the weather or at other events). */
  seed: number;
}

export interface EventDef {
  kind: string;
  theme: ThemeId;
  prio: Priority;
  /** A candidate only every `grid` blocks (at a seed-dependent offset). */
  grid: number;
  /** Chance of a candidate in an eligible block. */
  chance: number;
  /** Duration range (ms of W); at most 30% of a block. */
  durMs: [number, number];
  eligible?: (ctx: EventCtx) => boolean;
}

export interface WorldEvent {
  kind: string;
  prio: Priority;
  t0: number;
  t1: number;
  /** Per-event seed for its look (path, size, direction). */
  seed: number;
}

const u01 = (...xs: number[]) => (hash32(...xs) >>> 0) / 4294967296;

function kindHash(kind: string): number {
  let h = 2166136261;
  for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Results per definition list, theme, seed and block (pure, so they can be kept). */
const memo = new WeakMap<readonly EventDef[], Map<string, WorldEvent | null>>();

/** The event of block b (or null). */
export function eventOfBlock(defs: readonly EventDef[], theme: ThemeId, seed: number, b: number): WorldEvent | null {
  if (b < 0) return null;
  let m = memo.get(defs);
  if (!m) {
    m = new Map();
    memo.set(defs, m);
  }
  const key = `${theme}:${seed}:${b}`;
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const e = computeBlock(defs, theme, seed, b);
  if (m.size > 2000) m.clear();
  m.set(key, e);
  return e;
}

function computeBlock(defs: readonly EventDef[], theme: ThemeId, seed: number, b: number): WorldEvent | null {
  let best: WorldEvent | null = null;
  let bestTie = -1;
  for (const d of defs) {
    if (d.theme !== theme) continue;
    const kh = kindHash(d.kind);
    if ((b + (kh % d.grid)) % d.grid !== 0) continue;
    if (u01(seed, b, kh, 1) >= d.chance) continue;
    const span = START_SPAN[1] - START_SPAN[0];
    const t0 = Math.floor(b * BLOCK_MS + (START_SPAN[0] + span * u01(seed, b, kh, 2)) * BLOCK_MS);
    const dur = Math.floor(d.durMs[0] + (d.durMs[1] - d.durMs[0]) * u01(seed, b, kh, 3));
    const t1 = Math.min(t0 + dur, (b + 1) * BLOCK_MS - 1);
    if (d.eligible && !d.eligible({ W: t0, block: b, seed })) continue;
    const tie = u01(seed, b, kh, 4);
    if (!best || d.prio > best.prio || (d.prio === best.prio && tie > bestTie)) {
      best = { kind: d.kind, prio: d.prio, t0, t1, seed: hash32(seed, b, kh, 5) >>> 0 };
      bestTie = tie;
    }
  }
  return best;
}

/** The headline event running at W, if any. */
export function eventAt(defs: readonly EventDef[], theme: ThemeId, seed: number, W: number): WorldEvent | null {
  const b = Math.floor(Math.max(0, W) / BLOCK_MS);
  const e = eventOfBlock(defs, theme, seed, b);
  return e && W >= e.t0 && W < e.t1 ? e : null;
}

/** Events starting in [W0, W1), in order (dev tools, tests). */
export function eventsIn(defs: readonly EventDef[], theme: ThemeId, seed: number, W0: number, W1: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  const b0 = Math.floor(Math.max(0, W0) / BLOCK_MS);
  const b1 = Math.floor(Math.max(0, W1) / BLOCK_MS);
  for (let b = b0; b <= b1; b++) {
    const e = eventOfBlock(defs, theme, seed, b);
    if (e && e.t0 >= W0 && e.t0 < W1) out.push(e);
  }
  return out;
}
