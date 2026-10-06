/** Colours of "처음의 우주" (docs/COSMOS_PROMPT.md §4). No pure white anywhere. */

import { hex, num, type RGB } from '../paint/color';

export const C = {
  abyss: hex('#120F2A'),
  abyssTop: hex('#0D0B21'),
  abyssLow: hex('#1C1736'),
  nightMist: hex('#2A2550'),
  webViolet: hex('#7466B4'),
  ember: hex('#F3B07C'),
  emberCore: hex('#F7D9AA'),
  emberDeep: hex('#C9775A'),
  plum: hex('#5A3156'),
  rose: hex('#D47FA6'),
  roseDeep: hex('#9A4E7C'),
  teal: hex('#6CC9C1'),
  tealDeep: hex('#3E8C93'),
  gold: hex('#E8C27A'),
  firstStar: hex('#CFE0FF'),
  sun: hex('#F5D69A'),
  redStar: hex('#E89A78'),
  ocean: hex('#3F7FA6'),
  oceanDeep: hex('#2C5C82'),
  green: hex('#84B47C'),
  crust: hex('#8C7A6E'),
  crustDark: hex('#5C4F4C'),
  magma: hex('#E07A4E'),
  cloud: hex('#E9EBF2'),
  text: hex('#EEF0FA'),
  dust: hex('#7A4E46'),
} satisfies Record<string, RGB>;

export const N = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, num(v)])) as Record<keyof typeof C, number>;

/** Star tints by kind. */
export const STAR_TINT = { red: N.redStar, yellow: N.sun, blue: N.firstStar, binary: N.sun } as const;
