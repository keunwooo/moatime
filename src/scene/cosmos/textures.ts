/**
 * Painted textures of "처음의 우주": wet-on-wet watercolour for nebulae, fog and the Big Bang's
 * bloom; gouache dots and soft halos for stars; round gouache discs for planets, whose surface
 * maps (magma, crust, ocean levels, green, clouds, night lights) scroll under a round mask so the
 * planet turns. Everything is painted once when the theme is built; nothing is painted per frame.
 */

import type { Texture } from 'pixi.js';
import { Rng } from '../../core/rng';
import { applyGrain, blobPoints, glowTexture, makeCanvas, releaseTexture, smoothPath, toTexture, type PaintCanvas, type Pt } from '../paint/brush';
import { css, lighten, mix, shade, type RGB } from '../paint/color';
import { paintPaper } from '../paint/landscape';
import type { CosmosLayout } from './layout';
import { fbmField } from './noise';
import { C } from './palette';

export interface CosmosTextures {
  glow: Texture;
  glowSoft: Texture;
  dot: Texture;
  bloom: Texture;
  fog: Texture;
  cmb: Texture;
  band: Texture;
  dustLane: Texture;
  bubble: Texture;
  /** A thin neutral ring (colonies, the station) and a soft shield bubble, both for tinting. */
  loop: Texture;
  shield: Texture;
  shell: Texture;
  remnant: Texture;
  nebulaA: Texture[];
  nebulaB: Texture[];
  lanesA: Texture;
  disk: Texture;
  diskBands: Texture;
  belt: Texture;
  ring: Texture;
  shade: Texture;
  night: Texture;
  circle: Texture;
  rim: Texture;
  magma: Texture;
  crust: Texture;
  oceans: Texture[];
  green: Texture;
  clouds: Texture;
  lights: Texture;
  lightsFew: Texture;
  giant: Texture;
  inner: Texture;
  moon: Texture;
  galaxyDisk: Texture;
  galaxyArms: Texture;
  blob: Texture;
  neighbour: Texture;
  comet: Texture;
  tail: Texture;
  ionTail: Texture;
  streak: Texture;
  jet: Texture;
  arc: Texture;
  beam: Texture;
  paper: Texture;
  vignette: Texture;
  veil: Texture;
  /** The cosmic web is painted for the aspect on view. */
  web: Partial<Record<string, WebTextures>>;
  all: Texture[];
}

export interface WebTextures {
  threads: Texture[];
  nodes: Texture;
  /** Normalised node positions and the threads between them. */
  graph: { nodes: { x: number; y: number }[]; edges: [number, number][] };
}

const TAU = Math.PI * 2;

// ---- helpers ------------------------------------------------------------------------------------

/** Watercolour wash: overlapping translucent blobs with darker blooming edges. */
function wash(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: RGB, alpha: number, r: Rng, layers = 6) {
  for (let i = 0; i < layers; i++) {
    const k = 1 - i / (layers + 1.5);
    const pts = blobPoints(cx + r.range(-0.12, 0.12) * rx, cy + r.range(-0.12, 0.12) * ry, rx * k, ry * k, r, { lumps: 0.32, wobble: 0.05, n: 40, rotation: r.range(0, TAU) });
    const path = smoothPath(pts);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry) * k);
    g.addColorStop(0, css(lighten(color, 0.12), alpha * 0.9));
    g.addColorStop(0.7, css(color, alpha * 0.75));
    g.addColorStop(1, css(color, alpha * 0.25));
    ctx.fillStyle = g;
    ctx.fill(path);
    // pigment gathers at the drying edge
    ctx.strokeStyle = css(shade(color, 0.18, C.abyss), alpha * 0.35);
    ctx.lineWidth = Math.max(1, Math.max(rx, ry) * 0.012);
    ctx.stroke(path);
  }
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, color: RGB, r: Rng, maxR = 1.4, alpha = 0.7, inside?: (x: number, y: number) => boolean) {
  for (let i = 0; i < n; i++) {
    const x = r.next() * w;
    const y = r.next() * h;
    if (inside && !inside(x, y)) continue;
    const rr = r.range(0.3, maxR);
    ctx.fillStyle = css(color, alpha * r.range(0.3, 1));
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.fill();
  }
}

function radial(pc: PaintCanvas, stops: [number, RGB, number][], cx = pc.w / 2, cy = pc.h / 2, R = Math.min(pc.w, pc.h) / 2) {
  const g = pc.ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  for (const [o, c, a] of stops) g.addColorStop(o, css(c, a));
  pc.ctx.fillStyle = g;
  pc.ctx.fillRect(0, 0, pc.w, pc.h);
}

/** Feathers a painting's borders to nothing, so a sprite never shows its rectangle. */
function feather(pc: PaintCanvas, margin = 0.16) {
  const { ctx, w, h } = pc;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  const mx = w * margin;
  const my = h * margin;
  edge(0, 0, mx, 0, 0, 0, mx, h);
  edge(w, 0, w - mx, 0, w - mx, 0, mx, h);
  edge(0, 0, 0, my, 0, 0, w, my);
  edge(0, h, 0, h - my, 0, h - my, w, my);
  ctx.restore();
}

/** A tileable soft cloud field in white (alpha carries the shape). */
function paintFog(seed: number): PaintCanvas {
  const S = 256;
  const pc = makeCanvas(S, S);
  const img = pc.ctx.createImageData(S, S);
  const field = fbmField(seed, S, S, 4, 5);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = field[y * S + x];
      const v = Math.max(0, Math.min(1, (n - 0.28) * 1.7));
      const i = (y * S + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 250;
      img.data[i + 2] = 244;
      img.data[i + 3] = Math.round(v * v * 255);
    }
  }
  pc.ctx.putImageData(img, 0, 0);
  return pc;
}

const MAP_W = 512;
const MAP_H = 256;

/** Equirectangular map from a noise field (w = 2h; seamless horizontally). */
function paintMap(field: Float32Array, f: (n: number, lat: number, i: number) => [number, number, number, number]): PaintCanvas {
  const W = MAP_W;
  const H = MAP_H;
  const pc = makeCanvas(W, H);
  const img = pc.ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = (y / H - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      const n = field[y * W + x];
      const [r, g, b, a] = f(n, lat, y * W + x);
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  pc.ctx.putImageData(img, 0, 0);
  return pc;
}

const rgb = (c: RGB, a = 255): [number, number, number, number] => [c[0], c[1], c[2], a];

// ---- the cosmic web ------------------------------------------------------------------------------

/** Whether the segment p–q passes through the timer's quiet space (with a margin). */
function crosses(p: { x: number; y: number }, q: { x: number; y: number }, t: [number, number, number, number]): boolean {
  for (let k = 0; k <= 20; k++) {
    const x = p.x + (q.x - p.x) * (k / 20);
    const y = p.y + (q.y - p.y) * (k / 20);
    if (x > t[0] - 0.03 && x < t[2] + 0.03 && y > t[1] - 0.04 && y < t[3] + 0.04) return true;
  }
  return false;
}

/** Nodes (the first-generation stars among them) and the threads between nearest neighbours. */
export function webGraph(L: CosmosLayout, seed: number): WebTextures['graph'] {
  const r = new Rng(seed ^ 0x3eb);
  const nodes = L.firstGen.map((p) => ({ ...p }));
  const [tx0, ty0, tx1, ty1] = L.timer;
  let guard = 0;
  while (nodes.length < 15 && guard++ < 400) {
    const p = { x: r.range(0.02, 0.98), y: r.range(0.03, 0.74) };
    if (p.x > tx0 - 0.02 && p.x < tx1 + 0.02 && p.y > ty0 - 0.02 && p.y < ty1 + 0.02) continue;
    if (nodes.some((q) => Math.hypot(q.x - p.x, (q.y - p.y) * 1.3) < 0.12)) continue;
    nodes.push(p);
  }
  const edges: [number, number][] = [];
  const has = (a: number, b: number) => edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  nodes.forEach((p, i) => {
    const near = nodes
      .map((q, j) => ({ j, d: Math.hypot(q.x - p.x, (q.y - p.y) * 1.2) }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + (i % 2));
    for (const o of near) if (!has(i, o.j) && o.d < 0.42 && !crosses(p, nodes[o.j], L.timer)) edges.push([i, o.j]);
  });
  return { nodes, edges };
}

function paintWeb(L: CosmosLayout, seed: number, aspectW: number, aspectH: number): WebTextures {
  const graph = webGraph(L, seed);
  const W = aspectW >= aspectH ? 1024 : 576;
  const H = Math.round((W * aspectH) / aspectW);
  const r = new Rng(seed ^ 0x77);
  const threads: Texture[] = [];
  for (let part = 0; part < 2; part++) {
    const pc = makeCanvas(W, H);
    const { ctx } = pc;
    ctx.lineCap = 'round';
    graph.edges.forEach(([a, b], i) => {
      if (i % 2 !== part) return;
      const p = graph.nodes[a];
      const q = graph.nodes[b];
      const ax = p.x * W;
      const ay = p.y * H;
      const bx = q.x * W;
      const by = q.y * H;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      const bend1 = r.range(-0.22, 0.22) * len;
      const bend2 = r.range(-0.22, 0.22) * len;
      const at = (t: number, off: number) => {
        const it = 1 - t;
        const c1x = ax + (bx - ax) / 3 + nx * bend1;
        const c1y = ay + (by - ay) / 3 + ny * bend1;
        const c2x = ax + ((bx - ax) * 2) / 3 + nx * bend2;
        const c2y = ay + ((by - ay) * 2) / 3 + ny * bend2;
        const x = it * it * it * ax + 3 * it * it * t * c1x + 3 * it * t * t * c2x + t * t * t * bx;
        const y = it * it * it * ay + 3 * it * it * t * c1y + 3 * it * t * t * c2y + t * t * t * by;
        return { x: x + nx * off, y: y + ny * off };
      };
      // a soft glow along the whole thread, then fibres that thin out mid-way
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let k = 0; k <= 30; k++) {
          const pt = at(k / 30, 0);
          if (k === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = css(C.webViolet, pass ? 0.03 : 0.018);
        ctx.lineWidth = pass ? 9 : 22;
        ctx.stroke();
      }
      for (let fib = 0; fib < 7; fib++) {
        const base = r.range(-7, 7);
        const ph = r.range(0, 6.28);
        const col = mix(C.webViolet, C.rose, r.next() * 0.35);
        const wdt = r.range(0.6, 1.8);
        let prev = at(0, base);
        for (let k = 1; k <= 40; k++) {
          const t = k / 40;
          const pt = at(t, base + Math.sin(t * 9 + ph) * 3);
          const thin = 0.35 + 0.65 * Math.abs(Math.cos(Math.PI * t));
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.strokeStyle = css(col, 0.09 * thin * (0.5 + 0.5 * Math.sin(t * 13 + ph * 2)));
          ctx.lineWidth = wdt;
          ctx.stroke();
          prev = pt;
        }
      }
    });
    applyGrain(ctx, null, W, H, 0.3);
    threads.push(toTexture(pc, { label: 'cosmos-web-' + part }));
  }
  const pcN = makeCanvas(W, H);
  for (const n of graph.nodes) {
    const g = pcN.ctx.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, 26);
    g.addColorStop(0, css(lighten(C.webViolet, 0.35), 0.5));
    g.addColorStop(1, css(C.webViolet, 0));
    pcN.ctx.fillStyle = g;
    pcN.ctx.fillRect(n.x * W - 30, n.y * H - 30, 60, 60);
  }
  return { threads, nodes: toTexture(pcN, { label: 'cosmos-web-nodes' }), graph };
}

// ---- build ------------------------------------------------------------------------------------------

export async function buildCosmosTextures(seed: number, lowPower: boolean): Promise<CosmosTextures> {
  const all: Texture[] = [];
  const T = (pc: PaintCanvas, label: string, repeat: false | 'x' | 'xy' = false) => {
    const t = toTexture(pc, { label, repeat });
    all.push(t);
    return t;
  };
  const keep = (t: Texture) => {
    all.push(t);
    return t;
  };
  const r = new Rng(seed ^ 0x51);
  const big = lowPower ? 512 : 1024;

  // stars and glows
  const glow = keep(glowTexture(128, [244, 236, 226], 0.5, 'cosmos-glow'));
  const glowSoft = keep(glowTexture(256, [236, 230, 240], 0.85, 'cosmos-glow-soft'));
  const dotPc = makeCanvas(32, 32);
  radial(dotPc, [
    [0, [250, 246, 238], 1],
    [0.18, [246, 240, 230], 0.9],
    [0.45, [236, 230, 240], 0.25],
    [1, [236, 230, 240], 0],
  ]);
  const dot = T(dotPc, 'cosmos-dot');

  // the Big Bang's bloom: a drop of colour on wet paper
  const bl = makeCanvas(big, big);
  {
    const c = big / 2;
    // painted for additive blending: soft-edged layers, no dark drying edge
    const glowWash = (rad: number, col: RGB, a: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const k = 1 - i / (n + 1);
        const pts = blobPoints(c + r.range(-0.06, 0.06) * rad, c + r.range(-0.06, 0.06) * rad, rad * k, rad * k * r.range(0.85, 1), r, { lumps: 0.3, wobble: 0.05, n: 44, rotation: r.range(0, TAU) });
        const g = bl.ctx.createRadialGradient(c, c, 0, c, c, rad * k);
        g.addColorStop(0, css(col, a));
        g.addColorStop(0.75, css(col, a * 0.7));
        g.addColorStop(1, css(col, a * 0.15));
        bl.ctx.fillStyle = g;
        bl.ctx.fill(smoothPath(pts));
      }
    };
    glowWash(big * 0.49, C.roseDeep, 0.1, 8);
    glowWash(big * 0.4, C.rose, 0.1, 8);
    glowWash(big * 0.3, C.ember, 0.13, 8);
    glowWash(big * 0.17, C.emberCore, 0.15, 6);
    applyGrain(bl.ctx, null, big, big, 0.12);
  }
  const bloom = T(bl, 'cosmos-bloom');
  const fog = T(paintFog(seed), 'cosmos-fog', 'xy');

  // the first light's mottled pattern
  const cm = makeCanvas(512, 256);
  for (let i = 0; i < 260; i++) {
    const warmth = r.next();
    const col = warmth > 0.5 ? mix(C.ember, C.rose, r.next()) : mix(C.teal, C.webViolet, r.next());
    const x = r.next() * 512;
    const y = r.next() * 256;
    const rad = r.range(8, 34);
    const g = cm.ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, css(col, 0.22));
    g.addColorStop(1, css(col, 0));
    cm.ctx.fillStyle = g;
    cm.ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const cmb = T(cm, 'cosmos-cmb');

  // milky band (stars that lit long ago) and a passing dust lane
  const bd = makeCanvas(1024, 256);
  {
    const g = bd.ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, css(C.webViolet, 0));
    g.addColorStop(0.5, css(lighten(C.webViolet, 0.3), 0.32));
    g.addColorStop(1, css(C.webViolet, 0));
    bd.ctx.fillStyle = g;
    bd.ctx.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 30; i++) wash(bd.ctx, r.range(0, 1024), r.range(90, 166), r.range(40, 120), r.range(14, 34), mix(C.webViolet, C.rose, r.next() * 0.4), 0.1, r, 2);
    speckle(bd.ctx, 1024, 256, 1600, [236, 230, 244], r, 1.1, 0.6, (_x, y) => Math.abs(y - 128) < 70 + r.next() * 40);
  }
  const band = T(bd, 'cosmos-band');
  const dl = makeCanvas(1024, 192);
  for (let i = 0; i < 24; i++) wash(dl.ctx, r.range(0, 1024), r.range(60, 132), r.range(50, 160), r.range(12, 30), mix(C.dust, C.abyss, r.next() * 0.4), 0.16, r, 2);
  const dustLane = T(dl, 'cosmos-dust-lane');

  // ionised bubble, supernova shell, remnant wisps
  const bu = makeCanvas(256, 256);
  radial(bu, [
    [0, C.teal, 0.1],
    [0.6, C.teal, 0.11],
    [0.85, lighten(C.teal, 0.1), 0.13],
    [1, C.teal, 0],
  ]);
  const bubble = T(bu, 'cosmos-bubble');
  const sh = makeCanvas(512, 512);
  {
    const c = 256;
    for (let i = 0; i < 160; i++) {
      const a = r.next() * TAU;
      const rad = r.range(176, 238);
      sh.ctx.beginPath();
      sh.ctx.arc(c, c, rad, a, a + r.range(0.15, 0.7));
      sh.ctx.strokeStyle = css([246, 240, 236], r.range(0.03, 0.1));
      sh.ctx.lineWidth = r.range(3, 16);
      sh.ctx.stroke();
    }
    radial(sh, [
      [0.7, [246, 240, 236], 0],
      [0.88, [246, 240, 236], 0.16],
      [1, [246, 240, 236], 0],
    ]);
  }
  const shell = T(sh, 'cosmos-shell');
  const rm = makeCanvas(256, 256);
  for (let i = 0; i < 16; i++) wash(rm.ctx, 128 + r.range(-50, 50), 128 + r.range(-50, 50), r.range(30, 70), r.range(18, 50), [236, 228, 236], 0.07, r, 2);
  const remnant = T(rm, 'cosmos-remnant');

  // nebulae: painted for their region box; A has a tail toward the bottom right
  // each colour keeps to its own part of the cloud (a rose core, teal toward the edge, sparse gold
  // dust), so where they overlap they glow instead of greying out
  const neb = (w: number, h: number, spine: Pt[], cols: RGB[], label: string, sizes: [number, number], shift: Pt) =>
    cols.map((col, li) => {
      const pc = makeCanvas(w, h);
      const rr = new Rng(seed ^ (0x900 + li * 17 + label.length));
      const off = li === 1 ? shift : { x: 0, y: 0 };
      const scale = li === 0 ? 0.85 : li === 1 ? 1.05 : 0.6;
      spine.forEach((p, i) => {
        if (li === 2 && i % 2) return;
        const k = (0.7 + 0.5 * Math.sin(i * 1.7 + li)) * scale;
        const px0 = (p.x + off.x * (0.5 + 0.5 * Math.sin(i * 2.3))) * w;
        const py0 = (p.y + off.y) * h;
        wash(pc.ctx, px0 + rr.range(-20, 20), py0 + rr.range(-20, 20), sizes[0] * k * w, sizes[1] * k * h, col, li === 2 ? 0.07 : 0.12, rr, 3);
      });
      if (li === 2) speckle(pc.ctx, w, h, 700, lighten(C.gold, 0.3), rr, 1.3, 0.6);
      applyGrain(pc.ctx, null, w, h, 0.18);
      feather(pc, 0.18);
      return T(pc, `${label}-${li}`);
    });
  const spineA: Pt[] = [
    { x: 0.32, y: 0.12 },
    { x: 0.42, y: 0.25 },
    { x: 0.38, y: 0.4 },
    { x: 0.45, y: 0.52 },
    { x: 0.55, y: 0.64 },
    { x: 0.7, y: 0.76 },
    { x: 0.86, y: 0.86 },
    { x: 0.97, y: 0.9 },
  ];
  const nebulaA = neb(512, 640, spineA, [C.rose, C.teal, C.gold], 'cosmos-nebA', [0.36, 0.17], { x: -0.16, y: 0.04 });
  const spineB: Pt[] = [
    { x: 0.62, y: 0.2 },
    { x: 0.52, y: 0.38 },
    { x: 0.6, y: 0.55 },
    { x: 0.44, y: 0.68 },
    { x: 0.66, y: 0.8 },
  ];
  const nebulaB = neb(512, 512, spineB, [C.teal, C.rose, C.gold], 'cosmos-nebB', [0.34, 0.2], { x: 0.14, y: -0.05 });
  const la = makeCanvas(512, 640);
  {
    const rr = new Rng(seed ^ 0x1a);
    // dark dust lanes: wide, faint, dry-brushed along the cloud's length (never a single stroke)
    la.ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const p = spineA[2 + i];
      const q = spineA[3 + i];
      const x0 = p.x * 512 + rr.range(-30, 30);
      const y0 = p.y * 640 + rr.range(-20, 20);
      const x1 = q.x * 512 + rr.range(-30, 30);
      const y1 = q.y * 640 + rr.range(-20, 20);
      const cx = (x0 + x1) / 2 + rr.range(-40, 40);
      const cy = (y0 + y1) / 2 + rr.range(-40, 40);
      for (let k = 0; k < 14; k++) {
        const j = rr.range(-12, 12);
        la.ctx.beginPath();
        la.ctx.moveTo(x0 + j, y0 + j * 0.5);
        la.ctx.quadraticCurveTo(cx + j, cy - j, x1 + j * 0.6, y1 + j);
        la.ctx.strokeStyle = css(mix(C.abyss, C.dust, 0.3), rr.range(0.03, 0.07));
        la.ctx.lineWidth = rr.range(10, 34);
        la.ctx.stroke();
      }
    }
    applyGrain(la.ctx, null, 512, 640, 0.4);
    feather(la, 0.2);
  }
  const lanesA = T(la, 'cosmos-lanes');

  // the protoplanetary disk (seen face-on; the scene flattens it)
  const dk = makeCanvas(512, 512);
  radial(dk, [
    [0, C.emberCore, 0],
    [0.12, C.ember, 0.4],
    [0.4, mix(C.ember, C.rose, 0.5), 0.3],
    [0.75, C.roseDeep, 0.16],
    [1, C.roseDeep, 0],
  ]);
  for (let i = 0; i < 160; i++) {
    const a = r.next() * TAU;
    dk.ctx.beginPath();
    dk.ctx.arc(256, 256, r.range(40, 240), a, a + r.range(0.3, 1.4));
    dk.ctx.strokeStyle = css(lighten(C.ember, 0.2), r.range(0.03, 0.1));
    dk.ctx.lineWidth = r.range(1, 5);
    dk.ctx.stroke();
  }
  const disk = T(dk, 'cosmos-disk');
  const db = makeCanvas(512, 512);
  for (const [rad, wdt, a] of [
    [70, 16, 0.4],
    [120, 22, 0.32],
    [170, 12, 0.3],
    [205, 18, 0.26],
  ] as const) {
    for (let i = 0; i < 30; i++) {
      const s = r.next() * TAU;
      db.ctx.beginPath();
      db.ctx.arc(256, 256, rad + r.range(-wdt / 2, wdt / 2), s, s + r.range(0.4, 1.6));
      db.ctx.strokeStyle = css(mix(C.ember, C.gold, r.next()), a * r.range(0.4, 1));
      db.ctx.lineWidth = r.range(2, 6);
      db.ctx.stroke();
    }
  }
  const diskBands = T(db, 'cosmos-disk-bands');
  const be = makeCanvas(512, 512);
  for (let i = 0; i < 700; i++) {
    const a = r.next() * TAU;
    const rad = 236 + r.soft() * 10;
    be.ctx.fillStyle = css(mix(C.crust, C.gold, r.next() * 0.5), r.range(0.3, 0.8));
    be.ctx.beginPath();
    be.ctx.arc(256 + Math.cos(a) * rad, 256 + Math.sin(a) * rad, r.range(0.6, 1.8), 0, TAU);
    be.ctx.fill();
  }
  const belt = T(be, 'cosmos-belt');
  const rg = makeCanvas(512, 512);
  for (const [rad, wdt, a, col] of [
    [170, 26, 0.5, C.gold],
    [205, 30, 0.38, lighten(C.crust, 0.3)],
    [238, 12, 0.3, C.gold],
  ] as const) {
    rg.ctx.beginPath();
    rg.ctx.arc(256, 256, rad, 0, TAU);
    rg.ctx.strokeStyle = css(col, a);
    rg.ctx.lineWidth = wdt;
    rg.ctx.stroke();
  }
  const ring = T(rg, 'cosmos-ring');

  // planets: shading, masks and maps
  // the night half of a sphere lit from +x, with a curved, soft terminator
  const nightShape = (ctx: CanvasRenderingContext2D, color: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, TAU);
    ctx.clip();
    ctx.filter = 'blur(7px)';
    ctx.fillStyle = color;
    ctx.beginPath();
    // the far (left) half and an ellipse bulging into the lit side: a gibbous day side
    ctx.arc(128, 128, 140, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.ellipse(128, 128, 30, 140, 0, (Math.PI * 3) / 2, Math.PI / 2);
    ctx.fill();
    ctx.restore();
  };
  const shPc = makeCanvas(256, 256);
  {
    nightShape(shPc.ctx, css([16, 18, 44], 0.84));
    // a warm sheen on the day side
    const g = shPc.ctx.createRadialGradient(200, 112, 0, 200, 112, 120);
    g.addColorStop(0, css([255, 240, 220], 0.14));
    g.addColorStop(1, css([255, 240, 220], 0));
    shPc.ctx.save();
    shPc.ctx.beginPath();
    shPc.ctx.arc(128, 128, 127, 0, TAU);
    shPc.ctx.clip();
    shPc.ctx.fillStyle = g;
    shPc.ctx.fillRect(0, 0, 256, 256);
    shPc.ctx.restore();
    // limb darkening
    const lg = shPc.ctx.createRadialGradient(150, 118, 60, 128, 128, 128);
    lg.addColorStop(0, css([10, 10, 30], 0));
    lg.addColorStop(1, css([10, 10, 30], 0.42));
    shPc.ctx.fillStyle = lg;
    shPc.ctx.beginPath();
    shPc.ctx.arc(128, 128, 127, 0, TAU);
    shPc.ctx.fill();
  }
  const shadeTex = T(shPc, 'cosmos-shade');
  const ni = makeCanvas(256, 256);
  nightShape(ni.ctx, '#ffffff');
  const night = T(ni, 'cosmos-night');
  const ci = makeCanvas(256, 256);
  ci.ctx.fillStyle = '#fff';
  ci.ctx.beginPath();
  ci.ctx.arc(128, 128, 126, 0, TAU);
  ci.ctx.fill();
  const circle = T(ci, 'cosmos-circle');
  const ri = makeCanvas(256, 256);
  radial(ri, [
    [0.82, [190, 220, 255], 0],
    [0.92, [190, 220, 255], 0.55],
    [0.97, [190, 220, 255], 0.2],
    [1, [190, 220, 255], 0],
  ]);
  const rim = T(ri, 'cosmos-rim');

  const ps = seed ^ 0x4e7;
  const land = (n: number) => n > 0.5;
  const baseF = fbmField(ps, MAP_W, MAP_H, 6, 5, 2);
  const crackF = fbmField(ps + 9, MAP_W, MAP_H, 10, 3, 2);
  const cloudF = fbmField(ps + 77, MAP_W, MAP_H, 5, 5, 2);
  const magma = T(
    paintMap(baseF, (n, lat, i) => {
      const crack = Math.abs(crackF[i] - 0.5) < 0.035;
      const base = mix(C.crustDark, [40, 28, 34], 1 - n);
      return crack ? rgb(mix(C.magma, C.ember, n)) : rgb(shade(base, Math.abs(lat) * 0.2));
    }),
    'cosmos-map-magma',
    'x',
  );
  const crust = T(
    paintMap(baseF, (n, lat) => rgb(shade(mix(C.crustDark, C.crust, Math.max(0, Math.min(1, n * 1.4 - 0.2))), Math.abs(lat) * 0.15))),
    'cosmos-map-crust',
    'x',
  );
  const oceans = [0.36, 0.46, 0.53].map((lvl, i) =>
    T(
      paintMap(baseF, (n, lat) => {
        const depth = Math.max(0, lvl - n);
        const a = n < lvl ? Math.min(1, 0.55 + depth * 6) : 0;
        return rgb(mix(C.ocean, C.oceanDeep, Math.min(1, depth * 4 + Math.abs(lat) * 0.2)), Math.round(a * 255));
      }),
      `cosmos-map-ocean-${i}`,
      'x',
    ),
  );
  const green = T(
    paintMap(baseF, (n, lat) => {
      const coast = n >= 0.53 && n < 0.72;
      const a = land(n + 0.03) && Math.abs(lat) < 0.78 ? (coast ? 0.9 : 0.55) : 0;
      return rgb(mix(C.green, [92, 120, 76], Math.min(1, (n - 0.53) * 3)), Math.round(a * 255));
    }),
    'cosmos-map-green',
    'x',
  );
  const clouds = T(
    paintMap(cloudF, (c, lat) => {
      const band = 0.5 + 0.5 * Math.sin(lat * 7.5);
      // soft polar caps (a ramp, never a straight edge)
      const cap = Math.max(0, Math.min(1, (Math.abs(lat) - 0.74) / 0.2)) * (0.45 + 0.35 * c);
      const a = Math.max(0, Math.min(1, (c * 0.8 + band * 0.25 - 0.55) * 2.4)) + cap;
      return rgb(C.cloud, Math.round(Math.min(1, a) * 235));
    }),
    'cosmos-map-clouds',
    'x',
  );
  const lightsMap = (count: number, salt: number, size: [number, number], coast: [number, number]) => {
    const pc = makeCanvas(512, 256);
    const rr = new Rng(ps ^ salt);
    let placed = 0;
    for (let i = 0; i < 40000 && placed < count; i++) {
      const x = rr.next() * 512;
      const y = 40 + rr.next() * 176;
      const n = baseF[Math.floor(y) * MAP_W + Math.floor(x)];
      if (!(n > coast[0] && n < coast[1])) continue;
      const rad = rr.range(size[0], size[1]);
      const g = pc.ctx.createRadialGradient(x, y, 0, x, y, rad * 2.4);
      g.addColorStop(0, css(lighten(C.gold, 0.35), 1));
      g.addColorStop(0.35, css(C.gold, 0.8));
      g.addColorStop(1, css(C.ember, 0));
      pc.ctx.fillStyle = g;
      pc.ctx.fillRect(x - rad * 2.4, y - rad * 2.4, rad * 4.8, rad * 4.8);
      placed++;
    }
    return T(pc, 'cosmos-map-lights-' + salt, 'x');
  };
  // the first few along the coasts, then towns spreading inland
  const lightsFew = lightsMap(36, 0x11, [2.2, 3.2], [0.53, 0.58]);
  const lights = lightsMap(420, 0x12, [1.4, 2.6], [0.53, 0.7]);

  const planetDisc = (size: number, paint: (pc: PaintCanvas, rr: Rng) => void, label: string) => {
    const pc = makeCanvas(size, size);
    const rr = new Rng(seed ^ label.length);
    pc.ctx.save();
    pc.ctx.beginPath();
    pc.ctx.arc(size / 2, size / 2, size / 2 - 1, 0, TAU);
    pc.ctx.clip();
    paint(pc, rr);
    pc.ctx.restore();
    return T(pc, label);
  };
  const giant = planetDisc(
    256,
    (pc, rr) => {
      const cols = [mix(C.gold, C.ember, 0.3), lighten(C.gold, 0.25), mix(C.crust, C.gold, 0.5), mix(C.ember, C.rose, 0.3), lighten(C.gold, 0.1)];
      let y = 0;
      while (y < 256) {
        const h = rr.range(10, 28);
        pc.ctx.fillStyle = css(cols[Math.floor(rr.next() * cols.length)], 1);
        pc.ctx.fillRect(0, y, 256, h + 2);
        y += h;
      }
      for (let i = 0; i < 40; i++) {
        pc.ctx.strokeStyle = css(lighten(C.gold, 0.4), 0.15);
        pc.ctx.lineWidth = rr.range(1, 4);
        const yy = rr.range(0, 256);
        pc.ctx.beginPath();
        pc.ctx.moveTo(0, yy);
        pc.ctx.bezierCurveTo(80, yy + rr.range(-6, 6), 170, yy + rr.range(-6, 6), 256, yy);
        pc.ctx.stroke();
      }
      applyGrain(pc.ctx, null, 256, 256, 0.35);
    },
    'cosmos-giant',
  );
  const inner = planetDisc(
    96,
    (pc, rr) => {
      pc.ctx.fillStyle = css(mix(C.crust, C.redStar, 0.25));
      pc.ctx.fillRect(0, 0, 96, 96);
      speckle(pc.ctx, 96, 96, 60, C.crustDark, rr, 5, 0.5);
      applyGrain(pc.ctx, null, 96, 96, 0.4);
    },
    'cosmos-inner',
  );
  const moon = planetDisc(
    64,
    (pc, rr) => {
      pc.ctx.fillStyle = css([170, 168, 176]);
      pc.ctx.fillRect(0, 0, 64, 64);
      speckle(pc.ctx, 64, 64, 30, [120, 118, 130], rr, 4, 0.5);
    },
    'cosmos-moon',
  );

  // galaxies
  const gd = makeCanvas(512, 512);
  radial(gd, [
    [0, C.emberCore, 0.95],
    [0.08, C.gold, 0.75],
    [0.3, mix(C.gold, C.webViolet, 0.6), 0.28],
    [0.7, C.webViolet, 0.1],
    [1, C.webViolet, 0],
  ]);
  const galaxyDisk = T(gd, 'cosmos-galaxy-disk');
  const ga = makeCanvas(512, 512);
  {
    const rr = new Rng(seed ^ 0x6a1);
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 900; i++) {
        const t = rr.next();
        const th = arm * Math.PI + t * 3.1 + rr.soft() * 0.26;
        const rad = 18 + t * 190;
        const x = 256 + Math.cos(th) * rad;
        const y = 256 + Math.sin(th) * rad;
        const col = rr.next() < 0.25 ? C.rose : rr.next() < 0.5 ? lighten(C.firstStar, 0.1) : lighten(C.webViolet, 0.4);
        ga.ctx.fillStyle = css(col, rr.range(0.06, 0.3) * (1 - t * 0.85));
        ga.ctx.beginPath();
        ga.ctx.arc(x, y, rr.range(1.5, 9) * (1 - t * 0.6), 0, TAU);
        ga.ctx.fill();
      }
      // a dust lane along the inner edge of the arm
      ga.ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.02) {
        const th = arm * Math.PI + t * 3.4 - 0.18;
        const rad = 24 + t * 200;
        const x = 256 + Math.cos(th) * rad;
        const y = 256 + Math.sin(th) * rad;
        if (t === 0) ga.ctx.moveTo(x, y);
        else ga.ctx.lineTo(x, y);
      }
      ga.ctx.strokeStyle = css(mix(C.abyss, C.dust, 0.3), 0.32);
      ga.ctx.lineWidth = 6;
      ga.ctx.stroke();
    }
    speckle(ga.ctx, 512, 512, 500, [240, 236, 248], rr, 1.2, 0.6, (x, y) => Math.hypot(x - 256, y - 256) < 230);
  }
  const galaxyArms = T(ga, 'cosmos-galaxy-arms');
  const bb = makeCanvas(128, 128);
  wash(bb.ctx, 64, 64, 54, 46, mix(C.gold, C.webViolet, 0.5), 0.3, r, 4);
  radial(bb, [
    [0, C.gold, 0.5],
    [0.4, C.gold, 0.1],
    [1, C.gold, 0],
  ]);
  const blob = T(bb, 'cosmos-blob');
  const nb = makeCanvas(256, 256);
  radial(nb, [
    [0, C.emberCore, 0.8],
    [0.15, mix(C.gold, C.rose, 0.4), 0.4],
    [0.6, C.roseDeep, 0.12],
    [1, C.roseDeep, 0],
  ]);
  {
    const rr = new Rng(seed ^ 0x2b);
    for (let i = 0; i < 400; i++) {
      const t = rr.next();
      const arm = i % 2;
      const th = arm * Math.PI + t * 2.8;
      const rad = 10 + t * 100;
      nb.ctx.fillStyle = css(lighten(C.rose, 0.3), 0.12 * (1 - t * 0.5));
      nb.ctx.beginPath();
      nb.ctx.arc(128 + Math.cos(th) * rad, 128 + Math.sin(th) * rad, rr.range(1.5, 5), 0, TAU);
      nb.ctx.fill();
    }
  }
  const neighbour = T(nb, 'cosmos-neighbour');

  // comets, streaks, jets, flare arcs, pulsar beams
  const co = makeCanvas(64, 64);
  radial(co, [
    [0, [250, 248, 240], 1],
    [0.25, C.cloud, 0.6],
    [1, C.teal, 0],
  ]);
  const comet = T(co, 'cosmos-comet');
  const tl = makeCanvas(512, 128);
  {
    // a curved, fanning dust tail from the left edge (head) to the right
    for (let i = 0; i < 26; i++) {
      tl.ctx.beginPath();
      tl.ctx.moveTo(0, 64);
      const spread = r.range(-1, 1);
      tl.ctx.quadraticCurveTo(220, 64 + spread * 14, 512, 64 + spread * 48 + 18);
      tl.ctx.strokeStyle = css(mix(C.gold, C.ember, r.next()), r.range(0.03, 0.08));
      tl.ctx.lineWidth = r.range(6, 22);
      tl.ctx.stroke();
    }
    const fade = tl.ctx.createLinearGradient(0, 0, 512, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    tl.ctx.globalCompositeOperation = 'destination-out';
    tl.ctx.fillStyle = fade;
    tl.ctx.fillRect(0, 0, 512, 128);
  }
  const tail = T(tl, 'cosmos-tail');
  const it = makeCanvas(512, 32);
  {
    const g = it.ctx.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, css(lighten(C.teal, 0.3), 0.7));
    g.addColorStop(1, css(C.teal, 0));
    it.ctx.fillStyle = g;
    it.ctx.fillRect(0, 13, 512, 6);
    it.ctx.fillStyle = css(lighten(C.teal, 0.2), 0.25);
    it.ctx.fillRect(0, 10, 360, 12);
  }
  const ionTail = T(it, 'cosmos-ion-tail');
  const st = makeCanvas(128, 8);
  {
    const g = st.ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, css([250, 246, 236], 0));
    g.addColorStop(0.85, css([250, 246, 236], 0.9));
    g.addColorStop(1, css([250, 246, 236], 0));
    st.ctx.fillStyle = g;
    st.ctx.fillRect(0, 3, 128, 2);
  }
  const streak = T(st, 'cosmos-streak');
  const jt = makeCanvas(32, 256);
  {
    const g = jt.ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, css(lighten(C.teal, 0.4), 0.8));
    g.addColorStop(1, css(C.teal, 0));
    jt.ctx.fillStyle = g;
    jt.ctx.beginPath();
    jt.ctx.moveTo(16 - 3, 256);
    jt.ctx.lineTo(16 + 3, 256);
    jt.ctx.lineTo(16 + 8, 0);
    jt.ctx.lineTo(16 - 8, 0);
    jt.ctx.fill();
  }
  const jet = T(jt, 'cosmos-jet');
  const ar = makeCanvas(128, 96);
  {
    for (let i = 0; i < 6; i++) {
      ar.ctx.beginPath();
      ar.ctx.ellipse(64, 92, 36 + i * 2, 70 - i * 3, 0, Math.PI, TAU);
      ar.ctx.strokeStyle = css(mix(C.ember, C.magma, i / 6), 0.25);
      ar.ctx.lineWidth = 5 - i * 0.5;
      ar.ctx.stroke();
    }
  }
  const arc = T(ar, 'cosmos-arc');
  const bm = makeCanvas(256, 64);
  {
    const g = bm.ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, css(C.firstStar, 0));
    g.addColorStop(0.5, css(C.firstStar, 0.55));
    g.addColorStop(1, css(C.firstStar, 0));
    bm.ctx.fillStyle = g;
    bm.ctx.beginPath();
    bm.ctx.moveTo(0, 26);
    bm.ctx.lineTo(128, 31);
    bm.ctx.lineTo(256, 26);
    bm.ctx.lineTo(256, 38);
    bm.ctx.lineTo(128, 33);
    bm.ctx.lineTo(0, 38);
    bm.ctx.fill();
  }
  const beam = T(bm, 'cosmos-beam');

  const paper = T(paintPaper(seed ^ 0x99, [140, 130, 160]), 'cosmos-paper', 'xy');
  const vg = makeCanvas(512, 512);
  radial(vg, [
    [0, C.abyss, 0],
    [0.7, C.abyss, 0],
    [1, [6, 5, 16], 0.5],
  ]);
  const vignette = T(vg, 'cosmos-vignette');
  const ve = makeCanvas(256, 256);
  radial(ve, [
    [0, [10, 8, 22], 0.85],
    [0.45, [10, 8, 22], 0.55],
    [0.8, [10, 8, 22], 0.18],
    [1, [10, 8, 22], 0],
  ]);
  const veil = T(ve, 'cosmos-veil');
  const lp = makeCanvas(256, 256);
  radial(lp, [
    [0, [246, 240, 236], 0],
    [0.72, [246, 240, 236], 0],
    [0.84, [246, 240, 236], 0.85],
    [0.9, [246, 240, 236], 0.25],
    [1, [246, 240, 236], 0],
  ]);
  const loop = T(lp, 'cosmos-loop');
  const sd = makeCanvas(128, 128);
  radial(sd, [
    [0, [246, 240, 236], 0.08],
    [0.6, [246, 240, 236], 0.18],
    [0.86, [246, 240, 236], 0.7],
    [1, [246, 240, 236], 0],
  ]);
  const shield = T(sd, 'cosmos-shield');

  return {
    glow,
    glowSoft,
    dot,
    bloom,
    fog,
    cmb,
    band,
    dustLane,
    bubble,
    loop,
    shield,
    shell,
    remnant,
    nebulaA,
    nebulaB,
    lanesA,
    disk,
    diskBands,
    belt,
    ring,
    shade: shadeTex,
    night,
    circle,
    rim,
    magma,
    crust,
    oceans,
    green,
    clouds,
    lights,
    lightsFew,
    giant,
    inner,
    moon,
    galaxyDisk,
    galaxyArms,
    blob,
    neighbour,
    comet,
    tail,
    ionTail,
    streak,
    jet,
    arc,
    beam,
    paper,
    vignette,
    veil,
    web: {},
    all,
  };
}

/** The cosmic web for one aspect (painted on first use). */
export function webFor(tex: CosmosTextures, key: string, L: CosmosLayout, seed: number, w: number, h: number): WebTextures {
  let wt = tex.web[key];
  if (!wt) {
    wt = paintWeb(L, seed, w, h);
    tex.web[key] = wt;
    tex.all.push(...wt.threads, wt.nodes);
  }
  return wt;
}

export function releaseCosmosTextures(tex: CosmosTextures) {
  for (const t of tex.all) releaseTexture(t);
  tex.all.length = 0;
}
