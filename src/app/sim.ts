/**
 * The simulation runners of the current world (one per theme) and their checkpoint cache.
 *
 * Each theme is computed only up to the world time it is asked for, once: switching themes
 * back and forth never repeats or duplicates production. Checkpoints in localStorage only
 * speed up reloads; deleting them changes nothing but the time a reload takes.
 */

import { SIM_KEY_PREFIX, type StorageLike } from '../core/persist';
import type { ThemeId } from '../core/session';
import { SimRunner, type SimState, type StoredCheckpoint } from '../sim/runner';
import { engine } from './runtime';
import { browserStorage } from '../core/persist';
import { pacedRaids, setPace } from '../world/pace';

const runners = new Map<string, SimRunner>();
const EMPTY: never[] = [];
const savedAt = new Map<string, { real: number; W: number }>();
let storage: StorageLike | null | undefined;

function store(): StorageLike | null {
  if (storage === undefined) storage = browserStorage();
  return storage;
}

function keyFor(theme: ThemeId) {
  return `${SIM_KEY_PREFIX}${theme}`;
}

function readCheckpoint(theme: ThemeId): StoredCheckpoint | null {
  try {
    const text = store()?.getItem(keyFor(theme));
    return text ? (JSON.parse(text) as StoredCheckpoint) : null;
  } catch {
    return null;
  }
}

export function simRunner<T extends ThemeId>(theme: T): SimRunner<T> {
  const w = engine.getState().world;
  const key = `${w.id}:${w.base.W}:${theme}`;
  let r = runners.get(key) as SimRunner<T> | undefined;
  if (!r) {
    for (const k of runners.keys()) if (!k.startsWith(`${w.id}:${w.base.W}:`)) runners.delete(k);
    r = new SimRunner(theme, { id: w.id, seed: w.seed, base: w.base, raids: pacedRaids(w.seed, w.pace ?? []) }, readCheckpoint(theme), engine.worldTime());
    runners.set(key, r as SimRunner);
  }
  // raids follow the sessions as they are started (memoised per segment list)
  const pace = w.pace ?? EMPTY;
  setPace(pace);
  if (theme === 'space') r.setRaids(pacedRaids(w.seed, pace));
  return r;
}

/** The theme's simulation state at W (do not modify it). */
export function simAt<T extends ThemeId>(theme: T, W: number): SimState<T> {
  return simRunner(theme).at(W);
}

/**
 * Stores a checkpoint of each live runner now and then (it is only a cache). Called from the
 * runtime tick and when the page is hidden or the timer stops.
 */
export function saveSimCheckpoints(force = false) {
  const s = store();
  if (!s) return;
  const now = Date.now();
  for (const r of runners.values()) {
    const key = keyFor(r.theme);
    const last = savedAt.get(key);
    if (!force && last && (now - last.real < 20_000 || r.W - last.W < 10_000)) continue;
    if (last && r.W === last.W) continue;
    try {
      s.setItem(key, JSON.stringify(r.checkpoint()));
      savedAt.set(key, { real: now, W: r.W });
    } catch {
      // a full storage keeps the world itself; checkpoints are optional
      try {
        s.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }
}
