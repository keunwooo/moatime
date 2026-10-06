/**
 * Shared simulation types. A simulation state is plain JSON (checkpoints are stored as is)
 * and changes only at event times. Between events the scene interpolates each worker's
 * current step by world time, so what is drawn always follows the simulated state.
 */

import type { NodeId } from './layout';

/** One thing a worker does: moving from `a` to `b`, or working in place (`a === b`). */
export interface Step {
  /** Activity (drives pose and tools). */
  k: string;
  a: NodeId;
  b: NodeId;
  t0: number;
  t1: number;
  /** Amount carried during the step. */
  n: number;
  /** What is carried: '' nothing, 'ore', 'crate', 'water', 'seed', 'leaf', 'mould'. */
  c: string;
  /** Unit or cluster the step refers to (for the scene), -1 if none. */
  ref: number;
  /** Effect applied when the step ends ('' none). */
  fx: string;
}

/** A planned step; its start time is set when it begins. dur < 0: computed at start. */
export interface Planned {
  k: string;
  a: NodeId;
  b: NodeId;
  dur: number;
  n: number;
  c: string;
  ref: number;
  /** Effect applied when the step ends. */
  fx: string;
}

export interface Worker {
  id: number;
  /** Where the worker is when no step is running (end of the last step). */
  at: NodeId;
  step: Step | null;
  plan: Planned[];
  /** Job label for status text, e.g. 'mine', 'haul', 'build'. */
  job: string;
  /** World time this worker appeared (helpers arrive later). */
  born: number;
}

export interface CompletionLog {
  /** unit index */
  u: number;
  /** completion time (W) */
  W: number;
}

/** Progress of one theme at a starting point: units complete, and how far the next one was. */
export interface ThemeBase {
  /** Units complete. */
  units: number;
  /** Progress of the unit in work (0..1). */
  partial: number;
}

/** Legacy (v1 timer-spawn rules) progress carried into the simulation at migration. */
export type LegacyBase = ThemeBase;

/** Space progress from the frozen simulation v1 (data version 2). */
export interface SpaceThemeBase extends ThemeBase {
  /** Units below this kept the facility kinds of the timer-spawn rules. */
  kindsFrom: number;
}

/** Where a world's simulation starts. */
export interface SimBase {
  /** World time of the starting point (0 for a new world, the migration point otherwise). */
  W: number;
  /** Same progress for both themes (migrated from the timer-spawn rules, data version 1). */
  legacy: LegacyBase | null;
  /** Per-theme progress (migrated from data version 2); takes precedence over `legacy`. */
  forest?: ThemeBase;
  space?: SpaceThemeBase;
}
