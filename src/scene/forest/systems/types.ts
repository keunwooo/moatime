import type { ForestSim } from '../../../sim/forest';
import type { SeasonMix } from '../../../world/season';
import type { Step } from '../../../sim/types';
import type { SceneCtx } from '../../system';
import type { FrameInfo } from '../../types';
import type { ForestTextures } from '../textures';
import type { KeeperMode } from '../keeper';

export type ForestCtx = SceneCtx<ForestTextures>;

/** One forest frame: the host's frame plus what every system reads. */
export interface ForestFrame extends FrameInfo {
  sim: ForestSim;
  season: SeasonMix;
  /** World time in seconds (step-driven poses). */
  wt: number;
  /** Stage of the forest (1..10), from the simulation. */
  stage: number;
}

/** The keeper's current step and what it changes on screen right now. */
export interface KeeperWork {
  st: Step | null;
  p: number;
  mode: KeeperMode;
  kx: number;
  kz: number;
  ky: number;
  carry: '' | 'leaf' | 'mould' | 'seed' | 'seedbox';
  carryN: number;
  picking: Map<number, { seeds: number; leaves: number }>;
  basket: number;
  basketHome: boolean;
  barrelBuild: number;
  digging: number;
  clearing: { unit: number; k: number } | null;
  stir: { cluster: number; k: number } | null;
  bedMaking: { c: number; k: number; p: number } | null;
  /** Progress of digging or lining the zone's pond right now (0 none). */
  pondDig: number;
  pondLine: number;
}

export function stepP(st: Step, W: number): number {
  return st.t1 > st.t0 ? Math.min(1, Math.max(0, (W - st.t0) / (st.t1 - st.t0))) : 1;
}

/** Gentle start and stop, steady in between (walks). */
export function ease(p: number): number {
  const a = 0.15;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const v = 1 / (1 - a);
  if (p < a) return (v * p * p) / (2 * a);
  if (p > 1 - a) return 1 - (v * (1 - p) * (1 - p)) / (2 * a);
  return v * (p - a / 2);
}
