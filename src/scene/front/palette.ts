/**
 * Colours of the front: each people's own (FRONT_PROMPT.md 4절) and each planet's ground
 * (7절). Pure white is never used; the brightest things on screen are a few window and muzzle
 * pixels.
 */

import type { RaceId } from '../../core/session';
import type { BiomeId } from '../../sim/frontPlan';
import { hex, type RGB } from '../paint/color';

export interface RacePalette {
  /** Main body, its light and dark. */
  body: RGB;
  bodyLight: RGB;
  bodyDark: RGB;
  /** Signature accent (stripes, pauldrons, rings). */
  accent: RGB;
  /** Second accent (warning yellow, glow, gold leaf). */
  accent2: RGB;
  /** Glow of windows, pores and resonance. */
  glow: RGB;
  /** Outline ink. */
  ink: RGB;
  /** Territory tint on the ground. */
  ground: RGB;
  /** Projectile colour. */
  shot: RGB;
}

export const RACE_PAL: Record<RaceId, RacePalette> = {
  0: {
    body: hex('#5B6670'),
    bodyLight: hex('#8a96a0'),
    bodyDark: hex('#3e474f'),
    accent: hex('#D9603B'),
    accent2: hex('#E9C46A'),
    glow: hex('#F4D29C'),
    ink: hex('#262b31'),
    ground: hex('#8f8a80'),
    shot: hex('#f2a35a'),
  },
  1: {
    body: hex('#3FA796'),
    bodyLight: hex('#7cc9b5'),
    bodyDark: hex('#21423D'),
    accent: hex('#E9DFC7'),
    accent2: hex('#B8E06A'),
    glow: hex('#B8E06A'),
    ink: hex('#17302c'),
    ground: hex('#2f6e62'),
    shot: hex('#9fe0b4'),
  },
  2: {
    body: hex('#EEE8DE'),
    bodyLight: hex('#f6f2ea'),
    bodyDark: hex('#b9b1a6'),
    accent: hex('#E07A8F'),
    accent2: hex('#8FB3A8'),
    glow: hex('#f2a7b6'),
    ink: hex('#3A3540'),
    ground: hex('#c9b7c2'),
    shot: hex('#f29aac'),
  },
};

export interface BiomePalette {
  /** High ground (plateau tops), its cliff face, low ground and its darker patches. */
  top: RGB;
  cliff: RGB;
  low: RGB;
  lowDark: RGB;
  /** Paths and dust. */
  path: RGB;
  /** Small rocks and doodads. */
  rock: RGB;
  /** A colour of its own (lava cracks, ferns, crystal trees …). */
  feature: RGB;
  /** Sky band at the top: far and near. */
  sky0: RGB;
  sky1: RGB;
  /** Storm haze. */
  storm: RGB;
}

export const BIOME_PAL: Record<BiomeId, BiomePalette> = {
  karna: {
    top: hex('#C98A5A'),
    cliff: hex('#7A4A3A'),
    low: hex('#D9A97C'),
    lowDark: hex('#b9845e'),
    path: hex('#e6c39a'),
    rock: hex('#8f5c45'),
    feature: hex('#e2b68a'),
    sky0: hex('#1c1a2c'),
    sky1: hex('#5a3a3c'),
    storm: hex('#c98a5a'),
  },
  hwiel: {
    top: hex('#d8e2ea'),
    cliff: hex('#7d93a8'),
    low: hex('#e6ecef'),
    lowDark: hex('#b9c9d4'),
    path: hex('#f0f3f4'),
    rock: hex('#8aa0b3'),
    feature: hex('#9db7cc'),
    sky0: hex('#171d2e'),
    sky1: hex('#3f5468'),
    storm: hex('#e8eef2'),
  },
  onyx: {
    top: hex('#5f5866'),
    cliff: hex('#29252e'),
    low: hex('#5a5260'),
    lowDark: hex('#3a343f'),
    path: hex('#8a7e86'),
    rock: hex('#2f2a34'),
    feature: hex('#f07a3a'),
    sky0: hex('#160f14'),
    sky1: hex('#4a2a26'),
    storm: hex('#5d5458'),
  },
  verda: {
    top: hex('#6f8a4a'),
    cliff: hex('#3f5232'),
    low: hex('#87a35a'),
    lowDark: hex('#5f7d42'),
    path: hex('#a3b26c'),
    rock: hex('#56664a'),
    feature: hex('#d27a8f'),
    sky0: hex('#142018'),
    sky1: hex('#3c5236'),
    storm: hex('#6d8a6a'),
  },
  solen: {
    top: hex('#e6dccb'),
    cliff: hex('#b09e86'),
    low: hex('#efe7d8'),
    lowDark: hex('#d6c9b3'),
    path: hex('#f5efe3'),
    rock: hex('#bfae95'),
    feature: hex('#c9b6dd'),
    sky0: hex('#1b1a2a'),
    sky1: hex('#5c5470'),
    storm: hex('#efe4f2'),
  },
  arche: {
    top: hex('#b6a48c'),
    cliff: hex('#6e6253'),
    low: hex('#cbb99b'),
    lowDark: hex('#a8977c'),
    path: hex('#ddd0b6'),
    rock: hex('#8f8170'),
    feature: hex('#d9c7a2'),
    sky0: hex('#171624'),
    sky1: hex('#4d4558'),
    storm: hex('#a9a3c4'),
  },
  heart: {
    top: hex('#d9b06a'),
    cliff: hex('#8d6a3a'),
    low: hex('#e9c98a'),
    lowDark: hex('#c9a466'),
    path: hex('#f2dcae'),
    rock: hex('#a17a46'),
    feature: hex('#f2b544'),
    sky0: hex('#1a1424'),
    sky1: hex('#5a3f3a'),
    storm: hex('#f2d08a'),
  },
};

/** The time-crystal lake: dark water and its amber motes. */
export const LAKE = { deep: hex('#1a2440'), water: hex('#1e2a44'), shore: hex('#2c3a56'), mote: hex('#F2B544') };
export const FOG = hex('#2B2733');
export const SPACE = { deep: hex('#141428'), far: hex('#1e1c36'), star: hex('#e8e6f0'), red: hex('#b5523a') };
