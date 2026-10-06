/**
 * Which building each colony site becomes (pure, deterministic from seed and unit).
 *
 * The plan follows the colony's growth: the first outpost mines and powers itself and gets a
 * habitat and a storage; the second brings the command centre, research and the first turret;
 * the third trains a garrison (barracks, factory); the fourth is a new outpost by fresh
 * deposits with a network relay. Later settlements repeat that pattern with more variety, and
 * each settlement's last site is a relay that links it to the next.
 *
 * Facilities built under older rules keep the kind they were built as: the frozen plan of
 * simulation v1 (data version 2) names them, and they map to today's buildings.
 */

import { rngFor } from '../core/rng';
import type { SpaceKind } from './config';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from './units';
import type { SpaceKind as V1Kind } from './v1/config';
import { kindOf as kindOfV1 } from './v1/spacePlan';

export type SpaceFlavorId = 'landing' | 'crater' | 'greenhouse' | 'workyard';

export interface SpaceFlavor {
  id: SpaceFlavorId;
  craters: number;
}

export const SPACE_FLAVORS: Record<SpaceFlavorId, SpaceFlavor> = {
  landing: { id: 'landing', craters: 1 },
  crater: { id: 'crater', craters: 1.8 },
  greenhouse: { id: 'greenhouse', craters: 0.7 },
  workyard: { id: 'workyard', craters: 1.2 },
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

/** The first settlement, outpost by outpost. */
const FIRST: SpaceKind[][] = [
  ['extractor', 'generator', 'habitat', 'storage'],
  ['command', 'research', 'generator', 'turret'],
  ['barracks', 'factory', 'habitat', 'storage'],
  ['extractor', 'generator', 'turret', 'relay'],
];

/** Kind of a site under today's plan. */
export function planKind(seed: number, unit: number): SpaceKind {
  const a = address(unit);
  if (a.zone === 0) return FIRST[a.clusterInZone][a.slot];
  // the settlement's last site links it to the next one
  if (a.inZone === UPZ - 1) return 'relay';
  // every outpost mines and powers itself first
  if (a.slot === 0) return 'extractor';
  if (a.slot === 1) return a.clusterInZone % 2 === 0 ? 'generator' : 'turret';
  const r = rngFor(seed, unit, 47);
  if (a.clusterInZone === 2 && a.slot === 2) return a.zone % 2 ? 'barracks' : 'factory';
  if (a.clusterInZone === 0 && a.slot === 3 && a.zone % 2 === 1) return 'dish';
  const options: SpaceKind[] = a.zone >= 2 ? ['habitat', 'storage', 'greenhouse', 'dome', 'generator'] : ['habitat', 'storage', 'greenhouse', 'generator'];
  const weights = a.zone >= 2 ? [3, 2, 2, 3, 1] : [3, 2, 2, 1];
  return r.weighted(options, weights);
}

/** Buildings of the moon-base days, as they serve the colony today. */
export function mapV1(k: V1Kind): SpaceKind {
  switch (k) {
    case 'power':
      return 'generator';
    case 'observatory':
      return 'research';
    case 'comms':
      return 'dish';
    case 'workshop':
      return 'factory';
    case 'hub':
      return 'command';
    default:
      return k;
  }
}

/**
 * Kind of any unit. Units below `v1Units` were built (or begun) under the older rules and keep
 * their kinds: below `kindsFrom` the timer-spawn plan, then the moon-base plan of v1.
 */
export function kindOf(seed: number, unit: number, kindsFrom: number, v1Units: number): SpaceKind {
  if (unit < v1Units) return mapV1(kindOfV1(seed, unit, kindsFrom));
  return planKind(seed, unit);
}
