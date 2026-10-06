/** What every system of "아스테르 변경" reads each frame. */

import type { Container } from 'pixi.js';
import type { AspectClass } from '../../core/world';
import type { RaceId } from '../../core/session';
import type { FrontSim, FrontView } from '../../sim/front';
import type { Battle, Tide } from '../../world/front';
import type { WorldEvent } from '../../world/timeline';
import type { FrameInfo } from '../types';
import type { FrontLayout, P } from './layout';

export type Stage = 'ground' | 'orbit' | 'system';

export interface FrontFrame extends FrameInfo {
  sim: FrontSim;
  v: FrontView;
  seed: number;
  race: RaceId;
  /** War time (ms) and in seconds. */
  A: number;
  As: number;
  origin: number;
  aspect: AspectClass;
  L: FrontLayout;
  /** Viewport size in px. */
  w: number;
  h: number;
  /** px per art unit at depth 1 (art is drawn for a 820 px tall view). */
  k: number;
  tide: Tide;
  /** The headline on view (times in W) and its progress 0..1. */
  event: WorldEvent | null;
  eventP: number;
  /** The session battle on view, if the headline is one. */
  battle: Battle | null;
  /** Real seconds since the last live completion (−1 none). */
  celebrateT: number;
  /** Which stage is shown now, and the planet it shows. */
  stage: Stage;
  stagePlanet: number;
}

export const px = (f: { w: number; h: number }, p: P) => ({ x: p.x * f.w, y: p.y * f.h });

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** Smoothstep. */
export const sm = (a: number, b: number, x: number) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
/** A window that rises over [a, b] and falls over [c, d]. */
export const win = (a: number, b: number, c: number, d: number, x: number) => sm(a, b, x) * (1 - sm(c, d, x));

/** Shows a display object only when it would be seen (alpha), and sets it. */
export function vis(o: Container, alpha: number) {
  const on = alpha > 0.003;
  if (o.visible !== on) o.visible = on;
  if (on) o.alpha = alpha;
}

export function hash01(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 100000) / 100000;
}
