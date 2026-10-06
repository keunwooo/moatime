/**
 * Where things are in "처음의 우주": normalised screen coordinates (0..1 of the canvas) for the
 * wide and tall layouts. The composition flows in an S from the far upper left (the cosmic web)
 * through the left nebula down to the home star at the bottom, and out along its orbits to the
 * galaxy on the far right. The timer's quiet space in the middle holds no bodies or events.
 */

import { hash32 } from '../../core/rng';
import type { AspectClass } from '../../core/world';

export interface P {
  x: number;
  y: number;
}

export interface CosmosLayout {
  /** The single point of light before the Big Bang. */
  seed: P;
  /** The first-generation stars (the first is where the first nebula comes from). */
  firstGen: P[];
  /** The timer's quiet rectangle [x0, y0, x1, y1]. */
  timer: [number, number, number, number];
  nebulaA: { x0: number; y0: number; x1: number; y1: number; tail: P; core: P };
  nebulaB: { x0: number; y0: number; x1: number; y1: number; core: P };
  home: P;
  /** Orbit semi-major axes (fractions of the canvas width) and the flattening of the orbit plane. */
  orbits: { inner: number; life: number; giant: number; belt: number; tilt: number };
  /** Planet radii (fractions of the canvas width). */
  planetR: { inner: number; life: number; giant: number; star: number };
  galaxy: P & { r: number; tilt: number; angle: number };
  neighbour: P;
  /** Cluster slots c0..c3 (centres) and the spread of their four systems. */
  clusters: P[];
  clusterSpread: P;
  /** Where older zones recede to (direction per cluster slot). */
  recede: P[];
  /** The sky band for passing sights (comets, satellite galaxies) [y0, y1]. */
  band: [number, number];
}

export const LAYOUT: Record<AspectClass, CosmosLayout> = {
  wide: {
    seed: { x: 0.5, y: 0.76 },
    firstGen: [
      { x: 0.2, y: 0.55 },
      { x: 0.84, y: 0.44 },
      { x: 0.1, y: 0.24 },
      { x: 0.6, y: 0.12 },
      { x: 0.93, y: 0.7 },
    ],
    timer: [0.3, 0.2, 0.7, 0.66],
    nebulaA: { x0: -0.04, y0: 0.22, x1: 0.34, y1: 0.98, tail: { x: 0.42, y: 0.86 }, core: { x: 0.16, y: 0.55 } },
    nebulaB: { x0: 0.68, y0: 0.18, x1: 1.04, y1: 0.72, core: { x: 0.85, y: 0.44 } },
    home: { x: 0.5, y: 0.835 },
    orbits: { inner: 0.075, life: 0.2, giant: 0.335, belt: 0.27, tilt: 0.2 },
    planetR: { inner: 0.0062, life: 0.0168, giant: 0.0165, star: 0.012 },
    galaxy: { x: 0.83, y: 0.2, r: 0.12, tilt: 0.42, angle: -0.32 },
    neighbour: { x: 0.66, y: 0.08 },
    clusters: [
      { x: 0.14, y: 0.4 },
      { x: 0.83, y: 0.38 },
      { x: 0.1, y: 0.64 },
      { x: 0.88, y: 0.6 },
    ],
    clusterSpread: { x: 0.07, y: 0.07 },
    recede: [
      { x: -0.03, y: -0.08 },
      { x: 0.03, y: -0.08 },
      { x: -0.04, y: -0.05 },
      { x: 0.04, y: -0.06 },
    ],
    band: [0.06, 0.2],
  },
  tall: {
    seed: { x: 0.5, y: 0.74 },
    firstGen: [
      { x: 0.2, y: 0.6 },
      { x: 0.8, y: 0.57 },
      { x: 0.1, y: 0.05 },
      { x: 0.9, y: 0.04 },
      { x: 0.86, y: 0.7 },
    ],
    timer: [0.06, 0.08, 0.94, 0.5],
    nebulaA: { x0: -0.08, y0: 0.5, x1: 0.42, y1: 0.92, tail: { x: 0.42, y: 0.8 }, core: { x: 0.14, y: 0.62 } },
    nebulaB: { x0: 0.6, y0: 0.5, x1: 1.08, y1: 0.76, core: { x: 0.82, y: 0.58 } },
    home: { x: 0.5, y: 0.795 },
    orbits: { inner: 0.13, life: 0.29, giant: 0.44, belt: 0.37, tilt: 0.22 },
    planetR: { inner: 0.011, life: 0.042, giant: 0.034, star: 0.026 },
    galaxy: { x: 0.74, y: 0.62, r: 0.2, tilt: 0.42, angle: -0.3 },
    neighbour: { x: 0.48, y: 0.55 },
    clusters: [
      { x: 0.16, y: 0.56 },
      { x: 0.84, y: 0.66 },
      { x: 0.12, y: 0.7 },
      { x: 0.32, y: 0.6 },
    ],
    clusterSpread: { x: 0.1, y: 0.035 },
    recede: [
      { x: -0.04, y: -0.03 },
      { x: 0.04, y: -0.03 },
      { x: -0.04, y: -0.02 },
      { x: 0.0, y: -0.03 },
    ],
    band: [0.52, 0.6],
  },
};

const u01 = (...xs: number[]) => hash32(...xs) / 4294967296;

/**
 * Screen position of star system k (k ≥ 1) and its depth d (0 = the zone forming now, 1 and 2 =
 * older zones receding). Systems of a cluster sit around the cluster's centre.
 */
export function systemPos(L: CosmosLayout, seed: number, k: number, currentZone: number): P & { d: number; c: number } {
  const z = Math.floor(k / 16);
  const c = Math.floor((k % 16) / 4);
  const j = k % 4;
  const d = Math.max(0, currentZone - z);
  const ctr = L.clusters[c];
  const ang = (j / 4) * Math.PI * 2 + u01(seed, 801, k) * 1.2;
  const rad = 0.35 + 0.65 * u01(seed, 802, k);
  const back = L.recede[c];
  const k0 = Math.pow(0.6, d);
  return {
    x: ctr.x + Math.cos(ang) * rad * L.clusterSpread.x * k0 + back.x * d,
    y: ctr.y + Math.sin(ang) * rad * L.clusterSpread.y * k0 + back.y * d,
    d,
    c,
  };
}
