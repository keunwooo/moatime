/**
 * Colony work simulation: worker drones mine metal, crystal and rare mineral at each outpost's
 * deposits → haul it to the depot → the next building's whole cost is reserved → crates go to
 * the site → staged assembly → inspection → the building's role changes later work.
 *
 * Accounting (one consistent rule, reservation), per resource:
 *   - Mined crates are cargo until they are unloaded at the depot; only then they are stock.
 *   - When a project starts, its whole cost is reserved from the free stock once
 *     (`reservedAt` guards it). Reserved crates stay at the depot until a drone picks them up.
 *   - Crates move depot → drone → site pile; each stage consumes its share of the site pile
 *     (metal for the structure, crystal and rare mineral for the equipment).
 * Energy is the power grid: generators feed it, drones charge from it.
 * Every quantity changes only inside an event, at a definite world time, in a fixed order.
 */

import { RES, SPACE, stageNeed, type Amt, type Res, type SpaceKind } from './config';
import { innerOfUnit, TravelTable, type NodeId } from './layout';
import { kindOf } from './spacePlan';
import type { CompletionLog, Planned, SimBase, Step, Worker } from './types';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from './units';
import { makeRaid, type RaidPlan } from './raid';
import { nextRaidAt } from '../world/pace';
import { EVENT_DEFS } from '../world/events';
import { BLOCK_MS, eventAt, eventOfBlock } from '../world/timeline';

export interface Rover extends Worker {
  /** Battery charge in milli-units. */
  bat: number;
}

export interface SpaceProject {
  unit: number;
  kind: SpaceKind;
  cost: Amt;
  /** -1 until the cost is reserved (the site is revealed then). */
  reservedAt: number;
  /** Reserved crates still at the depot. */
  atDepot: Amt;
  /** Crates promised to a planned haul but not picked up yet. */
  claimed: Amt;
  inTransit: Amt;
  onSite: Amt;
  /** Next stage to assemble (`SPACE.stages.length` when complete). */
  stage: number;
  /** A drone is heading to or assembling the next stage. */
  building: boolean;
  /** Window of the stage being assembled (valid while assembling). */
  st0: number;
  st1: number;
  /** Which drone assembles (-1 none). */
  builder: number;
}

export interface SpaceSim {
  v: number;
  /** World seed (the colony's name and other fixed choices). */
  seed: number;
  /** Time of the last processed event. */
  t: number;
  done: number;
  /** Completion time of each unit of the current zone (unit - zone start), -1 = from before. */
  doneAt: number[];
  zone: number;
  /** Active cluster (outpost); its depot holds the stock. */
  cluster: number;
  /** The active outpost's depot: 0 needs setting up, 1 a drone is on it, 2 ready. */
  setup: number;
  /** The active outpost's deposits are known (surveyed, or seen by a dish). */
  oreKnown: boolean;
  /** A drone is on its way to survey the active deposits. */
  surveying: boolean;
  /** Free crates at the depot (not reserved). */
  stock: Amt;
  /** Crates physically at the depot (free + reserved waiting for pick-up). */
  depot: Amt;
  /** Crates promised by mining jobs in progress (not unloaded yet). */
  pending: Amt;
  proj: SpaceProject;
  rovers: Rover[];
  /** Base battery: stored milli-units `b` at time `t`; `gen` milli-units per second. */
  grid: { b: number; t: number; gen: number };
  /** Buildings of the colony so far, by kind. */
  counts: Record<SpaceKind, number>;
  /** First outpost with a rare deposit (research found it; -1 none yet). */
  rareFrom: number;
  /** Outposts with an extractor at their metal deposit (recent ones). */
  rigs: number[];
  /** Zone in which a dish already found the deposits of new outposts (-1 none). */
  antennaZone: number;
  /** Crates taken from the active outpost's deposits (they visibly shrink). */
  dug: Amt;
  /** Greenhouses of the current zone and when each needs a visit. */
  care: { u: number; due: number; claimed: boolean }[];
  /** Trips in the active cluster (worn tracks). */
  wear: { ore: number; site: number };
  /** Maintenance rounds made so far (which finished building is checked next). */
  rounds: number;
  /** The scout flight that found the active outpost (from the previous one), if any. */
  scout: { c: number; from: number; t0: number; t1: number } | null;
  /** Highest outpost whose power line from the previous outpost is laid. */
  linked: number;
  /**
   * The garrison: guards and tanks, guards sheltering after a raid (back at `backAt`) and when
   * the next guard / tank is ready (NEVER: none being trained).
   */
  army: { inf: number; tanks: number; out: number; backAt: number; infNext: number; tankNext: number };
  /**
   * Raids so far; planned raids at or after `from` are still to come (the plan is the session
   * pacing, see world/pace.ts); `delay`: a raid held back by a headline sight (NEVER: none).
   */
  raids: { n: number; from: number; delay: number };
  /** The raid going on now. */
  raid: RaidPlan | null;
  /** Damaged buildings waiting for repair (level 1..4). */
  damage: { u: number; level: number; claimed: boolean }[];
  /** A building lost in a raid: rubble to clear, then rebuilt stage by stage. */
  wreck: { u: number; cleared: boolean; stage: number; claimed: boolean } | null;
  /** Maintenance drones (repairs and rebuilding after raids; separate from the work drones). */
  crew: Worker[];
  /** Crates mined in total, by resource. */
  mined: Amt;
  log: CompletionLog[];
  /** Kinds of units below these follow older plans (timer rules, then the moon-base plan). */
  legacyUnits: number;
  v1Units: number;
}

export interface SpaceCtx {
  seed: number;
  travel: TravelTable;
  /** Planned raid starts, sorted (world/pace.ts). */
  raids: readonly number[];
}

export function spaceCtx(seed: number, raids: readonly number[] = []): SpaceCtx {
  return { seed, travel: new TravelTable('space', seed, SPACE.speed), raids };
}

const STAGES = SPACE.stages;
const NSTAGE = STAGES.length;
const KINDS = Object.keys(SPACE.costs) as SpaceKind[];

const zero = (): Amt => ({ m: 0, c: 0, r: 0 });
/** "Not scheduled": a finite stand-in for Infinity that survives JSON (checkpoints, clones). */
export const NEVER = 2 ** 52;
const total = (a: Amt) => a.m + a.c + a.r;
const covers = (have: Amt, need: Amt) => have.m >= need.m && have.c >= need.c && have.r >= need.r;

const depotOf = (cluster: number): NodeId => `d${cluster}`;
/** Deposit of each resource at an outpost: metal o, crystal x, rare y. */
const depositOf = (cluster: number, t: Res): NodeId => `${t === 'm' ? 'o' : t === 'c' ? 'x' : 'y'}${cluster}`;
/** One parking spot per drone (cluster·8 + drone id). */
const parkOf = (cluster: number, id: number): NodeId => `p${cluster * 8 + id}`;
const siteOf = (unit: number): NodeId => `s${unit}`;
/** The maintenance drones' bay at an outpost. */
const bayOf = (cluster: number): NodeId => `e${cluster}`;
const helperOf = (unit: number): NodeId => `h${unit}`;
/** The first outpost charges at the landing pod's battery; later ones at their depot charger. */
const chargerOf = (cluster: number): NodeId => (cluster === 0 ? 'L0' : `c${cluster}`);

/** Does this outpost have a rare deposit? */
export function rareAt(s: Pick<SpaceSim, 'rareFrom'>, cluster: number): boolean {
  return s.rareFrom >= 0 && cluster >= s.rareFrom;
}

function newProject(ctx: SpaceCtx, s: Pick<SpaceSim, 'legacyUnits' | 'v1Units' | 'rareFrom'>, unit: number): SpaceProject {
  const kind = kindOf(ctx.seed, unit, s.legacyUnits, s.v1Units);
  const base = SPACE.costs[kind];
  // without a known rare deposit, crystal takes rare mineral's place
  const cost: Amt = rareAt(s, Math.floor(unit / UPC)) ? { ...base } : { m: base.m, c: base.c + base.r, r: 0 };
  return {
    unit,
    kind,
    cost,
    reservedAt: -1,
    atDepot: zero(),
    claimed: zero(),
    inTransit: zero(),
    onSite: zero(),
    stage: 0,
    building: false,
    st0: 0,
    st1: 0,
    builder: -1,
  };
}

/** What a stage of this project uses (rare folded into crystal when the cost was). */
export function needOf(p: SpaceProject, stage: number): Amt {
  const n = stageNeed(p.kind, stage);
  if (p.cost.r === 0 && n.r > 0) return { m: n.m, c: n.c + n.r, r: 0 };
  return n;
}

function newRover(id: number, at: NodeId, born: number): Rover {
  return { id, at, step: null, plan: [], job: 'idle', born, bat: SPACE.battery.cap };
}

function addRover(s: SpaceSim, at: NodeId, T: number) {
  if (s.rovers.length < SPACE.maxRovers) s.rovers.push(newRover(s.rovers.length, at, T));
}

function noCounts(): Record<SpaceKind, number> {
  const c = {} as Record<SpaceKind, number>;
  for (const k of KINDS) c[k] = 0;
  return c;
}

export function initSpace(seed: number, base: SimBase): SpaceSim {
  const ctx = spaceCtx(seed);
  // per-theme progress (data version 2 worlds) or the shared timer-rule progress (version 1)
  const from = base.space ?? base.legacy;
  const legacyDone = from ? from.units : 0;
  const partial = from ? from.partial : 0;
  const started = legacyDone + (partial > 0 ? 1 : 0);
  // facilities from the timer-spawn rules keep their kinds (also through a second migration)
  const legacyUnits = base.space ? base.space.kindsFrom : started;
  const v1Units = started;
  const zone = Math.floor(legacyDone / UPZ);
  const cluster = Math.floor(legacyDone / UPC);
  // roles of buildings that already exist
  const counts = noCounts();
  let rareFrom = -1;
  let antennaZone = -1;
  const rigs: number[] = [];
  const care: SpaceSim['care'] = [];
  for (let u = 0; u < legacyDone; u++) {
    const k = kindOf(seed, u, legacyUnits, v1Units);
    counts[k]++;
    if (k === 'research' && rareFrom < 0) rareFrom = Math.floor(u / UPC);
    else if (k === 'dish') antennaZone = Math.max(antennaZone, Math.floor(u / UPZ));
    else if (k === 'extractor') rigs.push(Math.floor(u / UPC));
    else if (k === 'greenhouse' && Math.floor(u / UPZ) === zone) care.push({ u, due: base.W + SPACE.careEveryMs, claimed: false });
  }
  const s: SpaceSim = {
    v: 2,
    seed,
    t: base.W,
    done: legacyDone,
    doneAt: Array.from({ length: legacyDone - zone * UPZ }, () => -1),
    zone,
    cluster,
    setup: 2,
    oreKnown: true,
    surveying: false,
    stock: zero(),
    depot: zero(),
    pending: zero(),
    proj: null as unknown as SpaceProject,
    rovers: [],
    grid: { b: SPACE.grid.start, t: base.W, gen: SPACE.grid.base + SPACE.grid.perSolar * counts.generator },
    counts,
    rareFrom,
    rigs: rigs.filter((c) => c >= cluster - 8),
    antennaZone,
    dug: zero(),
    care,
    wear: { ore: 0, site: 0 },
    rounds: 0,
    scout: null,
    linked: cluster,
    army: { inf: 0, tanks: 0, out: 0, backAt: NEVER, infNext: NEVER, tankNext: NEVER },
    raids: { n: 0, from: base.W, delay: NEVER },
    raid: null,
    damage: [],
    wreck: null,
    crew: [],
    mined: zero(),
    log: [],
    legacyUnits,
    v1Units,
  };
  s.proj = newProject(ctx, s, legacyDone);
  // a migrated colony starts training from now on
  trainNext(s, base.W);
  syncCrew(s, base.W);
  if (partial > 0) {
    // The facility under construction keeps its look: stages already passed are done and the
    // rest of its materials are on site, so assembly simply continues.
    const p = s.proj;
    let stage = 0;
    while (stage < NSTAGE && STAGES[stage].u[1] <= partial + 1e-9) stage++;
    const rest = zero();
    for (let i = stage; i < NSTAGE; i++) {
      const n = needOf(p, i);
      for (const t of RES) rest[t] += n[t];
    }
    p.reservedAt = base.W;
    p.stage = stage;
    p.onSite = rest;
  }
  const rovers = Math.min(SPACE.maxRovers, SPACE.startRovers + counts.command + counts.factory);
  // the drones roll out one after another, so they never move as one
  for (let i = 0; i < rovers; i++) s.rovers.push(newRover(i, depotOf(cluster), base.W + i * SPACE.staggerMs));
  return s;
}

// ---------------------------------------------------------------------------
// Power

function gridAt(s: SpaceSim, T: number): number {
  const g = s.grid;
  const v = g.b + Math.floor((g.gen * (T - g.t)) / 1000);
  return Math.min(SPACE.grid.cap, v);
}

function setGen(s: SpaceSim, T: number, gen: number) {
  s.grid.b = gridAt(s, T);
  s.grid.t = T;
  s.grid.gen = gen;
}

/** Charging time at T; the energy is taken from the base battery at once (may go into debt). */
function startCharge(s: SpaceSim, r: Rover, T: number): number {
  const need = Math.max(0, SPACE.battery.cap - r.bat);
  if (need === 0) return 1000;
  const avail = gridAt(s, T);
  let dur = Math.ceil((need * 1000) / SPACE.battery.chargeRate);
  if (avail < need) dur = Math.max(dur, Math.ceil(((need - avail) * 1000) / s.grid.gen));
  s.grid.b = avail - need;
  s.grid.t = T;
  return Math.max(1000, dur);
}

/** Visible fill of the base battery at W (0..1). */
export function gridLevel(s: SpaceSim, W: number): number {
  return Math.max(0, gridAt(s, Math.max(W, s.grid.t))) / SPACE.grid.cap;
}

// ---------------------------------------------------------------------------
// Jobs

function useOf(k: string): number {
  const u = SPACE.battery.use;
  switch (k) {
    case 'drive':
      return u.drive;
    case 'drill':
      return u.drill;
    case 'build':
    case 'assist':
      return u.build;
    case 'patrol':
      return u.scan;
    case 'link':
      return u.drive;
    case 'repair':
    case 'rebuild':
    case 'clear':
      return u.build;
    case 'survey':
      return u.scan;
    case 'idle':
    case 'charge':
      return 0;
    default:
      return u.handle;
  }
}

function stageMs(s: SpaceSim, stage: number): number {
  const k = 1 - SPACE.habitatSpeedup * Math.min(s.counts.habitat, SPACE.habitatMax);
  return Math.round(STAGES[stage].ms * k);
}

function drillMs(s: SpaceSim, t: Res): number {
  const rig = t === 'm' && s.rigs.includes(s.cluster);
  return Math.round(SPACE.drillMs[t] * (rig ? 1 - SPACE.extractorSpeedup : 1));
}

function drive(ctx: SpaceCtx, plan: Planned[], from: NodeId, to: NodeId, n = 0, c = '', ref = -1): NodeId {
  const dur = ctx.travel.ms(from, to);
  if (dur > 0) plan.push({ k: 'drive', a: from, b: to, dur, n, c, ref, fx: '' });
  return to;
}

function act(plan: Planned[], k: string, at: NodeId, dur: number, fx: string, n = 0, c = '', ref = -1) {
  plan.push({ k, a: at, b: at, dur, n, c, ref, fx });
}

/** Crate slots at the active depot. */
export function depotCapacity(s: Pick<SpaceSim, 'counts'>): number {
  return SPACE.depotCap + SPACE.storageCap * Math.min(s.counts.storage, SPACE.storageMax);
}

/**
 * Crates the depot still needs, by resource: the current project and, with more than one
 * drone, the next buildings of this outpost as far as the depot has room (the pile grows while
 * a building is being assembled, and the next one can start sooner).
 */
function demand(s: SpaceSim, ctx: SpaceCtx): Amt {
  const p = s.proj;
  const need: Amt = p.reservedAt < 0 ? { ...p.cost } : zero();
  if (s.rovers.length < 2) return need;
  const room = depotCapacity(s) - total(p.atDepot);
  for (let k = 1; k <= SPACE.lookahead; k++) {
    const unit = p.unit + k;
    if (Math.floor(unit / UPC) !== s.cluster) break;
    const n = newProject(ctx, s, unit).cost;
    if (total(need) + total(n) > room) break;
    for (const t of RES) need[t] += n[t];
  }
  return need;
}

/** The resource with the largest shortfall that can be mined here, or null. */
function mineType(s: SpaceSim, ctx: SpaceCtx): Res | null {
  const need = demand(s, ctx);
  let best: Res | null = null;
  let gap = 0;
  for (const t of RES) {
    if (t === 'r' && !rareAt(s, s.cluster)) continue;
    const d = need[t] - (s.stock[t] + s.pending[t]);
    if (d > gap) {
      gap = d;
      best = t;
    }
  }
  return best;
}

function stageReady(s: SpaceSim): boolean {
  const p = s.proj;
  if (p.reservedAt < 0 || p.building || p.stage >= NSTAGE) return false;
  return covers(p.onSite, needOf(p, p.stage));
}

function dispatch(s: SpaceSim, ctx: SpaceCtx, r: Rover, T: number) {
  const plan: Planned[] = [];
  const p = s.proj;
  let at = r.at;
  const depot = depotOf(s.cluster);

  // 1. a solar flare: shelter by the depot until it has passed
  const flare = eventAt(EVENT_DEFS, 'space', ctx.seed, T);
  if (flare && flare.kind === 'solarFlare') {
    const home = depotOf(s.cluster);
    at = drive(ctx, plan, at, home);
    act(plan, 'shelter', home, Math.max(1000, flare.t1 - T - ctx.travel.ms(r.at, home)), '', 0, '', -1);
    r.job = 'shelter';
    r.plan = plan;
    return;
  }

  // A scout that has landed has found the deposits.
  const sc = s.scout;
  if (sc && sc.c === s.cluster && T >= sc.t1 && !s.oreKnown) {
    s.oreKnown = true;
    s.surveying = false;
  }
  // A new outpost: one drone marks out its depot first (after the scout's beacon is down); the
  // others wait for it.
  if (s.setup < 2 && sc && sc.c === s.cluster && T < sc.t1) {
    act(plan, 'idle', at, Math.max(1000, sc.t1 - T), '', 0, '', -1);
    r.job = 'idle';
    r.plan = plan;
    return;
  }
  if (s.setup < 2) {
    if (s.setup === 0) {
      s.setup = 1;
      at = drive(ctx, plan, at, depot);
      act(plan, 'setup', depot, 6000, 'setup', 0, '', s.cluster);
      r.job = 'setup';
    } else {
      at = drive(ctx, plan, at, parkOf(s.cluster, r.id));
      act(plan, 'idle', parkOf(s.cluster, r.id), 5000, '', 0, '', -1);
      r.job = 'idle';
    }
    r.plan = plan;
    return;
  }

  // Lay the power line from the previous outpost (one drone; the others get on with the work).
  if (s.linked < s.cluster && r.bat > SPACE.battery.low * 1.5 && !s.rovers.some((o) => o.id !== r.id && o.job === 'link')) {
    const a = depotOf(s.cluster - 1);
    const b = depotOf(s.cluster);
    at = drive(ctx, plan, at, a);
    plan.push({ k: 'link', a, b, dur: Math.round(ctx.travel.ms(a, b) * SPACE.linkSlow), n: 0, c: 'cable', ref: s.cluster, fx: 'link' });
    r.job = 'link';
    r.plan = plan;
    return;
  }

  // Reserve the next project as soon as all its materials are in stock.
  if (p.reservedAt < 0 && covers(s.stock, p.cost)) {
    for (const t of RES) {
      s.stock[t] -= p.cost[t];
      p.atDepot[t] = p.cost[t];
    }
    p.reservedAt = T;
  }

  const needsCharge = r.bat < SPACE.battery.low || (stageReady(s) && r.bat < SPACE.battery.use.build * (stageMs(s, p.stage) / 1000) + 8000);
  if (needsCharge) {
    const ch = chargerOf(s.cluster);
    at = drive(ctx, plan, at, ch);
    act(plan, 'charge', ch, -1, 'charge', 0, '', s.cluster);
    r.job = 'charge';
    r.plan = plan;
    return;
  }

  // 1. assemble the next stage when its materials are on site
  if (stageReady(s)) {
    p.building = true;
    p.builder = r.id;
    const site = siteOf(p.unit);
    at = drive(ctx, plan, at, site, 0, '', p.unit);
    act(plan, 'build', site, stageMs(s, p.stage), 'stage', 0, '', p.unit);
    r.job = STAGES[p.stage].id === 'inspect' ? 'inspect' : 'build';
    r.plan = plan;
    return;
  }

  // 2. move reserved crates to the site: metal first (the structure), then the equipment
  const ht = p.reservedAt >= 0 ? RES.find((t) => p.atDepot[t] - p.claimed[t] > 0) : undefined;
  if (ht) {
    const n = Math.min(SPACE.load, p.atDepot[ht] - p.claimed[ht]);
    p.claimed[ht] += n;
    const site = siteOf(p.unit);
    const c = `crate-${ht}`;
    at = drive(ctx, plan, at, depot);
    act(plan, 'pick', depot, SPACE.pickMs, 'pick', n, c, p.unit);
    at = drive(ctx, plan, at, site, n, c, p.unit);
    act(plan, 'drop', site, SPACE.dropMs, 'drop', n, c, p.unit);
    r.job = 'haul';
    r.plan = plan;
    return;
  }

  // 3. mine what the depot is short of (an unknown outpost is surveyed once)
  const mt = s.oreKnown || !s.surveying ? mineType(s, ctx) : null;
  if (mt) {
    const node = depositOf(s.cluster, mt);
    const n = SPACE.load;
    s.pending[mt] += n;
    at = drive(ctx, plan, at, node);
    if (!s.oreKnown) {
      s.surveying = true;
      act(plan, 'survey', node, SPACE.surveyMs, 'survey', 0, '', s.cluster);
    }
    const c = `ore-${mt}`;
    act(plan, 'drill', node, drillMs(s, mt), '', 0, c, s.cluster);
    act(plan, 'loadOre', node, SPACE.loadOreMs, '', n, c, s.cluster);
    at = drive(ctx, plan, at, depot, n, c, s.cluster);
    act(plan, 'unload', depot, SPACE.unloadMs, 'unload', n, c, s.cluster);
    r.job = 'mine';
    r.plan = plan;
    return;
  }

  // 4. help with the stage another drone is assembling (one helper at a time)
  if (p.building && p.builder !== r.id && T >= p.st0 && !s.rovers.some((o) => o.id !== r.id && o.job === 'assist')) {
    const spot = helperOf(p.unit);
    const travel = ctx.travel.ms(at, spot);
    const dur = Math.min(SPACE.assistMs, p.st1 - T - travel);
    if (dur >= 6000) {
      at = drive(ctx, plan, at, spot, 0, '', p.unit);
      act(plan, 'assist', spot, dur, '', 0, '', p.unit);
      r.job = 'assist';
      r.plan = plan;
      return;
    }
  }

  // 5. greenhouse visits
  const gh = s.care.find((c) => !c.claimed && c.due <= T);
  if (gh) {
    gh.claimed = true;
    const site = siteOf(gh.u);
    at = drive(ctx, plan, at, site, 0, '', gh.u);
    act(plan, 'care', site, SPACE.careMs, 'care', 0, '', gh.u);
    r.job = 'care';
    r.plan = plan;
    return;
  }

  // 6. a round past the finished buildings nearby, one drone at a time
  const from = Math.max(s.zone * UPZ, (s.cluster - 1) * UPC);
  if (s.done > from && r.bat > SPACE.battery.low * 1.5 && !s.rovers.some((o) => o.id !== r.id && o.job === 'patrol')) {
    const unit = from + (s.rounds % (s.done - from));
    s.rounds++;
    const site = siteOf(unit);
    at = drive(ctx, plan, at, site, 0, '', unit);
    act(plan, 'patrol', site, SPACE.patrolMs, '', 0, '', unit);
    r.job = 'patrol';
    r.plan = plan;
    return;
  }

  // 7. top up the battery while there is nothing else to do
  if (r.bat < SPACE.battery.cap * 0.7 && gridAt(s, T) > SPACE.grid.cap * 0.3) {
    const ch = chargerOf(s.cluster);
    at = drive(ctx, plan, at, ch);
    act(plan, 'charge', ch, -1, 'charge', 0, '', s.cluster);
    r.job = 'charge';
    r.plan = plan;
    return;
  }

  // 8. wait at the parking spot; look again shortly
  const park = parkOf(s.cluster, r.id);
  at = drive(ctx, plan, at, park);
  act(plan, 'idle', park, SPACE.idleMs + r.id * 1300, '', 0, '', -1);
  r.job = 'idle';
  r.plan = plan;
}

function complete(s: SpaceSim, ctx: SpaceCtx, T: number) {
  const p = s.proj;
  const unit = p.unit;
  s.done = unit + 1;
  s.doneAt.push(T);
  s.log.push({ u: unit, W: T });
  if (s.log.length > 64) s.log.splice(0, s.log.length - 64);
  s.counts[p.kind]++;
  // roles
  if (p.kind === 'barracks' || p.kind === 'factory') trainNext(s, T);
  if (p.kind === 'command' || p.kind === 'factory') syncCrew(s, T);
  switch (p.kind) {
    case 'generator':
      setGen(s, T, SPACE.grid.base + SPACE.grid.perSolar * s.counts.generator);
      break;
    case 'extractor':
      s.rigs.push(s.cluster);
      if (s.rigs.length > 12) s.rigs.splice(0, s.rigs.length - 12);
      break;
    case 'command':
    case 'factory':
      addRover(s, siteOf(unit), T);
      break;
    case 'research':
      if (s.rareFrom < 0) s.rareFrom = s.cluster;
      break;
    case 'dish':
      s.antennaZone = Math.max(s.antennaZone, Math.floor(unit / UPZ));
      if (Math.floor(s.cluster / 4) === s.antennaZone) s.oreKnown = true;
      break;
    case 'greenhouse':
      s.care.push({ u: unit, due: T + SPACE.careEveryMs, claimed: false });
      break;
  }
  const next = unit + 1;
  const nextCluster = Math.floor(next / UPC);
  if (nextCluster !== s.cluster) {
    // A new outpost: stock moves with it (the plan mines what an outpost needs, so this is
    // normally zero), its depot must be set up and its deposits found.
    const from = s.cluster;
    s.cluster = nextCluster;
    wakeCrew(s, T);
    s.setup = 0;
    s.surveying = false;
    const scout = SPACE.scout;
    const t0 = T + scout.delayMs;
    s.scout = s.counts.research > 0 ? { c: nextCluster, from, t0, t1: t0 + scout.flyMs + scout.scanMs + scout.dropMs } : null;
    const zone = Math.floor(nextCluster / 4);
    s.oreKnown = s.antennaZone === zone || (s.antennaZone === zone - 1 && nextCluster % 4 === 0);
    s.wear = { ore: 0, site: 0 };
    s.dug = zero();
    if (zone !== s.zone) {
      s.zone = zone;
      s.doneAt = [];
      s.care = [];
    }
  }
  s.proj = newProject(ctx, s, next);
}

const resOf = (c: string): Res | null => {
  const t = c.slice(c.indexOf('-') + 1);
  return t === 'm' || t === 'c' || t === 'r' ? t : null;
};

function finishStep(s: SpaceSim, ctx: SpaceCtx, r: Rover, st: Step, T: number) {
  const fx = st.fx;
  r.bat = Math.max(0, r.bat - Math.round((useOf(st.k) * (st.t1 - st.t0)) / 1000));
  r.at = st.b;
  const p = s.proj;
  const t = resOf(st.c);
  switch (fx) {
    case 'unload':
      if (t) {
        s.pending[t] -= st.n;
        s.stock[t] += st.n;
        s.depot[t] += st.n;
        s.mined[t] += st.n;
        s.dug[t] += st.n;
      }
      s.wear.ore++;
      break;
    case 'pick':
      if (st.ref === p.unit && t) {
        p.claimed[t] -= st.n;
        p.atDepot[t] -= st.n;
        p.inTransit[t] += st.n;
        s.depot[t] -= st.n;
      }
      break;
    case 'drop':
      if (st.ref === p.unit && t) {
        p.inTransit[t] -= st.n;
        p.onSite[t] += st.n;
        s.wear.site++;
      }
      break;
    case 'stage':
      if (st.ref === p.unit && p.builder === r.id) {
        const n = needOf(p, p.stage);
        for (const k of RES) p.onSite[k] -= n[k];
        p.stage++;
        p.building = false;
        p.builder = -1;
        if (p.stage >= NSTAGE) complete(s, ctx, T);
      }
      break;
    case 'survey':
      s.oreKnown = true;
      s.surveying = false;
      break;
    case 'setup':
      s.setup = 2;
      break;
    case 'link':
      s.linked = Math.max(s.linked, st.ref);
      break;
    case 'charge':
      r.bat = SPACE.battery.cap;
      break;
    case 'care': {
      const c = s.care.find((x) => x.u === st.ref);
      if (c) {
        c.claimed = false;
        c.due = T + SPACE.careEveryMs;
      }
      break;
    }
  }
}

function begin(s: SpaceSim, r: Rover, pl: Planned, T: number) {
  const dur = pl.k === 'charge' ? startCharge(s, r, T) : Math.max(1, pl.dur);
  if (pl.k === 'build') {
    s.proj.st0 = T;
    s.proj.st1 = T + dur;
  }
  r.step = { k: pl.k, a: pl.a, b: pl.b, t0: T, t1: T + dur, n: pl.n, c: pl.c, ref: pl.ref, fx: pl.fx };
}

function next(s: SpaceSim, ctx: SpaceCtx, r: Rover, T: number) {
  if (!r.plan.length) dispatch(s, ctx, r, T);
  const pl = r.plan.shift()!;
  begin(s, r, pl, T);
}

/** When the next raid starts (or a held-back one), NEVER if none is planned. */
function raidNext(s: SpaceSim, ctx: SpaceCtx): number {
  if (s.raid) return s.raid.t1;
  if (s.raids.delay !== NEVER) return s.raids.delay;
  const t = nextRaidAt(ctx.raids, s.raids.from);
  return Number.isFinite(t) ? t : NEVER;
}

/** Next colony event (training, guards returning, a raid starting or ending). */
function colonyNext(s: SpaceSim, ctx: SpaceCtx): number {
  const a = s.army;
  return Math.min(a.infNext, a.tankNext, a.out > 0 ? a.backAt : NEVER, raidNext(s, ctx));
}

function colonyEvent(s: SpaceSim, ctx: SpaceCtx, T: number) {
  const a = s.army;
  if (T === a.infNext) {
    a.inf++;
    a.infNext = NEVER;
    trainNext(s, T);
  } else if (T === a.tankNext) {
    a.tanks++;
    a.tankNext = NEVER;
    trainNext(s, T);
  } else if (a.out > 0 && T === a.backAt) {
    a.out = 0;
    a.backAt = NEVER;
  } else if (s.raid && T === s.raid.t1) {
    endRaid(s, T);
  } else if (!s.raid && T === raidNext(s, ctx)) {
    // this planned raid is taken (whether it happens, waits or finds nothing to attack)
    if (s.raids.delay === T) s.raids.delay = NEVER;
    else s.raids.from = T + 1;
    // never during a headline event of the planet (storms, flares, sky sights): it waits
    const clash = headlineNear(ctx.seed, T, T + 100_000);
    if (clash > 0) s.raids.delay = clash + 60_000;
    else startRaid(s, ctx, T);
  } else {
    // nothing is due at T (cannot happen with consistent state): unschedule rather than spin
    if (a.infNext <= T) a.infNext = NEVER;
    if (a.tankNext <= T) a.tankNext = NEVER;
    if (a.backAt <= T) a.backAt = NEVER;
    if (!s.raid && s.raids.delay <= T) s.raids.delay = NEVER;
    if (!s.raid) s.raids.from = Math.max(s.raids.from, T + 1);
  }
}

/** End of a headline event running in or starting during [T0, T1) (0 if none). */
function headlineNear(seed: number, T0: number, T1: number): number {
  const b0 = Math.floor(T0 / BLOCK_MS);
  for (let b = b0; b <= Math.floor(T1 / BLOCK_MS); b++) {
    const e = eventOfBlock(EVENT_DEFS, 'space', seed, b);
    if (e && e.t1 > T0 && e.t0 < T1) return e.t1;
  }
  return 0;
}

/** Puts the barracks and the factory to work on the next guard / tank (up to the caps). */
function trainNext(s: SpaceSim, T: number) {
  const A = SPACE.army;
  const a = s.army;
  const b = Math.min(A.perMax, s.counts.barracks);
  const f = Math.min(A.perMax, s.counts.factory);
  if (a.infNext === NEVER && b > 0 && a.inf < A.infPer * b) a.infNext = T + Math.round(A.infMs / b);
  if (a.tankNext === NEVER && f > 0 && a.tanks < A.tankPer * f) a.tankNext = T + Math.round(A.tankMs / f);
}

/** The raiders come from the outer side of the active outpost (away from the settlement). */
function startRaid(s: SpaceSim, ctx: SpaceCtx, T: number) {
  const c = s.cluster;
  const buildings: { u: number; kind: SpaceKind }[] = [];
  const turrets: number[] = [];
  for (let u = Math.max(c * UPC, s.zone * UPZ); u < Math.min(s.done, (c + 1) * UPC); u++) {
    if (s.wreck && s.wreck.u === u) continue;
    const kind = kindOf(ctx.seed, u, s.legacyUnits, s.v1Units);
    buildings.push({ u, kind });
    if (kind === 'turret') turrets.push(u);
  }
  // with nothing finished at a new outpost yet, the previous one is where the buildings are
  if (buildings.length === 0 && c > 0) {
    for (let u = Math.max((c - 1) * UPC, 0); u < c * UPC && u < s.done; u++) {
      const kind = kindOf(ctx.seed, u, s.legacyUnits, s.v1Units);
      buildings.push({ u, kind });
      if (kind === 'turret') turrets.push(u);
    }
  }
  // a fresh landing with nothing built yet is left alone
  if (buildings.length === 0) return;
  const full = s.raids.n % SPACE.raid.fullEvery === SPACE.raid.fullEvery - 1;
  s.raid = makeRaid({
    seed: ctx.seed,
    n: s.raids.n,
    T,
    zone: s.zone,
    stage: spaceStage(s),
    c,
    side: -innerOfUnit(c * UPC),
    buildings,
    turrets,
    // a skirmish is met by a detachment; a full raid by the whole garrison
    tanks: Math.min(s.army.tanks, full ? 8 : 2),
    inf: Math.min(s.army.inf - s.army.out, full ? 24 : 8),
  });
}

function endRaid(s: SpaceSim, T: number) {
  const p = s.raid!;
  // the worst damage each building took
  const worst = new Map<number, number>();
  for (const h of p.hits) worst.set(h.u, Math.max(worst.get(h.u) ?? 0, h.level));
  for (const [u, level] of worst) {
    if (u === p.wreck) continue;
    const d = s.damage.find((x) => x.u === u);
    if (d) d.level = Math.max(d.level, level);
    else s.damage.push({ u, level, claimed: false });
  }
  if (p.wreck >= 0 && !s.wreck) {
    s.damage = s.damage.filter((x) => x.u !== p.wreck);
    s.wreck = { u: p.wreck, cleared: false, stage: 0, claimed: false };
  }
  const a = s.army;
  a.tanks = Math.max(0, a.tanks - p.tankKo.length);
  if (p.infShield.length > 0) {
    a.out = Math.min(a.inf, a.out + p.infShield.length);
    a.backAt = T + SPACE.army.backMs;
  }
  trainNext(s, T);
  s.raids.n++;
  // raids planned while this one went on are skipped
  s.raids.from = Math.max(s.raids.from, T + 1);
  s.raid = null;
  wakeCrew(s, T);
}

// ---------------------------------------------------------------------------
// Maintenance drones

/** One at landing, one more with a command centre and with a factory. */
function syncCrew(s: SpaceSim, T: number) {
  const C = SPACE.crew;
  const want = Math.min(C.max, C.start + Math.min(1, s.counts.command) + Math.min(1, s.counts.factory));
  while (s.crew.length < want) s.crew.push({ id: s.crew.length, at: bayOf(s.cluster), step: null, plan: [], job: 'idle', born: T });
}

/** Drones waiting in their bay look for work now (a raid ended, the outpost moved on). */
function wakeCrew(s: SpaceSim, T: number) {
  for (const w of s.crew) if (w.step && w.step.k === 'park' && w.step.t1 > T) w.step.t1 = T;
}

function crewDispatch(s: SpaceSim, ctx: SpaceCtx, w: Worker) {
  const plan: Planned[] = [];
  let at = w.at;
  // they hover over the building they work on
  if (!s.raid) {
    const dm = s.damage.find((d) => !d.claimed);
    if (dm) {
      dm.claimed = true;
      const spot: NodeId = `u${dm.u}`;
      at = drive(ctx, plan, at, spot, 0, '', dm.u);
      act(plan, 'repair', spot, SPACE.raid.repairMs * dm.level, 'repair', dm.level, '', dm.u);
      w.job = 'repair';
      w.plan = plan;
      return;
    }
    const wk = s.wreck;
    if (wk && !wk.claimed) {
      wk.claimed = true;
      const spot: NodeId = `u${wk.u}`;
      at = drive(ctx, plan, at, spot, 0, '', wk.u);
      if (!wk.cleared) act(plan, 'clear', spot, SPACE.raid.clearMs, 'clear', 0, '', wk.u);
      else act(plan, 'rebuild', spot, SPACE.raid.rebuildMs, 'rebuild', 0, '', wk.u);
      w.job = 'rebuild';
      w.plan = plan;
      return;
    }
  }
  // back to the bay, and wait there until there is something to fix
  const bay = bayOf(s.cluster);
  at = drive(ctx, plan, at, bay);
  plan.push({ k: 'park', a: bay, b: bay, dur: NEVER, n: 0, c: '', ref: -1, fx: '' });
  w.job = 'idle';
  w.plan = plan;
}

function crewFinish(s: SpaceSim, w: Worker, st: Step) {
  w.at = st.b;
  const wk = s.wreck;
  switch (st.fx) {
    case 'repair':
      s.damage = s.damage.filter((d) => d.u !== st.ref);
      break;
    case 'clear':
      if (wk && wk.u === st.ref) {
        wk.cleared = true;
        wk.claimed = false;
      }
      break;
    case 'rebuild':
      if (wk && wk.u === st.ref) {
        wk.stage++;
        wk.claimed = false;
        if (wk.stage >= SPACE.raid.rebuildSteps) s.wreck = null;
      }
      break;
  }
}

function crewNext(s: SpaceSim, ctx: SpaceCtx, w: Worker, T: number) {
  // about to wait in the bay while something is still broken: go and fix it instead
  const broken = !s.raid && (s.damage.some((d) => !d.claimed) || (s.wreck !== null && !s.wreck.claimed));
  if (w.plan.length && w.plan[0].k === 'park' && broken) w.plan = [];
  if (!w.plan.length) crewDispatch(s, ctx, w);
  const pl = w.plan.shift()!;
  w.step = { k: pl.k, a: pl.a, b: pl.b, t0: T, t1: pl.dur >= NEVER ? NEVER : T + Math.max(1, pl.dur), n: pl.n, c: pl.c, ref: pl.ref, fx: pl.fx };
}

/** Processes every event up to and including W. Pure in (state, W): chunking never matters. */
export function advanceSpace(s: SpaceSim, ctx: SpaceCtx, W: number, maxEvents = Infinity): number {
  let events = 0;
  for (;;) {
    let who = -1;
    let at = Infinity;
    for (let i = 0; i < s.rovers.length; i++) {
      const r = s.rovers[i];
      const t = r.step ? r.step.t1 : r.born;
      if (t < at) {
        at = t;
        who = i;
      }
    }
    // maintenance drones after the work drones at equal times
    let crew = -1;
    let ct = Infinity;
    for (let i = 0; i < s.crew.length; i++) {
      const w = s.crew[i];
      const t = w.step ? w.step.t1 : w.born;
      if (t < ct) {
        ct = t;
        crew = i;
      }
    }
    // colony events come first at equal times
    const ce = colonyNext(s, ctx);
    if (ce <= at && ce <= ct && ce <= W && events < maxEvents) {
      colonyEvent(s, ctx, ce);
      s.t = ce;
      events++;
      continue;
    }
    if (crew >= 0 && ct < at && ct <= W && events < maxEvents) {
      const w = s.crew[crew];
      if (w.step) {
        const st = w.step;
        w.step = null;
        crewFinish(s, w, st);
      }
      s.t = ct;
      crewNext(s, ctx, w, ct);
      events++;
      continue;
    }
    if (who < 0 || at > W || events >= maxEvents) break;
    const r = s.rovers[who];
    if (r.step) {
      const st = r.step;
      r.step = null;
      finishStep(s, ctx, r, st, at);
    }
    s.t = at;
    next(s, ctx, r, at);
    events++;
  }
  return events;
}

// ---------------------------------------------------------------------------
// Queries for the scene and the status line

/** Visual build progress (0..1) of a unit at W, or null when its site is not revealed yet. */
export function spaceUnitProgress(s: SpaceSim, unit: number, W: number): number | null {
  if (unit < s.done) return 1;
  const p = s.proj;
  if (unit !== p.unit || p.reservedAt < 0) return null;
  if (p.building && p.st1 > p.st0 && W >= p.st0) {
    const k = Math.min(1, (W - p.st0) / (p.st1 - p.st0));
    const [u0, u1] = STAGES[p.stage].u;
    return u0 + (u1 - u0) * k;
  }
  if (p.stage > 0) return STAGES[p.stage - 1].u[1];
  // revealed, waiting for a drone to mark it out: nothing stands there yet
  return 0;
}

/** Completion time of a unit for timed decor; -Infinity if long done, Infinity if not done. */
export function spaceDoneAt(s: SpaceSim, unit: number): number {
  if (unit >= s.done) return Infinity;
  const i = unit - s.zone * UPZ;
  if (i < 0) return -Infinity;
  const t = s.doneAt[i];
  return t === undefined || t < 0 ? -Infinity : t;
}

/** How much of a deposit is left (0.15..1) at the active outpost. */
export function depositLeft(s: SpaceSim, t: Res): number {
  return Math.max(0.15, 1 - s.dug[t] / SPACE.deposit[t]);
}

/** Crates of the current project at the site pile, by resource, needed by later stages. */
export function siteCrates(s: SpaceSim): Amt {
  return { ...s.proj.onSite };
}

/**
 * Colony stage 1..10 from what stands: the landing, mining and power, housing and storage, a
 * command centre, research, defence, a factory, several outposts, a planet network (a whole
 * zone with a relay) and a planet civilisation. Buildings count once built (damage never
 * takes a stage back).
 */
export function spaceStage(s: Pick<SpaceSim, 'counts' | 'done' | 'cluster'>): number {
  const c = s.counts;
  let st = 1;
  if (c.extractor > 0 && c.generator > 0) st = 2;
  if (st >= 2 && c.habitat > 0 && c.storage > 0) st = 3;
  if (st >= 3 && c.command > 0) st = 4;
  if (st >= 4 && c.research > 0) st = 5;
  if (st >= 5 && c.turret > 0) st = 6;
  if (st >= 6 && c.factory > 0) st = 7;
  if (st >= 7 && s.cluster >= 3) st = 8;
  if (st >= 8 && s.done >= UPZ && c.relay > 0) st = 9;
  if (st >= 9 && s.done >= 3 * UPZ) st = 10;
  return st;
}

export const SPACE_STAGE_NAMES = ['', '착륙', '채굴과 전력', '거주와 저장', '사령부', '연구', '방어 포탑', '공장', '여러 기지', '행성 네트워크', '행성 문명'] as const;

const NAME_A = ['노을', '새벽별', '은모래', '고요', '하늘결', '푸른 고리', '모래꽃', '첫 등불', '바람길', '별무리'];
const NAME_B = ['정착지', '개척촌', '거점', '기지'];

/** The colony's name (shown once a command centre stands); fixed by the world seed. */
export function colonyName(seed: number): string {
  const h = (Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2d) >>> 0) % (NAME_A.length * NAME_B.length);
  return `${NAME_A[h % NAME_A.length]} ${NAME_B[Math.floor(h / NAME_A.length)]}`;
}

export function cloneSpace(s: SpaceSim): SpaceSim {
  return JSON.parse(JSON.stringify(s)) as SpaceSim;
}

export { total as amtTotal };
