import { describe, expect, it } from 'vitest';
import { geometryFor, pathWorld, slotWorld, zoneOrigin, addressOf } from './world';
import { rulesFor } from './rules';
import { josa, statusLine, summarize } from './describe';
import { flavorIndex } from '../scene/forest/palette';
import { spaceFlavorOf } from '../sim/spacePlan';
import { legacyKind as facilityKind } from '../sim/v1/spacePlan';
import { advanceForest, forestCtx, initForest } from '../sim/forest';
import { advanceSpace, initSpace, spaceCtx } from '../sim/space';
import { initialState } from './session';

const R = rulesFor(1);

describe('world geometry', () => {
  for (const aspect of ['wide', 'tall'] as const) {
    const g = geometryFor(aspect);
    it(`${aspect}: is deterministic and keeps slots apart`, () => {
      for (const seed of [1, 777, 2 ** 31 + 5]) {
        expect(zoneOrigin(seed, 7, g)).toEqual(zoneOrigin(seed, 7, g));
        for (let zone = 0; zone < 6; zone++) {
          const pts = Array.from({ length: 16 }, (_, i) => slotWorld(seed, zone, Math.floor(i / 4), i % 4, g, 'forest'));
          for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
              expect(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)).toBeGreaterThan(90);
            }
          }
        }
      }
    });
    it(`${aspect}: the path of each zone continues the previous one`, () => {
      for (let zone = 1; zone < 12; zone++) {
        const prev = pathWorld(99, zone - 1, g);
        const next = pathWorld(99, zone, g);
        const a = prev[prev.length - 1];
        const b = next[0];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
      }
    });
    it(`${aspect}: newer zones sit in front so older zones remain behind`, () => {
      for (let zone = 1; zone < 50; zone++) {
        expect(zoneOrigin(5, zone, g).z).toBeLessThan(zoneOrigin(5, zone - 1, g).z);
      }
    });
  }
});

describe('variation', () => {
  it('neighbouring forest zones never share a flavor', () => {
    for (const seed of [0, 3, 12345, 99999999]) {
      for (let z = 1; z < 3000; z++) expect(flavorIndex(seed, z)).not.toBe(flavorIndex(seed, z - 1));
    }
  });
  it('neighbouring settlements never share a flavor', () => {
    for (const seed of [0, 3, 12345]) {
      for (let z = 1; z < 600; z++) expect(spaceFlavorOf(seed, z).id).not.toBe(spaceFlavorOf(seed, z - 1).id);
    }
  });
  it('each outpost starts with power and never repeats a facility kind', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (let c = 0; c < 200; c++) {
        const kinds = [0, 1, 2, 3].map((s) => facilityKind(seed, c * 4 + s));
        expect(kinds[0]).toBe('power');
        expect(new Set(kinds).size).toBe(4);
      }
    }
    expect(facilityKind(1, 1)).toBe('habitat');
  });
  it('addresses map units into slots, clusters and zones', () => {
    expect(addressOf(0, R)).toEqual({ unit: 0, zone: 0, clusterInZone: 0, slot: 0 });
    expect(addressOf(21, R)).toEqual({ unit: 21, zone: 1, clusterInZone: 1, slot: 1 });
  });
});

describe('words', () => {
  it('picks Korean particles by final consonant', () => {
    expect(josa('나무', '이', '가')).toBe('나무가');
    expect(josa('시설', '이', '가')).toBe('시설이');
    expect(josa('3번째 나무', '이', '가')).toBe('3번째 나무가');
  });
  it('describes the real work and the session summary from the simulation', () => {
    const f0 = initForest(1, { W: 0, legacy: null });
    const fctx = forestCtx(1);
    advanceForest(f0, fctx, 9_000);
    expect(statusLine('forest', 'running', f0, 9_000, false)).toBe('샘에서 물을 긷고 있어요.');
    expect(statusLine('space', 'completed', initSpace(1, { W: 0, legacy: null }), 0, false)).toBe('오늘의 시간이 기지에 남았어요.');
    const before = initSpace(1, { W: 0, legacy: null });
    const after = initSpace(1, { W: 0, legacy: null });
    advanceSpace(after, spaceCtx(1), 25 * 60_000);
    const s = initialState(0, 1);
    s.world.bankedMs = 25 * 60_000;
    const sum = summarize(
      'space',
      s,
      {
        id: 's',
        mode: 'countdown',
        status: 'completed',
        targetMs: 25 * 60_000,
        accruedMs: 25 * 60_000,
        segmentStartedAt: null,
        startedAt: 0,
        endedAt: 0,
        worldMsAtStart: 0,
        banked: true,
        endReason: 'timer',
      },
      before,
      after,
    );
    expect(sum.lines.join(' ')).toContain(`금속 ${after.mined.m}`);
    expect(sum.lines.join(' ')).toContain(`결정 ${after.mined.c}상자`);
    expect(sum.lines.join(' ')).toContain(`건물 ${after.done}개가 완성됐어요.`);
  });
});
