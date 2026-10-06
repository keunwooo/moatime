/**
 * Procedural gouache painting on Canvas2D. Every asset of both themes is painted with these
 * functions so brush texture, edge softness and light direction stay identical.
 *
 * Light always comes from the upper left (LIGHT points toward the light).
 */

import { CanvasSource, Texture } from 'pixi.js';
import type { Rng } from '../../core/rng';
import { css, lighten, mix, shade, vary, type RGB } from './color';

export const LIGHT = { x: -0.6, y: -0.8 } as const;

export interface Pt {
  x: number;
  y: number;
}

export interface PaintCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

export function makeCanvas(w: number, h: number): PaintCanvas {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx, w: canvas.width, h: canvas.height };
}

const allTextures = new Set<Texture>();
const scopes: Texture[][] = [];

/**
 * Runs an async texture build; if it throws, every texture it created is released so a
 * failed theme load never leaks GPU memory.
 */
export async function trackTextures<T>(build: () => Promise<T>): Promise<T> {
  const created: Texture[] = [];
  scopes.push(created);
  try {
    return await build();
  } catch (err) {
    for (const t of created) releaseTexture(t);
    throw err;
  } finally {
    const i = scopes.indexOf(created);
    if (i >= 0) scopes.splice(i, 1);
  }
}

/**
 * repeat: 'x' for horizontal strips (ridges, ground edges, haze) so the transparent top row
 * never blends with the opaque bottom row; 'xy' for fully tiling fills (paper, ground body).
 */
export function toTexture(
  pc: PaintCanvas,
  opts: { mipmaps?: boolean; label?: string; repeat?: false | 'x' | 'xy' } = {},
): Texture {
  const source = new CanvasSource({
    resource: pc.canvas,
    autoGenerateMipmaps: opts.mipmaps ?? true,
    scaleMode: 'linear',
    addressModeU: opts.repeat ? 'repeat' : 'clamp-to-edge',
    addressModeV: opts.repeat === 'xy' ? 'repeat' : 'clamp-to-edge',
    label: opts.label,
  });
  const tex = new Texture({ source, label: opts.label });
  allTextures.add(tex);
  for (const s of scopes) s.push(tex);
  return tex;
}

/** Destroys a texture created by toTexture and its canvas memory. */
export function releaseTexture(tex: Texture | null | undefined) {
  if (!tex || tex.destroyed) return;
  allTextures.delete(tex);
  const res = tex.source.resource as HTMLCanvasElement | undefined;
  tex.destroy(true);
  if (res && 'width' in res) {
    res.width = 1;
    res.height = 1;
  }
}

export function liveTextureCount(): number {
  return allTextures.size;
}

// ---------------------------------------------------------------------------
// Shapes

export interface BlobOpts {
  n?: number;
  /** Low-frequency lumpiness (0..0.4). */
  lumps?: number;
  /** High-frequency hand wobble (0..0.08). */
  wobble?: number;
  /** Flattens the bottom (0..1), for things that sit on the ground. */
  flatBottom?: number;
  rotation?: number;
}

export function blobPoints(cx: number, cy: number, rx: number, ry: number, r: Rng, o: BlobOpts = {}): Pt[] {
  const n = o.n ?? 28;
  const lumps = o.lumps ?? 0.12;
  const wobble = o.wobble ?? 0.025;
  const harmonics = [
    { k: 2, a: r.range(0.3, 1) * lumps * 0.6, p: r.range(0, Math.PI * 2) },
    { k: 3, a: r.range(0.3, 1) * lumps * 0.5, p: r.range(0, Math.PI * 2) },
    { k: 5, a: r.range(0.2, 1) * lumps * 0.35, p: r.range(0, Math.PI * 2) },
    { k: 7, a: r.range(0, 1) * lumps * 0.2, p: r.range(0, Math.PI * 2) },
  ];
  const rot = o.rotation ?? 0;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let m = 1;
    for (const h of harmonics) m += h.a * Math.sin(h.k * t + h.p);
    m += r.range(-wobble, wobble);
    let x = Math.cos(t) * rx * m;
    let y = Math.sin(t) * ry * m;
    if (o.flatBottom && y > 0) y *= 1 - o.flatBottom * Math.min(1, y / ry);
    if (rot) {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const xr = x * c - y * s;
      y = x * s + y * c;
      x = xr;
    }
    pts.push({ x: cx + x, y: cy + y });
  }
  return pts;
}

/** Smooth closed curve through points (quadratic through midpoints). */
export function smoothPath(pts: Pt[], closed = true): Path2D {
  const p = new Path2D();
  const n = pts.length;
  if (n < 3) return p;
  if (closed) {
    const m0 = mid(pts[n - 1], pts[0]);
    p.moveTo(m0.x, m0.y);
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const m = mid(a, b);
      p.quadraticCurveTo(a.x, a.y, m.x, m.y);
    }
    p.closePath();
  } else {
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      p.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    p.lineTo(pts[n - 1].x, pts[n - 1].y);
  }
  return p;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function bounds(pts: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, rx: (maxX - minX) / 2, ry: (maxY - minY) / 2 };
}

// ---------------------------------------------------------------------------
// Paper grain (generated once, shared)

let grainCanvas: HTMLCanvasElement | null = null;

export function grain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  // Smoothed value noise + fine speckle; tileable because samples wrap.
  const base = new Float32Array(size * size);
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < base.length; i++) base[i] = rnd();
  const at = (x: number, y: number) => base[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v =
        at(x, y) * 0.4 +
        (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) * 0.12 +
        (at(x + 2, y + 1) + at(x - 2, y - 1)) * 0.06;
      const g = 255 * (0.62 + v * 0.38);
      const i = (y * size + x) * 4;
      img.data[i] = g;
      img.data[i + 1] = g * 0.985;
      img.data[i + 2] = g * 0.95;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // fibers
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#5a4a3a';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = rnd() * Math.PI;
    const l = 6 + rnd() * 18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd() * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  grainCanvas = canvas;
  return canvas;
}

let grainPatternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  let p = grainPatternCache.get(ctx);
  if (!p) {
    p = ctx.createPattern(grain(), 'repeat') ?? undefined;
    if (p) grainPatternCache.set(ctx, p);
  }
  return p ?? null;
}

/**
 * Paper grain over painted pixels only. Inside a filled path, multiply; without a path,
 * 'source-atop' so transparent areas of the texture stay transparent.
 */
export function applyGrain(ctx: CanvasRenderingContext2D, path: Path2D | null, w: number, h: number, alpha: number) {
  const pat = grainPattern(ctx);
  if (!pat || alpha <= 0) return;
  ctx.save();
  if (path) ctx.clip(path);
  ctx.globalCompositeOperation = path ? 'multiply' : 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Gouache fill

export interface GouacheOpts {
  base: RGB;
  light?: RGB;
  shadow?: RGB;
  r: Rng;
  /** Number of brush dabs per 100x100 px of area. */
  dabDensity?: number;
  /** Dab size relative to the shape radius. */
  dabSize?: number;
  lightStrength?: number;
  shadowStrength?: number;
  grain?: number;
  rimShadow?: number;
  rimLight?: number;
  /** Brush stroke direction (radians). */
  strokeAngle?: number;
  /** How much the round form shading applies (0 flat .. 1 round). */
  roundness?: number;
}

export function gouache(ctx: CanvasRenderingContext2D, pts: Pt[], o: GouacheOpts) {
  const path = smoothPath(pts);
  const b = bounds(pts);
  const R = Math.max(b.rx, b.ry, 1);
  const light = o.light ?? lighten(o.base, 0.35);
  const shadow = o.shadow ?? shade(o.base, 0.35);
  const ls = o.lightStrength ?? 0.5;
  const ss = o.shadowStrength ?? 0.5;
  const r = o.r;
  const roundness = o.roundness ?? 0.7;

  ctx.save();
  ctx.fillStyle = css(o.base);
  ctx.fill(path);
  ctx.clip(path);

  // Directional light across the shape.
  const lx = b.cx + LIGHT.x * R;
  const ly = b.cy + LIGHT.y * R;
  const sx = b.cx - LIGHT.x * R;
  const sy = b.cy - LIGHT.y * R;
  const g = ctx.createLinearGradient(lx, ly, sx, sy);
  g.addColorStop(0, css(light, ls));
  g.addColorStop(0.42, css(light, 0));
  g.addColorStop(0.58, css(shadow, 0));
  g.addColorStop(1, css(shadow, ss));
  ctx.fillStyle = g;
  ctx.fillRect(b.minX - 2, b.minY - 2, b.rx * 2 + 4, b.ry * 2 + 4);

  // Round form: soft highlight toward the light, darker core edge away from it.
  if (roundness > 0) {
    const rg = ctx.createRadialGradient(
      b.cx + LIGHT.x * R * 0.38,
      b.cy + LIGHT.y * R * 0.38,
      R * 0.05,
      b.cx,
      b.cy,
      R * 1.15,
    );
    rg.addColorStop(0, css(light, 0.28 * roundness));
    rg.addColorStop(0.55, css(o.base, 0));
    rg.addColorStop(1, css(shadow, 0.38 * roundness));
    ctx.fillStyle = rg;
    ctx.fillRect(b.minX - 2, b.minY - 2, b.rx * 2 + 4, b.ry * 2 + 4);
  }

  // Brush dabs: short directional strokes with slightly varied pigment.
  const area = b.rx * b.ry * 4;
  const count = Math.round((area / 10000) * (o.dabDensity ?? 26)) + 6;
  const ds = o.dabSize ?? 0.13;
  const baseAngle = o.strokeAngle ?? -0.5;
  for (let i = 0; i < count; i++) {
    const x = b.minX + r.next() * b.rx * 2;
    const y = b.minY + r.next() * b.ry * 2;
    const t = ((x - b.cx) * -LIGHT.x + (y - b.cy) * -LIGHT.y) / R; // -1 lit .. 1 shadow
    const tone = t < 0 ? mix(o.base, light, Math.min(1, -t) * 0.85) : mix(o.base, shadow, Math.min(1, t) * 0.8);
    const c = vary(tone, r, 0.012, 0.06, 0.05);
    const len = R * ds * r.range(0.6, 1.5);
    ctx.globalAlpha = r.range(0.08, 0.24);
    ctx.fillStyle = css(c);
    ctx.beginPath();
    ctx.ellipse(x, y, len, len * r.range(0.28, 0.55), baseAngle + r.range(-0.5, 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Rim: soft shadow edge on the far side, a thin warm light edge on the lit side.
  const rimS = o.rimShadow ?? 0.22;
  if (rimS > 0) {
    const rs = ctx.createLinearGradient(lx, ly, sx, sy);
    rs.addColorStop(0.35, css(shadow, 0));
    rs.addColorStop(1, css(shade(shadow, 0.2), rimS));
    ctx.strokeStyle = rs;
    ctx.lineWidth = R * 0.2;
    ctx.stroke(path);
  }
  const rimL = o.rimLight ?? 0.18;
  if (rimL > 0) {
    const rl = ctx.createLinearGradient(lx, ly, sx, sy);
    rl.addColorStop(0, css(lighten(light, 0.3), rimL));
    rl.addColorStop(0.45, css(light, 0));
    ctx.strokeStyle = rl;
    ctx.lineWidth = R * 0.07;
    ctx.stroke(path);
  }
  ctx.restore();

  applyGrain(ctx, path, ctx.canvas.width, ctx.canvas.height, o.grain ?? 0.14);
  return path;
}

/** Hand-painted irregular edge: a few dabs along the outline, inside and slightly outside. */
export function fray(ctx: CanvasRenderingContext2D, pts: Pt[], color: RGB, r: Rng, size: number, alpha = 0.35) {
  ctx.save();
  for (let i = 0; i < pts.length; i++) {
    if (!r.chance(0.55)) continue;
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const t = r.next();
    const x = a.x + (b.x - a.x) * t + r.range(-size, size) * 0.5;
    const y = a.y + (b.y - a.y) * t + r.range(-size, size) * 0.5;
    ctx.globalAlpha = alpha * r.range(0.4, 1);
    ctx.fillStyle = css(vary(color, r));
    ctx.beginPath();
    ctx.ellipse(x, y, size * r.range(0.5, 1.2), size * r.range(0.3, 0.7), r.range(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A filled tapered stroke along a polyline (stems, grass blades, branches). */
export function taper(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  w0: number,
  w1: number,
  color: RGB,
  alpha = 1,
): Path2D | null {
  if (pts.length < 2) return null;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const t = i / (pts.length - 1);
    const w = (w0 + (w1 - w0) * t) / 2;
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }
  const path = new Path2D();
  path.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) path.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i].x, right[i].y);
  path.closePath();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = css(color);
  ctx.fill(path);
  ctx.restore();
  return path;
}

/** Quadratic curve sampled into points. */
export function curvePts(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const it = 1 - t;
    out.push({ x: it * it * x0 + 2 * it * t * cx + t * t * x1, y: it * it * y0 + 2 * it * t * cy + t * t * y1 });
  }
  return out;
}

export function softEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: RGB,
  a0: number,
  a1 = 0,
  stop = 1,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, css(color, a0));
  g.addColorStop(stop * 0.55, css(color, a0 * 0.55 + a1 * 0.45));
  g.addColorStop(1, css(color, a1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A radial glow sprite texture (dust motes, fireflies, window light). */
export function glowTexture(size: number, color: RGB, falloff = 0.5, label = 'glow'): Texture {
  const pc = makeCanvas(size, size);
  const c = size / 2;
  const g = pc.ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, css(lighten(color, 0.4), 1));
  g.addColorStop(falloff * 0.35, css(color, 0.7));
  g.addColorStop(falloff, css(color, 0.18));
  g.addColorStop(1, css(color, 0));
  pc.ctx.fillStyle = g;
  pc.ctx.fillRect(0, 0, size, size);
  return toTexture(pc, { label, mipmaps: true });
}

/** Soft ground contact shadow seen from above (used as a flat card). */
export function shadowTexture(): Texture {
  const pc = makeCanvas(256, 256);
  softEllipse(pc.ctx, 128, 128, 126, 126, [52, 62, 70], 0.55, 0, 1);
  return toTexture(pc, { label: 'shadow' });
}
