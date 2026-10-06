import { describe, expect, it } from 'vitest';
import { FOREST, RES, SPACE, type Amt } from './config';
import { advanceForest, ANCIENT, cloneForest, compostAt, elderAge, forestCtx, forestStage, forestUnitProgress, initForest, pondAt, pondFill, type ForestSim } from './forest';
import { advanceSpace, amtTotal, cloneSpace, colonyName, depositLeft, depotCapacity, initSpace, needOf, spaceCtx, spaceStage, spaceUnitProgress, type SpaceSim } from './space';
import { SimRunner } from './runner';
import { kindOf } from './spacePlan';
import { detailRows, spaceLine, workLine } from './describe';
import { EVENT_DEFS, EVENT_TEXT } from '../world/events';
import { eventsIn } from '../world/timeline';
import { pacedRaids, type PaceSeg } from '../world/pace';
import type { SimBase } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const fresh: SimBase = { W: 0, legacy: null };

function runSpace(seed: number, base: SimBase, stops: number[], raids: readonly number[] = []): SpaceSim {
  const s = initSpace(seed, base);
  const ctx = spaceCtx(seed, raids);
  for (const w of stops) advanceSpace(s, ctx, w);
  return s;
}

function runForest(seed: number, base: SimBase, stops: number[]): ForestSim {
  const s = initForest(seed, base);
  const ctx = forestCtx(seed);
  for (const w of stops) advanceForest(s, ctx, w);
  return s;
}

/** Random split points of [0, W] (seeded). */
function splits(W: number, n: number, salt: number): number[] {
  const out: number[] = [];
  let x = salt * 7919;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out.push(Math.floor((x / 2147483648) * W));
  }
  out.sort((a, b) => a - b);
  out.push(W);
  return out;
}

/** Back-to-back countdown sessions of `len` from 0 to W, as the world records them. */
function sessions(len: number, W: number): PaceSeg[] {
  const out: PaceSeg[] = [];
  for (let w = 0; w < W; w += len) out.push({ w0: w, len, w1: Math.min(W, w + len) });
  return out;
}

describe('determinism and chunking', () => {
  it('5 min three times equals 15 min once (both themes)', () => {
    for (const seed of [1, 42, 9001]) {
      expect(runSpace(seed, fresh, [5 * MIN, 10 * MIN, 15 * MIN])).toEqual(runSpace(seed, fresh, [15 * MIN]));
      expect(runForest(seed, fresh, [5 * MIN, 10 * MIN, 15 * MIN])).toEqual(runForest(seed, fresh, [15 * MIN]));
    }
  });

  it('any split of the running time gives the same state', () => {
    for (const seed of [3, 77]) {
      const W = 9 * HOUR;
      const one = runSpace(seed, fresh, [W]);
      const f1 = runForest(seed, fresh, [W]);
      for (const salt of [1, 2, 3]) {
        expect(runSpace(seed, fresh, splits(W, 400, salt))).toEqual(one);
        expect(runForest(seed, fresh, splits(W, 400, salt))).toEqual(f1);
      }
    }
  });

  it('frame-sized steps equal one jump', () => {
    const W = 20 * MIN;
    const stops: number[] = [];
    for (let w = 0; w <= W; w += 16) stops.push(w);
    expect(runSpace(5, fresh, stops)).toEqual(runSpace(5, fresh, [W]));
    expect(runForest(5, fresh, stops)).toEqual(runForest(5, fresh, [W]));
  });

  it('forest and space states are independent of each other', () => {
    const f = runForest(8, fresh, [2 * HOUR]);
    const s = runSpace(8, fresh, [2 * HOUR]);
    const f2 = runForest(8, fresh, [2 * HOUR]);
    expect(f).toEqual(f2);
    expect(s.done).toBeGreaterThan(0);
  });
});

describe('space accounting', () => {
  it('stock, reservations and deliveries balance for every resource at every event', () => {
    const seed = 11;
    const s = initSpace(seed, fresh);
    // raids on (they never touch crates)
    const ctx = spaceCtx(seed, pacedRaids(seed, sessions(25 * MIN, 24 * HOUR)));
    const costDone: Amt = { m: 0, c: 0, r: 0 };
    for (let i = 0; i < 9000; i++) {
      const before = s.proj;
      const cost = { ...before.cost };
      const done0 = s.done;
      const n = advanceSpace(s, ctx, Infinity, 1);
      expect(n).toBe(1);
      if (s.done > done0) for (const t of RES) costDone[t] += cost[t];
      const p = s.proj;
      expect(amtTotal(s.depot)).toBeLessThanOrEqual(depotCapacity(s));
      for (const t of RES) {
        expect(s.stock[t]).toBeGreaterThanOrEqual(0);
        expect(s.pending[t]).toBeGreaterThanOrEqual(0);
        expect(p.onSite[t]).toBeGreaterThanOrEqual(0);
        expect(s.depot[t]).toBe(s.stock[t] + p.atDepot[t]);
        expect(p.claimed[t]).toBeLessThanOrEqual(p.atDepot[t]);
        if (p.reservedAt >= 0) {
          let consumed = 0;
          for (let k = 0; k < p.stage; k++) consumed += needOf(p, k)[t];
          expect(p.atDepot[t] + p.inTransit[t] + p.onSite[t] + consumed).toBe(p.cost[t]);
          expect(s.mined[t]).toBe(costDone[t] + p.cost[t] + s.stock[t]);
        } else {
          expect(p.stage).toBe(0);
          expect(p.onSite[t] + p.inTransit[t] + p.atDepot[t]).toBe(0);
          expect(s.mined[t]).toBe(costDone[t] + s.stock[t]);
        }
      }
      // stage needs add up to the cost
      const sum: Amt = { m: 0, c: 0, r: 0 };
      for (let k = 0; k < SPACE.stages.length; k++) for (const t of RES) sum[t] += needOf(p, k)[t];
      expect(sum).toEqual(p.cost);
    }
    expect(s.done).toBeGreaterThan(6);
    expect(s.mined.c).toBeGreaterThan(0);
  });

  it('a site is revealed only with its cost in stock and never built ahead of materials', () => {
    const seed = 21;
    const s = initSpace(seed, fresh);
    const ctx = spaceCtx(seed);
    for (let i = 0; i < 4000; i++) {
      const before = { reserved: s.proj.reservedAt, stock: { ...s.stock }, unit: s.proj.unit, cost: { ...s.proj.cost } };
      advanceSpace(s, ctx, Infinity, 1);
      if (s.proj.unit === before.unit && before.reserved < 0 && s.proj.reservedAt >= 0) {
        // reserving happens right after the unload that completed the cost
        let short = 0;
        for (const t of RES) short += Math.max(0, before.cost[t] - before.stock[t]);
        expect(short).toBeLessThanOrEqual(SPACE.load);
      }
      if (s.proj.building) expect(s.proj.reservedAt).toBeGreaterThanOrEqual(0);
    }
  });

  it('shows the first haul in the first minute and the first building in about ten minutes', () => {
    const s = runSpace(1, fresh, [40_000]);
    expect(amtTotal(s.mined)).toBeGreaterThanOrEqual(2);
    const r = runSpace(1, fresh, [5 * MIN]);
    expect(r.proj.reservedAt).toBeGreaterThan(0);
    let t = 0;
    const x = initSpace(1, fresh);
    const ctx = spaceCtx(1);
    while (x.done < 1 && t < HOUR) advanceSpace(x, ctx, (t += 5000));
    expect(t).toBeGreaterThan(7 * MIN);
    expect(t).toBeLessThan(16 * MIN);
  });

  it('keeps progressing for days without stalling, with bounded workers', () => {
    const seed = 99;
    const s = initSpace(seed, fresh);
    const ctx = spaceCtx(seed);
    let last = 0;
    let lastAt = 0;
    for (let W = 0; W <= 120 * HOUR; W += 30 * MIN) {
      advanceSpace(s, ctx, W);
      if (s.done > last) {
        last = s.done;
        lastAt = W;
      }
      expect(W - lastAt).toBeLessThan(1 * HOUR);
      expect(s.rovers.length).toBeLessThanOrEqual(SPACE.maxRovers);
      expect(s.log.length).toBeLessThanOrEqual(64);
    }
    expect(s.done).toBeGreaterThan(300);
    expect(s.mined.r).toBeGreaterThan(0);
  });

  it('charging is always finite', () => {
    const s = runSpace(4, fresh, [30 * HOUR]);
    for (const r of s.rovers) {
      expect(r.step).not.toBeNull();
      expect(r.step!.t1 - r.step!.t0).toBeLessThan(30 * MIN);
    }
  });

  it('roles change later work: command and factory add drones, generators raise power, research finds rare mineral', () => {
    const s = runSpace(6, fresh, [3 * HOUR]);
    expect(s.counts.command + s.counts.factory).toBeGreaterThanOrEqual(1);
    expect(s.rovers.length).toBe(Math.min(SPACE.maxRovers, SPACE.startRovers + s.counts.command + s.counts.factory));
    expect(s.grid.gen).toBe(SPACE.grid.base + SPACE.grid.perSolar * s.counts.generator);
    expect(s.counts.research).toBeGreaterThanOrEqual(1);
    expect(s.rareFrom).toBeGreaterThanOrEqual(0);
  });

  it('drones stay busy in the first hour: they mine ahead, help assemble and make rounds', () => {
    const seed = 424242;
    const s = initSpace(seed, fresh);
    const ctx = spaceCtx(seed);
    const busy: Record<string, number> = {};
    const seen = new Set<string>();
    while (s.t < HOUR) {
      advanceSpace(s, ctx, Infinity, 1);
      expect(s.rovers.filter((r) => r.job === 'assist').length).toBeLessThanOrEqual(1);
      expect(s.rovers.filter((r) => r.job === 'patrol').length).toBeLessThanOrEqual(1);
      for (const r of s.rovers) {
        const st = r.step;
        if (!st || seen.has(`${r.id}:${st.t0}`)) continue;
        seen.add(`${r.id}:${st.t0}`);
        busy[st.k] = (busy[st.k] ?? 0) + (st.t1 - st.t0);
        // a helper never outlasts the stage it helps with
        if (st.k === 'assist') expect(st.t1).toBeLessThanOrEqual(s.proj.st1);
      }
    }
    const tot = Object.values(busy).reduce((a, b) => a + b, 0);
    expect((busy.idle ?? 0) / tot).toBeLessThan(0.05);
    expect(((busy.drill ?? 0) + (busy.loadOre ?? 0) + (busy.unload ?? 0)) / tot).toBeGreaterThan(0.08);
  });

  it('colony stages climb 1 → 10 and never go back', () => {
    for (const seed of [424242, 7]) {
      const s = initSpace(seed, fresh);
      const ctx = spaceCtx(seed);
      let last = spaceStage(s);
      const at: number[] = [];
      expect(last).toBe(1);
      for (let W = 0; W <= 12 * HOUR; W += MIN) {
        advanceSpace(s, ctx, W);
        const st = spaceStage(s);
        expect(st).toBeGreaterThanOrEqual(last);
        if (st > last) at[st] = W;
        last = st;
      }
      expect(last).toBe(10);
      // the early stages arrive within the first sessions
      expect(at[4]).toBeLessThan(HOUR);
      expect(at[7]).toBeLessThan(2 * HOUR);
      expect(at[9]).toBeLessThan(3 * HOUR);
    }
    expect(colonyName(1)).toBe(colonyName(1));
  });

  it('expansion: a scout founds each outpost once research stands, and every outpost is linked', () => {
    for (const seed of [424242, 7]) {
      const s = initSpace(seed, fresh);
      const ctx = spaceCtx(seed);
      const scouted = new Set<number>();
      let linked = s.linked;
      let firstAfterResearch = -1;
      for (let i = 0; i < 400_000 && s.t < 6 * HOUR; i++) {
        const cluster0 = s.cluster;
        const research0 = s.counts.research;
        advanceSpace(s, ctx, Infinity, 1);
        if (s.cluster !== cluster0 && research0 > 0 && firstAfterResearch < 0) firstAfterResearch = s.cluster;
        if (s.scout) {
          if (!scouted.has(s.scout.c)) {
            expect(spaceLine(s, s.scout.t0 + 1000)).toContain('정찰 드론');
          }
          scouted.add(s.scout.c);
          expect(s.scout.t1).toBeGreaterThan(s.scout.t0);
          // nobody marks out the depot before the beacon is down
          if (s.scout.c === s.cluster && s.setup === 2) expect(s.t).toBeGreaterThanOrEqual(s.scout.t1);
        }
        const lay = s.rovers.find((r) => r.step && r.step.k === 'link');
        // (a raid, when one is on, is told first)
        if (lay && lay.step && !s.raid && !(s.scout && s.t < s.scout.t1 + 6000)) expect(spaceLine(s, lay.step.t0 + 1)).toContain('전력선');
        expect(s.linked).toBeGreaterThanOrEqual(linked);
        expect(s.linked).toBeGreaterThanOrEqual(s.cluster - 1);
        linked = s.linked;
      }
      expect(firstAfterResearch).toBeGreaterThan(0);
      for (let c = firstAfterResearch; c <= s.cluster; c++) expect(scouted.has(c)).toBe(true);
      expect(scouted.has(1)).toBe(false);
    }
  });

  it('raids come as the sessions planned them; maintenance drones repair; wrecks are rare', () => {
    for (const seed of [424242, 7, 99]) {
      for (const len of [5 * MIN, 25 * MIN, 50 * MIN]) {
        const plan = pacedRaids(seed, sessions(len, 10 * HOUR));
        const s = initSpace(seed, fresh);
        const ctx = spaceCtx(seed, plan);
        const starts: number[] = [];
        const ends: number[] = [];
        let wrecks = 0;
        let wasRaid = false;
        let endedAt = -1;
        const fixTimes: number[] = [];
        const bad: string[] = [];
        for (let i = 0; i < 3_000_000 && s.t < 10 * HOUR; i++) {
          advanceSpace(s, ctx, Infinity, 1);
          if (s.raid && !wasRaid) {
            const p = s.raid;
            starts.push(p.t0);
            // a planned start, or one held back by a headline sight (at most ~10 min)
            const planned = plan.filter((t) => t <= p.t0).pop()!;
            expect(p.t0 - planned).toBeLessThanOrEqual(12 * MIN);
            expect(spaceLine(s, p.t0 + 1000)).toContain(p.faction === 'swarm' ? '모래 떼' : '빛 수호체');
            // a skirmish takes about a minute, a full raid about a minute and a half
            expect(p.t1 - p.t0).toBeGreaterThanOrEqual(p.full ? 80_000 : 50_000);
            expect(p.t1 - p.t0).toBeLessThanOrEqual(p.full ? 100_000 : 60_000);
            // a skirmish leaves light damage at most and never a wreck
            if (!p.full) {
              expect(p.wreck).toBe(-1);
              expect(Math.max(0, ...p.hits.map((h) => h.level))).toBeLessThanOrEqual(2);
            }
            // before the first turret only small scouting swarms come
            if (s.counts.turret === 0) {
              expect(p.faction).toBe('swarm');
              expect(p.raiders.length).toBeLessThanOrEqual(9);
            }
            if (p.wreck >= 0) {
              wrecks++;
              expect(kindOf(seed, p.wreck, 0, 0)).not.toBe('command');
            }
          }
          if (!s.raid && wasRaid) {
            ends.push(s.t);
            endedAt = s.t;
          }
          if (s.raid) endedAt = -1;
          wasRaid = !!s.raid;
          // the maintenance drones fix everything before the next raid
          if (endedAt >= 0 && s.damage.length === 0 && !s.wreck) {
            fixTimes.push(s.t - endedAt);
            endedAt = -1;
          }
          // (plain checks per event; expect() once at the end keeps this fast)
          for (const r of s.rovers) if (r.step && (r.step.k === 'repair' || r.step.k === 'clear' || r.step.k === 'rebuild')) bad.push(`work drone ${r.step.k}`);
          const A = SPACE.army;
          if (s.army.inf > A.infPer * A.perMax || s.army.tanks > A.tankPer * A.perMax || s.army.tanks < 0 || s.army.out > s.army.inf) bad.push(`army ${JSON.stringify(s.army)}`);
          if (s.crew.length > SPACE.crew.max) bad.push('crew');
        }
        expect(bad).toEqual([]);
        // (the last raid may have ended just before the run did)
        if (endedAt >= 0) expect(s.t - endedAt).toBeLessThan(10 * MIN);
        expect(Math.max(...fixTimes)).toBeLessThan(10 * MIN);
        // nearly every planned raid happens (a fresh landing with nothing built is left alone, and
        // one held back by a planet sight may take the next one's place)
        const planned = plan.filter((t) => t < 10 * HOUR).length;
        expect(starts.length).toBeGreaterThanOrEqual(Math.floor(planned * 0.93));
        // no raid shares its time with a headline event
        for (let k = 0; k < starts.length; k++) {
          for (const e of eventsIn(EVENT_DEFS, 'space', seed, starts[k] - 30 * MIN, ends[k] ?? starts[k] + 2 * MIN)) {
            expect(e.t1 <= starts[k] || e.t0 >= (ends[k] ?? starts[k] + 100_000)).toBe(true);
          }
        }
        expect(wrecks).toBeLessThanOrEqual(Math.ceil(starts.length / 6));
        expect(s.army.inf).toBeGreaterThan(0);
        expect(s.army.tanks).toBeGreaterThan(0);
        expect(s.crew.length).toBe(SPACE.crew.max);
      }
    }
  }, 60_000);

  it('raids never change what the colony builds or when', () => {
    for (const seed of [424242, 11]) {
      const W = 8 * HOUR;
      const calm = runSpace(seed, fresh, [W]);
      const raided = runSpace(seed, fresh, [W], pacedRaids(seed, sessions(5 * MIN, W)));
      expect(raided.raids.n).toBeGreaterThan(10);
      expect(raided.log).toEqual(calm.log);
      expect(raided.done).toBe(calm.done);
      expect(raided.mined).toEqual(calm.mined);
      expect(raided.stock).toEqual(calm.stock);
      expect(raided.counts).toEqual(calm.counts);
      expect(raided.rovers).toEqual(calm.rovers);
    }
  });

  it('a wreck is cleared and rebuilt stage by stage by the maintenance drones', () => {
    let found = false;
    for (const seed of [17, 3, 5, 8, 13, 21, 34, 55]) {
      const s = initSpace(seed, fresh);
      const ctx = spaceCtx(seed, pacedRaids(seed, sessions(10 * MIN, 24 * HOUR)));
      let wreckedAt = -1;
      let clearedAt = -1;
      while (s.t < 24 * HOUR) {
        advanceSpace(s, ctx, Infinity, 1);
        if (s.wreck && wreckedAt < 0) wreckedAt = s.t;
        if (s.wreck && s.wreck.cleared && clearedAt < 0) clearedAt = s.t;
        if (wreckedAt >= 0 && !s.wreck) break;
      }
      if (wreckedAt < 0) continue;
      found = true;
      expect(clearedAt).toBeGreaterThan(wreckedAt);
      expect(s.wreck).toBeNull();
      expect(s.t - wreckedAt).toBeLessThan(15 * MIN);
      break;
    }
    expect(found).toBe(true);
  });

  it('drones take shelter by the depot during a solar flare (after the trip they are on)', () => {
    const seed = 424242;
    const flares = eventsIn(EVENT_DEFS, 'space', seed, 0, 10 * HOUR).filter((e) => e.kind === 'solarFlare');
    expect(flares.length).toBeGreaterThan(0);
    const s = initSpace(seed, fresh);
    const ctx = spaceCtx(seed);
    const job = new Map<number, string>();
    let sheltered = 0;
    while (s.t < 10 * HOUR) {
      advanceSpace(s, ctx, Infinity, 1);
      const f = flares.find((e) => s.t >= e.t0 && s.t < e.t1);
      for (const r of s.rovers) {
        // a drone given new work while a flare is on is sent to shelter
        if (f && job.has(r.id) && job.get(r.id) !== r.job && r.step && r.step.t0 === s.t) {
          if (r.job !== 'shelter') expect(r.job).toBe('shelter');
        }
        if (r.job === 'shelter') sheltered++;
        job.set(r.id, r.job);
      }
    }
    expect(sheltered).toBeGreaterThan(0);
  });

  it('headline events are told in the status line and the details, only once their sight is shown', () => {
    const seed = 424242;
    // a comet (no progress needed) at 2818 s; a satellite launch needs colony stage 9
    const s = runSpace(seed, fresh, [2_818_000]);
    expect(workLine('space', s, 2_818_000)).toBe(EVENT_TEXT.comet.line);
    expect(detailRows('space', s, 2_818_000)[0]).toEqual({ label: '지금', value: EVENT_TEXT.comet.name });
    const sat = eventsIn(EVENT_DEFS, 'space', seed, 0, 12 * HOUR).find((e) => e.kind === 'satellite')!;
    const early = runSpace(seed, fresh, [sat.t0 + 5000]);
    if (spaceStage(early) < 9) expect(workLine('space', early, sat.t0 + 5000)).not.toBe(EVENT_TEXT.satellite.line);
    else expect(workLine('space', early, sat.t0 + 5000)).toBe(EVENT_TEXT.satellite.line);
    // the first snow of the year in the forest
    const snow = eventsIn(EVENT_DEFS, 'forest', seed, 0, 12 * HOUR).find((e) => e.kind === 'firstSnow')!;
    const f = runForest(seed, fresh, [snow.t0 + 1000]);
    expect(workLine('forest', f, snow.t0 + 1000)).toBe(EVENT_TEXT.firstSnow.line);
  });

  it('with a given raid plan, raids and the garrison do not depend on how time is chunked', () => {
    const W = 5 * HOUR;
    const plan = pacedRaids(31, sessions(20 * MIN, W));
    const one = runSpace(31, fresh, [W], plan);
    const many = runSpace(31, fresh, splits(W, 300, 3), plan);
    expect(many).toEqual(one);
    expect(one.raids.n).toBeGreaterThan(0);
  });

  it('the first outpost follows the colony plan: extractor and generator first', () => {
    for (const seed of [1, 2, 3]) {
      expect(kindOf(seed, 0, 0, 0)).toBe('extractor');
      expect(kindOf(seed, 1, 0, 0)).toBe('generator');
    }
  });

  it('deposits shrink as they are worked and start fresh at the next outpost', () => {
    const seed = 5;
    const s = initSpace(seed, fresh);
    const ctx = spaceCtx(seed);
    let shrank = false;
    let cluster = s.cluster;
    for (let W = 0; W <= 6 * HOUR; W += 20_000) {
      advanceSpace(s, ctx, W);
      if (depositLeft(s, 'm') < 1) shrank = true;
      if (s.cluster !== cluster) {
        cluster = s.cluster;
        expect(amtTotal(s.dug)).toBeLessThanOrEqual(SPACE.load * s.rovers.length);
      }
      for (const t of RES) expect(depositLeft(s, t)).toBeGreaterThanOrEqual(0.15);
    }
    expect(shrank).toBe(true);
  });
});

describe('forest cycle', () => {
  it('fetches water, plants and sprouts within the first minute', () => {
    const t = runForest(1, fresh, [60_000]);
    expect(t.tree.phase).toBeGreaterThanOrEqual(1);
    expect(forestUnitProgress(t, 0, 60_000)!).toBeGreaterThan(0.012);
  });

  it('the first tree needs only the starting seeds and grows with care', () => {
    const ctx = forestCtx(2);
    const s = initForest(2, fresh);
    let W = 0;
    while (s.done < 1 && W < HOUR) advanceForest(s, ctx, (W += 2000));
    expect(W).toBeGreaterThan(10 * MIN);
    expect(W).toBeLessThan(17 * MIN);
    expect(s.seeds + s.hand).toBe(FOREST.seedStart - 1);
  });

  it('leaves turn into mould and reach the next clearing; nothing is counted twice', () => {
    const seed = 3;
    const s = initForest(seed, fresh);
    const ctx = forestCtx(seed);
    let usedMould = 0;
    for (let i = 0; i < 8000; i++) {
      const m0 = s.mould;
      const prep0 = s.prep ? s.prep.mould : false;
      const mul0 = s.tree.mulched;
      const unit0 = s.tree.unit;
      const beds0 = s.beds.length;
      advanceForest(s, ctx, Infinity, 1);
      if (s.prep?.mould && !prep0 && s.mould === m0 - 1) usedMould++;
      if (s.tree.unit === unit0 && s.tree.mulched && !mul0 && s.mould === m0 - 1) usedMould++;
      if (s.beds.length > beds0) usedMould += FOREST.flowerbed.mould;
      let inCompost = 0;
      let taken = 0;
      for (const c of s.composts) {
        inCompost += c.ready + c.batches.reduce((a, b) => a + b.n, 0);
        taken += c.taken;
      }
      // every collected leaf is in the basket or in a compost of this zone (or an older zone)
      if (s.zone === 0) expect(inCompost + s.basket).toBe(s.totals.leaves);
      if (s.zone === 0) expect(taken).toBe(s.totals.mould);
      for (const c of s.composts) expect(compostAt(c, s.t).mould).toBeGreaterThanOrEqual(0);
      expect(s.seeds).toBeGreaterThanOrEqual(0);
      expect(s.hand).toBeGreaterThanOrEqual(0);
      expect(s.mould).toBeGreaterThanOrEqual(0);
      expect(s.can).toBeGreaterThanOrEqual(0);
      expect(s.can).toBeLessThanOrEqual(FOREST.canCap);
    }
    expect(s.totals.leaves).toBeGreaterThan(0);
    expect(s.totals.mould).toBeGreaterThan(0);
    expect(usedMould).toBeGreaterThan(0);
  });

  it('keeps growing through every season for days without stalling', () => {
    const seed = 17;
    const s = initForest(seed, fresh);
    const ctx = forestCtx(seed);
    let last = 0;
    let lastAt = 0;
    for (let W = 0; W <= 120 * HOUR; W += 20 * MIN) {
      advanceForest(s, ctx, W);
      if (s.done > last) {
        last = s.done;
        lastAt = W;
      }
      expect(W - lastAt).toBeLessThan(45 * MIN);
    }
    expect(s.done).toBeGreaterThan(300);
    expect(s.squirrel).not.toBeNull();
  });
});

describe('migration baseline', () => {
  const legacy: SimBase = { W: 5 * 15 * MIN + 0.5 * 15 * MIN, legacy: { units: 5, partial: 0.5 } };

  it('keeps completed units and maps the growing one to a matching stage', () => {
    const f = initForest(7, legacy);
    expect(f.done).toBe(5);
    expect(forestUnitProgress(f, 5, legacy.W)).toBeCloseTo(0.5, 2);
    expect(forestUnitProgress(f, 4, legacy.W)).toBe(1);
    const s = initSpace(7, legacy);
    expect(s.done).toBe(5);
    const u = spaceUnitProgress(s, 5, legacy.W)!;
    expect(u).toBeGreaterThan(0.4);
    expect(u).toBeLessThanOrEqual(0.5);
  });

  it('is idempotent: the same base gives the same start (no extra resources)', () => {
    expect(initForest(7, legacy)).toEqual(initForest(7, legacy));
    expect(initSpace(7, legacy)).toEqual(initSpace(7, legacy));
    expect(initForest(7, legacy).seeds).toBe(FOREST.seedStart);
  });

  it('continues from the migration point, never replaying the past', () => {
    const s = runSpace(7, legacy, [legacy.W + 20 * MIN]);
    expect(s.done).toBeGreaterThanOrEqual(6);
    const f = runForest(7, legacy, [legacy.W + 20 * MIN]);
    expect(f.done).toBeGreaterThanOrEqual(6);
  });
});

describe('runner', () => {
  const world = { id: 'w1', seed: 5, base: fresh };

  it('rewinds through checkpoints to the same state', () => {
    const r = new SimRunner('space', world);
    const a = cloneSpace(r.at(5 * HOUR));
    r.at(9 * HOUR);
    expect(r.at(5 * HOUR)).toEqual(a);
    expect(r.checkpointCount()).toBeGreaterThan(5);
  });

  it('resumes from a stored checkpoint with an identical result', () => {
    const r = new SimRunner('forest', world);
    r.at(3 * HOUR);
    const cp = JSON.parse(JSON.stringify(r.checkpoint()));
    const r2 = new SimRunner('forest', world, cp, 4 * HOUR);
    const r3 = new SimRunner('forest', world);
    expect(cloneForest(r2.at(4 * HOUR))).toEqual(cloneForest(r3.at(4 * HOUR)));
  });

  it('ignores checkpoints of other worlds, versions or ahead of the given time', () => {
    const r = new SimRunner('forest', world);
    r.at(2 * HOUR);
    const cp = r.checkpoint();
    expect(new SimRunner('forest', { ...world, id: 'other' }).accepts(cp)).toBe(false);
    expect(new SimRunner('space', world).accepts({ ...cp, theme: 'space' })).toBe(false);
    expect(new SimRunner('forest', world).accepts({ ...cp, simVersion: -1 })).toBe(false);
    const ahead = new SimRunner('forest', world, cp, HOUR);
    expect(ahead.W).toBe(0);
  });

  it('computes long returns quickly', () => {
    const r = new SimRunner('space', world);
    const t0 = performance.now();
    r.at(300 * HOUR);
    const f = new SimRunner('forest', world);
    f.at(300 * HOUR);
    expect(performance.now() - t0).toBeLessThan(4000);
  });
});

describe('forest pond, old tree and stages', () => {
  const seeds = [3, 77, 424242];

  it('plants an old tree early, digs and lines a pond after two groves, and the stage only rises', () => {
    for (const seed of seeds) {
      const s = initForest(seed, fresh);
      const ctx = forestCtx(seed);
      let prev = 1;
      let elderAt = -1;
      let pondAt = -1;
      for (let W = 0; W <= 8 * HOUR; W += 2 * MIN) {
        advanceForest(s, ctx, W);
        const st = forestStage(s, W);
        expect(st).toBeGreaterThanOrEqual(prev);
        prev = st;
        if (elderAt < 0 && s.firstElder >= 0) elderAt = s.firstElder;
        if (pondAt < 0 && s.firstPond >= 0) pondAt = s.firstPond;
      }
      // the old tree waits only for a spare seed; the pond for two groves (~1.7 h)
      expect(elderAt).toBeGreaterThan(0);
      expect(elderAt).toBeLessThan(40 * MIN);
      expect(pondAt).toBeGreaterThan(80 * MIN);
      expect(pondAt).toBeLessThan(3 * HOUR);
      expect(prev).toBe(10);
    }
  });

  it('stage times stay near the plan (pond ≈ 2 h, wildlife ≈ 3.3 h, giant ≈ 3.4 h, ecosystem ≈ 7 h)', () => {
    const s = initForest(424242, fresh);
    const ctx = forestCtx(424242);
    const reached: Record<number, number> = {};
    for (let W = 0; W <= 9 * HOUR; W += MIN) {
      advanceForest(s, ctx, W);
      const st = forestStage(s, W);
      if (!(st in reached)) reached[st] = W / HOUR;
    }
    expect(reached[3]).toBeLessThan(0.3);
    expect(reached[5]).toBeLessThan(1.1);
    expect(reached[7]).toBeGreaterThan(1.5);
    expect(reached[7]).toBeLessThan(3.2);
    expect(reached[8]).toBeLessThan(4);
    expect(reached[9]).toBeGreaterThan(3.2);
    expect(reached[9]).toBeLessThan(4.2);
    expect(reached[10]).toBeLessThan(8.5);
  });

  it('the pond fills over running time and faster in rain; a migrated forest keeps its past ponds and old trees', () => {
    expect(pondFill(5, 1000, 1000)).toBe(0);
    expect(pondFill(5, 1000, 1000 + FOREST.pond.fillMs)).toBe(1);
    expect(pondFill(5, ANCIENT, 0)).toBe(1);
    const m = initForest(9, { W: 5 * HOUR, legacy: { units: 20, partial: 0.4 } });
    expect(m.firstPond).toBe(ANCIENT);
    expect(forestStage(m, 5 * HOUR)).toBe(9);
    expect(elderAge(m, 0, 5 * HOUR)).toBeGreaterThan(FOREST.elder.giantMs);
    expect(pondAt(m, 0, 5 * HOUR)).toEqual({ dug: FOREST.pond.digs, water: 1 });
  });

  it('chunking does not change the pond or the old tree', () => {
    const a = runForest(31, fresh, [4 * HOUR]);
    const b = runForest(31, fresh, splits(4 * HOUR, 120, 7));
    expect(b.pond).toEqual(a.pond);
    expect(b.elder).toEqual(a.elder);
    expect(b.firstPond).toBe(a.firstPond);
  });
});
