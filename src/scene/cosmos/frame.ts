/** What every system of "처음의 우주" reads each frame. */

import type { Container } from 'pixi.js';
import type { AspectClass } from '../../core/world';
import type { CosmosSim } from '../../sim/cosmos';
import type { SpaceWeather } from '../../world/cosmos';
import type { WorldEvent } from '../../world/timeline';
import type { FrameInfo } from '../types';
import type { CosmosLayout, P } from './layout';

export interface CosmosFrame extends FrameInfo {
  sim: CosmosSim;
  seed: number;
  /** The universe's age (ms) and in seconds. */
  A: number;
  As: number;
  /** World time at which the universe began. */
  origin: number;
  aspect: AspectClass;
  L: CosmosLayout;
  stage: number;
  /** The headline on view (times in W) and its progress 0..1. */
  event: WorldEvent | null;
  eventP: number;
  weather: SpaceWeather;
  /** Viewport size in px. */
  w: number;
  h: number;
  /** Reference length for sizes (the canvas width). */
  R: number;
  /** Real seconds since the last live completion (−1 none): the completion flourish. */
  celebrateT: number;
}

export const px = (f: { w: number; h: number }, p: P) => ({ x: p.x * f.w, y: p.y * f.h });

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Smoothstep on seconds. */
export const sm = (a: number, b: number, x: number) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** A window that rises over [a, b] and falls over [c, d]. */
export const env = (a: number, b: number, c: number, d: number, x: number) => sm(a, b, x) * (1 - sm(c, d, x));

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

/** The headline's kind if it is `kind`, else null; with progress. */
export function eventIs(f: CosmosFrame, ...kinds: string[]): { p: number; seed: number; kind: string } | null {
  const e = f.event;
  if (!e || !kinds.includes(e.kind)) return null;
  return { p: f.eventP, seed: e.seed, kind: e.kind };
}

/** Colour lerp on packed 0xRRGGBB. */
export function mixHex(a: number, b: number, k: number): number {
  const t = clamp01(k);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
