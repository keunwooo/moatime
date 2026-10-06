/** Tileable fractal value noise for painting (build time only), computed as whole fields. */

import { hash32 } from '../../core/rng';

const fade = (t: number) => t * t * (3 - 2 * t);

/**
 * A W×H field of fractal noise in 0..1 that tiles seamlessly. `f` is the number of lattice cells
 * across at the base octave; `aspect` = W/H keeps cells square.
 */
export function fbmField(seed: number, W: number, H: number, f: number, octaves = 4, aspect = W / H): Float32Array {
  const out = new Float32Array(W * H);
  let amp = 1;
  let norm = 0;
  let fx = f;
  for (let o = 0; o < octaves; o++) {
    const px = Math.max(1, Math.round(fx));
    const py = Math.max(1, Math.round(fx / aspect));
    const lat = new Float32Array(px * py);
    for (let y = 0; y < py; y++) for (let x = 0; x < px; x++) lat[y * px + x] = hash32(seed + o * 101, x, y) / 4294967296;
    for (let y = 0; y < H; y++) {
      const v = (y / H) * py;
      const y0 = Math.floor(v);
      const ty = fade(v - y0);
      const r0 = (y0 % py) * px;
      const r1 = ((y0 + 1) % py) * px;
      for (let x = 0; x < W; x++) {
        const u = (x / W) * px;
        const x0 = Math.floor(u);
        const tx = fade(u - x0);
        const x1 = (x0 + 1) % px;
        const a = lat[r0 + x0];
        const b = lat[r0 + x1];
        const c = lat[r1 + x0];
        const d = lat[r1 + x1];
        out[y * W + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
    }
    norm += amp;
    amp *= 0.5;
    fx *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
