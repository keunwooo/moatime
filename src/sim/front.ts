/**
 * 전선 — the war at the edge of the galaxy, as a closed-form schedule (docs/FRONT.md 3절).
 *
 * Everything is a pure function of (world seed, war time A); the people commanded only changes
 * names and art:
 * - the opening build order (one building to three bases in 24 min 20 s),
 * - the planets: the first is held after about 1 h 30 min, then every ~2 h an orbit battle, a
 *   landing and a new planet; held planets become developed planets that keep growing,
 * - the expansion sites changing hands (점령전) every 10–14 minutes, faster in the offensive,
 * - bases, buildings, workers, the army's size and mix (cheap → dear units), ships and tiers.
 * The schedule never reads a resource, so however the time is split into sessions the result is
 * the same. The ledger (ore, heat, time crystal) is computed from the same schedule for display.
 *
 * Times are war time A in ms (A = W − origin, the moment a people was chosen).
 */

import { hash32 } from '../core/rng';
import type { RaceId } from '../core/session';
import type { SimBase } from './types';
import {
  armyMix,
  armySize,
  armyArrival,
  armyShares,
  ARMY_KINDS,
  BIOMES,
  BUILD_MS,
  BUILDING_COST,
  devLevel,
  OPENS,
  SUPPLY,
  TIDE_PHASE_MS,
  TIDE_PHASES,
  UNIT_COST,
  upgradesAt,
  type ArmyKind,
  type BiomeId,
  type BuildingKind,
  type TidePhase,
} from './frontPlan';

export const FRONT_SIM_VERSION = 1;

const S = 1000;
const MIN = 60_000;
const H = 3_600_000;
const u01 = (...xs: number[]) => hash32(...xs) / 4294967296;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// ---- the opening (A, ms) -------------------------------------------------------------------------

/** Beats of the first planet's opening (docs/FRONT.md 2.4절). */
export const OPEN = {
  mine: 0,
  workers: 40 * S,
  supply: 100 * S,
  prod: 160 * S,
  firstUnit: 230 * S,
  gas: 280 * S,
  scout: 360 * S,
  wall: 450 * S,
  firstFight: 510 * S,
  natural: 570 * S,
  tech2: 720 * S,
  mix: 870 * S,
  capture: 1020 * S,
  third: 1170 * S,
  front: 1320 * S,
  end: 1460 * S,
} as const;

export type OpenBeat = keyof typeof OPEN;
export const OPEN_BEATS = Object.keys(OPEN) as OpenBeat[];

/** The opening on later planets, compressed to ten minutes (relative to the landing). */
export const RELAND = { mine: 0, supply: 60 * S, prod: 120 * S, scout: 210 * S, natural: 330 * S, end: 600 * S } as const;
export type RelandBeat = keyof typeof RELAND;
export const RELAND_BEATS = Object.keys(RELAND) as RelandBeat[];

/** The beat of the first planet's opening at A (null once it is over). */
export function openBeat(A: number): OpenBeat | null {
  if (A < 0 || A >= OPEN.end) return null;
  let cur: OpenBeat = 'mine';
  for (const b of OPEN_BEATS) if (b !== 'end' && A >= OPEN[b]) cur = b;
  return cur;
}

/** The beat of a later planet's landing opening at A (null outside it). */
export function relandBeat(p: PlanetPlan, A: number): RelandBeat | null {
  if (p.idx === 0) return null;
  const a = A - p.landAt;
  if (a < 0 || a >= RELAND.end) return null;
  let cur: RelandBeat = 'mine';
  for (const b of RELAND_BEATS) if (b !== 'end' && a >= RELAND[b]) cur = b;
  return cur;
}

// ---- the map: sites and owners -------------------------------------------------------------------

/** Expansion sites 0–5 run up the left side (0 nearest home), 6–11 up the right side. */
export const SITE_COUNT = 12;
/** The natural expansion below the home plateau. */
export const NAT = 12;
/** The rivals' home plateaus (left, right). */
export const RIVAL_HOME = [13, 14] as const;
export const ALL_SITES = 15;

/** -1 neutral, 0 me, 1 rival on the left, 2 rival on the right. */
export type Owner = -1 | 0 | 1 | 2;
export type SiteEvtKind = 'gain' | 'push' | 'break' | 'retake' | 'grab' | 'lose' | 'final';

export interface SiteEvt {
  /** The moment the site changes hands (the fight runs for `dur` before it). */
  t: number;
  dur: number;
  sites: number[];
  to: Owner;
  kind: SiteEvtKind;
  /** Which rival fought (1 left, 2 right), for the battle's look. */
  enemy: 1 | 2;
}

export const siteSide = (id: number): 0 | 1 => (id < 6 ? 0 : 1);
export const siteRank = (id: number) => id % 6;

export interface PlanetPlan {
  idx: number;
  sector: number;
  biome: BiomeId;
  seed: number;
  /** Orbit battle before the landing (−1 for the first planet). */
  orbitAt: number;
  landAt: number;
  decisiveAt: number;
  conqueredAt: number;
  /** The natural expansion is on the left (0) or right (1). */
  natSide: 0 | 1;
  crystal: boolean[];
  events: SiteEvt[];
  /** First event that took a rival's expansion (전선 돌파), or −1. */
  breakAt: number;
}

export const DECISIVE_MS = 150 * S;
const LOSS_P = 0.6;

/** Tide phase index (0 정비, 1 증강, 2 공세, 3 폭풍) at A, or −1 during the opening. */
export function tideIndex(A: number): number {
  if (A < OPEN.end) return -1;
  return Math.floor((A - OPEN.end) / TIDE_PHASE_MS) % 4;
}

export function tidePhase(A: number): TidePhase {
  const i = tideIndex(A);
  return i < 0 ? 'open' : TIDE_PHASES[i];
}

/** Start of the offensive phase running at A, or of the next one. */
export function nextOffensive(A: number): number {
  const a = Math.max(A, OPEN.end);
  const cycle = 4 * TIDE_PHASE_MS;
  const k = Math.floor((a - OPEN.end) / cycle);
  for (let j = k; j < k + 3; j++) {
    const s = OPEN.end + j * cycle + 2 * TIDE_PHASE_MS;
    if (s + TIDE_PHASE_MS > a) return Math.max(s, a);
  }
  return a;
}

const planMemo = new Map<string, PlanetPlan[]>();

function biomeOf(seed: number, sector: number, i: number): BiomeId {
  if (sector === 0) return BIOMES[i];
  if (i === 6) return 'heart';
  // later sectors: a permutation of the first six
  const order = [0, 1, 2, 3, 4, 5].sort((a, b) => hash32(seed, sector, a, 0xb10) - hash32(seed, sector, b, 0xb10));
  return BIOMES[order[i]];
}

function makePlanet(seed: number, prev: PlanetPlan | null): PlanetPlan {
  const idx = prev ? prev.idx + 1 : 0;
  const ps = hash32(seed, idx, 0x91a) >>> 0;
  const sector = Math.floor(idx / 7);
  let orbitAt = -1;
  let landAt = 0;
  let conqueredAt: number;
  if (!prev) conqueredAt = Math.round((85 + 10 * u01(ps, 1)) * MIN);
  else {
    orbitAt = prev.conqueredAt + Math.round((18 + 6 * u01(ps, 2)) * MIN);
    landAt = orbitAt + 10 * MIN;
    conqueredAt = landAt + Math.round((72 + 38 * u01(ps, 3)) * MIN);
  }
  const decisiveAt = conqueredAt - DECISIVE_MS;
  const natSide = (u01(ps, 4) < 0.5 ? 0 : 1) as 0 | 1;
  const crystal = Array.from({ length: SITE_COUNT }, (_, i) => siteRank(i) >= 2 && u01(ps, 5, i) < 0.42);
  const plan: PlanetPlan = { idx, sector, biome: biomeOf(seed, sector, idx % 7), seed: ps, orbitAt, landAt, decisiveAt, conqueredAt, natSide, crystal, events: [], breakAt: -1 };
  plan.events = planEvents(plan, !prev);
  plan.breakAt = plan.events.find((e) => e.kind === 'break')?.t ?? -1;
  return plan;
}

/** The sites changing hands on a planet, in time order. */
function planEvents(p: PlanetPlan, first: boolean): SiteEvt[] {
  const ps = p.seed;
  const owner: Owner[] = Array.from({ length: ALL_SITES }, () => -1 as Owner);
  owner[RIVAL_HOME[0]] = 1;
  owner[RIVAL_HOME[1]] = 2;
  const out: SiteEvt[] = [];
  const quietFrom = p.decisiveAt - 3 * MIN;

  // the rivals' own expansions (in the fog, mostly)
  const grabs: SiteEvt[] = [
    { t: p.landAt + Math.round((6 + 3 * u01(ps, 10)) * MIN), dur: 0, sites: [5], to: 1 as Owner, kind: 'grab' as SiteEvtKind, enemy: 1 as const },
    { t: p.landAt + Math.round((8 + 3 * u01(ps, 11)) * MIN), dur: 0, sites: [11], to: 2 as Owner, kind: 'grab' as SiteEvtKind, enemy: 2 as const },
    { t: p.landAt + Math.round((32 + 6 * u01(ps, 12)) * MIN), dur: 0, sites: [4], to: 1 as Owner, kind: 'grab' as SiteEvtKind, enemy: 1 as const },
    { t: p.landAt + Math.round((34 + 6 * u01(ps, 13)) * MIN), dur: 0, sites: [10], to: 2 as Owner, kind: 'grab' as SiteEvtKind, enemy: 2 as const },
  ].filter((e) => e.t < quietFrom);

  // my fights: the first in the opening (or soon after a landing), then every 10–14 minutes
  const times: number[] = [];
  let t = first ? OPEN.capture + 90 * S : p.landAt + RELAND.end + Math.round((1 + 2 * u01(ps, 20)) * MIN);
  for (let n = 0; t < quietFrom && n < 200; n++) {
    times.push(t);
    const ti = tideIndex(t);
    const mult = ti === 2 ? 0.7 : ti === 3 ? 1.6 : 1;
    t += Math.round((10 + 4 * u01(ps, 21, n)) * MIN * mult);
  }
  // every offensive phase holds at least one of them
  if (times.length) {
    for (let s = nextOffensive(times[0]); s < quietFrom; s = nextOffensive(s + TIDE_PHASE_MS)) {
      const e = s + TIDE_PHASE_MS;
      if (!times.some((x) => x >= s && x < e)) {
        const x = Math.min(quietFrom - 30 * S, s + Math.round((3 + 3 * u01(ps, 22, s)) * MIN));
        if (x > times[0]) times.push(x);
      }
    }
  }
  times.sort((a, b) => a - b);

  // one site may be lost for a while, in a storm, and is taken back in the next offensive
  let loss = -1;
  if (u01(ps, 30) < LOSS_P) {
    const from = p.landAt + 40 * MIN;
    for (let s = nextOffensive(from) + TIDE_PHASE_MS; s < quietFrom - 20 * MIN; s += 4 * TIDE_PHASE_MS) {
      // only when the next offensive (when it is taken back) comes well before the decisive battle
      if (nextOffensive(s + TIDE_PHASE_MS) + 10 * MIN >= quietFrom) break;
      loss = s + Math.round((2 + 6 * u01(ps, 31)) * MIN);
      break;
    }
  }

  type Slot = { t: number; g: SiteEvt | null };
  const merged: Slot[] = [...grabs.map((g) => ({ t: g.t, g })), ...times.map((x) => ({ t: x, g: null }))];
  if (loss > 0) merged.push({ t: loss, g: { t: loss, dur: 0, sites: [], to: 1, kind: 'lose', enemy: 1 } });
  merged.sort((a, b) => a.t - b.t);

  let lost = -1;
  let n = 0;
  const pickNeutral = (salt: number): number => {
    const cands: number[] = [];
    for (let i = 0; i < SITE_COUNT; i++) if (owner[i] === -1) cands.push(i);
    if (!cands.length) return -1;
    const pref = u01(ps, 40, salt) < 0.5 ? 0 : 1;
    cands.sort((a, b) => siteRank(a) - siteRank(b) || (siteSide(a) === pref ? -1 : 1) - (siteSide(b) === pref ? -1 : 1));
    return cands[0];
  };
  const pickRival = (): number => {
    const cands: number[] = [];
    for (let i = 0; i < SITE_COUNT; i++) if (owner[i] === 1 || owner[i] === 2) cands.push(i);
    cands.sort((a, b) => siteRank(a) - siteRank(b));
    return cands.length ? cands[0] : -1;
  };
  const sideEnemy = (site: number): 1 | 2 => (siteSide(site) + 1) as 1 | 2;
  let broke = false;
  for (const m of merged) {
    if (m.g && m.g.kind === 'grab') {
      const site = m.g.sites[0];
      if (owner[site] !== -1) continue;
      owner[site] = m.g.to;
      out.push(m.g);
      continue;
    }
    if (m.g && m.g.kind === 'lose') {
      // my outermost expansion (never the natural or the first one taken)
      const mine: number[] = [];
      for (let i = 0; i < SITE_COUNT; i++) if (owner[i] === 0) mine.push(i);
      if (mine.length < 2) continue;
      mine.sort((a, b) => siteRank(b) - siteRank(a));
      const site = mine[0];
      const to = sideEnemy(site);
      owner[site] = to;
      lost = site;
      out.push({ t: m.t, dur: Math.round(lerp(60, 90, u01(ps, 32)) * S), sites: [site], to, kind: 'lose', enemy: to });
      continue;
    }
    // one of my fights
    const ti = tideIndex(m.t);
    const dur = Math.round(lerp(60, 100, u01(ps, 42, n)) * S);
    const sites: number[] = [];
    let kind: SiteEvtKind = ti === 2 ? 'push' : 'gain';
    if (lost >= 0 && ti === 2 && owner[lost] !== 0) {
      sites.push(lost);
      kind = 'retake';
      lost = -1;
    }
    const wantBreak = !broke && sites.length === 0 && (first ? m.t >= 55 * MIN : pickNeutral(n) < 0);
    if (wantBreak) {
      const r = pickRival();
      if (r >= 0) {
        sites.push(r);
        kind = 'break';
        broke = true;
      }
    }
    const count = kind === 'push' || kind === 'retake' ? 2 : 1;
    while (sites.length < count) {
      let s = pickNeutral(n + sites.length);
      if (s < 0 && (broke || !first)) s = pickRival();
      if (s < 0 || sites.includes(s)) break;
      sites.push(s);
      owner[s] = 0; // reserve it so the second pick differs
    }
    n++;
    if (!sites.length) continue;
    const fought = sites.find((s) => s < SITE_COUNT && siteRank(s) >= 3) ?? sites[0];
    for (const s of sites) owner[s] = 0;
    out.push({ t: m.t, dur, sites, to: 0, kind, enemy: sideEnemy(fought) });
  }
  // the decisive battle takes the rest
  const rest: number[] = [];
  for (let i = 0; i < ALL_SITES; i++) if (owner[i] !== 0 && i !== NAT) rest.push(i);
  out.push({ t: p.conqueredAt, dur: DECISIVE_MS, sites: rest, to: 0, kind: 'final', enemy: (1 + Math.floor(u01(ps, 50) * 2)) as 1 | 2 });
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** The planets up to A plus some ahead (extended lazily). */
export function planetsTo(seed: number, A: number): PlanetPlan[] {
  const key = `${seed}`;
  let list = planMemo.get(key);
  if (!list) {
    if (planMemo.size > 16) planMemo.clear();
    list = [makePlanet(seed, null)];
    planMemo.set(key, list);
  }
  while (list[list.length - 1].conqueredAt <= A + 4 * H && list.length < 5000) list.push(makePlanet(seed, list[list.length - 1]));
  return list;
}

/** The planet being fought for at A (the last one landed on). */
export function frontPlanet(seed: number, A: number): PlanetPlan {
  const list = planetsTo(seed, A);
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid].landAt <= A) lo = mid;
    else hi = mid - 1;
  }
  return list[lo];
}

/** The planet whose orbit is being won at A (between an orbit battle and its landing), if any. */
export function orbitPlanet(seed: number, A: number): PlanetPlan | null {
  const list = planetsTo(seed, A);
  const next = list[frontPlanet(seed, A).idx + 1];
  return next && next.orbitAt >= 0 && A >= next.orbitAt && A < next.landAt ? next : null;
}

/** Planets held (conquered) by A. */
export function heldCount(seed: number, A: number): number {
  const f = frontPlanet(seed, A);
  return f.idx + (A >= f.conqueredAt ? 1 : 0);
}

/** Owners of a planet's sites at A. */
export function ownersAt(p: PlanetPlan, A: number): Owner[] {
  const owner: Owner[] = Array.from({ length: ALL_SITES }, () => -1 as Owner);
  owner[RIVAL_HOME[0]] = 1;
  owner[RIVAL_HOME[1]] = 2;
  if (A >= natStart(p)) owner[NAT] = 0;
  for (const e of p.events) {
    if (e.t > A) break;
    for (const s of e.sites) owner[s] = e.to;
  }
  return owner;
}

/** When the natural expansion's base is begun on a planet. */
export const natStart = (p: PlanetPlan) => (p.idx === 0 ? OPEN.natural : p.landAt + RELAND.natural);

/** Weights in the share: the natural and the twelve sites one each, a rival's home two. */
export const SHARE_TOTAL = SITE_COUNT + 1 + 4;

/** Share of the planet held (0..1). */
export function shareOf(owner: readonly Owner[]): number {
  let mine = 0;
  for (let i = 0; i < ALL_SITES; i++) {
    if (owner[i] !== 0) continue;
    mine += i === RIVAL_HOME[0] || i === RIVAL_HOME[1] ? 2 : 1;
  }
  return mine / SHARE_TOTAL;
}

// ---- bases, buildings, workers -------------------------------------------------------------------

/** A base: HOME is the home plateau, NAT the natural, 0–11 an expansion site. */
export interface BaseEvt {
  site: number;
  t0: number;
  /** Lost at (the base is wrecked; −1 if never). */
  lostAt: number;
}

export interface BuildEvt {
  /** Base site (HOME for the home plateau). */
  site: number;
  /** Index of the base in planetWorks().bases (a retaken site gets a new base). */
  base: number;
  slot: number;
  kind: BuildingKind;
  t0: number;
  t1: number;
}

export const HOME = -1;

const HOME_ORDER_FIRST: [BuildingKind, number][] = [
  ['supply', OPEN.supply],
  ['barracks', OPEN.prod],
  ['gas', OPEN.gas],
  ['wall', OPEN.wall],
  ['supply', 600 * S],
  ['tech2', OPEN.tech2],
  ['defense', 900 * S],
  ['supply', 20 * MIN],
  ['factory', 28.5 * MIN],
  ['supply', 34 * MIN],
  ['airfield', 38.5 * MIN],
  ['tech3', 43 * MIN],
  ['supply', 48 * MIN],
  ['defense', 52 * MIN],
  ['shipyard', 60 * MIN],
  ['supply', 64 * MIN],
  ['supply', 76 * MIN],
];

const HOME_ORDER_LATER: [BuildingKind, number][] = [
  ['supply', RELAND.supply],
  ['barracks', RELAND.prod],
  ['gas', 150 * S],
  ['tech2', 240 * S],
  ['factory', 300 * S],
  ['supply', 360 * S],
  ['airfield', 420 * S],
  ['tech3', 480 * S],
  ['defense', 540 * S],
  ['shipyard', 600 * S],
  ['supply', 15 * MIN],
  ['supply', 30 * MIN],
];

/** Buildings an expansion base adds after its own (offsets from the base's completion). */
const SITE_ORDER: [BuildingKind, number][] = [
  ['gas', 60 * S],
  ['defense', 150 * S],
  ['spread', 240 * S],
];
const NAT_ORDER: [BuildingKind, number][] = [
  ['gas', 60 * S],
  ['defense', 120 * S],
  ['supply', 200 * S],
  ['spread', 300 * S],
];

/** Delay from winning a site to beginning its base. */
const SETTLE_MS = 60 * S;

const baseMemo = new Map<string, { bases: BaseEvt[]; builds: BuildEvt[] }>();

/** My bases and buildings on a planet (the whole planned list; filter by time). */
export function planetWorks(p: PlanetPlan): { bases: BaseEvt[]; builds: BuildEvt[] } {
  const key = `${p.seed}:${p.idx}`;
  const hit = baseMemo.get(key);
  if (hit) return hit;
  const bases: BaseEvt[] = [{ site: HOME, t0: p.landAt, lostAt: -1 }];
  const builds: BuildEvt[] = [];
  const order = p.idx === 0 ? HOME_ORDER_FIRST : HOME_ORDER_LATER;
  order.forEach(([kind, at], slot) => {
    const t0 = p.landAt + at;
    builds.push({ site: HOME, base: 0, slot, kind, t0, t1: t0 + BUILD_MS[kind] });
  });
  const addBase = (site: number, t0: number, list: [BuildingKind, number][]) => {
    const base = bases.length;
    bases.push({ site, t0, lostAt: -1 });
    const done = t0 + BUILD_MS.outpost;
    list.forEach(([kind, at], slot) => {
      const b0 = done + at;
      builds.push({ site, base, slot, kind, t0: b0, t1: b0 + BUILD_MS[kind] });
    });
  };
  addBase(NAT, natStart(p), NAT_ORDER);
  // a base on each site I take; a lost site's base is wrecked, and rebuilt when it is taken back
  const open = new Map<number, BaseEvt>();
  for (const e of p.events) {
    if (e.kind === 'grab' || e.kind === 'final') continue;
    if (e.kind === 'lose') {
      for (const s of e.sites) {
        const b = open.get(s);
        if (b) b.lostAt = e.t;
        open.delete(s);
      }
      continue;
    }
    for (const s of e.sites) {
      if (s >= SITE_COUNT) continue;
      addBase(s, e.t + SETTLE_MS, SITE_ORDER);
      open.set(s, bases[bases.length - 1]);
    }
  }
  // a lost base keeps only the buildings begun before the loss (they stand wrecked until retaken)
  const kept = builds.filter((b) => bases[b.base].lostAt < 0 || b.t0 < bases[b.base].lostAt);
  const out = { bases, builds: kept };
  if (baseMemo.size > 64) baseMemo.clear();
  baseMemo.set(key, out);
  return out;
}

const workerMemo = new Map<string, { site: number; t: number }[]>();

/** Worker arrival times on a planet (each base fills up one worker every 30 s). */
export function workerTimes(p: PlanetPlan): { site: number; t: number }[] {
  const key = `${p.seed}:${p.idx}`;
  const hit = workerMemo.get(key);
  if (hit) return hit;
  const out: { site: number; t: number }[] = [];
  if (p.idx === 0) {
    for (let i = 0; i < 4; i++) out.push({ site: HOME, t: 0 });
    out.push({ site: HOME, t: 70 * S }, { site: HOME, t: OPEN.supply }, { site: HOME, t: 200 * S }, { site: HOME, t: 300 * S });
    for (let i = 0; i < 4; i++) out.push({ site: HOME, t: 420 * S + i * 75 * S });
  } else {
    for (let i = 0; i < 8; i++) out.push({ site: HOME, t: p.landAt });
    for (let i = 0; i < 4; i++) out.push({ site: HOME, t: p.landAt + 30 * S * (i + 1) });
  }
  const { bases } = planetWorks(p);
  for (const b of bases) {
    if (b.site === HOME) continue;
    const done = b.t0 + BUILD_MS.outpost;
    const n = b.site === NAT ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const t = done + 30 * S * (i + 1);
      if (b.lostAt < 0 || t < b.lostAt) out.push({ site: b.site, t });
    }
  }
  out.sort((a, b) => a.t - b.t);
  if (workerMemo.size > 64) workerMemo.clear();
  workerMemo.set(key, out);
  return out;
}

// ---- ships ---------------------------------------------------------------------------------------

export const ESCORT_EVERY = 8 * MIN;
export const CAPITAL_FROM = 3 * H;
export const CAPITAL_EVERY = 25 * MIN;

const flagMemo = new Map<number, number>();

/** When the flagship sets out: the first offensive after 4 h 45 min with two planets held. */
export function flagshipAt(seed: number): number {
  const hit = flagMemo.get(seed);
  if (hit !== undefined) return hit;
  const list = planetsTo(seed, 6 * H);
  const t = nextOffensive(Math.max(4.75 * H, list[1].conqueredAt));
  if (flagMemo.size > 16) flagMemo.clear();
  flagMemo.set(seed, t);
  return t;
}

export function shipsAt(seed: number, A: number, lag = 0): { s1: number; s2: number; s3: number } {
  const a = A - lag;
  const c0 = planetsTo(seed, 0)[0].conqueredAt;
  const s1 = a < c0 ? 0 : 1 + Math.floor((a - c0) / ESCORT_EVERY);
  const s2 = a < CAPITAL_FROM ? 0 : 1 + Math.floor((a - CAPITAL_FROM) / CAPITAL_EVERY);
  const s3 = a >= flagshipAt(seed) ? 1 : 0;
  return { s1, s2, s3 };
}

// ---- tiers, stages, milestones -------------------------------------------------------------------

/** Highest open tier (0 none, 1–3 ground, 4 ships). */
export function tierAt(seed: number, A: number): number {
  if (shipsAt(seed, A).s1 > 0) return 4;
  if (A >= OPENS.t3) return 3;
  if (A >= OPENS.t2) return 2;
  if (A >= OPENS.t1) return 1;
  return 0;
}

export const FRONT_STAGE_NAMES = ['', '착륙', '첫 병력', '적 발견', '앞마당', '2티어', '세 기지', '3티어', '전선 돌파', '행성 장악', '성계 함대'];

const stageMemo = new Map<number, number[]>();

/** Start A of stages 1..10 (index = stage), never decreasing. */
export function stageTimes(seed: number): number[] {
  const hit = stageMemo.get(seed);
  if (hit) return hit;
  const p0 = planetsTo(seed, 7 * H)[0];
  const third = planetWorks(p0).bases.find((b) => b.site !== HOME && b.site !== NAT);
  const t = [
    0,
    0,
    OPEN.firstUnit,
    OPEN.scout + 90 * S,
    OPEN.natural + BUILD_MS.outpost,
    OPENS.t2,
    third ? third.t0 + BUILD_MS.outpost : OPEN.front,
    OPENS.t3,
    p0.breakAt >= 0 ? p0.breakAt : p0.decisiveAt,
    p0.conqueredAt,
    flagshipAt(seed),
  ];
  for (let i = 1; i < t.length; i++) t[i] = Math.max(t[i], t[i - 1]);
  if (stageMemo.size > 16) stageMemo.clear();
  stageMemo.set(seed, t);
  return t;
}

export function frontStage(seed: number, A: number): number {
  const t = stageTimes(seed);
  let s = 1;
  for (let i = 2; i < t.length; i++) if (A >= t[i]) s = i;
  return s;
}

export type FrontMilestoneId =
  | 'land'
  | 'worker'
  | 'supply'
  | 'firstUnit'
  | 'contact'
  | 'firstFight'
  | 'natural'
  | 'tier2'
  | 'firstCapture'
  | 'thirdBase'
  | 'tier3'
  | 'crystal'
  | 't3unit'
  | 'break'
  | 'shipyard'
  | 'decisive'
  | 'conquest'
  | 'escort'
  | 'orbit'
  | 'landing'
  | 'capital'
  | 'flagship'
  | 'city'
  | 'station'
  | 'fortress'
  | 'sector';

export interface FrontMilestone {
  id: FrontMilestoneId;
  A: number;
  dur: number;
  /** Planet the milestone belongs to. */
  planet: number;
}

/** Milestones tied to the schedule keep their time; the others step aside after them. */
const ANCHORED = new Set<FrontMilestoneId>(['orbit', 'landing', 'decisive', 'conquest', 'flagship']);

const msMemo = new Map<number, { upTo: number; list: FrontMilestone[] }>();

/** Milestones up to `upTo` of war (sorted, never overlapping). */
export function milestones(seed: number, upTo = 40 * H): FrontMilestone[] {
  const hit = msMemo.get(seed);
  if (hit && hit.upTo >= upTo) return hit.list;
  const span = Math.max(upTo, (hit?.upTo ?? 0) * 2, 40 * H);
  const list: FrontMilestone[] = [];
  const add = (id: FrontMilestoneId, A: number, dur: number, planet = 0) => list.push({ id, A, dur, planet });
  add('land', 0, 12 * S);
  add('worker', 70 * S, 8 * S);
  add('supply', OPEN.supply + BUILD_MS.supply, 10 * S);
  add('firstUnit', OPEN.firstUnit, 12 * S);
  add('contact', OPEN.scout + 70 * S, 16 * S);
  add('firstFight', OPEN.firstFight + 40 * S, 12 * S);
  add('natural', OPEN.natural + BUILD_MS.outpost, 12 * S);
  add('tier2', OPENS.t2, 12 * S);
  const plans = planetsTo(seed, span);
  const p0 = plans[0];
  const firstCap = p0.events.find((e) => e.to === 0 && e.kind !== 'final');
  if (firstCap) add('firstCapture', firstCap.t, 12 * S);
  add('thirdBase', stageTimes(seed)[6], 12 * S);
  add('tier3', OPENS.t3, 14 * S);
  const crystal = p0.events.find((e) => e.to === 0 && e.kind !== 'final' && e.sites.some((s) => s < SITE_COUNT && p0.crystal[s]));
  if (crystal) add('crystal', crystal.t + 40 * S, 12 * S);
  add('t3unit', OPENS.t3 + 2 * MIN, 12 * S);
  if (p0.breakAt >= 0) add('break', p0.breakAt + 20 * S, 16 * S);
  add('shipyard', 60 * MIN, 14 * S);
  for (const p of plans) {
    if (p.landAt > span) break;
    if (p.idx > 0) {
      add('orbit', p.orbitAt, 120 * S, p.idx);
      add('landing', p.landAt, 40 * S, p.idx);
    }
    add('decisive', p.decisiveAt, DECISIVE_MS, p.idx);
    add('conquest', p.conqueredAt, 30 * S, p.idx);
    if (p.idx === 0) add('escort', p.conqueredAt + 45 * S, 14 * S, 0);
    add('city', p.conqueredAt + 2 * H, 14 * S, p.idx);
    add('station', p.conqueredAt + 5 * H, 14 * S, p.idx);
    add('fortress', p.conqueredAt + 10 * H, 14 * S, p.idx);
    if (p.idx % 7 === 6) add('sector', p.conqueredAt + 40 * S, 30 * S, p.idx);
  }
  add('capital', CAPITAL_FROM, 14 * S);
  add('flagship', flagshipAt(seed), 60 * S);
  const placed = list.filter((m) => ANCHORED.has(m.id));
  for (const m of list.filter((x) => !ANCHORED.has(x.id)).sort((a, b) => a.A - b.A)) {
    for (let guard = 0; guard < 50; guard++) {
      const o = placed.find((x) => m.A < x.A + x.dur + 5 * S && m.A + m.dur + 5 * S > x.A);
      if (!o) break;
      m.A = o.A + o.dur + 5 * S;
    }
    placed.push(m);
  }
  placed.sort((a, b) => a.A - b.A);
  if (msMemo.size > 16) msMemo.clear();
  msMemo.set(seed, { upTo: span, list: placed });
  return placed;
}

/** The milestone being shown at A, if any. */
export function milestoneAt(seed: number, A: number): FrontMilestone | null {
  for (const m of milestones(seed, A + 2 * H)) {
    if (m.A > A) break;
    if (A < m.A + m.dur) return m;
  }
  return null;
}

export function nextMilestone(seed: number, A: number): FrontMilestone | null {
  for (const m of milestones(seed, A + 12 * H)) if (m.A > A) return m;
  return null;
}

/** The site fight (점령전) on view at A on the front planet, if any (the decisive battle is a milestone). */
export function captureAt(seed: number, A: number): SiteEvt | null {
  const p = frontPlanet(seed, A);
  for (const e of p.events) {
    if (e.dur <= 0 || e.kind === 'final') continue;
    if (e.t - e.dur > A) break;
    if (A < e.t + 8 * S) return e;
  }
  return null;
}

export function nextCapture(seed: number, A: number): SiteEvt | null {
  const f = frontPlanet(seed, A);
  const list = planetsTo(seed, A);
  for (let i = f.idx; i < Math.min(list.length, f.idx + 3); i++) for (const e of list[i].events) if (e.dur > 0 && e.kind !== 'final' && e.t - e.dur > A) return e;
  return null;
}

/** Site fights overlapping [a0, a1) of A on the planet fought for then. */
export function capturesIn(seed: number, a0: number, a1: number): SiteEvt[] {
  const out: SiteEvt[] = [];
  const list = planetsTo(seed, a1);
  const i0 = frontPlanet(seed, a0).idx;
  const i1 = frontPlanet(seed, a1).idx;
  for (let i = i0; i <= i1; i++) for (const e of list[i].events) if (e.dur > 0 && e.t + 8 * S > a0 && e.t - e.dur < a1) out.push(e);
  return out;
}

// ---- the ledger (display only) ------------------------------------------------------------------

export interface Stock {
  ore: number;
  heat: number;
  crystal: number;
  supply: number;
  cap: number;
}

/** The ark lands with its hold full. */
const START_ORE = 800;
const ORE_LOAD = 8;
const HEAT_LOAD = 6;
/** Developed planets send ore, heat and crystal to the front every minute. */
const DEV_INCOME = [90, 35, 0.5];
/**
 * What is left over goes into research and the fleet's upkeep: above this much in store, nearly
 * all of the surplus is spent, so the store stays in the hundreds to low thousands.
 */
const BANK = [1600, 1000, 60];
const BANK_SOFT = [900, 600, 40];

function trips(A: number, t: number, trip: number, phase: number): number {
  return A <= t + phase ? 0 : Math.floor((A - t - phase) / trip);
}

const ledgerMemo = new Map<string, { spendT: number[]; spendO: number[]; spendH: number[]; spendC: number[] }>();

/** Everything spent on the ground (prefix sums by time), for the planets planned so far. */
function spending(seed: number, A: number) {
  const plans = planetsTo(seed, A);
  const key = `${seed}:${plans.length}`;
  const hit = ledgerMemo.get(key);
  if (hit) return hit;
  const items: [number, number, number, number][] = [];
  for (const p of plans) {
    const w = planetWorks(p);
    for (const b of w.bases) if (b.site !== HOME) items.push([b.t0, ...BUILDING_COST.outpost]);
    for (const b of w.builds) items.push([b.t0, ...BUILDING_COST[b.kind]]);
    for (const x of workerTimes(p)) if (x.t > p.landAt) items.push([x.t, ...UNIT_COST.worker]);
  }
  const until = plans[plans.length - 1].conqueredAt;
  for (let i = 0; armyArrival(i) <= until && i < 20_000; i++) {
    const t = armyArrival(i);
    const sh = armyShares(t);
    let o = 0;
    let hh = 0;
    for (const k of ARMY_KINDS) {
      o += sh[k] * UNIT_COST[k][0];
      hh += sh[k] * UNIT_COST[k][1];
    }
    items.push([t, Math.round(o), Math.round(hh), 0]);
  }
  items.sort((a, b) => a[0] - b[0]);
  const spendT: number[] = [];
  const spendO: number[] = [];
  const spendH: number[] = [];
  const spendC: number[] = [];
  let o = 0;
  let hh = 0;
  let c = 0;
  for (const [t, a, b, d] of items) {
    o += a;
    hh += b;
    c += d;
    spendT.push(t);
    spendO.push(o);
    spendH.push(hh);
    spendC.push(c);
  }
  const out = { spendT, spendO, spendH, spendC };
  if (ledgerMemo.size > 16) ledgerMemo.clear();
  ledgerMemo.set(key, out);
  return out;
}

function spentAt(seed: number, A: number): [number, number, number] {
  const s = spending(seed, A);
  let lo = 0;
  let hi = s.spendT.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.spendT[mid] <= A) lo = mid + 1;
    else hi = mid;
  }
  let o = lo > 0 ? s.spendO[lo - 1] : 0;
  let h = lo > 0 ? s.spendH[lo - 1] : 0;
  let c = lo > 0 ? s.spendC[lo - 1] : 0;
  const sh = shipsAt(seed, A);
  o += sh.s1 * UNIT_COST.s1[0] + sh.s2 * UNIT_COST.s2[0] + sh.s3 * UNIT_COST.s3[0];
  h += sh.s1 * UNIT_COST.s1[1] + sh.s2 * UNIT_COST.s2[1] + sh.s3 * UNIT_COST.s3[1];
  c += sh.s1 * UNIT_COST.s1[2] + sh.s2 * UNIT_COST.s2[2] + sh.s3 * UNIT_COST.s3[2];
  return [o, h, c];
}

const minedMemo = new Map<string, [number, number, number]>();

/** Ore, heat and crystal mined by A (all planets), plus the developed planets' supply. */
function minedAt(seed: number, A: number): [number, number, number] {
  let ore = START_ORE;
  let heat = 0;
  let crystal = 0;
  const front = frontPlanet(seed, A);
  const list = planetsTo(seed, A);
  for (let i = 0; i <= front.idx; i++) {
    const p = list[i];
    if (p.conqueredAt <= A) {
      // a held planet's own mining is fixed: computed once
      const key = `${p.seed}:${p.idx}`;
      let full = minedMemo.get(key);
      if (!full) {
        full = minedOn(p, p.conqueredAt);
        if (minedMemo.size > 8192) minedMemo.clear();
        minedMemo.set(key, full);
      }
      const m = (A - p.conqueredAt) / MIN;
      ore += full[0] + m * DEV_INCOME[0];
      heat += full[1] + m * DEV_INCOME[1];
      crystal += full[2] + m * DEV_INCOME[2];
    } else {
      const part = minedOn(p, A);
      ore += part[0];
      heat += part[1];
      crystal += part[2];
    }
  }
  return [Math.floor(ore), Math.floor(heat), Math.floor(crystal)];
}

/** What a planet's workers and crystal sites yield up to `endRaw`. */
function minedOn(p: PlanetPlan, endRaw: number): [number, number, number] {
  let ore = 0;
  let heat = 0;
  let crystal = 0;
  const end = Math.min(endRaw, p.conqueredAt);
  const ws = workerTimes(p);
  const gasDone = new Map<number, number>();
  for (const b of planetWorks(p).builds) if (b.kind === 'gas' && !gasDone.has(b.site)) gasDone.set(b.site, b.t1);
  const perBase = new Map<number, number>();
  for (let j = 0; j < ws.length; j++) {
    const w = ws[j];
    if (w.t > end) break;
    const trip = Math.round(lerp(24, 30, u01(p.seed, 60, j)) * S);
    const phase = Math.round(u01(p.seed, 61, j) * trip);
    const k = perBase.get(w.site) ?? 0;
    perBase.set(w.site, k + 1);
    const g = gasDone.get(w.site);
    // three workers of each base go to its heat vent once its plant stands
    if (k < 3 && g !== undefined && end > g) {
      ore += trips(Math.min(end, g), w.t, trip, phase) * ORE_LOAD;
      heat += trips(end, Math.max(w.t, g), trip, phase) * HEAT_LOAD;
    } else ore += trips(end, w.t, trip, phase) * ORE_LOAD;
  }
  // crystal sites held
  const own: number[] = Array(SITE_COUNT).fill(-1);
  for (const e of p.events) {
    if (e.t > end) break;
    for (const s of e.sites) {
      if (s >= SITE_COUNT || !p.crystal[s]) continue;
      if (e.to === 0 && own[s] < 0) own[s] = e.t;
      else if (e.to !== 0 && own[s] >= 0) {
        crystal += (e.t - own[s]) / MIN;
        own[s] = -1;
      }
    }
  }
  for (let s = 0; s < SITE_COUNT; s++) if (own[s] >= 0) crystal += (end - own[s]) / MIN;
  return [ore, heat, crystal];
}

export function stockAt(seed: number, A: number): Stock {
  const [o, h, c] = minedAt(seed, A);
  const [so, sh, sc] = spentAt(seed, A);
  const p = frontPlanet(seed, A);
  const works = planetWorks(p);
  let cap = 10;
  for (const b of works.builds) if (b.kind === 'supply' && b.t1 <= A && (works.bases[b.base].lostAt < 0 || works.bases[b.base].lostAt > A)) cap += 8;
  for (const b of works.bases) if (b.site !== HOME && b.t0 + BUILD_MS.outpost <= A && (b.lostAt < 0 || b.lostAt > A)) cap += 6;
  const mix = armyMix(A);
  let supply = 0;
  for (const k of ARMY_KINDS) supply += mix[k] * SUPPLY[k];
  const bank = (raw: number, k: number) => (raw <= BANK[k] ? raw : BANK[k] + BANK_SOFT[k] * Math.log1p((raw - BANK[k]) / BANK_SOFT[k]));
  return { ore: Math.floor(bank(o - so, 0)), heat: Math.floor(bank(h - sh, 1)), crystal: Math.floor(bank(c - sc, 2)), supply, cap: Math.max(cap, supply + 2) };
}

// ---- the view at A --------------------------------------------------------------------------------

export interface BaseState {
  /** Index in planetWorks().bases. */
  i: number;
  site: number;
  lostAt: number;
  /** Construction 0..1 of the base's main building. */
  u: number;
  /** Seconds since it was finished (−1 while building). */
  age: number;
  lost: boolean;
}

export interface BuildState extends BuildEvt {
  u: number;
}

export interface DevelopedPlanet {
  idx: number;
  biome: BiomeId;
  conqueredAt: number;
  level: number;
}

export interface FrontView {
  A: number;
  seed: number;
  race: RaceId;
  stage: number;
  tier: number;
  upgrades: number;
  tide: TidePhase;
  planet: PlanetPlan;
  /** The planet whose orbit is being fought for (the view is in orbit then), if any. */
  orbit: PlanetPlan | null;
  beat: OpenBeat | null;
  reland: RelandBeat | null;
  owners: Owner[];
  /** When each site last changed hands (−1 never). */
  since: number[];
  share: number;
  bases: BaseState[];
  builds: BuildState[];
  workers: { site: number; t: number }[];
  army: Record<ArmyKind, number>;
  armyN: number;
  rivals: [Record<ArmyKind, number>, Record<ArmyKind, number>];
  rivalRaces: [RaceId, RaceId];
  ships: { s1: number; s2: number; s3: number };
  rivalShips: { s1: number; s2: number; s3: number };
  /** The most recent developed planets (up to twelve) and how many are held in all. */
  developed: DevelopedPlanet[];
  held: number;
  stock: Stock;
  /** The site fight on view, if any. */
  capture: SiteEvt | null;
}

/** The rivals' tiers trail mine by 12–18 minutes. */
export const rivalLag = (seed: number) => Math.round((12 + 6 * u01(seed, 0x1a9)) * MIN);

/** The people on the left and on the right of the map (the two I do not command). */
export function rivalsOf(seed: number, race: RaceId): [RaceId, RaceId] {
  const others = ([0, 1, 2] as RaceId[]).filter((r) => r !== race);
  return u01(seed, 0x2c1) < 0.5 ? [others[0], others[1]] : [others[1], others[0]];
}

const viewMemo = { key: '', v: null as FrontView | null };

export function frontAt(seed: number, race: RaceId, Araw: number): FrontView {
  const A = Math.max(0, Math.floor(Araw));
  const key = `${seed}:${race}:${A}`;
  if (viewMemo.key === key && viewMemo.v) return viewMemo.v;
  const planet = frontPlanet(seed, A);
  const owners = ownersAt(planet, A);
  const since: number[] = Array(ALL_SITES).fill(-1);
  for (const e of planet.events) {
    if (e.t > A) break;
    for (const s of e.sites) since[s] = e.t;
  }
  since[NAT] = A >= natStart(planet) ? natStart(planet) : -1;
  const works = planetWorks(planet);
  const bases: BaseState[] = [];
  works.bases.forEach((b, i) => {
    if (b.t0 > A) return;
    const done = b.t0 + (b.site === HOME ? 0 : BUILD_MS.outpost);
    const lost = b.lostAt >= 0 && A >= b.lostAt;
    bases.push({ i, site: b.site, lostAt: b.lostAt, u: b.site === HOME ? 1 : Math.min(1, (A - b.t0) / BUILD_MS.outpost), age: A >= done ? (A - done) / S : -1, lost });
  });
  const builds: BuildState[] = works.builds.filter((b) => b.t0 <= A).map((b) => ({ ...b, u: Math.min(1, (A - b.t0) / (b.t1 - b.t0)) }));
  const lag = rivalLag(seed);
  // developed planets: the count, and the most recent twelve in full
  const held = heldCount(seed, A);
  const plist = planetsTo(seed, A);
  const developed: DevelopedPlanet[] = [];
  for (let i = Math.max(0, held - 12); i < held; i++) {
    const p = plist[i];
    developed.push({ idx: p.idx, biome: p.biome, conqueredAt: p.conqueredAt, level: devLevel(A - p.conqueredAt) });
  }
  const v: FrontView = {
    A,
    seed,
    race,
    stage: frontStage(seed, A),
    tier: tierAt(seed, A),
    upgrades: upgradesAt(A),
    tide: tidePhase(A),
    planet,
    orbit: orbitPlanet(seed, A),
    beat: planet.idx === 0 ? openBeat(A) : null,
    reland: relandBeat(planet, A),
    owners,
    since,
    share: A >= planet.conqueredAt ? 1 : shareOf(owners),
    bases,
    builds,
    workers: workerTimes(planet).filter((w) => w.t <= A),
    army: armyMix(A),
    armyN: armySize(A),
    rivals: [armyMix(A, lag, 0.7), armyMix(A, lag, 0.65)],
    rivalRaces: rivalsOf(seed, race),
    ships: shipsAt(seed, A),
    rivalShips: shipsAt(seed, A, lag),
    developed,
    held,
    stock: stockAt(seed, A),
    capture: captureAt(seed, A),
  };
  viewMemo.key = key;
  viewMemo.v = v;
  return v;
}

// ---- the runner's state ---------------------------------------------------------------------------

/** The state the runner keeps: everything else is computed from (seed, race, A). */
export interface FrontSim {
  v: number;
  seed: number;
  race: RaceId;
  origin: number;
  /** War time A it reflects. */
  t: number;
  /** Buildings finished by then (for generic counters). */
  done: number;
}

export function initFront(seed: number, race: RaceId, base?: SimBase): FrontSim {
  return { v: FRONT_SIM_VERSION, seed, race, origin: base?.W ?? 0, t: 0, done: 0 };
}

export function cloneFront(s: FrontSim): FrontSim {
  return { ...s };
}

const builtMemo = new Map<number, number[]>();

/** Buildings finished by A (all planets; earlier planets are counted once and kept). */
export function buildingsDone(seed: number, A: number): number {
  const f = frontPlanet(seed, A);
  const list = planetsTo(seed, A);
  let prefix = builtMemo.get(seed);
  if (!prefix) {
    if (builtMemo.size > 16) builtMemo.clear();
    prefix = [0];
    builtMemo.set(seed, prefix);
  }
  while (prefix.length <= f.idx) {
    const i = prefix.length - 1;
    prefix.push(prefix[i] + planetWorks(list[i]).builds.length);
  }
  let done = prefix[f.idx];
  for (const b of planetWorks(f).builds) if (b.t1 <= A) done++;
  return done;
}

/** Moves the state to war time A; returns how many buildings were finished on the way (dev info). */
export function advanceFront(s: FrontSim, A: number): number {
  const a = Math.max(0, A);
  if (a === s.t) return 0;
  const before = s.done;
  s.t = a;
  s.done = buildingsDone(s.seed, a);
  return Math.abs(s.done - before);
}

export const frontAge = (W: number, origin: number) => Math.max(0, W - origin);
export const viewOf = (s: FrontSim) => frontAt(s.seed, s.race, s.t);
