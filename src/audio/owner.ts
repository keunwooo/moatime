/**
 * Which tab may make sound. The owner is the tab where the user last interacted (so its
 * AudioContext is unlocked); it plays ambience and the completion chime, other tabs stay
 * quiet. Shared through localStorage so it follows the user between tabs.
 */

import { useSyncExternalStore } from 'react';
import { randomId } from '../core/rng';

const KEY = 'moa:audio-owner';
const me = randomId('audio');
let owner: string | null = read();
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

function notify() {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    owner = e.newValue;
    notify();
  });
}

/** Call from a user gesture in this tab. */
export function claimAudio() {
  if (owner === me) return;
  owner = me;
  try {
    localStorage.setItem(KEY, me);
  } catch {
    /* single-tab fallback */
  }
  notify();
}

/** True if this tab should make sound. Before anyone claims, any tab may (its context is still locked). */
export function isAudioOwner(): boolean {
  return owner === null || owner === me;
}

export function useAudioOwner(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    isAudioOwner,
    isAudioOwner,
  );
}
