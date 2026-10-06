/**
 * World clock: day and night from world running time W. Pure functions of W, so the sky after
 * a reload is the sky before it; nothing moves while the timer is paused.
 *
 * The work simulation never reads the clock (the keeper and the rovers work around the clock),
 * so trigonometry is fine here.
 */

import type { ThemeId } from '../core/session';
import { WORLD } from '../sim/config';

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

export interface Body {
  /** Elevation −1 (deepest below) .. 1 (highest). 0 is the horizon. */
  elev: number;
  /** Across the sky: −1 east (rising) .. 1 west (setting). */
  az: number;
}

export interface DayState {
  /** Days completed (day 0 is the first). */
  day: number;
  /** Phase of the day 0..1 (0 = midnight, 0.5 = noon). */
  p: number;
  phase: DayPhase;
  sun: Body;
  /** The moon: lit fraction and its phase (0 new, 0.5 full; waxing below 0.5). */
  moon: Body & { illum: number; phase: number };
  /** Sky keyframe weights: night, dawn, day, dusk (sum 1). */
  sky: [number, number, number, number];
  /** Daylight on the land 0..1 (moonlight keeps a floor so the scene stays readable). */
  light: number;
  /** Golden-hour warmth 0..1 (low sun). */
  warm: number;
  /** Star visibility 0..1. */
  stars: number;
  /** Shadow direction on the ground (−1 left .. 1 right), length factor and strength. */
  shadow: { dir: number; len: number; alpha: number };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const frac = (x: number) => x - Math.floor(x);

export function dayLength(theme: ThemeId): number {
  return theme === 'space' ? WORLD.spaceDayMs : WORLD.forestDayMs;
}

/** Continuous day count at W (fractional part = phase of the day). */
export function dayPosition(theme: ThemeId, W: number): number {
  return WORLD.startPhase + Math.max(0, W) / dayLength(theme);
}

/** Elevation and azimuth of a body whose day phase is q (0 = its midnight). */
function bodyAt(q: number): Body {
  const sr = WORLD.sunrise;
  const ss = WORLD.sunset;
  if (q >= sr && q <= ss) {
    const u = (q - sr) / (ss - sr);
    return { elev: Math.sin(Math.PI * u), az: -Math.cos(Math.PI * u) };
  }
  const night = 1 - (ss - sr);
  const u = frac(q - ss) / night;
  return { elev: -0.45 * Math.sin(Math.PI * u), az: Math.cos(Math.PI * u) };
}

export function dayAt(theme: ThemeId, W: number): DayState {
  const pos = dayPosition(theme, W);
  const day = Math.floor(pos);
  const p = pos - day;
  const sun = bodyAt(p);
  const e = sun.elev;
  // twilight lasts a few minutes of running time on each side of the horizon
  const dayW = smooth(0, 0.35, e);
  const nightW = smooth(0.04, 0.3, -e);
  const tw = Math.max(0, 1 - dayW - nightW);
  const morning = p < 0.5;
  const sky: DayState['sky'] = [nightW, morning ? tw : 0, dayW, morning ? 0 : tw];
  const phase: DayPhase = e > 0.22 ? 'day' : e < -0.16 ? 'night' : morning ? 'dawn' : 'dusk';
  // the moon: new moon rises with the sun, full moon opposite it
  const lunar = frac(pos / WORLD.lunarDays + 0.37);
  const mb = bodyAt(frac(p - lunar));
  const illum = (1 - Math.cos(2 * Math.PI * lunar)) / 2;
  const light = 0.34 + 0.66 * smooth(-0.15, 0.42, e);
  const warm = (1 - smooth(0.05, 0.5, e)) * (1 - nightW);
  const stars = smooth(0.02, 0.2, -e);
  // shadows fall away from the sun (or from a bright moon at night)
  const moonUp = mb.elev > 0.05 ? smooth(0.05, 0.3, mb.elev) * illum : 0;
  const bySun = e > 0.02;
  const src = bySun ? sun : mb;
  const se = Math.max(0.12, src.elev);
  const shadow = {
    dir: -src.az,
    len: Math.min(3, Math.max(0.4, 0.35 / se)),
    alpha: bySun ? 0.5 * smooth(0.02, 0.2, e) : 0.16 * moonUp,
  };
  return { day, p, phase, sun, moon: { ...mb, illum, phase: lunar }, sky, light, warm, stars, shadow };
}

/** First W ≥ from at which the day phase reaches q (0..1). */
export function nextPhaseAt(theme: ThemeId, from: number, q: number): number {
  const L = dayLength(theme);
  const pos = dayPosition(theme, from);
  let target = Math.floor(pos) + q;
  if (target <= pos + 1e-9) target += 1;
  return Math.ceil((target - WORLD.startPhase) * L);
}

/** A clock face for the dev panel and status text ("07:12"). */
export function clockText(theme: ThemeId, W: number): string {
  const p = frac(dayPosition(theme, W));
  const mins = Math.floor(p * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export const PHASE_NAMES: Record<DayPhase, string> = { night: '밤', dawn: '새벽', day: '낮', dusk: '노을' };
