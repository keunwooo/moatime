/**
 * Landscape painters shared by both themes: ground band edges and bodies, haze, sky,
 * hills, clouds, light rays and paper. Horizontal strips are seamless (periodic profiles,
 * wrapped dabs) so they can tile across an endless world without seams.
 */

import { Rng } from '../../core/rng';
import { applyGrain, makeCanvas, taper, type PaintCanvas } from './brush';
import { css, lighten, mix, shade, vary, type RGB } from './color';

const TAU = Math.PI * 2;

interface Wave {
  k: number;
  a: number;
  p: number;
}

function waves(r: Rng, spec: [number, number][]): Wave[] {
  return spec.map(([k, a]) => ({ k, a: a * r.range(0.6, 1.2), p: r.range(0, TAU) }));
}

function profileAt(ws: Wave[], x: number, W: number): number {
  let v = 0;
  for (const w of ws) v += w.a * (0.5 + 0.5 * Math.sin((TAU * w.k * x) / W + w.p));
  return v;
}

/** Calls draw(x) and also at x±W when near the edges, for seamless horizontal tiling. */
function wrapped(W: number, x: number, reach: number, draw: (x: number) => void) {
  draw(x);
  if (x < reach) draw(x + W);
  if (x > W - reach) draw(x - W);
}

export interface BandPalette {
  top: RGB;
  mid: RGB;
  low: RGB;
  light: RGB;
  shadow: RGB;
  tips: RGB[];
  accents: RGB[];
}

export type EdgeStyle = 'grass' | 'regolith';

export const BAND = { W: 2048, H: 200, groundFrac: 0.6 } as const;

/**
 * A ground band edge. 'ridge' bands carry the visible layering (every third band);
 * 'soft' bands only add texture and nearly vanish into the band behind them.
 */
export function paintBandEdge(seed: number, pal: BandPalette, style: EdgeStyle, kind: 'ridge' | 'soft' = 'ridge'): PaintCanvas {
  const { W, H } = BAND;
  const gy = H * BAND.groundFrac;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const soft = kind === 'soft';
  // Broad, irregular undulation (a tree is ~260 wu, so the edge stays within ~14 wu).
  const amp = (style === 'grass' ? 1 : 0.6) * (soft ? 0.35 : 1);
  const ws = waves(r, [
    [1, 7 * amp],
    [2, 5.5 * amp],
    [3, 3.5 * amp],
    [7, 1.6 * amp],
    [17, 0.7 * amp],
  ]);
  const top = (x: number) => gy - 3 - profileAt(ws, x, W);
  const path = new Path2D();
  path.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) path.lineTo(x, top(x));
  path.lineTo(W, H);
  path.closePath();

  let minY: number = H;
  for (let x = 0; x <= W; x += 8) minY = Math.min(minY, top(x));
  // One continuous color field: the same base as the band body, so consecutive bands
  // melt together and only the ridges read as gentle undulations (no stripes).
  ctx.fillStyle = css(pal.mid);
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  if (!soft) {
    // Light rests only on the slopes that face the sun (upper left), as broad soft washes,
    // so ridges read as rolling ground rather than terraces.
    const wash = waves(r, [
      [1, 1],
      [3, 0.6],
      [5, 0.4],
    ]);
    for (let x = 0; x < W; x += 3) {
      const y0 = top(x);
      const slope = top(x + 30) - top(x - 30); // < 0: faces the light
      const lit = Math.max(0, Math.min(1, -slope / 6)) * (profileAt(wash, x, W) / 2);
      if (lit < 0.02) continue;
      const depthPx = 34 + lit * 20;
      const g2 = ctx.createLinearGradient(0, y0, 0, y0 + depthPx);
      g2.addColorStop(0, css(pal.top, 0.5 * lit));
      g2.addColorStop(1, css(pal.top, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(x, y0, 3, depthPx);
    }
  }
  // brush dabs in close values
  const count = Math.round((W * (H - minY)) / (soft ? 420 : 300));
  for (let i = 0; i < count; i++) {
    const x = r.next() * W;
    const y = minY + r.next() * (H - minY);
    const c = vary(r.chance(0.5) ? mix(pal.mid, pal.light, 0.25) : mix(pal.mid, pal.shadow, 0.22), r, 0.008, 0.04, 0.03);
    const len = r.range(6, 18);
    ctx.globalAlpha = r.range(0.06, 0.16);
    ctx.fillStyle = css(c);
    wrapped(W, x, 20, (xx) => {
      ctx.beginPath();
      ctx.ellipse(xx, y, len, len * r.range(0.2, 0.36), r.range(-0.2, 0.2), 0, TAU);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (style === 'grass') {
    // grass tips along the silhouette
    // tufts gather in clumps along the edge instead of an even comb
    const clump = waves(r, [
      [4, 1],
      [9, 0.7],
      [19, 0.5],
    ]);
    // Tips stay close in value to the ground and spread over a deep band below the edge:
    // a dense light fringe right on the edge reads from afar as a straight line across the
    // meadow (striped ground).
    const blades = Math.round(W / (soft ? 16 : 4));
    for (let i = 0; i < blades; i++) {
      const x = r.next() * W;
      if (r.next() > Math.pow(profileAt(clump, x, W) / 2.2, 1.6)) continue;
      const by = top(x) + r.range(4, soft ? 40 : 26);
      const h = r.range(3, 10) * (r.chance(0.08) ? 1.5 : 1);
      const lean = r.range(-4, 4);
      const col = vary(mix(r.pick(pal.tips), pal.mid, soft ? 0.55 : 0.3), r, 0.01, 0.05, 0.06);
      wrapped(W, x, 24, (xx) => {
        const pts = [
          { x: xx, y: by },
          { x: xx + lean * 0.4, y: by - h * 0.55 },
          { x: xx + lean, y: by - h },
        ];
        taper(ctx, pts, r.range(1.6, 3), 0.2, col, r.range(0.65, 1));
      });
    }
    for (let i = 0; i < (soft ? 0 : W / 90); i++) {
      const x = r.next() * W;
      const y = top(x) - r.range(0, 6);
      const col = r.pick(pal.accents);
      wrapped(W, x, 8, (xx) => {
        ctx.fillStyle = css(col, r.range(0.6, 0.95));
        ctx.beginPath();
        ctx.arc(xx, y, r.range(1.2, 2.4), 0, TAU);
        ctx.fill();
      });
    }
  } else {
    // a few pebbles along ridge rims only (rocks and craters carry the detail)
    for (let i = 0; i < (soft ? 0 : W / 48); i++) {
      const x = r.next() * W;
      const y = top(x) + r.range(2, 18);
      const s = r.range(1.2, 4);
      const col = vary(r.pick(pal.tips), r, 0.01, 0.03, 0.06);
      wrapped(W, x, 10, (xx) => {
        ctx.fillStyle = css(shade(col, 0.25), 0.55);
        ctx.beginPath();
        ctx.ellipse(xx + s * 0.25, y + s * 0.2, s, s * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = css(col, 0.95);
        ctx.beginPath();
        ctx.ellipse(xx, y, s, s * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = css(lighten(col, 0.4), 0.6);
        ctx.beginPath();
        ctx.ellipse(xx - s * 0.3, y - s * 0.2, s * 0.4, s * 0.25, 0, 0, TAU);
        ctx.fill();
      });
    }
  }
  if (style === 'regolith' && !soft) {
    // dusty rim light on lunar ridges
    ctx.save();
    ctx.strokeStyle = css(lighten(pal.light, 0.2), 0.12);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = top(x) + 1.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  applyGrain(ctx, path, W, H, 0.1);
  return pc;
}

export function paintBandBody(seed: number, pal: BandPalette, style: EdgeStyle): PaintCanvas {
  const S = 512;
  const pc = makeCanvas(S, S);
  const { ctx } = pc;
  const r = new Rng(seed);
  ctx.fillStyle = css(pal.mid);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1200; i++) {
    const x = r.next() * S;
    const y = r.next() * S;
    const c = vary(r.chance(0.5) ? mix(pal.mid, pal.light, 0.25) : mix(pal.mid, pal.shadow, 0.22), r, 0.008, 0.04, 0.03);
    const len = r.range(4, 13);
    ctx.globalAlpha = r.range(0.06, 0.16);
    ctx.fillStyle = css(c);
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < -20 || xx > S + 20 || yy < -20 || yy > S + 20) continue;
        ctx.beginPath();
        if (style === 'grass') ctx.ellipse(xx, yy, len, len * 0.3, r.range(-0.3, 0.3), 0, TAU);
        else ctx.ellipse(xx, yy, len * 1.2, len * 0.45, r.range(-0.3, 0.3), 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  applyGrain(ctx, null, S, S, 0.1);
  return pc;
}

/**
 * Soft fog strip: densest a little above the ground line (85% down), fading upward and
 * also to nothing at the very bottom so a card never ends in a straight edge.
 * White, tinted at use.
 */
export function paintHaze(seed: number): PaintCanvas {
  const W = 1024;
  const H = 256;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.26)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.9, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // drifting wisps
  for (let i = 0; i < 70; i++) {
    const x = r.next() * W;
    const y = r.range(0.3, 0.85) * H;
    const rx = r.range(60, 190);
    const ry = r.range(10, 34);
    const a = r.range(0.06, 0.2);
    wrapped(W, x, rx, (xx) => {
      ctx.save();
      ctx.translate(xx, y);
      ctx.scale(1, ry / rx);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      rg.addColorStop(0, `rgba(255,255,255,${a})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    });
  }
  return pc;
}

export interface SkyPalette {
  stops: [number, RGB][];
}

/** Tall gradient with dithering (no banding when stretched). */
export function paintSky(p: SkyPalette, seed: number): PaintCanvas {
  const W = 64;
  const H = 1024;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [t, c] of p.stops) g.addColorStop(t, css(c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  const r = new Rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r.next() - 0.5) * 3;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return pc;
}

export interface HillPalette {
  body: RGB;
  top: RGB;
  light: RGB;
  shadow: RGB;
  base: RGB;
}

export interface HillShape {
  /** Each [cycles per period, amplitude in px]. */
  spec: [number, number][];
  /** Baseline height from the bottom, px. */
  baseline: number;
  peakiness?: number;
}

export const HILL = { W: 2048, H: 512 } as const;

function hillProfile(seed: number, shape: HillShape) {
  const r = new Rng(seed);
  const ws = waves(r, shape.spec);
  const peak = shape.peakiness ?? 1;
  return (x: number) => {
    let v = profileAt(ws, x, HILL.W);
    if (peak !== 1) {
      const max = shape.spec.reduce((s, [, a]) => s + a, 0);
      v = Math.pow(v / max, peak) * max;
    }
    return HILL.H - shape.baseline - v;
  };
}

/** Distant hills or ridges as a seamless strip with soft side light. */
export function paintHills(seed: number, pal: HillPalette, shape: HillShape): PaintCanvas {
  const { W, H } = HILL;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed ^ 0x5bd1e995);
  const top = hillProfile(seed, shape);
  const path = new Path2D();
  path.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) path.lineTo(x, top(x));
  path.lineTo(W, H);
  path.closePath();
  let minY: number = H;
  for (let x = 0; x <= W; x += 8) minY = Math.min(minY, top(x));
  const g = ctx.createLinearGradient(0, minY, 0, H);
  g.addColorStop(0, css(pal.top));
  g.addColorStop(0.55, css(pal.body));
  g.addColorStop(1, css(pal.base));
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  for (let x = 0; x < W; x += 2) {
    const y0 = top(x);
    const slope = top(x + 10) - top(x - 10);
    if (slope < 0) {
      ctx.fillStyle = css(pal.light, Math.min(0.35, -slope / 40));
      ctx.fillRect(x, y0, 2, 80 + r.range(0, 60));
    } else if (slope > 0) {
      ctx.fillStyle = css(pal.shadow, Math.min(0.22, slope / 50));
      ctx.fillRect(x, y0, 2, 120 + r.range(0, 60));
    }
  }
  for (let i = 0; i < 900; i++) {
    const x = r.next() * W;
    const y = minY + r.next() * (H - minY);
    const c = vary(r.chance(0.5) ? pal.body : mix(pal.body, pal.light, 0.4), r, 0.01, 0.04, 0.04);
    ctx.globalAlpha = r.range(0.05, 0.14);
    ctx.fillStyle = css(c);
    const len = r.range(10, 34);
    wrapped(W, x, 40, (xx) => {
      ctx.beginPath();
      ctx.ellipse(xx, y, len, len * 0.3, r.range(-0.3, 0.3), 0, TAU);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  applyGrain(ctx, path, W, H, 0.08);
  return pc;
}

/** Small things sitting along a hill's ridge (distant tree crowns, domes and lights). */
export function paintRidgeDressing(
  seed: number,
  shape: HillShape,
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, r: Rng) => void,
  density: number,
): PaintCanvas {
  const { W, H } = HILL;
  const pc = makeCanvas(W, H);
  const top = hillProfile(seed, shape);
  const r = new Rng(seed ^ 0x27d4eb2d);
  const n = Math.round(W * density);
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(r.next() * W);
  xs.sort((a, b) => top(a) - top(b));
  for (const x of xs) {
    const y = top(x) + r.range(2, 26);
    wrapped(W, x, 30, (xx) => draw(pc.ctx, xx, y, r));
  }
  return pc;
}

/** Soft cloud: overlapping radial puffs, lit from the upper left. */
export function paintCloud(seed: number, lit: RGB, shadowCol: RGB): PaintCanvas {
  const W = 512;
  const H = 200;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const puffs = r.int(6, 10);
  for (let pass = 0; pass < 2; pass++) {
    const rr = new Rng(seed + 11);
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1);
      const x = 70 + t * (W - 140) + rr.range(-20, 20);
      const rad = (1 - Math.abs(t - 0.45) * 1.2) * rr.range(46, 70) + 18;
      const y = H * 0.62 - rad * rr.range(0.25, 0.55);
      const col = pass === 0 ? shadowCol : lit;
      const ox = pass === 0 ? rad * 0.12 : -rad * 0.08;
      const oy = pass === 0 ? rad * 0.14 : -rad * 0.1;
      const k = pass === 0 ? 1 : 0.82;
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad * k);
      g.addColorStop(0, css(col, pass === 0 ? 0.55 : 0.8));
      g.addColorStop(0.6, css(col, pass === 0 ? 0.35 : 0.5));
      g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, rad * k, 0, TAU);
      ctx.fill();
    }
  }
  return pc;
}

/** Long soft light shaft, white; drawn additively. */
export function paintRay(): PaintCanvas {
  const W = 128;
  const H = 1024;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const h = ctx.createLinearGradient(0, 0, W, 0);
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.5, 'rgba(255,255,255,1)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-in';
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(0,0,0,0.9)');
  v.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  return pc;
}

/** Warm paper with fibers; tiles seamlessly. Drawn in multiply over the whole scene. */
export function paintPaper(seed: number, tint: RGB): PaintCanvas {
  const S = 512;
  const pc = makeCanvas(S, S);
  const { ctx } = pc;
  const r = new Rng(seed);
  ctx.fillStyle = css(lighten(tint, 0.82));
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const noise = new Float32Array((S / 4) * (S / 4));
  for (let i = 0; i < noise.length; i++) noise[i] = r.next();
  const N = S / 4;
  const sample = (x: number, y: number) => {
    const x0 = Math.floor(x) % N;
    const y0 = Math.floor(y) % N;
    const x1 = (x0 + 1) % N;
    const y1 = (y0 + 1) % N;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const a = noise[y0 * N + x0] * (1 - fx) + noise[y0 * N + x1] * fx;
    const b = noise[y1 * N + x0] * (1 - fx) + noise[y1 * N + x1] * fx;
    return a * (1 - fy) + b * fy;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = sample(x / 4, y / 4) * 0.65 + r.next() * 0.35;
      const k = 1 - (v - 0.5) * 0.09;
      const i = (y * S + x) * 4;
      d[i] *= k;
      d[i + 1] *= k;
      d[i + 2] *= k * 0.995;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = css(shade(tint, 0.4), 0.06);
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 260; i++) {
    const x = r.next() * S;
    const y = r.next() * S;
    const a = r.range(0, Math.PI);
    const l = r.range(8, 30);
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.quadraticCurveTo(
          x + dx + Math.cos(a) * l * 0.5 + r.range(-3, 3),
          y + dy + Math.sin(a) * l * 0.5,
          x + dx + Math.cos(a) * l,
          y + dy + Math.sin(a) * l,
        );
        ctx.stroke();
      }
    }
  }
  return pc;
}
