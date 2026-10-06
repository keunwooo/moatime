/**
 * localStorage persistence with validation, graceful failure and data-version migration.
 *
 * World time and restore info are the priority: if a full save fails, a minimal save
 * (without the archive) is attempted, and a tiny world-only backup is kept.
 *
 * Data version 3 (living world) lives under `moa:v3:*`. An older state is migrated once:
 *   - version 2 (`moa:v2:*`, work simulation v1) and version 1 (`moa:v1:*`, timer-spawn rules)
 *   - its raw text is preserved under `moa:v3:pre-migration`, the old keys are left untouched
 *   - the frozen simulation v1 replays the old world to its banked time and the new state
 *     records, per theme, the units complete there and the progress of the next one; the
 *     current simulation starts from that point (`world.base`).
 * Migration is a pure function of the stored data, so running it again yields the same result
 * and never grants extra starting resources. The replay module is loaded only when needed
 * (`setProgressSnapshot`); without it the old base is kept and replayed under current rules.
 */

import {
  DATA_VERSION,
  DEFAULT_SETTINGS,
  initialState,
  type ArchivedWorld,
  type Persisted,
  type Session,
  type Settings,
  type World,
} from './session';
import { CURRENT_RULES_VERSION, LEGACY_RULES } from './rules';
import type { SimBase, SpaceThemeBase, ThemeBase } from '../sim/types';
import { PACE, type PaceSeg } from '../world/pace';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export let STATE_KEY = 'moa:v3:state';
export let BACKUP_KEY = 'moa:v3:world-backup';
export let CORRUPT_KEY = 'moa:v3:corrupt';
export let PRE_MIGRATION_KEY = 'moa:v3:pre-migration';
export let V2_STATE_KEY = 'moa:v2:state';
export let V2_BACKUP_KEY = 'moa:v2:world-backup';
/** Checkpoints of the v2 app: only used to speed up the migration replay. */
export let V2_SIM_KEY_PREFIX = 'moa:v2:sim:';
export let LEGACY_STATE_KEY = 'moa:v1:state';
export let LEGACY_BACKUP_KEY = 'moa:v1:world-backup';
/** Prefix of per-theme simulation checkpoints (caches). */
export let SIM_KEY_PREFIX = 'moa:v3:sim:';

/** Development only: isolates a test world under its own keys (e.g. `?store=lab`). */
export function setStorageNamespace(ns: string) {
  const clean = ns.replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
  const p = (v: string) => (clean ? `moa:${clean}:${v}` : `moa:${v}`);
  STATE_KEY = `${p('v3')}:state`;
  BACKUP_KEY = `${p('v3')}:world-backup`;
  CORRUPT_KEY = `${p('v3')}:corrupt`;
  PRE_MIGRATION_KEY = `${p('v3')}:pre-migration`;
  V2_STATE_KEY = `${p('v2')}:state`;
  V2_BACKUP_KEY = `${p('v2')}:world-backup`;
  V2_SIM_KEY_PREFIX = `${p('v2')}:sim:`;
  LEGACY_STATE_KEY = `${p('v1')}:state`;
  LEGACY_BACKUP_KEY = `${p('v1')}:world-backup`;
  SIM_KEY_PREFIX = `${p('v3')}:sim:`;
}

export function browserStorage(): StorageLike | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = '__moa_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  failWrites = false;
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonNeg = (v: unknown): v is number => isNum(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 200;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validProgress(l: unknown): ThemeBase | null {
  if (!isObj(l) || !isNonNeg(l.units) || !Number.isSafeInteger(l.units) || !isNonNeg(l.partial) || l.partial >= 1) return null;
  return { units: l.units, partial: l.partial };
}

/** A simulation base. Version 2 stores {W, legacy}; version 3 may add per-theme progress. */
function validBase(v: unknown, version: 2 | 3): SimBase | null {
  if (!isObj(v) || !isNonNeg(v.W)) return null;
  let legacy: SimBase['legacy'] = null;
  if (v.legacy !== null && v.legacy !== undefined) {
    legacy = validProgress(v.legacy);
    if (!legacy) return null;
  }
  const base: SimBase = { W: v.W, legacy };
  if (version === 3) {
    if (v.forest !== undefined) {
      const f = validProgress(v.forest);
      if (!f) return null;
      base.forest = f;
    }
    if (v.space !== undefined) {
      const sp = validProgress(v.space);
      const kf = isObj(v.space) ? v.space.kindsFrom : undefined;
      if (!sp || !isNonNeg(kf) || !Number.isSafeInteger(kf)) return null;
      base.space = { ...sp, kindsFrom: kf };
    }
  }
  return base;
}

/** Replays an older world (frozen simulation v1) and reports each theme's progress at W. */
export type ProgressSnapshot = (
  worldId: string,
  seed: number,
  base: SimBase,
  W: number,
  cached: { forest?: unknown; space?: unknown },
) => { forest: ThemeBase; space: SpaceThemeBase };

let progressSnapshot: ProgressSnapshot | null = null;

/** Registers the (lazily loaded) replay used by migration. */
export function setProgressSnapshot(fn: ProgressSnapshot | null) {
  progressSnapshot = fn;
}

/** True when this storage holds an older state that has not been migrated yet. */
export function needsMigration(storage: StorageLike | null): boolean {
  if (!storage || read(storage, STATE_KEY) !== null) return false;
  return [V2_STATE_KEY, V2_BACKUP_KEY, LEGACY_STATE_KEY, LEGACY_BACKUP_KEY].some((k) => read(storage, k) !== null);
}

/**
 * The version 3 base of an older world: the banked time, with each theme's progress there as
 * the frozen simulation computed it. Without the replay the old base is kept as it was.
 */
function upgradeBase(w: World, cached: { forest?: unknown; space?: unknown }): SimBase {
  if (w.bankedMs <= 0) return { W: 0, legacy: null };
  if (!progressSnapshot) return w.base;
  try {
    const p = progressSnapshot(w.id, w.seed, w.base, w.bankedMs, cached);
    return { W: w.bankedMs, legacy: null, forest: p.forest, space: p.space };
  } catch {
    return w.base;
  }
}

/** The simulation base a v1 world gets: its banked time, with the units the old rule grew. */
export function legacyBase(bankedMs: number): SimBase {
  if (bankedMs <= 0) return { W: 0, legacy: null };
  const C = LEGACY_RULES.unitMs;
  const units = Math.floor(bankedMs / C);
  const partial = Math.min(Math.max((bankedMs - units * C) / C, 0), 1 - 1e-9);
  return { W: bankedMs, legacy: { units, partial } };
}

function validWorld(v: unknown, version: 1 | 2 | 3): World | null {
  if (!isObj(v)) return null;
  if (!isStr(v.id) || !isNonNeg(v.seed) || !isNonNeg(v.bankedMs) || !isNum(v.createdAt)) return null;
  if (!Number.isSafeInteger(Math.floor(v.bankedMs))) return null;
  let base: SimBase | null;
  if (version === 1) base = legacyBase(v.bankedMs);
  else base = validBase(v.base, version);
  if (!base || base.W > v.bankedMs) return null;
  const m = v.migratedFrom;
  const migratedFrom =
    version >= 2 && isObj(m) && isNum(m.v) && isNum(m.rulesVersion) && isNonNeg(m.W) && isNum(m.at)
      ? { v: m.v, rulesVersion: m.rulesVersion, W: m.W, at: m.at }
      : undefined;
  const world: World = {
    id: v.id,
    seed: Math.floor(v.seed) >>> 0,
    rulesVersion: version === 1 ? CURRENT_RULES_VERSION : isNum(v.rulesVersion) && v.rulesVersion >= 2 ? Math.floor(v.rulesVersion) : CURRENT_RULES_VERSION,
    bankedMs: v.bankedMs,
    createdAt: v.createdAt,
    base,
  };
  if (migratedFrom) world.migratedFrom = migratedFrom;
  const pace = validPace(v.pace, v.bankedMs);
  if (pace) world.pace = pace;
  const c = v.cosmos;
  // the origin may lie inside the open session (picked while running), never far beyond
  if (isObj(c) && isNonNeg(c.origin) && c.origin <= v.bankedMs + 400 * 24 * 3600_000) {
    world.cosmos = { origin: c.origin, resets: isNonNeg(c.resets) ? Math.floor(c.resets) : 0 };
    if (Array.isArray(c.dates)) {
      const dates = c.dates.filter((d): d is [number, number] => Array.isArray(d) && d.length === 2 && isNonNeg(d[0]) && isNum(d[1])).slice(-PACE.keep);
      if (dates.length) world.cosmos.dates = dates;
    }
    if (Array.isArray(c.past)) {
      const origin = world.cosmos.origin;
      const past = c.past.filter((x): x is number => isNonNeg(x) && x <= origin).slice(-20);
      if (past.length) world.cosmos.past = past;
    }
  }
  return world;
}

/** Session segments (dropped one by one when malformed; never ahead of the banked time). */
function validPace(v: unknown, bankedMs: number): PaceSeg[] | null {
  if (!Array.isArray(v)) return null;
  const out: PaceSeg[] = [];
  for (const x of v.slice(-PACE.keep)) {
    if (!isObj(x) || !isNonNeg(x.w0) || x.w0 > bankedMs + 1) continue;
    const len = x.len === null ? null : isNonNeg(x.len) ? x.len : undefined;
    const w1 = x.w1 === null ? null : isNonNeg(x.w1) && x.w1 >= x.w0 ? x.w1 : undefined;
    if (len === undefined || w1 === undefined) continue;
    const seg: PaceSeg = { w0: x.w0, len, w1 };
    if (isNonNeg(x.raid)) seg.raid = x.raid;
    out.push(seg);
  }
  return out;
}

function validSession(v: unknown): Session | null {
  if (!isObj(v)) return null;
  const status = v.status;
  if (status !== 'running' && status !== 'paused' && status !== 'completed') return null;
  const mode = v.mode;
  if (mode !== 'countdown' && mode !== 'stopwatch') return null;
  if (!isStr(v.id) || !isNonNeg(v.accruedMs) || !isNum(v.startedAt) || !isNonNeg(v.worldMsAtStart)) return null;
  const targetMs = mode === 'countdown' ? (isNonNeg(v.targetMs) && v.targetMs > 0 ? v.targetMs : null) : null;
  if (mode === 'countdown' && targetMs === null) return null;
  const segmentStartedAt = isNum(v.segmentStartedAt) ? v.segmentStartedAt : null;
  if (status === 'running' && segmentStartedAt === null) return null;
  const banked = v.banked === true;
  if (status === 'completed' && !banked) return null;
  return {
    id: v.id,
    mode,
    status,
    targetMs,
    accruedMs: targetMs !== null ? Math.min(v.accruedMs, targetMs) : v.accruedMs,
    segmentStartedAt: status === 'running' ? segmentStartedAt : null,
    startedAt: v.startedAt,
    endedAt: isNum(v.endedAt) ? v.endedAt : null,
    worldMsAtStart: v.worldMsAtStart,
    banked,
    endReason: v.endReason === 'timer' || v.endReason === 'user' ? v.endReason : null,
  };
}

function validSettings(v: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!isObj(v)) return s;
  if (v.theme === 'forest' || v.theme === 'space' || v.theme === 'cosmos') s.theme = v.theme;
  if (v.mode === 'countdown' || v.mode === 'stopwatch') s.mode = v.mode;
  if (isNonNeg(v.countdownMs) && v.countdownMs > 0 && Number.isSafeInteger(v.countdownMs)) s.countdownMs = v.countdownMs;
  if (typeof v.ambientSound === 'boolean') s.ambientSound = v.ambientSound;
  if (typeof v.chime === 'boolean') s.chime = v.chime;
  if (v.motion === 'system' || v.motion === 'reduce' || v.motion === 'full') s.motion = v.motion;
  if (typeof v.cameraLock === 'boolean') s.cameraLock = v.cameraLock;
  if (typeof v.lowPower === 'boolean') s.lowPower = v.lowPower;
  if (typeof v.showDays === 'boolean') s.showDays = v.showDays;
  if (v.effects === 'low' || v.effects === 'default' || v.effects === 'rich') s.effects = v.effects;
  return s;
}

/**
 * Validates a stored state of data version 3, or an older one (version 2 or 1), which is
 * migrated on the way. `cached` are the old app's simulation checkpoints (speed only).
 */
export function validatePersisted(raw: unknown, now = Date.now(), cached: { forest?: unknown; space?: unknown } = {}): Persisted | null {
  if (!isObj(raw) || (raw.v !== 1 && raw.v !== 2 && raw.v !== DATA_VERSION)) return null;
  const version = raw.v as 1 | 2 | 3;
  const world = validWorld(raw.world, version);
  if (!world) return null;
  if (version < DATA_VERSION) {
    const rw = raw.world as Record<string, unknown>;
    const rulesVersion = isNum(rw.rulesVersion) ? (rw.rulesVersion as number) : 1;
    world.base = upgradeBase(world, cached);
    world.migratedFrom = { v: version, rulesVersion, W: world.base.W, at: now };
  }
  let session = raw.session === null || raw.session === undefined ? null : validSession(raw.session);
  // A banked-but-open session would double count; a session from before the world was
  // banked past it is treated as closed.
  if (session && session.banked && session.status !== 'completed') session = null;
  const archive: ArchivedWorld[] = Array.isArray(raw.archive)
    ? raw.archive
        .map((a) => {
          // archived worlds are records only; older ones get a base from their banked time
          const w = validWorld(a, isObj(a) && isObj(a.base) ? 3 : 1);
          if (w && version < DATA_VERSION) delete w.migratedFrom;
          return w && isObj(a) && isNum(a.archivedAt) ? { ...w, archivedAt: a.archivedAt } : null;
        })
        .filter((a): a is ArchivedWorld => a !== null)
        .slice(0, 12)
    : [];
  const marks = isObj(raw.marks) && (isStr(raw.marks.celebratedSessionId) || raw.marks.celebratedSessionId === null)
    ? { celebratedSessionId: raw.marks.celebratedSessionId as string | null }
    : { celebratedSessionId: null };
  return {
    v: DATA_VERSION,
    rev: isNonNeg(raw.rev) ? Math.floor(raw.rev) : 0,
    updatedAt: isNum(raw.updatedAt) ? raw.updatedAt : 0,
    world,
    session,
    settings: validSettings(raw.settings),
    marks,
    archive,
  };
}

export interface LoadResult {
  state: Persisted;
  source: 'primary' | 'migrated' | 'backup' | 'fresh';
  warning: string | null;
}

export function parseState(text: string | null): Persisted | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    // only the current data version is read from the current key; older ones are migrated
    if (!isObj(raw) || raw.v !== DATA_VERSION) return null;
    return validatePersisted(raw);
  } catch {
    return null;
  }
}

function read(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Reads the newest older state (version 2, else version 1) and converts it; the raw text is
 * preserved once. A state that cannot be read falls back to its world-only backup.
 */
function migrateOlder(storage: StorageLike, now: number): Persisted | null {
  const cached = { forest: parseJson(read(storage, `${V2_SIM_KEY_PREFIX}forest`)), space: parseJson(read(storage, `${V2_SIM_KEY_PREFIX}space`)) };
  const sources: { key: string; v: 1 | 2; backup: boolean }[] = [
    { key: V2_STATE_KEY, v: 2, backup: false },
    { key: V2_BACKUP_KEY, v: 2, backup: true },
    { key: LEGACY_STATE_KEY, v: 1, backup: false },
    { key: LEGACY_BACKUP_KEY, v: 1, backup: true },
  ];
  for (const src of sources) {
    const text = read(storage, src.key);
    if (!text) continue;
    const raw = parseJson(text);
    let state: Persisted | null = null;
    if (!src.backup) {
      if (isObj(raw) && raw.v === src.v) state = validatePersisted(raw, now, src.v === 2 ? cached : {});
    } else {
      // a world-only backup still carries the time
      const w = isObj(raw) ? validWorld(raw.world, src.v) : null;
      if (w) {
        state = initialState(now);
        const rulesVersion = src.v === 1 ? 1 : w.rulesVersion;
        w.base = upgradeBase(w, src.v === 2 ? cached : {});
        state.world = { ...w, migratedFrom: { v: src.v, rulesVersion, W: w.base.W, at: now } };
      }
    }
    if (!state) continue;
    try {
      if (read(storage, PRE_MIGRATION_KEY) === null) {
        storage.setItem(PRE_MIGRATION_KEY, JSON.stringify({ v: src.v, key: src.key, savedAt: now, text: text.slice(0, 200_000) }));
      }
    } catch {
      /* the old keys stay untouched either way */
    }
    return state;
  }
  return null;
}

export function loadState(storage: StorageLike | null, now: number): LoadResult {
  if (!storage) {
    return { state: initialState(now), source: 'fresh', warning: '이 브라우저에서는 저장 공간을 쓸 수 없어 이 탭에서만 풍경이 유지돼요.' };
  }
  const primaryText = read(storage, STATE_KEY);
  const primary = parseState(primaryText);
  if (primary) return { state: primary, source: 'primary', warning: null };

  if (!primaryText) {
    // never saved under version 3: bring an older world along exactly once
    const migrated = migrateOlder(storage, now);
    if (migrated) return { state: migrated, source: 'migrated', warning: null };
  }

  // Primary unreadable: keep the raw text aside and recover the world from the backup.
  if (primaryText) {
    try {
      storage.setItem(CORRUPT_KEY, primaryText.slice(0, 100_000));
    } catch {
      /* ignore */
    }
  }
  let backupWorld: World | null = null;
  try {
    const b = storage.getItem(BACKUP_KEY);
    if (b) backupWorld = validWorld(JSON.parse(b)?.world, 3);
  } catch {
    backupWorld = null;
  }
  if (backupWorld) {
    const state = initialState(now);
    state.world = backupWorld;
    return {
      state,
      source: 'backup',
      warning: primaryText ? '저장된 상태 일부를 읽지 못해 백업에서 풍경을 복원했어요.' : null,
    };
  }
  return {
    state: initialState(now),
    source: 'fresh',
    warning: primaryText ? '저장된 상태를 읽지 못해 새 풍경으로 시작해요. 원본은 따로 보관해 두었어요.' : null,
  };
}

export type SaveResult = { ok: true; minimal: boolean } | { ok: false; error: string };

export function saveState(storage: StorageLike | null, state: Persisted): SaveResult {
  if (!storage) return { ok: false, error: 'no-storage' };
  // The world-only backup is tiny and written first: it is what we protect most.
  try {
    storage.setItem(BACKUP_KEY, JSON.stringify({ world: state.world, savedAt: state.updatedAt }));
  } catch {
    /* continue: the primary write may still succeed */
  }
  try {
    storage.setItem(STATE_KEY, JSON.stringify(state));
    return { ok: true, minimal: false };
  } catch {
    try {
      storage.removeItem(CORRUPT_KEY);
      storage.setItem(STATE_KEY, JSON.stringify({ ...state, archive: [] }));
      return { ok: true, minimal: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'write-failed' };
    }
  }
}
