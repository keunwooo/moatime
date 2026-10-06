import { describe, expect, it } from 'vitest';
import {
  constellationName,
  constellationOf,
  constellations,
  cosmosHeadlineAt,
  cosmosSights,
  fieldStar,
  SIGHT_PACE,
  spaceWeatherAt,
  STAR_FIELD,
} from './cosmos';
import { CHRON, CIV, contactAt, cosmosStage, homeColonies, milestones, systemsDone } from '../sim/cosmos';
import { advanceCosmos, initCosmos } from '../sim/cosmos';
import type { PaceSeg } from './pace';
import { initialState, newUniverse, start, withCosmosOrigin, finish, createNewWorld } from '../core/session';

const S = 1000;
const MIN = 60_000;
const HOUR = 60 * MIN;

function back2back(len: number, n: number, from = 0): PaceSeg[] {
  return Array.from({ length: n }, (_, i) => ({ w0: from + i * len, len, w1: from + (i + 1) * len }));
}

describe('cosmos session sights', () => {
  it('none in the chronicle; every 5-minute session after it sees something, over before it ends', () => {
    for (const seed of [1, 2, 3, 424242]) {
      const segs = back2back(5 * MIN, 40);
      const sights = cosmosSights(seed, 0, segs);
      for (const e of sights) expect(e.t0).toBeGreaterThanOrEqual(CHRON.end);
      let own1 = 0;
      for (let i = 5; i < 40; i++) {
        const w0 = i * 5 * MIN;
        const own = sights.filter((e) => e.t0 >= w0 && e.t0 < w0 + 5 * MIN);
        if (own.length) own1++;
        else {
          // a milestone or a rare sight took its place
          let seen = false;
          for (let W = w0; W < w0 + 5 * MIN && !seen; W += 5 * S) seen = cosmosHeadlineAt(seed, 0, W, segs) !== null;
          expect(seen).toBe(true);
        }
        for (const e of own) {
          expect(e.t1).toBeLessThanOrEqual(w0 + 5 * MIN);
          expect(e.t1 - e.t0).toBeGreaterThanOrEqual(SIGHT_PACE.minDurMs);
        }
      }
      expect(own1).toBeGreaterThanOrEqual(32);
      for (let i = 1; i < sights.length; i++) {
        expect(sights[i].t0 - sights[i - 1].t0).toBeGreaterThanOrEqual(SIGHT_PACE.minGapMs - 1);
        expect(sights[i].kind).not.toBe(sights[i - 1].kind);
      }
    }
  });

  it('a 25-minute session sees three to five; a session under two minutes none', () => {
    for (const seed of [5, 6, 7]) {
      const segs = back2back(25 * MIN, 12, HOUR);
      const sights = cosmosSights(seed, 0, segs);
      for (let i = 0; i < 12; i++) {
        const w0 = HOUR + i * 25 * MIN;
        const own = sights.filter((e) => e.t0 >= w0 && e.t0 < w0 + 25 * MIN);
        expect(own.length).toBeGreaterThanOrEqual(3);
        expect(own.length).toBeLessThanOrEqual(5);
      }
      expect(cosmosSights(seed, 0, back2back(90 * S, 30, HOUR))).toHaveLength(0);
    }
  });

  it('sights wait for milestones and are picked for the stage', () => {
    for (const seed of [1, 8]) {
      const sights = cosmosSights(seed, 0, back2back(25 * MIN, 30));
      for (const e of sights) {
        for (const m of milestones(seed)) expect(e.t1 <= m.A || e.t0 >= m.A + m.dur).toBe(true);
        const stage = cosmosStage(seed, e.t0);
        if (e.kind === 'aurora' || e.kind === 'moonShadow') expect(stage).toBeGreaterThanOrEqual(8);
        if (e.kind === 'orbitLight') expect(stage).toBe(10);
      }
    }
  });

  it('meteor showers come early; fleets and clashes wait for the peoples to exist', () => {
    for (const seed of [1, 2, 424242]) {
      const sights = cosmosSights(seed, 0, back2back(25 * MIN, 72));
      const kinds = (k: string) => sights.filter((e) => e.kind === k);
      expect(kinds('meteorShower').length).toBeGreaterThan(0);
      expect(Math.min(...kinds('meteorShower').map((e) => e.t0))).toBeLessThan(8 * HOUR);
      for (const e of kinds('battle')) expect(e.t0).toBeGreaterThanOrEqual(contactAt(seed));
      for (const e of kinds('fleet')) expect(e.t0).toBeGreaterThanOrEqual(CIV.interstellar);
      const second = homeColonies(seed, 100 * HOUR)[1].at;
      for (const e of kinds('convoy')) expect(e.t0).toBeGreaterThanOrEqual(second);
      // once there is someone to fight, clashes are the most common sight
      const after = sights.filter((e) => e.t0 >= contactAt(seed));
      expect(kinds('battle').length).toBeGreaterThanOrEqual(Math.floor(after.length / 6));
    }
  });

  it('runs on the universe age: a later origin shifts the sights with it', () => {
    const origin = 7 * HOUR;
    const segs = back2back(25 * MIN, 6, origin);
    const sights = cosmosSights(4, origin, segs);
    for (const e of sights) expect(e.t0 - origin).toBeGreaterThanOrEqual(CHRON.end);
    expect(cosmosHeadlineAt(4, origin, origin + 10 * S, segs)?.kind).toBe('ms:bang');
  });

  it('sights never change the universe', () => {
    const a = initCosmos(3);
    const b = initCosmos(3);
    advanceCosmos(a, 6 * HOUR);
    cosmosSights(3, 0, back2back(5 * MIN, 72));
    advanceCosmos(b, 6 * HOUR);
    expect(a).toEqual(b);
  });
});

describe('cosmos sky', () => {
  it('space weather is calm in the chronicle and in the first block, and eases in and out', () => {
    expect(spaceWeatherAt(1, 10 * MIN).id).toBe('clear');
    expect(spaceWeatherAt(1, CHRON.end + 20 * MIN).id).toBe('clear');
    let prev = spaceWeatherAt(1, 0);
    for (let A = 0; A < 20 * HOUR; A += 20 * S) {
      const w = spaceWeatherAt(1, A);
      expect(Math.abs(w.dust - prev.dust) + Math.abs(w.wind - prev.wind) + Math.abs(w.glow - prev.glow)).toBeLessThan(0.2);
      prev = w;
    }
  });

  it('background stars keep clear of the timer', () => {
    for (const aspect of ['wide', 'tall'] as const) {
      const t = STAR_FIELD[aspect].timer;
      let inside = 0;
      for (let i = 0; i < 2000; i++) {
        const s = fieldStar(9, i, aspect);
        if (s.x >= t[0] && s.x <= t[2] && s.y >= t[1] && s.y <= t[3]) inside++;
      }
      expect(inside).toBeLessThan(5);
    }
  });

  it('each session leaves its own constellation, the same every time', () => {
    const a = constellationOf(424242, 30 * MIN, 55 * MIN, 'wide');
    expect(a).not.toBeNull();
    expect(a!.stars.length).toBeGreaterThanOrEqual(4);
    expect(a!.stars.length).toBeLessThanOrEqual(9);
    expect(a!.edges.length).toBe(a!.stars.length - 1);
    expect(constellationOf(424242, 30 * MIN, 55 * MIN, 'wide')).toEqual(a);
    expect(constellationOf(424242, 30 * MIN, 31 * MIN, 'wide')).toBeNull();
    expect(constellationName(1, 0)).toMatch(/자리$/);
    const segs: PaceSeg[] = [...back2back(25 * MIN, 3), { w0: 75 * MIN, len: 60 * S, w1: 76 * MIN }];
    const list = constellations(424242, 0, segs, 'wide', 80 * MIN);
    // the 1-minute session leaves none; the first session's stars start at 4 minutes
    expect(list).toHaveLength(3);
  });
});

describe('cosmos origin', () => {
  it('is recorded once, the first time the theme is on view, and a new universe touches nothing else', () => {
    let s = initialState(0, 11);
    s = start(s, 0, { mode: 'countdown', targetMs: HOUR });
    s = finish(s, 20 * MIN);
    expect(withCosmosOrigin(s, 30 * MIN)).toBe(s);
    s = { ...s, settings: { ...s.settings, theme: 'cosmos' } };
    const a = withCosmosOrigin(s, 30 * MIN);
    expect(a.world.cosmos).toEqual({ origin: 20 * MIN, resets: 0 });
    expect(withCosmosOrigin(a, 40 * MIN)).toBe(a);
    const b = newUniverse(a, 50 * MIN);
    expect(b.world.cosmos).toMatchObject({ origin: 20 * MIN, resets: 1, past: [20 * MIN] });
    expect(b.world.bankedMs).toBe(a.world.bankedMs);
    expect(b.world.base).toBe(a.world.base);
    const fresh = withCosmosOrigin(createNewWorld(b, 60 * MIN), 60 * MIN);
    expect(fresh.world.cosmos).toEqual({ origin: 0, resets: 0 });
    expect(systemsDone(11, 0)).toBe(0);
  });
});
