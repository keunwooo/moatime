import type { Amt } from '../../../sim/config';
import type { SpaceSim } from '../../../sim/space';
import type { Step } from '../../../sim/types';
import type { SceneCtx } from '../../system';
import type { FrameInfo } from '../../types';
import type { RoverMode } from '../drone';
import type { SpaceTextures } from '../textures';
import type { SpaceZone } from '../zone';

export type SpaceCtx = SceneCtx<SpaceTextures>;

export interface SpaceFrame extends FrameInfo {
  sim: SpaceSim;
  /** World time in seconds (step-driven poses). */
  wt: number;
}

export interface RoverNow {
  x: number;
  z: number;
  facing: number;
  mode: RoverMode;
  st: Step;
  k: number;
}

export interface Flight {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  k: number;
  kind: 'crate' | 'ore';
  tint: number;
}

/** What the rovers are doing right now and what it moves between the piles. */
export interface SpaceWork {
  now: (RoverNow | undefined)[];
  flights: Flight[];
  /** Crates on the depot pile and at the site, by resource, as they look this frame. */
  depot: Amt;
  reserved: number;
  site: Amt;
  charging: boolean;
  /** A power line being laid to outpost c, k of the way there. */
  link: { c: number; k: number } | null;
  setupK: number;
  surveyK: number;
  careUnit: number;
  careK: number;
  siteEntry: ReturnType<SpaceZone['facilityFor']>;
  /** The active zone (for buildings other than the site: repairs, rebuilding). */
  zone: SpaceZone | undefined;
}

export function stepP(st: Step, W: number): number {
  return st.t1 > st.t0 ? Math.min(1, Math.max(0, (W - st.t0) / (st.t1 - st.t0))) : 1;
}

/** Gentle start and stop, steady in between; the wheels turn by exactly this distance. */
export function ease(p: number): number {
  const a = 0.18;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const v = 1 / (1 - a);
  if (p < a) return (v * p * p) / (2 * a);
  if (p > 1 - a) return 1 - (v * (1 - p) * (1 - p)) / (2 * a);
  return v * (p - a / 2);
}

/** Items of an n-item transfer that have left the source / reached the target at progress p. */
export function transfer(n: number, p: number): { lifted: number; landed: number; items: { i: number; k: number }[] } {
  let lifted = 0;
  let landed = 0;
  const items: { i: number; k: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = 0.12 + (i / n) * 0.72;
    const b = a + 0.72 / n;
    if (p >= a) lifted++;
    if (p >= b) landed++;
    else if (p >= a) items.push({ i, k: (p - a) / (b - a) });
  }
  return { lifted, landed, items };
}
