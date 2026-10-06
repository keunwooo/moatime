/**
 * Light of the planet's day (32 minutes of running time). The atmosphere is thin, so the sky
 * stays deep and starry all day; what the hour changes is the light on the land (warm rose at
 * dawn and dusk, cool violet at night), a glow along the horizon, how many stars show through
 * and how bright the colony's windows read.
 */

import type { WorldEnv } from '../../world/env';
import { num, type RGB } from '../paint/color';

export interface SpaceLight {
  /** Multiply tint of the diorama (ground, buildings, drones). */
  tint: number;
  hills: number;
  /** The glow band on the horizon. */
  glow: number;
  glowAlpha: number;
  haze: number;
  /** Star visibility 0.5..1. */
  stars: number;
  /** Window lights 0 (day) .. 1 (night). */
  windows: number;
  night: number;
}

// keyframes in DayState.sky order: night, dawn, day, dusk
const TINT: RGB[] = [[160, 154, 204], [248, 216, 206], [255, 255, 255], [246, 206, 200]];
const HILLS: RGB[] = [[132, 126, 182], [236, 200, 202], [255, 255, 255], [232, 192, 198]];
const GLOW: RGB[] = [[112, 98, 172], [255, 172, 142], [228, 164, 172], [255, 144, 132]];
const GLOW_A = [0.1, 0.5, 0.2, 0.55];
const HAZE: RGB[] = [[124, 112, 178], [232, 172, 172], [206, 164, 172], [222, 152, 162]];
const STARS = [1, 0.78, 0.55, 0.78];
const WINDOWS = [1, 0.4, 0, 0.45];

const blend = (k: RGB[], w: readonly number[]): RGB => [
  k[0][0] * w[0] + k[1][0] * w[1] + k[2][0] * w[2] + k[3][0] * w[3],
  k[0][1] * w[0] + k[1][1] * w[1] + k[2][1] * w[2] + k[3][1] * w[3],
  k[0][2] * w[0] + k[1][2] * w[1] + k[2][2] * w[2] + k[3][2] * w[3],
];
const blend1 = (k: number[], w: readonly number[]) => k[0] * w[0] + k[1] * w[1] + k[2] * w[2] + k[3] * w[3];

export function spaceLight(env: WorldEnv): SpaceLight {
  const w = env.day.sky;
  return {
    tint: num(blend(TINT, w)),
    hills: num(blend(HILLS, w)),
    glow: num(blend(GLOW, w)),
    glowAlpha: blend1(GLOW_A, w),
    haze: num(blend(HAZE, w)),
    stars: blend1(STARS, w),
    windows: blend1(WINDOWS, w),
    night: w[0],
  };
}
