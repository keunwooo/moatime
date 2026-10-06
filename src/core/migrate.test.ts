import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TimerEngine } from './engine';
import {
  LEGACY_BACKUP_KEY,
  LEGACY_STATE_KEY,
  loadState,
  MemoryStorage,
  needsMigration,
  PRE_MIGRATION_KEY,
  setProgressSnapshot,
  STATE_KEY,
  V2_BACKUP_KEY,
  V2_SIM_KEY_PREFIX,
  V2_STATE_KEY,
} from './persist';
import { worldTime } from './session';
import { initForest } from '../sim/forest';
import { initSpace } from '../sim/space';
import { advanceForest, forestCtx, initForest as initForestV1 } from '../sim/v1/forest';
import { snapshotV1 } from '../sim/v1/snapshot';

const MIN = 60_000;
const H = 60 * MIN;
const NOW = Date.UTC(2026, 9, 5, 9, 0, 0);

/** A state exactly as data version 1 stored it. */
function v1State(bankedMs: number, session: unknown = null) {
  return {
    v: 1,
    rev: 7,
    updatedAt: NOW - 1000,
    world: { id: 'w_old', seed: 1234, rulesVersion: 1, bankedMs, createdAt: NOW - 86_400_000 },
    session,
    settings: { theme: 'space', mode: 'countdown', countdownMs: 25 * MIN, ambientSound: false, chime: true, motion: 'system', cameraLock: false, lowPower: false, showDays: false },
    marks: { celebratedSessionId: null },
    archive: [{ id: 'w_older', seed: 5, rulesVersion: 1, bankedMs: 3_600_000, createdAt: NOW - 9e8, archivedAt: NOW - 8e8 }],
  };
}

/** A state exactly as data version 2 stored it (work simulation v1). */
function v2State(bankedMs: number, base: unknown = { W: 0, legacy: null }, session: unknown = null) {
  return {
    v: 2,
    rev: 11,
    updatedAt: NOW - 1000,
    world: { id: 'w_v2', seed: 1234, rulesVersion: 2, bankedMs, createdAt: NOW - 86_400_000, base },
    session,
    settings: { theme: 'forest', mode: 'countdown', countdownMs: 25 * MIN, ambientSound: false, chime: false, motion: 'system', cameraLock: false, lowPower: false, showDays: false, effects: 'rich' },
    marks: { celebratedSessionId: null },
    archive: [{ id: 'w_prev', seed: 9, rulesVersion: 2, bankedMs: 2 * H, createdAt: NOW - 9e8, archivedAt: NOW - 8e8, base: { W: 0, legacy: null } }],
  };
}

function storageWith(key: string, state: unknown) {
  const s = new MemoryStorage();
  s.setItem(key, JSON.stringify(state));
  return s;
}

describe('frozen simulation v1 (golden values)', () => {
  it('still produces the progress it produced before the freeze', () => {
    expect(snapshotV1('w', 1234, { W: 0, legacy: null }, 2 * H)).toEqual({
      forest: { units: 9, partial: 0.6303093434343434 },
      space: { units: 13, partial: 0.7, kindsFrom: 0 },
    });
    expect(snapshotV1('w', 77, { W: 0, legacy: null }, 5.5 * H)).toEqual({
      forest: { units: 26, partial: 0.06 },
      space: { units: 39, partial: 0.31799934782608696, kindsFrom: 0 },
    });
    expect(snapshotV1('w', 1234, { W: 82.5 * MIN, legacy: { units: 5, partial: 0.5 } }, 3 * H)).toEqual({
      forest: { units: 13, partial: 0.1036679292929293 },
      space: { units: 15, partial: 0.7200885869565217, kindsFrom: 6 },
    });
  });

  it('gives the same result from a stored checkpoint as from the start', () => {
    const f = initForestV1(1234, { W: 0, legacy: null });
    advanceForest(f, forestCtx(1234), 70 * MIN);
    const cp = { worldId: 'w', simVersion: 1, theme: 'forest', baseW: 0, W: 70 * MIN, state: f };
    expect(snapshotV1('w', 1234, { W: 0, legacy: null }, 2 * H, { forest: cp })).toEqual(snapshotV1('w', 1234, { W: 0, legacy: null }, 2 * H));
    // a checkpoint of another world or from the future is ignored
    expect(snapshotV1('other', 1234, { W: 0, legacy: null }, 2 * H, { forest: { ...cp, state: { broken: true } } })).toEqual(snapshotV1('w', 1234, { W: 0, legacy: null }, 2 * H));
  });
});

describe('data migration v2 → v3 (with the frozen replay)', () => {
  beforeEach(() => setProgressSnapshot(snapshotV1));
  afterEach(() => setProgressSnapshot(null));

  it('keeps each theme exactly where the old simulation had it', () => {
    const storage = storageWith(V2_STATE_KEY, v2State(2 * H));
    expect(needsMigration(storage)).toBe(true);
    const before = storage.getItem(V2_STATE_KEY);
    const r = loadState(storage, NOW);
    expect(r.source).toBe('migrated');
    const s = r.state;
    expect(s.v).toBe(3);
    expect(s.world.id).toBe('w_v2');
    expect(s.world.bankedMs).toBe(2 * H);
    expect(s.world.base).toEqual({
      W: 2 * H,
      legacy: null,
      forest: { units: 9, partial: 0.6303093434343434 },
      space: { units: 13, partial: 0.7, kindsFrom: 0 },
    });
    expect(s.world.migratedFrom).toMatchObject({ v: 2, rulesVersion: 2, W: 2 * H });
    expect(s.settings.effects).toBe('rich');
    expect(s.archive).toHaveLength(1);
    // the current simulation starts from those units
    expect(initForest(1234, s.world.base).done).toBe(9);
    expect(initSpace(1234, s.world.base).done).toBe(13);
    // the old keys stay as they were; a copy of the old text is kept once
    expect(storage.getItem(V2_STATE_KEY)).toBe(before);
    expect(JSON.parse(storage.getItem(PRE_MIGRATION_KEY)!)).toMatchObject({ v: 2, text: before });
  });

  it('carries the kinds of facilities that came from the timer rules through a second migration', () => {
    const base = { W: 82.5 * MIN, legacy: { units: 5, partial: 0.5 } };
    const s = loadState(storageWith(V2_STATE_KEY, v2State(3 * H, base)), NOW).state;
    expect(s.world.base.space).toEqual({ units: 15, partial: 0.7200885869565217, kindsFrom: 6 });
    expect(initSpace(1234, s.world.base).legacyUnits).toBe(6);
  });

  it('uses the old checkpoints only for speed', () => {
    const plain = loadState(storageWith(V2_STATE_KEY, v2State(2 * H)), NOW).state.world.base;
    const storage = storageWith(V2_STATE_KEY, v2State(2 * H));
    const f = initForestV1(1234, { W: 0, legacy: null });
    advanceForest(f, forestCtx(1234), 50 * MIN);
    storage.setItem(`${V2_SIM_KEY_PREFIX}forest`, JSON.stringify({ worldId: 'w_v2', simVersion: 1, theme: 'forest', baseW: 0, W: 50 * MIN, state: f }));
    expect(loadState(storage, NOW).state.world.base).toEqual(plain);
  });

  it('runs once: after the first save the v3 state is used and nothing is granted again', () => {
    const storage = storageWith(V2_STATE_KEY, v2State(2 * H));
    const e1 = new TimerEngine({ storage, now: () => NOW });
    expect(storage.getItem(STATE_KEY)).not.toBeNull();
    expect(needsMigration(storage)).toBe(false);
    const pre = storage.getItem(PRE_MIGRATION_KEY);
    const e2 = new TimerEngine({ storage, now: () => NOW + 5000 });
    expect(e2.getState().world).toEqual(e1.getState().world);
    expect(storage.getItem(PRE_MIGRATION_KEY)).toBe(pre);
    expect(loadState(storage, NOW + 9000).source).toBe('primary');
  });

  it('is a pure function of the old data (two tabs migrating at once agree)', () => {
    const a = loadState(storageWith(V2_STATE_KEY, v2State(5.5 * H)), NOW).state;
    const b = loadState(storageWith(V2_STATE_KEY, v2State(5.5 * H)), NOW + 60_000).state;
    expect(a.world.base).toEqual(b.world.base);
  });

  it('carries a running session on without losing or doubling time', () => {
    const sess = {
      id: 's1',
      mode: 'countdown',
      status: 'running',
      targetMs: 25 * MIN,
      accruedMs: 4 * MIN,
      segmentStartedAt: NOW - 2 * MIN,
      startedAt: NOW - 10 * MIN,
      endedAt: null,
      worldMsAtStart: 30 * MIN,
      banked: false,
      endReason: null,
    };
    const e = new TimerEngine({ storage: storageWith(V2_STATE_KEY, v2State(30 * MIN, { W: 0, legacy: null }, sess)), now: () => NOW });
    const s = e.getState();
    expect(s.session?.status).toBe('running');
    // banked time is the migration point; the open session adds its 6 minutes once
    expect(s.world.base.W).toBe(30 * MIN);
    expect(worldTime(s, NOW)).toBe(36 * MIN);
  });

  it('recovers the world from the v2 backup when the v2 state is unreadable', () => {
    const storage = new MemoryStorage();
    storage.setItem(V2_STATE_KEY, '{broken');
    storage.setItem(V2_BACKUP_KEY, JSON.stringify({ world: v2State(2 * H).world, savedAt: NOW }));
    const r = loadState(storage, NOW);
    expect(r.source).toBe('migrated');
    expect(r.state.world.bankedMs).toBe(2 * H);
    expect(r.state.world.base.forest).toEqual({ units: 9, partial: 0.6303093434343434 });
  });

  it('prefers v2 over v1, and an existing v3 state over both', () => {
    const storage = storageWith(V2_STATE_KEY, v2State(2 * H));
    storage.setItem(LEGACY_STATE_KEY, JSON.stringify(v1State(999 * MIN)));
    const e = new TimerEngine({ storage, now: () => NOW });
    expect(e.getState().world.id).toBe('w_v2');
    storage.setItem(V2_STATE_KEY, JSON.stringify(v2State(50 * H)));
    expect(loadState(storage, NOW).state.world.bankedMs).toBe(2 * H);
  });

  it('a version 1 world goes through both migrations', () => {
    const banked = 5 * 15 * MIN + 7.5 * MIN; // 5 units by the timer rules, the sixth half grown
    const r = loadState(storageWith(LEGACY_STATE_KEY, v1State(banked)), NOW);
    expect(r.state.v).toBe(3);
    expect(r.state.world.migratedFrom).toMatchObject({ v: 1, rulesVersion: 1, W: banked });
    // the frozen simulation starts from the timer-rule units, at the banked time itself
    expect(r.state.world.base).toEqual({ W: banked, legacy: null, ...snapshotV1('w_old', 1234, { W: banked, legacy: { units: 5, partial: 0.5 } }, banked) });
    expect(r.state.world.base.forest?.units).toBe(5);
    expect(r.state.world.base.space?.kindsFrom).toBe(6);
  });
});

describe('data migration without the replay module', () => {
  it('keeps the old base so nothing is lost (the current rules replay from it)', () => {
    const r = loadState(storageWith(V2_STATE_KEY, v2State(2 * H, { W: 82.5 * MIN, legacy: { units: 5, partial: 0.5 } })), NOW);
    expect(r.state.v).toBe(3);
    expect(r.state.world.base).toEqual({ W: 82.5 * MIN, legacy: { units: 5, partial: 0.5 } });
  });

  it('version 1: units of the timer rules, the raw text preserved, old keys untouched', () => {
    const banked = 5 * 15 * MIN + 7.5 * MIN;
    const storage = storageWith(LEGACY_STATE_KEY, v1State(banked));
    const before = storage.getItem(LEGACY_STATE_KEY);
    const s = loadState(storage, NOW).state;
    expect(s.world.base).toEqual({ W: banked, legacy: { units: 5, partial: 0.5 } });
    expect(s.settings.theme).toBe('space');
    expect(s.settings.chime).toBe(true);
    expect(s.settings.effects).toBe('default');
    expect(storage.getItem(LEGACY_STATE_KEY)).toBe(before);
    expect(JSON.parse(storage.getItem(PRE_MIGRATION_KEY)!)).toMatchObject({ v: 1, text: before });
    expect(initForest(1234, s.world.base).done).toBe(5);
    expect(initSpace(1234, s.world.base).done).toBe(5);
  });

  it('recovers a version 1 world from its backup', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STATE_KEY, '{broken');
    storage.setItem(LEGACY_BACKUP_KEY, JSON.stringify({ world: v1State(45 * MIN).world, savedAt: NOW }));
    const r = loadState(storage, NOW);
    expect(r.source).toBe('migrated');
    expect(r.state.world.bankedMs).toBe(45 * MIN);
    expect(r.state.world.base.legacy).toEqual({ units: 3, partial: 0 });
  });

  it('a fresh visitor starts a new world at the beginning of the simulation', () => {
    const r = loadState(new MemoryStorage(), NOW);
    expect(r.source).toBe('fresh');
    expect(r.state.v).toBe(3);
    expect(r.state.world.base).toEqual({ W: 0, legacy: null });
  });
});
