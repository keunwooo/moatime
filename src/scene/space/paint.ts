/**
 * Planet-colony artwork in the same gouache language as the forest: soft outlines, light from
 * the upper left, cool lavender shadows and warm window light.
 */

import { Rng } from '../../core/rng';
import { applyGrain, blobPoints, gouache, makeCanvas, smoothPath, softEllipse, taper, curvePts, type PaintCanvas, type Pt } from '../paint/brush';
import { css, lighten, mix, shade, vary, type RGB } from '../paint/color';
import type { BandPalette, HillPalette, HillShape } from '../paint/landscape';
import { S } from './palette';

const TAU = Math.PI * 2;

export const SKY_STOPS: [number, RGB][] = [
  [0, S.deep],
  [0.38, S.space],
  [0.6, mix(S.space, S.horizon, 0.55)],
  [0.71, S.horizon],
  [0.78, mix(S.horizon, S.lavender, 0.32)],
  [1, mix(S.horizon, S.ridgeFar, 0.5)],
];

export const BAND_NEAR: BandPalette = {
  top: mix(S.sandLight, S.sand, 0.4),
  mid: mix(S.sand, S.dust, 0.45),
  low: mix(S.dust, S.sandShadow, 0.4),
  light: S.sandLight,
  shadow: S.sandShadow,
  tips: [mix(S.sand, S.sandLight, 0.5), S.dust, mix(S.sandShadow, S.dust, 0.5), S.sand],
  accents: [],
};

export const BAND_FAR: BandPalette = {
  top: mix(S.lavender, S.sand, 0.45),
  mid: mix(S.lavender, S.ridge, 0.35),
  low: mix(S.ridge, S.lavender, 0.3),
  light: mix(S.sandLight, S.lavender, 0.4),
  shadow: S.ridgeFar,
  tips: [mix(S.lavender, S.sand, 0.4), S.lavender],
  accents: [],
};

export const HILLS: { pal: HillPalette; shape: HillShape; depth: number; period: number; height: number }[] = [
  {
    pal: { body: S.ridge, top: mix(S.ridge, S.lavender, 0.4), light: mix(S.lavender, S.sandLight, 0.35), shadow: mix(S.ridgeFar, S.space, 0.3), base: mix(S.ridge, S.horizon, 0.4) },
    shape: { spec: [[1, 50], [3, 60], [6, 34], [13, 14], [29, 5]], baseline: 60, peakiness: 1.25 },
    depth: 15000,
    period: 30000,
    height: 2400,
  },
  {
    pal: { body: S.ridgeFar, top: mix(S.ridgeFar, S.lavender, 0.3), light: mix(S.lavender, S.ridge, 0.4), shadow: mix(S.ridgeFar, S.space, 0.4), base: mix(S.ridgeFar, S.horizon, 0.5) },
    shape: { spec: [[1, 80], [2, 70], [5, 40], [11, 14]], baseline: 120, peakiness: 1.5 },
    depth: 24000,
    period: 52000,
    height: 4400,
  },
  {
    pal: { body: mix(S.horizon, S.ridgeFar, 0.4), top: mix(S.horizon, S.lavender, 0.25), light: mix(S.lavender, S.horizon, 0.5), shadow: S.horizon, base: S.horizon },
    shape: { spec: [[1, 120], [2, 50], [4, 40], [9, 12]], baseline: 220, peakiness: 1.7 },
    depth: 34000,
    period: 80000,
    height: 6800,
  },
];

export const RIDGE_STRETCH = 2.9;

/** Distant settlements on the nearest ridge: tiny domes with warm lights. */
export function drawRidgeLights(ctx: CanvasRenderingContext2D, x: number, y: number, r: Rng) {
  const k = 1 / RIDGE_STRETCH;
  const s = r.range(4, 9);
  ctx.fillStyle = css(mix(S.hull, S.lavender, 0.55), 0.85);
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.4, s * 1.2 * k, s * 0.8, 0, Math.PI, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(x, y - s * 0.4, 0, x, y - s * 0.4, s * 1.4);
  g.addColorStop(0, css(S.window, 0.95));
  g.addColorStop(1, css(S.window, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.4, s * 1.4 * k, s * 1.4, 0, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Sky

/** Static star field with a soft milky band. Screen-space, 1024×640. */
export function paintStars(seed: number): PaintCanvas {
  const W = 1024;
  const H = 640;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  // milky band: soft lavender dabs along a gentle diagonal
  for (let i = 0; i < 420; i++) {
    const t = r.next();
    const x = t * W;
    const y = H * (0.18 + 0.32 * t) + r.soft() * 60;
    const rad = r.range(16, 60);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = r.chance(0.5) ? mix(S.lavender, S.teal, 0.4) : mix(S.lavender, S.text, 0.3);
    g.addColorStop(0, css(c, r.range(0.025, 0.06)));
    g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 520; i++) {
    const x = r.next() * W;
    const y = Math.pow(r.next(), 1.25) * H;
    const big = r.chance(0.06);
    const s = big ? r.range(1.4, 2.2) : r.range(0.5, 1.2);
    const c = r.chance(0.2) ? mix(S.text, S.window, 0.5) : r.chance(0.2) ? mix(S.text, S.teal, 0.5) : S.text;
    const a = (1 - y / H) * 0.6 + r.range(0.1, 0.35);
    if (big) softEllipse(ctx, x, y, s * 3.2, s * 3.2, c, a * 0.25, 0);
    ctx.fillStyle = css(c, Math.min(1, a));
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.fill();
  }
  return pc;
}

/** Size of the gas-giant textures: 768×512, the planet's centre at (384, 256), disk radius 150. */
export const GIANT = { W: 768, H: 512, R: 150, tilt: -0.42, ring: [[200, 40], [226, 45], [244, 49], [284, 57]] as [number, number][] } as const;

function ringPath(ctx: CanvasRenderingContext2D, rx: number, ry: number, rx2: number, ry2: number) {
  ctx.beginPath();
  ctx.ellipse(0, 0, rx2, ry2, 0, 0, TAU);
  ctx.ellipse(0, 0, rx, ry, 0, TAU, 0, true);
}

/** Draws one half of the ring (back: the far half behind the planet; front: the near half). */
function paintRingHalf(ctx: CanvasRenderingContext2D, r: Rng, half: 'back' | 'front') {
  const { W, H, tilt, ring } = GIANT;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(tilt);
  ctx.beginPath();
  if (half === 'back') ctx.rect(-W, -H, W * 2, H);
  else ctx.rect(-W, 0, W * 2, H);
  ctx.clip();
  // three ringlets with soft gaps, lit on the sun side (left)
  const bands: [number, number, RGB, number][] = [
    [0, 1, mix(S.ring, S.lavender, 0.25), 0.4],
    [1, 2, S.ring, 0.6],
    [2, 3, mix(S.ring, S.giantBand, 0.3), 0.32],
  ];
  for (const [i0, i1, c, a] of bands) {
    const [ax, ay] = ring[i0];
    const [bx, by] = ring[i1];
    const g = ctx.createLinearGradient(-bx, 0, bx, 0);
    g.addColorStop(0, css(lighten(c, 0.2), a));
    g.addColorStop(0.5, css(c, a * 0.9));
    g.addColorStop(1, css(shade(c, 0.35), a * 0.6));
    ctx.fillStyle = g;
    ringPath(ctx, ax + 3, ay + 1, bx - 3, by - 1);
    ctx.fill('evenodd');
  }
  // fine ring texture
  for (let i = 0; i < 26; i++) {
    const k = r.range(0, 1);
    const rx = ring[0][0] + (ring[3][0] - ring[0][0]) * k;
    const ry = ring[0][1] + (ring[3][1] - ring[0][1]) * k;
    ctx.strokeStyle = css(r.chance(0.5) ? S.text : S.lavender, r.range(0.04, 0.12));
    ctx.lineWidth = r.range(0.6, 1.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** The gas giant: halo, the back half of its ring and the banded disk (no terminator). */
export function paintGiant(seed: number): PaintCanvas {
  const { W, H, R } = GIANT;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const cx = W / 2;
  const cy = H / 2;
  const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.3);
  halo.addColorStop(0, css(mix(S.giant, S.text, 0.3), 0.32));
  halo.addColorStop(1, css(S.giant, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
  paintRingHalf(ctx, r, 'back');
  const disk = new Path2D();
  disk.arc(cx, cy, R, 0, TAU);
  ctx.save();
  ctx.clip(disk);
  const og = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  og.addColorStop(0, css(lighten(S.giant, 0.25)));
  og.addColorStop(0.75, css(S.giant));
  og.addColorStop(1, css(mix(S.giant, S.giantBand, 0.5)));
  ctx.fillStyle = og;
  ctx.fillRect(0, 0, W, H);
  // latitude bands, tilted with the ring
  ctx.translate(cx, cy);
  ctx.rotate(GIANT.tilt);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const y = -R + ((i + r.range(0.2, 0.8)) / n) * R * 2;
    const h = r.range(6, 18);
    const c = r.chance(0.55) ? mix(S.giantBand, S.giant, r.range(0, 0.4)) : mix(S.text, S.giant, 0.5);
    ctx.fillStyle = css(c, r.range(0.35, 0.65));
    ctx.beginPath();
    for (let x = -R; x <= R; x += 6) {
      const yy = y + Math.sin(x * 0.03 + i) * 2.5;
      if (x === -R) ctx.moveTo(x, yy - h / 2);
      else ctx.lineTo(x, yy - h / 2);
    }
    for (let x = R; x >= -R; x -= 6) ctx.lineTo(x, y + h / 2 + Math.sin(x * 0.025 + i * 2) * 2.5);
    ctx.closePath();
    ctx.fill();
  }
  // one soft storm oval
  softEllipse(ctx, R * 0.25, R * 0.32, 22, 10, mix(S.apricot, S.giantBand, 0.3), 0.6, 0);
  ctx.restore();
  return pc;
}

/** Drifting cloud streaks for the gas giant, tileable horizontally. 1024×512, white. */
export function paintGiantStreaks(seed: number): PaintCanvas {
  const W = 1024;
  const H = 512;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 140; i++) {
    const x = r.next() * W;
    // streaks gather along latitudes
    const y = (Math.floor(r.range(1, 9)) / 9 + r.soft() * 0.02) * H;
    const rx = r.range(30, 110);
    const ry = r.range(2.5, 7);
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rx);
      g.addColorStop(0, `rgba(255,255,255,${r.range(0.1, 0.26)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(x + dx, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-(x + dx), -y);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + dx, y, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  return pc;
}

/** The gas giant's night side (over the streaks); the scene turns it to face away from the sun. */
export function paintGiantShade(): PaintCanvas {
  const { W, H, R } = GIANT;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const cx = W / 2;
  const cy = H / 2;
  const disk = new Path2D();
  disk.arc(cx, cy, R, 0, TAU);
  ctx.save();
  ctx.clip(disk);
  const night = ctx.createLinearGradient(cx - R * 0.5, cy - R * 0.6, cx + R * 0.75, cy + R * 0.8);
  night.addColorStop(0, 'rgba(17,15,39,0)');
  night.addColorStop(0.55, 'rgba(17,15,39,0.06)');
  night.addColorStop(0.8, 'rgba(17,15,39,0.58)');
  night.addColorStop(1, 'rgba(17,15,39,0.88)');
  ctx.fillStyle = night;
  ctx.fillRect(0, 0, W, H);
  // (the ring's own shadow is left out: this layer turns with the sun)
  ctx.restore();
  ctx.strokeStyle = css(lighten(S.giant, 0.5), 0.45);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 1.5, Math.PI * 0.85, Math.PI * 1.65);
  ctx.stroke();
  return pc;
}

/** The near half of the ring, in front of the planet. */
export function paintGiantRing(seed: number): PaintCanvas {
  const pc = makeCanvas(GIANT.W, GIANT.H);
  paintRingHalf(pc.ctx, new Rng(seed), 'front');
  return pc;
}

/** The far, small sun: a bright disk with a soft rim. 64×64, centre. */
export function paintPlanetSun(): PaintCanvas {
  const pc = makeCanvas(64, 64);
  const { ctx } = pc;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,250,1)');
  g.addColorStop(0.36, 'rgba(255,252,240,1)');
  g.addColorStop(0.46, 'rgba(255,240,215,0.55)');
  g.addColorStop(0.7, 'rgba(255,226,196,0.12)');
  g.addColorStop(1, 'rgba(255,226,196,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return pc;
}

/** A soft glow band that sits on the horizon (white; tinted by the hour). 8×256. */
export function paintHorizonGlow(): PaintCanvas {
  const pc = makeCanvas(8, 256);
  const g = pc.ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.62)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  pc.ctx.fillStyle = g;
  pc.ctx.fillRect(0, 0, 8, 256);
  return pc;
}

// ---------------------------------------------------------------------------
// Ground details

/** Crater seen from above (flat). 384×256, anchor center. ≈ 140 wu wide. */
export function paintCrater(seed: number): PaintCanvas {
  const W = 384;
  const H = 256;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const cx = W / 2;
  const cy = H / 2;
  // ejecta halo
  softEllipse(ctx, cx, cy, 180, 118, mix(S.sand, S.sandLight, 0.4), 0.35, 0);
  const rim = blobPoints(cx, cy, 140, 90, r, { lumps: 0.08, wobble: 0.02 });
  gouache(ctx, rim, { base: mix(S.sand, S.dust, 0.3), light: S.sandLight, shadow: S.sandShadow, r, grain: 0.12, roundness: 0.6, dabDensity: 30 });
  const bowl = blobPoints(cx + 4, cy + 3, 112, 70, r, { lumps: 0.06 });
  const bp = smoothPath(bowl);
  ctx.save();
  ctx.clip(bp);
  const g = ctx.createLinearGradient(cx - 112, cy - 70, cx + 112, cy + 70);
  // inside: the wall facing the light (lower right) is lit, the upper-left wall is in shadow
  g.addColorStop(0, css(shade(S.sandShadow, 0.25)));
  g.addColorStop(0.45, css(mix(S.dust, S.sandShadow, 0.5)));
  g.addColorStop(1, css(mix(S.sand, S.sandLight, 0.5)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = css(vary(r.chance(0.5) ? S.dust : S.sandShadow, r), r.range(0.06, 0.16));
    ctx.beginPath();
    ctx.ellipse(r.range(40, W - 40), r.range(30, H - 30), r.range(4, 14), r.range(2, 6), 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  applyGrain(ctx, bp, W, H, 0.1);
  return pc;
}

/** Sand-worn rock. 224×160, anchor (112, 146). ≈ 50 wu wide. */
export function paintMoonRock(seed: number, scale = 1): PaintCanvas {
  const pc = makeCanvas(224, 160);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 128, 147, 104 * scale, 12 * scale, [20, 26, 44], 0.45, 0);
  const rx = 80 * scale;
  const ry = 52 * scale;
  const pts = blobPoints(112, 146 - ry * 0.9, rx, ry, r, { lumps: 0.2, wobble: 0.03, flatBottom: 0.7 });
  const base = vary(mix(S.dust, S.lavender, 0.3), r);
  gouache(ctx, pts, {
    base,
    light: S.sandLight,
    shadow: shade(S.sandShadow, 0.3, [40, 44, 70]),
    r,
    lightStrength: 0.85,
    shadowStrength: 0.75,
    roundness: 0.9,
    dabDensity: 26,
    grain: 0.14,
    rimLight: 0.55,
  });
  return pc;
}

/** Tire track segment seen from above (flat). 256×64. */
export function paintTrack(seed: number): PaintCanvas {
  const pc = makeCanvas(256, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (const y of [18, 46]) {
    for (let x = 4; x < 252; x += 9) {
      ctx.fillStyle = css(shade(S.dust, 0.25), r.range(0.25, 0.45));
      ctx.fillRect(x, y - 4, 5, 8);
    }
  }
  return pc;
}

/** Road segment (compacted regolith with marker lights) seen from above (flat). 256×128. */
export function paintRoad(seed: number): PaintCanvas {
  const W = 256;
  const H = 128;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 220; i++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next());
    const x = W / 2 + Math.cos(a) * d * 112;
    const y = H / 2 + Math.sin(a) * d * 46;
    ctx.globalAlpha = (1 - d * d) * r.range(0.25, 0.5);
    ctx.fillStyle = css(vary(mix(S.sandLight, S.sand, 0.4), r));
    ctx.beginPath();
    ctx.ellipse(x, y, r.range(8, 18), r.range(4, 9), 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return pc;
}

// ---------------------------------------------------------------------------
// Facilities. Painted at 2 px per wu, anchored at the base center.

export const FAC_PX = 2;

export interface FacilityArt {
  canvas: PaintCanvas;
  /** Anchor in texture px. */
  ax: number;
  ay: number;
  /** Body extents in wu (relative to base center, y up negative). */
  w: number;
  h: number;
  /** Shell outline kind for ribs and panel reveal. */
  shape: 'dome' | 'box' | 'tower';
  /** Window centers in wu (relative to base center). */
  windows: { x: number; y: number; r: number }[];
  /** Height of the base ring / plinth in wu. */
  baseH: number;
}

export function hullOpts(r: Rng, base: RGB = S.hull) {
  return {
    base,
    light: mix(S.text, [255, 248, 230], 0.4),
    shadow: mix(S.hullShadow, S.lavender, 0.3),
    r,
    lightStrength: 0.65,
    shadowStrength: 0.7,
    roundness: 0.9,
    dabDensity: 22,
    dabSize: 0.1,
    grain: 0.1,
    rimLight: 0.35,
    rimShadow: 0.25,
  };
}

export function windowGlass(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number) {
  ctx.fillStyle = css(shade(S.hullShadow, 0.35));
  ctx.beginPath();
  ctx.arc(x, y, rad + 2.5, 0, TAU);
  ctx.fill();
  const g = ctx.createLinearGradient(x - rad, y - rad, x + rad, y + rad);
  g.addColorStop(0, css(mix(S.space, S.teal, 0.35)));
  g.addColorStop(1, css(S.deep));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  ctx.fillStyle = css(S.text, 0.35);
  ctx.beginPath();
  ctx.ellipse(x - rad * 0.35, y - rad * 0.4, rad * 0.35, rad * 0.18, -0.6, 0, TAU);
  ctx.fill();
}

/** Dish antenna. 128×96 for 64×48 wu, pivot at the bottom center of the feed arm. */
export function paintDish(seed: number): PaintCanvas {
  const pc = makeCanvas(128, 96);
  const { ctx } = pc;
  const r = new Rng(seed);
  const pts: Pt[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * 1.05 + (i / 20) * Math.PI * 0.9;
    pts.push({ x: 64 + Math.cos(a) * 56, y: 50 + Math.sin(a) * 28 });
  }
  pts.push({ x: 64 + 50, y: 54 }, { x: 64, y: 62 }, { x: 64 - 50, y: 54 });
  gouache(ctx, pts, hullOpts(r));
  taper(ctx, curvePts(64, 58, 66, 40, 64, 22, 5), 3, 2, S.metal, 1);
  softEllipse(ctx, 64, 22, 4, 4, S.metal, 1, 0.8);
  taper(ctx, [
    { x: 64, y: 62 },
    { x: 64, y: 92 },
  ], 6, 5, S.metal, 1);
  return pc;
}

/** Rover body (side view, facing right). 160×104 for 80×52 wu. Axle line at y=84. */
/** Small lander for the first settlement's pad. 192×192 for 96×96 wu, base center. */
export function paintLander(seed: number): PaintCanvas {
  const pc = makeCanvas(192, 192);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 100, 186, 90, 8, [14, 18, 34], 0.45, 0);
  for (const s of [-1, 1]) {
    taper(ctx, curvePts(96 + s * 22, 120, 96 + s * 46, 150, 96 + s * 64, 184, 6), 5, 4, S.metal, 1);
    softEllipse(ctx, 96 + s * 66, 184, 12, 3.5, S.metal, 1, 0.7);
  }
  const body: Pt[] = [
    { x: 56, y: 128 },
    { x: 60, y: 70 },
    { x: 78, y: 40 },
    { x: 114, y: 40 },
    { x: 132, y: 70 },
    { x: 136, y: 128 },
  ];
  gouache(ctx, body, hullOpts(r));
  ctx.fillStyle = css(S.apricot, 0.8);
  ctx.fillRect(60, 100, 72, 7);
  windowGlass(ctx, 96, 76, 11);
  return pc;
}

/** Cargo crate. 96×80 for 32×26 wu, base center. */
export function paintCrate(seed: number): PaintCanvas {
  const pc = makeCanvas(96, 80);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 52, 74, 44, 6, [14, 18, 34], 0.45, 0);
  // a crisp little box seen slightly from above: lit top, front face, darker side
  const base = mix(S.apricot, S.hull, 0.45);
  const front = new Path2D();
  front.rect(14, 34, 66, 40);
  const fg = ctx.createLinearGradient(0, 34, 0, 74);
  fg.addColorStop(0, css(lighten(base, 0.12)));
  fg.addColorStop(1, css(mix(base, S.hullShadow, 0.35)));
  ctx.fillStyle = fg;
  ctx.fill(front);
  ctx.fillStyle = css(lighten(base, 0.38));
  ctx.beginPath();
  ctx.moveTo(14, 34);
  ctx.lineTo(22, 24);
  ctx.lineTo(88, 24);
  ctx.lineTo(80, 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(mix(base, S.lavender, 0.45));
  ctx.beginPath();
  ctx.moveTo(80, 34);
  ctx.lineTo(88, 24);
  ctx.lineTo(88, 64);
  ctx.lineTo(80, 74);
  ctx.closePath();
  ctx.fill();
  // straps and a stencilled mark
  ctx.fillStyle = css(shade(S.apricot, 0.35), 0.55);
  ctx.fillRect(28, 34, 5, 40);
  ctx.fillRect(61, 34, 5, 40);
  ctx.fillStyle = css(shade(S.apricot, 0.3), 0.45);
  ctx.fillRect(30, 24.5, 4, 9.5);
  ctx.fillRect(63, 24.5, 4, 9.5);
  ctx.strokeStyle = css(mix(S.hullShadow, S.space, 0.35), 0.55);
  ctx.lineWidth = 1.6;
  ctx.strokeRect(14.8, 34.8, 64.4, 38.4);
  applyGrain(ctx, front, 96, 80, 0.12);
  void r;
  return pc;
}

/** Landing pad seen from above (flat). 512×320. */
export function paintPad(seed: number): PaintCanvas {
  const pc = makeCanvas(512, 320);
  const { ctx } = pc;
  const r = new Rng(seed);
  const pts = blobPoints(256, 160, 230, 140, r, { lumps: 0.02 });
  gouache(ctx, pts, { base: mix(S.sand, S.hull, 0.3), light: S.sandLight, shadow: S.dust, r, grain: 0.1, roundness: 0.4 });
  ctx.strokeStyle = css(S.apricot, 0.75);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(256, 160, 150, 90, 0, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(206, 160);
  ctx.lineTo(306, 160);
  ctx.moveTo(256, 130);
  ctx.lineTo(256, 190);
  ctx.stroke();
  return pc;
}

/**
 * A tube corridor segment seen side-on: a plain cylinder band with straight cut ends so
 * consecutive segments join into one continuous tube. 128×48 for 64×24 wu, centered.
 */
export function paintTube(seed: number): PaintCanvas {
  // a power conduit between buildings: an armoured duct with a lit energy strip and clamps
  const pc = makeCanvas(128, 48);
  const { ctx } = pc;
  const r = new Rng(seed);
  const armor = mix(S.armor, S.lavender, 0.2);
  const g = ctx.createLinearGradient(0, 12, 0, 38);
  g.addColorStop(0, css(mix(armor, S.text, 0.45)));
  g.addColorStop(0.35, css(mix(armor, S.hull, 0.25)));
  g.addColorStop(0.8, css(armor));
  g.addColorStop(1, css(shade(armor, 0.35)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 14, 128, 24);
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = css(vary(armor, r, 0.01, 0.03, 0.05), 0.15);
    ctx.fillRect(r.range(0, 128), r.range(15, 36), r.range(8, 24), r.range(1, 2));
  }
  // the energy strip along its side
  const e = ctx.createLinearGradient(0, 23, 0, 31);
  e.addColorStop(0, css(S.energy, 0));
  e.addColorStop(0.5, css(lighten(S.energy, 0.3), 1));
  e.addColorStop(1, css(S.energy, 0));
  ctx.fillStyle = e;
  ctx.fillRect(0, 23, 128, 8);
  // clamps
  for (const x of [20, 84]) {
    ctx.fillStyle = css(shade(armor, 0.45));
    ctx.fillRect(x, 12, 6, 28);
    ctx.fillStyle = css(S.team, 0.9);
    ctx.fillRect(x + 1, 18, 4, 2);
  }
  return pc;
}
