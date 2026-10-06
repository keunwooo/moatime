/**
 * Fixed world structure shared by the simulation and the scene: every unit (tree or facility)
 * has a slot in a cluster (4 per cluster) and clusters form zones (4 per zone).
 */

export const RULES_UNITS_PER_CLUSTER = 4;
export const RULES_CLUSTERS_PER_ZONE = 4;
export const RULES_UNITS_PER_ZONE = RULES_UNITS_PER_CLUSTER * RULES_CLUSTERS_PER_ZONE;

export function zoneOfUnit(unit: number): number {
  return Math.floor(unit / RULES_UNITS_PER_ZONE);
}

export function slotOfUnit(unit: number): number {
  return unit % RULES_UNITS_PER_CLUSTER;
}

export function clusterInZoneOfUnit(unit: number): number {
  return Math.floor((unit % RULES_UNITS_PER_ZONE) / RULES_UNITS_PER_CLUSTER);
}
