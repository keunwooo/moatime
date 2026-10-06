/**
 * Forest weather: a state machine driven only by world running time W.
 *
 * Time is cut into weather blocks (half a season each; blocks never straddle a season). Each
 * block plays one script chosen from its season by a seed hash, e.g. spring rain
 *   CLEAR → CLOUDY → LIGHT_RAIN → CLOUDY → CLEAR
 * Every script starts and ends calm (clear, cloudy or fog), so neighbouring blocks join
 * without a jump. The scene never sees a state switch: each state has intensities (cloud,
 * rain, snow, fog, wind, darkness) and the transition between two states blends them over a
 * few minutes of running time.
 *
 * Accumulated amounts (ground wetness, snow cover) integrate the recent weather on a fixed
 * grid, so they too are pure functions of W. Lightning strikes are seeded inside storm spans.
 *
 * Pure: the same seed and W always give the same weather. Nothing here uses the session.
 */

import { hash32 } from '../core/rng';
import { SEASON } from '../sim/config';
import { seasonAt } from './season';

export type WeatherId = 'CLEAR' | 'CLOUDY' | 'LIGHT_RAIN' | 'HEAVY_RAIN' | 'STORM' | 'FOG' | 'SNOW';

export interface WeatherState {
  /** Dominant state (for text and rules). */
  id: WeatherId;
  /** The state it is turning into (equal to `id` when steady) and how far (0..1). */
  next: WeatherId;
  k: number;
  /** Continuous intensities 0..1 the scene draws from (transitions blend these). */
  cloud: number;
  rain: number;
  snow: number;
  fog: number;
  wind: number;
  /** Darkening of the light under heavy cloud. */
  dark: number;
  /** Ground wetness and snow cover accumulated over recent weather. */
  wet: number;
  snowCover: number;
  /** A lightning flash now (0..1; storms only). */
  flash: number;
  /** Horizontal position of the current/last strike (−1..1 of the sky). */
  flashX: number;
}

type Intensity = Pick<WeatherState, 'cloud' | 'rain' | 'snow' | 'fog' | 'wind' | 'dark'>;

const LOOK: Record<WeatherId, Intensity> = {
  CLEAR: { cloud: 0.18, rain: 0, snow: 0, fog: 0, wind: 0.3, dark: 0 },
  CLOUDY: { cloud: 0.78, rain: 0, snow: 0, fog: 0.08, wind: 0.45, dark: 0.22 },
  LIGHT_RAIN: { cloud: 0.86, rain: 0.42, snow: 0, fog: 0.14, wind: 0.45, dark: 0.32 },
  HEAVY_RAIN: { cloud: 0.95, rain: 0.85, snow: 0, fog: 0.2, wind: 0.62, dark: 0.46 },
  STORM: { cloud: 1, rain: 1, snow: 0, fog: 0.14, wind: 0.9, dark: 0.58 },
  FOG: { cloud: 0.42, rain: 0, snow: 0, fog: 0.85, wind: 0.08, dark: 0.12 },
  SNOW: { cloud: 0.86, rain: 0, snow: 0.72, fog: 0.22, wind: 0.32, dark: 0.26 },
};

interface Script {
  name: string;
  weight: number;
  /** States with their share of the block. */
  steps: [WeatherId, number][];
  /** Extra wind (gusty autumn days). */
  wind?: number;
}

/** Weather scripts per season (spring, summer, autumn, winter). */
export const SCRIPTS: Script[][] = [
  [
    { name: 'clear', weight: 0.34, steps: [['CLEAR', 1]] },
    { name: 'passing clouds', weight: 0.24, steps: [['CLEAR', 0.3], ['CLOUDY', 0.4], ['CLEAR', 0.3]] },
    { name: 'spring rain', weight: 0.32, steps: [['CLEAR', 0.14], ['CLOUDY', 0.18], ['LIGHT_RAIN', 0.36], ['CLOUDY', 0.14], ['CLEAR', 0.18]] },
    { name: 'morning fog', weight: 0.1, steps: [['FOG', 0.35], ['CLEAR', 0.65]] },
  ],
  [
    { name: 'clear', weight: 0.34, steps: [['CLEAR', 1]] },
    { name: 'fast clouds', weight: 0.2, steps: [['CLEAR', 0.25], ['CLOUDY', 0.5], ['CLEAR', 0.25]], wind: 0.25 },
    { name: 'shower', weight: 0.28, steps: [['CLOUDY', 0.18], ['HEAVY_RAIN', 0.3], ['LIGHT_RAIN', 0.18], ['FOG', 0.16], ['CLEAR', 0.18]] },
    { name: 'thunderstorm', weight: 0.18, steps: [['CLOUDY', 0.14], ['HEAVY_RAIN', 0.14], ['STORM', 0.24], ['HEAVY_RAIN', 0.1], ['LIGHT_RAIN', 0.12], ['FOG', 0.1], ['CLEAR', 0.16]] },
  ],
  [
    { name: 'clear and windy', weight: 0.32, steps: [['CLEAR', 1]], wind: 0.25 },
    { name: 'grey', weight: 0.24, steps: [['CLOUDY', 0.7], ['CLEAR', 0.3]] },
    { name: 'autumn rain', weight: 0.28, steps: [['CLOUDY', 0.2], ['LIGHT_RAIN', 0.4], ['CLOUDY', 0.2], ['CLEAR', 0.2]] },
    { name: 'gusts', weight: 0.16, steps: [['CLEAR', 0.3], ['CLOUDY', 0.4], ['CLEAR', 0.3]], wind: 0.5 },
  ],
  [
    { name: 'grey', weight: 0.24, steps: [['CLOUDY', 1]] },
    { name: 'snow', weight: 0.42, steps: [['CLOUDY', 0.14], ['SNOW', 0.56], ['CLOUDY', 0.14], ['CLEAR', 0.16]] },
    { name: 'cold fog', weight: 0.14, steps: [['FOG', 0.5], ['CLOUDY', 0.2], ['CLEAR', 0.3]] },
    { name: 'clear frost', weight: 0.2, steps: [['CLEAR', 1]] },
  ],
];

/** Half a season: two weather scripts per season. */
export const WEATHER_BLOCK_MS = SEASON.yearMs / 8;
/** A change between two states takes this long. */
const TRANSITION_MS = 3 * 60_000;

const u01 = (...xs: number[]) => (hash32(...xs) >>> 0) / 4294967296;

export function scriptOf(seed: number, block: number): Script {
  const W0 = block * WEATHER_BLOCK_MS;
  const season = seasonAt(W0);
  // the very first block of a world is calm and clear: the first work is easy to see
  if (block === 0) return SCRIPTS[0][0];
  const list = SCRIPTS[season];
  let x = u01(seed, block, 811) * list.reduce((a, s) => a + s.weight, 0);
  for (const s of list) {
    x -= s.weight;
    if (x < 0) return s;
  }
  return list[list.length - 1];
}

interface Segment {
  id: WeatherId;
  t0: number;
  t1: number;
  wind: number;
}

/** The segments of a block (states with their start and end). */
export function segmentsOf(seed: number, block: number): Segment[] {
  const sc = scriptOf(seed, block);
  const out: Segment[] = [];
  let t = block * WEATHER_BLOCK_MS;
  for (const [id, share] of sc.steps) {
    const t1 = t + Math.round(share * WEATHER_BLOCK_MS);
    out.push({ id, t0: t, t1, wind: sc.wind ?? 0 });
    t = t1;
  }
  out[out.length - 1].t1 = (block + 1) * WEATHER_BLOCK_MS;
  return out;
}

function segmentAt(seed: number, W: number): { seg: Segment; prev: Segment; next: Segment } {
  const b = Math.floor(Math.max(0, W) / WEATHER_BLOCK_MS);
  const segs = segmentsOf(seed, b);
  let i = segs.findIndex((s) => W < s.t1);
  if (i < 0) i = segs.length - 1;
  const seg = segs[i];
  const prev = i > 0 ? segs[i - 1] : b > 0 ? segmentsOf(seed, b - 1).slice(-1)[0] : seg;
  const next = i < segs.length - 1 ? segs[i + 1] : segmentsOf(seed, b + 1)[0];
  return { seg, prev, next };
}

const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

function blend(a: Intensity, b: Intensity, k: number, wa: number, wb: number): Intensity {
  const m = (x: number, y: number) => x + (y - x) * k;
  return { cloud: m(a.cloud, b.cloud), rain: m(a.rain, b.rain), snow: m(a.snow, b.snow), fog: m(a.fog, b.fog), wind: Math.min(1, m(a.wind + wa, b.wind + wb)), dark: m(a.dark, b.dark) };
}

/** Instant intensities at W (no accumulation). */
export function weatherRaw(seed: number, W: number): { id: WeatherId; next: WeatherId; k: number; look: Intensity } {
  const { seg, prev, next } = segmentAt(seed, W);
  const half = TRANSITION_MS / 2;
  // blend with the neighbour across the nearer boundary
  if (W - seg.t0 < half && prev !== seg) {
    const k = smooth01((W - seg.t0 + half) / TRANSITION_MS);
    return { id: k < 0.5 ? prev.id : seg.id, next: seg.id, k, look: blend(LOOK[prev.id], LOOK[seg.id], k, prev.wind, seg.wind) };
  }
  if (seg.t1 - W < half) {
    const k = smooth01((half - (seg.t1 - W)) / TRANSITION_MS);
    return { id: k < 0.5 ? seg.id : next.id, next: next.id, k, look: blend(LOOK[seg.id], LOOK[next.id], k, seg.wind, next.wind) };
  }
  return { id: seg.id, next: seg.id, k: 0, look: blend(LOOK[seg.id], LOOK[seg.id], 0, seg.wind, seg.wind) };
}

// ---------------------------------------------------------------------------
// Accumulation on a fixed grid (the same W always integrates the same steps)

const STEP_MS = 20_000;
const WET_LOOKBACK = 40 * 60_000;
const WET_UP_MS = 3 * 60_000;
const WET_DRY_MS = 11 * 60_000;
const SNOW_FILL_MS = 22 * 60_000;
const SNOW_MELT_MS = 70 * 60_000;
const SPRING_MELT_MS = 9 * 60_000;

/** Ground wetness 0..1: rises in rain, dries over ~10 minutes after it. */
export function wetness(seed: number, W: number): number {
  const end = Math.floor(Math.max(0, W) / STEP_MS) * STEP_MS;
  let wet = 0;
  for (let t = Math.max(0, end - WET_LOOKBACK); t < end; t += STEP_MS) {
    const r = weatherRaw(seed, t).look.rain;
    if (r > 0.05) wet += (Math.min(1, r * 1.6) - wet) * (1 - Math.exp(-STEP_MS / WET_UP_MS));
    else wet -= wet * (1 - Math.exp(-STEP_MS / WET_DRY_MS));
  }
  return Math.min(1, Math.max(0, wet));
}

/** Snow cover 0..1: builds up while it snows in winter, partly melts in clear spells, gone in spring. */
export function snowCover(seed: number, W: number): number {
  const q = SEASON.yearMs / 4;
  const Wc = Math.max(0, W);
  const y = Wc % SEASON.yearMs;
  const winterStart = Wc - y + 3 * q;
  // only this winter matters (or last winter, early in spring)
  const from = y >= 3 * q ? winterStart : y < q * 0.25 && Wc >= q ? winterStart - SEASON.yearMs : -1;
  if (from < 0) return 0;
  const end = Math.floor(Wc / STEP_MS) * STEP_MS;
  let s = 0;
  for (let t = from; t < end; t += STEP_MS) {
    const spring = t >= from + q;
    const look = weatherRaw(seed, t).look;
    if (spring) s -= s * (1 - Math.exp(-STEP_MS / SPRING_MELT_MS));
    else if (look.snow > 0.05) s += (1 - s) * look.snow * (STEP_MS / SNOW_FILL_MS);
    else if (look.cloud < 0.5) s -= s * (1 - Math.exp(-STEP_MS / SNOW_MELT_MS));
  }
  return Math.min(1, Math.max(0, s));
}

// ---------------------------------------------------------------------------
// Lightning: a few seeded strikes inside storm spans (calm limits on brightness and rate)

/** Strike slots: at most one strike per slot, in its first 4 s, so strikes are ≥ 6 s apart. */
const FLASH_MIN_GAP_MS = 10_000;
const FLASH_WINDOW_MS = 4_000;

/** Flash strength (0..1) and its sky position at W. */
export function lightning(seed: number, W: number): { flash: number; x: number } {
  const { seg } = segmentAt(seed, W);
  if (seg.id !== 'STORM') return { flash: 0, x: 0 };
  // strike slots every FLASH_MIN_GAP_MS; about half carry a strike
  const slot = Math.floor((W - seg.t0) / FLASH_MIN_GAP_MS);
  for (const s of [slot, slot - 1]) {
    if (s < 0) continue;
    if (u01(seed, seg.t0, s, 97) > 0.55) continue;
    const at = seg.t0 + s * FLASH_MIN_GAP_MS + Math.floor(u01(seed, seg.t0, s, 98) * FLASH_WINDOW_MS);
    const e = W - at;
    if (e < 0 || e > 900) continue;
    // 120 ms up, a soft 700 ms fade: never a hard white frame
    const flash = e < 120 ? e / 120 : Math.max(0, 1 - (e - 120) / 700);
    return { flash, x: u01(seed, seg.t0, s, 99) * 2 - 1 };
  }
  return { flash: 0, x: 0 };
}

// ---------------------------------------------------------------------------

export const CLEAR_WEATHER: WeatherState = { id: 'CLEAR', next: 'CLEAR', k: 0, ...LOOK.CLEAR, wet: 0, snowCover: 0, flash: 0, flashX: 0 };

const accCache = new Map<string, { wet: number; snow: number }>();

/** Weather at W for a theme. Space has planet conditions instead (Phase 9): always clear here. */
export function weatherAt(theme: 'forest' | 'space', seed: number, W: number): WeatherState {
  if (theme !== 'forest') return CLEAR_WEATHER;
  const raw = weatherRaw(seed, W);
  // accumulations change slowly: computed on their 20 s grid and cached
  const key = `${seed}:${Math.floor(Math.max(0, W) / STEP_MS)}`;
  let acc = accCache.get(key);
  if (!acc) {
    acc = { wet: wetness(seed, W), snow: snowCover(seed, W) };
    if (accCache.size > 64) accCache.clear();
    accCache.set(key, acc);
  }
  const fl = lightning(seed, W);
  return { id: raw.id, next: raw.next, k: raw.k, ...raw.look, wet: acc.wet, snowCover: acc.snow, flash: fl.flash, flashX: fl.x };
}

export const WEATHER_NAMES: Record<WeatherId, string> = {
  CLEAR: '맑음',
  CLOUDY: '흐림',
  LIGHT_RAIN: '약한 비',
  HEAVY_RAIN: '강한 비',
  STORM: '폭풍우',
  FOG: '안개',
  SNOW: '눈',
};

/** How rough the weather is for small visitors (0 calm .. 1 storm). */
export function weatherSeverity(w: WeatherState): number {
  return Math.min(1, Math.max(w.rain, w.snow * 0.8, w.fog * 0.5, (w.wind - 0.5) * 1.4, w.dark));
}

/** Rain state spans in [W0, W1) (the simulation uses these for the rain barrel). */
export function rainSpans(seed: number, W0: number, W1: number): { t0: number; t1: number; heavy: boolean }[] {
  const out: { t0: number; t1: number; heavy: boolean }[] = [];
  const b0 = Math.floor(Math.max(0, W0) / WEATHER_BLOCK_MS);
  const b1 = Math.floor(Math.max(0, W1) / WEATHER_BLOCK_MS);
  for (let b = b0; b <= b1; b++) {
    for (const s of segmentsOf(seed, b)) {
      if (s.id !== 'LIGHT_RAIN' && s.id !== 'HEAVY_RAIN' && s.id !== 'STORM') continue;
      const t0 = Math.max(W0, s.t0);
      const t1 = Math.min(W1, s.t1);
      if (t1 > t0) out.push({ t0, t1, heavy: s.id !== 'LIGHT_RAIN' });
    }
  }
  return out;
}

/**
 * The time a rain barrel needs `ms` of filling from `from`: rain counts double (light) or
 * triple (heavy and storms). Exact on the weather segments, so the simulation stays exact.
 */
export function rainFillAt(seed: number, from: number, ms: number): number {
  let need = ms;
  let t = from;
  for (const sp of rainSpans(seed, from, from + ms)) {
    if (sp.t0 > t) {
      const gap = sp.t0 - t;
      if (gap >= need) return t + need;
      need -= gap;
      t = sp.t0;
    }
    const rate = sp.heavy ? 3 : 2;
    const len = sp.t1 - t;
    if (len * rate >= need) return t + Math.ceil(need / rate);
    need -= len * rate;
    t = sp.t1;
  }
  return t + need;
}

/** Running time from `from` to `to` with rain counted double (light) or triple (heavy). */
export function rainTime(seed: number, from: number, to: number): number {
  if (to <= from) return 0;
  let extra = 0;
  for (const sp of rainSpans(seed, from, to)) extra += (sp.t1 - sp.t0) * (sp.heavy ? 2 : 1);
  return to - from + extra;
}
