/**
 * Where everything sits on the front's battlefield (docs/FRONT.md 6.3절). Positions are map
 * coordinates: x 0..1 left → right, y 0..1 far → near; at zoom 1 they equal screen fractions.
 * The timer sits over the time-crystal lake, which nothing crosses.
 */

import { hash32 } from '../../core/rng';
import type { AspectClass } from '../../core/world';
import { NAT, RIVAL_HOME, SITE_COUNT, HOME } from '../../sim/front';

export interface P {
  x: number;
  y: number;
}

export interface FrontLayout {
  timer: [number, number, number, number];
  lake: { c: P; r: P };
  home: P;
  homeR: P;
  /** The natural expansion on the left or right of home. */
  nat: [P, P];
  rivalHome: [P, P];
  rivalR: P;
  /** Expansion sites 0–5 up the left side, 6–11 up the right side (before jitter). */
  sites: P[];
  /** The sky band at the top (y0, y1). */
  sky: [number, number];
  /** Map top (fraction of the height): above it is the sky band. */
  top: number;
  /** Minimap size in px and its margins. */
  minimap: { w: number; h: number; x: number; yFromBottom: number };
  /** Size reference: a soldier's height as a fraction of the viewport height. */
  unitH: number;
  /** Cliff height of one level of high ground (fraction of the height). */
  cliff: number;
}

const mirror = (ps: P[]) => ps.map((p) => ({ x: 1 - p.x, y: p.y }));

const WIDE_LEFT: P[] = [
  { x: 0.1, y: 0.7 },
  { x: 0.25, y: 0.645 },
  { x: 0.075, y: 0.53 },
  { x: 0.225, y: 0.44 },
  { x: 0.07, y: 0.355 },
  { x: 0.245, y: 0.3 },
];

const TALL_LEFT: P[] = [
  { x: 0.1, y: 0.79 },
  { x: 0.33, y: 0.745 },
  { x: 0.08, y: 0.695 },
  { x: 0.3, y: 0.645 },
  { x: 0.09, y: 0.6 },
  { x: 0.3, y: 0.555 },
];

export const LAYOUT: Record<AspectClass, FrontLayout> = {
  wide: {
    timer: [0.33, 0.26, 0.67, 0.62],
    lake: { c: { x: 0.5, y: 0.47 }, r: { x: 0.215, y: 0.16 } },
    home: { x: 0.5, y: 0.87 },
    homeR: { x: 0.125, y: 0.082 },
    nat: [
      { x: 0.235, y: 0.8 },
      { x: 0.765, y: 0.8 },
    ],
    rivalHome: [
      { x: 0.115, y: 0.205 },
      { x: 0.885, y: 0.205 },
    ],
    rivalR: { x: 0.105, y: 0.075 },
    sites: [...WIDE_LEFT, ...mirror(WIDE_LEFT)],
    sky: [0, 0.11],
    top: 0.1,
    minimap: { w: 140, h: 100, x: 18, yFromBottom: 54 },
    unitH: 0.017,
    cliff: 0.032,
  },
  tall: {
    timer: [0.06, 0.12, 0.94, 0.48],
    lake: { c: { x: 0.5, y: 0.33 }, r: { x: 0.44, y: 0.17 } },
    home: { x: 0.5, y: 0.915 },
    homeR: { x: 0.24, y: 0.05 },
    nat: [
      { x: 0.18, y: 0.855 },
      { x: 0.82, y: 0.855 },
    ],
    rivalHome: [
      { x: 0.15, y: 0.525 },
      { x: 0.85, y: 0.525 },
    ],
    rivalR: { x: 0.14, y: 0.035 },
    sites: [...TALL_LEFT, ...mirror(TALL_LEFT)],
    sky: [0, 0.08],
    top: 0.075,
    minimap: { w: 96, h: 68, x: 12, yFromBottom: 50 },
    unitH: 0.012,
    cliff: 0.018,
  },
};

const u01 = (...xs: number[]) => hash32(...xs) / 4294967296;

/** Map position of a site on a planet (expansion sites are shaken a little by the planet). */
export function sitePos(L: FrontLayout, planetSeed: number, site: number, natSide: 0 | 1): P {
  if (site === HOME) return L.home;
  if (site === NAT) return L.nat[natSide];
  if (site === RIVAL_HOME[0]) return L.rivalHome[0];
  if (site === RIVAL_HOME[1]) return L.rivalHome[1];
  const b = L.sites[site];
  if (!b || site >= SITE_COUNT) return L.home;
  const jx = (u01(planetSeed, site, 31) - 0.5) * 0.035;
  const jy = (u01(planetSeed, site, 32) - 0.5) * 0.03;
  return { x: b.x + jx, y: b.y + jy };
}

/** High-ground level at a map point: the home plateau and the rivals' homes stand one level up. */
export function levelAt(L: FrontLayout, p: P): number {
  const inEll = (c: P, r: P) => ((p.x - c.x) / r.x) ** 2 + ((p.y - c.y) / r.y) ** 2 < 1;
  if (inEll(L.home, L.homeR)) return 1;
  if (inEll(L.rivalHome[0], L.rivalR) || inEll(L.rivalHome[1], L.rivalR)) return 1;
  return 0;
}

/** True if a map point lies in the lake (with a margin). */
export function inLake(L: FrontLayout, p: P, margin = 0): boolean {
  return ((p.x - L.lake.c.x) / (L.lake.r.x + margin)) ** 2 + ((p.y - L.lake.c.y) / (L.lake.r.y + margin)) ** 2 < 1;
}

/** True if a map point lies behind the timer (with a margin). */
export function inTimer(L: FrontLayout, p: P, margin = 0): boolean {
  const [x0, y0, x1, y1] = L.timer;
  return p.x > x0 - margin && p.x < x1 + margin && p.y > y0 - margin && p.y < y1 + margin;
}

/**
 * A path from a to b that bends around the lake and the timer: the midpoint is pushed out to
 * the side the two points are on (fights and marches keep to the shores and the flanks).
 */
export function pathAround(L: FrontLayout, a: P, b: P, t: number): P {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (inLake(L, mid, 0.03) || inTimer(L, mid, 0.02)) {
    const side = mid.x < L.lake.c.x ? -1 : 1;
    mid.x = L.lake.c.x + side * (L.lake.r.x + 0.06);
  }
  const it = 1 - t;
  return { x: it * it * a.x + 2 * it * t * mid.x + t * t * b.x, y: it * it * a.y + 2 * it * t * mid.y + t * t * b.y };
}

/** Size factor of something standing at map depth y (far things are smaller). */
export const depthScale = (y: number) => 0.8 + 0.3 * y;
