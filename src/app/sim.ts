/**
 * The simulation runners of the current world (one per theme) and their checkpoint cache.
 *
 * Each theme is computed only up to the world time it is asked for, once: switching themes
 * back and forth never repeats or duplicates production. Checkpoints in localStorage only
 * speed up reloads; deleting them changes nothing but the time a reload takes.
 */

import { SIM_KEY_PREFIX, type StorageLike } from '../core/persist';
import type { SimTheme, ThemeId } from '../core/session';
import { SimRunner, type SimState, type StoredCheckpoint } from '../sim/runner';
import { engine } from './runtime';
import { browserStorage } from '../core/persist';
import { setPace } from '../world/pace';
import { setCosmosRecords } from '../sim/cosmosDescribe';
import { setFrontRecords } from '../sim/frontDescribe';

const runners = new Map<string, SimRunner>();
const EMPTY: never[] = [];
const savedAt = new Map<string, { real: number; W: number }>();
let storage: StorageLike | null | undefined;

function store(): StorageLike | null {
  if (storage === undefined) storage = browserStorage();
  return storage;
}

function keyFor(theme: SimTheme) {
  return `${SIM_KEY_PREFIX}${theme}`;
}

function readCheckpoint(theme: SimTheme): StoredCheckpoint | null {
  try {
    const text = store()?.getItem(keyFor(theme));
    return text ? (JSON.parse(text) as StoredCheckpoint) : null;
  } catch {
    return null;
  }
}

export function simRunner<T extends ThemeId>(theme: T): SimRunner<T> {
  const w = engine.getState().world;
  // the cosmos and the front start from their own origins (the world time their clock began);
  // before the front's people is chosen its war stands at time 0 with the seed's people
  const war = w.front?.cur ?? null;
  const origin = theme === 'cosmos' ? engine.cosmosOrigin() : theme === 'front' && war ? war.origin : -1;
  const race = theme === 'front' ? engine.frontRace() : undefined;
  const key =
    theme === 'cosmos'
      ? `${w.id}:${w.base.W}:cosmos@${origin}`
      : theme === 'front'
        ? `${w.id}:${w.base.W}:front@${war ? origin : `pending${w.bankedMs}`}:${race}`
        : `${w.id}:${w.base.W}:${theme}`;
  let r = runners.get(key) as SimRunner<T> | undefined;
  if (!r) {
    const own = theme === 'cosmos' ? ':cosmos@' : theme === 'front' ? ':front@' : null;
    for (const k of runners.keys()) {
      if (!k.startsWith(`${w.id}:${w.base.W}:`) || (own && k.includes(own))) runners.delete(k);
    }
    // a war not begun yet is shown at its time 0 (its runner starts at the current world time)
    const base = theme === 'cosmos' ? { W: origin, legacy: null } : theme === 'front' ? { W: war ? origin : engine.worldTime(), legacy: null } : w.base;
    const stored = theme === 'front' && !war ? null : readCheckpoint(theme);
    r = new SimRunner(theme, { id: w.id, seed: w.seed, base, race }, stored, engine.worldTime());
    runners.set(key, r as SimRunner);
  }
  setPace(w.pace ?? EMPTY);
  if (theme === 'cosmos') setCosmosRecords(w.cosmos?.past, w.cosmos?.dates);
  if (theme === 'front') setFrontRecords(!!war, w.front?.past, w.front?.dates);
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
