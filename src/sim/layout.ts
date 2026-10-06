/**
 * Work places of the simulation (depots, deposits, springs, benches…) as named nodes.
 *
 * The simulation measures distances on the wide layout only, so its results never depend on
 * the screen. The scene resolves the same node names in its own geometry and moves workers
 * along them by the simulated progress of each step.
 *
 * Node names: a letter and a number, e.g. `d3` (depot of global cluster 3), `s17` (work spot
 * at unit 17). `L0` is the lander of the first zone.
 */

import { RULES_UNITS_PER_CLUSTER, RULES_UNITS_PER_ZONE } from './units';
import { clusterWorld, geometryFor, isRightCluster, slotWorld, type Geometry, type Vec2 } from '../core/world';
import type { WorkTheme as ThemeId } from '../core/session';

export type NodeId = string;

function clusterOf(cluster: number) {
  const zone = Math.floor(cluster / 4);
  return { zone, c: cluster - zone * 4 };
}

/** +1 when the zone center (the open clearing) is to the right of this cluster. */
function innerSide(clusterInZone: number): number {
  return isRightCluster(clusterInZone) ? -1 : 1;
}

function rel(seed: number, cluster: number, g: Geometry, dx: number, dz: number): Vec2 {
  const { zone, c } = clusterOf(cluster);
  const cc = clusterWorld(seed, zone, c, g);
  const k = g.aspect === 'tall' ? 0.62 : 1;
  return { x: cc.x + innerSide(c) * dx * k, z: cc.z + dz };
}

export function unitPos(seed: number, unit: number, g: Geometry, theme: ThemeId): Vec2 {
  const zone = Math.floor(unit / RULES_UNITS_PER_ZONE);
  const inZone = unit - zone * RULES_UNITS_PER_ZONE;
  const c = Math.floor(inZone / RULES_UNITS_PER_CLUSTER);
  return slotWorld(seed, zone, c, inZone - c * RULES_UNITS_PER_CLUSTER, g, theme);
}

export function clusterOfUnit(unit: number): number {
  return Math.floor(unit / RULES_UNITS_PER_CLUSTER);
}

export function innerOfUnit(unit: number): number {
  return innerSide(clusterOfUnit(unit) % 4);
}

// ---- space ------------------------------------------------------------------

export const SPACE_NODES = {
  depot: { dx: 150, dz: -62 },
  /** Metal deposit (the main vein), crystal outcrop and the rare seam research reveals. */
  ore: { dx: -140, dz: -48 },
  crystal: { dx: -210, dz: -132 },
  rare: { dx: -300, dz: -10 },
  charger: { dx: 215, dz: -20 },
  park: { dx: 95, dz: -122 },
  /** Where the maintenance drones wait, behind the depot. */
  bay: { dx: 232, dz: -112 },
  /** The outpost's energy vent (the generators draw on it). */
  vent: { dx: 262, dz: -172 },
};

// ---- forest -----------------------------------------------------------------

export const FOREST_NODES = {
  bench: { dx: 82, dz: -34 },
  compost: { dx: 132, dz: 8 },
  barrel: { dx: 52, dz: -66 },
  spring: { dx: -88, dz: -42 },
  basin: { dx: 55, dz: 232 },
  rest: { dx: 76, dz: -50 },
  beds: [
    { dx: 52, dz: -128 },
    { dx: -258, dz: 232 },
    { dx: 300, dz: 150 },
    { dx: -300, dz: 40 },
  ],
};

/**
 * Zone landmarks, placed beside the clearing where the keeper is when they are made, so the
 * view never has to pull far back: the pond by the third clearing (dug once two groves stand),
 * the old tree on the outer side of the first clearing (planted early in the zone; from the
 * later clearings it stands at the side of the view instead of in front of the work).
 */
export const ZONE_NODES = {
  pond: { cluster: 2, dx: 330, dz: -40 },
  /** Around the pond's center: three dig spots and the stone edge. */
  pondSpots: [
    { dx: -62, dz: -12 },
    { dx: 8, dz: -26 },
    { dx: 66, dz: -10 },
    { dx: 0, dz: -34 },
  ],
  elder: { cluster: 0, dx: -310, dz: 330 },
  elderStand: { dx: 24, dz: -16 },
};

/** Center of a zone's pond. */
export function pondCenter(seed: number, zone: number, g: Geometry): Vec2 {
  return rel(seed, zone * 4 + ZONE_NODES.pond.cluster, g, ZONE_NODES.pond.dx, ZONE_NODES.pond.dz);
}

/** Where a zone's old tree stands. */
export function elderPos(seed: number, zone: number, g: Geometry): Vec2 {
  return rel(seed, zone * 4 + ZONE_NODES.elder.cluster, g, ZONE_NODES.elder.dx, ZONE_NODES.elder.dz);
}

function offset(p: Vec2, g: Geometry, dx: number, dz: number): Vec2 {
  const k = g.aspect === 'tall' ? 0.62 : 1;
  return { x: p.x + dx * k, z: p.z + dz };
}

/** Channel from the spring to the basin, as a share 0..1 of its length. */
export function channelPoint(seed: number, cluster: number, g: Geometry, t: number): Vec2 {
  const a = rel(seed, cluster, g, FOREST_NODES.spring.dx, FOREST_NODES.spring.dz);
  const b = rel(seed, cluster, g, FOREST_NODES.basin.dx, FOREST_NODES.basin.dz);
  // a gentle bend away from the first tree (plain arithmetic keeps travel times exact everywhere)
  const arc = 4 * t * (1 - t);
  const bend = arc * 70 * innerSide(cluster % 4) * (g.aspect === 'tall' ? 0.62 : 1);
  return { x: a.x + (b.x - a.x) * t - bend, z: a.z + (b.z - a.z) * t + arc * 30 };
}

/** Where a worker stands to work at a unit's site. */
function siteSpot(seed: number, unit: number, g: Geometry, theme: ThemeId): Vec2 {
  const p = unitPos(seed, unit, g, theme);
  const side = innerOfUnit(unit);
  const k = g.aspect === 'tall' ? 0.7 : 1;
  // in front of the site, a little toward the depot: hauls are short but visible
  if (theme === 'space') return { x: p.x + side * 72 * k, z: p.z - 80 };
  // beside the plant and a little behind it, so the keeper never hides a sprout
  return { x: p.x + side * 22 * k, z: p.z + 6 };
}

/** Position of a node in the given geometry. Unknown names resolve to the origin. */
export function nodePos(theme: ThemeId, seed: number, g: Geometry, id: NodeId): Vec2 {
  const kind = id.charCodeAt(0);
  const n = Number(id.slice(1));
  if (theme === 'space') {
    switch (kind) {
      case 100 /* d */:
        return rel(seed, n, g, SPACE_NODES.depot.dx, SPACE_NODES.depot.dz);
      case 111 /* o: metal deposit */:
        return rel(seed, n, g, SPACE_NODES.ore.dx, SPACE_NODES.ore.dz);
      case 120 /* x: crystal outcrop */:
        return rel(seed, n, g, SPACE_NODES.crystal.dx, SPACE_NODES.crystal.dz);
      case 121 /* y: rare seam */:
        return rel(seed, n, g, SPACE_NODES.rare.dx, SPACE_NODES.rare.dz);
      case 99 /* c */:
        return rel(seed, n, g, SPACE_NODES.charger.dx, SPACE_NODES.charger.dz);
      case 101 /* e: maintenance bay */:
        return rel(seed, n, g, SPACE_NODES.bay.dx, SPACE_NODES.bay.dz);
      case 118 /* v: energy vent */:
        return rel(seed, n, g, SPACE_NODES.vent.dx, SPACE_NODES.vent.dz);
      case 76 /* L: the first outpost's charging spot by the lander's battery */:
        return rel(seed, 0, g, SPACE_NODES.charger.dx, SPACE_NODES.charger.dz);
      case 112 /* p */: {
        // one spot per drone: cluster·8 + drone id, in two rows of three
        const id = n % 8;
        const col = id % 3;
        const row = Math.floor(id / 3);
        return rel(seed, Math.floor(n / 8), g, SPACE_NODES.park.dx - col * 84, SPACE_NODES.park.dz - col * 14 - row * 46);
      }
      case 115 /* s */:
        return siteSpot(seed, n, g, 'space');
      case 104 /* h: a helper's spot, on the other front corner of the site */: {
        const s = siteSpot(seed, n, g, 'space');
        const u = unitPos(seed, n, g, 'space');
        return { x: 2 * u.x - s.x, z: s.z };
      }
      case 117 /* u */:
        return unitPos(seed, n, g, 'space');
    }
  } else {
    switch (kind) {
      case 98 /* b */:
        return rel(seed, n, g, FOREST_NODES.bench.dx, FOREST_NODES.bench.dz);
      case 107 /* k */:
        return rel(seed, n, g, FOREST_NODES.compost.dx, FOREST_NODES.compost.dz);
      case 114 /* r */:
        return rel(seed, n, g, FOREST_NODES.barrel.dx, FOREST_NODES.barrel.dz);
      case 119 /* w */:
        return rel(seed, n, g, FOREST_NODES.spring.dx, FOREST_NODES.spring.dz);
      case 97 /* a */:
        return rel(seed, n, g, FOREST_NODES.basin.dx, FOREST_NODES.basin.dz);
      case 104 /* h */:
        return rel(seed, n, g, FOREST_NODES.rest.dx, FOREST_NODES.rest.dz);
      case 101 /* e: channel segment, cluster·8 + i */: {
        const c = Math.floor(n / 8);
        const i = n % 8;
        return channelPoint(seed, c, g, (i + 1) / 4);
      }
      case 102 /* f: flowerbed spot, cluster·4 + k */: {
        const b = FOREST_NODES.beds[n % 4];
        return rel(seed, Math.floor(n / 4), g, b.dx, b.dz);
      }
      case 115 /* s */:
        return siteSpot(seed, n, g, 'forest');
      case 117 /* u */:
        return unitPos(seed, n, g, 'forest');
      case 113 /* q: pond spot, zone·4 + i */: {
        const q = ZONE_NODES.pondSpots[n % 4];
        return offset(pondCenter(seed, Math.floor(n / 4), g), g, q.dx, q.dz);
      }
      case 103 /* g: the zone's old tree */:
        return elderPos(seed, n, g);
      case 71 /* G: where the keeper stands at the old tree */: {
        // on the side of the tree that faces its clearing
        const e = elderPos(seed, n, g);
        const side = innerSide(ZONE_NODES.elder.cluster);
        return offset(e, g, ZONE_NODES.elderStand.dx * side, ZONE_NODES.elderStand.dz);
      }
    }
  }
  return { x: 0, z: 0 };
}

/** Distance measurement for the simulation: always on the wide layout. */
export class TravelTable {
  private cache = new Map<string, number>();
  private pos = new Map<string, Vec2>();
  private g = geometryFor('wide');
  constructor(
    private theme: ThemeId,
    private seed: number,
    private speed: number,
  ) {}

  private p(id: NodeId): Vec2 {
    let v = this.pos.get(id);
    if (!v) {
      v = nodePos(this.theme, this.seed, this.g, id);
      if (this.pos.size > 4000) this.pos.clear();
      this.pos.set(id, v);
    }
    return v;
  }

  /** Travel time in ms (integer, at least 600 ms for any real move). */
  ms(a: NodeId, b: NodeId): number {
    if (a === b) return 0;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    let t = this.cache.get(key);
    if (t === undefined) {
      const pa = this.p(a);
      const pb = this.p(b);
      const dx = pb.x - pa.x;
      const dz = pb.z - pa.z;
      // sqrt is correctly rounded everywhere, unlike Math.hypot
      t = Math.max(600, Math.round((Math.sqrt(dx * dx + dz * dz) / this.speed) * 1000));
      if (this.cache.size > 8000) this.cache.clear();
      this.cache.set(key, t);
    }
    return t;
  }
}
