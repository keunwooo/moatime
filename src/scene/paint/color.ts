/** Small color toolkit for painting (sRGB, 0–255). */

import type { Rng } from '../../core/rng';

export type RGB = readonly [number, number, number];

export function hex(h: string): RGB {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.replace(/(.)/g, '$1$1') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function css(c: RGB, a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

export function num(c: RGB): number {
  return ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgbToHsl(c: RGB): [number, number, number] {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

/** Random small variation in hue / saturation / lightness — the "hand" in a painted color. */
export function vary(c: RGB, r: Rng, dh = 0.015, ds = 0.05, dl = 0.04): RGB {
  const [h, s, l] = rgbToHsl(c);
  const out = hslToRgb(
    (h + r.range(-dh, dh) + 1) % 1,
    Math.min(1, Math.max(0, s + r.range(-ds, ds))),
    Math.min(1, Math.max(0, l + r.range(-dl, dl))),
  );
  return [clamp255(out[0]), clamp255(out[1]), clamp255(out[2])];
}

export function lighten(c: RGB, t: number): RGB {
  return mix(c, [255, 252, 244], t);
}

/** Darkens toward a cool deep tone instead of black, like gouache shadow. */
export function shade(c: RGB, t: number, toward: RGB = [38, 52, 66]): RGB {
  return mix(c, toward, t);
}

export function warm(c: RGB, t: number): RGB {
  return mix(c, [240, 206, 150], t);
}
