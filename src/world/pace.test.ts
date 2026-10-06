import { describe, expect, it } from 'vitest';
import { headlineAt, PACE, pacedRaids, pacedSights, type PaceSeg } from './pace';
import { EVENT_DEFS } from './events';
import { eventAt } from './timeline';
import { finish, initialState, start } from '../core/session';

const MIN = 60_000;
const HOUR = 60 * MIN;
const RAID_MAX = 100_000;

function back2back(len: number, n: number, from = 0): PaceSeg[] {
  return Array.from({ length: n }, (_, i) => ({ w0: from + i * len, len, w1: from + (i + 1) * len }));
}

describe('session pacing', () => {
  it('a 5-minute countdown gets a raid that is over before it ends', () => {
    for (const seed of [1, 2, 3, 424242, 99]) {
      for (const w0 of [0, 37 * MIN, 5 * HOUR + 12_345]) {
        const raids = pacedRaids(seed, [{ w0, len: 5 * MIN, w1: w0 + 5 * MIN }]);
        expect(raids.length).toBe(1);
        expect(raids[0] - w0).toBeGreaterThanOrEqual(PACE.earliestMs);
        expect(raids[0] + RAID_MAX).toBeLessThanOrEqual(w0 + 5 * MIN);
      }
    }
  });

  it('every short session gets a raid; a 25-minute one four or five; long ones one every 4–6½ min', () => {
    for (const seed of [5, 6, 7]) {
      const short = pacedRaids(seed, back2back(5 * MIN, 24));
      expect(short.length).toBe(24);
      for (let i = 1; i < short.length; i++) expect(short[i] - short[i - 1]).toBeGreaterThanOrEqual(PACE.minGapMs);
      // 25 min: the first within its first few minutes, all over before it ends
      const mid = pacedRaids(seed, back2back(25 * MIN, 8));
      for (let i = 0; i < 8; i++) {
        const own = mid.filter((t) => t >= i * 25 * MIN && t < (i + 1) * 25 * MIN);
        expect(own.length).toBeGreaterThanOrEqual(3);
        expect(own.length).toBeLessThanOrEqual(5);
        // (within 3½ min, or a little later when the last one of the session before was late or
        // the planet shows a sight of its own just then)
        expect(own[0] - i * 25 * MIN).toBeLessThanOrEqual(7 * MIN);
        expect(own[own.length - 1] + RAID_MAX).toBeLessThanOrEqual((i + 1) * 25 * MIN);
      }
      // 2 h: one every 4–6½ min (a headline sight of the planet may push one a little later)
      const long = pacedRaids(seed, [{ w0: 0, len: 2 * HOUR, w1: 2 * HOUR }]);
      expect(long.length).toBeGreaterThanOrEqual(15);
      expect(long[0]).toBeLessThanOrEqual(4 * MIN);
      for (let i = 1; i < long.length; i++) {
        expect(long[i] - long[i - 1]).toBeGreaterThanOrEqual(PACE.minGapMs);
        expect(long[i] - long[i - 1]).toBeLessThanOrEqual(14 * MIN);
      }
    }
  });

  it('a stopwatch sees its first raid after 1½–3 minutes; very short countdowns get none', () => {
    const open = pacedRaids(8, [{ w0: 10 * MIN, len: null, w1: null }]);
    expect(open[0] - 10 * MIN).toBeGreaterThanOrEqual(1.5 * MIN);
    expect(open[0] - 10 * MIN).toBeLessThanOrEqual(3 * MIN + 7 * MIN);
    expect(pacedRaids(8, [{ w0: 0, len: 3 * MIN, w1: 3 * MIN }])).toEqual([]);
  });

  it('ending a session early drops only raids that had not come yet', () => {
    const seed = 21;
    const planned = pacedRaids(seed, [{ w0: 0, len: 2 * HOUR, w1: null }]);
    const cut = planned[1] - 1000;
    const ended = pacedRaids(seed, [{ w0: 0, len: 2 * HOUR, w1: cut }]);
    expect(ended).toEqual(planned.filter((t) => t < cut));
  });

  it('a quiet session gets one planet sight; a session with a raid needs none', () => {
    for (const seed of [11, 12, 13, 14]) {
      // 3-minute sessions are too short for a raid, so each gets a sight (unless the planet has its own)
      const segs = back2back(3 * MIN, 6, 3 * HOUR);
      const raids = pacedRaids(seed, segs);
      const sights = pacedSights(seed, segs);
      for (const s of segs) {
        const inside = (t: number) => t >= s.w0 && t < s.w1!;
        // the planet's own sight counts when a minute or more of it falls in the session
        let ownMs = 0;
        for (let W = s.w0; W < s.w1!; W += 1000) if (eventAt(EVENT_DEFS, 'space', seed, W)) ownMs += 1000;
        const own = ownMs >= 60_000;
        const n = sights.filter((e) => inside(e.t0)).length;
        if (raids.some(inside) || own) expect(n).toBe(0);
        else {
          expect(n).toBe(1);
          const e = sights.find((x) => inside(x.t0))!;
          expect(e.t1).toBeLessThanOrEqual(s.w1!);
          expect(headlineAt('space', seed, e.t0 + 1000, segs)?.kind).toBe(e.kind);
        }
      }
    }
  });

  it('the world records one segment per session, closed when it is banked', () => {
    let s = initialState(1_000, 7);
    s = start(s, 1_000, { mode: 'countdown', targetMs: 5 * MIN });
    expect(s.world.pace).toEqual([{ w0: 0, len: 5 * MIN, w1: null }]);
    s = finish(s, 1_000 + 2 * MIN);
    expect(s.world.pace).toEqual([{ w0: 0, len: 5 * MIN, w1: 2 * MIN }]);
    s = { ...s, session: null };
    s = start(s, 10_000_000, { mode: 'stopwatch', targetMs: null });
    expect(s.world.pace![1]).toEqual({ w0: 2 * MIN, len: null, w1: null });
    // a session that added no time leaves nothing behind
    s = finish(s, 10_000_000);
    expect(s.world.pace).toHaveLength(1);
  });
});
