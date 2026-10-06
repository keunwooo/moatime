/**
 * Moon-base work simulation: mining → hauling to the depot → reserving materials → moving
 * them to the site → staged assembly → inspection → the facility's role changes later work.
 *
 * Accounting (one consistent rule, reservation):
 *   - Mined ore is cargo until it is unloaded at the depot; only then it counts as stock.
 *   - When a project starts, its whole cost is reserved from the free stock once
 *     (`reservedAt` guards it). Reserved crates stay at the depot until a rover picks them up.
 *   - Crates move depot → rover → site pile; each stage consumes its share of the site pile.
 * Every quantity changes only inside an event, at a definite world time, in a fixed order.
 */

import { SPACE, type SpaceKind } from './config';
import { TravelTable, type NodeId } from './layout';
import { kindOf } from './spacePlan';
import type { CompletionLog, Planned, SimBase, Step, Worker } from './types';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from './units';

export interface Rover extends Worker {
  /** Battery charge in milli-units. */
  bat: number;
}

export interface SpaceProject {
  unit: number;
  kind: SpaceKind;
  cost: number;
  /** -1 until the cost is reserved (the site is revealed then). */
  reservedAt: number;
  /** Reserved crates still at the depot. */
  atDepot: number;
  /** Crates promised to a planned haul but not picked up yet. */
  claimed: number;
  inTransit: number;
  onSite: number;
  /** Next stage to assemble (`SPACE.stages.length` when complete). */
  stage: number;
  /** A rover is heading to or assembling the next stage. */
  building: boolean;
  /** Window of the stage being assembled (valid while assembling). */
  st0: number;
  st1: number;
  /** Which rover assembles (-1 none). */
  builder: number;
}

export interface SpaceSim {
  v: number;
  /** Time of the last processed event. */
  t: number;
  done: number;
  /** Completion time of each unit of the current zone (unit - zone start), -1 = from before. */
  doneAt: number[];
  zone: number;
  /** Active cluster (global index); its depot holds the stock. */
  cluster: number;
  /** The active cluster's depot: 0 needs setting up, 1 a rover is on it, 2 ready. */
  setup: number;
  /** The active cluster's deposit is known (surveyed or found by an antenna). */
  oreKnown: boolean;
  /** A rover is on its way to survey the active deposit. */
  surveying: boolean;
  /** Free ore at the depot (not reserved). */
  ore: number;
  /** Crates physically at the depot (free + reserved waiting for pick-up). */
  depot: number;
  /** Ore promised by mining jobs in progress (not unloaded yet). */
  pendingOre: number;
  proj: SpaceProject;
  rovers: Rover[];
  /** Base battery: stored milli-units `b` at time `t`; `gen` milli-units per second. */
  grid: { b: number; t: number; gen: number };
  antennaZone: number;
  solar: number;
  habitats: number;
  workshops: number;
  /** Greenhouses of the current zone and when each needs a visit. */
  care: { u: number; due: number; claimed: boolean }[];
  /** Trips in the active cluster (worn tracks). */
  wear: { ore: number; site: number };
  mined: number;
  log: CompletionLog[];
  /** Units whose kind follows the legacy plan (built before migration). */
  legacyUnits: number;
}

export interface SpaceCtx {
  seed: number;
  travel: TravelTable;
}

export function spaceCtx(seed: number): SpaceCtx {
  return { seed, travel: new TravelTable('space', seed, SPACE.speed) };
}

const STAGES = SPACE.stages;
const NSTAGE = STAGES.length;

const depotOf = (cluster: number): NodeId => `d${cluster}`;
const oreOf = (cluster: number): NodeId => `o${cluster}`;
/** One parking spot per rover (cluster·4 + rover id). */
const parkOf = (cluster: number, id: number): NodeId => `p${cluster * 4 + id}`;
const siteOf = (unit: number): NodeId => `s${unit}`;
/** The first outpost charges at the lander's battery; later ones at their depot charger. */
const chargerOf = (cluster: number): NodeId => (cluster === 0 ? 'L0' : `c${cluster}`);

function newProject(ctx: SpaceCtx, s: Pick<SpaceSim, 'legacyUnits'>, unit: number): SpaceProject {
  const kind = kindOf(ctx.seed, unit, s.legacyUnits);
  return {
    unit,
    kind,
    cost: SPACE.costs[kind],
    reservedAt: -1,
    atDepot: 0,
    claimed: 0,
    inTransit: 0,
    onSite: 0,
    stage: 0,
    building: false,
    st0: 0,
    st1: 0,
    builder: -1,
  };
}

function newRover(id: number, at: NodeId, born: number): Rover {
  return { id, at, step: null, plan: [], job: 'idle', born, bat: SPACE.battery.cap };
}

/** Units of the old rules that were complete, and how far the growing one was. */
export function initSpace(seed: number, base: SimBase): SpaceSim {
  const ctx = spaceCtx(seed);
  const legacyDone = base.legacy ? base.legacy.units : 0;
  const partial = base.legacy ? base.legacy.partial : 0;
  const legacyUnits = legacyDone + (partial > 0 ? 1 : 0);
  const zone = Math.floor(legacyDone / UPZ);
  const cluster = Math.floor(legacyDone / UPC);
  // roles of facilities that already exist
  let solar = 0;
  let habitats = 0;
  let workshops = 0;
  let antennaZone = -1;
  const care: SpaceSim['care'] = [];
  for (let u = 0; u < legacyDone; u++) {
    const k = kindOf(seed, u, legacyUnits);
    if (k === 'power') solar++;
    else if (k === 'habitat') habitats++;
    else if (k === 'workshop') workshops++;
    else if (k === 'comms') antennaZone = Math.max(antennaZone, Math.floor(u / UPZ));
    else if (k === 'greenhouse' && Math.floor(u / UPZ) === zone) care.push({ u, due: base.W + SPACE.careEveryMs, claimed: false });
  }
  const s: SpaceSim = {
    v: 1,
    t: base.W,
    done: legacyDone,
    doneAt: Array.from({ length: legacyDone - zone * UPZ }, () => -1),
    zone,
    cluster,
    setup: 2,
    oreKnown: true,
    surveying: false,
    ore: 0,
    depot: 0,
    pendingOre: 0,
    proj: null as unknown as SpaceProject,
    rovers: [],
    grid: { b: SPACE.grid.start, t: base.W, gen: SPACE.grid.base + SPACE.grid.perSolar * solar },
    antennaZone,
    solar,
    habitats,
    workshops,
    care,
    wear: { ore: 0, site: 0 },
    mined: 0,
    log: [],
    legacyUnits,
  };
  s.proj = newProject(ctx, s, legacyDone);
  if (partial > 0) {
    // The facility under construction keeps its look: stages already passed are done and the
    // rest of its materials are on site, so assembly simply continues.
    const p = s.proj;
    let stage = 0;
    while (stage < NSTAGE && STAGES[stage].u[1] <= partial + 1e-9) stage++;
    const mats = SPACE.stageMaterials[p.kind];
    let rest = 0;
    for (let i = stage; i < NSTAGE; i++) rest += mats[i];
    p.reservedAt = base.W;
    p.stage = stage;
    p.onSite = rest;
  }
  const rovers = Math.min(SPACE.maxRovers, 1 + workshops);
  for (let i = 0; i < rovers; i++) s.rovers.push(newRover(i, depotOf(cluster), base.W));
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
  const k = 1 - SPACE.habitatSpeedup * Math.min(s.habitats, SPACE.habitatMax);
  return Math.round(STAGES[stage].ms * k);
}

function drive(ctx: SpaceCtx, plan: Planned[], from: NodeId, to: NodeId, n = 0, c = '', ref = -1): NodeId {
  const dur = ctx.travel.ms(from, to);
  if (dur > 0) plan.push({ k: 'drive', a: from, b: to, dur, n, c, ref, fx: '' });
  return to;
}

function act(plan: Planned[], k: string, at: NodeId, dur: number, fx: string, n = 0, c = '', ref = -1) {
  plan.push({ k, a: at, b: at, dur, n, c, ref, fx });
}

/** Ore the depot still needs for the current project (and the next one when helpers exist). */
function oreDemand(s: SpaceSim, ctx: SpaceCtx): number {
  const p = s.proj;
  let need = p.reservedAt < 0 ? p.cost : 0;
  const next = p.unit + 1;
  if (s.rovers.length > 1 && Math.floor(next / UPC) === s.cluster) {
    need += SPACE.costs[kindOf(ctx.seed, next, s.legacyUnits)];
  }
  return Math.min(SPACE.depotCap, need);
}

function stageReady(s: SpaceSim): boolean {
  const p = s.proj;
  if (p.reservedAt < 0 || p.building || p.stage >= NSTAGE) return false;
  return p.onSite >= SPACE.stageMaterials[p.kind][p.stage];
}

function dispatch(s: SpaceSim, ctx: SpaceCtx, r: Rover, T: number) {
  const plan: Planned[] = [];
  const p = s.proj;
  let at = r.at;
  const depot = depotOf(s.cluster);

  // A new outpost: one rover marks out its depot first; the others wait for it.
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

  // Reserve the next project as soon as its materials are in stock.
  if (p.reservedAt < 0 && s.ore >= p.cost) {
    s.ore -= p.cost;
    p.atDepot = p.cost;
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

  // 2. move reserved crates to the site
  const haulable = p.reservedAt >= 0 ? p.atDepot - p.claimed : 0;
  if (haulable > 0) {
    const n = Math.min(SPACE.load, haulable);
    p.claimed += n;
    const site = siteOf(p.unit);
    at = drive(ctx, plan, at, depot);
    act(plan, 'pick', depot, SPACE.pickMs, 'pick', n, 'crate', p.unit);
    at = drive(ctx, plan, at, site, n, 'crate', p.unit);
    act(plan, 'drop', site, SPACE.dropMs, 'drop', n, 'crate', p.unit);
    r.job = 'haul';
    r.plan = plan;
    return;
  }

  // 3. mine when the depot cannot cover the work ahead (an unknown deposit is surveyed once)
  if (s.ore + s.pendingOre < oreDemand(s, ctx) && (s.oreKnown || !s.surveying)) {
    const ore = oreOf(s.cluster);
    const n = SPACE.load;
    s.pendingOre += n;
    at = drive(ctx, plan, at, ore);
    if (!s.oreKnown) {
      s.surveying = true;
      act(plan, 'survey', ore, SPACE.surveyMs, 'survey', 0, '', s.cluster);
    }
    act(plan, 'drill', ore, SPACE.drillMs, '', 0, '', s.cluster);
    act(plan, 'loadOre', ore, SPACE.loadOreMs, '', n, 'ore', s.cluster);
    at = drive(ctx, plan, at, depot, n, 'ore', s.cluster);
    act(plan, 'unload', depot, SPACE.unloadMs, 'unload', n, 'ore', s.cluster);
    r.job = 'mine';
    r.plan = plan;
    return;
  }

  // 4. greenhouse visits
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

  // 5. top up the battery while there is nothing else to do
  if (r.bat < SPACE.battery.cap * 0.7 && gridAt(s, T) > SPACE.grid.cap * 0.3) {
    const ch = chargerOf(s.cluster);
    at = drive(ctx, plan, at, ch);
    act(plan, 'charge', ch, -1, 'charge', 0, '', s.cluster);
    r.job = 'charge';
    r.plan = plan;
    return;
  }

  // 6. wait at the parking spot; look again shortly
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
  // roles
  switch (p.kind) {
    case 'power':
      s.solar++;
      setGen(s, T, SPACE.grid.base + SPACE.grid.perSolar * s.solar);
      break;
    case 'habitat':
      s.habitats++;
      break;
    case 'workshop':
      s.workshops++;
      if (s.rovers.length < SPACE.maxRovers) {
        const r = newRover(s.rovers.length, siteOf(unit), T);
        r.bat = SPACE.battery.cap;
        s.rovers.push(r);
      }
      break;
    case 'comms':
      s.antennaZone = Math.max(s.antennaZone, Math.floor(unit / UPZ));
      if (Math.floor(s.cluster / 4) === s.antennaZone) s.oreKnown = true;
      break;
    case 'greenhouse':
      s.care.push({ u: unit, due: T + SPACE.careEveryMs, claimed: false });
      break;
  }
  const next = unit + 1;
  s.proj = newProject(ctx, s, next);
  const nextCluster = Math.floor(next / UPC);
  if (nextCluster !== s.cluster) {
    // A new outpost: stock moves with it (the plan mines exactly what an outpost needs, so
    // this is normally zero), its depot must be set up and its deposit found.
    s.cluster = nextCluster;
    s.setup = 0;
    s.surveying = false;
    const zone = Math.floor(nextCluster / 4);
    s.oreKnown = s.antennaZone === zone || (s.antennaZone === zone - 1 && nextCluster % 4 === 0);
    s.wear = { ore: 0, site: 0 };
    if (zone !== s.zone) {
      s.zone = zone;
      s.doneAt = [];
      s.care = [];
    }
  }
}

function finishStep(s: SpaceSim, ctx: SpaceCtx, r: Rover, st: Step, T: number) {
  const fx = st.fx;
  r.bat = Math.max(0, r.bat - Math.round((useOf(st.k) * (st.t1 - st.t0)) / 1000));
  r.at = st.b;
  const p = s.proj;
  switch (fx) {
    case 'unload':
      s.pendingOre -= st.n;
      s.ore += st.n;
      s.depot += st.n;
      s.mined += st.n;
      s.wear.ore++;
      break;
    case 'pick':
      if (st.ref === p.unit) {
        p.claimed -= st.n;
        p.atDepot -= st.n;
        p.inTransit += st.n;
        s.depot -= st.n;
      }
      break;
    case 'drop':
      if (st.ref === p.unit) {
        p.inTransit -= st.n;
        p.onSite += st.n;
        s.wear.site++;
      }
      break;
    case 'stage':
      if (st.ref === p.unit && p.builder === r.id) {
        p.onSite -= SPACE.stageMaterials[p.kind][p.stage];
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
  // revealed: survey ring and stakes appear over a few seconds
  return 0.07 * Math.min(1, Math.max(0, (W - p.reservedAt) / 5000));
}

/** Completion time of a unit for timed decor; -Infinity if long done, Infinity if not done. */
export function spaceDoneAt(s: SpaceSim, unit: number): number {
  if (unit >= s.done) return Infinity;
  const i = unit - s.zone * UPZ;
  if (i < 0) return -Infinity;
  const t = s.doneAt[i];
  return t === undefined || t < 0 ? -Infinity : t;
}

export function cloneSpace(s: SpaceSim): SpaceSim {
  return JSON.parse(JSON.stringify(s)) as SpaceSim;
}
