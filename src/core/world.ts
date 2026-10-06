/**
 * World geometry shared by both themes. The landscape is a 2.5D diorama on a ground plane:
 * X is horizontal, Z is depth (away from the viewer), Y is height above the ground.
 *
 * Zones follow a meandering valley toward the viewer: zone j sits at Z = -j·spacing, so every
 * older zone remains visible in the misty distance behind the current one.
 * Within a zone, clusters flank a central clearing that stays open for the timer.
 */

import { hash32, rngFor } from './rng';
import type { GrowthRules } from './rules';
import type { ThemeId } from './session';

export type AspectClass = 'wide' | 'tall';

export interface Vec2 {
  x: number;
  z: number;
}

export interface Geometry {
  aspect: AspectClass;
  /** Half width of a zone (local x in [-half, half]). */
  halfWidth: number;
  /** Depth extent of a zone (local z in [0, depth]). */
  depth: number;
  /** Z distance between consecutive zones. */
  spacing: number;
  /** Lateral meander amplitude between zones. */
  meander: number;
  clusters: readonly Vec2[];
  /** Slot offsets for a left-side cluster; mirrored on the right side. */
  slots: readonly Vec2[];
  feature: Vec2;
}

const WIDE: Geometry = {
  aspect: 'wide',
  halfWidth: 1300,
  depth: 1300,
  spacing: 2000,
  meander: 1250,
  clusters: [
    { x: -720, z: 250 },
    { x: 720, z: 320 },
    { x: -600, z: 860 },
    { x: 600, z: 930 },
  ],
  slots: [
    { x: 0, z: 0 },
    { x: -175, z: 105 },
    { x: 160, z: 165 },
    { x: -35, z: 300 },
  ],
  feature: { x: 130, z: 420 },
};

const TALL: Geometry = {
  aspect: 'tall',
  halfWidth: 760,
  depth: 1300,
  spacing: 1850,
  meander: 720,
  clusters: [
    { x: -330, z: 210 },
    { x: 330, z: 290 },
    { x: -280, z: 800 },
    { x: 280, z: 870 },
  ],
  slots: [
    { x: 0, z: 0 },
    { x: -110, z: 110 },
    { x: 100, z: 170 },
    { x: -25, z: 300 },
  ],
  feature: { x: 60, z: 430 },
};

/** Facilities are wider than trees, so the space theme spreads slots a little. */
const SLOT_SPREAD: Record<ThemeId, number> = { forest: 1, space: 1.22 };

export function geometryFor(aspect: AspectClass): Geometry {
  return aspect === 'tall' ? TALL : WIDE;
}

export function aspectFor(width: number, height: number): AspectClass {
  return height > width * 1.05 ? 'tall' : 'wide';
}

const MEANDER = [0, 1, 0, -1];

/** World position of a zone's front-center. */
export function zoneOrigin(seed: number, zone: number, g: Geometry): Vec2 {
  if (zone <= 0) return { x: 0, z: 0 };
  const phase = hash32(seed, 77) % 4;
  const m = MEANDER[(zone + phase) % 4] - MEANDER[phase % 4];
  const jitter = ((hash32(seed, zone, 91) % 1000) / 1000 - 0.5) * g.meander * 0.18;
  return { x: m * g.meander + jitter, z: -zone * g.spacing };
}

export function isRightCluster(clusterInZone: number): boolean {
  return clusterInZone % 2 === 1;
}

export function clusterWorld(seed: number, zone: number, clusterInZone: number, g: Geometry): Vec2 {
  const o = zoneOrigin(seed, zone, g);
  const c = g.clusters[clusterInZone];
  const r = rngFor(seed, zone, clusterInZone, 13);
  return { x: o.x + c.x + r.range(-40, 40), z: o.z + c.z + r.range(-30, 30) };
}

export function slotWorld(
  seed: number,
  zone: number,
  clusterInZone: number,
  slot: number,
  g: Geometry,
  theme: ThemeId,
): Vec2 {
  const c = clusterWorld(seed, zone, clusterInZone, g);
  const s = g.slots[slot];
  const mirror = isRightCluster(clusterInZone) ? -1 : 1;
  const spread = SLOT_SPREAD[theme];
  const r = rngFor(seed, zone, clusterInZone, slot, 17);
  return {
    x: c.x + mirror * s.x * spread + r.range(-26, 26),
    z: c.z + s.z * spread + r.range(-22, 22),
  };
}

export interface UnitAddress {
  unit: number;
  zone: number;
  clusterInZone: number;
  slot: number;
}

export function addressOf(unit: number, rules: GrowthRules): UnitAddress {
  const upc = rules.unitsPerCluster;
  const upz = upc * rules.clustersPerZone;
  const zone = Math.floor(unit / upz);
  const inZone = unit - zone * upz;
  const clusterInZone = Math.floor(inZone / upc);
  return { unit, zone, clusterInZone, slot: inZone - clusterInZone * upc };
}

export function unitWorld(seed: number, unit: number, rules: GrowthRules, g: Geometry, theme: ThemeId): Vec2 {
  const a = addressOf(unit, rules);
  return slotWorld(seed, a.zone, a.clusterInZone, a.slot, g, theme);
}

export function featureWorld(seed: number, zone: number, g: Geometry): Vec2 {
  const o = zoneOrigin(seed, zone, g);
  return { x: o.x + g.feature.x, z: o.z + g.feature.z };
}

function pathFrontEnd(seed: number, zone: number, g: Geometry): Vec2 {
  const o = zoneOrigin(seed, zone, g);
  const r = rngFor(seed, zone, 31);
  return { x: o.x + r.range(-0.12, 0.12) * g.halfWidth, z: o.z - g.spacing * 0.2 };
}

/**
 * The connecting path of a zone in world coordinates, from its back end (which meets the
 * previous zone's front end) through the clearing to its own front end. Consecutive zones
 * therefore share endpoints and read as one continuous path.
 */
export function pathWorld(seed: number, zone: number, g: Geometry, samples = 28): Vec2[] {
  const o = zoneOrigin(seed, zone, g);
  const r = rngFor(seed, zone, 29);
  const back: Vec2 =
    zone > 0 ? pathFrontEnd(seed, zone - 1, g) : { x: o.x - g.halfWidth * 0.1, z: o.z + g.depth * 1.6 };
  const ctrl: Vec2[] = [
    back,
    { x: o.x + r.range(-0.08, 0.08) * g.halfWidth, z: o.z + g.depth * 1.0 },
    { x: o.x + g.feature.x - 150, z: o.z + g.feature.z + 60 },
    { x: o.x + r.range(-0.1, 0.06) * g.halfWidth, z: o.z + g.depth * 0.08 },
    pathFrontEnd(seed, zone, g),
  ];
  return catmullRom(ctrl, samples);
}

/** Uniform Catmull-Rom through control points (endpoints duplicated). */
export function catmullRom(ctrl: Vec2[], samples: number): Vec2[] {
  const out: Vec2[] = [];
  const n = ctrl.length - 1;
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * n;
    const k = Math.min(Math.floor(t), n - 1);
    const f = t - k;
    const p0 = ctrl[Math.max(k - 1, 0)];
    const p1 = ctrl[k];
    const p2 = ctrl[k + 1];
    const p3 = ctrl[Math.min(k + 2, n)];
    const f2 = f * f;
    const f3 = f2 * f;
    const cr = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
    out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) });
  }
  return out;
}
