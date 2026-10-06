/**
 * App runtime: the single TimerEngine for this tab, its tick loop, and the bridge to sounds.
 * Short-period scheduling only refreshes state; the end time itself is computed from
 * timestamps, so long timers never rely on one huge setTimeout.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createBrowserEngine, type EngineEvent } from '../core/engine';
import { browserStorage, needsMigration, setProgressSnapshot, setStorageNamespace } from '../core/persist';
import { sessionEndAt, type Persisted } from '../core/session';
import { sound } from '../audio/sound';
import { isAudioOwner } from '../audio/owner';
import { saveSimCheckpoints } from './sim';

if (import.meta.env.DEV) {
  const ns = new URLSearchParams(location.search).get('store');
  if (ns) setStorageNamespace(ns);
}

const storage = browserStorage();
// An older save is migrated once with the frozen simulation that produced it; that module is
// loaded only in this case (the page waits for it before the engine reads the save).
if (needsMigration(storage)) {
  try {
    const { snapshotV1 } = await import('../sim/v1/snapshot');
    setProgressSnapshot(snapshotV1);
  } catch (err) {
    console.warn('[moa] migration replay unavailable; the old base is kept', err);
  }
}

export const engine = createBrowserEngine(storage);

let started = false;

export function startRuntime() {
  if (started) return;
  started = true;
  const tick = () => {
    engine.tick();
    const s = engine.getState();
    const sess = s.session;
    // Best-effort on-time chime: scheduled on the audio clock shortly before the end, by the
    // one tab whose audio is unlocked. Never promised in the UI.
    if (sess && sess.status === 'running') {
      const endAt = sessionEndAt(sess);
      if (s.settings.chime && isAudioOwner() && sound.canPlay() && endAt !== null && endAt - Date.now() < 90_000) {
        sound.scheduleChime(endAt);
      } else if (!s.settings.chime || !isAudioOwner()) {
        sound.cancelChime();
      }
    }
  };
  window.setInterval(tick, 250);
  // simulation checkpoints are a cache for fast reloads: now and then, and when leaving
  window.setInterval(() => saveSimCheckpoints(), 5000);
  document.addEventListener('visibilitychange', () => {
    tick();
    if (document.visibilityState === 'hidden') saveSimCheckpoints(true);
  });
  window.addEventListener('pagehide', () => saveSimCheckpoints(true));
  window.addEventListener('focus', tick);
  engine.onEvent((e: EngineEvent) => {
    if (e.type === 'status' && (e.status === 'paused' || e.status === 'idle')) {
      // the end moved or the session ended early: a pre-scheduled chime must not ring
      sound.cancelChime();
      saveSimCheckpoints(true);
    }
    if (e.type === 'completed') {
      const s = engine.getState();
      const endAt = s.session?.endedAt ?? 0;
      if (e.reason === 'user') {
        sound.cancelChime();
      } else if (s.settings.chime && e.live && isAudioOwner() && !sound.hasScheduled(endAt)) {
        // the scheduled bell (if any) is already ringing; otherwise ring now
        sound.playChime();
      }
      sound.clearScheduledMarker();
    }
  });
}

export function useEngine(): Persisted {
  return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
}

/** Re-renders only when the formatted value changes (at most every 200 ms). */
export function useTicker<T>(compute: () => T, active: boolean, deps: unknown[]): T {
  const [value, setValue] = useState(compute);
  useEffect(() => {
    setValue(compute());
    if (!active) return;
    const id = window.setInterval(() => {
      const v = compute();
      setValue((prev) => (Object.is(prev, v) ? prev : v));
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);
  return value;
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [v, setV] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_QUERY).matches);
  useEffect(() => {
    const q = window.matchMedia?.(REDUCED_QUERY);
    if (!q) return;
    const h = () => setV(q.matches);
    q.addEventListener('change', h);
    return () => q.removeEventListener('change', h);
  }, []);
  return v;
}
