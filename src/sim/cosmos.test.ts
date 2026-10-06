import { describe, expect, it } from 'vitest';
import {
  advanceCosmos,
  cloneCosmos,
  CHRON,
  cometTimes,
  cosmosStage,
  deathAt,
  firstGen,
  galaxyAt,
  gasIn,
  gasPool,
  initCosmos,
  lifePlanetAt,
  milestones,
  oceanAt,
  ocean60At,
  orbitAngle,
  ALIGN_AT,
  ALIGN_EVERY,
  planetsOf,
  stageTimes,
  starKind,
  systemsDone,
  unitAt,
  unitEnd,
  unitStart,
  type CosmosSim,
} from './cosmos';
import { SimRunner } from './runner';
import { cosmosLine, cosmosSummary } from './cosmosDescribe';

const S = 1000;
const MIN = 60_000;
const HOUR = 60 * MIN;

function run(seed: number, stops: number[]): CosmosSim {
  const s = initCosmos(seed, { W: 0, legacy: null });
  for (const a of stops) advanceCosmos(s, a);
  return s;
}

function splits(A: number, n: number, salt: number): number[] {
  const out: number[] = [];
  let x = salt * 7919;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out.push(Math.floor((x / 2147483648) * A));
  }
  out.sort((a, b) => a - b);
  out.push(A);
  return out;
}

describe('cosmos schedule', () => {
  it('the chronicle reaches the first planetary system at 24 min 20 s', () => {
    expect(CHRON.end).toBe(24 * MIN + 20 * S);
    for (const seed of [1, 424242]) {
      expect(cosmosStage(seed, 0)).toBe(1);
      expect(cosmosStage(seed, CHRON.end - 1)).toBe(4);
      expect(cosmosStage(seed, CHRON.end)).toBe(5);
      expect(systemsDone(seed, CHRON.end)).toBe(1);
    }
  });

  it('first stars: five, the first lights at 4 min and explodes at 9 min 30 s, the second at 35 min', () => {
    const fg = firstGen(7);
    expect(fg).toHaveLength(5);
    expect(fg[0]).toEqual({ i: 0, ignite: 240 * S, death: 570 * S });
    expect(fg[1].death).toBe(35 * MIN);
    for (let i = 1; i < 5; i++) {
      expect(fg[i].ignite - fg[i - 1].ignite).toBeGreaterThanOrEqual(30 * S);
      expect(fg[i].ignite).toBeLessThan(CHRON.redGiant);
    }
    for (const s of fg.slice(2)) {
      expect(s.death).toBeGreaterThanOrEqual(50 * MIN);
      expect(s.death).toBeLessThanOrEqual(95 * MIN);
    }
  });

  it('star systems take 9–16 minutes, back to back, and unitAt finds them', () => {
    for (const seed of [3, 11]) {
      let sum = 0;
      for (let k = 1; k <= 400; k++) {
        const d = unitEnd(seed, k) - unitStart(seed, k);
        expect(d).toBeGreaterThanOrEqual(9 * MIN);
        expect(d).toBeLessThanOrEqual(16 * MIN);
        sum += d;
      }
      expect(sum / 400 / MIN).toBeGreaterThan(11.5);
      expect(sum / 400 / MIN).toBeLessThan(13.5);
      const A = unitEnd(seed, 120) + 1234;
      const u = unitAt(seed, A)!;
      expect(u.k).toBe(121);
      expect(u.f).toBeGreaterThan(0);
      expect(u.f).toBeLessThan(1);
      expect(unitAt(seed, 2000 * HOUR)!.k).toBeGreaterThan(9000);
    }
  });

  it('stages follow the design and never go down', () => {
    for (const seed of [1, 2, 3, 424242]) {
      const t = stageTimes(seed);
      for (let i = 2; i <= 10; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
      expect(t[6] / HOUR).toBeGreaterThan(0.75);
      expect(t[6] / HOUR).toBeLessThan(1.3);
      expect(t[7] / HOUR).toBeGreaterThanOrEqual(2);
      expect(t[7] / HOUR).toBeLessThan(2.4);
      expect(t[8]).toBe(3 * HOUR);
      expect(t[9] / HOUR).toBeGreaterThanOrEqual(4);
      expect(t[9] / HOUR).toBeLessThan(4.6);
      expect(t[10]).toBe(8 * HOUR);
      let prev = 1;
      for (let A = 0; A < 12 * HOUR; A += 17 * S) {
        const st = cosmosStage(seed, A);
        expect(st).toBeGreaterThanOrEqual(prev);
        prev = st;
      }
      expect(prev).toBe(10);
    }
  });

  it('milestones are in order and never overlap', () => {
    for (const seed of [1, 5, 424242]) {
      const m = milestones(seed);
      for (let i = 1; i < m.length; i++) expect(m[i].A).toBeGreaterThanOrEqual(m[i - 1].A + m[i - 1].dur);
      expect(m.map((x) => x.id)).toContain('firstLights');
    }
  });

  it('the ocean fills from comets past 60% before life begins', () => {
    for (const seed of [1, 9]) {
      const c = cometTimes(seed);
      expect(c).toHaveLength(24);
      for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
      expect(oceanAt(seed, 69 * MIN)).toBe(0);
      expect(ocean60At(seed)).toBeLessThan(3 * HOUR);
      expect(oceanAt(seed, 3 * HOUR)).toBeGreaterThanOrEqual(0.6);
      expect(oceanAt(seed, 100 * HOUR)).toBeCloseTo(0.7);
    }
  });

  it('the life planet and the galaxy change smoothly', () => {
    let prev = lifePlanetAt(4, 0);
    let prevG = galaxyAt(0);
    for (let A = 0; A < 30 * HOUR; A += 2 * S) {
      const l = lifePlanetAt(4, A);
      const g = galaxyAt(A);
      for (const k of ['formed', 'magma', 'atmosphere', 'clouds', 'green', 'lights'] as const) expect(Math.abs(l[k] - prev[k])).toBeLessThan(0.2);
      for (const k of ['clumps', 'merge', 'disk', 'arms', 'core', 'jets', 'satellites', 'neighbour', 'approach'] as const) expect(Math.abs(g[k] - prevG[k])).toBeLessThan(0.2);
      prev = l;
      prevG = g;
    }
    expect(lifePlanetAt(4, 9 * HOUR).lights).toBeGreaterThan(0);
    expect(lifePlanetAt(4, 2 * HOUR).green).toBe(0);
  });

  it('the home planets line up every 288 minutes', () => {
    for (let n = 0; n < 4; n++) {
      const A = ALIGN_AT + n * ALIGN_EVERY;
      const a = [0, 1, 2].map((i) => ((orbitAngle(i, A) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
      expect(a[0]).toBeCloseTo(a[1], 6);
      expect(a[1]).toBeCloseTo(a[2], 6);
    }
  });
});

describe('cosmos ledger', () => {
  it('5 min five times equals 25 min once; any split gives the same universe', () => {
    for (const seed of [1, 42, 9001]) {
      expect(run(seed, [5, 10, 15, 20, 25].map((m) => m * MIN))).toEqual(run(seed, [25 * MIN]));
      const W = 9 * HOUR;
      expect(run(seed, splits(W, 400, seed))).toEqual(run(seed, [W]));
    }
  });

  it('never runs a resource below zero; what came in = what went out + what is left', () => {
    for (const seed of [2, 77, 424242]) {
      const s = initCosmos(seed);
      for (let A = 0; A <= 60 * HOUR; A += 3 * MIN) {
        advanceCosmos(s, A);
        expect(gasPool(s, A)).toBeGreaterThanOrEqual(0);
        expect(s.dust.in - s.dust.out).toBeGreaterThanOrEqual(0);
        expect(s.ice.in - s.ice.out).toBeGreaterThanOrEqual(0);
        expect(gasIn(A) + s.gas.back).toBe(s.gas.out + gasPool(s, A));
      }
      // every comet found ice to carry
      expect(s.water).toBe(24);
    }
  });

  it('systems are complete on schedule and grow richer with the stardust', () => {
    const seed = 424242;
    const s = initCosmos(seed);
    const avg = (k0: number, k1: number) => {
      let n = 0;
      let c = 0;
      for (let k = k0; k < k1; k++) {
        if (starKind(seed, k) === 'blue') continue;
        const p = planetsOf(s, k);
        if (p) {
          n += p.n;
          c++;
        }
      }
      return n / Math.max(1, c);
    };
    advanceCosmos(s, 8 * HOUR);
    expect(s.done).toBe(systemsDone(seed, 8 * HOUR));
    const early = avg(1, 6);
    const late = avg(s.done - 8, s.done);
    expect(early).toBeLessThan(2.6);
    expect(late).toBeGreaterThan(early + 1);
    for (let k = 1; k < s.done; k++) if (starKind(seed, k) === 'blue' && planetsOf(s, k)) expect(planetsOf(s, k)!.n).toBe(0);
    // blue giants explode later on
    const blue = Array.from({ length: s.done }, (_, k) => k).filter((k) => starKind(seed, k) === 'blue');
    expect(blue.length).toBeGreaterThan(0);
    for (const k of blue) expect(deathAt(seed, k) - unitStart(seed, k)).toBeGreaterThan(40 * MIN);
  });

  it('runs through the runner from the universe origin, with checkpoints', () => {
    const origin = 5 * HOUR;
    const world = { id: 'w1', seed: 3, base: { W: origin, legacy: null } };
    const r = new SimRunner('cosmos', world);
    const a = r.at(origin + 2 * HOUR);
    expect(a.done).toBe(systemsDone(3, 2 * HOUR));
    const cp = r.checkpoint();
    expect(new SimRunner('cosmos', world).accepts(cp)).toBe(true);
    expect(new SimRunner('cosmos', { ...world, base: { W: origin + 1, legacy: null } }).accepts(cp)).toBe(false);
    const back = r.stateAt(origin + 30 * MIN);
    expect(back.origin).toBe(origin);
    expect({ ...back, origin: 0 }).toEqual(run(3, [30 * MIN]));
  });

  it('tells the chronicle and a session in words', () => {
    const s = run(1, [0]);
    expect(cosmosLine(s, 5 * S)).toBe('첫 빛이 퍼지고 있어요.');
    expect(cosmosLine(s, 245 * S)).toContain('첫 별');
    const before = run(1, [0]);
    const after = run(1, [25 * MIN]);
    const sum = cosmosSummary(before, after, 0, 25 * MIN);
    expect(sum.title).toBe('집중한 시간만큼 별이 태어났어요.');
    expect(sum.lines.join(' ')).toContain('첫 행성계');
    expect(cloneCosmos(after)).toEqual(after);
  });
});
