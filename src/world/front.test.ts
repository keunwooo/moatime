import { describe, expect, it } from 'vitest';
import { BATTLE_PACE, frontBattles, frontHeadlineAt, gradeOpens, operationName, operations, pickGrade, tideAt } from './front';
import { advanceFront, frontPlanet, heldCount, initFront, OPEN, orbitPlanet, planetsTo, RELAND } from '../sim/front';
import type { PaceSeg } from './pace';
import { chooseRace, createNewWorld, defaultRace, finish, frontOrigin, frontRace, initialState, newWar, start, withFrontOrigin } from '../core/session';

const S = 1000;
const MIN = 60_000;
const H = 3_600_000;
const SEEDS = [1, 42, 424242, 9001];

function back2back(len: number, n: number, from = 0): PaceSeg[] {
  return Array.from({ length: n }, (_, i) => ({ w0: from + i * len, len, w1: from + (i + 1) * len }));
}

describe('front battles', () => {
  it('none in the opening; a 5-minute session after it sees one, a 25-minute one three to five', () => {
    for (const seed of SEEDS) {
      const short = back2back(5 * MIN, 60);
      const b5 = frontBattles(seed, 0, short);
      for (const b of b5) expect(b.t0).toBeGreaterThanOrEqual(OPEN.end);
      let seen = 0;
      let total = 0;
      for (let i = 6; i < 60; i++) {
        const w0 = i * 5 * MIN;
        total++;
        const own = b5.filter((b) => b.t0 >= w0 && b.t1 <= w0 + 5 * MIN);
        let any = own.length > 0;
        // otherwise a milestone or a site fight was the session's show
        for (let W = w0; W < w0 + 5 * MIN && !any; W += 5 * S) any = frontHeadlineAt(seed, 0, W, short) !== null;
        if (any) seen++;
      }
      expect(seen / total).toBeGreaterThan(0.9);
      const long = back2back(25 * MIN, 24);
      const b25 = frontBattles(seed, 0, long);
      let sum = 0;
      for (let i = 1; i < 24; i++) {
        const w0 = i * 25 * MIN;
        const own = b25.filter((b) => b.t0 >= w0 && b.t0 < w0 + 25 * MIN);
        expect(own.length).toBeGreaterThanOrEqual(1);
        expect(own.length).toBeLessThanOrEqual(6);
        sum += own.length;
        for (const b of own) expect(b.t1).toBeLessThanOrEqual(w0 + 25 * MIN);
      }
      expect(sum / 23).toBeGreaterThanOrEqual(2.8);
      expect(sum / 23).toBeLessThanOrEqual(5.5);
      for (let i = 1; i < b25.length; i++) expect(b25[i].t0 - b25[i - 1].t0).toBeGreaterThanOrEqual(BATTLE_PACE.minGapMs - 1);
    }
  });

  it('newer grades open with tech, older ones keep coming, never three of one grade running', () => {
    for (const seed of SEEDS) {
      const segs = back2back(25 * MIN, 60);
      const bs = frontBattles(seed, 0, segs);
      const opens = gradeOpens(seed);
      for (const b of bs) expect(b.t0).toBeGreaterThanOrEqual(opens[Math.min(b.grade, 5)] - 1);
      const late = bs.filter((b) => b.t0 > 6 * H && !b.away);
      const grades = new Set(late.map((b) => b.grade));
      expect(grades.size).toBeGreaterThanOrEqual(4);
      for (let i = 2; i < bs.length; i++) {
        // storm sights are grade 1; while an orbit is being won only orbit battles come
        if (bs[i].grade === 1 || orbitPlanet(seed, bs[i].t0)) continue;
        expect(bs[i].grade === bs[i - 1].grade && bs[i].grade === bs[i - 2].grade).toBe(false);
      }
    }
    // the weights: newest 40%, below 30%, rest 30%
    let top = 0;
    for (let i = 0; i < 1000; i++) if (pickGrade(5, i / 1000) === 5) top++;
    expect(top / 1000).toBeCloseTo(0.4, 1);
  });

  it('battles elsewhere start with two held planets, never twice running, at most two in 15 minutes', () => {
    for (const seed of SEEDS) {
      const segs = back2back(25 * MIN, 60);
      const bs = frontBattles(seed, 0, segs);
      let prevAway = false;
      const away = bs.filter((b) => b.away);
      expect(away.length).toBeGreaterThan(5);
      for (const b of bs) {
        if (b.away) {
          expect(heldCount(seed, b.t0)).toBeGreaterThanOrEqual(2);
          expect(prevAway).toBe(false);
          expect(b.planet).toBeLessThan(heldCount(seed, b.t0));
          expect(away.filter((x) => x.t0 <= b.t0 && x.t0 > b.t0 - 15 * MIN).length).toBeLessThanOrEqual(2);
        } else expect(b.planet).toBe(orbitPlanet(seed, b.t0)?.idx ?? frontPlanet(seed, b.t0).idx);
        prevAway = b.away;
      }
      const share = away.length / bs.filter((b) => heldCount(seed, b.t0) >= 2).length;
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.42);
    }
  });

  it('is the same for the same sessions, and closing a session early drops only its future', () => {
    const seed = 7;
    const segs = back2back(25 * MIN, 30);
    const a = frontBattles(seed, 0, segs);
    const b = frontBattles(seed, 0, segs.map((x) => ({ ...x })));
    expect(b).toEqual(a);
    const cut = [...segs.slice(0, 29), { ...segs[29], w1: segs[29].w0 + 10 * MIN }];
    const c = frontBattles(seed, 0, cut);
    const before = a.filter((x) => x.t1 <= segs[29].w0 + 10 * MIN - 60 * S);
    expect(c.slice(0, before.length)).toEqual(before);
  });

  it('battles never touch the war itself', () => {
    const seed = 99;
    const s1 = initFront(seed, 0);
    const s2 = initFront(seed, 0);
    frontBattles(seed, 0, back2back(25 * MIN, 40));
    advanceFront(s1, 15 * H);
    advanceFront(s2, 15 * H);
    expect(s1).toEqual(s2);
  });

  it('no session battles in a landing opening', () => {
    for (const seed of SEEDS) {
      const bs = frontBattles(seed, 0, back2back(25 * MIN, 50));
      for (const p of planetsTo(seed, 20 * H).slice(1, 6)) for (const b of bs) expect(b.t0 >= p.landAt && b.t0 < p.landAt + RELAND.end).toBe(false);
    }
  });
});

describe('front tide', () => {
  it('blends smoothly and storms in its phase', () => {
    const seed = 3;
    let prev = tideAt(seed, OPEN.end);
    for (let A = OPEN.end; A < 6 * H; A += 5 * S) {
      const t = tideAt(seed, A);
      expect(Math.abs(t.march - prev.march)).toBeLessThan(0.12);
      expect(Math.abs(t.storm - prev.storm)).toBeLessThan(0.12);
      prev = t;
    }
    expect(tideAt(seed, OPEN.end + 3 * 12 * MIN + 6 * MIN).storm).toBeCloseTo(1, 5);
  });
});

describe('front operations', () => {
  it('names are fixed by the session and records follow the sessions', () => {
    expect(operationName(1, 1000)).toBe(operationName(1, 1000));
    expect(operationName(1, 1000)).toMatch(/작전$/);
    const segs = back2back(25 * MIN, 8);
    const ops = operations(5, 0, segs);
    expect(ops.length).toBe(8);
    expect(ops[0].armyGain).toBeGreaterThan(10);
    expect(ops.some((o) => o.sitesWon > 0)).toBe(true);
    const short = operations(5, 0, [{ w0: 0, len: 60 * S, w1: 60 * S }]);
    expect(short.length).toBe(0);
  });
});

describe('front war record', () => {
  it('a people is chosen once; a session without a choice takes the seed\'s; new war opens the choice', () => {
    let s = initialState(0, 1234);
    s = { ...s, settings: { ...s.settings, theme: 'front' } };
    expect(frontRace(s)).toBe(defaultRace(1234));
    expect(withFrontOrigin(s, 0)).toBe(s);
    const picked = chooseRace(s, 0, 2);
    expect(picked.world.front?.cur).toEqual({ origin: 0, race: 2 });
    expect(chooseRace(picked, 10, 1)).toBe(picked);
    // a session started without a choice
    const run = start(s, 0, { mode: 'countdown', targetMs: 25 * MIN });
    expect(run.world.front?.cur?.race).toBe(defaultRace(1234));
    expect(run.world.front?.dates?.length).toBe(1);
    const done = finish(run, 25 * MIN);
    expect(frontOrigin(done, 25 * MIN)).toBe(0);
    const again = newWar(done);
    expect(again.world.front?.cur).toBeUndefined();
    expect(again.world.front?.past).toEqual([{ origin: 0, race: defaultRace(1234) }]);
    expect(again.world.front?.resets).toBe(1);
    expect(again.world.bankedMs).toBe(done.world.bankedMs);
    expect(frontOrigin(again, 30 * MIN)).toBe(25 * MIN);
    // switching to the front while a session runs begins the war with the seed's people
    let f = initialState(0, 55);
    f = start(f, 0, { mode: 'countdown', targetMs: 25 * MIN });
    f = { ...f, settings: { ...f.settings, theme: 'front' } };
    const g = withFrontOrigin(f, 5 * MIN);
    expect(g.world.front?.cur).toEqual({ origin: 5 * MIN, race: defaultRace(55) });
    // a new world has no war
    expect(createNewWorld(g, 6 * MIN).world.front).toBeUndefined();
  });
});
