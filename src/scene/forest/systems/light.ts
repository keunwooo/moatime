/**
 * Day and night light of the forest: one light colour for the whole diorama (a multiply tint),
 * the colour and strength of the haze, the light shafts from the sun, shadow direction and
 * the frost of cold clear mornings. Everything follows the world clock and the weather, so
 * the light changes over minutes of running time, never in a jump.
 */

import type { RGB } from '../../paint/color';
import { mix, num } from '../../paint/color';
import type { WorldEnv } from '../../../world/env';
import { F } from '../palette';

export interface ForestLight {
  /** Multiply tint of the diorama (land, trees, actors). */
  tint: RGB;
  /** Tint of the distant ridges. */
  hills: number;
  /** Colour of clouds. */
  cloud: number;
  hazeColor: number;
  /** Extra haze opacity (dawn mist, fog, rain). */
  hazeAdd: number;
  /** Light shaft strength 0..1 (sun up and not clouded over). */
  rays: number;
  /** 0 day .. 1 deep night (stars, lanterns, fireflies, night UI). */
  night: number;
  /** Frost on cold clear mornings and nights in winter (0..1). */
  frost: number;
}

const DAY: RGB = [255, 255, 255];
const DAWN: RGB = [255, 230, 220];
const DUSK: RGB = [255, 210, 176];
const NIGHT: RGB = [146, 162, 214];
const STORM: RGB = [168, 176, 192];
/** Winter twilight is cooler than summer's. */
const DAWN_COLD: RGB = [234, 228, 240];
const DUSK_COLD: RGB = [238, 216, 216];

const HAZE_DAY = F.mist;
const HAZE_DAWN: RGB = [196, 208, 226];
const HAZE_DUSK: RGB = [236, 210, 192];
const HAZE_NIGHT: RGB = [92, 106, 142];

const CLOUD_DAY: RGB = [255, 255, 255];
const CLOUD_DAWN: RGB = [255, 226, 216];
const CLOUD_DUSK: RGB = [248, 204, 186];
const CLOUD_NIGHT: RGB = [116, 126, 164];

function weigh(w: readonly number[], cols: RGB[]): RGB {
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < cols.length; i++) {
    out[0] += cols[i][0] * w[i];
    out[1] += cols[i][1] * w[i];
    out[2] += cols[i][2] * w[i];
  }
  return out;
}

const mul = (a: RGB, b: RGB): RGB => [(a[0] * b[0]) / 255, (a[1] * b[1]) / 255, (a[2] * b[2]) / 255];

export function forestLight(env: WorldEnv): ForestLight {
  const { day, weather, season } = env;
  // sky weights: night, dawn, day, dusk
  const sw = day.sky;
  const cold = season.w[3] + season.w[2] * 0.25;
  let tint = weigh(sw, [NIGHT, mix(DAWN, DAWN_COLD, cold), DAY, mix(DUSK, DUSK_COLD, cold)]);
  // a low sun warms the land a little beyond the twilight colours
  tint = mix(tint, [255, 240, 214], day.warm * sw[2] * 0.35);
  // heavy cloud: duller and cooler
  tint = mix(tint, mul(tint, STORM), weather.dark);
  // a lightning flash lifts the land only slightly (the sky does the rest)
  tint = mix(tint, DAY, weather.flash * 0.12);
  let cloud = weigh(sw, [CLOUD_NIGHT, CLOUD_DAWN, CLOUD_DAY, CLOUD_DUSK]);
  cloud = mix(cloud, mul(cloud, [140, 148, 166]), weather.dark);
  let haze = weigh(sw, [HAZE_NIGHT, HAZE_DAWN, HAZE_DAY, mix(HAZE_DUSK, HAZE_DAWN, cold * 0.6)]);
  haze = mix(haze, mul(haze, [186, 192, 204]), weather.dark);
  // distant ridges take the light and a little of the haze colour
  const hills = num(mix(tint, mix(haze, [255, 255, 255], 0.3), 0.25));
  const winter = season.w[3];
  const calm = 1 - Math.min(1, weather.cloud * 1.2);
  const frost = winter * calm * (sw[0] + sw[1] * 1.2) * (1 - weather.snowCover);
  return {
    tint,
    hills,
    cloud: num(cloud),
    hazeColor: num(haze),
    hazeAdd: sw[1] * 0.07 + weather.fog * 0.32 + weather.rain * 0.06 + weather.snow * 0.08 + sw[0] * 0.03,
    rays: sw[2] * (1 - weather.cloud) * (1 - weather.fog) * Math.min(1, day.sun.elev * 4),
    night: day.stars,
    frost: Math.min(1, frost),
  };
}
