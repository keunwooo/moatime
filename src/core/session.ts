/**
 * Pure timer/session state machine.
 *
 * Three different times are kept apart:
 *   T  targetMs        when this countdown ends (countdown only)
 *   E  sessionElapsed  running time of this session, pauses excluded, capped at T
 *   W  worldTime       banked world time + E of the open session
 *
 * E is always derived from stored timestamps, never from incrementing ticks, so
 * reloads, duplicate events and multiple tabs cannot count the same interval twice.
 */

import { CURRENT_RULES_VERSION } from './rules';
import { randomId, randomSeed } from './rng';
import type { EffectLevel } from '../sim/config';
import type { SimBase } from '../sim/types';
import { PACE, type PaceSeg } from '../world/pace';

export type Mode = 'countdown' | 'stopwatch';
export type ThemeId = 'forest' | 'space';
export type Status = 'idle' | 'running' | 'paused' | 'completed';
export type MotionPref = 'system' | 'reduce' | 'full';

export interface Session {
  id: string;
  mode: Mode;
  status: 'running' | 'paused' | 'completed';
  /** T. null for stopwatch. */
  targetMs: number | null;
  /** Running time of closed segments. */
  accruedMs: number;
  /** Wall-clock start of the open running segment, null when not running. */
  segmentStartedAt: number | null;
  startedAt: number;
  endedAt: number | null;
  /** Banked world time when this session started (for the summary). */
  worldMsAtStart: number;
  /** True once E has been added to world.bankedMs (exactly once). */
  banked: boolean;
  endReason: 'timer' | 'user' | null;
}

export interface World {
  id: string;
  seed: number;
  rulesVersion: number;
  bankedMs: number;
  createdAt: number;
  /**
   * Starting point of the work simulation: W = 0 for a new world; for a migrated world, the
   * migration point with the units completed by then (per theme for data version 2 worlds).
   */
  base: SimBase;
  /** Set once when the world came from an older data version (never re-applied). */
  migratedFrom?: { v: number; rulesVersion: number; W: number; at: number };
  /** One segment per focus session in world time (raids are paced to fit the sessions). */
  pace?: PaceSeg[];
}

export interface Settings {
  theme: ThemeId;
  mode: Mode;
  /** Default countdown length (convenience only, never a limit). */
  countdownMs: number;
  ambientSound: boolean;
  chime: boolean;
  motion: MotionPref;
  cameraLock: boolean;
  lowPower: boolean;
  showDays: boolean;
  /** Density of decorative effects only (never production). */
  effects: EffectLevel;
}

export interface Marks {
  /** Session whose completion flourish was already shown, so it never replays. */
  celebratedSessionId: string | null;
}

export interface ArchivedWorld extends World {
  archivedAt: number;
}

/** Data version of the stored state. 1: timer-spawn rules; 2: work simulation; 3: living world. */
export const DATA_VERSION = 3;

export interface Persisted {
  v: 3;
  rev: number;
  updatedAt: number;
  world: World;
  session: Session | null;
  settings: Settings;
  marks: Marks;
  archive: ArchivedWorld[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'forest',
  mode: 'countdown',
  countdownMs: 25 * 60 * 1000,
  ambientSound: false,
  chime: false,
  motion: 'system',
  cameraLock: false,
  lowPower: false,
  showDays: false,
  effects: 'default',
};

/** Largest timestamp a JS Date can represent. */
export const MAX_DATE_MS = 8.64e15;
/** Margin kept below the Date limit so end-time arithmetic never overflows. */
const DATE_MARGIN_MS = 366 * 24 * 3600 * 1000;

/** Representation limit for T at the given moment (no product-level maximum). */
export function maxTargetMs(now: number): number {
  const byDate = MAX_DATE_MS - DATE_MARGIN_MS - Math.max(0, now);
  const lim = Math.min(Number.MAX_SAFE_INTEGER, byDate);
  return Math.floor(lim / 1000) * 1000;
}

export function newWorld(now: number, seed = randomSeed()): World {
  return { id: randomId('w'), seed, rulesVersion: CURRENT_RULES_VERSION, bankedMs: 0, createdAt: now, base: { W: 0, legacy: null } };
}

export function initialState(now: number, seed?: number): Persisted {
  return {
    v: 3,
    rev: 0,
    updatedAt: now,
    world: newWorld(now, seed),
    session: null,
    settings: { ...DEFAULT_SETTINGS },
    marks: { celebratedSessionId: null },
    archive: [],
  };
}

export function statusOf(s: Persisted): Status {
  return s.session ? s.session.status : 'idle';
}

/** E: running time of this session at `now`. Clock regressions never make it shrink. */
export function sessionElapsed(sess: Session, now: number): number {
  let e = sess.accruedMs;
  if (sess.status === 'running' && sess.segmentStartedAt !== null) {
    e += Math.max(0, now - sess.segmentStartedAt);
  }
  if (sess.mode === 'countdown' && sess.targetMs !== null && e > sess.targetMs) e = sess.targetMs;
  return e;
}

/** Remaining countdown time, or null for stopwatch. */
export function sessionRemaining(sess: Session, now: number): number | null {
  if (sess.mode !== 'countdown' || sess.targetMs === null) return null;
  return Math.max(0, sess.targetMs - sessionElapsed(sess, now));
}

/** Countdown end timestamp of the open segment (recomputed on every resume). */
export function sessionEndAt(sess: Session): number | null {
  if (sess.mode !== 'countdown' || sess.targetMs === null || sess.segmentStartedAt === null) return null;
  return sess.segmentStartedAt + (sess.targetMs - sess.accruedMs);
}

/** W: world time at `now`. The open session counts once, until it is banked. */
export function worldTime(s: Persisted, now: number): number {
  const base = s.world.bankedMs;
  if (!s.session || s.session.banked) return base;
  return base + sessionElapsed(s.session, now);
}

/** Session progress p = min(E/T, 1) for the countdown UI. null for stopwatch. */
export function sessionProgress(sess: Session, now: number): number | null {
  if (sess.mode !== 'countdown' || !sess.targetMs) return null;
  return Math.min(sessionElapsed(sess, now) / sess.targetMs, 1);
}

// ---------------------------------------------------------------------------
// Transitions. Each returns the same object when nothing changes, so callers can
// treat repeated/duplicate requests as no-ops.

export function start(s: Persisted, now: number, opts: { mode: Mode; targetMs: number | null }): Persisted {
  if (s.session && s.session.status !== 'completed') return s;
  let targetMs: number | null = null;
  if (opts.mode === 'countdown') {
    const t = opts.targetMs ?? 0;
    if (!Number.isFinite(t) || t <= 0 || t > maxTargetMs(now)) return s;
    targetMs = Math.floor(t);
  }
  const session: Session = {
    id: randomId('s'),
    mode: opts.mode,
    status: 'running',
    targetMs,
    accruedMs: 0,
    segmentStartedAt: now,
    startedAt: now,
    endedAt: null,
    worldMsAtStart: s.world.bankedMs,
    banked: false,
    endReason: null,
  };
  const pace = [...(s.world.pace ?? []), { w0: s.world.bankedMs, len: targetMs, w1: null }].slice(-PACE.keep);
  return { ...s, world: { ...s.world, pace }, session };
}

/** Closes the open pace segment at world time W (a session that added nothing is dropped). */
function closePace(pace: PaceSeg[] | undefined, W: number): PaceSeg[] | undefined {
  if (!pace || pace.length === 0) return pace;
  const last = pace[pace.length - 1];
  if (last.w1 !== null) return pace;
  if (W <= last.w0) return pace.slice(0, -1);
  return [...pace.slice(0, -1), { ...last, w1: W }];
}

export function pause(s: Persisted, now: number): Persisted {
  const sess = s.session;
  if (!sess || sess.status !== 'running') return s;
  return {
    ...s,
    session: { ...sess, status: 'paused', accruedMs: sessionElapsed(sess, now), segmentStartedAt: null },
  };
}

export function resume(s: Persisted, now: number): Persisted {
  const sess = s.session;
  if (!sess || sess.status !== 'paused') return s;
  if (sess.mode === 'countdown' && sess.targetMs !== null && sess.accruedMs >= sess.targetMs) {
    return bankAndClose(s, now, 'timer', now);
  }
  return { ...s, session: { ...sess, status: 'running', segmentStartedAt: now } };
}

function bankAndClose(s: Persisted, now: number, reason: 'timer' | 'user', endedAt: number): Persisted {
  const sess = s.session!;
  const e = sessionElapsed(sess, now);
  const bankedMs = sess.banked ? s.world.bankedMs : s.world.bankedMs + e;
  const pace = closePace(s.world.pace, bankedMs);
  return {
    ...s,
    world: pace ? { ...s.world, bankedMs, pace } : { ...s.world, bankedMs },
    session: {
      ...sess,
      status: 'completed',
      accruedMs: e,
      segmentStartedAt: null,
      endedAt,
      banked: true,
      endReason: reason,
    },
  };
}

export interface CompletionCheck {
  state: Persisted;
  /** Set when this call completed the countdown. */
  completed: null | { sessionId: string; endAt: number; lateMs: number };
}

/** Completes a running countdown whose end time has passed. E is capped at T. */
export function checkCompletion(s: Persisted, now: number): CompletionCheck {
  const sess = s.session;
  if (!sess || sess.status !== 'running' || sess.mode !== 'countdown' || sess.targetMs === null) {
    return { state: s, completed: null };
  }
  const endAt = sessionEndAt(sess)!;
  if (now < endAt) return { state: s, completed: null };
  const state = bankAndClose(s, now, 'timer', endAt);
  return { state, completed: { sessionId: sess.id, endAt, lateMs: now - endAt } };
}

/** User ends this session ("종료"). Growth so far is kept; nothing is force-completed. */
export function finish(s: Persisted, now: number): Persisted {
  const sess = s.session;
  if (!sess || sess.status === 'completed') return s;
  return bankAndClose(s, now, 'user', now);
}

/** "타이머 초기화": ends only the current session and returns to idle. The world is kept. */
export function resetTimer(s: Persisted, now: number): Persisted {
  if (!s.session) return s;
  const closed = s.session.status === 'completed' ? s : bankAndClose(s, now, 'user', now);
  return { ...closed, session: null };
}

/** "이어 집중하기": leave the summary and wait for the next session. Never auto-starts. */
export function continueAfter(s: Persisted): Persisted {
  if (!s.session || s.session.status !== 'completed') return s;
  return { ...s, session: null };
}

/** "새 풍경 만들기": archives the current world (after banking any open session) and starts fresh. */
export function createNewWorld(s: Persisted, now: number, seed?: number): Persisted {
  const closed = s.session && s.session.status !== 'completed' ? bankAndClose(s, now, 'user', now) : s;
  const archived: ArchivedWorld = { ...closed.world, archivedAt: now };
  const archive = closed.world.bankedMs > 0 ? [archived, ...closed.archive].slice(0, 12) : closed.archive;
  return { ...closed, world: newWorld(now, seed), session: null, archive, marks: { celebratedSessionId: null } };
}

/**
 * Repairs a running session after a wall-clock regression (system time moved backwards).
 * `observedE` is the elapsed time this tab last saw before the regression. E is restored to
 * it and the segment reopens at `now`. Idempotent: if the stored session already shows at
 * least that much (another tab rebased first), nothing changes, so time is never credited
 * twice and nothing that did not run is ever credited.
 */
export function rebaseClock(s: Persisted, now: number, observedE: number): Persisted {
  const sess = s.session;
  if (!sess || sess.status !== 'running' || sess.segmentStartedAt === null) return s;
  if (sessionElapsed(sess, now) >= observedE - 1000) return s;
  const cap = sess.mode === 'countdown' && sess.targetMs !== null ? sess.targetMs : Infinity;
  const accruedMs = Math.min(cap, Math.max(sess.accruedMs, observedE));
  return { ...s, session: { ...sess, accruedMs, segmentStartedAt: now } };
}
