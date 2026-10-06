/**
 * Forest seasons: an environment state driven only by world running time W. They pause with
 * the timer, never compress into a short session (a year is two running hours by default) and
 * blend smoothly around each boundary. Seasons never stop growth or essential supply.
 */

import { SEASON } from '../sim/config';

export type SeasonId = 0 | 1 | 2 | 3; // spring, summer, autumn, winter

export const SEASON_NAMES = ['봄', '여름', '가을', '겨울'] as const;

/** Season index at W (hard boundaries; used by the simulation). */
export function seasonAt(W: number): SeasonId {
  const q = SEASON.yearMs / 4;
  const y = ((W % SEASON.yearMs) + SEASON.yearMs) % SEASON.yearMs;
  return Math.min(3, Math.floor(y / q)) as SeasonId;
}

export interface SeasonMix {
  /** Weights of spring, summer, autumn, winter (sum 1), blended near boundaries. */
  w: [number, number, number, number];
  /** Dominant season. */
  id: SeasonId;
  /** Progress through the dominant season (0..1). */
  p: number;
  /** Years completed. */
  year: number;
}

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Smooth season weights for rendering. */
export function seasonMix(W: number): SeasonMix {
  const q = SEASON.yearMs / 4;
  const Wc = Math.max(0, W);
  const y = Wc % SEASON.yearMs;
  const id = Math.min(3, Math.floor(y / q)) as SeasonId;
  const p = (y - id * q) / q;
  const w: [number, number, number, number] = [0, 0, 0, 0];
  const half = SEASON.blendMs / 2;
  const into = y - id * q; // ms since this season began
  const left = q - into; // ms until the next one
  // the later season's weight rises smoothly from 0 to 1 across [boundary − half, boundary + half]
  if (into < half && Wc >= q) {
    const k = smooth01((into + half) / SEASON.blendMs);
    w[id] = k;
    w[(id + 3) % 4] = 1 - k;
  } else if (left < half) {
    const k = smooth01((half - left) / SEASON.blendMs);
    w[id] = 1 - k;
    w[(id + 1) % 4] = k;
  } else {
    w[id] = 1;
  }
  return { w, id, p, year: Math.floor(Wc / SEASON.yearMs) };
}
