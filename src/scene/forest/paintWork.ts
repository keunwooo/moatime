/**
 * Forest work artwork: the keeper's bench with its seed basket, the compost bin and leaf mould,
 * the rain barrel, the dug channel, and seasonal variants (autumn crowns, snow). Same gouache
 * language and upper-left light as the rest of the forest.
 */

import { Rng } from '../../core/rng';
import { applyGrain, blobPoints, gouache, makeCanvas, smoothPath, softEllipse, type PaintCanvas, type Pt } from '../paint/brush';
import { css, hex, lighten, mix, shade, vary, type RGB } from '../paint/color';
import { F, type SpeciesPalette } from './palette';

const TAU = Math.PI * 2;
const WOOD = mix(F.bark, F.sun, 0.25);
const WOOD_LIGHT = mix(F.barkLight, F.cream, 0.3);
const WOOD_DARK = mix(F.bark, F.deep, 0.3);

function plank(ctx: CanvasRenderingContext2D, pts: Pt[], r: Rng, base: RGB = WOOD) {
  gouache(ctx, pts, { base: vary(base, r, 0.01, 0.04, 0.04), light: WOOD_LIGHT, shadow: WOOD_DARK, r, roundness: 0.25, dabDensity: 18, grain: 0.12, rimLight: 0.25 });
}

/** A low garden bench. 192×96 for 64×32 wu (3 px/wu), base center at (96, 90). */
export function paintBench(seed: number): PaintCanvas {
  const pc = makeCanvas(192, 96);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 100, 90, 92, 7, [52, 62, 70], 0.4, 0);
  for (const x of [26, 160]) {
    plank(ctx, [
      { x: x - 6, y: 90 },
      { x: x - 5, y: 52 },
      { x: x + 5, y: 52 },
      { x: x + 6, y: 90 },
    ], r, WOOD_DARK);
  }
  plank(ctx, [
    { x: 6, y: 58 },
    { x: 10, y: 44 },
    { x: 184, y: 44 },
    { x: 186, y: 58 },
  ], r);
  ctx.strokeStyle = css(WOOD_DARK, 0.45);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(12, 51);
  ctx.lineTo(182, 51);
  ctx.stroke();
  return pc;
}

/** Woven seed basket (seeds are added by the scene). 96×64 for 24×16 wu, base center (48, 60). */
export function paintBasket(seed: number): PaintCanvas {
  const pc = makeCanvas(96, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 50, 60, 40, 4, [52, 62, 70], 0.35, 0);
  const body: Pt[] = [
    { x: 10, y: 26 },
    { x: 86, y: 26 },
    { x: 78, y: 58 },
    { x: 18, y: 58 },
  ];
  gouache(ctx, body, { base: mix(F.sun, F.bark, 0.35), light: lighten(F.sun, 0.3), shadow: mix(F.bark, F.deep, 0.25), r, roundness: 0.4, grain: 0.14 });
  ctx.strokeStyle = css(mix(F.bark, F.deep, 0.2), 0.45);
  ctx.lineWidth = 1.4;
  for (let y = 32; y < 58; y += 6) {
    ctx.beginPath();
    ctx.moveTo(12 + (y - 26) * 0.25, y);
    ctx.lineTo(84 - (y - 26) * 0.25, y);
    ctx.stroke();
  }
  // dark opening at the top
  ctx.fillStyle = css(mix(F.bark, F.deep, 0.45), 0.9);
  ctx.beginPath();
  ctx.ellipse(48, 27, 36, 6, 0, 0, TAU);
  ctx.fill();
  return pc;
}

/** Slatted compost bin, open at the top and front. 192×128 for 64×43 wu, base center (96, 122). */
export function paintCompostBin(seed: number): PaintCanvas {
  const pc = makeCanvas(192, 128);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 100, 122, 90, 8, [52, 62, 70], 0.4, 0);
  // back wall slats
  for (let i = 0; i < 4; i++) {
    const y = 46 + i * 18;
    plank(ctx, [
      { x: 18, y: y + 14 },
      { x: 20, y },
      { x: 172, y },
      { x: 174, y: y + 14 },
    ], r, mix(WOOD, F.moss, 0.12));
  }
  // posts
  for (const x of [18, 174]) {
    plank(ctx, [
      { x: x - 7, y: 122 },
      { x: x - 6, y: 34 },
      { x: x + 6, y: 34 },
      { x: x + 7, y: 122 },
    ], r, WOOD_DARK);
  }
  // a low front board
  plank(ctx, [
    { x: 14, y: 122 },
    { x: 15, y: 104 },
    { x: 177, y: 104 },
    { x: 178, y: 122 },
  ], r);
  return pc;
}

/** Heap of composting leaves (fresh on top). 192×96 for 56×28 wu, base center (96, 90). */
export function paintCompostHeap(seed: number, fall: RGB[]): PaintCanvas {
  const pc = makeCanvas(192, 96);
  const { ctx } = pc;
  const r = new Rng(seed);
  const mound = blobPoints(96, 70, 84, 30, r, { lumps: 0.18, flatBottom: 0.85 });
  gouache(ctx, mound, { base: mix(F.bark, F.soilDark, 0.5), light: mix(F.bark, F.sun, 0.4), shadow: mix(F.soilDark, F.deep, 0.3), r, roundness: 0.7, grain: 0.16 });
  const path = smoothPath(mound);
  ctx.save();
  ctx.clip(path);
  for (let i = 0; i < 70; i++) {
    const x = r.range(14, 178);
    const y = r.range(40, 92);
    ctx.globalAlpha = r.range(0.4, 0.85) * (y < 70 ? 1 : 0.6);
    ctx.fillStyle = css(vary(y < 66 ? r.pick(fall) : mix(F.soilDark, F.bark, 0.4), r, 0.02, 0.05, 0.05));
    ctx.beginPath();
    ctx.ellipse(x, y, r.range(4, 8), r.range(2, 4), r.range(0, TAU), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return pc;
}

/** A pile of dark crumbly leaf mould. 160×64 for 40×16 wu, base center (80, 60). */
export function paintMould(seed: number): PaintCanvas {
  const pc = makeCanvas(160, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 84, 60, 74, 5, [40, 46, 50], 0.4, 0);
  const pile = blobPoints(80, 46, 66, 18, r, { lumps: 0.16, flatBottom: 0.9 });
  gouache(ctx, pile, { base: mix(F.soilDark, F.deep, 0.25), light: mix(F.soil, F.bark, 0.5), shadow: shade(F.soilDark, 0.4), r, roundness: 0.75, dabDensity: 36, grain: 0.18 });
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = css(r.chance(0.5) ? lighten(F.soilDark, 0.25) : shade(F.soilDark, 0.35), r.range(0.4, 0.8));
    ctx.beginPath();
    ctx.ellipse(r.range(20, 140), r.range(30, 60), r.range(1, 2.6), r.range(0.8, 1.8), 0, 0, TAU);
    ctx.fill();
  }
  return pc;
}

/** Wooden rain barrel. 96×128 for 28×37 wu, base center (48, 122). The water surface is a sprite. */
export function paintBarrel(seed: number): PaintCanvas {
  const pc = makeCanvas(96, 128);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 52, 122, 42, 6, [52, 62, 70], 0.4, 0);
  const body: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    body.push({ x: 48 - 36 - Math.sin(t * Math.PI) * 4, y: 22 + t * 98 });
  }
  for (let i = 16; i >= 0; i--) {
    const t = i / 16;
    body.push({ x: 48 + 36 + Math.sin(t * Math.PI) * 4, y: 22 + t * 98 });
  }
  gouache(ctx, body, { base: WOOD, light: WOOD_LIGHT, shadow: WOOD_DARK, r, roundness: 0.8, grain: 0.14, rimLight: 0.3 });
  ctx.strokeStyle = css(mix(F.stone, F.deep, 0.3), 0.85);
  ctx.lineWidth = 3;
  for (const y of [34, 70, 106]) {
    ctx.beginPath();
    ctx.moveTo(12 - (y === 70 ? 4 : 2), y);
    ctx.quadraticCurveTo(48, y + 6, 84 + (y === 70 ? 4 : 2), y);
    ctx.stroke();
  }
  // rim with a dark inside
  ctx.fillStyle = css(WOOD_DARK);
  ctx.beginPath();
  ctx.ellipse(48, 22, 36, 9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = css(mix(F.deep, F.bark, 0.3));
  ctx.beginPath();
  ctx.ellipse(48, 23, 31, 7, 0, 0, TAU);
  ctx.fill();
  return pc;
}

/** Water strip for the channel (flat, along x). 128×32. */
export function paintChannel(seed: number): PaintCanvas {
  const pc = makeCanvas(128, 32);
  const { ctx } = pc;
  const r = new Rng(seed);
  // banks of turned soil, then water
  ctx.fillStyle = css(mix(F.soil, F.soilDark, 0.4), 0.85);
  ctx.fillRect(0, 2, 128, 28);
  const g = ctx.createLinearGradient(0, 8, 0, 24);
  g.addColorStop(0, css(lighten(F.water, 0.3)));
  g.addColorStop(1, css(F.waterDeep));
  ctx.fillStyle = g;
  ctx.fillRect(0, 9, 128, 14);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = css(lighten(F.water, 0.55), r.range(0.3, 0.6));
    ctx.fillRect(r.range(0, 120), r.range(10, 14), r.range(6, 16), 1.5);
  }
  return pc;
}

/** Soft snow resting on a crown or branch (upright). 128×48, anchor (64, 40). */
export function paintSnowCap(seed: number): PaintCanvas {
  const pc = makeCanvas(128, 48);
  const { ctx } = pc;
  const r = new Rng(seed);
  const pts = blobPoints(64, 30, 56, 14, r, { lumps: 0.18, flatBottom: 0.6 });
  gouache(ctx, pts, { base: hex('#F6F5F0'), light: hex('#FFFFFF'), shadow: hex('#D5DCE0'), r, roundness: 0.6, dabDensity: 10, grain: 0.05, rimShadow: 0.1 });
  return pc;
}

/** A thin snow layer on the ground (flat). 256×160, anchor center. */
export function paintSnowGround(seed: number): PaintCanvas {
  const pc = makeCanvas(256, 160);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 160; i++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next());
    ctx.globalAlpha = (1 - d) * r.range(0.25, 0.55);
    ctx.fillStyle = css(r.chance(0.7) ? hex('#F7F7F2') : hex('#E4E9EC'));
    ctx.beginPath();
    ctx.ellipse(128 + Math.cos(a) * d * 120, 80 + Math.sin(a) * d * 72, r.range(6, 16), r.range(3, 8), 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  applyGrain(ctx, null, 256, 160, 0.05);
  return pc;
}

/** Autumn colours per species (pastel gold and apricot; evergreens keep their green). */
export function autumnPalette(sp: SpeciesPalette, variant: number): SpeciesPalette | null {
  if (sp.name === 'pine') return null;
  // painted in a light neutral cream: the tree tints each clump along the autumn ramp
  // (yellow → orange → red → brown), so one texture serves every stage of the season
  const base = hex(variant ? '#F4E9D6' : '#F7EEDD');
  return {
    ...sp,
    name: `${sp.name}-autumn${variant}`,
    base,
    light: mix(base, hex('#FFFFFF'), 0.6),
    shadow: mix(base, hex('#A89C8E'), 0.45),
    leaf: base,
  };
}

/** Bare twigs for a deciduous crown in winter (upright, drawn over the trunk). 256×256, anchor (128, 140). */
export function paintTwigs(seed: number, bark: RGB): PaintCanvas {
  const pc = makeCanvas(256, 256);
  const { ctx } = pc;
  const r = new Rng(seed);
  ctx.strokeStyle = css(mix(bark, F.deep, 0.15), 0.85);
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + x2) / 2 + r.range(-6, 6), (y + y2) / 2 + r.range(-6, 6), x2, y2);
    ctx.stroke();
    if (depth > 0) {
      const n = r.int(2, 3);
      for (let i = 0; i < n; i++) branch(x2, y2, a + r.range(-0.7, 0.7), len * r.range(0.55, 0.75), w * 0.62, depth - 1);
    }
  };
  for (let i = 0; i < 5; i++) branch(128, 200, -Math.PI / 2 + (i - 2) * 0.42 + r.range(-0.12, 0.12), r.range(46, 62), 3.2, 3);
  return pc;
}

/** A lily pad with a notch (and sometimes a small flower). 64×32, flat on the water. */
export function paintLilyPad(seed: number): PaintCanvas {
  const pc = makeCanvas(64, 32);
  const { ctx } = pc;
  const r = new Rng(seed);
  const base = mix(F.moss, F.sage, 0.35);
  ctx.save();
  ctx.translate(32, 16);
  ctx.scale(1, 0.5);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 26, 0.3, TAU - 0.05);
  ctx.closePath();
  ctx.fillStyle = css(base, 0.95);
  ctx.fill();
  ctx.strokeStyle = css(shade(base, 0.25), 0.6);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  softEllipse(ctx, 26, 13, 12, 4, lighten(base, 0.35), 0.45);
  if (r.chance(0.5)) {
    softEllipse(ctx, 40, 12, 6, 4, mix(F.rose, [255, 255, 255], 0.4), 0.95, 0.4, 0.6);
    softEllipse(ctx, 40, 11, 2.4, 1.8, F.sun, 0.9);
  }
  return pc;
}
