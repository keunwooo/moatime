/**
 * Camera rig and framing.
 *
 * Each theme chooses a framing from the simulated work (see ThemeScene.framing): a stable work
 * area made of fixed places (spring, bench, depot, deposit, the site) and the units already
 * grown there, sized by stage extents, never by a moving worker or a target's momentary size.
 * The framing is solved so the subject fits a screen region that keeps the center free for the
 * timer. The rig follows targets with a two-stage low-pass filter: zero velocity at both ends
 * and C¹-continuous even when the target changes mid-move.
 */

import type { AspectClass } from '../core/world';
import { Projector, type CamParams, type Viewport } from './diorama';

const KEYS: (keyof CamParams)[] = ['fx', 'fz', 'lk', 'sx', 'sy', 'hy'];

export class CameraRig {
  target: CamParams | null = null;
  private s1: CamParams | null = null;
  current: CamParams | null = null;
  tau = 3;

  setTarget(p: CamParams, tau: number, snap: boolean) {
    this.target = { ...p };
    this.tau = tau;
    if (snap || !this.current || !this.s1) {
      this.s1 = { ...p };
      this.current = { ...p };
    }
  }

  /** Advances the follow filter by dt seconds. Returns true while still moving noticeably. */
  update(dt: number): boolean {
    if (!this.target || !this.s1 || !this.current) return false;
    const a = 1 - Math.exp(-Math.max(0, dt) / this.tau);
    let moving = false;
    for (const k of KEYS) {
      this.s1[k] += (this.target[k] - this.s1[k]) * a;
      const before = this.current[k];
      this.current[k] += (this.s1[k] - this.current[k]) * a;
      const scale = k === 'fx' || k === 'fz' ? 0.05 : 0.00005;
      if (Math.abs(this.current[k] - before) > scale * Math.max(dt, 1e-3) * 60) moving = true;
    }
    return moving;
  }
}

// ---------------------------------------------------------------------------
// Framing

export type FramingKind = 'work' | 'grow' | 'outpost' | 'reveal' | 'overview';

export interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export type RegionName = 'work' | 'left' | 'right' | 'low' | 'wide';
export type RegionOverrides = Partial<Record<AspectClass, Partial<Record<RegionName, Region>>>>;

export interface SubjectBox {
  x0: number;
  x1: number;
  z: number;
  h: number;
  /** Placeholder for a future site: framed, but not used for the minimum observation size. */
  marker?: boolean;
}

export interface Framing {
  key: string;
  kind: FramingKind;
  tau: number;
  boxes: SubjectBox[];
  region: Region;
  hy: number;
  /** Zoom limits in px per world unit at the focus (stable close-ups, never a dot). */
  maxK?: number;
  minK?: number;
}

export interface UnitExtents {
  close: { w: number; h: number };
  sapling: { w: number; h: number };
  mature: { w: number; h: number };
}

/**
 * Screen regions (fractions of the viewport). The timer sits around the center; work happens
 * in the band below it or at the sides.
 */
export const BASE_REGIONS: Record<AspectClass, Record<RegionName, Region>> = {
  wide: {
    work: { x0: 0.27, x1: 0.73, y0: 0.665, y1: 0.9 },
    left: { x0: 0.04, x1: 0.47, y0: 0.3, y1: 0.92 },
    right: { x0: 0.53, x1: 0.96, y0: 0.3, y1: 0.92 },
    low: { x0: 0.05, x1: 0.95, y0: 0.6, y1: 0.93 },
    wide: { x0: 0.03, x1: 0.97, y0: 0.45, y1: 0.94 },
  },
  tall: {
    work: { x0: 0.05, x1: 0.95, y0: 0.66, y1: 0.89 },
    left: { x0: 0.05, x1: 0.95, y0: 0.5, y1: 0.9 },
    right: { x0: 0.05, x1: 0.95, y0: 0.5, y1: 0.9 },
    low: { x0: 0.04, x1: 0.96, y0: 0.6, y1: 0.9 },
    wide: { x0: 0.03, x1: 0.97, y0: 0.52, y1: 0.92 },
  },
};

export const HORIZON: Record<AspectClass, Record<FramingKind, number>> = {
  wide: { work: 0.6, grow: 0.59, outpost: 0.58, reveal: 0.56, overview: 0.56 },
  tall: { work: 0.58, grow: 0.56, outpost: 0.55, reveal: 0.53, overview: 0.53 },
};

export function regionOf(aspect: AspectClass, name: RegionName, overrides?: RegionOverrides): Region {
  return overrides?.[aspect]?.[name] ?? BASE_REGIONS[aspect][name];
}

export function box(x: number, z: number, w: number, h: number, marker = false): SubjectBox {
  return { x0: x - w / 2, x1: x + w / 2, z, h, marker };
}

export interface SolveLimits {
  /** Minimum on-screen height of a grown unit in px. */
  minUnitPx: number;
  unitHeight: number;
}

/** Finds camera parameters so all subject boxes fit the region as large as possible. */
export function solveFraming(fr: Framing, vp: Viewport, lim: SolveLimits): CamParams {
  const front = fr.boxes.reduce((m, b) => Math.min(m, b.z), Infinity);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const b of fr.boxes) {
    minX = Math.min(minX, b.x0);
    maxX = Math.max(maxX, b.x1);
  }
  const R = fr.region;
  const base: Omit<CamParams, 'lk'> = {
    fx: (minX + maxX) / 2,
    fz: front,
    sx: (R.x0 + R.x1) / 2,
    sy: R.y1,
    hy: fr.hy,
  };
  const proj = new Projector();
  const fits = (lk: number) => {
    proj.set({ ...base, lk }, vp);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    for (const b of fr.boxes) {
      const s = proj.scale(b.z);
      if (s <= 0) return false;
      x0 = Math.min(x0, proj.sx(b.x0, b.z));
      x1 = Math.max(x1, proj.sx(b.x1, b.z));
      y0 = Math.min(y0, proj.sy(b.h, b.z));
    }
    const halfW = ((R.x1 - R.x0) * vp.w) / 2;
    const cx = base.sx * vp.w;
    return x0 >= cx - halfW - 0.5 && x1 <= cx + halfW + 0.5 && y0 >= R.y0 * vp.h;
  };
  let lo = Math.log(0.02);
  let hi = Math.log(12);
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (fits(m)) lo = m;
    else hi = m;
  }
  let lk = lo;
  if (fr.maxK) lk = Math.min(lk, Math.log(fr.maxK * Math.max(0.8, Math.min(1.4, Math.min(vp.w, vp.h) / 800))));
  if (fr.minK) lk = Math.max(lk, Math.log(fr.minK));
  // Never zoom out so far that the deepest grown subject shrinks below the observation size.
  const back = fr.boxes.reduce((m, b) => (b.marker ? m : Math.max(m, b.z)), -Infinity);
  for (let i = 0; i < 30 && Number.isFinite(back); i++) {
    proj.set({ ...base, lk }, vp);
    if (proj.scale(back) * lim.unitHeight >= lim.minUnitPx) break;
    lk += 0.03;
  }
  return { ...base, lk };
}

/** Smallest on-screen height of a grown unit: never a dot, even in the widest view. */
export function minUnitPx(vp: Viewport): number {
  return Math.max(64, Math.min(vp.w, vp.h) * 0.085);
}
