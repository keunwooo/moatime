/**
 * Which facility each moon-base site becomes (pure, deterministic from seed and unit).
 *
 * Units completed under the old rules keep the kind they were built as (`legacyKind`).
 * New sites follow a plan where every role has a job in the base: each outpost starts with a
 * solar module, the first outpost brings a habitat, a rover workshop and a survey antenna, and
 * the last site of each settlement is the link hub that opens the next one.
 */

import { rngFor } from './rng';
import type { SpaceKind } from './config';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from './units';

export type SpaceFlavorId = 'landing' | 'crater' | 'greenhouse' | 'workyard';

export interface SpaceFlavor {
  id: SpaceFlavorId;
  kinds: SpaceKind[];
  weights: number[];
  craters: number;
}

export const SPACE_FLAVORS: Record<SpaceFlavorId, SpaceFlavor> = {
  landing: { id: 'landing', kinds: ['habitat', 'greenhouse', 'comms', 'workshop', 'observatory'], weights: [3, 2, 2, 1, 1], craters: 1 },
  crater: { id: 'crater', kinds: ['observatory', 'comms', 'habitat', 'workshop', 'greenhouse'], weights: [3, 3, 2, 1, 1], craters: 1.8 },
  greenhouse: { id: 'greenhouse', kinds: ['greenhouse', 'habitat', 'workshop', 'comms', 'observatory'], weights: [4, 2, 1, 1, 1], craters: 0.7 },
  workyard: { id: 'workyard', kinds: ['workshop', 'habitat', 'comms', 'greenhouse', 'observatory'], weights: [3, 2, 2, 1, 1], craters: 1.2 },
};

const ORDER: SpaceFlavorId[] = ['landing', 'crater', 'greenhouse', 'workyard'];

export function spaceFlavorOf(seed: number, zone: number): SpaceFlavor {
  if (zone < 4) return SPACE_FLAVORS[ORDER[zone]];
  const s = (Math.imul(seed ^ 0x51a7f00d, 0x9e3779b1) >>> 0) % 3;
  return SPACE_FLAVORS[ORDER[(zone + Math.floor(zone / 4) * s) % 4]];
}

function address(unit: number) {
  const zone = Math.floor(unit / UPZ);
  const inZone = unit - zone * UPZ;
  const clusterInZone = Math.floor(inZone / UPC);
  return { zone, inZone, clusterInZone, slot: inZone - clusterInZone * UPC };
}

/** Kind under the old (timer-spawn) rules; kept for facilities that were already built. */
export function legacyKind(seed: number, unit: number): SpaceKind {
  const a = address(unit);
  if (a.slot === 0) return 'power';
  if (unit === 1) return 'habitat';
  const flavor = spaceFlavorOf(seed, a.zone);
  const used = new Set<SpaceKind>(['power']);
  let kind: SpaceKind = 'habitat';
  for (let s = 1; s <= a.slot; s++) {
    const u = unit - a.slot + s;
    if (u === 1) {
      kind = 'habitat';
    } else {
      const r = rngFor(seed, u, 41);
      const options = flavor.kinds.filter((k) => !used.has(k));
      const weights = options.map((k) => flavor.weights[flavor.kinds.indexOf(k)]);
      kind = r.weighted(options, weights);
    }
    used.add(kind);
  }
  return kind;
}

const NEW_KINDS: SpaceKind[] = ['habitat', 'greenhouse', 'workshop', 'comms'];

/** Kind of a site under the resource rules. */
export function planKind(seed: number, unit: number): SpaceKind {
  const a = address(unit);
  if (a.inZone === UPZ - 1) return 'hub';
  if (a.slot === 0) return 'power';
  if (a.zone === 0 && a.clusterInZone === 0) return (['power', 'habitat', 'workshop', 'comms'] as SpaceKind[])[a.slot];
  if (a.clusterInZone === 0) {
    if (a.slot === 3) return 'comms';
    if (a.zone === 1 && a.slot === 1) return 'workshop';
  }
  // the rest varies with the settlement's character, without repeats inside an outpost
  const flavor = spaceFlavorOf(seed, a.zone);
  const used = new Set<SpaceKind>(['power']);
  if (a.clusterInZone === 0) used.add('comms');
  let kind: SpaceKind = 'habitat';
  for (let s = 1; s <= a.slot; s++) {
    const u = unit - a.slot + s;
    const fixed = a.clusterInZone === 0 && a.zone === 1 && s === 1 ? 'workshop' : null;
    if (fixed) kind = fixed;
    else {
      const options = NEW_KINDS.filter((k) => !used.has(k) && (k !== 'comms' || a.clusterInZone !== 0));
      const weights = options.map((k) => {
        const i = flavor.kinds.indexOf(k);
        const w = i >= 0 ? flavor.weights[i] : 1;
        // rover workshops beyond the first two only add variety, so keep them rare
        return k === 'workshop' ? w * 0.4 : k === 'comms' ? w * 0.5 : w;
      });
      kind = options.length ? rngFor(seed, u, 43).weighted(options, weights) : 'habitat';
    }
    used.add(kind);
  }
  return kind;
}

/** Kind of any unit: built under the old rules (index < legacyUnits) or planned now. */
export function kindOf(seed: number, unit: number, legacyUnits: number): SpaceKind {
  return unit < legacyUnits ? legacyKind(seed, unit) : planKind(seed, unit);
}
