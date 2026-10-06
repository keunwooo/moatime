import { describe, expect, it } from 'vitest';
import { EventDirector } from '../scene/director';
import { WORLD } from '../sim/config';
import { dayAt, nextPhaseAt } from './clock';
import { worldEnv } from './env';
import { seasonMix } from './season';
import { BLOCK_MS, eventAt, eventOfBlock, eventsIn, PRIORITY, type EventDef } from './timeline';

const MIN = 60_000;

describe('world clock', () => {
  const L = WORLD.forestDayMs;
  it('a new world starts in the early morning; noon, dusk and night follow in order', () => {
    const d0 = dayAt('forest', 0);
    expect(d0.phase).toBe('dawn');
    expect(d0.sun.elev).toBeGreaterThan(0);
    expect(d0.sun.az).toBeLessThan(0); // in the east
    const noon = dayAt('forest', (0.5 - WORLD.startPhase) * L);
    expect(noon.phase).toBe('day');
    expect(noon.sun.elev).toBeCloseTo(1, 5);
    expect(dayAt('forest', (0.8 - WORLD.startPhase) * L).phase).toBe('dusk');
    const midnight = dayAt('forest', (1 - WORLD.startPhase) * L);
    expect(midnight.phase).toBe('night');
    expect(midnight.stars).toBeGreaterThan(0.99);
    expect(midnight.day).toBe(1);
  });

  it('changes smoothly: sky weights sum to 1 and never jump between seconds', () => {
    let prev = dayAt('forest', 0);
    for (let W = 1000; W < 2 * L; W += 1000) {
      const d = dayAt('forest', W);
      expect(d.sky.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      for (let i = 0; i < 4; i++) expect(Math.abs(d.sky[i] - prev.sky[i])).toBeLessThan(0.02);
      expect(Math.abs(d.light - prev.light)).toBeLessThan(0.02);
      expect(d.light).toBeGreaterThanOrEqual(0.34 - 1e-9);
      prev = d;
    }
  });

  it('a 25-minute session sees a whole day; the planet day is longer', () => {
    const phases = new Set<string>();
    for (let W = 0; W <= 25 * MIN; W += 10_000) phases.add(dayAt('forest', W).phase);
    expect([...phases].sort()).toEqual(['dawn', 'day', 'dusk', 'night']);
    expect(WORLD.spaceDayMs).toBeGreaterThan(WORLD.forestDayMs);
  });

  it('finds the next sunrise and sunset', () => {
    for (const from of [0, 5 * MIN, 31 * MIN]) {
      const t = nextPhaseAt('forest', from, WORLD.sunset);
      expect(t).toBeGreaterThan(from);
      expect(Math.abs(dayAt('forest', t).sun.elev)).toBeLessThan(0.01);
      expect(t - from).toBeLessThanOrEqual(L + 1);
    }
  });
});

describe('seasons on the longer year', () => {
  it('three forest days per season, spring first', () => {
    expect(seasonMix(0).id).toBe(0);
    expect(seasonMix(3 * WORLD.forestDayMs + 5 * MIN).id).toBe(1);
  });
});

describe('world timeline', () => {
  const defs: EventDef[] = [
    { kind: 'rare', theme: 'forest', prio: PRIORITY.RARE, grid: 3, chance: 0.7, durMs: [2 * MIN, 5 * MIN] },
    { kind: 'raid', theme: 'forest', prio: PRIORITY.COMBAT, grid: 2, chance: 0.5, durMs: [MIN, 2 * MIN], eligible: (c) => c.W > 2 * 3600_000 },
    { kind: 'calm', theme: 'forest', prio: PRIORITY.AMBIENT, grid: 1, chance: 0.4, durMs: [MIN, 3 * MIN] },
    { kind: 'elsewhere', theme: 'space', prio: PRIORITY.COMBAT, grid: 1, chance: 1, durMs: [MIN, 2 * MIN] },
  ];

  it('is deterministic and never overlaps; one event per block', () => {
    const a = eventsIn(defs, 'forest', 99, 0, 400 * BLOCK_MS);
    const b = eventsIn(defs, 'forest', 99, 0, 400 * BLOCK_MS);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(100);
    for (let i = 1; i < a.length; i++) expect(a[i].t0).toBeGreaterThanOrEqual(a[i - 1].t1);
    for (const e of a) {
      expect(Math.floor(e.t0 / BLOCK_MS)).toBe(Math.floor((e.t1 - 1) / BLOCK_MS));
      expect(e.kind).not.toBe('elsewhere');
    }
  });

  it('respects priority, grid spacing and eligibility', () => {
    const a = eventsIn(defs, 'forest', 7, 0, 600 * BLOCK_MS);
    const raids = a.filter((e) => e.kind === 'raid');
    expect(raids.length).toBeGreaterThan(20);
    for (const r of raids) expect(r.t0).toBeGreaterThan(2 * 3600_000);
    const rare = a.filter((e) => e.kind === 'rare').map((e) => Math.floor(e.t0 / BLOCK_MS));
    for (let i = 1; i < rare.length; i++) expect(rare[i] - rare[i - 1]).toBeGreaterThanOrEqual(3);
  });

  it('a block keeps the candidate with the highest priority', () => {
    const both: EventDef[] = [
      { kind: 'low', theme: 'forest', prio: PRIORITY.AMBIENT, grid: 1, chance: 1, durMs: [MIN, MIN] },
      { kind: 'high', theme: 'forest', prio: PRIORITY.COMBAT, grid: 1, chance: 1, durMs: [MIN, MIN], eligible: (c) => c.block % 2 === 0 },
    ];
    for (let b = 0; b < 40; b++) expect(eventOfBlock(both, 'forest', 1, b)?.kind).toBe(b % 2 === 0 ? 'high' : 'low');
  });

  it('eventAt reports exactly the running event', () => {
    const a = eventsIn(defs, 'forest', 3, 0, 50 * BLOCK_MS);
    for (const e of a.slice(0, 10)) {
      expect(eventAt(defs, 'forest', 3, e.t0)).toEqual(e);
      expect(eventAt(defs, 'forest', 3, e.t1)).toBeNull();
      expect(eventAt(defs, 'forest', 3, e.t0 - 1)).toBeNull();
    }
  });

  it('the environment is a pure function of the world', () => {
    expect(worldEnv('forest', 5, 123_456)).toEqual(worldEnv('forest', 5, 123_456));
  });
});

describe('event director', () => {
  const frame = (o: Partial<Parameters<EventDirector['begin']>[0]> = {}) => ({ t: 10, motion: true, quiet: false, effects: 1, headline: -1, weather: 0, ...o });

  it('caps flourishes at one and visitors at two', () => {
    const d = new EventDirector();
    d.begin(frame());
    expect(d.request('star', 'fx', 2)).toBe(true);
    expect(d.request('comet-trail', 'fx', 2)).toBe(false);
    expect(d.request('bird', 'ambient', 7)).toBe(true);
    expect(d.request('fly', 'ambient', 8)).toBe(true);
    expect(d.request('rabbit', 'ambient', 8)).toBe(false);
    // slots end with their duration
    d.begin(frame({ t: 12.5 }));
    expect(d.request('comet-trail', 'fx', 2)).toBe(true);
    d.begin(frame({ t: 19 }));
    expect(d.request('rabbit', 'ambient', 8)).toBe(true);
  });

  it('a headline event, rough weather, a moving camera or no motion hold extras back', () => {
    const d = new EventDirector();
    d.begin(frame({ headline: PRIORITY.COMBAT }));
    expect(d.request('star', 'fx', 2)).toBe(false);
    expect(d.request('bird', 'ambient', 7)).toBe(true);
    expect(d.request('fly', 'ambient', 7)).toBe(false);
    d.begin(frame({ t: 30, weather: 0.8 }));
    expect(d.request('fly', 'ambient', 7)).toBe(false);
    d.begin(frame({ t: 40, quiet: true }));
    expect(d.request('star', 'fx', 2)).toBe(false);
    d.begin(frame({ t: 50, motion: false }));
    expect(d.request('star', 'fx', 2)).toBe(false);
    expect(d.particles('weather')).toBe(0);
  });

  it('particle budgets follow the effect intensity', () => {
    const d = new EventDirector();
    d.begin(frame({ effects: 1 }));
    const base = d.particles('weather');
    d.begin(frame({ effects: 0.45 }));
    expect(d.particles('weather')).toBeLessThan(base * 0.5);
    d.begin(frame({ effects: 1.6 }));
    expect(d.particles('weather')).toBeGreaterThan(base * 1.5);
  });
});

import { lightning, rainFillAt, rainSpans, SCRIPTS, scriptOf, segmentsOf, snowCover, WEATHER_BLOCK_MS, weatherAt, weatherRaw, wetness } from './weather';
import { SEASON } from '../sim/config';

describe('forest weather', () => {
  const calm = new Set(['CLEAR', 'CLOUDY', 'FOG']);

  it('every script starts and ends calm; blocks never straddle a season', () => {
    for (const list of SCRIPTS) for (const sc of list) {
      expect(calm.has(sc.steps[0][0])).toBe(true);
      expect(calm.has(sc.steps[sc.steps.length - 1][0])).toBe(true);
      expect(sc.steps.reduce((a, s) => a + s[1], 0)).toBeCloseTo(1, 6);
    }
    expect((SEASON.yearMs / 4) % WEATHER_BLOCK_MS).toBe(0);
  });

  it('changes smoothly: intensities never jump between seconds', () => {
    let prev = weatherRaw(11, 0).look;
    for (let W = 1000; W < 12 * WEATHER_BLOCK_MS; W += 1000) {
      const l = weatherRaw(11, W).look;
      for (const k of ['cloud', 'rain', 'snow', 'fog', 'wind', 'dark'] as const) expect(Math.abs(l[k] - prev[k])).toBeLessThan(0.02);
      prev = l;
    }
  });

  it('snow only in winter, the first block is clear, and the same world always has the same sky', () => {
    expect(scriptOf(5, 0).name).toBe('clear');
    for (let seed = 1; seed < 30; seed++) {
      for (let b = 0; b < 24; b++) {
        const winter = Math.floor((b * WEATHER_BLOCK_MS) % SEASON.yearMs / (SEASON.yearMs / 4)) === 3;
        for (const s of segmentsOf(seed, b)) if (s.id === 'SNOW') expect(winter).toBe(true);
      }
    }
    expect(weatherAt('forest', 3, 4_321_000)).toEqual(weatherAt('forest', 3, 4_321_000));
  });

  it('rain wets the ground and it dries again; snow builds up in winter and is gone in spring', () => {
    // find a long rain span
    const spans = rainSpans(7, 0, 40 * WEATHER_BLOCK_MS).filter((s) => s.t1 - s.t0 > 6 * 60_000);
    expect(spans.length).toBeGreaterThan(0);
    const sp = spans[0];
    expect(wetness(7, sp.t0)).toBeLessThan(wetness(7, sp.t1));
    expect(wetness(7, sp.t1 + 40 * 60_000)).toBeLessThan(0.15);
    let maxSnow = 0;
    for (let W = 0; W < 4 * SEASON.yearMs; W += 5 * 60_000) {
      const s = snowCover(7, W);
      const season = Math.floor((W % SEASON.yearMs) / (SEASON.yearMs / 4));
      if (season === 1 || season === 2) expect(s).toBe(0);
      if (season === 0 && (W % SEASON.yearMs) > SEASON.yearMs / 16) expect(s).toBe(0);
      maxSnow = Math.max(maxSnow, s);
    }
    expect(maxSnow).toBeGreaterThan(0.4);
  });

  it('lightning is soft and rare: at most two flashes in ten seconds, never a hard frame', () => {
    let storms = 0;
    for (let seed = 1; seed < 80 && storms < 3; seed++) {
      for (let b = 0; b < 16; b++) {
        const st = segmentsOf(seed, b).find((s) => s.id === 'STORM');
        if (!st) continue;
        storms++;
        let starts = 0;
        let prevF = 0;
        let lastStart = -1e9;
        for (let W = st.t0; W < st.t1; W += 20) {
          const f = lightning(seed, W).flash;
          expect(f - prevF).toBeLessThan(0.2); // rises over ~120 ms
          if (f > 0 && prevF === 0) {
            expect(W - lastStart).toBeGreaterThan(5000);
            lastStart = W;
            starts++;
          }
          prevF = f;
        }
        expect(starts).toBeGreaterThan(0);
        break;
      }
    }
    expect(storms).toBeGreaterThan(0);
  });

  it('rain fills the barrel sooner, never later', () => {
    for (let W = 0; W < 30 * WEATHER_BLOCK_MS; W += 7 * 60_000 + 13) {
      const t = rainFillAt(9, W, 3 * 60_000);
      expect(t).toBeGreaterThanOrEqual(W + 60_000);
      expect(t).toBeLessThanOrEqual(W + 3 * 60_000);
      expect(Number.isInteger(t)).toBe(true);
    }
    const sp = rainSpans(9, 0, 40 * WEATHER_BLOCK_MS).find((s) => s.t1 - s.t0 > 10 * 60_000)!;
    expect(rainFillAt(9, sp.t0, 3 * 60_000)).toBeLessThan(sp.t0 + 3 * 60_000);
  });
});
