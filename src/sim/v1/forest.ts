/**
 * Forest work simulation: the keeper fetches water, clears soil, plants and waters; the tree
 * grows and pauses at care points until it is watered; mature trees drop seeds and leaves on a
 * fixed rule; the keeper gathers seeds into the bench basket, rakes leaves into the compost,
 * where they become leaf mould over running time, and carries the mould to the next clearing.
 *
 * Accounting:
 *   - Seeds: bench basket ⇄ keeper's hand → planted (one per tree, taken when it is picked up).
 *   - Leaves: counted piles under mature trees (separate from the decorative ground layer) →
 *     basket → compost batch → leaf mould (2 leaves per scoop) once the batch has matured.
 *   - Water: the spring never runs dry; the rain barrel and the channel basin are closer.
 * Production clocks only advance by world time and are evaluated at events, so the result is
 * the same however the running time was split.
 */

import { FOREST } from './config';
import { TravelTable, type NodeId } from './layout';
import { seasonAt } from './season';
import type { CompletionLog, Planned, SimBase, Step, Worker } from './types';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from './units';

export interface GroundTree {
  u: number;
  seeds: number;
  /** Next seed drop (may lie in the past while the ground is full). */
  sc: number;
  leaves: number;
  lc: number;
}

export interface Compost {
  c: number;
  /** Batches still turning into mould: leaves and the time they are ready. */
  batches: { n: number; r: number }[];
  /** Leaves of matured batches. */
  ready: number;
  /** Scoops of mould taken out. */
  taken: number;
}

export interface ForestTree {
  unit: number;
  /** 0 not planted yet, 1 growing, 2 waiting for care. */
  phase: number;
  /** Grown time (ms) at `gt`. */
  gm: number;
  gt: number;
  /** Time to grow fully (shorter when mulched). */
  dur: number;
  /** Index of the next care point. */
  gate: number;
  /** Highest care point already cared for in advance (-1 none). */
  cared: number;
  plantedAt: number;
  mulched: boolean;
  /** Soil cleared (visible light soil). */
  cleared: boolean;
}

export interface ForestSim {
  v: number;
  t: number;
  done: number;
  doneAt: number[];
  zone: number;
  /** Active cluster: its bench holds the seed basket. */
  cluster: number;
  /** 0 the bench must be moved, 1 the keeper is on it, 2 ready. */
  setup: number;
  /** Seeds in the bench basket. */
  seeds: number;
  /** Seeds carried by the keeper. */
  hand: number;
  /** Water in the can. */
  can: number;
  /** Leaves carried in the basket. */
  basket: number;
  /** Leaf mould carried (scoops). */
  mould: number;
  tree: ForestTree;
  /** Mature trees of the current zone (they drop seeds and leaves). */
  ground: GroundTree[];
  composts: Compost[];
  /** Rain barrel of the active cluster (null: none yet). */
  barrel: { c: number; built: boolean; water: number; clock: number } | null;
  /** Channel segments dug in the active cluster. */
  channel: number;
  /** Channels and barrels of recent clusters (global index → segments / built), for drawing. */
  dug: Record<string, number>;
  barrels: Record<string, number>;
  /** Soil prepared ahead for the next unit. */
  prep: { u: number; mould: boolean } | null;
  /** Flowerbeds of the current zone: cluster, spot index, planted time. */
  beds: { c: number; k: number; at: number }[];
  /** A seed the squirrel buried at a planting spot. */
  stash: { u: number } | null;
  /** The squirrel is carrying a seed. */
  sqCarry: number;
  /** Count of idle moments (varies how the keeper rests). */
  idleN: number;
  keeper: Worker;
  squirrel: Worker | null;
  /** Totals for the detail view. */
  totals: { seeds: number; leaves: number; mould: number };
  log: CompletionLog[];
}

export interface ForestCtx {
  seed: number;
  travel: TravelTable;
  squirrel: TravelTable;
}

export function forestCtx(seed: number): ForestCtx {
  return {
    seed,
    travel: new TravelTable('forest', seed, FOREST.speed),
    squirrel: new TravelTable('forest', seed, FOREST.squirrel.speed),
  };
}

const benchOf = (c: number): NodeId => `b${c}`;
const restOf = (c: number): NodeId => `h${c}`;
const springOf = (c: number): NodeId => `w${c}`;
const basinOf = (c: number): NodeId => `a${c}`;
const barrelOf = (c: number): NodeId => `r${c}`;
const compostOf = (c: number): NodeId => `k${c}`;
const siteOf = (u: number): NodeId => `s${u}`;
const treeOf = (u: number): NodeId => `u${u}`;
/** Channel segment i of cluster c. */
const ditchOf = (c: number, i: number): NodeId => `e${c * 8 + i}`;
/** Flowerbed spot k of cluster c. */
const bedOf = (c: number, k: number): NodeId => `f${c * 4 + k}`;

function newTree(unit: number): ForestTree {
  return { unit, phase: 0, gm: 0, gt: 0, dur: FOREST.growMs, gate: 0, cared: -1, plantedAt: -1, mulched: false, cleared: false };
}

function newWorker(id: number, at: NodeId, born: number): Worker {
  return { id, at, step: null, plan: [], job: 'rest', born };
}

const gateMs = (tr: ForestTree, i: number) => Math.round(FOREST.gates[i] * tr.dur);

export function initForest(seed: number, base: SimBase): ForestSim {
  void seed;
  const legacyDone = base.legacy ? base.legacy.units : 0;
  const partial = base.legacy ? base.legacy.partial : 0;
  const zone = Math.floor(legacyDone / UPZ);
  const cluster = Math.floor(legacyDone / UPC);
  const s: ForestSim = {
    v: 1,
    t: base.W,
    done: legacyDone,
    doneAt: Array.from({ length: legacyDone - zone * UPZ }, () => -1),
    zone,
    cluster,
    setup: 2,
    seeds: FOREST.seedStart,
    hand: 0,
    can: 0,
    basket: 0,
    mould: 0,
    tree: newTree(legacyDone),
    ground: [],
    composts: [],
    barrel: cluster > 0 ? { c: cluster, built: false, water: 0, clock: 0 } : null,
    channel: 0,
    dug: {},
    barrels: {},
    prep: null,
    beds: [],
    stash: null,
    sqCarry: 0,
    idleN: 0,
    keeper: newWorker(0, benchOf(cluster), base.W),
    squirrel: null,
    totals: { seeds: 0, leaves: 0, mould: 0 },
    log: [],
  };
  // mature trees of the current zone start producing from the migration point
  for (let u = zone * UPZ; u < legacyDone; u++) s.ground.push(groundTree(u, base.W, 0));
  if (partial > 0) {
    // the growing tree keeps its stage: same growth fraction, care continues from there
    const tr = s.tree;
    tr.phase = 1;
    tr.plantedAt = base.W;
    tr.cleared = true;
    tr.gm = Math.min(tr.dur - 1, Math.round(partial * tr.dur));
    tr.gt = base.W;
    while (tr.gate < FOREST.gates.length && gateMs(tr, tr.gate) <= tr.gm) tr.gate++;
  }
  if (legacyDone >= FOREST.squirrel.afterTrees) s.squirrel = newWorker(1, treeOf(legacyDone - 1), base.W);
  return s;
}

function groundTree(u: number, T: number, i: number): GroundTree {
  // stagger the first drops so neighbouring trees do not drop at the same moment
  return { u, seeds: 0, sc: T + FOREST.seedEveryMs + i * 23_000, leaves: 0, lc: T + leafPeriod(T) + i * 17_000 };
}

function leafPeriod(T: number): number {
  return Math.round(FOREST.leafEveryMs / FOREST.leafSeason[seasonAt(T)]);
}

function seedPeriod(s: ForestSim, u: number): number {
  const c = Math.floor(u / UPC);
  const boosted = s.beds.some((b) => b.c === c);
  return Math.round(FOREST.seedEveryMs * (boosted ? 1 - FOREST.flowerbed.seedBoost : 1));
}

// ---------------------------------------------------------------------------
// Lazy production (pure in time: the same drops however often it is evaluated)

function catchUpTree(s: ForestSim, g: GroundTree, T: number) {
  while (g.seeds < FOREST.seedGroundCap && g.sc <= T) {
    g.seeds++;
    g.sc += seedPeriod(s, g.u);
  }
  while (g.leaves < FOREST.leafGroundCap && g.lc <= T) {
    g.leaves++;
    g.lc += leafPeriod(g.lc);
  }
}

function catchUp(s: ForestSim, T: number) {
  for (const g of s.ground) catchUpTree(s, g, T);
  for (const c of s.composts) {
    while (c.batches.length && c.batches[0].r <= T) c.ready += c.batches.shift()!.n;
  }
  const b = s.barrel;
  if (b && b.built) {
    while (b.water < FOREST.barrel.cap && b.clock <= T) {
      b.water++;
      b.clock += FOREST.barrel.fillEveryMs;
    }
  }
}

/** Ground counts at W without changing the state (for drawing). */
export function groundAt(s: ForestSim, g: GroundTree, W: number): { seeds: number; leaves: number } {
  let seeds = g.seeds;
  let sc = g.sc;
  while (seeds < FOREST.seedGroundCap && sc <= W) {
    seeds++;
    sc += seedPeriod(s, g.u);
  }
  let leaves = g.leaves;
  let lc = g.lc;
  while (leaves < FOREST.leafGroundCap && lc <= W) {
    leaves++;
    lc += leafPeriod(lc);
  }
  return { seeds, leaves };
}

export function compostAt(c: Compost, W: number): { fresh: number; mould: number } {
  let ready = c.ready;
  let fresh = 0;
  for (const b of c.batches) {
    if (b.r <= W) ready += b.n;
    else fresh += b.n;
  }
  return { fresh, mould: Math.floor(ready / FOREST.leavesPerMould) - c.taken };
}

export function barrelAt(s: ForestSim, W: number): number {
  const b = s.barrel;
  if (!b || !b.built) return 0;
  let water = b.water;
  let clock = b.clock;
  while (water < FOREST.barrel.cap && clock <= W) {
    water++;
    clock += FOREST.barrel.fillEveryMs;
  }
  return water;
}

const mouldIn = (c: Compost) => Math.floor(c.ready / FOREST.leavesPerMould) - c.taken;

// ---------------------------------------------------------------------------
// Planning helpers

function walk(ctx: ForestCtx, plan: Planned[], from: NodeId, to: NodeId, c = '', n = 0, ref = -1): NodeId {
  const dur = ctx.travel.ms(from, to);
  if (dur > 0) plan.push({ k: 'walk', a: from, b: to, dur, n, c, ref, fx: '' });
  return to;
}

function act(plan: Planned[], k: string, at: NodeId, dur: number, fx: string, c = '', n = 0, ref = -1) {
  plan.push({ k, a: at, b: at, dur, n, c, ref, fx });
}

/** The closest water to fill the can on the way from `at` to `dest`. */
function waterSource(s: ForestSim, ctx: ForestCtx, at: NodeId, dest: NodeId, T: number): NodeId {
  const c = s.cluster;
  const options: NodeId[] = [springOf(c)];
  if (s.channel >= FOREST.channel.segments) options.push(basinOf(c));
  if (s.barrel && s.barrel.built && barrelAt(s, T) > 0) options.push(barrelOf(c));
  let best = options[0];
  let bt = Infinity;
  for (const o of options) {
    const t = ctx.travel.ms(at, o) + ctx.travel.ms(o, dest);
    if (t < bt) {
      bt = t;
      best = o;
    }
  }
  return best;
}

function fetchWater(s: ForestSim, ctx: ForestCtx, plan: Planned[], at: NodeId, dest: NodeId, T: number): NodeId {
  const src = waterSource(s, ctx, at, dest, T);
  at = walk(ctx, plan, at, src);
  act(plan, 'fill', src, FOREST.fillMs, 'fill', 'water', FOREST.canCap);
  return at;
}

/** Compost with mould ready, nearest to `at`. */
function mouldSource(s: ForestSim, ctx: ForestCtx, at: NodeId): Compost | null {
  let best: Compost | null = null;
  let bt = Infinity;
  for (const c of s.composts) {
    if (mouldIn(c) <= 0) continue;
    const t = ctx.travel.ms(at, compostOf(c.c));
    if (t < bt) {
      bt = t;
      best = c;
    }
  }
  return best;
}

function treeWithSeeds(s: ForestSim, ctx: ForestCtx, at: NodeId): GroundTree | null {
  let best: GroundTree | null = null;
  let bt = Infinity;
  for (const g of s.ground) {
    if (g.seeds <= 0) continue;
    const t = ctx.travel.ms(at, siteOf(g.u));
    if (t < bt) {
      bt = t;
      best = g;
    }
  }
  return best;
}

function treeWithLeaves(s: ForestSim, ctx: ForestCtx, at: NodeId, min: number, skip = -1): GroundTree | null {
  let best: GroundTree | null = null;
  let bt = Infinity;
  for (const g of s.ground) {
    if (g.leaves < min || g.u === skip) continue;
    const t = ctx.travel.ms(at, siteOf(g.u));
    if (t < bt) {
      bt = t;
      best = g;
    }
  }
  return best;
}

/** Time until the growing tree reaches its next care point that was not cared for yet. */
function untilCare(s: ForestSim, T: number): number {
  const tr = s.tree;
  if (tr.phase === 2) return 0;
  if (tr.phase !== 1 || tr.gate >= FOREST.gates.length || tr.cared >= tr.gate) return Infinity;
  return tr.gt + (gateMs(tr, tr.gate) - tr.gm) - T;
}

// ---------------------------------------------------------------------------
// Keeper

function dispatchKeeper(s: ForestSim, ctx: ForestCtx, w: Worker, T: number) {
  catchUp(s, T);
  const plan: Planned[] = [];
  let at = w.at;
  const c = s.cluster;
  const tr = s.tree;
  const site = siteOf(tr.unit);
  const done = (job: string) => {
    w.job = job;
    w.plan = plan;
  };

  // 0. a new clearing: carry the seed basket from the old bench to the new one
  if (s.setup < 2) {
    s.setup = 1;
    const old = benchOf(Math.max(0, c - 1));
    at = walk(ctx, plan, at, old);
    act(plan, 'liftBasket', old, 2500, 'liftBasket', 'seedbox', s.seeds);
    at = walk(ctx, plan, at, benchOf(c), 'seedbox', s.seeds);
    act(plan, 'setBench', benchOf(c), 6000, 'setup', 'seedbox', s.seeds, c);
    return done('move');
  }

  // 1. care for the growing tree at (or shortly before) its care point
  if (untilCare(s, T) <= 25_000) {
    const gate = tr.gate;
    // the second care point also mulches with leaf mould when there is some
    const wantMould = gate === 1 && !tr.mulched && (s.mould > 0 || mouldSource(s, ctx, at) !== null);
    if (wantMould && s.mould <= 0) {
      const src = mouldSource(s, ctx, at)!;
      at = walk(ctx, plan, at, compostOf(src.c));
      act(plan, 'scoop', compostOf(src.c), FOREST.scoopMs, `scoop:${src.c}`, 'mould', 1);
    }
    if (s.can <= 0) at = fetchWater(s, ctx, plan, at, site, T);
    at = walk(ctx, plan, at, site, wantMould ? 'mould' : '', wantMould ? 1 : 0, tr.unit);
    if (wantMould) act(plan, 'mulch', site, FOREST.mulchMs, 'mulch', 'mould', 1, tr.unit);
    act(plan, seasonAt(T) === 3 ? 'protect' : 'water', site, FOREST.careMs, `care:${gate}`, 'water', 1, tr.unit);
    return done('care');
  }

  // 2. plant the next tree
  if (tr.phase === 0) {
    const stashed = s.stash !== null && s.stash.u === tr.unit;
    if (!stashed && s.hand <= 0 && s.seeds <= 0) {
      // no seed at hand: gather one first (trees always drop seeds again)
      const g = treeWithSeeds(s, ctx, at);
      if (g) {
        at = walk(ctx, plan, at, siteOf(g.u), '', 0, g.u);
        act(plan, 'pickSeed', siteOf(g.u), FOREST.pickSeedMs, `pick:${g.u}`, 'seed', g.seeds, g.u);
        return done('seeds');
      }
      at = walk(ctx, plan, at, restOf(c));
      act(plan, 'rest', restOf(c), FOREST.restMs, '', '', 0);
      return done('wait');
    }
    if (!stashed && s.hand <= 0) {
      at = walk(ctx, plan, at, benchOf(c));
      act(plan, 'takeSeed', benchOf(c), 1800, 'takeSeed', 'seed', 1);
    }
    const mouldReady = !(s.prep && s.prep.u === tr.unit && s.prep.mould) && (s.mould > 0 || mouldSource(s, ctx, at) !== null);
    if (mouldReady && s.mould <= 0) {
      const src = mouldSource(s, ctx, at)!;
      at = walk(ctx, plan, at, compostOf(src.c));
      act(plan, 'scoop', compostOf(src.c), FOREST.scoopMs, `scoop:${src.c}`, 'mould', 1);
    }
    if (s.can <= 0) at = fetchWater(s, ctx, plan, at, site, T);
    at = walk(ctx, plan, at, site, 'seed', 1, tr.unit);
    if (!(s.prep && s.prep.u === tr.unit)) act(plan, 'clear', site, FOREST.clearMs, 'clear', '', 0, tr.unit);
    if (mouldReady) act(plan, 'mulch', site, FOREST.mulchMs, 'mulch', 'mould', 1, tr.unit);
    act(plan, 'plant', site, FOREST.plantMs, 'plant', 'seed', 1, tr.unit);
    act(plan, 'water', site, FOREST.waterMs, 'sow', 'water', 1, tr.unit);
    return done('plant');
  }

  // 3. gather seeds when the basket runs low
  if (s.seeds + s.hand < FOREST.seedReserve) {
    const g = treeWithSeeds(s, ctx, at);
    if (g) {
      at = walk(ctx, plan, at, siteOf(g.u), '', 0, g.u);
      act(plan, 'pickSeed', siteOf(g.u), FOREST.pickSeedMs, `pick:${g.u}`, 'seed', g.seeds, g.u);
      at = walk(ctx, plan, at, benchOf(c), 'seed', g.seeds);
      act(plan, 'storeSeed', benchOf(c), 2000, 'storeSeed', 'seed', g.seeds);
      return done('seeds');
    }
  }

  // 4. rake leaves into the basket and take them to the compost (while it needs more)
  let stocked = s.mould;
  for (const cp of s.composts) stocked += mouldIn(cp) + Math.floor(cp.batches.reduce((a, b) => a + b.n, 0) / FOREST.leavesPerMould);
  const lt = stocked < FOREST.mouldTarget ? treeWithLeaves(s, ctx, at, FOREST.rakeMin) : null;
  if (lt && s.basket < FOREST.basketCap) {
    let n = Math.min(FOREST.basketCap - s.basket, lt.leaves);
    at = walk(ctx, plan, at, siteOf(lt.u), 'leaf', s.basket, lt.u);
    act(plan, 'rake', siteOf(lt.u), FOREST.rakeMs, `rake:${lt.u}`, 'leaf', s.basket + n, lt.u);
    let carried = s.basket + n;
    const lt2 = carried < FOREST.basketCap ? treeWithLeaves(s, ctx, siteOf(lt.u), FOREST.rakeMin, lt.u) : null;
    if (lt2) {
      n = Math.min(FOREST.basketCap - carried, lt2.leaves);
      at = walk(ctx, plan, at, siteOf(lt2.u), 'leaf', carried, lt2.u);
      act(plan, 'rake', siteOf(lt2.u), FOREST.rakeMs, `rake:${lt2.u}`, 'leaf', carried + n, lt2.u);
      carried += n;
    }
    at = walk(ctx, plan, at, compostOf(c), 'leaf', carried, c);
    act(plan, 'dump', compostOf(c), FOREST.dumpMs, 'dump', 'leaf', carried, c);
    return done('leaves');
  }

  // 5. prepare the next clearing, with leaf mould when there is some
  const nextU = tr.unit + 1;
  if (tr.phase >= 1 && Math.floor(nextU / UPZ) === s.zone) {
    const prepared = s.prep && s.prep.u === nextU;
    const src = s.mould > 0 ? null : mouldSource(s, ctx, at);
    const canMould = s.mould > 0 || src !== null;
    if (!prepared || (!s.prep!.mould && canMould)) {
      if (canMould && s.mould <= 0) {
        at = walk(ctx, plan, at, compostOf(src!.c));
        act(plan, 'scoop', compostOf(src!.c), FOREST.scoopMs, `scoop:${src!.c}`, 'mould', 1);
      }
      at = walk(ctx, plan, at, siteOf(nextU), canMould ? 'mould' : '', canMould ? 1 : 0, nextU);
      if (!prepared) act(plan, 'clear', siteOf(nextU), FOREST.clearMs, 'prep', '', 0, nextU);
      if (canMould) act(plan, 'spread', siteOf(nextU), FOREST.mulchMs, 'prepMould', 'mould', 1, nextU);
      return done('prep');
    }
  }

  // 6. a flowerbed from spare leaf mould and a spare seed
  const bedsHere = s.beds.filter((b) => b.c === c).length;
  const doneInCluster = s.done - c * UPC;
  if (bedsHere < FOREST.flowerbed.perCluster && doneInCluster >= 1 && s.seeds >= 2 + FOREST.flowerbed.seeds && s.tree.phase >= 1) {
    let avail = s.mould;
    for (const cp of s.composts) avail += mouldIn(cp);
    if (avail >= FOREST.flowerbed.mould) {
      let need = FOREST.flowerbed.mould - s.mould;
      // take what is needed from the composts, nearest first
      const order = [...s.composts].filter((cp) => mouldIn(cp) > 0).sort((a, b) => ctx.travel.ms(at, compostOf(a.c)) - ctx.travel.ms(at, compostOf(b.c)));
      let carry = s.mould;
      for (const cp of order) {
        if (need <= 0) break;
        const n = Math.min(need, mouldIn(cp));
        at = walk(ctx, plan, at, compostOf(cp.c), 'mould', carry);
        act(plan, 'scoop', compostOf(cp.c), FOREST.scoopMs, `scoop:${cp.c}:${n}`, 'mould', carry + n);
        carry += n;
        need -= n;
      }
      at = walk(ctx, plan, at, benchOf(c), 'mould', carry);
      act(plan, 'takeSeed', benchOf(c), 1800, 'takeSeed', 'seed', 1);
      const k = bedsHere;
      at = walk(ctx, plan, at, bedOf(c, k), 'mould', carry);
      act(plan, 'bed', bedOf(c, k), FOREST.flowerbed.ms, `bed:${c}:${k}`, 'mould', carry, c);
      return done('bed');
    }
  }

  // 7. a rain barrel beside the bench of every later clearing
  if (s.barrel && !s.barrel.built) {
    at = walk(ctx, plan, at, barrelOf(c));
    act(plan, 'build', barrelOf(c), FOREST.barrel.buildMs, 'barrel', '', 0, c);
    return done('barrel');
  }

  // 8. dig the channel that brings spring water close to the back of the clearing
  if (s.channel < FOREST.channel.segments && doneInCluster >= FOREST.channel.afterTrees) {
    const i = s.channel;
    at = walk(ctx, plan, at, ditchOf(c, i));
    act(plan, 'dig', ditchOf(c, i), FOREST.channel.segMs, 'dig', '', 0, c);
    return done('channel');
  }

  // 9. keep the can full
  if (s.can < FOREST.canCap) {
    at = fetchWater(s, ctx, plan, at, restOf(c), T);
    return done('water');
  }

  // 10. rest on the bench, or stand by the young tree for a while and watch it
  s.idleN++;
  if (tr.phase >= 1 && s.idleN % 3 === 2) {
    at = walk(ctx, plan, at, site, '', 0, tr.unit);
    act(plan, 'watch', site, FOREST.restMs, '', '', 0, tr.unit);
    return done('watch');
  }
  at = walk(ctx, plan, at, restOf(c));
  act(plan, 'rest', restOf(c), FOREST.restMs, '', '', 0);
  return done('rest');
}

// ---------------------------------------------------------------------------
// Squirrel: carries a fallen seed to the next planting spot and buries it there

function plantingTarget(s: ForestSim): number {
  return s.tree.phase === 0 ? s.tree.unit : s.tree.unit + 1;
}

function dispatchSquirrel(s: ForestSim, ctx: ForestCtx, w: Worker, T: number) {
  catchUp(s, T);
  const plan: Planned[] = [];
  let at = w.at;
  const target = plantingTarget(s);
  const home = treeOf(s.ground.length ? s.ground[0].u : Math.max(0, s.done - 1));
  const sameZone = Math.floor(target / UPZ) === s.zone;
  const src = s.stash === null && sameZone ? s.ground.find((g) => g.seeds > 0) : undefined;
  const run = (to: NodeId, c = '', ref = -1) => {
    const dur = ctx.squirrel.ms(at, to);
    if (dur > 0) plan.push({ k: 'run', a: at, b: to, dur, n: c ? 1 : 0, c, ref, fx: '' });
    at = to;
  };
  if (src) {
    run(treeOf(src.u), '', src.u);
    act(plan, 'nibble', treeOf(src.u), 2200, `sqtake:${src.u}`, '', 0, src.u);
    run(siteOf(target), 'seed', target);
    act(plan, 'bury', siteOf(target), 2600, `bury:${target}`, 'seed', 1, target);
    run(home);
    w.job = 'carry';
  } else {
    if (at !== home) run(home);
    w.job = 'rest';
  }
  act(plan, 'perch', home, FOREST.squirrel.everyMs, '', '', 0);
  w.plan = plan;
}

// ---------------------------------------------------------------------------
// Effects

function complete(s: ForestSim, T: number) {
  const unit = s.tree.unit;
  s.done = unit + 1;
  s.doneAt.push(T);
  s.log.push({ u: unit, W: T });
  if (s.log.length > 64) s.log.splice(0, s.log.length - 64);
  s.ground.push(groundTree(unit, T, s.ground.length % 5));
  const next = unit + 1;
  s.tree = newTree(next);
  if (s.prep && s.prep.u === next) {
    s.tree.cleared = true;
    if (s.prep.mould) s.tree.mulched = true;
  }
  if (s.tree.mulched) s.tree.dur = Math.round(FOREST.growMs * (1 - FOREST.mulchSpeedup));
  if (!s.squirrel && s.done >= FOREST.squirrel.afterTrees) s.squirrel = newWorker(1, treeOf(unit), T);
  const nc = Math.floor(next / UPC);
  if (nc !== s.cluster) {
    // what was built in the clearing stays in the landscape
    s.dug[s.cluster] = s.channel;
    if (s.barrel?.built) s.barrels[s.cluster] = 1;
    for (const k of Object.keys(s.dug)) if (Number(k) < nc - 8) delete s.dug[k];
    for (const k of Object.keys(s.barrels)) if (Number(k) < nc - 8) delete s.barrels[k];
    s.cluster = nc;
    s.setup = 0;
    s.channel = 0;
    s.barrel = { c: nc, built: false, water: 0, clock: 0 };
    const nz = Math.floor(nc / 4);
    if (nz !== s.zone) {
      // a new zone: earlier trees stay as landscape and stop counting as sources
      s.zone = nz;
      s.doneAt = [];
      s.ground = [];
      s.composts = [];
      // flowerbeds of the previous zones stay in the landscape (only recent ones are kept)
      s.beds = s.beds.filter((b) => b.c >= nc - 8);
      s.stash = null;
      s.prep = null;
    }
  }
}

function compostFor(s: ForestSim, c: number): Compost {
  let cp = s.composts.find((x) => x.c === c);
  if (!cp) {
    cp = { c, batches: [], ready: 0, taken: 0 };
    s.composts.push(cp);
  }
  return cp;
}

function finishKeeperStep(s: ForestSim, st: Step, T: number) {
  catchUp(s, T);
  const [fx, a, b] = st.fx.split(':');
  const tr = s.tree;
  switch (fx) {
    case 'fill': {
      const need = FOREST.canCap - s.can;
      if (st.a.startsWith('r') && s.barrel) {
        const n = Math.min(need, s.barrel.water);
        if (s.barrel.water >= FOREST.barrel.cap) s.barrel.clock = T + FOREST.barrel.fillEveryMs;
        s.barrel.water -= n;
        s.can += n;
      } else s.can = FOREST.canCap;
      break;
    }
    case 'takeSeed':
      if (s.seeds > 0) {
        s.seeds--;
        s.hand++;
      }
      break;
    case 'storeSeed':
      s.seeds = Math.min(FOREST.pouchCap, s.seeds + s.hand);
      s.hand = 0;
      break;
    case 'pick': {
      const g = s.ground.find((x) => x.u === Number(a));
      if (g && g.seeds > 0) {
        if (g.seeds >= FOREST.seedGroundCap && g.sc <= T) g.sc = T + seedPeriod(s, g.u);
        s.hand += g.seeds;
        s.totals.seeds += g.seeds;
        g.seeds = 0;
      }
      break;
    }
    case 'rake': {
      const g = s.ground.find((x) => x.u === Number(a));
      if (g) {
        const n = Math.min(FOREST.basketCap - s.basket, g.leaves);
        if (g.leaves >= FOREST.leafGroundCap && g.lc <= T) g.lc = T + leafPeriod(T);
        g.leaves -= n;
        s.basket += n;
        s.totals.leaves += n;
      }
      break;
    }
    case 'dump':
      if (s.basket > 0) {
        compostFor(s, Number(st.ref)).batches.push({ n: s.basket, r: T + FOREST.compostMs });
        s.basket = 0;
      }
      break;
    case 'scoop': {
      const cp = s.composts.find((x) => x.c === Number(a));
      const want = b ? Number(b) : 1;
      if (cp) {
        const n = Math.min(want, mouldIn(cp));
        cp.taken += n;
        s.mould += n;
        s.totals.mould += n;
      }
      break;
    }
    case 'clear':
      if (tr.unit === st.ref) tr.cleared = true;
      break;
    case 'mulch':
      if (s.mould > 0 && tr.unit === st.ref && !tr.mulched) {
        s.mould--;
        tr.mulched = true;
        const dur = Math.round(FOREST.growMs * (1 - FOREST.mulchSpeedup));
        if (tr.phase >= 1) {
          // keep the reached fraction; the rest grows faster
          const gmNow = tr.phase === 1 ? tr.gm + (T - tr.gt) : tr.gm;
          tr.gm = Math.round((gmNow * dur) / tr.dur);
          tr.gt = T;
        }
        tr.dur = dur;
      }
      break;
    case 'plant':
      if (tr.unit === st.ref) {
        if (s.stash && s.stash.u === tr.unit) s.stash = null;
        else if (s.hand > 0) s.hand--;
        tr.cleared = true;
      }
      break;
    case 'sow':
      if (tr.unit === st.ref && tr.phase === 0) {
        s.can = Math.max(0, s.can - 1);
        tr.phase = 1;
        tr.plantedAt = T;
        tr.gm = 0;
        tr.gt = T;
      }
      break;
    case 'care': {
      const gate = Number(a);
      s.can = Math.max(0, s.can - 1);
      if (tr.phase === 2 && tr.gate === gate) {
        tr.phase = 1;
        tr.gt = T;
        tr.gate++;
      } else if (tr.phase === 1 && tr.gate === gate) tr.cared = gate;
      break;
    }
    case 'prep':
      s.prep = { u: st.ref, mould: s.prep?.u === st.ref ? s.prep.mould : false };
      break;
    case 'prepMould':
      if (s.mould > 0) {
        s.mould--;
        s.prep = { u: st.ref, mould: true };
      }
      break;
    case 'bed':
      if (s.mould >= FOREST.flowerbed.mould && s.hand >= FOREST.flowerbed.seeds) {
        s.mould -= FOREST.flowerbed.mould;
        s.hand -= FOREST.flowerbed.seeds;
        s.beds.push({ c: Number(a), k: Number(b), at: T });
      }
      break;
    case 'barrel':
      if (s.barrel) {
        s.barrel.built = true;
        s.barrel.clock = T + FOREST.barrel.fillEveryMs;
      }
      break;
    case 'dig':
      s.channel = Math.min(FOREST.channel.segments, s.channel + 1);
      break;
    case 'setup':
      s.setup = 2;
      break;
  }
}

function finishSquirrelStep(s: ForestSim, st: Step, T: number) {
  catchUp(s, T);
  const [fx, a] = st.fx.split(':');
  if (fx === 'sqtake') {
    const g = s.ground.find((x) => x.u === Number(a));
    if (g && g.seeds > 0) {
      if (g.seeds >= FOREST.seedGroundCap && g.sc <= T) g.sc = T + seedPeriod(s, g.u);
      g.seeds--;
      s.sqCarry = 1;
    }
  } else if (fx === 'bury') {
    if (s.sqCarry === 1 && s.stash === null && Number(a) === plantingTarget(s)) s.stash = { u: Number(a) };
    s.sqCarry = 0;
  }
}

// ---------------------------------------------------------------------------
// Event loop

/** Time of the growing tree's next stop (care point not cared for, or maturity). */
function treeEvent(s: ForestSim): number {
  const tr = s.tree;
  if (tr.phase !== 1) return Infinity;
  if (tr.gate < FOREST.gates.length) return tr.gt + (gateMs(tr, tr.gate) - tr.gm);
  return tr.gt + (tr.dur - tr.gm);
}

function onTreeEvent(s: ForestSim, T: number) {
  const tr = s.tree;
  if (tr.gate < FOREST.gates.length) {
    tr.gm = gateMs(tr, tr.gate);
    tr.gt = T;
    if (tr.cared >= tr.gate) tr.gate++;
    else tr.phase = 2;
  } else {
    tr.gm = tr.dur;
    complete(s, T);
  }
}

function begin(w: Worker, pl: Planned, T: number) {
  const dur = Math.max(1, pl.dur);
  w.step = { k: pl.k, a: pl.a, b: pl.b, t0: T, t1: T + dur, n: pl.n, c: pl.c, ref: pl.ref, fx: pl.fx };
}

export function advanceForest(s: ForestSim, ctx: ForestCtx, W: number, maxEvents = Infinity): number {
  let events = 0;
  for (;;) {
    const te = treeEvent(s);
    const k = s.keeper;
    const ke = k.step ? k.step.t1 : k.born;
    const q = s.squirrel;
    const qe = q ? (q.step ? q.step.t1 : q.born) : Infinity;
    const at = Math.min(te, ke, qe);
    if (at > W || events >= maxEvents) break;
    s.t = at;
    events++;
    // fixed order at equal times: the tree, then the keeper, then the squirrel
    if (te === at) {
      onTreeEvent(s, at);
      continue;
    }
    if (ke === at) {
      if (k.step) {
        const st = k.step;
        k.step = null;
        finishKeeperStep(s, st, at);
        k.at = st.b;
      }
      if (!k.plan.length) dispatchKeeper(s, ctx, k, at);
      begin(k, k.plan.shift()!, at);
      continue;
    }
    if (q && qe === at) {
      if (q.step) {
        const st = q.step;
        q.step = null;
        finishSquirrelStep(s, st, at);
        q.at = st.b;
      }
      if (!q.plan.length) dispatchSquirrel(s, ctx, q, at);
      begin(q, q.plan.shift()!, at);
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Queries

/** Growth (0..1) of a unit at W; null if not planted (or cleared) yet. */
export function forestUnitProgress(s: ForestSim, unit: number, W: number): number | null {
  if (unit < s.done) return 1;
  const tr = s.tree;
  if (unit !== tr.unit || tr.phase === 0) return null;
  const gm = tr.phase === 1 ? Math.min(tr.gm + Math.max(0, W - tr.gt), stopGm(tr)) : tr.gm;
  return Math.min(0.9999, gm / tr.dur);
}

function stopGm(tr: ForestTree): number {
  if (tr.gate < FOREST.gates.length && tr.cared < tr.gate) return gateMs(tr, tr.gate);
  return tr.dur;
}

export function forestDoneAt(s: ForestSim, unit: number): number {
  if (unit >= s.done) return Infinity;
  const i = unit - s.zone * UPZ;
  if (i < 0) return -Infinity;
  const t = s.doneAt[i];
  return t === undefined || t < 0 ? -Infinity : t;
}

export function cloneForest(s: ForestSim): ForestSim {
  return JSON.parse(JSON.stringify(s)) as ForestSim;
}
