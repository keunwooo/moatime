import { hex, type RGB } from '../paint/color';

/** Forest palette (art direction §6). Deep green is reserved for shadow accents. */
export const F = {
  cream: hex('#F3EBDD'),
  sage: hex('#A7B99A'),
  moss: hex('#6F8968'),
  apricot: hex('#E8B99A'),
  sun: hex('#EBCF94'),
  deep: hex('#294B3E'),
  // derived
  mist: hex('#EEEADF'),
  skyTop: hex('#DCE2D3'),
  skyMid: hex('#E9E7D8'),
  skyLow: hex('#F5EDDC'),
  hillFar: hex('#C9CEC0'),
  hillLav: hex('#C4C2C8'),
  hillMid: hex('#B3BFA9'),
  bark: hex('#8E7B6B'),
  barkLight: hex('#C2AE98'),
  barkDark: hex('#5E5550'),
  birch: hex('#E6DFD0'),
  soil: hex('#A99282'),
  soilDark: hex('#7E6D63'),
  stone: hex('#ABA7B0'),
  stoneLight: hex('#D9D3D1'),
  water: hex('#A3C0BC'),
  waterDeep: hex('#7EA3A4'),
  lavender: hex('#B7AFCB'),
  butter: hex('#F2DE9F'),
  rose: hex('#E9B8AE'),
} as const;

export interface SpeciesPalette {
  name: string;
  base: RGB;
  light: RGB;
  shadow: RGB;
  bark: RGB;
  barkLight: RGB;
  leaf: RGB;
}

export const SPECIES: Record<string, SpeciesPalette> = {
  round: {
    name: 'round',
    base: hex('#93A985'),
    light: hex('#D3DAAE'),
    shadow: hex('#5F7A64'),
    bark: F.bark,
    barkLight: F.barkLight,
    leaf: hex('#9DB487'),
  },
  tall: {
    name: 'tall',
    base: hex('#7F9A7B'),
    light: hex('#BFCD9E'),
    shadow: hex('#4C6A5A'),
    bark: hex('#7D6E64'),
    barkLight: hex('#B09D8C'),
    leaf: hex('#8BA57F'),
  },
  birch: {
    name: 'birch',
    base: hex('#ABC094'),
    light: hex('#E2E5B9'),
    shadow: hex('#728F70'),
    bark: F.birch,
    barkLight: hex('#F6F1E6'),
    leaf: hex('#B4C796'),
  },
  blossom: {
    name: 'blossom',
    base: hex('#F1CDC3'),
    light: hex('#FCEEE6'),
    shadow: hex('#D0A39C'),
    bark: hex('#8A766C'),
    barkLight: hex('#BCA595'),
    leaf: hex('#EFCBBB'),
  },
  maple: {
    name: 'maple',
    base: hex('#E3B48D'),
    light: hex('#F3D7A9'),
    shadow: hex('#B7866A'),
    bark: hex('#857266'),
    barkLight: hex('#B8A08E'),
    leaf: hex('#E8BE93'),
  },
  pine: {
    name: 'pine',
    base: hex('#6F8C70'),
    light: hex('#A7BA92'),
    shadow: hex('#3E5E52'),
    bark: hex('#776A62'),
    barkLight: hex('#A8978A'),
    leaf: hex('#7C9876'),
  },
};

export type FlavorId = 'spring' | 'mossy' | 'flower' | 'brook';

export interface Flavor {
  id: FlavorId;
  species: string[];
  weights: number[];
  flowers: number;
  mushrooms: number;
  ferns: number;
}

export const FLAVORS: Record<FlavorId, Flavor> = {
  spring: { id: 'spring', species: ['round', 'birch', 'blossom', 'tall'], weights: [3, 2, 2, 1], flowers: 1, mushrooms: 0.4, ferns: 0.6 },
  mossy: { id: 'mossy', species: ['round', 'pine', 'tall', 'birch'], weights: [2, 3, 2, 1], flowers: 0.5, mushrooms: 1.6, ferns: 1.4 },
  flower: { id: 'flower', species: ['blossom', 'round', 'maple', 'birch'], weights: [3, 2, 2, 1], flowers: 1.8, mushrooms: 0.3, ferns: 0.4 },
  brook: { id: 'brook', species: ['birch', 'tall', 'round', 'pine'], weights: [3, 2, 2, 1], flowers: 0.8, mushrooms: 0.6, ferns: 1 },
};

const ORDER: FlavorId[] = ['spring', 'mossy', 'flower', 'brook'];

/**
 * Zones 0–3 introduce each flavor once; later zones rotate with a per-seed step at every
 * block of four, so neighbouring zones never share a flavor (closed form, no recursion).
 */
export function flavorOf(seed: number, zone: number): Flavor {
  return FLAVORS[ORDER[flavorIndex(seed, zone)]];
}

export function flavorIndex(seed: number, zone: number): number {
  if (zone < 4) return zone;
  const s = (Math.imul(seed ^ 0x2545f491, 0x9e3779b1) >>> 0) % 3;
  return (zone + Math.floor(zone / 4) * s) % 4;
}
