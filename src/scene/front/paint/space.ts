/**
 * Space for the orbit and system stages: the starry deep with the dying red star Aster, a planet's
 * curved horizon seen from orbit (its biome's colours, clouds, the night side), and small planet
 * discs for the system map and the sky band (lit toward the star, a soft atmosphere rim).
 */

import { Rng } from '../../../core/rng';
import type { BiomeId } from '../../../sim/frontPlan';
import { applyGrain, makeCanvas, softEllipse, type PaintCanvas } from '../../paint/brush';
import { css, lighten, mix, shade, type RGB } from '../../paint/color';
import { fbmField } from '../noise';
import { BIOME_PAL, SPACE } from '../palette';

/** The deep: a dark field with a faint dust band and stars (tileable horizontally is not needed). */
export function paintDeep(w: number, h: number, seed: number): PaintCanvas {
  const pc = makeCanvas(w, h);
  const { ctx } = pc;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(SPACE.deep));
  g.addColorStop(1, css(mix(SPACE.deep, SPACE.far, 0.8)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = new Rng(seed);
  // a faint dust band across
  for (let i = 0; i < 40; i++) {
    const x = r.range(0, w);
    const y = h * (0.25 + 0.3 * (x / w)) + r.range(-h * 0.08, h * 0.08);
    softEllipse(ctx, x, y, r.range(40, 120), r.range(14, 40), mix(SPACE.far, [90, 70, 110], 0.4), 0.12, 0);
  }
  for (let i = 0; i < Math.round((w * h) / 2600); i++) {
    const x = r.range(0, w);
    const y = r.range(0, h);
    const b = r.next();
    ctx.fillStyle = css(mix(SPACE.star, [240, 200, 180], r.next() * 0.4), 0.25 + b * 0.6);
    const s = b > 0.96 ? 1.6 : b > 0.8 ? 1.1 : 0.7;
    ctx.fillRect(x, y, s, s);
  }
  applyGrain(ctx, null, w, h, 0.1);
  return pc;
}

/** The red star: a dim, large disc with a soft corona (the brightest part kept small). */
export function paintStar(size: number): PaintCanvas {
  const pc = makeCanvas(size, size);
  const c = size / 2;
  softEllipse(pc.ctx, c, c, c, c, SPACE.red, 0.28, 0, 1);
  softEllipse(pc.ctx, c, c, c * 0.62, c * 0.62, mix(SPACE.red, [240, 150, 100], 0.4), 0.55, 0.1, 1);
  const g = pc.ctx.createRadialGradient(c * 0.92, c * 0.9, 0, c, c, c * 0.42);
  g.addColorStop(0, css([246, 170, 120], 0.95));
  g.addColorStop(0.7, css(SPACE.red, 0.9));
  g.addColorStop(1, css(shade(SPACE.red, 0.3), 0.85));
  pc.ctx.fillStyle = g;
  pc.ctx.beginPath();
  pc.ctx.arc(c, c, c * 0.42, 0, Math.PI * 2);
  pc.ctx.fill();
  return pc;
}

/** A planet's horizon from orbit: a wide curved slice of its surface, lit from the upper left. */
export function paintLimb(biome: BiomeId, seed: number, w: number, h: number): PaintCanvas {
  const pal = BIOME_PAL[biome];
  const pc = makeCanvas(w, h);
  const { ctx } = pc;
  // the planet is a huge circle whose top just shows: centre far below the canvas
  const R = w * 1.25;
  const cx = w / 2;
  const cy = R + h * 0.12;
  const field = fbmField(seed + 7, 256, 64, 9, 4);
  const img = ctx.createImageData(w, h);
  const D = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * w + x) * 4;
      if (d > R + 6) {
        D[i + 3] = 0;
        continue;
      }
      const n = field[Math.floor((y / h) * 63) * 256 + Math.floor((x / w) * 255)];
      let c: RGB = mix(pal.lowDark, pal.top, n);
      if (n > 0.62) c = mix(c, lighten(pal.low, 0.3), (n - 0.62) * 1.6); // clouds and bright plains
      // lit from the upper left, darker toward the right (the night side)
      const lit = 0.55 + 0.45 * (1 - x / w) - 0.25 * (y / h);
      c = mix(shade(c, 0.6), c, Math.min(1, Math.max(0, lit)));
      // the atmosphere along the rim
      const rim = Math.max(0, 1 - (R - d) / (h * 0.18));
      c = mix(c, lighten(pal.sky1, 0.5), rim * 0.55);
      D[i] = c[0];
      D[i + 1] = c[1];
      D[i + 2] = c[2];
      D[i + 3] = d > R ? Math.round(255 * (1 - (d - R) / 6)) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  applyGrain(ctx, null, w, h, 0.14);
  return pc;
}

/** A small planet disc, lit from the upper left, with an atmosphere rim. */
export function paintDisc(biome: BiomeId, seed: number, size: number): PaintCanvas {
  const pal = BIOME_PAL[biome];
  const pc = makeCanvas(size, size);
  const { ctx } = pc;
  const c = size / 2;
  const R = c * 0.8;
  const r = new Rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = css(pal.low);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 18; i++) softEllipse(ctx, r.range(0, size), r.range(0, size), r.range(4, R * 0.6), r.range(3, R * 0.3), r.next() < 0.5 ? pal.top : pal.lowDark, 0.6, 0);
  const g = ctx.createRadialGradient(c - R * 0.45, c - R * 0.45, R * 0.1, c, c, R * 1.15);
  g.addColorStop(0, 'rgba(255,250,240,0.25)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(10,8,20,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  ctx.strokeStyle = css(lighten(pal.sky1, 0.5), 0.6);
  ctx.lineWidth = size * 0.02;
  ctx.beginPath();
  ctx.arc(c, c, R * 1.01, Math.PI * 0.8, Math.PI * 1.75);
  ctx.stroke();
  return pc;
}
