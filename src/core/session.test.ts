import { describe, expect, it } from 'vitest';
import { TimerEngine, type EngineEvent } from './engine';
import { MemoryStorage, STATE_KEY, validatePersisted } from './persist';
import { growthAt, rulesFor } from './rules';
import { focusTime, sessionGrowth, sessionElapsed, worldTime } from './session';
import { clockParts, parseDuration } from './duration';
import { rateLine } from './describe';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RULES = rulesFor(1);

/**
 * A fake clock plus engines that share one storage. Like browsers, storage events are
 * delivered asynchronously and only to the other tabs.
 */
function harness(startAt = Date.UTC(2026, 9, 4, 9, 0, 0)) {
  let now = startAt;
  const storage = new MemoryStorage();
  const tabs: TimerEngine[] = [];
  const subs: ((k: string | null, v: string | null) => void)[] = [];
  const realSet = storage.setItem.bind(storage);
  storage.setItem = (k, v) => {
    realSet(k, v);
    if (k === STATE_KEY) {
      queueMicrotask(() => {
        for (const s of subs) s(k, v);
      });
    }
  };
  const open = () => {
    const e = new TimerEngine({
      storage,
      now: () => now,
      listenStorage: (cb) => {
        subs.push(cb);
        return () => undefined;
      },
    });
    tabs.push(e);
    return e;
  };
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    storage,
    open,
    flush,
    async advance(ms: number) {
      now += ms;
      for (const t of tabs) t.tick();
      await flush();
    },
    setNow(t: number) {
      now = t;
    },
    get now() {
      return now;
    },
  };
}

describe('growth rules', () => {
  it('splits W into matured units n and progress u', () => {
    const g = growthAt(37.5 * MIN, RULES);
    expect(g.unit).toBe(2);
    expect(g.u).toBeCloseTo(0.5, 10);
    expect(growthAt(0, RULES).unit).toBe(0);
    expect(growthAt(15 * MIN, RULES)).toMatchObject({ unit: 1, slot: 1, clusterInZone: 0, zone: 0 });
    expect(growthAt(60 * MIN, RULES)).toMatchObject({ unit: 4, slot: 0, clusterInZone: 1, zone: 0 });
    expect(growthAt(4 * HOUR, RULES)).toMatchObject({ unit: 16, slot: 0, clusterInZone: 0, zone: 1 });
  });
  it('handles very long worlds without drifting', () => {
    const W = 30 * DAY + 7 * MIN;
    const g = growthAt(W, RULES);
    expect(g.unit).toBe(30 * 96);
    expect(g.u).toBeCloseTo(7 / 15, 9);
    const g2 = growthAt(1e12 + 450_000, RULES);
    expect(g2.u).toBeCloseTo(((1e12 + 450_000) % 900_000) / 900_000, 6);
    expect(growthAt(NaN, RULES).W).toBe(0);
    expect(growthAt(-5, RULES).W).toBe(0);
  });
});

describe('accumulation', () => {
  it('three 5-minute sessions equal one 15-minute session', async () => {
    const a = harness();
    const ea = a.open();
    for (let i = 0; i < 3; i++) {
      await ea.start({ targetMs: 5 * MIN });
      await a.advance(5 * MIN);
      await ea.continueAfter();
    }
    const b = harness();
    const eb = b.open();
    await eb.start({ targetMs: 15 * MIN });
    await b.advance(15 * MIN);
    expect(ea.worldTime()).toBe(15 * MIN);
    expect(eb.worldTime()).toBe(15 * MIN);
    expect(growthAt(ea.worldTime(), RULES)).toEqual(growthAt(eb.worldTime(), RULES));
  });

  it('target length never changes growth: 25m, 2h and stopwatch for 10 minutes', async () => {
    const results: number[] = [];
    for (const t of [25 * MIN, 2 * HOUR, null]) {
      const h = harness();
      const e = h.open();
      if (t === null) await e.updateSettings({ mode: 'stopwatch' });
      await e.start(t ? { targetMs: t } : undefined);
      await h.advance(10 * MIN);
      await e.finish();
      results.push(e.worldTime());
    }
    expect(results).toEqual([10 * MIN, 10 * MIN, 10 * MIN]);
  });

  it.each([
    ['1 min', 1 * MIN],
    ['5 min', 5 * MIN],
    ['25 min', 25 * MIN],
    ['2 h', 2 * HOUR],
    ['8 h', 8 * HOUR],
    ['24 h', 24 * HOUR],
    ['30 days', 30 * DAY],
  ])('countdown of %s banks exactly T, even if the user returns much later', async (_l, T) => {
    const h = harness();
    const e = h.open();
    await e.updateSettings({ countdownMs: T });
    await e.start();
    await h.advance(T / 2);
    expect(e.sessionElapsed()).toBe(T / 2);
    await h.advance(T / 2 + 3 * DAY); // long absence after the end
    expect(e.status()).toBe('completed');
    expect(e.worldTime()).toBe(T);
    expect(e.getState().session!.accruedMs).toBe(T);
    expect(growthAt(e.worldTime(), RULES).unit).toBe(Math.floor(T / RULES.unitMs));
  });

  it('stopwatch uses the same rule and has no target', async () => {
    const h = harness();
    const e = h.open();
    await e.updateSettings({ mode: 'stopwatch' });
    await e.start();
    expect(e.getState().session!.targetMs).toBeNull();
    await h.advance(3 * HOUR + 7 * MIN);
    expect(e.status()).toBe('running');
    expect(growthAt(e.worldTime(), RULES)).toMatchObject({ unit: 12, cluster: 3 });
    await e.finish();
    expect(e.getState().world.bankedMs).toBe(3 * HOUR + 7 * MIN);
  });

  it('pauses are excluded from E and W', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: 25 * MIN });
    await h.advance(3 * MIN);
    await e.pause();
    await h.advance(40 * MIN);
    expect(e.worldTime()).toBe(3 * MIN);
    await e.resume();
    await h.advance(2 * MIN);
    expect(e.sessionElapsed()).toBe(5 * MIN);
    // the countdown end is recomputed on resume
    await h.advance(20 * MIN - 1);
    expect(e.status()).toBe('running');
    await h.advance(1);
    expect(e.status()).toBe('completed');
    expect(e.worldTime()).toBe(25 * MIN);
  });

  it('duplicate start/pause/resume requests never double count', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: HOUR });
    await e.start({ targetMs: HOUR });
    await h.advance(MIN);
    await e.pause();
    await e.pause();
    await h.advance(MIN);
    await e.resume();
    await e.resume();
    await h.advance(MIN);
    await e.finish();
    await e.finish();
    await e.reset();
    expect(e.worldTime()).toBe(2 * MIN);
  });

  it('a duplicate start from a stale tab changes nothing', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: HOUR });
    const before = e.getState();
    await e.start({ targetMs: 5 * MIN });
    expect(e.getState().rev).toBe(before.rev);
    expect(e.getState().settings.countdownMs).toBe(HOUR);
    expect(e.getState().session!.targetMs).toBe(HOUR);
  });

  it('starting with an unrepresentable target keeps the finished summary', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: MIN });
    await h.advance(MIN);
    expect(e.status()).toBe('completed');
    await e.start({ targetMs: Number.MAX_SAFE_INTEGER });
    expect(e.status()).toBe('completed');
    expect(e.getState().session!.accruedMs).toBe(MIN);
  });

  it('ending mid-unit keeps partial growth and the next session continues it', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: HOUR });
    await h.advance(7 * MIN);
    await e.finish();
    expect(growthAt(e.worldTime(), RULES).u).toBeCloseTo(7 / 15, 9);
    await e.continueAfter();
    await e.start({ targetMs: 25 * MIN });
    await h.advance(8 * MIN);
    expect(growthAt(e.worldTime(), RULES)).toMatchObject({ unit: 1 });
    expect(growthAt(e.worldTime(), RULES).u).toBeCloseTo(0, 9);
  });

  it('reset ends only the session; a new world is a separate action', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: HOUR });
    await h.advance(20 * MIN);
    await e.reset();
    expect(e.status()).toBe('idle');
    expect(e.worldTime()).toBe(20 * MIN);
    const oldId = e.getState().world.id;
    await e.newWorld();
    expect(e.worldTime()).toBe(0);
    expect(e.getState().world.id).not.toBe(oldId);
    expect(e.getState().archive[0]).toMatchObject({ id: oldId, bankedMs: 20 * MIN });
  });

  it('theme changes never accrue time', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: HOUR });
    await h.advance(10 * MIN);
    await e.updateSettings({ theme: 'space' });
    await e.updateSettings({ theme: 'forest' });
    await e.updateSettings({ theme: 'space' });
    expect(e.worldTime()).toBe(10 * MIN);
    await e.finish();
    expect(e.getState().world.bankedMs).toBe(10 * MIN);
  });
});

describe('restore and multiple tabs', () => {
  it('reload mid-run restores the running segment exactly once', async () => {
    const h = harness();
    const e1 = h.open();
    await e1.start({ targetMs: HOUR });
    await h.advance(12 * MIN);
    const e2 = h.open(); // reload
    expect(e2.worldTime()).toBe(12 * MIN);
    await h.advance(3 * MIN);
    const e3 = h.open(); // reload again
    expect(e3.worldTime()).toBe(15 * MIN);
    await e3.finish();
    expect(e3.getState().world.bankedMs).toBe(15 * MIN);
  });

  it('two tabs on one world bank the same interval once', async () => {
    const h = harness();
    const a = h.open();
    const b = h.open();
    await a.start({ targetMs: 30 * MIN });
    await h.flush();
    expect(b.status()).toBe('running');
    await h.advance(10 * MIN);
    await b.pause(); // pause from the other tab
    await h.flush();
    expect(a.status()).toBe('paused');
    expect(a.worldTime()).toBe(10 * MIN);
    await a.resume();
    await b.resume();
    await h.advance(25 * MIN); // both tabs tick past the end
    expect(a.status()).toBe('completed');
    expect(b.status()).toBe('completed');
    expect(a.getState().world.bankedMs).toBe(30 * MIN);
    expect(b.getState().world.bankedMs).toBe(30 * MIN);
    // a stale finish or reset from either tab is a no-op for time
    await a.finish();
    await b.reset();
    await h.flush();
    expect(a.worldTime()).toBe(30 * MIN);
    expect(b.worldTime()).toBe(30 * MIN);
  });

  it('a countdown that ended while the page was closed is recorded silently', async () => {
    const h = harness();
    const e1 = h.open();
    await e1.start({ targetMs: 25 * MIN });
    h.setNow(h.now + 5 * HOUR); // page closed, no ticks
    const e2 = h.open();
    expect(e2.status()).toBe('completed');
    expect(e2.worldTime()).toBe(25 * MIN);
    expect(e2.getState().session!.endedAt).toBe(e2.getState().session!.startedAt + 25 * MIN);
  });

  it('a completion noticed late is marked not live', async () => {
    const h = harness();
    const e = h.open();
    const events: EngineEvent[] = [];
    e.onEvent((ev) => events.push(ev));
    await e.start({ targetMs: 5 * MIN });
    await h.advance(5 * MIN + 60_000); // tab was throttled for a minute
    expect(events.find((x) => x.type === 'completed')).toMatchObject({ type: 'completed', live: false });
    expect(e.worldTime()).toBe(5 * MIN);
  });

  it('a completion noticed on time is live', async () => {
    const h = harness();
    const e = h.open();
    const events: EngineEvent[] = [];
    e.onEvent((ev) => events.push(ev));
    await e.start({ targetMs: 5 * MIN });
    await h.advance(5 * MIN + 200);
    expect(events.find((x) => x.type === 'completed')).toMatchObject({ live: true, byThisTab: true });
  });

  it('a wall-clock regression never shrinks E', async () => {
    const h = harness();
    const e = h.open();
    await e.updateSettings({ mode: 'stopwatch' });
    await e.start();
    await h.advance(10 * MIN);
    h.setNow(h.now - 2 * HOUR); // the system clock was moved back
    e.tick();
    await h.flush();
    expect(e.sessionElapsed()).toBe(10 * MIN);
    await h.advance(MIN);
    expect(e.sessionElapsed()).toBe(11 * MIN);
  });

  it('a clock step back while paused credits nothing after resuming', async () => {
    const h = harness();
    const e = h.open();
    await e.updateSettings({ mode: 'stopwatch' });
    await e.start();
    await h.advance(5 * MIN);
    await e.pause();
    h.setNow(h.now - 2 * HOUR); // clock moved back while paused
    e.tick();
    await e.resume();
    await h.advance(1000);
    await h.advance(1000);
    expect(e.sessionElapsed()).toBe(5 * MIN + 2000);
  });

  it('two tabs noticing the same clock regression credit it once', async () => {
    const h = harness();
    const a = h.open();
    const b = h.open();
    await a.updateSettings({ mode: 'stopwatch' });
    await a.start();
    await h.flush();
    await h.advance(10 * MIN); // both tabs observe 10 min
    h.setNow(h.now - 2 * HOUR);
    a.tick();
    b.tick();
    await h.flush();
    await h.flush();
    expect(a.sessionElapsed()).toBe(10 * MIN);
    expect(b.sessionElapsed()).toBe(10 * MIN);
    await h.advance(MIN);
    expect(a.sessionElapsed()).toBe(11 * MIN);
    expect(b.sessionElapsed()).toBe(11 * MIN);
  });

  it('storage failures keep the session running in memory', async () => {
    const h = harness();
    const e = h.open();
    h.storage.failWrites = true;
    await e.start({ targetMs: HOUR });
    await h.advance(5 * MIN);
    expect(e.worldTime()).toBe(5 * MIN);
    expect(e.saveFailed).toBe(true);
    h.storage.failWrites = false;
    await e.pause();
    expect(e.saveFailed).toBe(false);
    expect(e.worldTime()).toBe(5 * MIN);
  });

  it('corrupt storage falls back to the world backup', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: 15 * MIN });
    await h.advance(15 * MIN);
    const id = e.getState().world.id;
    h.storage.map.set(STATE_KEY, '{not json');
    const e2 = h.open();
    expect(e2.getState().world.id).toBe(id);
    expect(e2.worldTime()).toBe(15 * MIN);
    expect(e2.warning).toBeTruthy();
  });
});

describe('duration input', () => {
  const now = Date.UTC(2026, 9, 4);
  const f = (d: string, h: string, m: string, s: string) =>
    parseDuration({ days: d, hours: h, minutes: m, seconds: s }, now);
  it('accepts any positive duration, including seconds and multi-day values', () => {
    expect(f('', '', '', '1')).toEqual({ ok: true, ms: 1000 });
    expect(f('', '0', '90', '0')).toEqual({ ok: true, ms: 90 * MIN });
    expect(f('', '24', '0', '0')).toEqual({ ok: true, ms: DAY });
    expect(f('30', '0', '0', '0')).toEqual({ ok: true, ms: 30 * DAY });
    expect(f('', '８', '', '')).toEqual({ ok: true, ms: 8 * HOUR }); // full-width digit
  });
  it('rejects zero, non-integers and overflow', () => {
    expect(f('', '0', '0', '0').ok).toBe(false);
    expect(f('', '', '1.5', '').ok).toBe(false);
    expect(f('', '', '-3', '').ok).toBe(false);
    expect(f('', 'abc', '', '').ok).toBe(false);
    expect(f('99999999999999999999', '', '', '').ok).toBe(false);
    expect(f('999999999', '', '', '').ok).toBe(false); // beyond the Date range
    expect(f('9999999', '', '', '').ok).toBe(true); // ~27k years is still representable
  });
  it('formats clocks with fixed fields', () => {
    expect(clockParts(25 * MIN, 'ceil').clock).toBe('25:00');
    expect(clockParts(25 * MIN - 1, 'ceil').clock).toBe('25:00');
    expect(clockParts(25 * MIN - 1000, 'ceil').clock).toBe('24:59');
    expect(clockParts(2 * HOUR + 5 * 1000, 'floor').clock).toBe('2:00:05');
    expect(clockParts(30 * DAY + 61_000, 'floor')).toEqual({ days: 30, clock: '00:01:01' });
  });
});

describe('pure helpers', () => {
  it('worldTime counts an open session once and E stops at T', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: 10 * MIN });
    await h.advance(4 * MIN);
    const s = e.getState();
    expect(worldTime(s, h.now)).toBe(4 * MIN);
    expect(sessionElapsed(s.session!, h.now + 100 * MIN)).toBe(10 * MIN);
  });
});

describe('growth rate (가속)', () => {
  it('×5: the countdown ends after its real T, and the world grows five times as much', async () => {
    const h = harness();
    const e = h.open();
    await e.updateSettings({ growthRate: 5 });
    await e.start({ targetMs: 25 * MIN });
    expect(e.getState().session!.rate).toBe(5);
    await h.advance(10 * MIN);
    expect(e.sessionElapsed()).toBe(10 * MIN);
    expect(e.worldTime()).toBe(50 * MIN);
    expect(e.focusTime()).toBe(10 * MIN);
    await h.advance(15 * MIN);
    expect(e.status()).toBe('completed');
    const s = e.getState();
    expect(s.world.bankedMs).toBe(125 * MIN);
    expect(s.world.focusMs).toBe(25 * MIN);
    expect(e.focusTime()).toBe(25 * MIN);
    expect(sessionGrowth(s.session!, h.now)).toBe(125 * MIN);
    // the session's segment is as long as the world time it covers
    expect(s.world.pace!.at(-1)).toEqual({ w0: 0, len: 125 * MIN, w1: 125 * MIN });
  });

  it('the rate is fixed when a session starts; a change applies from the next one', async () => {
    const h = harness();
    const e = h.open();
    await e.updateSettings({ growthRate: 2 });
    await e.start({ targetMs: 10 * MIN });
    await h.advance(5 * MIN);
    await e.updateSettings({ growthRate: 10 });
    expect(e.getState().settings.growthRate).toBe(10);
    expect(e.getState().session!.rate).toBe(2);
    await h.advance(5 * MIN);
    await e.continueAfter();
    expect(e.worldTime()).toBe(20 * MIN);
    await e.start({ targetMs: MIN });
    await h.advance(MIN);
    expect(e.worldTime()).toBe(30 * MIN);
    expect(e.focusTime()).toBe(11 * MIN);
  });

  it('a world that only ever ran at ×1 keeps its stored shape; focus time starts from it later', async () => {
    const h = harness();
    const e = h.open();
    await e.updateSettings({ mode: 'stopwatch' });
    await e.start();
    await h.advance(30 * MIN);
    await e.finish();
    expect(e.getState().world.focusMs).toBeUndefined();
    expect(e.getState().session!.rate).toBeUndefined();
    expect(e.focusTime()).toBe(30 * MIN);
    await e.continueAfter();
    await e.updateSettings({ growthRate: 5 });
    await e.start();
    await h.advance(6 * MIN);
    // a stopwatch segment stays open-ended
    expect(e.getState().world.pace!.at(-1)).toEqual({ w0: 30 * MIN, len: null, w1: null });
    await e.finish();
    expect(e.getState().world.bankedMs).toBe(60 * MIN);
    expect(e.getState().world.focusMs).toBe(36 * MIN);
  });

  it('a reload mid-session keeps the rate', async () => {
    const h = harness();
    const a = h.open();
    await a.updateSettings({ growthRate: 10 });
    await a.start({ targetMs: 30 * MIN });
    await h.advance(3 * MIN);
    const b = h.open();
    expect(b.getState().session!.rate).toBe(10);
    expect(b.worldTime()).toBe(30 * MIN);
    expect(focusTime(b.getState(), h.now)).toBe(3 * MIN);
  });

  it('stored values are checked: unknown rates read as ×1, impossible focus time is dropped', () => {
    const now = Date.UTC(2026, 9, 6);
    const world = { id: 'w', seed: 1, rulesVersion: 2, bankedMs: 10 * MIN, createdAt: now, base: { W: 0, legacy: null } };
    const session = { id: 's', mode: 'countdown', status: 'running', targetMs: 25 * MIN, accruedMs: 0, segmentStartedAt: now, startedAt: now, endedAt: null, worldMsAtStart: 10 * MIN, banked: false, endReason: null };
    const raw = (w: object, sess: object, settings: object) => ({ v: 3, rev: 1, updatedAt: now, world: w, session: sess, settings, marks: { celebratedSessionId: null }, archive: [] });
    const ok = validatePersisted(raw({ ...world, focusMs: 4 * MIN }, { ...session, rate: 5 }, { growthRate: 10, mode: 'clock' }), now)!;
    expect(ok.world.focusMs).toBe(4 * MIN);
    expect(ok.session!.rate).toBe(5);
    expect(ok.settings.growthRate).toBe(10);
    expect(ok.settings.mode).toBe('clock');
    const bad = validatePersisted(raw({ ...world, focusMs: 11 * MIN }, { ...session, rate: 3 }, { growthRate: 7, mode: 'timer' }), now)!;
    expect(bad.world.focusMs).toBeUndefined();
    expect(bad.session!.rate).toBeUndefined();
    expect(bad.settings.growthRate).toBe(1);
    expect(bad.settings.mode).toBe('countdown');
  });
});

describe('growth rate in words', () => {
  it('the summary line adds up as shown and reads the number right', () => {
    const sess = { id: 's', mode: 'countdown' as const, status: 'completed' as const, targetMs: null, accruedMs: 21_800, segmentStartedAt: null, startedAt: 0, endedAt: 0, worldMsAtStart: 0, banked: true, endReason: 'user' as const };
    expect(rateLine(sess)).toBeNull();
    expect(rateLine({ ...sess, rate: 5 })).toBe('21초 집중했고, 풍경은 ×5로 1분 45초만큼 자랐어요.');
    expect(rateLine({ ...sess, rate: 10, accruedMs: 25.5 * MIN })).toBe('25분 30초 집중했고, 풍경은 ×10으로 4시간 15분만큼 자랐어요.');
    expect(rateLine({ ...sess, rate: 2, accruedMs: 90 * MIN + 30_000 })).toBe('1시간 30분 집중했고, 풍경은 ×2로 3시간만큼 자랐어요.');
  });
});

describe('clock mode', () => {
  it('never starts a session and never grows the world', async () => {
    const h = harness();
    const e = h.open();
    await e.updateSettings({ mode: 'clock' });
    await e.start();
    await h.advance(20 * MIN);
    expect(e.status()).toBe('idle');
    expect(e.getState().session).toBeNull();
    expect(e.worldTime()).toBe(0);
  });

  it('cannot be switched to while a session is open', async () => {
    const h = harness();
    const e = h.open();
    await e.start({ targetMs: 25 * MIN });
    await e.updateSettings({ mode: 'clock' });
    expect(e.getState().settings.mode).toBe('countdown');
    await e.finish();
    await e.updateSettings({ mode: 'clock' });
    expect(e.getState().settings.mode).toBe('clock');
  });
});
