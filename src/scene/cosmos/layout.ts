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
    band: [0.52, 0.6],
  },
};

const u01 = (...xs: number[]) => hash32(...xs) / 4294967296;

/** Clusters kept apart from when new ones look for room (older ones may be overlaid). */
const ROOM_WINDOW = 40;

const centreMemo = new WeakMap<CosmosLayout, Map<number, P[]>>();

/** Whether a point is free sky: clear of the timer, the home orbits, the top bar and the galaxy's core. */
function freeSky(L: CosmosLayout, x: number, y: number): boolean {
  const [tx0, ty0, tx1, ty1] = L.timer;
  if (x > tx0 - 0.03 && x < tx1 + 0.03 && y > ty0 - 0.03 && y < ty1 + 0.03) return false;
  const wide = L.home.y < 0.84;
  const orbitTop = L.home.y - L.orbits.giant * L.orbits.tilt * (wide ? 1.75 : 0.5) - 0.04;
  if (y > orbitTop && x > L.home.x - L.orbits.giant - 0.03 && x < L.home.x + L.orbits.giant + 0.03) return false;
  if (y < 0.08) return false;
  if (Math.hypot(x - L.galaxy.x, (y - L.galaxy.y) * 1.6) < L.galaxy.r * 0.55) return false;
  return true;
}

/**
 * Centre of cluster ci. The first four keep their places (left and right of the timer); every later
 * one settles where the sky is emptiest among the most recent clusters (best of 28 seeded candidates),
 * so the sky fills up as the universe grows instead of stacking on the same spots.
 */
export function clusterCentre(L: CosmosLayout, seed: number, ci: number): P {
  if (ci < L.clusters.length) return L.clusters[ci];
  let bySeed = centreMemo.get(L);
  if (!bySeed) {
    bySeed = new Map();
    centreMemo.set(L, bySeed);
  }
  let list = bySeed.get(seed);
  if (!list) {
    list = [...L.clusters];
    if (bySeed.size > 8) bySeed.clear();
    bySeed.set(seed, list);
  }
  const wide = L.home.y < 0.84;
  const yk = wide ? 0.6 : 1.6;
  while (list.length <= ci) {
    const n = list.length;
    let best: P | null = null;
    let bestD = -1;
    for (let j = 0; j < 28; j++) {
      const x = 0.03 + 0.94 * u01(seed, 811, n, j);
      const y = 0.08 + 0.86 * u01(seed, 812, n, j);
      if (!freeSky(L, x, y)) continue;
      let d = Infinity;
      for (let m = Math.max(0, n - ROOM_WINDOW); m < n; m++) d = Math.min(d, Math.hypot(x - list[m].x, (y - list[m].y) * yk));
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    list.push(best ?? L.clusters[n % L.clusters.length]);
  }
  return list[ci];
}

export interface SystemPlace extends P {
  /** Cluster index (4 systems each) and a size factor (later clusters sit a little farther off). */
  c: number;
  scale: number;
}

/** Screen position of star system k (k ≥ 1): around its cluster's centre, never in the timer's space. */
export function systemPos(L: CosmosLayout, seed: number, k: number): SystemPlace {
  const c = Math.floor(k / 4);
  const j = k % 4;
  const ctr = clusterCentre(L, seed, c);
  const ang = (j / 4) * Math.PI * 2 + u01(seed, 801, k) * 1.2;
  const rad = 0.35 + 0.65 * u01(seed, 802, k);
  const scale = c < 4 ? 1 : 0.72 + 0.3 * u01(seed, 803, c);
  let x = ctr.x + Math.cos(ang) * rad * L.clusterSpread.x * scale;
  let y = ctr.y + Math.sin(ang) * rad * L.clusterSpread.y * scale;
  // a cluster at the timer's edge keeps its systems just outside it
  const [tx0, ty0, tx1, ty1] = L.timer;
  const e = 0.012;
  if (x > tx0 - e && x < tx1 + e && y > ty0 - e && y < ty1 + e) {
    const d = [x - (tx0 - e), tx1 + e - x, y - (ty0 - e), ty1 + e - y];
    const i = d.indexOf(Math.min(...d));
    if (i === 0) x = tx0 - e;
    else if (i === 1) x = tx1 + e;
    else if (i === 2) y = ty0 - e;
    else y = ty1 + e;
  }
  return { x, y, c, scale };
}

// ---- paths that keep clear of the timer ----------------------------------------------------------

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** A path in layout coordinates, sampled finely, with its cumulative length (0..1) for even travel. */
export interface Path {
  pts: P[];
  at: number[];
  /** Total length (layout units). */
  len: number;
}

const bez = (a: P, c: P, b: P, t: number): P => {
  const it = 1 - t;
  return { x: it * it * a.x + 2 * it * t * c.x + t * t * b.x, y: it * it * a.y + 2 * it * t * c.y + t * t * b.y };
};

function makePath(pts: P[]): Path {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = at[at.length - 1] || 1;
  return { pts, at: at.map((d) => d / total), len: total };
}

/** The point `t` (0..1) of the way along a path. */
export function pathAt(path: Path, t: number): P {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const { pts, at } = path;
  let i = 1;
  while (i < at.length - 1 && at[i] < u) i++;
  const k = (u - at[i - 1]) / Math.max(1e-9, at[i] - at[i - 1]);
  return { x: mix(pts[i - 1].x, pts[i].x, k), y: mix(pts[i - 1].y, pts[i].y, k) };
}

/** A smooth curve through the points (Catmull-Rom), `n` samples per span. */
function smooth(pts: P[], n: number): P[] {
  if (pts.length < 3) return pts;
  const out: P[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * A path between two points that stays clear of the timer: a gentle bow if the way is open,
 * otherwise around one or two of the timer's corners, whichever way is shortest. (A system may sit
 * right at the timer's edge; its path then starts with a short step straight out.)
 */
export function pathAround(L: CosmosLayout, from: P, to: P): Path {
  const [tx0, ty0, tx1, ty1] = L.timer;
  const m = 0.02;
  const inRect = (q: P, e: number) => q.x > tx0 - e && q.x < tx1 + e && q.y > ty0 - e && q.y < ty1 + e;
  // an end at (or just inside) the timer's edge first steps straight out past it
  const out = (q: P): P => {
    if (!inRect(q, m + 0.004)) return q;
    const e = m + 0.012;
    const d = [q.x - (tx0 - e), tx1 + e - q.x, q.y - (ty0 - e), ty1 + e - q.y];
    const i = d.indexOf(Math.min(...d));
    return i === 0 ? { x: tx0 - e, y: q.y } : i === 1 ? { x: tx1 + e, y: q.y } : i === 2 ? { x: q.x, y: ty0 - e } : { x: q.x, y: ty1 + e };
  };
  const a = out(from);
  const b = out(to);
  const ends = (pts: P[]) => [...(a === from ? [] : [from]), ...pts, ...(b === to ? [] : [to])];
  const inside = (q: P) => inRect(q, m);
  const direct = Array.from({ length: 25 }, (_, i) => bez(a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 0.06 }, b, i / 24));
  if (!direct.some(inside)) return makePath(ends(direct));
  const pad = 0.06;
  const TL = { x: tx0 - pad, y: ty0 - pad };
  const TR = { x: tx1 + pad, y: ty0 - pad };
  const BL = { x: tx0 - pad, y: ty1 + pad };
  const BR = { x: tx1 + pad, y: ty1 + pad };
  const ways = [[TL], [TR], [BL], [BR], [BL, TL], [TL, BL], [BR, TR], [TR, BR], [TL, TR], [TR, TL], [BL, BR], [BR, BL]];
  const clear = (p: P, q: P) => {
    for (let i = 0; i <= 20; i++) if (inside({ x: mix(p.x, q.x, i / 20), y: mix(p.y, q.y, i / 20) })) return false;
    return true;
  };
  let best: P[] = [a, b];
  let bestLen = Infinity;
  for (const way of ways) {
    const poly = [a, ...way, b];
    let len = 0;
    let ok = true;
    for (let i = 0; i < poly.length - 1 && ok; i++) {
      ok = clear(poly[i], poly[i + 1]);
      len += Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y);
    }
    if (ok && len < bestLen) {
      bestLen = len;
      best = poly;
    }
  }
  return makePath(ends(smooth(best, 10)));
}
