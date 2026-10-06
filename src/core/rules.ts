/**
 * World structure and the legacy growth rule.
 *
 * Rules version 1 (data version 1) grew one unit per C = 15 running minutes:
 *   n = floor(W / C) matured units, u = (W mod C) / C progress of the growing one.
 * Rules version 2 replaces that with the work simulation (src/sim): units are completed by
 * workers using gathered resources. Version 1 is kept to migrate old worlds exactly.
 * Both share the layout: units per cluster and clusters per zone.
 */

export interface GrowthRules {
  version: number;
  /** C: running time needed for one unit (tree / facility). */
  unitMs: number;
  unitsPerCluster: number;
  clustersPerZone: number;
}

const RULES: Record<number, GrowthRules> = {
  1: { version: 1, unitMs: 15 * 60 * 1000, unitsPerCluster: 4, clustersPerZone: 4 },
  // unitMs only describes the legacy rule; version 2 worlds grow by the simulation
  2: { version: 2, unitMs: 15 * 60 * 1000, unitsPerCluster: 4, clustersPerZone: 4 },
};

export const CURRENT_RULES_VERSION = 2;
export const LEGACY_RULES = RULES[1];

export function rulesFor(version: number): GrowthRules {
  return RULES[version] ?? RULES[CURRENT_RULES_VERSION];
}

export interface Growth {
  W: number;
  /** Index of the unit currently growing (== number of matured units). */
  unit: number;
  /** Progress of the growing unit in [0, 1). */
  u: number;
  unitsPerZone: number;
  zone: number;
  /** Cluster index within the zone. */
  clusterInZone: number;
  /** Global cluster index. */
  cluster: number;
  /** Slot index within the cluster. */
  slot: number;
  /** Unit index within the zone. */
  unitInZone: number;
  maturedClusters: number;
  maturedZones: number;
}

export function growthAt(Wraw: number, rules: GrowthRules): Growth {
  const W = Number.isFinite(Wraw) && Wraw > 0 ? Wraw : 0;
  const C = rules.unitMs;
  const unit = Math.floor(W / C);
  // Use subtraction rather than % to keep u exact for large W.
  const u = Math.min(Math.max((W - unit * C) / C, 0), 1 - Number.EPSILON);
  const upc = rules.unitsPerCluster;
  const upz = upc * rules.clustersPerZone;
  const zone = Math.floor(unit / upz);
  const unitInZone = unit - zone * upz;
  const clusterInZone = Math.floor(unitInZone / upc);
  const slot = unitInZone - clusterInZone * upc;
  return {
    W,
    unit,
    u,
    unitsPerZone: upz,
    zone,
    clusterInZone,
    cluster: Math.floor(unit / upc),
    slot,
    unitInZone,
    maturedClusters: Math.floor(unit / upc),
    maturedZones: Math.floor(unit / upz),
  };
}

/** World time at which the given unit starts growing. */
export function unitStartW(unit: number, rules: GrowthRules): number {
  return unit * rules.unitMs;
}

export function unitIndex(zone: number, clusterInZone: number, slot: number, rules: GrowthRules): number {
  return (zone * rules.clustersPerZone + clusterInZone) * rules.unitsPerCluster + slot;
}

/** Progress of an arbitrary unit at world time W: 0 before it starts, 1 once matured. */
export function unitProgress(unit: number, W: number, rules: GrowthRules): number {
  const start = unit * rules.unitMs;
  if (W <= start) return 0;
  const p = (W - start) / rules.unitMs;
  return p >= 1 ? 1 : p;
}

/** Converts seconds of running time into unit progress (used to size 8–12 s reveal windows). */
export function secondsToU(seconds: number, rules: GrowthRules): number {
  return (seconds * 1000) / rules.unitMs;
}
