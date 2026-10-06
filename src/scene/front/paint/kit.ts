/**
 * A small painting kit for the front's miniatures: painted plate (flat faces with a soft light
 * from the upper left and a thin ink line), round growth (gouache blobs) and glazed crystal. Every
 * building, unit and ship of the three peoples is drawn with these, so brushwork, outline weight
 * and light stay the same across them.
 *
 * Coordinates are canvas px; art is painted at PX px per art unit and drawn back at 1/PX.
 */

import { Rng } from '../../../core/rng';
import { applyGrain, blobPoints, gouache, makeCanvas, softEllipse, type PaintCanvas, type Pt } from '../../paint/brush';
import { css, lighten, mix, shade, type RGB } from '../../paint/color';

/** Canvas px per art unit (art is drawn back at 1/PX of its canvas size). */
export const PX = 2;

/** A painted piece and its anchor (the ground contact point, canvas px). */
export interface Art {
  pc: PaintCanvas;
  ax: number;
  ay: number;
}

export interface Pen {
  ctx: CanvasRenderingContext2D;
  /** Art units → canvas px. */
  u: (v: number) => number;
  /** A point in art units relative to the anchor. */
  p: (x: number, y: number) => Pt;
  r: Rng;
  ink: RGB;
}

/**
 * Paints a piece of art: w × h art units with the anchor at (ax, ay) art units from the top left.
 * `draw` uses the pen; coordinates are relative to the anchor (y up is negative).
 */
export function paint(w: number, h: number, ax: number, ay: number, seed: number, ink: RGB, draw: (pen: Pen) => void): Art {
  const pc = makeCanvas(w * PX, h * PX);
  const ctx = pc.ctx;
  const ox = ax * PX;
  const oy = ay * PX;
  const pen: Pen = {
    ctx,
    u: (v) => v * PX,
    p: (x, y) => ({ x: ox + x * PX, y: oy + y * PX }),
    r: new Rng(seed >>> 0 || 1),
    ink,
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(pen);
  applyGrain(ctx, null, pc.w, pc.h, 0.16);
  return { pc, ax: ox, ay: oy };
}

/** A flat face: base colour, light from the upper left, an ink outline. */
export function plate(pen: Pen, pts: [number, number][], base: RGB, o: { light?: number; dark?: number; line?: number; alpha?: number } = {}) {
  const { ctx } = pen;
  const P = pts.map(([x, y]) => pen.p(x, y));
  const path = new Path2D();
  path.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < P.length; i++) path.lineTo(P[i].x, P[i].y);
  path.closePath();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of P) {
    minX = Math.min(minX, q.x);
    minY = Math.min(minY, q.y);
    maxX = Math.max(maxX, q.x);
    maxY = Math.max(maxY, q.y);
  }
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = css(base);
  ctx.fill(path);
  ctx.clip(path);
  const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
  g.addColorStop(0, css(lighten(base, 0.3), o.light ?? 0.55));
  g.addColorStop(0.5, css(base, 0));
  g.addColorStop(1, css(shade(base, 0.45), o.dark ?? 0.45));
  ctx.fillStyle = g;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  // a few dry-brush strokes across the face
  ctx.globalAlpha = (o.alpha ?? 1) * 0.12;
  ctx.strokeStyle = css(lighten(base, 0.4));
  ctx.lineWidth = pen.u(0.5);
  for (let i = 0; i < 4; i++) {
    const y = minY + pen.r.range(0.15, 0.85) * (maxY - minY);
    ctx.beginPath();
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y + pen.r.range(-2, 2));
    ctx.stroke();
  }
  ctx.restore();
  if ((o.line ?? 1) > 0) {
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.strokeStyle = css(pen.ink, 0.85);
    ctx.lineWidth = pen.u(0.55 * (o.line ?? 1));
    ctx.stroke(path);
    ctx.restore();
  }
}

/** A box seen from high in front: front face, top face, side face. */
export function block(pen: Pen, x: number, y: number, w: number, h: number, depth: number, base: RGB, o: { side?: number } = {}) {
  const d = depth;
  const s = o.side ?? 0.55;
  // top
  plate(pen, [
    [x, y - h],
    [x + d * s, y - h - d * 0.55],
    [x + w + d * s, y - h - d * 0.55],
    [x + w, y - h],
  ], lighten(base, 0.18));
  // side
  plate(pen, [
    [x + w, y - h],
    [x + w + d * s, y - h - d * 0.55],
    [x + w + d * s, y - d * 0.55],
    [x + w, y],
  ], shade(base, 0.28));
  // front
  plate(pen, [
    [x, y - h],
    [x + w, y - h],
    [x + w, y],
    [x, y],
  ], base);
}

/** A rounded growth (gouache blob). */
export function blob(pen: Pen, cx: number, cy: number, rx: number, ry: number, base: RGB, o: { lumps?: number; flat?: number; line?: number; light?: RGB } = {}) {
  const c = pen.p(cx, cy);
  const pts = blobPoints(c.x, c.y, pen.u(rx), pen.u(ry), pen.r, { lumps: o.lumps ?? 0.1, flatBottom: o.flat ?? 0, wobble: 0.02 });
  gouache(pen.ctx, pts, { base, light: o.light, r: pen.r, dabDensity: 10, roundness: 0.85, grain: 0.25, rimShadow: 0.25 });
  if ((o.line ?? 1) > 0) {
    const ctx = pen.ctx;
    ctx.save();
    ctx.strokeStyle = css(pen.ink, 0.7);
    ctx.lineWidth = pen.u(0.5 * (o.line ?? 1));
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, pen.u(rx) * 0.99, pen.u(ry) * 0.99, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** An ellipse with radial shading (domes, orbs, discs). */
export function orb(pen: Pen, cx: number, cy: number, rx: number, ry: number, base: RGB, o: { line?: number; gloss?: number; alpha?: number } = {}) {
  const { ctx } = pen;
  const c = pen.p(cx, cy);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  const g = ctx.createRadialGradient(c.x - pen.u(rx) * 0.35, c.y - pen.u(ry) * 0.4, 0, c.x, c.y, pen.u(Math.max(rx, ry)) * 1.05);
  g.addColorStop(0, css(lighten(base, 0.35 * (o.gloss ?? 1))));
  g.addColorStop(0.55, css(base));
  g.addColorStop(1, css(shade(base, 0.4)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, pen.u(rx), pen.u(ry), 0, 0, Math.PI * 2);
  ctx.fill();
  if ((o.line ?? 1) > 0) {
    ctx.strokeStyle = css(pen.ink, 0.75);
    ctx.lineWidth = pen.u(0.5 * (o.line ?? 1));
    ctx.stroke();
  }
  ctx.restore();
}

/** A stroke between art points. */
export function line(pen: Pen, pts: [number, number][], color: RGB, width: number, alpha = 1) {
  const { ctx } = pen;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = css(color);
  ctx.lineWidth = pen.u(width);
  ctx.beginPath();
  const P = pts.map(([x, y]) => pen.p(x, y));
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y);
  ctx.stroke();
  ctx.restore();
}

/** A soft glow (windows, pores, lamps). */
export function glow(pen: Pen, x: number, y: number, r: number, color: RGB, a = 0.9) {
  const c = pen.p(x, y);
  softEllipse(pen.ctx, c.x, c.y, pen.u(r), pen.u(r), lighten(color, 0.2), a, 0, 1);
}

/** A row of lit windows. */
export function windows(pen: Pen, x: number, y: number, w: number, n: number, size: number, color: RGB) {
  const gap = w / n;
  for (let i = 0; i < n; i++) {
    const cx = x + gap * (i + 0.5);
    plate(pen, [
      [cx - size * 0.5, y - size * 0.5],
      [cx + size * 0.5, y - size * 0.5],
      [cx + size * 0.5, y + size * 0.5],
      [cx - size * 0.5, y + size * 0.5],
    ], color, { light: 0.6, dark: 0.15, line: 0.6 });
  }
}

/** Diagonal hazard stripes across a rectangle (art units). */
export function stripes(pen: Pen, x: number, y: number, w: number, h: number, a: RGB, b: RGB) {
  const { ctx } = pen;
  const p0 = pen.p(x, y);
  ctx.save();
  ctx.beginPath();
  ctx.rect(p0.x, p0.y, pen.u(w), pen.u(h));
  ctx.clip();
  ctx.fillStyle = css(a);
  ctx.fillRect(p0.x, p0.y, pen.u(w), pen.u(h));
  ctx.fillStyle = css(b);
  const step = pen.u(h * 1.4);
  for (let sx = p0.x - pen.u(h); sx < p0.x + pen.u(w) + pen.u(h); sx += step) {
    ctx.beginPath();
    ctx.moveTo(sx, p0.y + pen.u(h));
    ctx.lineTo(sx + step * 0.5, p0.y + pen.u(h));
    ctx.lineTo(sx + step * 0.5 + pen.u(h), p0.y);
    ctx.lineTo(sx + pen.u(h), p0.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = css(pen.ink, 0.7);
  ctx.lineWidth = pen.u(0.4);
  ctx.strokeRect(p0.x, p0.y, pen.u(w), pen.u(h));
  ctx.restore();
}

/** Ground contact shadow. */
export function footShadow(pen: Pen, rx: number, ry: number, a = 0.4) {
  const c = pen.p(0, 0);
  softEllipse(pen.ctx, c.x + pen.u(rx * 0.12), c.y, pen.u(rx), pen.u(ry), [30, 30, 40], a, 0, 1);
}

/** A glazed crystal shard (porcelain body with a celadon shadow side). */
export function shard(pen: Pen, x: number, y: number, w: number, h: number, body: RGB, glaze: RGB, o: { tilt?: number } = {}) {
  const t = o.tilt ?? 0;
  plate(pen, [
    [x - w * 0.5, y],
    [x - w * 0.35 + t, y - h * 0.8],
    [x + t, y - h],
    [x + w * 0.35 + t, y - h * 0.8],
    [x + w * 0.5, y],
  ], body, { light: 0.5, dark: 0.25 });
  plate(pen, [
    [x + t, y - h],
    [x + w * 0.35 + t, y - h * 0.8],
    [x + w * 0.5, y],
    [x + w * 0.08, y],
  ], mix(body, glaze, 0.55), { light: 0.1, dark: 0.3, line: 0.6 });
}

/** A ring seen from above at an angle (drawn as an ellipse outline with a lit near side). */
export function ring(pen: Pen, cx: number, cy: number, rx: number, ry: number, color: RGB, width: number) {
  const { ctx } = pen;
  const c = pen.p(cx, cy);
  ctx.save();
  ctx.strokeStyle = css(shade(color, 0.3), 0.9);
  ctx.lineWidth = pen.u(width);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, pen.u(rx), pen.u(ry), 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = css(lighten(color, 0.2));
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, pen.u(rx), pen.u(ry), 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

/** Reveals only the lowest `u` share of an art piece's height (a building going up). */
export function seedRng(...xs: number[]): Rng {
  let h = 2166136261;
  for (const x of xs) h = Math.imul(h ^ (x | 0), 16777619);
  return new Rng(h >>> 0);
}
