/**
 * Artwork for the planet's sky and its rare sights: aurora curtains, a comet, a big ship, a far
 * fleet of strange craft, a colony ship, a satellite rocket, the gas giant's small moon, nebula
 * clouds, wind-blown dust and a band of storm cloud. White textures are tinted in the scene.
 */

import { Rng } from '../../core/rng';
import { blobPoints, gouache, makeCanvas, softEllipse, type PaintCanvas, type Pt } from '../paint/brush';
import { css, lighten, mix, shade } from '../paint/color';
import { S } from './palette';

const TAU = Math.PI * 2;

/** Aurora curtain, white: soft vertical rays fading at the top and bottom. 512×256, tileable in x. */
export function paintAurora(seed: number): PaintCanvas {
  const W = 512;
  const H = 256;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 90; i++) {
    const x = r.next() * W;
    const w = r.range(3, 14);
    const top = r.range(10, 70);
    const bot = r.range(170, 240);
    for (const dx of [-W, 0, W]) {
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, `rgba(255,255,255,${r.range(0.08, 0.2)})`);
      g.addColorStop(0.85, `rgba(255,255,255,${r.range(0.15, 0.32)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - w / 2, top, w, bot - top);
    }
  }
  return pc;
}

/** Comet: a bright head on the right, a long soft tail to the left. 512×64. */
export function paintComet(): PaintCanvas {
  const pc = makeCanvas(512, 64);
  const { ctx } = pc;
  const tail = ctx.createLinearGradient(0, 0, 480, 0);
  tail.addColorStop(0, 'rgba(200,236,255,0)');
  tail.addColorStop(0.7, 'rgba(210,240,255,0.18)');
  tail.addColorStop(1, 'rgba(240,250,255,0.55)');
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.moveTo(0, 26);
  ctx.quadraticCurveTo(300, 22, 482, 28);
  ctx.lineTo(482, 36);
  ctx.quadraticCurveTo(300, 44, 0, 40);
  ctx.closePath();
  ctx.fill();
  const head = ctx.createRadialGradient(484, 32, 0, 484, 32, 22);
  head.addColorStop(0, 'rgba(255,255,255,1)');
  head.addColorStop(0.3, 'rgba(230,248,255,0.8)');
  head.addColorStop(1, 'rgba(200,236,255,0)');
  ctx.fillStyle = head;
  ctx.fillRect(460, 8, 52, 48);
  return pc;
}

/** A big ship side-on, nose right: a long pale hull with a row of lights. 640×128. */
export function paintBigShip(seed: number): PaintCanvas {
  const pc = makeCanvas(640, 128);
  const { ctx } = pc;
  const r = new Rng(seed);
  const hullC = mix(S.hull, S.lavender, 0.35);
  const body: Pt[] = [
    { x: 30, y: 58 },
    { x: 70, y: 40 },
    { x: 520, y: 36 },
    { x: 610, y: 60 },
    { x: 520, y: 84 },
    { x: 70, y: 82 },
  ];
  gouache(ctx, body, { base: hullC, light: lighten(hullC, 0.3), shadow: shade(hullC, 0.35), r, roundness: 0.5, dabDensity: 24, grain: 0.08 });
  // ribs and a dorsal fin
  ctx.strokeStyle = css(shade(hullC, 0.3), 0.7);
  ctx.lineWidth = 2;
  for (let x = 110; x < 500; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x - 6, 82);
    ctx.stroke();
  }
  gouache(ctx, [
    { x: 160, y: 40 },
    { x: 220, y: 14 },
    { x: 300, y: 14 },
    { x: 330, y: 38 },
  ], { base: shade(hullC, 0.15), light: hullC, shadow: shade(hullC, 0.4), r, roundness: 0.3, dabDensity: 8 });
  for (let x = 90; x < 520; x += 14) {
    ctx.fillStyle = css(lighten(S.window, 0.2), r.chance(0.8) ? 0.9 : 0.3);
    ctx.fillRect(x, 58, 6, 4);
  }
  // engines
  for (const y of [50, 70]) {
    const g = ctx.createRadialGradient(30, y, 0, 30, y, 24);
    g.addColorStop(0, 'rgba(255,230,200,0.9)');
    g.addColorStop(1, 'rgba(255,170,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(4, y - 24, 50, 48);
  }
  return pc;
}

/** A craft of the far fleet: a pale violet wedge with teal running lights. 96×48. */
export function paintFleetCraft(seed: number): PaintCanvas {
  const pc = makeCanvas(96, 48);
  const { ctx } = pc;
  const r = new Rng(seed);
  const c = mix(S.lavender, S.space, 0.35);
  gouache(ctx, [
    { x: 8, y: 26 },
    { x: 40, y: 12 },
    { x: 90, y: 24 },
    { x: 40, y: 36 },
  ], { base: c, light: lighten(c, 0.3), shadow: shade(c, 0.4), r, roundness: 0.2, dabDensity: 10, grain: 0.06 });
  for (const [x, y] of [
    [40, 14],
    [40, 34],
    [86, 24],
  ]) {
    softEllipse(ctx, x, y, 4, 4, mix(S.teal, S.text, 0.3), 0.95, 0);
  }
  return pc;
}

/** A colony ship: a squat cargo lander with legs and two engine bells. 192×192, base (96, 184). */
export function paintColonyShip(seed: number): PaintCanvas {
  const pc = makeCanvas(192, 192);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 98, 184, 80, 8, [20, 26, 44], 0.45, 0);
  ctx.strokeStyle = css(S.metal);
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  for (const [x0, x1] of [
    [56, 26],
    [136, 166],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0, 130);
    ctx.lineTo(x1, 182);
    ctx.stroke();
  }
  const body = blobPoints(96, 92, 62, 50, r, { lumps: 0.04, n: 28, flatBottom: 0.6 });
  gouache(ctx, body, { base: S.hull, light: mix(S.text, [255, 248, 230], 0.4), shadow: mix(S.hullShadow, S.lavender, 0.3), r, roundness: 0.9, dabDensity: 24, grain: 0.08, rimLight: 0.3 });
  ctx.fillStyle = css(S.apricot, 0.85);
  ctx.fillRect(36, 96, 120, 6);
  for (const x of [66, 96, 126]) {
    ctx.fillStyle = css(mix(S.space, S.teal, 0.35));
    ctx.beginPath();
    ctx.arc(x, 78, 7, 0, TAU);
    ctx.fill();
  }
  for (const x of [74, 118]) {
    gouache(ctx, [
      { x: x - 12, y: 132 },
      { x: x - 16, y: 150 },
      { x: x + 16, y: 150 },
      { x: x + 12, y: 132 },
    ], { base: S.metal, light: lighten(S.metal, 0.3), shadow: shade(S.metal, 0.3), r, roundness: 0.3, dabDensity: 6 });
  }
  return pc;
}

/** A small satellite rocket, upright. 48×128, base (24, 124). */
export function paintRocket(seed: number): PaintCanvas {
  const pc = makeCanvas(48, 128);
  const { ctx } = pc;
  const r = new Rng(seed);
  const body: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    body.push({ x: 24 + Math.cos(a) * 10, y: 30 + Math.sin(a) * 26 });
  }
  body.push({ x: 34, y: 112 }, { x: 14, y: 112 });
  gouache(ctx, body, { base: S.hull, light: S.text, shadow: S.hullShadow, r, roundness: 0.8, dabDensity: 10, grain: 0.06 });
  ctx.fillStyle = css(S.apricot, 0.9);
  ctx.fillRect(14, 70, 20, 5);
  for (const sx of [-1, 1]) {
    gouache(ctx, [
      { x: 24 + sx * 10, y: 92 },
      { x: 24 + sx * 20, y: 118 },
      { x: 24 + sx * 10, y: 112 },
    ], { base: mix(S.panel, S.lavender, 0.3), light: S.panelLight, shadow: S.panel, r, roundness: 0.2, dabDensity: 4 });
  }
  return pc;
}

/** The gas giant's small moon. 64×64, centre. */
export function paintMoonlet(seed: number): PaintCanvas {
  const pc = makeCanvas(64, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  const c = mix(S.lavender, S.text, 0.35);
  const g = ctx.createRadialGradient(24, 24, 2, 32, 32, 26);
  g.addColorStop(0, css(lighten(c, 0.3)));
  g.addColorStop(0.75, css(c));
  g.addColorStop(1, css(shade(c, 0.35)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 5; i++) softEllipse(ctx, 22 + r.range(0, 22), 22 + r.range(0, 22), r.range(2, 5), r.range(2, 4), shade(c, 0.25), 0.5, 0);
  return pc;
}

/** A soft nebula cloud, white. 512×512. */
export function paintNebula(seed: number): PaintCanvas {
  const pc = makeCanvas(512, 512);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 70; i++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next()) * 170;
    const x = 256 + Math.cos(a) * d * 1.3;
    const y = 256 + Math.sin(a) * d * 0.7;
    const rad = r.range(40, 120);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,255,${r.range(0.04, 0.1)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return pc;
}

/** Wind-blown dust: thin slanted streaks, white, tileable. 256×256. */
export function paintDustStreaks(seed: number): PaintCanvas {
  const W = 256;
  const pc = makeCanvas(W, W);
  const { ctx } = pc;
  const r = new Rng(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = r.next() * W;
    const y = r.next() * W;
    const len = r.range(8, 26);
    ctx.strokeStyle = `rgba(255,255,255,${r.range(0.15, 0.45)})`;
    ctx.lineWidth = r.range(0.6, 1.6);
    for (const dx of [-W, 0, W]) {
      for (const dy of [-W, 0, W]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + len, y + dy + len * 0.28);
        ctx.stroke();
      }
    }
  }
  return pc;
}

/** A band of storm cloud on the horizon, white (tinted dark). 512×128, tileable in x. */
export function paintStormBand(seed: number): PaintCanvas {
  const W = 512;
  const H = 128;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 60; i++) {
    const x = r.next() * W;
    const y = r.range(50, 100);
    const rx = r.range(30, 80);
    const ry = rx * r.range(0.35, 0.6);
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rx);
      g.addColorStop(0, `rgba(255,255,255,${r.range(0.25, 0.5)})`);
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
