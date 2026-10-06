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
import { hash32, randomId, randomSeed } from './rng';
import type { EffectLevel } from '../sim/config';
import type { SimBase } from '../sim/types';
import { PACE, type PaceSeg } from '../world/pace';

export type Mode = 'countdown' | 'stopwatch';
/** Themes with a slot-and-worker simulation (a keeper or drones). Space is no longer offered as a theme, but its simulation and saves remain. */
export type WorkTheme = 'forest' | 'space';
/**
 * Themes that can be chosen: the cosmos grows with the universe's own age (see `cosmosOrigin`), the
 * front with the war's own time (see `frontOrigin`).
 */
export type ThemeId = 'forest' | 'front' | 'cosmos';
/** Every simulation the app still knows, including the retired space theme (kept for its saves). */
export type SimTheme = ThemeId | 'space';
/** The front's peoples: 0 개척 연합, 1 균사 군체, 2 공명단. */
export type RaceId = 0 | 1 | 2;
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
  /**
   * The cosmos theme's universe: the world time it was born (when the theme was first picked,
   * or "새 우주 시작"), so everyone sees its Big Bang. Its age is A = W − origin.
   */
  cosmos?: {
    origin: number;
    resets: number;
    /** [world time, wall-clock time] at the start of each session since (for the records). */
    dates?: [number, number][];
    /** Origins of earlier universes ("새 우주 시작"), so their constellations stay on record. */
    past?: number[];
  };
  /**
   * The front theme's war: when its time began and the people commanded (set when a people is
   * chosen, or by the seed when a session starts without a choice). No `cur` means the choice is
   * still open. Its time is A = W − cur.origin.
   */
  front?: {
    cur?: { origin: number; race: RaceId };
    resets: number;
    /** [world time, wall-clock time] at the start of each session since (operation records). */
    dates?: [number, number][];
    /** Earlier wars ("새 전쟁 시작"), so their operations stay on record. */
    past?: { origin: number; race: RaceId }[];
  };
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
  /** The front theme's minimap. */
  minimap: boolean;
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
  minimap: true,
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
  const date: [number, number] = [s.world.bankedMs, now];
  // the cosmos remembers when each session began (its constellations carry the date)
  const cosmos = s.world.cosmos ? { ...s.world.cosmos, dates: [...(s.world.cosmos.dates ?? []), date].slice(-PACE.keep) } : undefined;
  // the front: a session started before a people was chosen commands the seed's people
  let front = s.world.front;
  if (s.settings.theme === 'front' && !front?.cur) front = { ...(front ?? { resets: 0 }), cur: { origin: s.world.bankedMs, race: defaultRace(s.world.seed) } };
  if (front) front = { ...front, dates: [...(front.dates ?? []), date].slice(-PACE.keep) };
  const world: World = { ...s.world, pace };
  if (cosmos) world.cosmos = cosmos;
  if (front) world.front = front;
  return { ...s, world, session };
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

/** World time at which the cosmos theme's universe began (W while it has not begun yet). */
export function cosmosOrigin(s: Persisted, now: number): number {
  return s.world.cosmos ? s.world.cosmos.origin : worldTime(s, now);
}

/**
 * Gives the world its universe the first time the cosmos theme is on view (picked here, picked in
 * another tab, or a new world made while it is chosen). Returns the same object otherwise.
 */
export function withCosmosOrigin(s: Persisted, now: number): Persisted {
  if (s.settings.theme !== 'cosmos' || s.world.cosmos) return s;
  return { ...s, world: { ...s.world, cosmos: { origin: worldTime(s, now), resets: 0 } } };
}

/** "새 우주 시작": the cosmos begins again from its Big Bang now. Forest, space and W stay. */
export function newUniverse(s: Persisted, now: number): Persisted {
  const resets = (s.world.cosmos?.resets ?? 0) + 1;
  const old = s.world.cosmos;
  const past = old ? [...(old.past ?? []), old.origin].slice(-20) : undefined;
  return { ...s, world: { ...s.world, cosmos: { origin: worldTime(s, now), resets, dates: old?.dates, past } } };
}

/** The people the seed suggests (highlighted on the cards, used when nobody chose). */
export function defaultRace(seed: number): RaceId {
  return (hash32(seed, 0xf20) % 3) as RaceId;
}

/** The front's current war, if a people has been chosen. */
export function frontWar(s: Persisted): { origin: number; race: RaceId } | null {
  return s.world.front?.cur ?? null;
}

/** World time at which the front's war began (W while no people has been chosen yet). */
export function frontOrigin(s: Persisted, now: number): number {
  return s.world.front?.cur ? s.world.front.cur.origin : worldTime(s, now);
}

/** The people commanded (the seed's suggestion while none has been chosen). */
export function frontRace(s: Persisted): RaceId {
  return s.world.front?.cur ? s.world.front.cur.race : defaultRace(s.world.seed);
}

/** Choosing a people begins the war now. A choice already made stays until "새 전쟁 시작". */
export function chooseRace(s: Persisted, now: number, race: RaceId): Persisted {
  if (s.world.front?.cur || (race !== 0 && race !== 1 && race !== 2)) return s;
  const front = { ...(s.world.front ?? { resets: 0 }), cur: { origin: worldTime(s, now), race } };
  return { ...s, world: { ...s.world, front } };
}

/**
 * The front shown during a session that has no war yet (the theme was switched while running, here
 * or in another tab): the seed's people begins it now, since the cards cannot be shown then.
 */
export function withFrontOrigin(s: Persisted, now: number): Persisted {
  if (s.settings.theme !== 'front' || s.world.front?.cur) return s;
  if (!s.session || s.session.status === 'completed') return s;
  return chooseRace(s, now, defaultRace(s.world.seed));
}

/** "새 전쟁 시작": the war is put on record and the choice of people opens again. Other themes and W stay. */
export function newWar(s: Persisted): Persisted {
  const old = s.world.front;
  if (!old?.cur) return s;
  const past = [...(old.past ?? []), old.cur].slice(-20);
  const front: NonNullable<World['front']> = { resets: old.resets + 1, past };
  if (old.dates) front.dates = old.dates;
  return { ...s, world: { ...s.world, front } };
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
