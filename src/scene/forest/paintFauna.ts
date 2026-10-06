/**
 * Small animals of the forest, painted soft and simple like the rest of the art:
 * a rabbit (sitting / mid-hop) and a deer (two walking poses and one with its head up).
 */

import { Rng } from '../../core/rng';
import { gouache, makeCanvas, softEllipse, type PaintCanvas, type Pt } from '../paint/brush';
import { css, mix, shade, type RGB } from '../paint/color';
import { F } from './palette';

const TAU = Math.PI * 2;

function ellipsePts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 18): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return out;
}

/** A rabbit facing right. 64×48, feet at (32, 44). `hop` stretches it mid-jump. */
export function paintRabbit(seed: number, hop: boolean): PaintCanvas {
  const pc = makeCanvas(64, 48);
  const { ctx } = pc;
  const r = new Rng(seed);
  const fur: RGB = [176, 160, 146];
  const light = mix(fur, F.cream, 0.45);
  const dark = shade(fur, 0.3);
  if (!hop) softEllipse(ctx, 31, 44, 18, 3, [50, 58, 64], 0.35);
  const body = hop ? ellipsePts(29, 30, 16, 8, -0.25) : ellipsePts(28, 34, 13, 10, 0);
  gouache(ctx, body, { base: fur, light, shadow: dark, r, roundness: 0.9, dabDensity: 20, grain: 0.12 });
  const hx = hop ? 44 : 39;
  const hy = hop ? 22 : 24;
  gouache(ctx, ellipsePts(hx, hy, 7, 6, 0), { base: fur, light, shadow: dark, r, roundness: 0.9, dabDensity: 14, grain: 0.1 });
  // ears
  for (const [dx, rot] of [[-2, -0.35], [2, -0.12]] as const) gouache(ctx, ellipsePts(hx + dx - 1, hy - 10, 2.2, 7, rot), { base: fur, light, shadow: dark, r, roundness: 0.9, dabDensity: 8, grain: 0.1 });
  softEllipse(ctx, hx - 1.5, hy - 10, 1, 4.5, [226, 182, 176], 0.7);
  // eye, nose, tail, feet
  ctx.fillStyle = css([40, 44, 48], 0.85);
  ctx.beginPath();
  ctx.arc(hx + 2.5, hy - 1, 1.1, 0, TAU);
  ctx.fill();
  softEllipse(ctx, hop ? 14 : 16, hop ? 30 : 33, 4, 4, [250, 248, 242], 0.95);
  if (hop) softEllipse(ctx, 18, 37, 7, 2.2, dark, 0.8);
  else softEllipse(ctx, 34, 43, 6, 2, dark, 0.7);
  return pc;
}

/** A deer facing right. 128×128, hooves at y≈122. pose 0/1: walking, 2: standing with head up. */
export function paintDeer(seed: number, pose: 0 | 1 | 2): PaintCanvas {
  const pc = makeCanvas(128, 128);
  const { ctx } = pc;
  const r = new Rng(seed);
  const coat: RGB = [168, 128, 96];
  const light = mix(coat, F.cream, 0.4);
  const dark = shade(coat, 0.35);
  softEllipse(ctx, 62, 122, 34, 4, [50, 58, 64], 0.3);
  // legs (behind the body), thin and dark at the hooves
  const legs: [number, number][] = pose === 0 ? [[44, -6], [52, 6], [76, 6], [84, -6]] : pose === 1 ? [[44, 6], [52, -6], [76, -6], [84, 6]] : [[46, 0], [52, 0], [78, 0], [84, 0]];
  ctx.lineCap = 'round';
  for (const [x, swing] of legs) {
    ctx.strokeStyle = css(dark, 0.95);
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(x, 84);
    ctx.quadraticCurveTo(x + swing * 0.4, 102, x + swing, 120);
    ctx.stroke();
  }
  gouache(ctx, ellipsePts(64, 76, 28, 13, -0.04), { base: coat, light, shadow: dark, r, roundness: 0.9, dabDensity: 30, grain: 0.14 });
  softEllipse(ctx, 62, 84, 18, 4, mix(coat, F.cream, 0.6), 0.5);
  // neck and head
  const up = pose === 2;
  const nx = up ? 92 : 94;
  const ny = up ? 48 : 58;
  ctx.strokeStyle = css(coat, 1);
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(84, 72);
  ctx.quadraticCurveTo(nx - 2, ny + 12, nx, ny);
  ctx.stroke();
  gouache(ctx, ellipsePts(nx + 6, ny - 2, 10, 6, 0.35), { base: coat, light, shadow: dark, r, roundness: 0.85, dabDensity: 14, grain: 0.12 });
  for (const dx of [-3, 3]) gouache(ctx, ellipsePts(nx + dx - 2, ny - 10, 2.6, 5.5, -0.5 + dx * 0.08), { base: coat, light, shadow: dark, r, roundness: 0.9, dabDensity: 6, grain: 0.1 });
  // small antlers
  ctx.strokeStyle = css(mix(dark, F.cream, 0.3), 0.9);
  ctx.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(nx + s * 1.5, ny - 12);
    ctx.lineTo(nx + s * 5, ny - 22);
    ctx.moveTo(nx + s * 3.5, ny - 18);
    ctx.lineTo(nx + s * 8, ny - 20);
    ctx.stroke();
  }
  ctx.fillStyle = css([36, 40, 44], 0.85);
  ctx.beginPath();
  ctx.arc(nx + 10, ny - 3, 1.3, 0, TAU);
  ctx.fill();
  softEllipse(ctx, 37, 72, 5, 5, [248, 244, 236], 0.9);
  // a few spots
  for (let i = 0; i < 6; i++) softEllipse(ctx, 50 + r.range(0, 26), 70 + r.range(-6, 4), 1.6, 1.2, mix(coat, F.cream, 0.7), 0.8);
  return pc;
}
