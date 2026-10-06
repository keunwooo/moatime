/**
 * Cosmos ("처음의 우주"): the universe grows with its age A = W − origin, where the origin is the
 * world time at which this theme was first picked (core/session.ts).
 *
 * WHEN things happen is a closed-form schedule of (seed, A):
 *   - the chronicle: Big Bang → first light → the cosmic web → first stars → the first supernova
 *     → a nebula → the home star → its first three planets, fixed times ending at 24 min 20 s;
 *   - then star systems one after another (9–16 min each, seeded), four to a cluster, sixteen to
 *     a zone; the life planet and the home galaxy follow their own A-timelines.
 * HOW RICH the systems are comes from a ledger processed event by event in integer ms of A:
 * gas flows in along the web and feeds each forming star, stardust exists only where stars have
 * died (supernovae), and a system's planet count follows the stardust made so far. Ice from the
 * outer disks rides comets to the life planet and becomes its ocean.
 *
 * Nothing waits on the ledger (supply always exceeds demand), so the schedule — stages,
 * milestones, event eligibility — needs no simulation state, and the ledger is split-independent
 * by construction: events are processed strictly in time order whatever pieces A arrives in.
 */

import { hash32 } from '../core/rng';
import type { SimBase } from './types';

/** Version of the cosmos rules (checkpoints from another version are ignored). */
export const COSMOS_SIM_VERSION = 1;

const S = 1000;
const MIN = 60_000;
const H = 3_600_000;

const u01 = (...xs: number[]) => hash32(...xs) / 4294967296;
export const smooth = (a: number, b: number, x: number) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
export const ramp = (a: number, b: number, x: number) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a));

// ---- the chronicle (A, ms) ------------------------------------------------------------------

export const CHRON = {
  bangEnd: 12 * S,
  plasmaEnd: 90 * S,
  clearEnd: 150 * S,
  webStart: 150 * S,
  webFull: 210 * S,
  collapse: 225 * S,
  firstStar: 240 * S,
  /** Ignition ramp of a star. */
  igniteMs: 12 * S,
  redGiant: 480 * S,
  supernova: 570 * S,
  shell: 575 * S,
  nebula: 630 * S,
  nebulaFull: 900 * S,
  cradle: 900 * S,
  flowStart: 920 * S,
  flowEnd: 1100 * S,
  jets: 1000 * S,
  homeStar: 1110 * S,
  cavityEnd: 1162 * S,
  disk: 1200 * S,
  planets: 1350 * S,
  /** Formation windows of the three home planets (inner, life, gas giant). */
  homePlanets: [
    [1350 * S, 1380 * S],
    [1380 * S, 1410 * S],
    [1410 * S, 1440 * S],
  ] as [number, number][],
  belt: 1440 * S,
  end: 1460 * S,
};

/** Nominal ignition of the five first-generation stars (the first is not jittered). */
const FIRST_GEN_IGNITE = [240, 290, 335, 385, 430].map((s) => s * S);

export interface FirstGenStar {
  i: number;
  ignite: number;
  death: number;
}

const fgMemo = new Map<number, FirstGenStar[]>();

/** The five first-generation stars: big, blue, planetless and short-lived. */
export function firstGen(seed: number): FirstGenStar[] {
  let f = fgMemo.get(seed);
  if (f) return f;
  f = FIRST_GEN_IGNITE.map((t, i) => {
    const ignite = i === 0 ? t : t + Math.round((u01(seed, 601, i) - 0.5) * 12 * S);
    const death = i === 0 ? CHRON.supernova : i === 1 ? 35 * MIN : Math.round(50 * MIN + 45 * MIN * u01(seed, 602, i));
    return { i, ignite, death };
  });
  if (fgMemo.size > 16) fgMemo.clear();
  fgMemo.set(seed, f);
  return f;
}

// ---- star systems ---------------------------------------------------------------------------

export type StarKind = 'red' | 'yellow' | 'blue' | 'binary';

/** Phases of one star system as fractions of its duration. */
export const UNIT = {
  packets: 8,
  packetAt: (i: number) => 0.03 + 0.03 * i,
  protostar: 0.1,
  ignite: 0.25,
  disk: 0.35,
  planets: 0.55,
  planetsEnd: 0.85,
  settle: 0.95,
};

export const PER_CLUSTER = 4;
export const PER_ZONE = 16;

const endsMemo = new Map<number, number[]>();

function ends(seed: number, k: number): number[] {
  let e = endsMemo.get(seed);
  if (!e) {
    e = [CHRON.end];
    if (endsMemo.size > 16) endsMemo.clear();
    endsMemo.set(seed, e);
  }
  while (e.length <= k) {
    const i = e.length;
    const d = Math.round(9 * MIN + 7 * MIN * ((u01(seed, 611, i) + u01(seed, 612, i)) / 2));
    e.push(e[i - 1] + d);
  }
  return e;
}

/** A at which star system k is complete (k = 0 is the home system, done with the chronicle). */
export function unitEnd(seed: number, k: number): number {
  return ends(seed, k)[k];
}

export function unitStart(seed: number, k: number): number {
  return k <= 0 ? CHRON.cradle : ends(seed, k - 1)[k - 1];
}

/** The star system forming at A (k ≥ 1) and its progress 0..1; null during the chronicle. */
export function unitAt(seed: number, A: number): { k: number; f: number; t0: number; t1: number } | null {
  if (A < CHRON.end) return null;
  // extend until the last known end passes A
  let arr = ends(seed, 1);
  while (arr[arr.length - 1] <= A) arr = ends(seed, arr.length + 64);
  let lo = 1;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= A) lo = mid + 1;
    else hi = mid;
  }
  const t0 = arr[lo - 1];
  const t1 = arr[lo];
  return { k: lo, f: (A - t0) / (t1 - t0), t0, t1 };
}

/** Star systems complete at A (the home system counts as one). */
export function systemsDone(seed: number, A: number): number {
  if (A < CHRON.end) return 0;
  const u = unitAt(seed, A)!;
  return u.k;
}

export function starKind(seed: number, k: number): StarKind {
  if (k === 0) return 'yellow';
  const x = u01(seed, 621, k);
  if (x < 0.36) return 'red';
  if (x < 0.72) return 'yellow';
  if (x < 0.9) return 'blue';
  return k >= 8 ? 'binary' : 'yellow';
}

/** Ignition time of system k. */
export function igniteAt(seed: number, k: number): number {
  if (k === 0) return CHRON.homeStar;
  const t0 = unitStart(seed, k);
  return t0 + Math.round((unitEnd(seed, k) - t0) * UNIT.ignite);
}

/** A at which a blue giant explodes (Infinity for stars that live on). */
export function deathAt(seed: number, k: number): number {
  if (starKind(seed, k) !== 'blue') return Infinity;
  return igniteAt(seed, k) + Math.round(40 * MIN + 50 * MIN * u01(seed, 622, k));
}

export const PLANET_CAP: Record<StarKind, number> = { red: 3, yellow: 6, binary: 4, blue: 0 };

/** Richness from the stardust made so far. */
export function richness(dustMade: number): number {
  return Math.min(6, 1 + Math.floor(dustMade / 36));
}

// ---- the life planet and the comets that bring its water --------------------------------------

export const LIFE = {
  formed: CHRON.homePlanets[1][1],
  coolEnd: 70 * MIN,
  moon: 45 * MIN,
  moonDur: 90 * S,
  oceanStart: 70 * MIN,
  comets: 24,
  cometGap: 175 * S,
  cometFlightMs: 40 * S,
  /** Ocean fraction per unit of water, and its cap. */
  oceanPer: 1 / 34,
  oceanMax: 0.7,
  clouds: [140 * MIN, 160 * MIN] as [number, number],
  life: 3 * H,
  lifeSpreadEnd: 7 * H,
  lights: 8 * H,
  lightsFull: 20 * H,
  rotationMs: 12 * MIN,
  yearMs: 72 * MIN,
  moonMonthMs: 18 * MIN,
  rings: 90 * MIN,
};

const cometMemo = new Map<number, number[]>();

/** Arrival times of the comets that carry ice to the life planet. */
export function cometTimes(seed: number): number[] {
  let c = cometMemo.get(seed);
  if (c) return c;
  c = [];
  for (let i = 0; i < LIFE.comets; i++) c.push(LIFE.oceanStart + i * LIFE.cometGap + Math.round((u01(seed, 631, i) - 0.5) * 80 * S));
  if (cometMemo.size > 16) cometMemo.clear();
  cometMemo.set(seed, c);
  return c;
}

export function cometsArrived(seed: number, A: number): number {
  const c = cometTimes(seed);
  let n = 0;
  while (n < c.length && c[n] <= A) n++;
  return n;
}

export function oceanAt(seed: number, A: number): number {
  return Math.min(LIFE.oceanMax, cometsArrived(seed, A) * LIFE.oceanPer);
}

/** A at which the ocean first covers 60% of the planet. */
export function ocean60At(seed: number): number {
  const need = Math.ceil(0.6 / LIFE.oceanPer);
  return cometTimes(seed)[Math.min(need, LIFE.comets) - 1];
}

/** Orbital periods of the home planets (inner, life, gas giant): whole multiples of each other. */
export const ORBIT_MS = [8 * MIN, 72 * MIN, 288 * MIN] as const;
/** The home planets line up at this A and every 288 minutes after. */
export const ALIGN_AT = 220 * MIN;
export const ALIGN_EVERY = 288 * MIN;

/** Orbit angle of home planet i at A (0 = in front of the star, toward the viewer). */
export function orbitAngle(i: number, A: number): number {
  const P = ORBIT_MS[i];
  // the three meet on the far right of their orbits at ALIGN_AT
  return Math.PI * 0.5 + (2 * Math.PI * (A - ALIGN_AT)) / P;
}

// ---- milestones --------------------------------------------------------------------------------

export type MilestoneId =
  | 'bang'
  | 'firstLight'
  | 'web'
  | 'firstStar'
  | 'firstSupernova'
  | 'firstNebula'
  | 'homeStar'
  | 'firstPlanets'
  | 'secondNebula'
  | 'moon'
  | 'firstCluster'
  | 'ocean'
  | 'rings'
  | 'galaxyDisk'
  | 'life'
  | 'coreAwake'
  | 'firstLights';

export interface Milestone {
  id: MilestoneId;
  A: number;
  dur: number;
  /** The camera visits the life planet. */
  visit?: boolean;
}

const msMemo = new Map<number, Milestone[]>();

export function milestones(seed: number): Milestone[] {
  let m = msMemo.get(seed);
  if (m) return m;
  const fg = firstGen(seed);
  m = [
    { id: 'bang', A: 0, dur: CHRON.plasmaEnd },
    { id: 'firstLight', A: CHRON.plasmaEnd, dur: 60 * S },
    { id: 'web', A: CHRON.webStart, dur: 75 * S },
    { id: 'firstStar', A: CHRON.collapse, dur: 45 * S },
    { id: 'firstSupernova', A: CHRON.supernova, dur: 70 * S },
    { id: 'firstNebula', A: CHRON.nebula + 20 * S, dur: 60 * S },
    { id: 'homeStar', A: CHRON.homeStar, dur: 55 * S },
    { id: 'firstPlanets', A: CHRON.planets, dur: CHRON.end - CHRON.planets },
    { id: 'secondNebula', A: fg[1].death, dur: 70 * S },
    { id: 'moon', A: LIFE.moon, dur: LIFE.moonDur + 10 * S, visit: true },
    { id: 'firstCluster', A: unitEnd(seed, PER_CLUSTER - 1), dur: 25 * S },
    { id: 'ocean', A: cometTimes(seed)[0] - LIFE.cometFlightMs, dur: 70 * S, visit: true },
    { id: 'rings', A: LIFE.rings, dur: 90 * S },
    { id: 'galaxyDisk', A: 2 * H, dur: 60 * S },
    { id: 'life', A: LIFE.life, dur: 75 * S, visit: true },
    { id: 'coreAwake', A: 4 * H, dur: 90 * S },
    { id: 'firstLights', A: LIFE.lights, dur: 75 * S, visit: true },
  ];
  // never overlap: a later one waits for the earlier to end
  m.sort((a, b) => a.A - b.A);
  for (let i = 1; i < m.length; i++) {
    const prevEnd = m[i - 1].A + m[i - 1].dur;
    if (m[i].A < prevEnd) m[i] = { ...m[i], A: prevEnd + 5 * S };
  }
  if (msMemo.size > 16) msMemo.clear();
  msMemo.set(seed, m);
  return m;
}

/** The milestone being shown at A, if any. */
export function milestoneAt(seed: number, A: number): Milestone | null {
  for (const m of milestones(seed)) {
    if (A >= m.A && A < m.A + m.dur) return m;
    if (m.A > A) break;
  }
  return null;
}

// ---- stages ----------------------------------------------------------------------------------

export const COSMOS_STAGE_NAMES = [
  '',
  '첫 빛',
  '우주 거미줄',
  '첫 별',
  '별먼지와 성운',
  '첫 행성계',
  '성단',
  '은하의 탄생',
  '생명의 행성',
  '이웃 은하',
  '스스로를 바라보는 우주',
] as const;

/** A at which each stage (index 1..10) begins. Non-decreasing. */
export function stageTimes(seed: number): number[] {
  return [
    0,
    0,
    CHRON.webStart,
    CHRON.firstStar,
    CHRON.supernova,
    CHRON.end,
    unitEnd(seed, PER_CLUSTER - 1),
    Math.max(unitEnd(seed, 2 * PER_CLUSTER - 1), 2 * H),
    Math.max(LIFE.life, ocean60At(seed)),
    Math.max(unitEnd(seed, PER_ZONE - 1), 4 * H),
    Math.max(unitEnd(seed, 2 * PER_ZONE - 1), LIFE.lights),
  ];
}

export function cosmosStage(seed: number, A: number): number {
  const t = stageTimes(seed);
  let s = 1;
  for (let i = 2; i <= 10; i++) if (A >= t[i]) s = i;
  return s;
}

// ---- the ledger ------------------------------------------------------------------------------

export interface Ledger {
  in: number;
  out: number;
}

export interface CosmosSim {
  v: number;
  seed: number;
  /** World time at which this universe began (its age is W − origin). */
  origin: number;
  /** A processed so far (ms). */
  t: number;
  /** Star systems complete (the home system is the first). */
  done: number;
  /** Next fixed (chronicle) event, next comet. */
  fi: number;
  ci: number;
  /** System in work (≥ 1 after the chronicle), its next event (packets, ignite, plan, done). */
  k: number;
  ke: number;
  /** Planets planned for system k (−1 before its planets begin). */
  n: number;
  /** Pending supernovae of blue giants: [A, system]. */
  sn: [number, number][];
  /** Gas taken from the web (supply is closed-form: gasIn) and given back by supernovae. */
  gas: { out: number; back: number };
  dust: Ledger;
  ice: Ledger;
  water: number;
  /** Planets of recent systems (system plFrom + i), for drawing. */
  pl: number[];
  rocky: number[];
  plFrom: number;
  totals: { stars: number; planets: number; rocky: number; giants: number; supernovae: number };
}

const KEEP_PLANETS = 96;

/** Gas that has flowed in along the cosmic web by A. */
export function gasIn(A: number): number {
  return A < CHRON.webStart ? 80 : 80 + Math.floor((A - CHRON.webStart) / MIN);
}

export function gasPool(s: CosmosSim, A = s.t): number {
  return gasIn(A) + s.gas.back - s.gas.out;
}

/** Fixed events of the chronicle and the first-generation stars. */
type FixedKind = 'fgIgnite' | 'supernova' | 'homeFlow' | 'homeIgnite' | 'homeRocky' | 'homeGiant' | 'homeDone';
interface FixedEvent {
  A: number;
  kind: FixedKind;
  ref: number;
}

const fixedMemo = new Map<number, FixedEvent[]>();

function fixedEvents(seed: number): FixedEvent[] {
  let f = fixedMemo.get(seed);
  if (f) return f;
  f = [];
  for (const s of firstGen(seed)) {
    f.push({ A: s.ignite, kind: 'fgIgnite', ref: -1 - s.i });
    f.push({ A: s.death, kind: 'supernova', ref: -1 - s.i });
  }
  for (let i = 0; i < 4; i++) f.push({ A: 950 * S + i * 50 * S, kind: 'homeFlow', ref: 0 });
  f.push({ A: CHRON.homeStar, kind: 'homeIgnite', ref: 0 });
  f.push({ A: CHRON.homePlanets[0][1], kind: 'homeRocky', ref: 0 });
  f.push({ A: CHRON.homePlanets[1][1], kind: 'homeRocky', ref: 0 });
  f.push({ A: CHRON.homePlanets[2][1], kind: 'homeGiant', ref: 0 });
  f.push({ A: CHRON.end, kind: 'homeDone', ref: 0 });
  f.sort((a, b) => a.A - b.A || order(a.kind) - order(b.kind));
  if (fixedMemo.size > 16) fixedMemo.clear();
  fixedMemo.set(seed, f);
  return f;
}

const order = (k: FixedKind) => ['supernova', 'fgIgnite', 'homeFlow', 'homeIgnite', 'homeRocky', 'homeGiant', 'homeDone'].indexOf(k);

export function initCosmos(seed: number, base?: SimBase): CosmosSim {
  return {
    v: COSMOS_SIM_VERSION,
    seed,
    origin: base?.W ?? 0,
    t: 0,
    done: 0,
    fi: 0,
    ci: 0,
    k: 1,
    ke: 0,
    n: -1,
    sn: [],
    gas: { out: 0, back: 0 },
    dust: { in: 0, out: 0 },
    ice: { in: 0, out: 0 },
    water: 0,
    pl: [3],
    rocky: [2],
    plFrom: 0,
    totals: { stars: 0, planets: 0, rocky: 0, giants: 0, supernovae: 0 },
  };
}

export function cloneCosmos(s: CosmosSim): CosmosSim {
  return JSON.parse(JSON.stringify(s)) as CosmosSim;
}

/** Events of system k in order: packets 0..7, ignite (8), planets (9), done (10). */
const UNIT_EVENTS = UNIT.packets + 3;

function unitEventAt(seed: number, k: number, e: number): number {
  const t0 = unitStart(seed, k);
  const d = unitEnd(seed, k) - t0;
  if (e < UNIT.packets) return t0 + Math.round(d * UNIT.packetAt(e));
  if (e === UNIT.packets) return t0 + Math.round(d * UNIT.ignite);
  if (e === UNIT.packets + 1) return t0 + Math.round(d * UNIT.planets);
  return t0 + d;
}

function supernova(s: CosmosSim) {
  s.dust.in += 18;
  s.gas.back += 6;
  s.totals.supernovae++;
}

function recordPlanets(s: CosmosSim, k: number, n: number, rocky: number) {
  const i = k - s.plFrom;
  s.pl[i] = n;
  s.rocky[i] = rocky;
  if (s.pl.length > KEEP_PLANETS) {
    const drop = s.pl.length - KEEP_PLANETS;
    s.pl.splice(0, drop);
    s.rocky.splice(0, drop);
    s.plFrom += drop;
  }
}

/** Planets of system k (from the ledger; −1 if not planned or no longer kept). */
export function planetsOf(s: CosmosSim, k: number): { n: number; rocky: number } | null {
  if (k === 0) return { n: 3, rocky: 2 };
  if (k === s.k && s.n >= 0) return { n: s.n, rocky: s.rocky[k - s.plFrom] ?? 0 };
  const i = k - s.plFrom;
  if (i < 0 || i >= s.pl.length || s.pl[i] === undefined || s.pl[i] === null) return null;
  return { n: s.pl[i], rocky: s.rocky[i] };
}

/**
 * Processes every event up to and including A (ms of the universe's age). Returns the number of
 * events processed.
 */
export function advanceCosmos(s: CosmosSim, A: number, maxEvents = Infinity): number {
  const seed = s.seed;
  const fixed = fixedEvents(seed);
  const comets = cometTimes(seed);
  let count = 0;
  let capped = false;
  for (;;) {
    if (count >= maxEvents) {
      capped = true;
      break;
    }
    // the earliest pending event
    const tf = s.fi < fixed.length ? fixed[s.fi].A : Infinity;
    const tc = s.ci < comets.length ? comets[s.ci] : Infinity;
    const ts = s.sn.length ? s.sn[0][0] : Infinity;
    const tu = s.done >= 1 ? unitEventAt(seed, s.k, s.ke) : Infinity;
    const t = Math.min(tf, tc, ts, tu);
    if (t > A) break;
    count++;
    if (t === ts) {
      s.sn.shift();
      supernova(s);
    } else if (t === tf) {
      const ev = fixed[s.fi++];
      switch (ev.kind) {
        case 'fgIgnite':
          s.gas.out += 6;
          s.totals.stars++;
          break;
        case 'supernova':
          supernova(s);
          break;
        case 'homeFlow':
          s.gas.out += 3;
          break;
        case 'homeIgnite':
          s.totals.stars++;
          break;
        case 'homeRocky': {
          const take = Math.min(1, s.dust.in - s.dust.out);
          s.dust.out += take;
          s.totals.planets++;
          s.totals.rocky++;
          break;
        }
        case 'homeGiant':
          s.ice.in += 30 + 2;
          s.totals.planets++;
          s.totals.giants++;
          break;
        case 'homeDone':
          s.done = 1;
          break;
      }
    } else if (t === tc) {
      s.ci++;
      if (s.ice.in - s.ice.out >= 1) {
        s.ice.out += 1;
        s.water += 1;
      }
    } else {
      const k = s.k;
      const e = s.ke;
      if (e < UNIT.packets) {
        s.gas.out += 1;
      } else if (e === UNIT.packets) {
        s.totals.stars++;
        const d = deathAt(seed, k);
        if (Number.isFinite(d)) {
          s.sn.push([d, k]);
          s.sn.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        }
      } else if (e === UNIT.packets + 1) {
        const kind = starKind(seed, k);
        const n = Math.min(PLANET_CAP[kind], richness(s.dust.in));
        const rocky = Math.min(Math.ceil(n / 2), s.dust.in - s.dust.out);
        const giants = n - Math.ceil(n / 2);
        const total = rocky + giants;
        s.dust.out += rocky;
        s.ice.in += 2 * giants;
        s.n = total;
        s.totals.planets += total;
        s.totals.rocky += rocky;
        s.totals.giants += giants;
        recordPlanets(s, k, total, rocky);
      } else {
        if (s.n < 0) recordPlanets(s, k, 0, 0);
        s.done = k + 1;
        s.k = k + 1;
        s.n = -1;
      }
      s.ke = e + 1 >= UNIT_EVENTS ? 0 : e + 1;
    }
    s.t = t;
  }
  if (!capped) s.t = Math.max(s.t, A);
  return count;
}

/** The universe's age at world time W. */
export const ageOf = (s: CosmosSim, W: number) => Math.max(0, W - s.origin);

/** The system k's planets as the scene draws them (from the ledger, or from the stardust rule). */
export function systemPlanets(s: CosmosSim, k: number): number {
  const p = planetsOf(s, k);
  if (p) return p.n;
  // older than the kept window: the richness at that time is a fair stand-in
  return Math.min(PLANET_CAP[starKind(s.seed, k)], 3);
}

// ---- the home galaxy ---------------------------------------------------------------------------

export interface GalaxyState {
  /** Proto-galaxy clumps (0..1 visibility) and how far they have drawn together (0..1). */
  clumps: number;
  merge: number;
  disk: number;
  arms: number;
  core: number;
  /** Jets of the awakened core (0..1, a peak while it wakes, then a steady glow). */
  jets: number;
  /** Rotation angle (radians). */
  angle: number;
  satellites: number;
  /** Neighbour galaxy: visibility and approach 0..1 (1 = merged). */
  neighbour: number;
  approach: number;
}

export const GALAXY_TURN_MS = 8 * H;

export function galaxyAt(A: number): GalaxyState {
  const wake = 4 * H;
  const jets = smooth(wake, wake + 40 * S, A) * (1 - 0.65 * smooth(wake + 60 * S, wake + 150 * S, A));
  return {
    clumps: smooth(25 * MIN, 35 * MIN, A),
    merge: smooth(30 * MIN, 2 * H, A),
    disk: smooth(110 * MIN, 130 * MIN, A),
    arms: smooth(2 * H, 3 * H, A),
    core: smooth(110 * MIN, 3 * H, A),
    jets,
    angle: (2 * Math.PI * A) / GALAXY_TURN_MS,
    satellites: smooth(6 * H, 6.5 * H, A),
    neighbour: smooth(6 * H, 6.6 * H, A),
    approach: A <= 6 * H ? 0 : Math.min(1, Math.log1p((A - 6 * H) / H) / Math.log1p(94)),
  };
}

// ---- the life planet -----------------------------------------------------------------------------

export interface LifePlanetState {
  /** 0 before it formed, 0..1 while it forms, 1 after. */
  formed: number;
  magma: number;
  crust: number;
  atmosphere: number;
  ocean: number;
  clouds: number;
  /** Green over the land (0..1) and the first coastal bloom (0..1, peaks when life begins). */
  green: number;
  bloom: number;
  /** Season −1..1 (northern summer positive) once life is there. */
  season: number;
  lights: number;
  /** Surface rotation (turns) and orbit angle. */
  spin: number;
  orbit: number;
  /** The moon: 0 none, 0..1 forming (impact → ring → moon), 1 there; its orbit phase (turns). */
  moon: number;
  moonPhase: number;
}

export function lifePlanetAt(seed: number, A: number): LifePlanetState {
  const [f0, f1] = CHRON.homePlanets[1];
  const formed = ramp(f0, f1, A);
  // (the scene shows the planet only as far as it has formed)
  const magma = 1 - smooth(f1, LIFE.coolEnd, A);
  return {
    formed,
    magma,
    crust: 1 - magma,
    atmosphere: smooth(40 * MIN, 70 * MIN, A) * 0.5 + smooth(70 * MIN, 140 * MIN, A) * 0.5,
    ocean: oceanAt(seed, A) / LIFE.oceanMax,
    clouds: smooth(LIFE.clouds[0], LIFE.clouds[1], A),
    green: smooth(LIFE.life, LIFE.lifeSpreadEnd, A),
    bloom: A < LIFE.life ? 0 : smooth(LIFE.life, LIFE.life + 60 * S, A),
    season: A < LIFE.life ? 0 : Math.sin((2 * Math.PI * (A - LIFE.life)) / LIFE.yearMs) * smooth(LIFE.life, LIFE.life + 30 * MIN, A),
    lights: A < LIFE.lights ? 0 : 0.08 + 0.92 * smooth(LIFE.lights, LIFE.lightsFull, A),
    spin: A / LIFE.rotationMs,
    orbit: orbitAngle(1, A),
    moon: A < LIFE.moon ? 0 : Math.min(1, (A - LIFE.moon) / LIFE.moonDur),
    moonPhase: A / LIFE.moonMonthMs,
  };
}

/** The gas giant's rings (0..1, they form once). */
export function ringsAt(A: number): number {
  return smooth(LIFE.rings, LIFE.rings + 90 * S, A);
}

// ---- background stars ------------------------------------------------------------------------------

export const FIELD = { first: CHRON.firstStar, every: 30 * S };

/** Background stars lit by A. */
export function fieldStars(A: number): number {
  return A < FIELD.first ? 0 : Math.floor((A - FIELD.first) / FIELD.every) + 1;
}

/** A at which background star i lights. */
export function fieldStarAt(i: number): number {
  return FIELD.first + i * FIELD.every;
}
