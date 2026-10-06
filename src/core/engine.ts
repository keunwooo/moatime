/**
 * TimerEngine: the single owner of persisted timer/world state in a tab.
 *
 * - Every mutation re-reads the latest stored state inside a Web Lock (when available),
 *   applies a pure transition and writes it back, so concurrent tabs serialize and a
 *   duplicate request becomes a no-op.
 * - Other tabs' writes arrive through the `storage` event and are adopted by revision.
 * - Completion is detected from the end timestamp; a completion noticed late (hidden tab,
 *   reload, long absence) is recorded without replaying effects.
 */

import {
  checkCompletion,
  chooseRace,
  continueAfter,
  cosmosOrigin,
  createNewWorld,
  finish,
  focusTime,
  frontOrigin,
  frontRace,
  frontWar,
  newUniverse,
  newWar,
  withCosmosOrigin,
  withFrontOrigin,
  pause,
  rebaseClock,
  resetTimer,
  resume,
  sessionEndAt,
  sessionElapsed,
  start,
  statusOf,
  worldTime,
  type Persisted,
  type RaceId,
  type Settings,
  type Status,
  type ThemeId,
} from './session';
import { loadState, parseState, saveState, STATE_KEY, type StorageLike } from './persist';
import { randomId } from './rng';

/** A completion observed within this window of its end time counts as "live". */
export const LIVE_COMPLETION_WINDOW_MS = 2500;
const SAVE_WARNING = '브라우저 저장에 실패했어요. 이 탭을 닫기 전까지는 풍경이 유지돼요.';
/** Wall-clock regressions smaller than this are ignored as jitter. */
const CLOCK_REGRESSION_MS = 1500;

export type EngineEvent =
  | { type: 'completed'; sessionId: string; live: boolean; byThisTab: boolean; reason: 'timer' | 'user' }
  | { type: 'status'; status: Status; prev: Status }
  | { type: 'world-replaced' };

interface LockLike {
  request(name: string, cb: () => unknown): Promise<unknown>;
}

export interface EngineEnv {
  storage: StorageLike | null;
  now?: () => number;
  locks?: LockLike | null;
  isVisible?: () => boolean;
  /** Subscribe to cross-tab storage writes; returns an unsubscribe function. */
  listenStorage?: (cb: (key: string | null, value: string | null) => void) => () => void;
}

export class TimerEngine {
  readonly tabId = randomId('tab');
  private state: Persisted;
  private storage: StorageLike | null;
  private nowFn: () => number;
  private locks: LockLike | null;
  private isVisible: () => boolean;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: EngineEvent) => void>();
  private unlisten: (() => void) | null = null;
  private lastSeenNow: number;
  /** Elapsed time this tab last observed for the open running segment. */
  private observed: { sessionId: string; e: number } | null = null;
  private pendingTick = false;
  private leader = false;
  warning: string | null;
  saveFailed = false;

  constructor(env: EngineEnv) {
    this.storage = env.storage;
    this.nowFn = env.now ?? (() => Date.now());
    this.locks = env.locks ?? null;
    this.isVisible = env.isVisible ?? (() => true);
    const now = this.nowFn();
    const loaded = loadState(this.storage, now);
    this.state = loaded.state;
    this.warning = loaded.warning;
    this.lastSeenNow = now;

    // A countdown that ended while the page was closed is banked at T, silently.
    const check = checkCompletion(this.state, now);
    if (check.completed) {
      this.state = this.stamp(check.state, now);
      this.persist(this.state);
    } else if (loaded.source !== 'primary') {
      this.persist(this.stamp(this.state, now));
    }
    // a cosmos chosen without its universe (an older tab wrote the state) gets one now; likewise a
    // front shown during a session without its war
    const withOrigin = normalize(this.state, now);
    if (withOrigin !== this.state) {
      this.state = this.stamp(withOrigin, now);
      this.persist(this.state);
    }

    if (env.listenStorage) {
      this.unlisten = env.listenStorage((key, value) => {
        if (key !== null && key !== STATE_KEY) return;
        const next = parseState(value);
        if (next && next.rev !== this.state.rev) this.adoptRemote(next);
      });
    }
    this.electLeader();
  }

  dispose() {
    this.unlisten?.();
    this.listeners.clear();
    this.eventListeners.clear();
  }

  // ---- reading -------------------------------------------------------------

  now(): number {
    return this.nowFn();
  }

  /** World time at which the cosmos universe began (see session.cosmosOrigin). */
  cosmosOrigin(): number {
    return cosmosOrigin(this.state, this.nowFn());
  }
  /** World time at which the front's war began (see session.frontOrigin). */
  frontOrigin(): number {
    return frontOrigin(this.state, this.nowFn());
  }
  /** The people the front commands (the seed's suggestion while none has been chosen). */
  frontRace(): RaceId {
    return frontRace(this.state);
  }
  /** True once the front's war has begun (a people chosen). */
  frontStarted(): boolean {
    return frontWar(this.state) !== null;
  }
  /** Origin of a theme with its own clock (cosmos, front); 0 for the others. */
  originOf(theme: ThemeId): number {
    return theme === 'cosmos' ? this.cosmosOrigin() : theme === 'front' ? this.frontOrigin() : 0;
  }
  getState = (): Persisted => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  onEvent(fn: (e: EngineEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }
  worldTime(now = this.nowFn()): number {
    return worldTime(this.state, now);
  }
  /** Real focus time (the world time without growth speeds). */
  focusTime(now = this.nowFn()): number {
    return focusTime(this.state, now);
  }
  sessionElapsed(now = this.nowFn()): number {
    return this.state.session ? sessionElapsed(this.state.session, now) : 0;
  }
  status(): Status {
    return statusOf(this.state);
  }
  /** True for exactly one tab of this browser profile (Web Locks), used for sounds. */
  isLeader(): boolean {
    return this.leader || !this.locks;
  }

  // ---- actions -------------------------------------------------------------

  start(opts?: { targetMs?: number }) {
    return this.commit((s, now) => {
      // a duplicate start (e.g. from a stale tab) changes nothing
      if (s.session && s.session.status !== 'completed') return s;
      const mode = s.settings.mode;
      // the clock shows the time only: no session, no growth
      if (mode === 'clock') return s;
      const targetMs = mode === 'countdown' ? (opts?.targetMs ?? s.settings.countdownMs) : null;
      const base = s.session?.status === 'completed' ? continueAfter(s) : s;
      const settings = mode === 'countdown' && targetMs ? { ...base.settings, countdownMs: targetMs } : base.settings;
      const started = start({ ...base, settings }, now, { mode, targetMs, rate: s.settings.growthRate });
      // an invalid target keeps the previous state (and its summary) untouched
      return started.session && started.session.status === 'running' && started !== base ? started : s;
    });
  }
  pause() {
    return this.commit((s, now) => pause(s, now));
  }
  resume() {
    return this.commit((s, now) => resume(s, now));
  }
  /** "종료": end this session and show its summary. */
  finish() {
    return this.commit((s, now) => finish(s, now));
  }
  /** "타이머 초기화": end the session and return to idle, keeping the world. */
  reset() {
    return this.commit((s, now) => resetTimer(s, now));
  }
  continueAfter() {
    return this.commit((s) => continueAfter(s));
  }
  newWorld() {
    return this.commit((s, now) => createNewWorld(s, now));
  }
  /** "새 우주 시작": only the cosmos theme starts over from its Big Bang. */
  newUniverse() {
    return this.commit((s, now) => newUniverse(s, now));
  }
  /** Picks the front's people (only while no war is on). */
  chooseRace(race: RaceId) {
    return this.commit((s, now) => chooseRace(s, now, race));
  }
  /** "새 전쟁 시작": the front's war goes on record and the choice of people opens again. */
  newWar() {
    return this.commit((s) => newWar(s));
  }
  updateSettings(patch: Partial<Settings>) {
    return this.commit((s) => {
      const next = { ...s.settings, ...patch };
      // Mode changes only apply between sessions.
      if (s.session && s.session.status !== 'completed') next.mode = s.settings.mode;
      const same = (Object.keys(next) as (keyof Settings)[]).every((k) => next[k] === s.settings[k]);
      return same ? s : { ...s, settings: next };
    });
  }
  markCelebrated(sessionId: string) {
    if (this.state.marks.celebratedSessionId === sessionId) return Promise.resolve();
    return this.commit((s) =>
      s.marks.celebratedSessionId === sessionId ? s : { ...s, marks: { celebratedSessionId: sessionId } },
    );
  }

  /** Periodic check: completion and wall-clock regressions. Cheap when nothing is due. */
  tick() {
    const now = this.nowFn();
    const sess = this.state.session;
    if (!sess || sess.status !== 'running' || sess.segmentStartedAt === null) {
      // Only an open running segment can be affected by the clock; forget older readings.
      this.lastSeenNow = now;
      this.observed = null;
      return;
    }
    const regressed = this.observed !== null && this.observed.sessionId === sess.id && now < this.lastSeenNow - CLOCK_REGRESSION_MS;
    if (regressed) {
      const observedE = this.observed!.e;
      this.lastSeenNow = now;
      this.observed = null;
      void this.commit((s, n) => rebaseClock(s, n, observedE));
      return;
    }
    this.lastSeenNow = Math.max(this.lastSeenNow, now);
    this.observed = { sessionId: sess.id, e: sessionElapsed(sess, now) };
    const endAt = sessionEndAt(sess);
    if (endAt === null || now < endAt || this.pendingTick) return;
    this.pendingTick = true;
    void this.commit((s, n) => checkCompletion(s, n).state).finally(() => {
      this.pendingTick = false;
    });
  }

  // ---- dev tools (never wired in production builds) -------------------------

  devSetWorldTime(targetW: number) {
    return this.commit((s, now) => {
      const open = s.session && !s.session.banked ? sessionElapsed(s.session, now) : 0;
      const bankedMs = Math.max(0, Math.floor(targetW - open));
      return { ...s, world: { ...s.world, bankedMs } };
    });
  }
  /** Dev: a raid on the colony at world time `atW` (appended to the session pacing). */
  devCallRaid(atW: number) {
    return this.commit((s) => {
      const t = Math.max(Math.floor(atW), s.world.bankedMs);
      const pace = [...(s.world.pace ?? [])];
      // keep an open session's segment last (it is closed when the session ends)
      const open = pace.length > 0 && pace[pace.length - 1].w1 === null ? pace.pop()! : null;
      pace.push({ w0: t, len: 0, w1: t, raid: t });
      if (open) pace.push(open);
      return { ...s, world: { ...s.world, pace } };
    });
  }
  /** Dev: sets the cosmos universe's age to A by moving its origin (world time is unchanged). */
  devSetCosmosAge(A: number) {
    return this.commit((s, now) => {
      const W = worldTime(s, now);
      const origin = Math.max(0, Math.floor(W - Math.max(0, A)));
      if (W - origin < A) {
        // not enough world time yet: add it (dev only)
        const open = s.session && !s.session.banked ? sessionElapsed(s.session, now) : 0;
        const bankedMs = Math.max(0, Math.floor(A - open));
        return { ...s, world: { ...s.world, bankedMs, cosmos: { origin: 0, resets: s.world.cosmos?.resets ?? 0 } } };
      }
      return { ...s, world: { ...s.world, cosmos: { origin, resets: s.world.cosmos?.resets ?? 0 } } };
    });
  }
  /** Dev: sets the front war's time to A by moving its origin (world time is unchanged). */
  devSetFrontAge(A: number) {
    return this.commit((s, now) => {
      const W = worldTime(s, now);
      const race = frontRace(s);
      const front = s.world.front ?? { resets: 0 };
      if (W < A) {
        const open = s.session && !s.session.banked ? sessionElapsed(s.session, now) : 0;
        const bankedMs = Math.max(0, Math.floor(A - open));
        return { ...s, world: { ...s.world, bankedMs, front: { ...front, cur: { origin: 0, race } } } };
      }
      return { ...s, world: { ...s.world, front: { ...front, cur: { origin: Math.max(0, Math.floor(W - Math.max(0, A))), race } } } };
    });
  }
  devAddWorldTime(deltaMs: number) {
    return this.commit((s) => ({ ...s, world: { ...s.world, bankedMs: Math.max(0, s.world.bankedMs + deltaMs) } }));
  }

  // ---- internals -----------------------------------------------------------

  private stamp(s: Persisted, now: number): Persisted {
    return { ...s, rev: s.rev + 1, updatedAt: now };
  }

  private readFresh(): Persisted | null {
    if (!this.storage) return null;
    try {
      return parseState(this.storage.getItem(STATE_KEY));
    } catch {
      return null;
    }
  }

  private persist(s: Persisted) {
    if (!this.storage) return; // the load warning already explains there is no storage
    const r = saveState(this.storage, s);
    const failed = !r.ok;
    if (failed !== this.saveFailed) {
      this.saveFailed = failed;
      this.warning = failed ? SAVE_WARNING : this.warning === SAVE_WARNING ? null : this.warning;
    }
  }

  private commit(fn: (s: Persisted, now: number) => Persisted): Promise<void> {
    const run = () => {
      const now = this.nowFn();
      const fresh = this.readFresh();
      // Prefer whichever copy is newer; the in-memory copy wins when storage is unavailable.
      const base = fresh && fresh.rev >= this.state.rev ? fresh : this.state;
      // the cosmos gets its universe in the same write that first shows it
      const next = normalize(fn(base, now), now);
      if (next === base) {
        if (base !== this.state) this.adopt(base, now, false);
        return;
      }
      const stamped: Persisted = { ...next, rev: Math.max(base.rev, this.state.rev) + 1, updatedAt: now };
      this.persist(stamped);
      this.adopt(stamped, now, true);
    };
    if (this.locks) {
      return this.locks.request('moa:v3:state', run).then(
        () => undefined,
        () => {
          run();
        },
      );
    }
    run();
    return Promise.resolve();
  }

  private adoptRemote(next: Persisted) {
    if (next.rev < this.state.rev && next.world.id === this.state.world.id) return;
    this.adopt(next, this.nowFn(), false);
  }

  private adopt(next: Persisted, now: number, byThisTab: boolean) {
    const prev = this.state;
    this.state = next;
    const prevStatus = statusOf(prev);
    const status = statusOf(next);
    if (prev.world.id !== next.world.id) this.emit({ type: 'world-replaced' });
    if (prevStatus !== status) this.emit({ type: 'status', status, prev: prevStatus });
    const sess = next.session;
    if (
      sess &&
      sess.status === 'completed' &&
      !(prev.session && prev.session.id === sess.id && prev.session.status === 'completed')
    ) {
      const endedAt = sess.endedAt ?? now;
      const live = sess.endReason === 'user' ? byThisTab : now - endedAt <= LIVE_COMPLETION_WINDOW_MS && this.isVisible();
      this.emit({ type: 'completed', sessionId: sess.id, live, byThisTab, reason: sess.endReason ?? 'user' });
    }
    for (const l of this.listeners) l();
  }

  private emit(e: EngineEvent) {
    for (const l of this.eventListeners) {
      try {
        l(e);
      } catch (err) {
        console.error(err);
      }
    }
  }

  private electLeader() {
    if (!this.locks) return;
    try {
      void this.locks.request('moa:v3:leader', () => {
        this.leader = true;
        // Held for the lifetime of the tab.
        return new Promise(() => {});
      });
    } catch {
      this.leader = true;
    }
  }
}

/** Gives a shown cosmos its universe and a front shown during a session its war. */
function normalize(s: Persisted, now: number): Persisted {
  return withFrontOrigin(withCosmosOrigin(s, now), now);
}

export function createBrowserEngine(storage: StorageLike | null): TimerEngine {
  const nav = globalThis.navigator as Navigator | undefined;
  const locks = nav && 'locks' in nav && nav.locks ? (nav.locks as unknown as LockLike) : null;
  return new TimerEngine({
    storage,
    locks,
    isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
    listenStorage: (cb) => {
      const h = (e: StorageEvent) => cb(e.key, e.newValue);
      window.addEventListener('storage', h);
      return () => window.removeEventListener('storage', h);
    },
  });
}
