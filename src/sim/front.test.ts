import { describe, expect, it } from 'vitest';
import {
  advanceFront,
  ALL_SITES,
  CAPITAL_MAX,
  capturesIn,
  cloneFront,
  ESCORT_MAX,
  flagshipAt,
  frontAt,
  frontPlanet,
  frontStage,
  heldCount,
  HOME,
  initFront,
  milestones,
  NAT,
  nextOffensive,
  OPEN,
  openBeat,
  orbitPlanet,
  ownersAt,
  planetsTo,
  planetWorks,
  RIVAL_HOME,
  shipsAt,
  SITE_COUNT,
  stageTimes,
  stockAt,
  tideIndex,
} from './front';
import { armyMix, armyShares, armySize, ARMY_KINDS, ARMY_MAX } from './frontPlan';
import { SimRunner } from './runner';

const S = 1000;
const MIN = 60_000;
const H = 3_600_000;
const SEEDS = [1, 42, 424242, 9001, 77];

describe('front: opening', () => {
  it('beats come in order and the opening ends at 24 min 20 s', () => {
    const t = Object.values(OPEN);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    expect(OPEN.end).toBe(1460 * S);
    expect(openBeat(0)).toBe('mine');
    expect(openBeat(4 * MIN)).toBe('firstUnit');
    expect(openBeat(OPEN.end)).toBeNull();
  });

  it('a five-minute session sees mining, workers, supply, a production building and the first unit', () => {
    for (const seed of SEEDS) {
      const v = frontAt(seed, 0, 5 * MIN);
      expect(v.workers.length).toBeGreaterThanOrEqual(6);
      expect(v.builds.some((b) => b.kind === 'supply' && b.u >= 1)).toBe(true);
      expect(v.builds.some((b) => b.kind === 'barracks' && b.u >= 1)).toBe(true);
      expect(v.armyN).toBeGreaterThanOrEqual(1);
      expect(frontStage(seed, 5 * MIN)).toBeGreaterThanOrEqual(2);
    }
  });

  it('25 minutes reach three bases and a mixed army', () => {
    for (const seed of SEEDS) {
      const v = frontAt(seed, 0, 25 * MIN);
      const bases = v.bases.filter((b) => b.age >= 0 && !b.lost);
      expect(bases.length).toBe(3);
      expect(frontStage(seed, 25 * MIN)).toBe(6);
      expect(v.armyN).toBe(15);
      expect(v.army.t1).toBeLessThan(15);
      expect(v.army.t1b + v.army.t2).toBeGreaterThan(0);
    }
  });
});

describe('front: planets and sites', () => {
  it('the first planet is held at about 1 h 30 min, the next ones every ~2 h', () => {
    for (const seed of SEEDS) {
      const list = planetsTo(seed, 16 * H);
      expect(list[0].conqueredAt).toBeGreaterThanOrEqual(85 * MIN);
      expect(list[0].conqueredAt).toBeLessThanOrEqual(95 * MIN);
      for (let i = 1; i < 7; i++) {
        const gap = list[i].conqueredAt - list[i - 1].conqueredAt;
        expect(gap).toBeGreaterThanOrEqual(100 * MIN);
        expect(gap).toBeLessThanOrEqual(144 * MIN);
        expect(list[i].landAt - list[i].orbitAt).toBe(10 * MIN);
      }
      // a sector of seven planets in about 13–15 hours
      expect(list[6].conqueredAt).toBeGreaterThan(12.5 * H);
      expect(list[6].conqueredAt).toBeLessThan(16 * H);
    }
  });

  it('the home, the natural and held planets are never lost; a lost site is taken back in the next offensive', () => {
    for (const seed of SEEDS) {
      for (const p of planetsTo(seed, 30 * H).slice(0, 12)) {
        let prev = ownersAt(p, p.landAt);
        expect(prev[RIVAL_HOME[0]]).toBe(1);
        for (const e of p.events) {
          const now = ownersAt(p, e.t);
          // the natural is mine once begun and never changes hands
          if (e.t >= (p.idx === 0 ? OPEN.natural : p.landAt + 330 * S)) expect(now[NAT]).toBe(0);
          if (e.kind === 'lose') {
            expect(e.sites.length).toBe(1);
            const site = e.sites[0];
            const back = p.events.find((x) => x.t > e.t && x.to === 0 && x.sites.includes(site));
            expect(back).toBeDefined();
            // within the next offensive phase (or the decisive battle at the latest)
            const off = nextOffensive(e.t);
            expect(back!.t).toBeLessThanOrEqual(Math.max(off + 12 * MIN, p.decisiveAt));
          } else if (e.kind !== 'grab') {
            expect(e.to).toBe(0);
          }
          prev = now;
        }
        // nothing changes hands in the quiet before the decisive battle
        for (const e of p.events) if (e.kind !== 'final') expect(e.t).toBeLessThan(p.decisiveAt - 3 * MIN + 1);
        const end = ownersAt(p, p.conqueredAt);
        for (let i = 0; i < ALL_SITES; i++) expect(end[i]).toBe(0);
        void prev;
      }
    }
  });

  it('every offensive phase on a planet holds at least one fight', () => {
    for (const seed of SEEDS) {
      for (const p of planetsTo(seed, 12 * H).slice(0, 5)) {
        const fights = p.events.filter((e) => e.dur > 0 && e.kind !== 'final' && e.to === 0);
        const first = fights[0].t;
        for (let s = nextOffensive(first); s + 12 * MIN < p.decisiveAt - 3 * MIN; s = nextOffensive(s + 12 * MIN)) {
          expect(fights.some((e) => e.t >= s && e.t < s + 12 * MIN)).toBe(true);
          expect(tideIndex(s)).toBe(2);
        }
      }
    }
  });

  it('the first breakthrough into a rival expansion comes near the hour', () => {
    for (const seed of SEEDS) {
      const p0 = planetsTo(seed, 2 * H)[0];
      expect(p0.breakAt).toBeGreaterThanOrEqual(55 * MIN);
      expect(p0.breakAt).toBeLessThan(80 * MIN);
      const t = stageTimes(seed);
      expect(t[8]).toBe(p0.breakAt);
    }
  });

  it('a 25-minute session after the opening sees at least one site change hands', () => {
    for (const seed of SEEDS) {
      for (let a0 = OPEN.end; a0 < 9 * H; a0 += 25 * MIN) {
        const fights = capturesIn(seed, a0, a0 + 25 * MIN).filter((e) => e.kind !== 'grab');
        // the quiet before a decisive battle and the orbit/landing windows are the only exceptions
        const p = frontPlanet(seed, a0);
        const quiet = a0 + 25 * MIN > p.decisiveAt - 3 * MIN && a0 < p.conqueredAt + 40 * MIN;
        const orbit = orbitPlanet(seed, a0) || orbitPlanet(seed, a0 + 25 * MIN) || a0 < p.landAt + 15 * MIN;
        if (!quiet && !orbit) expect(fights.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('front: ladder and stages', () => {
  it('stages never go down and follow the ladder', () => {
    for (const seed of SEEDS) {
      let last = 0;
      for (let A = 0; A < 12 * H; A += 17 * S) {
        const s = frontStage(seed, A);
        expect(s).toBeGreaterThanOrEqual(last);
        last = s;
      }
      expect(frontStage(seed, 10 * MIN)).toBeGreaterThanOrEqual(3);
      expect(frontStage(seed, 50 * MIN)).toBeGreaterThanOrEqual(7);
      expect(frontStage(seed, 96 * MIN)).toBe(9);
      expect(heldCount(seed, 96 * MIN)).toBe(1);
      const fl = flagshipAt(seed);
      expect(fl).toBeGreaterThanOrEqual(4.75 * H);
      expect(fl).toBeLessThan(6 * H);
      expect(frontStage(seed, fl)).toBe(10);
      expect(heldCount(seed, fl)).toBeGreaterThanOrEqual(2);
    }
  });

  it('ships: escorts from the first conquest, capital ships from 3 h, one flagship', () => {
    for (const seed of SEEDS) {
      const c0 = planetsTo(seed, 0)[0].conqueredAt;
      expect(frontAt(seed, 0, c0 - 1).ships.s1).toBe(0);
      expect(frontAt(seed, 0, c0).ships.s1).toBe(1);
      expect(frontAt(seed, 0, 3 * H).ships.s2).toBe(1);
      expect(frontAt(seed, 0, 20 * H).ships.s3).toBe(1);
    }
  });

  it('milestones are in order and never overlap; anchored ones sit on the schedule', () => {
    for (const seed of SEEDS) {
      const ms = milestones(seed, 30 * H);
      for (let i = 1; i < ms.length; i++) expect(ms[i].A).toBeGreaterThanOrEqual(ms[i - 1].A + ms[i - 1].dur);
      const list = planetsTo(seed, 30 * H);
      const dec = ms.filter((m) => m.id === 'decisive');
      expect(dec[0].A).toBe(list[0].decisiveAt);
      expect(ms.find((m) => m.id === 'orbit')!.A).toBe(list[1].orbitAt);
    }
  });
});

describe('front: army and ledger', () => {
  it('the army grows and its cheap share falls as tiers open', () => {
    let lastN = 0;
    for (let A = 0; A < 20 * H; A += 5 * MIN) {
      const n = armySize(A);
      expect(n).toBeGreaterThanOrEqual(lastN);
      lastN = n;
      const mix = armyMix(A);
      expect(ARMY_KINDS.reduce((a, k) => a + mix[k], 0)).toBe(n);
      const sh = armyShares(A);
      const sum = ARMY_KINDS.reduce((a, k) => a + sh[k], 0);
      if (n > 0) expect(sum).toBeCloseTo(1, 6);
    }
    expect(armyShares(10 * MIN).t1).toBe(1);
    expect(armyShares(5 * H).t1).toBeCloseTo(0.2, 6);
  });

  it('the army and the fleet stop growing (no footer of tens of thousands after a long war)', () => {
    expect(armySize(17 * H)).toBe(ARMY_MAX);
    expect(armySize(2000 * H)).toBe(ARMY_MAX);
    for (const seed of SEEDS.slice(0, 3)) {
      const sh = shipsAt(seed, 2000 * H);
      expect(sh.s1).toBe(ESCORT_MAX);
      expect(sh.s2).toBe(CAPITAL_MAX);
      expect(sh.s3).toBe(1);
      expect(stockAt(seed, 2000 * H).supply).toBeLessThan(1000);
    }
  });

  it('stock never goes negative', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      for (let A = 0; A < 60 * H; A += 3 * MIN) {
        const s = stockAt(seed, A);
        expect(s.ore).toBeGreaterThanOrEqual(0);
        expect(s.heat).toBeGreaterThanOrEqual(0);
        expect(s.crystal).toBeGreaterThanOrEqual(0);
        expect(s.cap).toBeGreaterThanOrEqual(s.supply);
      }
    }
  });

  it('a lost base keeps only what was begun before the loss', () => {
    for (const seed of SEEDS) {
      for (const p of planetsTo(seed, 12 * H).slice(0, 5)) {
        const w = planetWorks(p);
        expect(w.bases[0].site).toBe(HOME);
        for (const b of w.builds) {
          const base = w.bases[b.base];
          if (base.lostAt >= 0) expect(b.t0).toBeLessThan(base.lostAt);
          expect(b.site).toBe(base.site);
        }
        for (const b of w.bases) if (b.site !== HOME && b.site !== NAT) expect(b.site).toBeLessThan(SITE_COUNT);
      }
    }
  });
});

describe('front: runner', () => {
  it('splitting the time changes nothing', () => {
    const seed = 424242;
    const one = initFront(seed, 1, { W: 0, legacy: null });
    advanceFront(one, 9 * H);
    const parts = initFront(seed, 1, { W: 0, legacy: null });
    let x = 7;
    for (let A = 0; A < 9 * H; ) {
      x = (x * 48271) % 2147483647;
      A = Math.min(9 * H, A + 1 + (x % (3 * MIN)));
      advanceFront(parts, A);
    }
    expect(parts).toEqual(one);
    expect(cloneFront(one)).toEqual(one);
  });

  it('runs from its origin and keeps its checkpoints to that origin', () => {
    const origin = 3 * H;
    const r = new SimRunner('front', { id: 'w1', seed: 9, base: { W: origin, legacy: null }, race: 2 });
    const s = r.at(origin + 30 * MIN);
    expect(s.t).toBe(30 * MIN);
    expect(s.race).toBe(2);
    const cp = r.checkpoint();
    expect(r.accepts(cp)).toBe(true);
    const other = new SimRunner('front', { id: 'w1', seed: 9, base: { W: origin + 1, legacy: null }, race: 2 });
    expect(other.accepts(cp)).toBe(false);
    const otherRace = new SimRunner('front', { id: 'w1', seed: 9, base: { W: origin, legacy: null }, race: 0 });
    expect(otherRace.accepts(cp)).toBe(false);
  });

  it('a view of a long war is quick', () => {
    const seed = 5;
    frontAt(seed, 0, 2000 * H);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) frontAt(seed, 0, 2000 * H + i * 16);
    const per = (performance.now() - t0) / 200;
    expect(per).toBeLessThan(4);
  });
});
