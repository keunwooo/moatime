/**
 * The cosmos theme's world layer: space weather, rare sights, the session sights paced to the
 * focus sessions, the headline on view, the background stars and the constellation each session
 * leaves. Pure functions of (seed, origin, A) and the session segments; none of it changes what
 * the universe grows (sim/cosmos.ts never reads this module).
 *
 * Times: A is the universe's age (W − origin). Rare sights and space weather sit on blocks of A;
 * session sights are placed on world time W (sessions are recorded in W) and converted.
 */

import { hash32 } from '../core/rng';
import type { AspectClass } from '../core/world';
import {
  ALIGN_AT,
  ALIGN_EVERY,
  CHRON,
  cosmosStage,
  fieldStarAt,
  fieldStars,
  milestones,
  smooth,
  stageTimes,
  type Milestone,
} from '../sim/cosmos';
import type { PaceSeg } from './pace';
import { BLOCK_MS, eventOfBlock, PRIORITY, type EventDef, type WorldEvent } from './timeline';

const S = 1000;
const MIN = 60_000;
const H = 3_600_000;
const u01 = (...xs: number[]) => hash32(...xs) / 4294967296;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const cosmosAge = (W: number, origin: number) => Math.max(0, W - origin);

// ---- space weather ------------------------------------------------------------------------------

export type SpaceWeatherId = 'clear' | 'dustLane' | 'stellarWind' | 'brightNebula';

export interface SpaceWeather {
  id: SpaceWeatherId;
  /** Continuous intensities 0..1: dust lane across the far sky, stellar wind, nebula glow. */
  dust: number;
  wind: number;
  glow: number;
}

export const SPACE_WEATHER_BLOCK_MS = 36 * MIN;
const SPACE_WEATHER: SpaceWeatherId[] = ['clear', 'dustLane', 'stellarWind', 'brightNebula'];
const SPACE_WEATHER_W = [0.4, 0.2, 0.2, 0.2];

export const SPACE_WEATHER_NAMES: Record<SpaceWeatherId, string> = {
  clear: '맑은 별빛',
  dustLane: '성간 먼지 띠',
  stellarWind: '항성풍',
  brightNebula: '성운이 밝은 밤',
};

function weatherOfBlock(seed: number, b: number): SpaceWeatherId {
  if (b <= 0) return 'clear';
  let x = u01(seed, 701, b);
  for (let i = 0; i < SPACE_WEATHER.length; i++) {
    x -= SPACE_WEATHER_W[i];
    if (x < 0) return SPACE_WEATHER[i];
  }
  return 'clear';
}

/** Space weather at A (calm through the chronicle; each block eases in and out over minutes). */
export function spaceWeatherAt(seed: number, A: number): SpaceWeather {
  const calm: SpaceWeather = { id: 'clear', dust: 0, wind: 0, glow: 0 };
  if (A < CHRON.end) return calm;
  const t = A - CHRON.end;
  const b = Math.floor(t / SPACE_WEATHER_BLOCK_MS);
  const id = weatherOfBlock(seed, b);
  if (id === 'clear') return calm;
  const b0 = b * SPACE_WEATHER_BLOCK_MS;
  const b1 = b0 + SPACE_WEATHER_BLOCK_MS;
  const e = smooth(b0 + 2 * MIN, b0 + 5 * MIN, t) * (1 - smooth(b1 - 5 * MIN, b1 - 2 * MIN, t));
  return { id, dust: id === 'dustLane' ? e : 0, wind: id === 'stellarWind' ? e : 0, glow: id === 'brightNebula' ? e : 0 };
}

// ---- rare sights (blocks of A) ------------------------------------------------------------------

/** The home planets line up at these windows (stage 8 on). */
export function alignmentAt(seed: number, A: number): { t0: number; t1: number } | null {
  if (A < ALIGN_AT - 60 * S) return null;
  const n = Math.round((A - ALIGN_AT) / ALIGN_EVERY);
  const t = ALIGN_AT + n * ALIGN_EVERY;
  if (n < 0 || A < t - 50 * S || A >= t + 50 * S) return null;
  if (t < stageTimes(seed)[8]) return null;
  return { t0: t - 50 * S, t1: t + 50 * S };
}

function nearMilestone(seed: number, t0: number, t1: number, margin = 60 * S): boolean {
  for (const m of milestones(seed)) {
    if (m.A - margin < t1 && m.A + m.dur + margin > t0) return true;
    if (m.A > t1 + margin) break;
  }
  return false;
}

function clearOfFixed(seed: number, t0: number, t1: number): boolean {
  if (nearMilestone(seed, t0, t1)) return false;
  // alignment windows near this span
  for (const t of [t0, t1]) if (alignmentAt(seed, t)) return false;
  const n = Math.round((t0 - ALIGN_AT) / ALIGN_EVERY);
  const ta = ALIGN_AT + n * ALIGN_EVERY;
  if (ta - 50 * S < t1 + 30 * S && ta + 50 * S > t0 - 30 * S && ta >= stageTimes(seed)[8]) return false;
  return true;
}

const stageAtLeast = (n: number) => (c: { W: number; seed: number }) =>
  c.W >= CHRON.end + 10 * MIN && cosmosStage(c.seed, c.W) >= n && clearOfFixed(c.seed, c.W, c.W + 3 * MIN);

/** Rare sights, on blocks of the universe's age (ctx.W is A here). */
export const COSMOS_DEFS: EventDef[] = [
  { kind: 'bigComet', theme: 'cosmos', prio: PRIORITY.RARE, grid: 3, chance: 0.55, durMs: [150 * S, 180 * S], eligible: stageAtLeast(5) },
  { kind: 'kilonova', theme: 'cosmos', prio: PRIORITY.RARE, grid: 4, chance: 0.5, durMs: [90 * S, 120 * S], eligible: stageAtLeast(6) },
  { kind: 'roguePlanet', theme: 'cosmos', prio: PRIORITY.RARE, grid: 3, chance: 0.4, durMs: [120 * S, 160 * S], eligible: stageAtLeast(4) },
  { kind: 'starburst', theme: 'cosmos', prio: PRIORITY.RARE, grid: 3, chance: 0.45, durMs: [90 * S, 120 * S], eligible: stageAtLeast(7) },
];

/** The rare sight of A's block, if it is running at A. */
export function rareAt(seed: number, A: number): WorldEvent | null {
  const e = eventOfBlock(COSMOS_DEFS, 'cosmos', seed, Math.floor(A / BLOCK_MS));
  return e && A >= e.t0 && A < e.t1 ? e : null;
}

function rareIn(seed: number, a0: number, a1: number): WorldEvent | null {
  for (let b = Math.floor(Math.max(0, a0) / BLOCK_MS); b <= Math.floor(Math.max(0, a1) / BLOCK_MS); b++) {
    const e = eventOfBlock(COSMOS_DEFS, 'cosmos', seed, b);
    if (e && e.t1 > a0 && e.t0 < a1) return e;
  }
  return null;
}

// ---- session sights (paced to the focus sessions) ------------------------------------------------

export interface SightDef {
  kind: string;
  stage: number;
  w: number;
  dur: [number, number];
}

export const SIGHTS: SightDef[] = [
  { kind: 'comet', stage: 5, w: 3, dur: [70 * S, 110 * S] },
  { kind: 'flare', stage: 5, w: 2, dur: [40 * S, 60 * S] },
  { kind: 'farSupernova', stage: 5, w: 2, dur: [50 * S, 75 * S] },
  { kind: 'meteors', stage: 6, w: 2, dur: [40 * S, 60 * S] },
  { kind: 'pulsar', stage: 6, w: 2, dur: [55 * S, 70 * S] },
  { kind: 'starChain', stage: 6, w: 2, dur: [50 * S, 70 * S] },
  { kind: 'binaryDance', stage: 7, w: 2, dur: [55 * S, 75 * S] },
  { kind: 'aurora', stage: 8, w: 3, dur: [60 * S, 90 * S] },
  { kind: 'moonShadow', stage: 8, w: 2, dur: [40 * S, 60 * S] },
  { kind: 'nightMeteors', stage: 8, w: 2, dur: [40 * S, 60 * S] },
  { kind: 'corePulse', stage: 9, w: 2, dur: [45 * S, 60 * S] },
  { kind: 'satellitePass', stage: 9, w: 2, dur: [70 * S, 100 * S] },
  { kind: 'orbitLight', stage: 10, w: 2, dur: [40 * S, 55 * S] },
];

export const SIGHT_PACE = {
  minLenMs: 2 * MIN,
  earliestMs: 30 * S,
  firstFrac: [0.25, 0.45] as [number, number],
  firstCapMs: [90 * S, 210 * S] as [number, number],
  openFirstMs: [90 * S, 180 * S] as [number, number],
  gapMs: [4 * MIN, 6.5 * MIN] as [number, number],
  minGapMs: 3.5 * MIN,
  minDurMs: 40 * S,
};

function segEnd(segs: readonly PaceSeg[], i: number): number {
  const s = segs[i];
  if (s.w1 !== null) return s.w1;
  if (i + 1 < segs.length) return segs[i + 1].w0;
  return Infinity;
}

/** Fixed headlines (milestones, rare sights, alignments) overlapping [a0, a1) of A. */
function busyUntil(seed: number, a0: number, a1: number): number {
  let until = -1;
  for (const m of milestones(seed)) {
    if (m.A - 20 * S < a1 && m.A + m.dur + 20 * S > a0) until = Math.max(until, m.A + m.dur + 20 * S);
    if (m.A > a1 + H) break;
  }
  const r = rareIn(seed, a0 - 20 * S, a1 + 20 * S);
  if (r) until = Math.max(until, r.t1 + 20 * S);
  for (const t of [a0, a1, (a0 + a1) / 2]) {
    const al = alignmentAt(seed, t);
    if (al) until = Math.max(until, al.t1 + 20 * S);
  }
  return until;
}

const sightMemo = new WeakMap<readonly PaceSeg[], Map<string, WorldEvent[]>>();

/**
 * Sights for the sessions (world time W): every 4–6½ minutes of a session, the first within its
 * first few minutes, so a 5-minute countdown sees one and a 25-minute one four or five. Never in
 * the chronicle (it is its own show), never in a session under two minutes, always ending before
 * the session does, and clear of milestones and rare sights. Presentation only.
 */
export function cosmosSights(seed: number, origin: number, segs: readonly PaceSeg[]): WorldEvent[] {
  let m = sightMemo.get(segs);
  if (!m) {
    m = new Map();
    sightMemo.set(segs, m);
  }
  const key = `${seed}:${origin}`;
  const hit = m.get(key);
  if (hit) return hit;
  const out: WorldEvent[] = [];
  let last = -Infinity;
  let lastKind = '';
  const startW = origin + CHRON.end;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.raid !== undefined) continue;
    if (s.len !== null && s.len < SIGHT_PACE.minLenMs) continue;
    const segClose = Math.min(segEnd(segs, i), s.len === null ? s.w0 + 12 * H : s.w0 + s.len);
    if (segClose <= startW) continue;
    const len = s.len ?? segClose - s.w0;
    const margin = Math.min(60 * S, len * 0.15);
    const latestEnd = segClose - margin;
    const k0 = Math.floor(s.w0);
    let t: number;
    if (s.len === null) t = s.w0 + Math.round(lerp(SIGHT_PACE.openFirstMs[0], SIGHT_PACE.openFirstMs[1], u01(seed, k0, 711)));
    else {
      const cap = lerp(SIGHT_PACE.firstCapMs[0], SIGHT_PACE.firstCapMs[1], u01(seed, k0, 712));
      const frac = lerp(SIGHT_PACE.firstFrac[0], SIGHT_PACE.firstFrac[1], u01(seed, k0, 713));
      t = s.w0 + Math.round(Math.max(SIGHT_PACE.earliestMs, Math.min(s.len * frac, cap)));
      // a short countdown still gets its sight, as late as it fits
      t = Math.min(t, latestEnd - SIGHT_PACE.minDurMs);
    }
    t = Math.max(t, s.w0 + Math.min(SIGHT_PACE.earliestMs, len * 0.2), startW);
    let n = 0;
    while (t + SIGHT_PACE.minDurMs <= latestEnd && out.length < 200_000) {
      if (t < last + SIGHT_PACE.minGapMs) t = last + SIGHT_PACE.minGapMs;
      const A = t - origin;
      const stage = cosmosStage(seed, A);
      const pool = SIGHTS.filter((d) => d.stage <= stage && d.kind !== lastKind);
      if (!pool.length) break;
      let x = u01(seed, k0, 714, n) * pool.reduce((acc, d) => acc + d.w, 0);
      let pick = pool[0];
      for (const d of pool) {
        x -= d.w;
        if (x < 0) {
          pick = d;
          break;
        }
      }
      const want = Math.round(lerp(pick.dur[0], pick.dur[1], u01(seed, k0, 715, n)));
      const dur = Math.min(want, latestEnd - t);
      if (dur < SIGHT_PACE.minDurMs) break;
      // step aside for a milestone, a rare sight or an alignment
      const busy = busyUntil(seed, A, A + dur);
      if (busy >= 0) {
        t = origin + busy;
        n++;
        if (n > 40) break;
        continue;
      }
      out.push({ kind: pick.kind, prio: PRIORITY.AMBIENT, t0: t, t1: t + dur, seed: hash32(seed, k0, 716, n) >>> 0 });
      last = t;
      lastKind = pick.kind;
      n++;
      t += Math.round(lerp(SIGHT_PACE.gapMs[0], SIGHT_PACE.gapMs[1], u01(seed, k0, 717, n)));
      if (!Number.isFinite(segEnd(segs, i)) && t > s.w0 + 12 * H) break;
    }
  }
  out.sort((a, b) => a.t0 - b.t0);
  if (m.size > 8) m.clear();
  m.set(key, out);
  return out;
}

/** Dev only: sights called up by hand (world time W). */
const devSights: WorldEvent[] = [];
export function devCallSight(W: number, origin: number, seed: number) {
  const stage = cosmosStage(seed, W - origin);
  const pool = SIGHTS.filter((d) => d.stage <= Math.max(5, stage));
  const pick = pool[devSights.length % pool.length];
  devSights.push({ kind: pick.kind, prio: PRIORITY.AMBIENT, t0: W, t1: W + pick.dur[1], seed: hash32(seed, devSights.length, 719) >>> 0 });
}

// ---- the headline on view -----------------------------------------------------------------------

export const MILESTONE_PRIO = PRIORITY.RARE;

/**
 * The headline at W: a milestone, then a rare sight or an alignment, then a session sight. Times
 * of the returned event are in W. Milestone kinds are prefixed `ms:`.
 */
export function cosmosHeadlineAt(seed: number, origin: number, W: number, segs: readonly PaceSeg[]): WorldEvent | null {
  const A = W - origin;
  if (A < 0) return null;
  const ms = milestoneShown(seed, A);
  if (ms) return { kind: `ms:${ms.id}`, prio: MILESTONE_PRIO, t0: origin + ms.A, t1: origin + ms.A + ms.dur, seed: hash32(seed, 720) >>> 0 };
  const r = rareAt(seed, A);
  if (r) return { ...r, t0: origin + r.t0, t1: origin + r.t1 };
  const al = alignmentAt(seed, A);
  if (al) return { kind: 'alignment', prio: PRIORITY.RARE, t0: origin + al.t0, t1: origin + al.t1, seed: 0 };
  for (const d of devSights) if (W >= d.t0 && W < d.t1) return d;
  for (const f of cosmosSights(seed, origin, segs)) {
    if (f.t0 > W) break;
    if (W < f.t1) return f;
  }
  return null;
}

function milestoneShown(seed: number, A: number): Milestone | null {
  for (const m of milestones(seed)) {
    if (A >= m.A && A < m.A + m.dur) return m;
    if (m.A > A) break;
  }
  return null;
}

// ---- background stars ----------------------------------------------------------------------------

export interface FieldStar {
  i: number;
  x: number;
  y: number;
  /** 0..1 (a few bright, most faint). */
  mag: number;
  /** Colour temperature −1 (red) .. 1 (blue). */
  temp: number;
}

/** Where stars may light (normalised screen coordinates), outside the timer and the orbit band. */
export const STAR_FIELD: Record<AspectClass, { y0: number; y1: number; timer: [number, number, number, number] }> = {
  wide: { y0: 0.05, y1: 0.68, timer: [0.3, 0.2, 0.7, 0.66] },
  tall: { y0: 0.06, y1: 0.72, timer: [0.06, 0.08, 0.94, 0.5] },
};

const inRect = (x: number, y: number, r: [number, number, number, number]) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];

export function fieldStar(seed: number, i: number, aspect: AspectClass): FieldStar {
  const f = STAR_FIELD[aspect];
  let x = 0;
  let y = 0;
  for (let k = 0; k < 12; k++) {
    x = 0.02 + 0.96 * u01(seed, 731, i, k);
    y = f.y0 + (f.y1 - f.y0) * u01(seed, 732, i, k);
    if (!inRect(x, y, f.timer)) break;
  }
  const r = u01(seed, 733, i);
  return { i, x, y, mag: Math.pow(r, 3.2), temp: u01(seed, 734, i) * 2 - 1 };
}

// ---- constellations ---------------------------------------------------------------------------------

const ADJ = [
  '잠든', '작은', '새벽', '접힌', '느린', '오래된', '따뜻한', '푸른', '조용한', '떠도는', '숨은', '빛나는',
  '어린', '긴', '둥근', '먼', '첫', '깊은', '맑은', '수줍은', '부푼', '외로운', '반짝이는', '흐르는',
  '눈 감은', '노래하는', '기다리는', '날개 단', '물든', '여린', '높은', '낮은', '꿈꾸는', '쉬는', '가벼운', '포근한',
  '은빛', '금빛', '장밋빛', '보랏빛', '안개 낀', '바람 부는', '구름 위의', '물가의', '저녁', '한낮의', '겨울', '봄날의',
];
const NOUN = [
  '고래', '등불', '우체통', '편지', '찻잔', '고양이', '여우', '종', '연필', '사다리', '배', '열쇠',
  '부엉이', '시계', '우산', '나무', '물고기', '거북', '토끼', '풍선', '창문', '의자', '책', '피리',
  '오리', '사슴', '다리', '꽃병', '촛불', '모자', '그네', '돛', '등대', '물병', '바구니', '실타래',
  '나비', '양', '달팽이', '자전거', '연', '징검다리', '숟가락', '두루미', '조개', '도토리', '물레', '바이올린',
];

export interface Constellation {
  /** Session start (W), length of focus in it (ms). */
  w0: number;
  focusMs: number;
  /** Wall-clock start of the session if recorded. */
  at?: number;
  name: string;
  stars: number[];
  edges: [number, number][];
}

export function constellationName(seed: number, w0: number): string {
  const h = hash32(seed, Math.floor(w0), 741);
  return `${ADJ[h % ADJ.length]} ${NOUN[Math.floor(h / ADJ.length) % NOUN.length]}자리`;
}

const segCross = (ax: number, ay: number, bx: number, by: number, r: [number, number, number, number]) => {
  // sample the segment: enough for short constellation lines
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    if (inRect(ax + (bx - ax) * t, ay + (by - ay) * t, r)) return true;
  }
  return false;
};

/**
 * The constellation of the stars lit during [a0, a1) of A (null for fewer than three, or a
 * session under two minutes). Compact: the brightest star and its nearest bright neighbours,
 * joined by a minimum spanning tree whose lines stay clear of the timer.
 */
export function constellationOf(seed: number, a0: number, a1: number, aspect: AspectClass): { stars: number[]; edges: [number, number][] } | null {
  if (a1 - a0 < 2 * MIN) return null;
  const i0 = fieldStars(a0);
  const i1 = fieldStars(a1);
  const n = i1 - i0;
  if (n < 3) return null;
  const want = Math.min(9, Math.max(3, Math.min(n, 4 + Math.floor(n / 8))));
  const timer = STAR_FIELD[aspect].timer;
  const cands: FieldStar[] = [];
  for (let i = i0; i < i1; i++) cands.push(fieldStar(seed, i, aspect));
  cands.sort((p, q) => q.mag - p.mag || p.i - q.i);
  const pool = cands.slice(0, Math.max(want, Math.ceil(cands.length * 0.6)));
  const chosen: FieldStar[] = [pool[0]];
  const d2 = (p: FieldStar, q: FieldStar) => (p.x - q.x) ** 2 + ((p.y - q.y) * 0.8) ** 2;
  while (chosen.length < want) {
    let best: FieldStar | null = null;
    let bestD = Infinity;
    for (const c of pool) {
      if (chosen.includes(c)) continue;
      let d = Infinity;
      let near: FieldStar | null = null;
      for (const q of chosen) {
        const dq = d2(c, q);
        if (dq < d) {
          d = dq;
          near = q;
        }
      }
      if (near && segCross(c.x, c.y, near.x, near.y, timer)) continue;
      const score = d / (0.4 + c.mag);
      if (score < bestD) {
        bestD = score;
        best = c;
      }
    }
    if (!best || bestD > 0.12) break;
    chosen.push(best);
  }
  if (chosen.length < 3) return null;
  // Prim's minimum spanning tree
  const edges: [number, number][] = [];
  const inTree = new Set<number>([0]);
  while (inTree.size < chosen.length) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < chosen.length; b++) {
        if (inTree.has(b)) continue;
        const d = d2(chosen[a], chosen[b]);
        if (d < bd && !segCross(chosen[a].x, chosen[a].y, chosen[b].x, chosen[b].y, timer)) {
          bd = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    inTree.add(best[1]);
    edges.push([chosen[best[0]].i, chosen[best[1]].i]);
  }
  const stars = chosen.filter((_, k) => inTree.has(k)).map((c) => c.i);
  return stars.length >= 3 ? { stars, edges } : null;
}

/** Sessions that left a constellation (most recent last), with their stars for this aspect. */
export function constellations(
  seed: number,
  origin: number,
  segs: readonly PaceSeg[],
  aspect: AspectClass,
  W: number,
  dates: readonly [number, number][] = [],
): Constellation[] {
  const out: Constellation[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.raid !== undefined) continue;
    const w1 = s.w1 ?? null;
    if (w1 === null || w1 > W + 1) continue;
    const a0 = Math.max(0, s.w0 - origin);
    const a1 = w1 - origin;
    if (a1 <= 0) continue;
    const c = constellationOf(seed, a0, a1, aspect);
    if (!c) continue;
    const at = dates.find((d) => d[0] === s.w0)?.[1];
    out.push({ w0: s.w0, focusMs: w1 - s.w0, at, name: constellationName(seed, s.w0), ...c });
  }
  return out;
}

/**
 * Every session's constellation on record, in the universe it was made in (an earlier universe's
 * sessions keep theirs after "새 우주 시작"). Most recent last.
 */
export function constellationRecords(seed: number, origins: readonly number[], segs: readonly PaceSeg[], W: number, dates: readonly [number, number][] = []): Constellation[] {
  const sorted = [...origins].sort((a, b) => a - b);
  const out: Constellation[] = [];
  for (const s of segs) {
    if (s.raid !== undefined || s.w1 === null || s.w1 > W + 1) continue;
    let origin = -1;
    for (const o of sorted) if (o <= s.w1) origin = o;
    if (origin < 0) continue;
    const c = constellationOf(seed, Math.max(0, s.w0 - origin), s.w1 - origin, 'wide');
    if (!c) continue;
    const at = dates.find((d) => d[0] === s.w0)?.[1];
    out.push({ w0: s.w0, focusMs: s.w1 - s.w0, at, name: constellationName(seed, s.w0), ...c });
  }
  return out;
}

/** World time at which background star i lights (for drawing order and tests). */
export function fieldStarW(origin: number, i: number): number {
  return origin + fieldStarAt(i);
}
