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

/** Legacy (v1 timer-spawn rules) progress carried into the new simulation at migration. */
export interface LegacyBase {
  /** Units complete under the old rules. */
  units: number;
  /** Progress of the unit that was growing (0..1). */
  partial: number;
}

/** Where a world's simulation starts. */
export interface SimBase {
  /** World time of the starting point (0 for a new world, the migration point otherwise). */
  W: number;
  legacy: LegacyBase | null;
}
