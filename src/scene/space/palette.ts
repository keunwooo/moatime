import { hex, mix, type RGB } from '../paint/color';
import type { SpaceKind } from '../../sim/config';
import { KIND_NAME } from '../../sim/describe';

/**
 * Planet-colony palette. A thin atmosphere keeps the sky deep violet (stars and the ringed gas
 * giant stay visible); the ground is rose-ochre sand in pastel gouache; modules stay cream with
 * warm windows.
 */
export const S = {
  space: hex('#1D1B3C'),
  lavender: hex('#9A8DB6'),
  sand: hex('#D2AC94'),
  teal: hex('#8DB9C9'),
  window: hex('#F0D29C'),
  text: hex('#F2F1E9'),
  // derived
  deep: hex('#110F27'),
  horizon: hex('#463C6C'),
  ridge: hex('#8A6F92'),
  ridgeFar: hex('#675A86'),
  sandLight: hex('#F1DCC8'),
  sandShadow: hex('#8C7697'),
  dust: hex('#B9998F'),
  hull: hex('#E6E4DE'),
  hullShadow: hex('#A3A6BE'),
  apricot: hex('#E8B99A'),
  panel: hex('#5D6C9A'),
  panelLight: hex('#93A7CF'),
  glass: hex('#A6CAD3'),
  plant: hex('#A7B99A'),
  metal: hex('#9497B0'),
  /** The gas giant's bands. */
  giant: hex('#AFD0D4'),
  giantBand: hex('#9590BE'),
  ring: hex('#DCD3EA'),
  /** The colony's own marks: teal for the work fleet, coral for maintenance and warnings. */
  team: hex('#4FBFC4'),
  coral: hex('#E8836A'),
  /** Armour plates and machinery. */
  armor: hex('#58628A'),
  /** Energy: cores, beams, power lines. */
  energy: hex('#9FEFFA'),
} as const;

export const warmGlow: RGB = mix(S.window, [255, 240, 205], 0.3);

/** Building artwork, one per kind of building (some kinds keep their moon-base names). */
export type FacilityKind =
  | 'power'
  | 'habitat'
  | 'bigdome'
  | 'greenhouse'
  | 'observatory'
  | 'comms'
  | 'relay'
  | 'workshop'
  | 'command'
  | 'extractor'
  | 'storage'
  | 'turret'
  | 'barracks';

/** Painting order (each art's seed follows its index, so older arts keep their look). */
export const FACILITY_ARTS: FacilityKind[] = ['power', 'habitat', 'greenhouse', 'observatory', 'comms', 'workshop', 'command', 'bigdome', 'relay', 'extractor', 'storage', 'turret', 'barracks'];

/** Which artwork a building is drawn with. */
export function artOf(kind: SpaceKind): FacilityKind {
  switch (kind) {
    case 'generator':
      return 'power';
    case 'factory':
      return 'workshop';
    case 'research':
      return 'observatory';
    case 'dish':
      return 'comms';
    case 'dome':
      return 'bigdome';
    default:
      return kind;
  }
}

export const FACILITY_NAMES = KIND_NAME;

export { SPACE_FLAVORS, spaceFlavorOf, type SpaceFlavor, type SpaceFlavorId } from '../../sim/spacePlan';

/** Crates and chunks by resource: steel-grey metal, rose-white crystal, amber rare mineral. */
export const CRATE_TINT = { m: 0xc6cad6, c: 0xf7d9ec, r: 0xffcf86 } as const;
export const CHUNK_TINT = { m: 0xffffff, c: 0xf4c8e8, r: 0xffc062 } as const;
