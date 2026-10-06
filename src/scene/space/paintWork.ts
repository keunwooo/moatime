/**
 * Planet-colony work artwork: ore deposits, ore chunks, the base battery and chargers, cables and
 * small signs of life. Same gouache language and upper-left light as everything else.
 */

import { Rng } from '../../core/rng';
import { blobPoints, gouache, makeCanvas, softEllipse, taper, curvePts, type PaintCanvas, type Pt } from '../paint/brush';
import { css, lighten, mix, shade, vary, type RGB } from '../paint/color';
import { S } from './palette';

const TAU = Math.PI * 2;

/** Metal: steel-grey nuggets in a rusty rock. */
const ORE = mix(S.metal, S.text, 0.35);
const ORE_DEEP = mix(S.metal, S.space, 0.35);
const RUST = mix(S.dust, [176, 110, 88], 0.45);

/** A metal-vein boulder: rusty rock with steel nuggets. 224×176, anchor (112, 160). ≈ 56 wu wide. */
export function paintOreRock(seed: number, scale = 1): PaintCanvas {
  const pc = makeCanvas(224, 176);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 124, 161, 100 * scale, 13 * scale, [20, 26, 44], 0.5, 0);
  const rx = 74 * scale;
  const ry = 50 * scale;
  const pts = blobPoints(112, 160 - ry * 0.92, rx, ry, r, { lumps: 0.24, wobble: 0.03, flatBottom: 0.7 });
  gouache(ctx, pts, {
    base: vary(RUST, r),
    light: S.sandLight,
    shadow: shade(S.sandShadow, 0.3, [40, 44, 70]),
    r,
    lightStrength: 0.8,
    shadowStrength: 0.75,
    roundness: 0.85,
    dabDensity: 24,
    grain: 0.14,
    rimLight: 0.5,
  });
  // crystal facets breaking through the rock, lit on their upper-left faces
  const n = r.int(4, 6);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.15 + 0.7 * (i / (n - 1))) + r.range(-0.15, 0.15);
    const cx = 112 + Math.cos(a) * rx * r.range(0.25, 0.62);
    const cy = 160 - ry * 0.92 + Math.sin(a) * ry * r.range(0.2, 0.6);
    const h = r.range(14, 26) * scale;
    const w = h * r.range(0.35, 0.5);
    const tilt = r.range(-0.5, 0.5);
    const tip = { x: cx + Math.sin(tilt) * h, y: cy - Math.cos(tilt) * h };
    const left: Pt = { x: cx - w * 0.6, y: cy + 2 };
    const right: Pt = { x: cx + w * 0.6, y: cy + 2 };
    ctx.fillStyle = css(ORE_DEEP);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css(lighten(ORE, 0.25));
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(cx - w * 0.05, cy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css(lighten(S.window, 0.6), 0.85);
    ctx.beginPath();
    ctx.arc(tip.x - w * 0.12, tip.y + h * 0.18, 1.6 * scale, 0, TAU);
    ctx.fill();
  }
  return pc;
}

/** A loose ore chunk. 48×40, anchor (24, 34). ≈ 10 wu. */
export function paintOreChunk(seed: number): PaintCanvas {
  const pc = makeCanvas(48, 40);
  const { ctx } = pc;
  const r = new Rng(seed);
  const pts = blobPoints(24, 24, 15, 10, r, { lumps: 0.22, flatBottom: 0.5, n: 14 });
  gouache(ctx, pts, { base: mix(S.dust, S.lavender, 0.3), light: S.sandLight, shadow: S.sandShadow, r, grain: 0.06, roundness: 0.7, dabDensity: 10 });
  ctx.fillStyle = css(lighten(ORE, 0.2));
  ctx.beginPath();
  ctx.moveTo(16, 24);
  ctx.lineTo(22, 12);
  ctx.lineTo(27, 23);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(ORE_DEEP);
  ctx.beginPath();
  ctx.moveTo(27, 23);
  ctx.lineTo(31, 15);
  ctx.lineTo(34, 24);
  ctx.closePath();
  ctx.fill();
  return pc;
}

/** Dark worked ground of a deposit seen from above (flat). 384×224. */
export function paintOreBed(seed: number): PaintCanvas {
  const W = 384;
  const H = 224;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, W / 2, H / 2, 186, 106, mix(S.sandShadow, S.lavender, 0.3), 0.55, 0);
  for (let i = 0; i < 90; i++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next());
    ctx.globalAlpha = (1 - d) * r.range(0.25, 0.55);
    ctx.fillStyle = css(vary(r.chance(0.3) ? mix(ORE, S.dust, 0.4) : S.dust, r));
    ctx.beginPath();
    ctx.ellipse(W / 2 + Math.cos(a) * d * 160, H / 2 + Math.sin(a) * d * 86, r.range(3, 9), r.range(2, 5), 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return pc;
}

/**
 * Base battery beside the lander: a low rounded cabinet with a row of five indicator cells
 * (lit by the scene). 160×104 for 80×52 wu, base center at (80, 96).
 */
export function paintBattery(seed: number): PaintCanvas {
  const pc = makeCanvas(160, 104);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 86, 97, 76, 7, [14, 18, 34], 0.45, 0);
  const body: Pt[] = [
    { x: 14, y: 96 },
    { x: 14, y: 40 },
    { x: 24, y: 30 },
    { x: 136, y: 30 },
    { x: 146, y: 40 },
    { x: 146, y: 96 },
  ];
  gouache(ctx, body, {
    base: mix(S.hull, S.hullShadow, 0.15),
    light: mix(S.text, [255, 248, 230], 0.4),
    shadow: mix(S.hullShadow, S.lavender, 0.3),
    r,
    roundness: 0.45,
    grain: 0.1,
    rimLight: 0.35,
  });
  // cell windows
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = css(shade(S.hullShadow, 0.45));
    ctx.beginPath();
    ctx.roundRect(30 + i * 21, 50, 14, 26, 3);
    ctx.fill();
  }
  ctx.fillStyle = css(S.apricot, 0.8);
  ctx.fillRect(18, 84, 124, 5);
  // cable socket
  softEllipse(ctx, 146, 70, 5, 5, S.metal, 1, 0.8);
  return pc;
}

/** Charging post at a depot. 64×112 for 32×56 wu, base center at (32, 104). */
export function paintCharger(seed: number): PaintCanvas {
  const pc = makeCanvas(64, 112);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 36, 105, 26, 5, [14, 18, 34], 0.45, 0);
  gouache(ctx, [
    { x: 20, y: 104 },
    { x: 22, y: 30 },
    { x: 42, y: 30 },
    { x: 44, y: 104 },
  ], {
    base: S.hull,
    light: mix(S.text, [255, 248, 230], 0.4),
    shadow: mix(S.hullShadow, S.lavender, 0.3),
    r,
    roundness: 0.4,
    grain: 0.1,
  });
  ctx.fillStyle = css(shade(S.hullShadow, 0.4));
  ctx.beginPath();
  ctx.roundRect(26, 40, 12, 18, 3);
  ctx.fill();
  ctx.fillStyle = css(S.apricot, 0.8);
  ctx.fillRect(22, 70, 22, 4);
  taper(ctx, curvePts(42, 64, 54, 76, 50, 96, 6), 3, 3, S.metal, 1);
  return pc;
}

/** Cable / power line piece seen from above (flat). 64×12. */
export function paintCable(): PaintCanvas {
  const pc = makeCanvas(64, 12);
  const { ctx } = pc;
  ctx.fillStyle = css(shade(S.metal, 0.45), 0.85);
  ctx.fillRect(0, 3, 64, 6);
  ctx.fillStyle = css(mix(S.metal, S.text, 0.25), 0.7);
  ctx.fillRect(0, 4, 64, 2);
  return pc;
}

/** A small potted plant by a habitat door. 48×64 for 16×21 wu, base center (24, 60). */
export function paintPot(seed: number): PaintCanvas {
  const pc = makeCanvas(48, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 26, 60, 18, 3.5, [14, 18, 34], 0.4, 0);
  gouache(ctx, [
    { x: 14, y: 40 },
    { x: 34, y: 40 },
    { x: 31, y: 60 },
    { x: 17, y: 60 },
  ], { base: S.apricot, light: lighten(S.apricot, 0.4), shadow: shade(S.apricot, 0.3), r, roundness: 0.3, grain: 0.06 });
  for (let i = 0; i < 4; i++) {
    gouache(ctx, blobPoints(24 + r.range(-8, 8), 30 - i * 4, r.range(6, 9), r.range(5, 8), r, { lumps: 0.2, n: 14 }), {
      base: vary(S.plant, r),
      light: lighten(S.plant, 0.35),
      shadow: mix(S.plant, S.space, 0.4),
      r,
      grain: 0.04,
      dabDensity: 8,
    });
  }
  return pc;
}

/** A crystal outcrop: pale rose and lilac prisms on a low rock. 224×176, anchor (112, 160). */
export function paintCrystalCluster(seed: number, scale = 1): PaintCanvas {
  const pc = makeCanvas(224, 176);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 120, 162, 92 * scale, 12 * scale, [20, 26, 44], 0.5, 0);
  const base = blobPoints(112, 150, 62 * scale, 16 * scale, r, { lumps: 0.2, flatBottom: 0.8 });
  gouache(ctx, base, { base: mix(S.dust, S.lavender, 0.45), light: S.sandLight, shadow: S.sandShadow, r, roundness: 0.8, dabDensity: 16, grain: 0.12 });
  const rose = mix(S.apricot, [250, 220, 236], 0.6);
  const lilac = mix(S.lavender, [236, 226, 250], 0.55);
  const n = r.int(6, 8);
  const shards: { x: number; h: number; w: number; tilt: number; c: RGB }[] = [];
  for (let i = 0; i < n; i++) {
    const x = 112 + (i / (n - 1) - 0.5) * 100 * scale + r.range(-8, 8);
    const center = 1 - Math.abs(i / (n - 1) - 0.5) * 1.4;
    shards.push({ x, h: (r.range(40, 70) * center + 26) * scale, w: r.range(11, 17) * scale, tilt: r.range(-0.35, 0.35) + (i / (n - 1) - 0.5) * 0.5, c: r.chance(0.5) ? rose : lilac });
  }
  // back shards first
  shards.sort((a, b) => b.h - a.h);
  for (const s of shards) {
    const bx = s.x;
    const by = 152;
    const tip = { x: bx + Math.sin(s.tilt) * s.h, y: by - Math.cos(s.tilt) * s.h };
    const l = { x: bx - s.w / 2, y: by };
    const rr = { x: bx + s.w / 2, y: by };
    const mid = { x: (l.x + tip.x) / 2 + s.w * 0.15, y: (l.y + tip.y) / 2 };
    ctx.fillStyle = css(shade(s.c, 0.18));
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(rr.x, rr.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css(lighten(s.c, 0.3), 0.95);
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(mid.x, mid.y + (by - mid.y) * 0.6);
    ctx.closePath();
    ctx.fill();
    softEllipse(ctx, tip.x - s.w * 0.1, tip.y + s.h * 0.2, 2.4 * scale, 5 * scale, [255, 255, 255], 0.55);
  }
  return pc;
}

/** A rare-mineral seam: a dark rock split by glowing amber veins. 224×176, anchor (112, 160). */
export function paintRareSeam(seed: number, scale = 1): PaintCanvas {
  const pc = makeCanvas(224, 176);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 122, 161, 96 * scale, 13 * scale, [20, 26, 44], 0.5, 0);
  const rx = 70 * scale;
  const ry = 44 * scale;
  const pts = blobPoints(112, 160 - ry * 0.9, rx, ry, r, { lumps: 0.28, wobble: 0.04, flatBottom: 0.7 });
  gouache(ctx, pts, { base: mix(S.horizon, S.ridgeFar, 0.4), light: mix(S.lavender, S.sandLight, 0.3), shadow: S.deep, r, roundness: 0.8, dabDensity: 22, grain: 0.16, rimLight: 0.35 });
  const amber: [number, number, number] = [255, 196, 108];
  for (let i = 0; i < 4; i++) {
    let x = 112 + r.range(-rx * 0.6, rx * 0.6);
    let y = 160 - ry * r.range(1.2, 1.7);
    ctx.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const nx = x + r.range(-9, 9) * scale;
      const ny = y + r.range(6, 12) * scale;
      ctx.strokeStyle = css(amber, 0.35);
      ctx.lineWidth = 6 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.strokeStyle = css(lighten(amber, 0.4), 0.95);
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      x = nx;
      y = ny;
      if (y > 156) break;
    }
  }
  return pc;
}

/**
 * The scout drone: a rounded flying body between two ducted rotors, a lamp under its nose.
 * 128×64 for 48×24 wu, centre (64, 32).
 */
export function paintScout(seed: number): PaintCanvas {
  const pc = makeCanvas(128, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (const sx of [-1, 1]) {
    // ducted rotor: a flat ring seen from the side
    const cx = 64 + sx * 40;
    gouache(ctx, blobPoints(cx, 30, 18, 6, r, { lumps: 0.05, n: 18 }), { base: mix(S.hull, S.hullShadow, 0.3), light: S.text, shadow: S.hullShadow, r, roundness: 0.8, dabDensity: 8, grain: 0.05 });
    ctx.fillStyle = css(mix(S.space, S.lavender, 0.4), 0.55);
    ctx.beginPath();
    ctx.ellipse(cx, 29, 13, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = css(S.metal);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(64 + sx * 16, 32);
    ctx.lineTo(cx - sx * 16, 31);
    ctx.stroke();
  }
  gouache(ctx, blobPoints(64, 30, 22, 13, r, { lumps: 0.08, n: 22 }), { base: S.hull, light: mix(S.text, [255, 248, 230], 0.4), shadow: mix(S.hullShadow, S.lavender, 0.3), r, roundness: 0.95, dabDensity: 14, grain: 0.08, rimLight: 0.35 });
  ctx.fillStyle = css(S.apricot, 0.85);
  ctx.fillRect(46, 30, 36, 3);
  // visor
  ctx.fillStyle = css(mix(S.space, S.teal, 0.35));
  ctx.beginPath();
  ctx.ellipse(74, 25, 8, 4.5, -0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = css(S.text, 0.4);
  ctx.beginPath();
  ctx.ellipse(72, 23.5, 3, 1.4, -0.3, 0, TAU);
  ctx.fill();
  return pc;
}

/** The outpost beacon a scout drops: a short tripod mast with a lamp. 48×96 for 16×32 wu, base (24, 92). */
export function paintBeacon(seed: number): PaintCanvas {
  const pc = makeCanvas(48, 96);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 26, 92, 18, 3.5, [20, 26, 44], 0.45, 0);
  ctx.strokeStyle = css(S.metal);
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  for (const [x0, x1] of [
    [12, 22],
    [36, 26],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0, 92);
    ctx.lineTo(x1, 50);
    ctx.stroke();
  }
  gouache(ctx, [
    { x: 20, y: 52 },
    { x: 21, y: 20 },
    { x: 27, y: 20 },
    { x: 28, y: 52 },
  ], { base: S.hull, light: S.text, shadow: S.hullShadow, r, roundness: 0.3, dabDensity: 6, grain: 0.05 });
  ctx.fillStyle = css(S.apricot, 0.9);
  ctx.fillRect(20, 34, 8, 4);
  ctx.fillStyle = css(lighten(S.window, 0.4));
  ctx.beginPath();
  ctx.arc(24, 15, 5, 0, TAU);
  ctx.fill();
  return pc;
}

/** A small shuttle seen side-on, nose to the right. 160×64 for 60×24 wu, centre (80, 32). */
export function paintShuttle(seed: number): PaintCanvas {
  const pc = makeCanvas(160, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  // swept wing below the body
  gouache(ctx, [
    { x: 58, y: 36 },
    { x: 104, y: 36 },
    { x: 84, y: 50 },
    { x: 44, y: 52 },
  ], { base: mix(S.hull, S.hullShadow, 0.35), light: S.text, shadow: S.hullShadow, r, roundness: 0.3, dabDensity: 8, grain: 0.06 });
  const body: Pt[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (i / 20) * Math.PI;
    body.push({ x: 80 + Math.cos(a) * 52, y: 34 + Math.sin(a) * 14 });
  }
  body.push({ x: 132, y: 38 }, { x: 28, y: 40 });
  gouache(ctx, body, { base: S.hull, light: mix(S.text, [255, 248, 230], 0.4), shadow: mix(S.hullShadow, S.lavender, 0.3), r, roundness: 0.85, dabDensity: 12, grain: 0.08, rimLight: 0.3 });
  ctx.fillStyle = css(S.apricot, 0.85);
  ctx.fillRect(40, 33, 80, 3);
  ctx.fillStyle = css(mix(S.space, S.teal, 0.35));
  ctx.beginPath();
  ctx.ellipse(116, 28, 9, 4, 0.1, 0, TAU);
  ctx.fill();
  for (const x of [62, 76, 90]) {
    ctx.fillStyle = css(lighten(S.window, 0.2), 0.9);
    ctx.beginPath();
    ctx.arc(x, 28, 2.4, 0, TAU);
    ctx.fill();
  }
  // tail fin
  gouache(ctx, [
    { x: 32, y: 30 },
    { x: 26, y: 12 },
    { x: 38, y: 12 },
    { x: 48, y: 28 },
  ], { base: mix(S.hull, S.hullShadow, 0.2), light: S.text, shadow: S.hullShadow, r, roundness: 0.3, dabDensity: 6, grain: 0.05 });
  return pc;
}
