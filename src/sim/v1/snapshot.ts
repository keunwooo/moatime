/**
 * Frozen simulation version 1 (data version 2). Do not edit any file in this folder: it is
 * the exact rule set that produced the worlds saved before data version 3, kept only so a
 * saved world can be migrated with the progress it really had.
 *
 * `snapshotV1` replays a v2 world to its banked time and reports, per theme, how many units
 * were complete and how far the next one was. The current simulation starts from that point.
 */

import { advanceForest, cloneForest, forestCtx, forestUnitProgress, initForest, type ForestSim } from './forest';
import { advanceSpace, cloneSpace, initSpace, spaceCtx, spaceUnitProgress, type SpaceSim } from './space';
import type { SimBase } from './types';

export interface V1ThemeProgress {
  units: number;
  /** Progress of the unit in work (0..1). */
  partial: number;
}

export interface V1Progress {
  forest: V1ThemeProgress;
  /** `kindsFrom`: units below it kept the kinds of the timer rules (v1 migration). */
  space: V1ThemeProgress & { kindsFrom: number };
}

/** A stored checkpoint of the v2 app (`moa:v2:sim:<theme>`), used only to speed this up. */
interface V1Checkpoint {
  worldId: string;
  simVersion: number;
  theme: string;
  baseW: number;
  W: number;
  state: unknown;
}

function usable(cp: unknown, theme: string, worldId: string, base: SimBase, W: number): unknown | null {
  if (!cp || typeof cp !== 'object') return null;
  const c = cp as V1Checkpoint;
  if (c.simVersion !== 1 || c.theme !== theme || c.worldId !== worldId || c.baseW !== base.W) return null;
  if (typeof c.W !== 'number' || c.W > W || c.W < base.W || !c.state || typeof c.state !== 'object') return null;
  return c.state;
}

const clamp01 = (x: number) => Math.min(1 - 1e-9, Math.max(0, x));

export function snapshotV1(worldId: string, seed: number, base: SimBase, W: number, cached: { forest?: unknown; space?: unknown } = {}): V1Progress {
  // forest
  let f: ForestSim;
  const fcp = usable(cached.forest, 'forest', worldId, base, W);
  try {
    f = fcp ? cloneForest(fcp as ForestSim) : initForest(seed, base);
    advanceForest(f, forestCtx(seed), W);
  } catch {
    f = initForest(seed, base);
    advanceForest(f, forestCtx(seed), W);
  }
  const fp = forestUnitProgress(f, f.tree.unit, W) ?? 0;
  // space
  let s: SpaceSim;
  const scp = usable(cached.space, 'space', worldId, base, W);
  try {
    s = scp ? cloneSpace(scp as SpaceSim) : initSpace(seed, base);
    advanceSpace(s, spaceCtx(seed), W);
  } catch {
    s = initSpace(seed, base);
    advanceSpace(s, spaceCtx(seed), W);
  }
  const sp = spaceUnitProgress(s, s.proj.unit, W) ?? 0;
  return {
    forest: { units: f.done, partial: clamp01(fp) },
    space: { units: s.done, partial: clamp01(sp), kindsFrom: s.legacyUnits },
  };
}
