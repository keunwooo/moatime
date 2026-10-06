/**
 * The front theme's world layer: the war tide's look, the battles paced to the focus sessions,
 * which planet and stage each battle is on (and so whether the view moves there), the rare sights,
 * the headline on view and the operation each session leaves on record. Pure functions of
 * (seed, origin, A) and the session segments; none of it changes what the war builds
 * (sim/front.ts never reads this module).
 *
 * Times: A is the war's time (W − origin). Rare sights sit on blocks of A; battles are placed on
 * world time W (sessions are recorded in W) and converted.
 */

import { hash32 } from '../core/rng';
import {
  capturesIn,
  DECISIVE_MS,
  flagshipAt,
  frontPlanet,
  frontStage,
  heldCount,
  milestones,
  OPEN,
  orbitPlanet,
  planetsTo,
  RELAND,
  shareOf,
  ownersAt,
  tideIndex,
  type SiteEvt,
} from '../sim/front';
import { devLevel, TIDE_PHASE_MS, TIDE_PHASES, armySize, type TidePhase } from '../sim/frontPlan';
import type { PaceSeg } from './pace';
import { BLOCK_MS, eventOfBlock, PRIORITY, type EventDef, type WorldEvent } from './timeline';

const S = 1000;
const MIN = 60_000;
const H = 3_600_000;
const u01 = (...xs: number[]) => hash32(...xs) / 4294967296;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

// ---- the war tide's look ----------------------------------------------------------------------------

export interface Tide {
  phase: TidePhase;
  /** Progress through the phase (0..1). */
  p: number;
  /** Continuous intensities (0..1): busy building, marching to the front, the planet's storm. */
  bustle: number;
  march: number;
  storm: number;
}

const LOOK: Record<Exclude<TidePhase, 'open'>, [number, number, number]> = {
  refit: [1, 0.1, 0],
  muster: [0.6, 0.45, 0],
  offensive: [0.2, 1, 0],
  storm: [0.15, 0, 1],
};

/** The tide at A, blended over 75 s each side of a phase boundary (the decisive battle marches). */
export function tideAt(seed: number, A: number): Tide {
  const i = tideIndex(A);
  if (i < 0) return { phase: 'open', p: A / OPEN.end, bustle: 1, march: 0, storm: 0 };
  const into = (A - OPEN.end) % TIDE_PHASE_MS;
  const phase = TIDE_PHASES[i];
  const blend = 75 * S;
  let w: [number, number, number] = [...LOOK[phase]] as [number, number, number];
  const mixWith = (other: Exclude<TidePhase, 'open'>, k: number) => {
    const o = LOOK[other];
    w = [lerp(w[0], o[0], k), lerp(w[1], o[1], k), lerp(w[2], o[2], k)];
  };
  // across a boundary the weight of the later phase rises smoothly from 0 to 1 over ±75 s
  if (into < blend && A - OPEN.end >= TIDE_PHASE_MS) mixWith(TIDE_PHASES[(i + 3) % 4], 1 - smooth((into + blend) / (2 * blend)));
  else if (TIDE_PHASE_MS - into < blend) mixWith(TIDE_PHASES[(i + 1) % 4], smooth((blend - (TIDE_PHASE_MS - into)) / (2 * blend)));
  // the decisive battle marches whatever the phase (eased in and out over a minute)
  const p = frontPlanet(seed, A);
  const d = smooth((A - p.decisiveAt + 60 * S) / (60 * S)) * (1 - smooth((A - p.conqueredAt) / (60 * S)));
  if (d > 0) w = [lerp(w[0], 0.1, d), lerp(w[1], 1, d), lerp(w[2], w[2] * 0.3, d)];
  return { phase, p: into / TIDE_PHASE_MS, bustle: w[0], march: w[1], storm: w[2] };
}

// ---- battle grades ------------------------------------------------------------------------------

/** When each of the seven grades of battle opens (A). */
export function gradeOpens(seed: number): number[] {
  const list = planetsTo(seed, 8 * H);
  return [0, 4 * MIN, 15 * MIN, 45 * MIN, 60 * MIN, list[0].conqueredAt, list[1].orbitAt, flagshipAt(seed)];
}

export const GRADE_NAME = ['', '소규모 교전', '국지전과 견제', '제병 협동', '공성', '궤도 지원전', '궤도전', '함대 결전'];

export type BattleKind =
  | 'scout'
  | 'harass'
  | 'drop'
  | 'skirmish'
  | 'air'
  | 'siege'
  | 'clash'
  | 'support'
  | 'pods'
  | 'orbit'
  | 'fleet'
  | 'descend'
  | 'defend'
  | 'raid'
  | 'rivals'
  | 'stormRaid'
  | 'supplyDrop'
  | 'shadow';

export interface BattleDef {
  kind: BattleKind;
  grade: number;
  stage: 'ground' | 'orbit';
  dur: [number, number];
  w: number;
}

export const BATTLES: BattleDef[] = [
  { kind: 'scout', grade: 1, stage: 'ground', dur: [40, 60], w: 2 },
  { kind: 'harass', grade: 2, stage: 'ground', dur: [50, 70], w: 2 },
  { kind: 'drop', grade: 2, stage: 'ground', dur: [60, 90], w: 2 },
  { kind: 'skirmish', grade: 2, stage: 'ground', dur: [60, 90], w: 3 },
  { kind: 'air', grade: 3, stage: 'ground', dur: [50, 80], w: 2 },
  { kind: 'skirmish', grade: 3, stage: 'ground', dur: [70, 100], w: 2 },
  { kind: 'siege', grade: 4, stage: 'ground', dur: [90, 120], w: 2 },
  { kind: 'clash', grade: 4, stage: 'ground', dur: [90, 120], w: 2 },
  { kind: 'support', grade: 5, stage: 'ground', dur: [60, 90], w: 2 },
  { kind: 'pods', grade: 5, stage: 'ground', dur: [50, 70], w: 2 },
  { kind: 'orbit', grade: 6, stage: 'orbit', dur: [80, 120], w: 3 },
  { kind: 'fleet', grade: 7, stage: 'orbit', dur: [120, 150], w: 2 },
  { kind: 'descend', grade: 7, stage: 'ground', dur: [90, 90], w: 1 },
];

/** Storm-phase stand-ins for ground battles. */
const STORM: BattleDef[] = [
  { kind: 'stormRaid', grade: 1, stage: 'ground', dur: [40, 60], w: 2 },
  { kind: 'supplyDrop', grade: 1, stage: 'ground', dur: [40, 55], w: 1 },
  { kind: 'shadow', grade: 1, stage: 'ground', dur: [50, 70], w: 1 },
];

export interface Battle extends WorldEvent {
  kind: BattleKind;
  grade: number;
  stage: 'ground' | 'orbit';
  /** Planet the battle is on (another than the front planet: the view moves there). */
  planet: number;
  away: boolean;
  enemy: 1 | 2;
  big: boolean;
}

export const BATTLE_PACE = {
  minLenMs: 2 * MIN,
  earliestMs: 30 * S,
  firstFrac: [0.25, 0.45] as [number, number],
  firstCapMs: [90 * S, 210 * S] as [number, number],
  openFirstMs: [90 * S, 180 * S] as [number, number],
  gapMs: [4 * MIN, 6.5 * MIN] as [number, number],
  minGapMs: 3.5 * MIN,
  minDurMs: 40 * S,
  /**
   * Battles on another planet: a candidate is sent elsewhere with this chance, but never two in a
   * row and at most two in 15 min, so about one battle in three to four ends up elsewhere.
   */
  awayShare: 0.5,
  awayWindowMs: 15 * MIN,
  awayMax: 2,
  /** Developed planets needed before battles happen elsewhere. */
  awayFrom: 2,
};

/** Grade picked among the open ones: the newest 40%, the one below 30%, the rest share 30%. */
export function pickGrade(open: number, x: number, avoid = -1): number {
  if (open <= 1) return 1;
  const w: number[] = [];
  for (let g = 1; g <= open; g++) {
    const rest = open - 2;
    w[g] = g === open ? 0.4 : g === open - 1 ? 0.3 : 0.3 / Math.max(1, rest);
    if (g === avoid) w[g] = 0;
  }
  const sum = w.reduce((a, b) => a + (b || 0), 0);
  let t = x * sum;
  for (let g = 1; g <= open; g++) {
    t -= w[g] || 0;
    if (t < 0) return g;
  }
  return open;
}

/** Highest grade open at A. */
export function gradeAt(seed: number, A: number): number {
  const o = gradeOpens(seed);
  let g = 1;
  for (let i = 1; i < o.length; i++) if (A >= o[i]) g = i;
  return g;
}

function segEnd(segs: readonly PaceSeg[], i: number): number {
  const s = segs[i];
  if (s.w1 !== null) return s.w1;
  if (i + 1 < segs.length) return segs[i + 1].w0;
  return Infinity;
}

/** Milestones, site fights and rare sights overlapping [a0, a1) of A: the end of the last of them. */
function busyUntil(seed: number, a0: number, a1: number): number {
  let until = -1;
  for (const m of milestones(seed, a1 + 2 * H)) {
    if (m.A - 20 * S < a1 && m.A + m.dur + 20 * S > a0) until = Math.max(until, m.A + m.dur + 20 * S);
    if (m.A > a1 + H) break;
  }
  for (const e of capturesIn(seed, a0 - 4 * MIN, a1 + 4 * MIN)) {
    if (e.kind === 'final') continue;
    // a site fight with 90 s of room on either side
    if (e.t - e.dur - 90 * S < a1 && e.t + 90 * S > a0) until = Math.max(until, e.t + 90 * S);
  }
  const r = rareIn(seed, a0 - 20 * S, a1 + 20 * S);
  if (r) until = Math.max(until, r.t1 + 20 * S);
  // always forward (a window that has already closed is not in the way)
  return until > a0 ? until : -1;
}

/** Windows without session battles: the openings (they are their own show). */
function inOpening(seed: number, A: number): number {
  if (A < OPEN.end) return OPEN.end;
  const p = frontPlanet(seed, A);
  if (p.idx > 0 && A < p.landAt + RELAND.end) return p.landAt + RELAND.end;
  return -1;
}

function pickDef(pool: BattleDef[], x: number): BattleDef {
  let t = x * pool.reduce((a, d) => a + d.w, 0);
  for (const d of pool) {
    t -= d.w;
    if (t < 0) return d;
  }
  return pool[pool.length - 1];
}

const battleMemo = new WeakMap<readonly PaceSeg[], Map<string, Battle[]>>();

/**
 * Battles for the sessions (world time W): every 4–6½ minutes of a session, the first within its
 * first few minutes, so a 5-minute countdown sees one and a 25-minute one four or five. Never in an
 * opening, never in a session under two minutes, always ending before the session does, and clear
 * of milestones, site fights and rare sights. Presentation only.
 */
export function frontBattles(seed: number, origin: number, segs: readonly PaceSeg[]): Battle[] {
  let m = battleMemo.get(segs);
  if (!m) {
    m = new Map();
    battleMemo.set(segs, m);
  }
  const key = `${seed}:${origin}`;
  const hit = m.get(key);
  if (hit) return hit;
  const out: Battle[] = [];
  let last = -Infinity;
  let lastKind = '';
  let lastGrade = -1;
  let gradeRun = 0;
  let lastAway = false;
  let lastAwayPlanet = -1;
  let count = 0;
  const awayTimes: number[] = [];
  /** A slot sent elsewhere stays elsewhere while it steps aside for the front planet's headlines. */
  let sticky: boolean | null = null;
  let stickyTries = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.raid !== undefined) continue;
    if (s.len !== null && s.len < BATTLE_PACE.minLenMs) continue;
    const segClose = Math.min(segEnd(segs, i), s.len === null ? s.w0 + 12 * H : s.w0 + s.len);
    if (segClose <= origin) continue;
    const len = s.len ?? segClose - s.w0;
    const margin = Math.min(60 * S, len * 0.15);
    const latestEnd = segClose - margin;
    const k0 = Math.floor(s.w0);
    let t: number;
    if (s.len === null) t = s.w0 + Math.round(lerp(BATTLE_PACE.openFirstMs[0], BATTLE_PACE.openFirstMs[1], u01(seed, k0, 811)));
    else {
      const cap = lerp(BATTLE_PACE.firstCapMs[0], BATTLE_PACE.firstCapMs[1], u01(seed, k0, 812));
      const frac = lerp(BATTLE_PACE.firstFrac[0], BATTLE_PACE.firstFrac[1], u01(seed, k0, 813));
      t = s.w0 + Math.round(Math.max(BATTLE_PACE.earliestMs, Math.min(s.len * frac, cap)));
      t = Math.min(t, latestEnd - BATTLE_PACE.minDurMs);
    }
    t = Math.max(t, s.w0 + Math.min(BATTLE_PACE.earliestMs, len * 0.2), origin);
    let n = 0;
    while (t + BATTLE_PACE.minDurMs <= latestEnd && out.length < 200_000) {
      if (t < last + BATTLE_PACE.minGapMs) t = last + BATTLE_PACE.minGapMs;
      const A = t - origin;
      const op = inOpening(seed, A);
      if (op >= 0) {
        t = origin + op;
        n++;
        if (n > 60) break;
        continue;
      }
      const open = gradeAt(seed, A);
      const orbitP = orbitPlanet(seed, A);
      const front = frontPlanet(seed, A);
      const held = heldCount(seed, A);
      // another planet? (only once two are held, never twice running, at most two in 15 minutes)
      const recentAway = awayTimes.filter((x) => x > t - BATTLE_PACE.awayWindowMs).length;
      const canAway: boolean = !orbitP && held >= BATTLE_PACE.awayFrom && !lastAway && recentAway < BATTLE_PACE.awayMax;
      if (sticky === null) sticky = u01(seed, k0, 814, n) < BATTLE_PACE.awayShare;
      const away: boolean = canAway && sticky;
      let planet = orbitP ? orbitP.idx : front.idx;
      let def: BattleDef;
      let grade: number;
      if (away) {
        const cands: number[] = [];
        for (let j = 0; j < held; j++) if (j !== lastAwayPlanet) cands.push(j);
        // the more recent planets are fought over more often
        planet = cands[Math.min(cands.length - 1, Math.floor(Math.pow(u01(seed, k0, 815, n), 0.6) * cands.length))];
        const list = planetsTo(seed, A);
        const lvl = devLevel(A - list[planet].conqueredAt);
        const orbitShare = [0.2, 0.4, 0.6, 0.7][lvl];
        // in orbit unless the last two battles were of the orbit grade already
        const inOrbit = u01(seed, k0, 816, n) < orbitShare && !(gradeRun >= 2 && lastGrade >= 6);
        grade = inOrbit ? Math.max(6, Math.min(open, 7)) : pickGrade(Math.min(open, 5), u01(seed, k0, 817, n), gradeRun >= 2 ? lastGrade : -1);
        def = { kind: inOrbit ? 'raid' : u01(seed, k0, 818, n) < 0.25 ? 'rivals' : 'defend', grade, stage: inOrbit ? 'orbit' : 'ground', dur: [80, 120], w: 1 };
      } else if (orbitP) {
        // the orbit being won before a landing: battles there are in orbit
        grade = Math.max(6, Math.min(open, 7));
        def = pickDef(BATTLES.filter((d) => d.stage === 'orbit' && d.grade <= open), u01(seed, k0, 819, n));
      } else {
        grade = pickGrade(open, u01(seed, k0, 820, n), gradeRun >= 2 ? lastGrade : -1);
        let pool = BATTLES.filter((d) => d.grade === grade && d.kind !== lastKind);
        if (!pool.length) pool = BATTLES.filter((d) => d.grade === grade);
        def = pickDef(pool, u01(seed, k0, 821, n));
        // in the storm, ground battles give way to the storm's own sights
        if (def.stage === 'ground' && tideIndex(A) === 3) {
          def = pickDef(STORM.filter((d) => d.kind !== lastKind), u01(seed, k0, 822, n));
          grade = 1;
        }
      }
      const want = Math.round(lerp(def.dur[0], def.dur[1], u01(seed, k0, 823, n)) * S);
      const dur = Math.min(want, latestEnd - t);
      if (dur < BATTLE_PACE.minDurMs) break;
      // step aside for a milestone, a site fight or a rare sight on the front planet (a battle
      // elsewhere too: the view must be home for those)
      const busy = busyUntil(seed, A, A + dur);
      if (busy >= 0) {
        t = origin + busy;
        n++;
        // a slot sent elsewhere keeps its stage for one step aside, then rolls again
        stickyTries++;
        if (stickyTries > 1) sticky = null;
        if (n > 60) break;
        continue;
      }
      const enemy: 1 | 2 = u01(seed, k0, 824, n) < 0.5 ? 1 : 2;
      out.push({
        kind: def.kind,
        prio: PRIORITY.AMBIENT,
        t0: t,
        t1: t + dur,
        seed: hash32(seed, k0, 825, n) >>> 0,
        grade,
        stage: def.stage,
        planet: away ? planet : orbitP ? orbitP.idx : front.idx,
        away,
        enemy,
        big: count % 3 === 2 && grade >= 2,
      });
      if (away) {
        awayTimes.push(t);
        lastAwayPlanet = planet;
      }
      sticky = null;
      stickyTries = 0;
      lastAway = away;
      gradeRun = grade === lastGrade ? gradeRun + 1 : 1;
      lastGrade = grade;
      last = t;
      lastKind = def.kind;
      count++;
      n++;
      t += Math.round(lerp(BATTLE_PACE.gapMs[0], BATTLE_PACE.gapMs[1], u01(seed, k0, 826, n)));
      if (!Number.isFinite(segEnd(segs, i)) && t > s.w0 + 12 * H) break;
    }
  }
  out.sort((a, b) => a.t0 - b.t0);
  if (m.size > 8) m.clear();
  m.set(key, out);
  return out;
}

/** Dev only: battles called up by hand (world time W). */
const devBattles: Battle[] = [];
export function devCallBattle(W: number, origin: number, seed: number, opts: { grade?: number; away?: boolean } = {}) {
  const A = W - origin;
  const open = gradeAt(seed, A);
  const grade = Math.max(1, Math.min(7, opts.grade ?? open));
  const pool = BATTLES.filter((d) => d.grade === grade);
  const def = pool[devBattles.length % pool.length] ?? BATTLES[0];
  const held = heldCount(seed, A);
  const away = !!opts.away && held >= 1;
  const planet = away ? Math.max(0, held - 1 - (devBattles.length % Math.max(1, held))) : frontPlanet(seed, A).idx;
  devBattles.push({
    kind: away ? (def.stage === 'orbit' ? 'raid' : 'defend') : def.kind,
    prio: PRIORITY.AMBIENT,
    t0: W,
    t1: W + def.dur[1] * S,
    seed: hash32(seed, devBattles.length, 829) >>> 0,
    grade,
    stage: def.stage,
    planet,
    away,
    enemy: devBattles.length % 2 === 0 ? 1 : 2,
    big: grade >= 4,
  });
}

// ---- rare sights (blocks of A) ------------------------------------------------------------------

const after = (A0: number) => (c: { W: number; seed: number }) => c.W >= A0 && c.W >= OPEN.end + 5 * MIN && !inQuiet(c.seed, c.W);

/** The decisive battle and the landings keep the stage to themselves. */
function inQuiet(seed: number, A: number): boolean {
  const p = frontPlanet(seed, A);
  if (A >= p.decisiveAt - 5 * MIN && A < p.conqueredAt + 2 * MIN) return true;
  if (orbitPlanet(seed, A) || orbitPlanet(seed, A + 5 * MIN)) return true;
  return p.idx > 0 && A < p.landAt + RELAND.end + 3 * MIN;
}

export const FRONT_DEFS: EventDef[] = [
  { kind: 'supplyPod', theme: 'front', prio: PRIORITY.RARE, grid: 3, chance: 0.5, durMs: [40 * S, 55 * S], eligible: after(0) },
  { kind: 'eclipse', theme: 'front', prio: PRIORITY.RARE, grid: 4, chance: 0.5, durMs: [150 * S, 200 * S], eligible: after(30 * MIN) },
  { kind: 'meteor', theme: 'front', prio: PRIORITY.RARE, grid: 4, chance: 0.45, durMs: [60 * S, 80 * S], eligible: after(30 * MIN) },
  { kind: 'whale', theme: 'front', prio: PRIORITY.RARE, grid: 4, chance: 0.5, durMs: [110 * S, 150 * S], eligible: after(45 * MIN) },
  { kind: 'parade', theme: 'front', prio: PRIORITY.RARE, grid: 4, chance: 0.45, durMs: [70 * S, 90 * S], eligible: after(90 * MIN) },
  { kind: 'gate', theme: 'front', prio: PRIORITY.RARE, grid: 5, chance: 0.45, durMs: [60 * S, 75 * S], eligible: after(2 * H) },
  { kind: 'grandFleet', theme: 'front', prio: PRIORITY.RARE, grid: 6, chance: 0.5, durMs: [45 * S, 60 * S], eligible: after(5 * H) },
];

/** The rare sight of A's block, if it is running at A. */
export function frontRareAt(seed: number, A: number): WorldEvent | null {
  const e = eventOfBlock(FRONT_DEFS, 'front', seed, Math.floor(A / BLOCK_MS));
  return e && A >= e.t0 && A < e.t1 ? e : null;
}

function rareIn(seed: number, a0: number, a1: number): WorldEvent | null {
  for (let b = Math.floor(Math.max(0, a0) / BLOCK_MS); b <= Math.floor(Math.max(0, a1) / BLOCK_MS); b++) {
    const e = eventOfBlock(FRONT_DEFS, 'front', seed, b);
    if (e && e.t1 > a0 && e.t0 < a1) return e;
  }
  return null;
}

// ---- the headline on view ------------------------------------------------------------------------

/** A site fight as a headline (`cap:<kind>`, times in A; it runs until 8 s after the flip). */
export function captureHeadline(e: SiteEvt, seed: number): WorldEvent {
  return { kind: `cap:${e.kind}`, prio: PRIORITY.COMBAT, t0: e.t - e.dur, t1: e.t + 8 * S, seed: hash32(seed, e.t, 830) >>> 0 };
}

/**
 * The headline at W: a milestone, then a site fight, then a rare sight, then a session battle.
 * Times of the returned event are in W. Milestone kinds are prefixed `ms:`, site fights `cap:`.
 */
export function frontHeadlineAt(seed: number, origin: number, W: number, segs: readonly PaceSeg[]): WorldEvent | null {
  const A = W - origin;
  if (A < 0) return null;
  for (const m of milestones(seed, A + 2 * H)) {
    if (m.A > A) break;
    if (A < m.A + m.dur) return { kind: `ms:${m.id}`, prio: PRIORITY.RARE, t0: origin + m.A, t1: origin + m.A + m.dur, seed: hash32(seed, m.A, 831) >>> 0 };
  }
  for (const e of capturesIn(seed, A, A + 1)) {
    if (e.kind === 'final') continue;
    if (A >= e.t - e.dur && A < e.t + 8 * S) {
      const h = captureHeadline(e, seed);
      return { ...h, t0: origin + h.t0, t1: origin + h.t1 };
    }
  }
  const r = frontRareAt(seed, A);
  if (r) return { ...r, t0: origin + r.t0, t1: origin + r.t1 };
  for (const d of devBattles) if (W >= d.t0 && W < d.t1) return d;
  for (const b of frontBattles(seed, origin, segs)) {
    if (b.t0 > W) break;
    if (W < b.t1) return b;
  }
  return null;
}

/** The site fight running at W (for the scene), with its event. */
export function isBattle(e: WorldEvent | null): e is Battle {
  return !!e && typeof (e as Battle).grade === 'number';
}

// ---- operations (one per session) -----------------------------------------------------------------

const OP_ADJ = [
  '새벽', '조용한', '접힌', '늦은', '푸른', '붉은', '작은', '먼', '깊은', '느린', '빠른', '낮은', '높은', '긴', '짧은', '굳은',
  '따뜻한', '차가운', '흰', '검은', '은빛', '금빛', '젖은', '마른', '오래된', '새', '빈', '가득한', '잠든', '깨어난', '숨은', '비밀의',
  '첫', '마지막', '둥근', '모난', '곧은', '굽은', '고요한', '시끄러운', '단단한', '부드러운', '밝은', '어두운', '맑은', '흐린', '바람의', '별의',
];
const OP_NOUN = [
  '망치', '등불', '지도', '우체통', '나침반', '닻', '방패', '깃발', '열쇠', '창문', '다리', '등대', '모래시계', '종', '바늘', '실타래',
  '주전자', '연필', '안경', '우산', '사다리', '벽돌', '시계탑', '항아리', '수레', '돛', '그물', '화살', '모자', '장갑', '편지', '도장',
  '거울', '바퀴', '촛대', '사슬', '자물쇠', '부싯돌', '물레', '피리', '북', '창', '방울', '꽃병', '책갈피', '단추', '조약돌', '은하수',
];

/** The operation's name for the session that began at world time w0. */
export function operationName(seed: number, w0: number): string {
  const k = Math.floor(w0);
  const a = OP_ADJ[hash32(seed, k, 840) % OP_ADJ.length];
  const b = OP_NOUN[hash32(seed, k, 841) % OP_NOUN.length];
  return `${a} ${b} 작전`;
}

export interface Operation {
  name: string;
  w0: number;
  w1: number;
  /** Wall-clock start, when known. */
  wall: number | null;
  focusMs: number;
  /** War time at the start and the end. */
  a0: number;
  a1: number;
  planet: number;
  sitesWon: number;
  armyGain: number;
  share0: number;
  share1: number;
  battles: number;
  orbitWins: number;
  /** Site where the operation's flag stands on its planet (−1 none). */
  flagSite: number;
}

const opMemo = new WeakMap<readonly PaceSeg[], Map<string, Operation[]>>();

/** One record per finished session of two minutes or more since the war began. */
export function operations(seed: number, origin: number, segs: readonly PaceSeg[], dates: readonly [number, number][] = []): Operation[] {
  let m = opMemo.get(segs);
  if (!m) {
    m = new Map();
    opMemo.set(segs, m);
  }
  const key = `${seed}:${origin}:${dates.length}`;
  const hit = m.get(key);
  if (hit) return hit;
  const out: Operation[] = [];
  const battles = frontBattles(seed, origin, segs);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.raid !== undefined || s.w1 === null || s.w1 < origin) continue;
    const w0 = Math.max(s.w0, origin);
    const w1 = s.w1;
    if (w1 - w0 < 2 * MIN) continue;
    const a0 = w0 - origin;
    const a1 = w1 - origin;
    const p0 = frontPlanet(seed, a0);
    const p1 = frontPlanet(seed, a1);
    const fights = capturesIn(seed, a0, a1).filter((e) => e.t >= a0 && e.t <= a1);
    const won = fights.filter((e) => e.to === 0 && e.kind !== 'final');
    const lastWon = [...won].reverse().find((e) => frontPlanet(seed, e.t).idx === p1.idx);
    const share0 = p0.idx === p1.idx ? (a0 >= p0.conqueredAt ? 1 : shareOf(ownersAt(p0, a0))) : 0;
    const share1 = a1 >= p1.conqueredAt ? 1 : shareOf(ownersAt(p1, a1));
    const inSeg = battles.filter((b) => b.t0 >= w0 && b.t0 < w1);
    const date = dates.find((d) => Math.abs(d[0] - s.w0) < 1);
    out.push({
      name: operationName(seed, s.w0),
      w0,
      w1,
      wall: date ? date[1] : null,
      focusMs: w1 - w0,
      a0,
      a1,
      planet: p1.idx,
      sitesWon: won.reduce((a, e) => a + e.sites.length, 0),
      armyGain: armySize(a1) - armySize(a0),
      share0,
      share1,
      battles: inSeg.length + fights.length,
      orbitWins: inSeg.filter((b) => b.stage === 'orbit').length,
      flagSite: lastWon ? lastWon.sites[0] : -1,
    });
  }
  if (m.size > 8) m.clear();
  m.set(key, out);
  return out;
}

/** The last five operation flags standing on the front planet at A. */
export function flagsOn(seed: number, origin: number, segs: readonly PaceSeg[], A: number): { site: number; name: string; at: number }[] {
  const p = frontPlanet(seed, A);
  const out: { site: number; name: string; at: number }[] = [];
  for (const o of operations(seed, origin, segs)) {
    if (o.a1 > A || o.planet !== p.idx || o.flagSite < 0) continue;
    out.push({ site: o.flagSite, name: o.name, at: o.a1 });
  }
  return out.slice(-5);
}

/** Stage at A, for describe (re-exported so the UI needs one module). */
export const stageOf = frontStage;
export const DECISIVE = DECISIVE_MS;
