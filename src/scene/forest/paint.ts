/**
 * Forest artwork, painted procedurally in gouache. Every function returns a canvas whose
 * anchor convention is documented next to it (in texture pixels).
 */

import { Rng } from '../../core/rng';
import {
  applyGrain,
  blobPoints,
  curvePts,
  fray,
  gouache,
  makeCanvas,
  smoothPath,
  softEllipse,
  taper,
  type PaintCanvas,
  type Pt,
} from '../paint/brush';
import { css, hex, lighten, mix, shade, vary, warm, type RGB } from '../paint/color';
import type { BandPalette, HillPalette, HillShape } from '../paint/landscape';
import { F, type SpeciesPalette } from './palette';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Landscape palettes

export const SKY_STOPS: [number, RGB][] = [
  [0, mix(F.skyTop, F.sage, 0.12)],
  [0.38, F.skyMid],
  [0.66, mix(F.skyLow, F.sun, 0.12)],
  [0.73, mix(F.cream, F.sun, 0.18)],
  [0.8, F.mist],
  [1, mix(F.sage, F.mist, 0.5)],
];

export const BAND_NEAR: BandPalette = {
  top: mix(F.sage, F.sun, 0.35),
  mid: mix(F.sage, F.moss, 0.55),
  low: mix(F.moss, F.sage, 0.3),
  light: mix(F.sun, F.cream, 0.3),
  shadow: mix(F.moss, F.deep, 0.4),
  tips: [mix(F.sage, F.sun, 0.45), mix(F.moss, F.deep, 0.3), mix(F.moss, F.sage, 0.2), mix(F.moss, F.deep, 0.18), lighten(F.sage, 0.15)],
  accents: [F.cream, F.apricot, F.butter, lighten(F.lavender, 0.2), F.rose],
};

export const BAND_FAR: BandPalette = {
  top: mix(F.mist, F.sage, 0.5),
  mid: mix(F.sage, F.mist, 0.32),
  low: mix(F.sage, F.hillFar, 0.5),
  light: mix(F.cream, F.sun, 0.2),
  shadow: mix(F.sage, F.hillLav, 0.6),
  tips: [mix(F.sage, F.mist, 0.4), mix(F.sage, F.mist, 0.2), mix(F.sage, F.hillLav, 0.4)],
  accents: [F.cream, mix(F.apricot, F.mist, 0.4)],
};

/** The same ground under snow: white with blue-grey shadows and frosted grass tips. */
export const BAND_SNOW: BandPalette = {
  top: hex('#F3F5F7'),
  mid: hex('#E9EDF2'),
  low: hex('#DEE4EC'),
  light: hex('#FFFFFF'),
  shadow: hex('#C8D1DD'),
  tips: [hex('#F6F8FA'), hex('#E2E8EF'), hex('#D5DDE7'), hex('#EDF1F5'), hex('#FFFFFF')],
  accents: [hex('#FFFFFF'), hex('#EEF2F7')],
};

export const HILLS: { pal: HillPalette; shape: HillShape; depth: number; period: number; height: number }[] = [
  {
    pal: {
      body: mix(F.hillMid, F.hillLav, 0.25),
      top: mix(F.hillMid, F.sage, 0.3),
      light: mix(F.cream, F.sun, 0.3),
      shadow: mix(F.hillLav, F.moss, 0.25),
      base: mix(F.mist, F.hillMid, 0.4),
    },
    shape: { spec: [[1, 60], [2, 70], [5, 34], [11, 12], [23, 4]], baseline: 70 },
    depth: 15000,
    period: 30000,
    height: 2600,
  },
  {
    pal: {
      body: mix(F.hillFar, F.hillLav, 0.45),
      top: mix(F.hillFar, F.hillLav, 0.3),
      light: mix(F.cream, F.sun, 0.25),
      shadow: mix(F.hillLav, F.lavender, 0.3),
      base: mix(F.mist, F.hillFar, 0.35),
    },
    shape: { spec: [[1, 90], [3, 80], [7, 30], [13, 10]], baseline: 140, peakiness: 1.3 },
    depth: 24000,
    period: 52000,
    height: 4600,
  },
  {
    pal: {
      body: mix(F.mist, F.hillLav, 0.42),
      top: mix(F.mist, F.lavender, 0.32),
      light: F.cream,
      shadow: mix(F.hillLav, F.lavender, 0.4),
      base: F.mist,
    },
    shape: { spec: [[1, 110], [2, 60], [4, 46], [9, 14]], baseline: 230, peakiness: 1.5 },
    depth: 34000,
    period: 80000,
    height: 7000,
  },
];

/**
 * Distant tree crowns along the nearest ridge: the forests grown in older zones.
 * The ridge texture is stretched ~2.9× horizontally on screen, so crowns are painted narrow.
 */
export const RIDGE_STRETCH = 2.9;
export function drawRidgeCrown(ctx: CanvasRenderingContext2D, x: number, y: number, r: Rng) {
  const s = r.range(9, 18);
  const k = 1 / RIDGE_STRETCH;
  const col = vary(mix(F.moss, F.hillMid, r.range(0.35, 0.65)), r, 0.01, 0.04, 0.04);
  ctx.fillStyle = css(shade(col, 0.15), 0.9);
  ctx.beginPath();
  ctx.ellipse(x + s * 0.15 * k, y - s * 0.75, s * 0.95 * k, s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = css(col, 0.95);
  ctx.beginPath();
  ctx.ellipse(x - s * 0.08 * k, y - s * 0.85, s * 0.8 * k, s * 0.88, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = css(mix(col, F.sun, 0.3), 0.55);
  ctx.beginPath();
  ctx.ellipse(x - s * 0.35 * k, y - s * 1.15, s * 0.38 * k, s * 0.3, 0, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Tree parts

/**
 * Foliage clump: a small cloud of leaf clusters. Lobes are painted bottom-up; each upper
 * lobe first casts a soft shadow into the lobes beneath it, which gives the crown its
 * crevices. Lit from the upper left. 256×256, anchor (128, 138). Displayed ≈ 100 wu wide.
 */
export function paintClump(seed: number, sp: SpeciesPalette): PaintCanvas {
  const S = 256;
  const pc = makeCanvas(S, S);
  const { ctx } = pc;
  const r = new Rng(seed);
  const cx = 128;
  const cy = 140;
  const R = 70;

  const lobes: { x: number; y: number; rad: number }[] = [];
  // a lower body and a ring of lobes over the top half
  lobes.push({ x: cx + R * 0.05, y: cy + R * 0.22, rad: R * 0.62 });
  const nl = r.int(4, 6);
  for (let i = 0; i < nl; i++) {
    const a = -Math.PI * 0.98 + (i + 0.5) * ((Math.PI * 0.96) / nl) + r.range(-0.15, 0.15);
    const dist = R * r.range(0.4, 0.55);
    lobes.push({ x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist * 0.85, rad: R * r.range(0.36, 0.5) });
  }
  lobes.push({ x: cx - R * 0.52, y: cy + R * 0.28, rad: R * 0.36 });
  lobes.push({ x: cx + R * 0.55, y: cy + R * 0.3, rad: R * 0.34 });
  lobes.sort((a, b) => b.y - a.y);

  lobes.forEach((l, li) => {
    const pts = blobPoints(l.x, l.y, l.rad, l.rad * 0.92, r, { lumps: 0.12, wobble: 0.035 });
    const path = smoothPath(pts);
    // soft shadow cast by this lobe onto what is already painted below it
    if (li > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const sg = ctx.createRadialGradient(l.x + l.rad * 0.25, l.y + l.rad * 0.45, 0, l.x + l.rad * 0.25, l.y + l.rad * 0.45, l.rad * 1.15);
      sg.addColorStop(0, css(shade(sp.shadow, 0.35), 0.45));
      sg.addColorStop(1, css(shade(sp.shadow, 0.35), 0));
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, S, S);
      ctx.restore();
    }
    const up = (cy - l.y) / R;
    const left = (cx - l.x) / R;
    const litness = Math.min(1, Math.max(0, 0.5 + up * 0.55 + left * 0.35));
    const base = vary(mix(mix(sp.base, sp.shadow, 0.15), mix(sp.base, sp.light, 0.5), litness), r, 0.008, 0.05, 0.03);
    ctx.save();
    ctx.fillStyle = css(base);
    ctx.fill(path);
    ctx.clip(path);
    // form light: highlight toward the upper left, cool core shadow lower right
    const g = ctx.createRadialGradient(l.x - l.rad * 0.4, l.y - l.rad * 0.45, l.rad * 0.05, l.x, l.y, l.rad * 1.05);
    g.addColorStop(0, css(mix(sp.light, [255, 250, 222], 0.35), 0.85 * (0.45 + litness * 0.55)));
    g.addColorStop(0.42, css(sp.light, 0.2 * litness));
    g.addColorStop(0.78, css(sp.shadow, 0.18));
    g.addColorStop(1, css(shade(sp.shadow, 0.15), 0.42));
    ctx.fillStyle = g;
    ctx.fillRect(l.x - l.rad * 1.2, l.y - l.rad * 1.2, l.rad * 2.4, l.rad * 2.4);
    // leaf clusters: small pointed strokes whose tone follows the light on this lobe
    const n = Math.round(l.rad * 3.4);
    for (let i = 0; i < n; i++) {
      const a = r.range(0, TAU);
      const d = Math.sqrt(r.next()) * l.rad;
      const x = l.x + Math.cos(a) * d;
      const y = l.y + Math.sin(a) * d * 0.92;
      const t = ((x - l.x) * 0.62 + (y - l.y) * 0.78) / l.rad; // -1 lit .. 1 shadow
      const tone =
        t < -0.25 ? mix(sp.light, [252, 246, 214], r.next() * 0.25) : t > 0.35 ? mix(sp.shadow, sp.base, r.next() * 0.4) : mix(sp.base, sp.light, r.next() * 0.45);
      ctx.globalAlpha = r.range(0.25, 0.55);
      ctx.fillStyle = css(vary(tone, r, 0.012, 0.06, 0.04));
      leafDab(ctx, x, y, r.range(3.5, 7), -0.9 + r.range(-0.7, 0.7), r, 0.7);
    }
    ctx.restore();
    // a few soft leaves breaking the outline on the upper side
    for (let i = 0; i < Math.round(l.rad * 0.32); i++) {
      const a = r.range(-Math.PI * 0.95, -Math.PI * 0.05);
      const x = l.x + Math.cos(a) * l.rad * r.range(0.9, 1.0);
      const y = l.y + Math.sin(a) * l.rad * 0.92 * r.range(0.9, 1.0);
      const lit = Math.max(0, -Math.cos(a + 0.9));
      ctx.globalAlpha = r.range(0.6, 0.9);
      ctx.fillStyle = css(vary(mix(base, sp.light, 0.2 + lit * 0.6), r, 0.01, 0.05, 0.04));
      leafDab(ctx, x, y, r.range(3.2, 5.5), a + r.range(-0.5, 0.5), r, 0.75);
    }
    ctx.globalAlpha = 1;
  });
  applyGrain(ctx, null, S, S, 0.1);
  return pc;
}

function leafDab(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number, r: Rng, round = 0.5) {
  const w = len * r.range(0.42, 0.6) * (0.6 + round * 0.8);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.quadraticCurveTo(0, -w, len, 0);
  ctx.quadraticCurveTo(0, w, -len, 0);
  ctx.fill();
  ctx.restore();
}

/** Single leaf. 64×112, anchor at the stem end (32, 106); points up. Displayed ≈ 14 wu long. */
export function paintLeaf(seed: number, color: RGB, light: RGB, shadow: RGB, broad = 0.5): PaintCanvas {
  const W = 64;
  const H = 112;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const baseY = 104;
  const tipY = 10;
  const w = 15 + broad * 12;
  const bend = r.range(-5, 5);
  const pts: Pt[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = baseY - (baseY - tipY) * t;
    const prof = Math.sin(Math.pow(t, 0.8) * Math.PI) * (1 - 0.15 * t);
    pts.push({ x: 32 + bend * t * t - w * prof, y });
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const y = baseY - (baseY - tipY) * t;
    const prof = Math.sin(Math.pow(t, 0.8) * Math.PI) * (1 - 0.15 * t);
    pts.push({ x: 32 + bend * t * t + w * prof * 0.92, y });
  }
  gouache(ctx, pts, {
    base: color,
    light,
    shadow,
    r,
    lightStrength: 0.55,
    shadowStrength: 0.45,
    dabDensity: 50,
    dabSize: 0.25,
    strokeAngle: -1.4,
    rimLight: 0.3,
    rimShadow: 0.25,
    grain: 0.08,
  });
  // midrib
  ctx.strokeStyle = css(lighten(color, 0.35), 0.55);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(32, baseY + 2);
  ctx.quadraticCurveTo(32 + bend * 0.3, (baseY + tipY) / 2, 32 + bend, tipY + 8);
  ctx.stroke();
  // petiole
  taper(ctx, curvePts(32, H - 1, 32, baseY + 2, 32, baseY - 2, 4), 3, 2, shade(color, 0.2), 0.9);
  return pc;
}

/** Seed lying in soil. 48×32, anchor center bottom (24, 26). ≈ 7 wu. */
export function paintSeed(seed: number): PaintCanvas {
  const pc = makeCanvas(48, 32);
  const r = new Rng(seed);
  gouache(pc.ctx, blobPoints(24, 18, 13, 8.5, r, { lumps: 0.05, rotation: -0.25 }), {
    base: hex2('#9C7A60'),
    light: hex2('#D6B794'),
    shadow: hex2('#5E4A40'),
    r,
    lightStrength: 0.7,
    shadowStrength: 0.6,
    dabDensity: 60,
    grain: 0.06,
  });
  softEllipse(pc.ctx, 19, 14, 4, 2.4, [255, 246, 228], 0.55, 0);
  return pc;
}

/** Winged seed for wind dispersal. 64×64, anchor at the seed (32, 40). ≈ 12 wu. */
export function paintSamara(seed: number): PaintCanvas {
  const pc = makeCanvas(64, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  ctx.save();
  ctx.fillStyle = css(mix(F.cream, F.sun, 0.4), 0.72);
  ctx.beginPath();
  ctx.moveTo(30, 40);
  ctx.bezierCurveTo(14, 26, 18, 6, 34, 4);
  ctx.bezierCurveTo(46, 6, 44, 24, 34, 40);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(mix(F.bark, F.sun, 0.4), 0.5);
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(32, 38);
    ctx.quadraticCurveTo(24 + i * 3, 22, 26 + i * 3.4, 8 + i);
    ctx.stroke();
  }
  ctx.restore();
  gouache(ctx, blobPoints(32, 42, 6, 4.5, r, { lumps: 0.05 }), {
    base: hex2('#9C7A60'),
    light: hex2('#D6B794'),
    shadow: hex2('#5E4A40'),
    r,
    grain: 0.05,
  });
  return pc;
}

/**
 * Bare earth around a seed, seen from above (flat card). Soft edges melt into the meadow;
 * the center is darker and moist. 256×176, anchor center. ≈ 64 wu wide.
 */
export function paintSoil(seed: number): PaintCanvas {
  const W = 256;
  const H = 176;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const cx = W / 2;
  const cy = H / 2;
  // many soft dabs inside an irregular outline give a feathered, hand-painted patch
  const outline = blobPoints(cx, cy, 104, 66, r, { lumps: 0.22, wobble: 0.06 });
  const inside = (x: number, y: number) => {
    const a = Math.atan2(y - cy, x - cx);
    const k = Math.round(((a + Math.PI) / TAU) * outline.length) % outline.length;
    const p = outline[k];
    const rr = Math.hypot(p.x - cx, p.y - cy);
    return Math.hypot(x - cx, y - cy) / rr;
  };
  for (let i = 0; i < 420; i++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next());
    const x = cx + Math.cos(a) * d * 104;
    const y = cy + Math.sin(a) * d * 66;
    const f = inside(x, y);
    if (f > 1) continue;
    const c = vary(f < 0.35 ? mix(F.soilDark, F.soil, 0.4) : mix(F.soil, f > 0.75 ? F.sage : F.apricot, f > 0.75 ? 0.35 : 0.12), r, 0.01, 0.04, 0.04);
    const s = r.range(6, 15) * (1 - f * 0.4);
    ctx.globalAlpha = (1 - Math.pow(f, 2.2)) * r.range(0.35, 0.6);
    ctx.fillStyle = css(c);
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * r.range(0.45, 0.8), r.range(0, TAU), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // crumbs, pebbles and a few blades of the surrounding grass
  for (let i = 0; i < 60; i++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next()) * 0.85;
    const x = cx + Math.cos(a) * d * 100;
    const y = cy + Math.sin(a) * d * 62;
    const s = r.range(0.8, 2.6);
    ctx.fillStyle = css(r.chance(0.55) ? shade(F.soilDark, 0.15) : lighten(F.soil, 0.35), r.range(0.35, 0.75));
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.7, 0, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) {
    const a = r.range(0, TAU);
    const x = cx + Math.cos(a) * r.range(30, 80);
    const y = cy + Math.sin(a) * r.range(18, 48);
    const s = r.range(3.5, 7);
    gouache(ctx, blobPoints(x, y, s, s * 0.72, r, { lumps: 0.1 }), {
      base: mix(F.stone, F.cream, 0.2),
      light: F.stoneLight,
      shadow: shade(F.stone, 0.3),
      r,
      grain: 0.04,
      lightStrength: 0.7,
    });
  }
  return pc;
}

/** A worn bit of garden path seen from above (flat); overlapping patches form the path. */
export function paintPathPatch(seed: number): PaintCanvas {
  const W = 256;
  const H = 160;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const base = mix(F.cream, F.apricot, 0.28);
  for (let i = 0; i < 260; i++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next());
    const x = W / 2 + Math.cos(a) * d * 110;
    const y = H / 2 + Math.sin(a) * d * 62;
    const c = vary(r.chance(0.6) ? base : mix(base, F.soil, 0.35), r, 0.01, 0.04, 0.04);
    ctx.globalAlpha = (1 - d * d) * r.range(0.25, 0.5);
    ctx.fillStyle = css(c);
    ctx.beginPath();
    ctx.ellipse(x, y, r.range(8, 18), r.range(5, 10), r.range(-0.3, 0.3), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 14; i++) {
    softEllipse(ctx, W / 2 + r.range(-80, 80), H / 2 + r.range(-40, 40), r.range(2, 4), r.range(1.5, 3), shade(F.stone, 0.1), 0.6, 0.1);
  }
  return pc;
}

/** Moss patch seen from above (flat). 256×160, anchor center. */
export function paintMoss(seed: number, tone: RGB = F.moss): PaintCanvas {
  const pc = makeCanvas(256, 160);
  const { ctx } = pc;
  const r = new Rng(seed);
  const blobs = r.int(4, 7);
  for (let b = 0; b < blobs; b++) {
    const x = 128 + r.range(-70, 70);
    const y = 80 + r.range(-34, 34);
    const rx = r.range(28, 56);
    const pts = blobPoints(x, y, rx, rx * 0.62, r, { lumps: 0.22, wobble: 0.06 });
    gouache(ctx, pts, {
      base: vary(mix(tone, F.sage, r.range(0.1, 0.5)), r),
      light: mix(F.sage, F.sun, 0.4),
      shadow: mix(tone, F.deep, 0.35),
      r,
      dabDensity: 90,
      dabSize: 0.07,
      grain: 0.12,
      rimLight: 0.25,
    });
    fray(ctx, pts, tone, r, 5, 0.5);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = css(vary(r.chance(0.5) ? mix(F.sage, F.sun, 0.5) : mix(tone, F.deep, 0.2), r), r.range(0.3, 0.7));
    ctx.beginPath();
    ctx.arc(r.range(0, 256), r.range(0, 160), r.range(1, 2.6), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  return pc;
}

/** Grass tuft. 192×128, anchor bottom-center (96, 122). ≈ 46 wu wide. */
export function paintGrass(seed: number, tall = 1): PaintCanvas {
  const pc = makeCanvas(192, 128);
  const { ctx } = pc;
  const r = new Rng(seed);
  const n = r.int(14, 22);
  const blades: { x: number; h: number; lean: number; c: RGB; w: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = r.soft();
    blades.push({
      x: 96 + t * 46,
      h: (r.range(40, 104) * (1 - Math.abs(t) * 0.45)) * tall,
      lean: t * r.range(20, 46) + r.range(-12, 12),
      c: r.pick([F.sage, mix(F.sage, F.sun, 0.35), mix(F.moss, F.sage, 0.3), F.moss, lighten(F.sage, 0.25)]),
      w: r.range(3.5, 7),
    });
  }
  // back blades darker first
  blades.sort((a, b) => a.h - b.h);
  blades.forEach((b, i) => {
    const back = i < n * 0.4;
    const c = back ? mix(b.c, F.deep, 0.22) : b.c;
    // roots at slightly different heights so the tuft has no straight baseline
    const by = 128 - r.range(2, 12);
    const pts = curvePts(b.x, by, b.x + b.lean * 0.15, by - b.h * 0.6, b.x + b.lean, Math.min(by, by - b.h), 12);
    taper(ctx, pts, b.w, 0.4, vary(c, r, 0.01, 0.04, 0.05), 0.95);
    // lit edge
    taper(ctx, pts.map((p) => ({ x: p.x - 0.9, y: p.y })), b.w * 0.35, 0.2, lighten(c, 0.35), 0.35);
  });
  applyGrain(ctx, null, 192, 128, 0.08);
  fadeBottom(ctx, 192, 128, 20);
  return pc;
}

/**
 * Melts the bottom rows of an upright texture into the ground (no hard baseline).
 * 'destination-in' clears everything outside the drawn shape, so the mask covers the
 * whole canvas: opaque above the fade, transparent at the very bottom.
 */
function fadeBottom(ctx: CanvasRenderingContext2D, w: number, h: number, px: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(Math.max(0, 1 - px / h), 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export type FlowerKind = 'daisy' | 'bell' | 'puff' | 'rose';

/** Wildflower with stem. 96×144, anchor bottom-center (48, 140). ≈ 22 wu tall. */
export function paintFlower(seed: number, kind: FlowerKind): PaintCanvas {
  const pc = makeCanvas(96, 144);
  const { ctx } = pc;
  const r = new Rng(seed);
  const heads = kind === 'puff' ? r.int(2, 4) : r.int(1, 3);
  const stems: { x: number; y: number }[] = [];
  for (let i = 0; i < heads; i++) {
    const tx = 48 + r.range(-24, 24);
    const ty = r.range(22, 62);
    stems.push({ x: tx, y: ty });
    taper(ctx, curvePts(48 + r.range(-4, 4), 140, 48 + (tx - 48) * 0.2, (140 + ty) / 2, tx, ty, 10), 3.2, 1.6, mix(F.moss, F.sage, 0.4), 1);
  }
  // leaves at the base
  for (let i = 0; i < 3; i++) {
    const side = i % 2 ? 1 : -1;
    ctx.fillStyle = css(vary(mix(F.sage, F.moss, 0.3), r), 0.95);
    ctx.save();
    ctx.translate(48, 132 - i * 10);
    ctx.rotate(side * r.range(0.6, 1.1));
    ctx.beginPath();
    ctx.ellipse(0, -11, 4, 12, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  for (const s of stems) {
    if (kind === 'daisy') {
      const petals = 9;
      const pr = r.range(8, 11);
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * TAU + r.range(-0.1, 0.1);
        ctx.fillStyle = css(vary(mix(F.cream, [255, 255, 255], 0.3), r, 0.005, 0.02, 0.03), 0.96);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(pr * 0.6, 0, pr * 0.55, pr * 0.22, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      gouache(ctx, blobPoints(s.x, s.y, 4.2, 3.8, r, { lumps: 0.05 }), { base: F.sun, light: F.butter, shadow: F.apricot, r, grain: 0.05 });
    } else if (kind === 'bell') {
      const c = vary(F.lavender, r);
      const pts: Pt[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const a = Math.PI + t * Math.PI;
        pts.push({ x: s.x + Math.cos(a) * 8, y: s.y + 4 + Math.sin(a) * 9 });
      }
      pts.push({ x: s.x + 9, y: s.y + 10 }, { x: s.x + 4, y: s.y + 8 }, { x: s.x, y: s.y + 11 }, { x: s.x - 4, y: s.y + 8 }, { x: s.x - 9, y: s.y + 10 });
      gouache(ctx, pts, { base: c, light: lighten(c, 0.4), shadow: shade(c, 0.3), r, grain: 0.06 });
    } else if (kind === 'puff') {
      for (let i = 0; i < 9; i++) {
        const x = s.x + r.range(-6, 6);
        const y = s.y + r.range(-6, 5);
        gouache(ctx, blobPoints(x, y, 3.2, 3, r, { lumps: 0.05 }), {
          base: vary(F.butter, r),
          light: lighten(F.butter, 0.45),
          shadow: mix(F.sun, F.apricot, 0.6),
          r,
          grain: 0.04,
          rimShadow: 0.1,
        });
      }
    } else {
      const c = vary(F.rose, r);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + r.range(0, 0.4);
        gouache(ctx, blobPoints(s.x + Math.cos(a) * 4.6, s.y + Math.sin(a) * 4.2, 5.4, 4.8, r, { lumps: 0.08 }), {
          base: mix(c, F.apricot, r.range(0, 0.4)),
          light: lighten(c, 0.45),
          shadow: shade(c, 0.25),
          r,
          grain: 0.05,
        });
      }
      softEllipse(ctx, s.x - 1, s.y - 1, 3, 3, F.butter, 0.9, 0.2);
    }
  }
  fadeBottom(ctx, 96, 144, 10);
  return pc;
}

/**
 * Boulder or stone, optionally mossy. 224×160 × res, anchor (0.5, 146/160). ≈ 60 wu wide.
 * Strong form: warm lit top plane, cool shadow side, reflected light, contact shadow.
 */
export function paintRock(seed: number, mossy: boolean, scale = 1, res = 1): PaintCanvas {
  const pc = makeCanvas(224 * res, 160 * res);
  const { ctx } = pc;
  ctx.scale(res, res);
  const r = new Rng(seed);
  softEllipse(ctx, 124, 147, 104 * scale, 13 * scale, [52, 58, 66], 0.42, 0);
  const rx = 84 * scale;
  const ry = 60 * scale;
  const cy = 146 - ry * 0.92;
  const pts = blobPoints(112, cy, rx, ry, r, { lumps: 0.14, wobble: 0.018, flatBottom: 0.7 });
  const base = vary(mix(F.stone, F.lavender, 0.25), r, 0.01, 0.03, 0.03);
  const shadowCol = shade(base, 0.42, [72, 70, 98]);
  const path = gouache(ctx, pts, {
    base,
    light: mix(F.stoneLight, F.sun, 0.3),
    shadow: shadowCol,
    r,
    dabDensity: 30,
    dabSize: 0.13,
    lightStrength: 0.8,
    shadowStrength: 0.8,
    grain: 0.14,
    roundness: 1,
    rimLight: 0.35,
    rimShadow: 0.3,
  });
  ctx.save();
  ctx.clip(path);
  // a lit top plane and a soft reflected light along the bottom edge
  const top = blobPoints(100, cy - ry * 0.45, rx * 0.72, ry * 0.42, r, { lumps: 0.12, rotation: -0.12 });
  ctx.fillStyle = css(mix(F.stoneLight, F.sun, 0.35), 0.4);
  ctx.fill(smoothPath(top));
  const refl = ctx.createLinearGradient(0, 146 - 16 * scale, 0, 146);
  refl.addColorStop(0, css(mix(F.sage, F.stone, 0.5), 0));
  refl.addColorStop(1, css(mix(F.sage, F.stone, 0.5), 0.35));
  ctx.fillStyle = refl;
  ctx.fillRect(0, 0, 224, 160);
  ctx.restore();
  if (mossy) {
    ctx.save();
    ctx.clip(path);
    const mpts = blobPoints(104, cy - ry * 0.62, rx * 0.95, ry * 0.5, r, { lumps: 0.32, wobble: 0.08 });
    gouache(ctx, mpts, {
      base: mix(F.moss, F.sage, 0.4),
      light: mix(F.sage, F.sun, 0.55),
      shadow: mix(F.moss, F.deep, 0.35),
      r,
      dabDensity: 90,
      dabSize: 0.06,
      grain: 0.1,
      lightStrength: 0.6,
      shadowStrength: 0.5,
    });
    // moss creeping down the lit side
    for (let i = 0; i < 5; i++) {
      const x = 112 - rx * r.range(0.25, 0.7);
      const y = cy - ry * r.range(-0.05, 0.2);
      gouache(ctx, blobPoints(x, y, r.range(4, 8), r.range(3, 6), r, { lumps: 0.3, wobble: 0.1 }), {
        base: mix(F.moss, F.sage, 0.5),
        light: mix(F.sage, F.sun, 0.5),
        shadow: mix(F.moss, F.deep, 0.3),
        r,
        grain: 0.06,
      });
    }
    fray(ctx, mpts, F.moss, r, 4, 0.6);
    ctx.restore();
  }
  // a few cracks
  ctx.strokeStyle = css(shade(base, 0.45), 0.25);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const x = 112 + r.range(-rx * 0.4, rx * 0.5);
    const y = 146 - ry * r.range(0.3, 0.9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + r.range(-8, 8), y + 8, x + r.range(-12, 12), y + r.range(12, 22));
    ctx.stroke();
  }
  return pc;
}

/** Fern. 224×176, anchor (112, 170). ≈ 56 wu wide. */
export function paintFern(seed: number): PaintCanvas {
  const pc = makeCanvas(224, 176);
  const { ctx } = pc;
  const r = new Rng(seed);
  const fronds = r.int(5, 8);
  for (let f = 0; f < fronds; f++) {
    const t = f / (fronds - 1) - 0.5;
    const ang = -Math.PI / 2 + t * 2.2 + r.range(-0.12, 0.12);
    const len = r.range(92, 138) * (1 - Math.abs(t) * 0.3);
    const droop = 0.9 + Math.abs(t) * 0.8;
    const pts: Pt[] = [];
    for (let i = 0; i <= 14; i++) {
      const s = i / 14;
      const a = ang + droop * s * s * Math.sign(t || 0.1) * 0.9;
      pts.push({ x: 112 + Math.cos(a) * len * s, y: 170 + Math.sin(a) * len * s });
    }
    const col = vary(f % 2 ? mix(F.moss, F.sage, 0.5) : mix(F.sage, F.sun, 0.25), r);
    taper(ctx, pts, 2.6, 0.6, shade(col, 0.2), 1);
    for (let i = 2; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const dir = Math.atan2(q.y - p.y, q.x - p.x);
      const size = (1 - i / pts.length) * 13 + 3;
      for (const side of [-1, 1]) {
        ctx.fillStyle = css(vary(side < 0 ? lighten(col, 0.12) : col, r, 0.008, 0.03, 0.04), 0.95);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(dir + side * 1.05);
        ctx.beginPath();
        ctx.ellipse(size * 0.5, 0, size * 0.55, size * 0.2, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  applyGrain(ctx, null, 224, 176, 0.08);
  fadeBottom(ctx, 224, 176, 14);
  return pc;
}

/** Mushroom pair. 96×96, anchor (48, 90). ≈ 14 wu. */
export function paintMushrooms(seed: number): PaintCanvas {
  const pc = makeCanvas(96, 96);
  const { ctx } = pc;
  const r = new Rng(seed);
  const n = r.int(1, 3);
  for (let i = 0; i < n; i++) {
    const x = 48 + (i - (n - 1) / 2) * 22 + r.range(-4, 4);
    const h = r.range(26, 46) * (i === 0 ? 1 : 0.75);
    const capW = r.range(14, 22) * (i === 0 ? 1 : 0.8);
    taper(ctx, curvePts(x, 90, x + r.range(-3, 3), 90 - h * 0.5, x + r.range(-4, 4), 90 - h, 6), 8, 6, F.cream, 1);
    const cy = 90 - h;
    const cap = r.chance(0.5) ? F.apricot : F.rose;
    const pts: Pt[] = [];
    for (let k = 0; k <= 18; k++) {
      const a = Math.PI + (k / 18) * Math.PI;
      pts.push({ x: x + Math.cos(a) * capW, y: cy + Math.sin(a) * capW * 0.72 });
    }
    pts.push({ x: x + capW * 0.9, y: cy + 4 }, { x: x - capW * 0.9, y: cy + 4 });
    gouache(ctx, pts, { base: cap, light: lighten(cap, 0.45), shadow: shade(cap, 0.3), r, grain: 0.06, rimLight: 0.3 });
    for (let d = 0; d < 4; d++) {
      softEllipse(ctx, x + r.range(-capW * 0.6, capW * 0.5), cy - r.range(2, capW * 0.55), 2.2, 1.8, F.cream, 0.9, 0.3);
    }
  }
  return pc;
}

/** Stepping stone seen from above (flat). 128×96, anchor center. ≈ 30 wu. */
export function paintStepStone(seed: number): PaintCanvas {
  const pc = makeCanvas(128, 96);
  const r = new Rng(seed);
  softEllipse(pc.ctx, 70, 54, 58, 38, [70, 70, 70], 0.3, 0);
  const pts = blobPoints(64, 48, 50, 34, r, { lumps: 0.12 });
  gouache(pc.ctx, pts, {
    base: mix(F.cream, F.stone, 0.45),
    light: lighten(F.cream, 0.3),
    shadow: mix(F.stone, F.lavender, 0.4),
    r,
    dabDensity: 40,
    grain: 0.16,
    roundness: 0.8,
  });
  return pc;
}

/** Fallen leaves seen from above (flat). 256×160, anchor center. ≈ 90 wu wide. */
export function paintLitter(seed: number, colors: RGB[]): PaintCanvas {
  const pc = makeCanvas(256, 160);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 46; i++) {
    const a = r.range(0, TAU);
    const d = Math.pow(r.next(), 0.7);
    const x = 128 + Math.cos(a) * d * 110;
    const y = 80 + Math.sin(a) * d * 64;
    ctx.globalAlpha = (1 - d * 0.6) * r.range(0.6, 0.95);
    ctx.fillStyle = css(vary(r.pick(colors), r, 0.02, 0.06, 0.05));
    leafDab(ctx, x, y, r.range(5, 9), r.range(0, TAU), r);
  }
  ctx.globalAlpha = 1;
  return pc;
}

/** Spring pool seen from above (flat). 640×400, anchor center. ≈ 260 wu wide. */
export function paintPond(seed: number): PaintCanvas {
  const pc = makeCanvas(640, 400);
  const { ctx } = pc;
  const r = new Rng(seed);
  const outer = blobPoints(320, 200, 300, 180, r, { lumps: 0.1, wobble: 0.02 });
  gouache(ctx, outer, {
    base: mix(F.moss, F.sage, 0.5),
    light: mix(F.sage, F.sun, 0.4),
    shadow: mix(F.moss, F.deep, 0.3),
    r,
    dabDensity: 30,
    dabSize: 0.04,
    grain: 0.14,
  });
  fray(ctx, outer, F.sage, r, 10, 0.5);
  const water = blobPoints(316, 196, 252, 146, r, { lumps: 0.08, wobble: 0.015 });
  const wpath = smoothPath(water);
  ctx.save();
  ctx.clip(wpath);
  const g = ctx.createRadialGradient(290, 170, 10, 320, 200, 280);
  g.addColorStop(0, css(lighten(F.water, 0.35)));
  g.addColorStop(0.55, css(F.water));
  g.addColorStop(1, css(F.waterDeep));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 400);
  // sky reflection and soft ripples
  softEllipse(ctx, 250, 140, 130, 40, F.cream, 0.55, 0);
  ctx.strokeStyle = css(lighten(F.water, 0.5), 0.35);
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const y = 110 + i * 22 + r.range(-4, 4);
    ctx.beginPath();
    ctx.moveTo(r.range(100, 200), y);
    ctx.quadraticCurveTo(320, y + r.range(-6, 6), r.range(430, 540), y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = css(shade(F.waterDeep, 0.35), 0.35);
  ctx.lineWidth = 7;
  ctx.stroke(wpath);
  // lily pads
  for (let i = 0; i < 4; i++) {
    const x = r.range(200, 470);
    const y = r.range(150, 270);
    const s = r.range(16, 26);
    ctx.fillStyle = css(vary(mix(F.sage, F.moss, 0.4), r), 0.95);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, s, 0.3, TAU - 0.15);
    ctx.closePath();
    ctx.fill();
    if (r.chance(0.5)) softEllipse(ctx, x + 4, y - 3, 5, 4, F.rose, 0.95, 0.4);
  }
  return pc;
}

/** Reeds by the water. 128×224, anchor (64, 218). ≈ 40 wu tall. */
export function paintReeds(seed: number): PaintCanvas {
  const pc = makeCanvas(128, 224);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 9; i++) {
    const x = 64 + r.range(-34, 34);
    const h = r.range(110, 210);
    const lean = r.range(-18, 18);
    const col = vary(mix(F.sage, F.moss, r.range(0, 0.5)), r);
    taper(ctx, curvePts(x, 218, x + lean * 0.2, 218 - h * 0.5, x + lean, 218 - h, 12), 5, 0.6, col, 1);
    if (r.chance(0.45)) {
      const tx = x + lean * 0.86;
      const ty = 218 - h * 0.86;
      ctx.fillStyle = css(mix(F.bark, F.apricot, 0.3), 0.95);
      ctx.beginPath();
      ctx.ellipse(tx, ty, 4.2, 13, Math.atan2(lean, h) * 0.9, 0, TAU);
      ctx.fill();
    }
  }
  fadeBottom(ctx, 128, 224, 16);
  return pc;
}

/** Distant tree silhouette for far zones (LOD). 128×192, anchor (64, 186). ≈ 260 wu tall. */
export function paintDistantTree(seed: number, sp: SpeciesPalette): PaintCanvas {
  const pc = makeCanvas(128, 192);
  const { ctx } = pc;
  const r = new Rng(seed);
  taper(ctx, curvePts(64, 188, 63, 150, 64 + r.range(-4, 4), 100, 6), 10, 5, mix(sp.bark, F.hillMid, 0.3), 1);
  const tall = sp.name === 'tall' || sp.name === 'pine';
  const cy = tall ? 78 : 84;
  const rx = tall ? 34 : 50;
  const ry = tall ? 70 : 54;
  const base = mix(sp.base, F.hillMid, 0.25);
  gouache(ctx, blobPoints(64, cy, rx, ry, r, { lumps: 0.16 }), {
    base,
    light: mix(sp.light, F.cream, 0.2),
    shadow: mix(sp.shadow, F.hillLav, 0.25),
    r,
    dabDensity: 20,
    grain: 0.08,
    lightStrength: 0.45,
  });
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI + i * 0.8 + r.range(0, 0.4);
    gouache(ctx, blobPoints(64 + Math.cos(a) * rx * 0.55, cy + Math.sin(a) * ry * 0.5, rx * 0.5, ry * 0.42, r, { lumps: 0.12 }), {
      base: mix(base, sp.light, 0.2),
      light: sp.light,
      shadow: sp.shadow,
      r,
      dabDensity: 18,
      grain: 0.06,
    });
  }
  return pc;
}

/** Old mossy stump (mossy-flavor feature). 256×192, anchor (128, 180). ≈ 90 wu wide. */
export function paintStump(seed: number): PaintCanvas {
  const pc = makeCanvas(256, 192);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 136, 180, 120, 16, [60, 60, 60], 0.3, 0);
  const pts: Pt[] = [
    { x: 40, y: 182 },
    { x: 62, y: 160 },
    { x: 70, y: 90 },
    { x: 76, y: 66 },
    { x: 128, y: 56 },
    { x: 182, y: 64 },
    { x: 188, y: 92 },
    { x: 194, y: 160 },
    { x: 222, y: 184 },
  ];
  gouache(ctx, pts, { base: F.bark, light: F.barkLight, shadow: F.barkDark, r, dabDensity: 50, dabSize: 0.06, strokeAngle: -1.5, grain: 0.18 });
  gouache(ctx, blobPoints(128, 66, 54, 13, r, { lumps: 0.06 }), {
    base: mix(F.barkLight, F.apricot, 0.3),
    light: F.cream,
    shadow: F.bark,
    r,
    grain: 0.1,
  });
  ctx.strokeStyle = css(F.bark, 0.5);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(128, 66, 12 * i, 3 * i, 0, 0, TAU);
    ctx.stroke();
  }
  const moss = blobPoints(110, 150, 80, 34, r, { lumps: 0.3 });
  gouache(ctx, moss, { base: mix(F.moss, F.sage, 0.4), light: mix(F.sage, F.sun, 0.4), shadow: mix(F.moss, F.deep, 0.3), r, dabDensity: 80, dabSize: 0.07 });
  fray(ctx, moss, F.moss, r, 5, 0.6);
  return pc;
}

function hex2(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const LEAF_FALL_COLORS: RGB[] = [F.apricot, mix(F.apricot, F.sun, 0.5), F.sun, mix(F.sage, F.sun, 0.5), warm(F.sage, 0.3)];
