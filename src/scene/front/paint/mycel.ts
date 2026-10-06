/**
 * 균사 군체 — a planet-wide web of fungus and coral, not hostile, just growing: round bulbs, coral
 * branches, mushroom caps, translucent membranes, ivory shell plates and glowing lime pores
 * (FRONT_PROMPT.md 4.2절). Jade teal #3FA796, deep kelp #21423D, ivory shell #E9DFC7, pore light
 * #B8E06A. Its ships are living things: jellies swimming bell first, a spore whale and a drifting
 * coral island.
 */

import type { BuildingKind, UnitKind } from '../../../sim/frontPlan';
import { blobPoints, curvePts, gouache, softEllipse, taper } from '../../paint/brush';
import { css, lighten, mix, shade, type RGB } from '../../paint/color';
import { RACE_PAL } from '../palette';
import { footShadow, glow, line, orb, paint, plate, type Art, type Pen } from './kit';

const P = RACE_PAL[1];
const JADE = P.body;
const PALE = P.bodyLight;
const KELP = P.bodyDark;
const SHELL = P.accent;
const LIME = P.accent2;
const GLOW = P.glow;
const MEMB = mix(PALE, SHELL, 0.3);
const CORAL = mix(JADE, SHELL, 0.4);
const ROOT = mix(JADE, KELP, 0.55);
const HOLE = shade(KELP, 0.35, [12, 22, 20]);

type XY = [number, number];

/** A quadratic curve through art points. */
function bend(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n = 8): XY[] {
  return curvePts(x0, y0, cx, cy, x1, y1, n).map((q): XY => [q.x, q.y]);
}

/** A wavy strand from (x0, y0) along (dx, dy); the root stays put and the tip waves most. */
function wave(x0: number, y0: number, dx: number, dy: number, amp: number, phase: number, n = 8): XY[] {
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const out: XY[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = Math.sin(t * Math.PI * 2 + phase) * amp * t;
    out.push([x0 + dx * t + nx * s, y0 + dy * t + ny * s]);
  }
  return out;
}

/** A round growth: a gouache blob whose ink line follows its lumps. */
function bulb(pen: Pen, cx: number, cy: number, rx: number, ry: number, base: RGB, o: { lumps?: number; flat?: number; rot?: number; line?: number } = {}) {
  const c = pen.p(cx, cy);
  const pts = blobPoints(c.x, c.y, pen.u(rx), pen.u(ry), pen.r, { lumps: o.lumps ?? 0.05, flatBottom: o.flat ?? 0, wobble: 0.015, rotation: o.rot ?? 0 });
  const path = gouache(pen.ctx, pts, { base, r: pen.r, dabDensity: 12, roundness: 0.9, grain: 0.22, rimShadow: 0.28, rimLight: 0.24 });
  if ((o.line ?? 1) <= 0) return;
  const { ctx } = pen;
  ctx.save();
  ctx.strokeStyle = css(pen.ink, 0.75);
  ctx.lineWidth = pen.u(0.5 * (o.line ?? 1));
  ctx.stroke(path);
  ctx.restore();
}

/** A tapered stalk or coral branch along art points, inked, with a lit edge toward the light. */
function branch(pen: Pen, pts: XY[], w0: number, w1: number, color: RGB, o: { line?: number } = {}) {
  const path = taper(pen.ctx, pts.map(([x, y]) => pen.p(x, y)), pen.u(w0), pen.u(w1), color);
  if (!path) return;
  const { ctx } = pen;
  ctx.save();
  ctx.strokeStyle = css(pen.ink, 0.7);
  ctx.lineWidth = pen.u(0.4 * (o.line ?? 1));
  ctx.stroke(path);
  ctx.restore();
  const w = Math.min(w0, w1);
  if (w > 1) line(pen, pts.map(([x, y]): XY => [x - w * 0.18, y]), lighten(color, 0.3), w * 0.3, 0.55);
}

/** A thin tapered strand without ink (tendrils, roots, threads). */
function strand(pen: Pen, pts: XY[], w0: number, w1: number, color: RGB, alpha = 0.85) {
  taper(pen.ctx, pts.map(([x, y]) => pen.p(x, y)), pen.u(w0), pen.u(w1), color, alpha);
}

/** A wide soft glow (a lit belly, light through a membrane). */
function haze(pen: Pen, x: number, y: number, rx: number, ry: number, a: number) {
  const c = pen.p(x, y);
  softEllipse(pen.ctx, c.x, c.y, pen.u(rx), pen.u(ry), lighten(GLOW, 0.2), a, 0, 1);
}

/** A glowing pore. */
function pore(pen: Pen, x: number, y: number, r = 1) {
  glow(pen, x, y, r * 2.6, GLOW, 0.5);
  orb(pen, x, y, r, r * 0.8, lighten(LIME, 0.1), { line: 0.4, gloss: 1.4 });
}

/** A translucent membrane sac with a glowing core, a vein and a wet highlight. */
function sac(pen: Pen, cx: number, cy: number, rx: number, ry: number, o: { tint?: RGB; core?: number } = {}) {
  const m = Math.min(rx, ry);
  const tint = o.tint ?? MEMB;
  orb(pen, cx, cy, rx, ry, tint, { alpha: 0.8, gloss: 1.3, line: 0.8 });
  const kx = cx + rx * 0.08;
  const ky = cy + ry * 0.12;
  if (m > 3) line(pen, bend(cx - rx * 0.7, cy + ry * 0.3, cx - rx * 0.25, cy - ry * 0.1, kx, ky, 6), shade(tint, 0.35), 0.35, 0.45);
  glow(pen, kx, ky, m * (o.core ?? 0.75), GLOW, 0.75);
  orb(pen, kx, ky, m * 0.22, m * 0.22, lighten(LIME, 0.2), { line: 0 });
  orb(pen, cx - rx * 0.4, cy - ry * 0.45, rx * 0.22, ry * 0.13, lighten(SHELL, 0.6), { line: 0, alpha: 0.6 });
}

/** An upright egg pod resting at (x, y): ivory shell, a lit seam near the top, light inside. */
function egg(pen: Pen, x: number, y: number, rx: number, ry: number) {
  const cy = y - ry;
  orb(pen, x, cy, rx, ry, mix(SHELL, PALE, 0.3), { gloss: 1.1 });
  glow(pen, x + rx * 0.1, cy - ry * 0.15, rx * 0.95, GLOW, 0.5);
  line(pen, bend(x - rx * 0.55, cy - ry * 0.35, x, cy - ry * 0.6, x + rx * 0.55, cy - ry * 0.3, 6), LIME, 0.45, 0.85);
  orb(pen, x - rx * 0.38, cy - ry * 0.45, rx * 0.2, ry * 0.12, lighten(SHELL, 0.6), { line: 0, alpha: 0.6 });
}

/** A cocoon on a silk thread from (x, top): banded ivory with light showing through (`lit` 0..1). */
function cocoon(pen: Pen, x: number, top: number, cy: number, rx: number, ry: number, lit: number) {
  line(pen, [
    [x, top],
    [x, cy - ry * 0.9],
  ], lighten(SHELL, 0.2), 0.35, 0.8);
  glow(pen, x, cy, rx * 1.8, GLOW, 0.35 * lit);
  orb(pen, x, cy, rx, ry, mix(SHELL, PALE, 0.25), { gloss: 1.1 });
  for (const t of [-0.45, 0, 0.45]) {
    const hw = rx * 0.85 * Math.sqrt(1 - t * t);
    line(pen, [
      [x - hw, cy + ry * t],
      [x + hw, cy + ry * t + 0.4],
    ], shade(SHELL, 0.35), 0.35, 0.7);
  }
  glow(pen, x + rx * 0.15, cy + ry * 0.1, rx * 0.8, GLOW, 0.55 * lit);
}

/** Ivory shell ribs over a dome: tapered meridians from its rim (cy) up toward its crown. */
function ribs(pen: Pen, cx: number, cy: number, rx: number, ry: number, n: number, w: number, top = 0.8, color: RGB = SHELL) {
  for (let i = 0; i < n; i++) {
    const s = -0.86 + (1.72 * i) / (n - 1);
    const pts: XY[] = [];
    for (let j = 0; j <= 8; j++) {
      const v = (j / 8) * top * (Math.PI / 2);
      pts.push([cx + rx * s * Math.cos(v), cy - ry * Math.sin(v)]);
    }
    const c = mix(lighten(color, 0.15), shade(color, 0.3), (s + 1) / 2);
    branch(pen, pts, w * (1.15 - Math.abs(s) * 0.45), w * 0.45, c, { line: 0.8 });
  }
}

/** Glowing pores in the gaps between dome ribs, at height v (0 rim .. 1 crown). */
function gapPores(pen: Pen, cx: number, cy: number, rx: number, ry: number, n: number, v: number, r: number) {
  const a = (v * Math.PI) / 2;
  for (let i = 0; i < n - 1; i++) {
    const s = -0.86 + (1.72 * (i + 0.5)) / (n - 1);
    pore(pen, cx + rx * s * Math.cos(a), cy - ry * Math.sin(a), r * (1 - Math.abs(s) * 0.35));
  }
}

/** A mushroom cap whose rim sits at (x, y): dark gills beneath, a dome over them. */
function cap(pen: Pen, x: number, y: number, rx: number, ry: number, color: RGB) {
  orb(pen, x, y + ry * 0.25, rx * 0.92, ry * 0.45, shade(color, 0.45), { line: 0.6 });
  bulb(pen, x, y - ry * 0.25, rx, ry, color, { flat: 0.75, lumps: 0.03 });
}

/**
 * A jelly's bell: a translucent dome along `dir` ('up' or 'right') from its open side at (cx, cy),
 * `len` deep and `half` wide each way, with a glow inside and a wet highlight.
 */
function bell(pen: Pen, cx: number, cy: number, len: number, half: number, dir: 'up' | 'right', tint: RGB = MEMB) {
  const at = (u: number, v: number): XY => (dir === 'up' ? [cx + v, cy - u] : [cx + u, cy + v]);
  const pts: XY[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 12;
    pts.push(at(len * Math.cos(a), half * Math.sin(a)));
  }
  // the open side curves a little into the bell
  for (let i = 1; i < 6; i++) pts.push(at(len * 0.16 * Math.sin((Math.PI * i) / 6), half * (1 - (2 * i) / 6)));
  plate(pen, pts, tint, { alpha: 0.82, light: 0.6, dark: 0.35 });
  const m = Math.min(len, half);
  const [gx, gy] = at(len * 0.42, 0);
  glow(pen, gx, gy, m * 0.9, GLOW, 0.7);
  orb(pen, gx, gy, m * 0.22, m * 0.22, lighten(LIME, 0.2), { line: 0 });
  const [hx, hy] = dir === 'up' ? at(len * 0.68, -half * 0.42) : at(len * 0.4, -half * 0.6);
  orb(pen, hx, hy, m * 0.28, m * 0.16, lighten(SHELL, 0.6), { line: 0, alpha: 0.55 });
}

/** A small jointed leg from the hip (x, y) down to the ground, its foot shifted by `step`. */
function leg(pen: Pen, x: number, y: number, step: number, color: RGB, w: number) {
  line(pen, [
    [x, y],
    [x + step * 0.5 + 0.6, y * 0.45],
    [x + step, 0],
  ], color, w);
}

export const MYCEL_BUILDINGS: Record<BuildingKind, () => Art> = {
  hq: () =>
    paint(84, 66, 42, 60, 301, P.ink, (pen) => {
      footShadow(pen, 37, 5.8);
      // a bud behind on the right
      bulb(pen, 29, -11, 8, 8.5, mix(JADE, KELP, 0.25));
      pore(pen, 32, -14.5, 0.9);
      // the mound of roots it sits in
      bulb(pen, 0, -3, 34, 7, ROOT, { flat: 0.6, lumps: 0.08 });
      line(pen, bend(-30, -2, -22, -6, -14, -5, 6), LIME, 0.5, 0.5);
      line(pen, bend(14, -4.5, 22, -7, 30, -2.5, 6), LIME, 0.5, 0.5);
      // the mother bulb, half buried: ivory shell ribs, pores glowing between them
      bulb(pen, 0, -12, 28, 36, JADE, { flat: 0.88 });
      ribs(pen, 0, -12, 26, 34, 7, 3.4, 0.82);
      gapPores(pen, 0, -12, 26, 34, 7, 0.22, 1.2);
      gapPores(pen, 0, -12, 26, 34, 7, 0.55, 0.9);
      // the crown: an ivory rim around a breathing light
      orb(pen, 0, -46, 5.2, 2.6, SHELL);
      orb(pen, 0, -46.2, 3.4, 1.5, mix(LIME, KELP, 0.25), { line: 0.5 });
      glow(pen, 0, -47.5, 6, GLOW, 0.7);
      // a feeler with a lit tip
      branch(pen, bend(-33, -6, -37, -12, -36, -21), 2, 0.8, CORAL);
      pore(pen, -36, -21.5, 1.1);
      // food sacs at its feet
      sac(pen, -27, -5, 6.5, 5.5);
      sac(pen, -18, -2.8, 3.8, 3.2);
      sac(pen, 25, -4.5, 6, 5);
      sac(pen, 33.5, -2.6, 3.4, 3);
    }),
  outpost: () =>
    paint(62, 50, 31, 45, 302, P.ink, (pen) => {
      footShadow(pen, 27, 4.8);
      bulb(pen, 0, -2.5, 24, 5.5, ROOT, { flat: 0.6, lumps: 0.08 });
      // a young bulb, ribbed, its first shoot unfurling from the crown
      bulb(pen, 0, -9, 17, 23, JADE, { flat: 0.85 });
      ribs(pen, 0, -9, 15.5, 21.5, 5, 2.6, 0.78);
      gapPores(pen, 0, -9, 15.5, 21.5, 5, 0.3, 0.9);
      orb(pen, 0, -30.6, 3.6, 1.7, SHELL);
      branch(pen, bend(0, -31, -1, -36, 4, -39), 2.2, 1, CORAL);
      bulb(pen, 6, -39.5, 3.2, 1.8, PALE, { rot: -0.4 });
      pore(pen, 6.6, -40, 0.8);
      sac(pen, -18, -4, 5, 4.4);
      sac(pen, 17, -3, 3.6, 3.2);
    }),
  supply: () =>
    paint(40, 34, 20, 30, 303, P.ink, (pen) => {
      footShadow(pen, 17, 3.8);
      bulb(pen, 0, -1.5, 16, 3.2, ROOT, { flat: 0.5, lumps: 0.1 });
      strand(pen, [
        [-14, -0.5],
        [-18, 1],
      ], 0.8, 0.2, ROOT, 1);
      strand(pen, [
        [13, -0.5],
        [17.5, 1.5],
      ], 0.8, 0.2, ROOT, 1);
      // three nutrient sacs on a root pad, the big one behind
      sac(pen, -2, -12, 8.5, 10);
      sac(pen, -10.5, -6, 6, 5.8);
      sac(pen, 9, -6.5, 7, 6.6);
      orb(pen, -2.5, -22.2, 2, 1.2, JADE, { line: 0.5 });
    }),
  barracks: () =>
    paint(60, 44, 30, 40, 304, P.ink, (pen) => {
      footShadow(pen, 26, 3.8);
      // fronds behind
      branch(pen, bend(-22, -5, -26, -12, -25, -20), 2, 0.7, CORAL);
      pore(pen, -25, -20.6, 1);
      branch(pen, bend(23, -5, 27, -10, 26, -17), 1.8, 0.7, CORAL);
      pore(pen, 26, -17.6, 0.9);
      // a low mound and its clutch of egg pods, far ones first
      bulb(pen, 0, -4, 25, 9, mix(JADE, KELP, 0.4), { flat: 0.7 });
      egg(pen, 1, -11, 5.5, 9);
      egg(pen, -9, -9, 5, 7.5);
      egg(pen, 11, -8, 5, 7);
      egg(pen, -18, -5, 4.5, 6);
      egg(pen, 19.5, -4, 4, 5.5);
      egg(pen, -4, -2, 3.4, 4.2);
      egg(pen, 7, -1.5, 3, 3.8);
      pore(pen, -11.5, -2, 0.8);
      pore(pen, 14, -2.4, 0.7);
    }),
  gas: () =>
    paint(34, 56, 17, 52, 305, P.ink, (pen) => {
      footShadow(pen, 14, 3.8);
      // broad petals lying over the vent, its heat leaking out between them
      haze(pen, 0, -2, 9, 5, 0.45);
      bulb(pen, -7, -2, 7, 2.8, mix(JADE, KELP, 0.2), { rot: 0.12 });
      bulb(pen, 7, -2, 7, 2.8, mix(JADE, KELP, 0.3), { rot: -0.12 });
      glow(pen, 0, -2.4, 4, GLOW, 0.6);
      // the stalk and its leaves
      branch(pen, bend(0, -2, -3.5, -17, 1, -30), 4, 2.4, JADE);
      bulb(pen, -6, -13, 6, 2.2, PALE, { rot: 0.45 });
      line(pen, [
        [-1.5, -11],
        [-10, -15.4],
      ], shade(PALE, 0.35), 0.4, 0.7);
      bulb(pen, 6, -21, 6, 2.2, PALE, { rot: -0.45 });
      line(pen, [
        [1.5, -19],
        [10, -23.4],
      ], shade(PALE, 0.35), 0.4, 0.7);
      // the open bloom drinking the heat
      bulb(pen, -5.5, -36.5, 2.6, 5.5, mix(SHELL, PALE, 0.45), { rot: -0.7 });
      bulb(pen, 7.5, -36.5, 2.6, 5.5, mix(SHELL, PALE, 0.5), { rot: 0.7 });
      bulb(pen, 1, -39, 2.6, 5.8, mix(SHELL, PALE, 0.35));
      orb(pen, 1, -33.5, 5.2, 2.4, mix(LIME, KELP, 0.25));
      glow(pen, 1, -34.5, 5.5, GLOW, 0.75);
      bulb(pen, -4.5, -31.5, 5.2, 2.6, SHELL, { rot: 0.35 });
      bulb(pen, 6.5, -31.5, 5.2, 2.6, SHELL, { rot: -0.35 });
      bulb(pen, 1, -30, 4.6, 2.6, lighten(SHELL, 0.1));
      // motes rising
      pore(pen, 4, -46, 0.8);
      pore(pen, -3, -48.5, 0.6);
    }),
  wall: () =>
    paint(48, 20, 24, 16, 306, P.ink, (pen) => {
      footShadow(pen, 21, 3);
      bulb(pen, 0, -2, 19, 3.4, ROOT, { flat: 0.5, lumps: 0.08 });
      // a row of spiky coral tentacles leaning out, ivory tips, a thorn on each
      const hs = [8, 11, 9.5, 12.5, 10, 11.5, 8.5];
      for (let i = 0; i < hs.length; i++) {
        const x = -18 + i * 6;
        const h = hs[i];
        const pts = bend(x, -2.5, x - 1.2, -h * 0.6, x + 1.6, -h);
        branch(pen, pts, 3, 0.4, i % 2 ? CORAL : JADE);
        strand(pen, pts.slice(-3), 1.2, 0.2, SHELL, 1);
        strand(pen, [
          [x - 0.4, -h * 0.45],
          [x - 2.2, -h * 0.6],
        ], 0.9, 0.1, SHELL, 1);
        if (i % 2 === 0) pore(pen, x - 0.2, -h * 0.25 - 1.4, 0.6);
      }
    }),
  tech2: () =>
    paint(52, 46, 26, 42, 307, P.ink, (pen) => {
      footShadow(pen, 22, 3.8);
      // a coral arch on two root feet
      bulb(pen, -15, -2, 7, 3.4, ROOT, { flat: 0.5 });
      bulb(pen, 15, -2, 7, 3.4, ROOT, { flat: 0.5 });
      branch(pen, bend(-15, -3, -18, -27, 0, -32), 4.6, 2.4, CORAL);
      branch(pen, bend(15, -3, 18, -27, 0, -32), 4.6, 2.4, shade(CORAL, 0.12));
      bulb(pen, 0, -32.5, 3.6, 2.6, CORAL);
      branch(pen, bend(-1, -34, -2, -36.5, -5, -37.5), 1.4, 0.6, CORAL);
      pore(pen, -5.4, -37.8, 0.9);
      branch(pen, bend(1.5, -34, 3, -36, 6, -36.5), 1.3, 0.6, CORAL);
      pore(pen, 6.4, -36.7, 0.8);
      // evolving cocoons hung on silk threads, the middle one near hatching
      cocoon(pen, -7.5, -27.5, -17, 3.4, 5.8, 0.4);
      cocoon(pen, 1, -30.5, -19.5, 3.9, 7, 0.9);
      cocoon(pen, 8.5, -27.5, -16.5, 3.2, 5.4, 0.5);
      // a little brood at the feet
      sac(pen, -3, -2.6, 2.8, 2.4);
      sac(pen, 4, -2.2, 2.4, 2);
      pore(pen, -16, -3.4, 0.8);
      pore(pen, 16.5, -3, 0.7);
    }),
  factory: () =>
    paint(70, 50, 35, 46, 308, P.ink, (pen) => {
      footShadow(pen, 31, 3.8);
      // humps of the burrow, the far ones first, coral tufts on them
      bulb(pen, -14, -20, 13, 11, mix(JADE, KELP, 0.3));
      bulb(pen, 16, -19, 12, 10, mix(JADE, KELP, 0.35));
      branch(pen, bend(-17, -28, -20, -33, -21, -38), 1.8, 0.7, CORAL);
      pore(pen, -21, -38.6, 1);
      branch(pen, bend(19, -26, 22, -30, 23, -34), 1.6, 0.7, CORAL);
      pore(pen, 23.2, -34.6, 0.9);
      bulb(pen, 0, -8, 29, 20, JADE, { flat: 0.6 });
      // the burrow mouth, ringed with rounded ivory plates
      orb(pen, 2, -9, 11, 7.5, HOLE);
      orb(pen, 2, -7.6, 7.6, 4.6, shade(HOLE, 0.4), { line: 0 });
      glow(pen, 2, -6, 5, GLOW, 0.3);
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI + (Math.PI * i) / 8;
        orb(pen, 2 + 12 * Math.cos(a), -9 + 8.2 * Math.sin(a), 2.4, 1.9, i % 2 ? SHELL : lighten(SHELL, 0.12), { line: 0.55 });
      }
      bulb(pen, 2, -1.6, 12.5, 2, SHELL, { lumps: 0.03 });
      // breathing pores and veins on its back
      line(pen, bend(-22, -6, -20, -12, -18, -14, 6), LIME, 0.5, 0.5);
      line(pen, bend(24, -5, 22, -10, 21, -11, 6), LIME, 0.5, 0.5);
      pore(pen, -18, -14, 1);
      pore(pen, -10, -22, 1.1);
      pore(pen, 14, -21, 1);
      pore(pen, 21, -11, 0.9);
    }),
  airfield: () =>
    paint(60, 50, 30, 45, 309, P.ink, (pen) => {
      footShadow(pen, 26, 4.8);
      bulb(pen, 0, -3, 22, 5.5, ROOT, { flat: 0.6, lumps: 0.08 });
      // two young spires either side
      branch(pen, bend(-14, -4, -15, -12, -17, -20), 3.6, 1.2, CORAL);
      cap(pen, -15.2, -11.5, 4.6, 1.7, JADE);
      cap(pen, -16.8, -19.5, 3.2, 1.3, PALE);
      branch(pen, bend(15, -4, 16, -14, 18, -24), 3.8, 1.2, CORAL);
      cap(pen, 16.2, -12.6, 5, 1.8, JADE);
      cap(pen, 17.6, -22, 3.6, 1.4, PALE);
      pore(pen, 18, -25.6, 0.9);
      // the tall spore spire, cap over cap, a ripe spore at its tip
      branch(pen, bend(0, -4, -1.5, -21, 1, -36), 6.5, 1.8, mix(CORAL, SHELL, 0.25));
      cap(pen, -0.5, -13, 8, 2.5, JADE);
      cap(pen, -0.4, -21.5, 6.2, 2.1, mix(JADE, PALE, 0.4));
      cap(pen, 0.2, -29.8, 4.4, 1.7, PALE);
      glow(pen, 1, -37.5, 4.5, GLOW, 0.7);
      orb(pen, 1, -37.5, 2.2, 2.2, LIME, { gloss: 1.4 });
      pore(pen, -5, -40.5, 0.7);
      pore(pen, 6, -42, 0.6);
    }),
  tech3: () =>
    paint(52, 64, 26, 58, 310, P.ink, (pen) => {
      footShadow(pen, 22, 5);
      bulb(pen, 0, -3, 19, 4.6, ROOT, { flat: 0.6, lumps: 0.08 });
      // the coral cage: far bars, then the side bars
      for (const x of [-7, 7]) branch(pen, bend(x, -4, x * 1.6, -26, 0, -45), 2.6, 1.4, shade(CORAL, 0.3));
      for (const x of [-12, 12]) branch(pen, bend(x, -4, x * 2.2, -27, 0, -45), 3.4, 1.8, CORAL);
      // the ancient core, slowly pulsing
      glow(pen, 0, -25, 17, GLOW, 0.45);
      orb(pen, 0, -25, 9, 9.5, mix(LIME, PALE, 0.35), { gloss: 1.4 });
      line(pen, bend(-6, -21, -2, -27, 4, -24, 6), mix(LIME, KELP, 0.45), 0.5, 0.5);
      line(pen, bend(-4, -31, 1, -29, 5, -32, 6), mix(LIME, KELP, 0.45), 0.5, 0.45);
      orb(pen, -2, -27.5, 4, 4, lighten(LIME, 0.35), { line: 0, alpha: 0.75 });
      glow(pen, -1, -26, 6, GLOW, 0.65);
      // the near bars cross in front of it; ivory knuckles where the bars root
      for (const x of [-4, 4]) branch(pen, bend(x, -4, x * 1.9, -25, 0, -45), 2.8, 1.5, lighten(CORAL, 0.08));
      for (const x of [-12, -4, 4, 12]) orb(pen, x, -3.8, 2.6, 1.5, SHELL, { line: 0.5 });
      // its crown: antlers of coral with lit tips
      bulb(pen, 0, -45.5, 4, 3, CORAL);
      branch(pen, bend(0, -47.5, -0.5, -51, 0.5, -53), 2, 0.8, CORAL);
      pore(pen, 0.6, -53.6, 1.2);
      branch(pen, bend(-2, -47, -5, -48, -7, -51.5), 1.6, 0.6, CORAL);
      pore(pen, -7.2, -52, 0.9);
      branch(pen, bend(2, -47, 5, -48, 7, -51), 1.6, 0.6, CORAL);
      pore(pen, 7.2, -51.5, 0.9);
    }),
  shipyard: () =>
    paint(92, 84, 46, 78, 311, P.ink, (pen) => {
      footShadow(pen, 40, 5.8);
      // roots spreading over the ground
      for (const [x0, x1, y1] of [
        [-24, -40, 1],
        [-14, -30, 2.5],
        [16, 33, 2.2],
        [26, 41, 0.8],
      ] as const) strand(pen, bend(x0, -2, (x0 + x1) / 2, -1, x1, y1), 2, 0.3, ROOT, 1);
      bulb(pen, 0, -4, 30, 7, ROOT, { flat: 0.6, lumps: 0.08 });
      // broad leaves and the stalk
      bulb(pen, -19, -11, 14, 4.2, JADE, { rot: 0.32 });
      bulb(pen, 19, -11, 14, 4.2, shade(JADE, 0.1), { rot: -0.32 });
      branch(pen, [
        [0, -5],
        [0, -20],
        [0, -33],
      ], 13, 8, JADE);
      bulb(pen, 0, -17, 6.4, 1.5, SHELL, { lumps: 0.02 });
      pore(pen, -2.6, -10.5, 1);
      pore(pen, 2.4, -24, 0.9);
      // the back petals of the bloom, then its open throat
      [-26, -13, 0, 13, 26].forEach((x, i) => {
        const rimY = -60 - 7 * Math.sqrt(1 - (x / 30) ** 2);
        bulb(pen, x * 1.02, rimY - 2.5, 5.5, 5, mix(SHELL, PALE, i % 2 ? 0.55 : 0.35), { rot: (x / 30) * 0.6 });
      });
      orb(pen, 0, -60, 30, 7, mix(KELP, JADE, 0.25));
      orb(pen, 0, -58.6, 18, 3.6, shade(KELP, 0.2), { line: 0 });
      // the spore it is about to fire
      glow(pen, 0, -58, 14, GLOW, 0.55);
      orb(pen, 0, -56, 6.5, 6, LIME, { gloss: 1.5 });
      orb(pen, -2, -58.5, 2.2, 1.6, lighten(LIME, 0.5), { line: 0, alpha: 0.7 });
      // the funnel's near wall (it hides the spore's lower part), veined with ivory
      const wall: XY[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        wall.push([-(4.5 + 25.5 * t * t), -30 - 30 * t]);
      }
      for (let i = 1; i < 12; i++) {
        const a = Math.PI - (Math.PI * i) / 12;
        wall.push([30 * Math.cos(a), -60 + 7 * Math.sin(a)]);
      }
      for (let i = 10; i >= 0; i--) {
        const t = i / 10;
        wall.push([4.5 + 25.5 * t * t, -30 - 30 * t]);
      }
      plate(pen, wall, JADE, { light: 0.5, dark: 0.5 });
      for (const s of [-0.75, -0.375, 0, 0.375, 0.75]) {
        const pts: XY[] = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          pts.push([s * (4.5 + 25.5 * t * t), -30 - 30 * t + 7 * Math.sqrt(1 - s * s) * t * t]);
        }
        branch(pen, pts, 1.2, 3, mix(lighten(SHELL, 0.1), shade(SHELL, 0.3), (s + 1) / 2), { line: 0.7 });
      }
      // petal tips curling over the near lip
      for (const a of [0.35, 0.95, 1.57, 2.19, 2.79]) bulb(pen, 30 * Math.cos(a), -60 + 7 * Math.sin(a) + 0.8, 4.2, 2.2, SHELL, { rot: -Math.cos(a) * 0.3 });
      bulb(pen, 0, -30.5, 7.5, 2.6, SHELL);
      // light and motes over the bloom
      glow(pen, 0, -64, 12, GLOW, 0.3);
      pore(pen, -7, -71, 0.9);
      pore(pen, 6, -73, 0.8);
      pore(pen, 1, -75.5, 0.6);
    }),
  defense: () =>
    paint(34, 28, 17, 24, 312, P.ink, (pen) => {
      footShadow(pen, 13, 3.5);
      bulb(pen, 0, -1.8, 10, 2.8, ROOT, { flat: 0.5, lumps: 0.1 });
      // a stout stalk with a lit firing pore
      branch(pen, [
        [0, -2],
        [0, -9],
        [0, -14],
      ], 7.5, 5.6, mix(SHELL, PALE, 0.35));
      pore(pen, 2.4, -7.5, 1.2);
      // the cap, spotted with ivory and pores
      cap(pen, 0, -14, 13, 6, JADE);
      orb(pen, -4.5, -19, 2.2, 1.2, SHELL, { line: 0.5 });
      orb(pen, 4, -19.8, 1.6, 0.9, SHELL, { line: 0.5 });
      pore(pen, -8.5, -16.5, 0.9);
      pore(pen, 1, -17.6, 1);
      pore(pen, 8.5, -16.6, 0.8);
    }),
  spread: () =>
    paint(14, 44, 7, 40, 313, P.ink, (pen) => {
      footShadow(pen, 5, 2);
      bulb(pen, 0, -1, 4.6, 1.8, ROOT, { flat: 0.5 });
      // a tentacle stalk with ivory rings, a little side bud and a lit tip
      branch(pen, bend(0, -1.5, -4, -18, 1, -31), 3, 1.3, JADE);
      branch(pen, bend(-1.6, -13, -3.5, -16, -4.4, -19.5), 1.3, 0.5, CORAL);
      pore(pen, -4.5, -20, 0.6);
      for (const [x, y] of [
        [-1.2, -8],
        [-1.7, -16],
        [-1.1, -23],
      ] as const) orb(pen, x, y, 1.7, 0.6, SHELL, { line: 0.4 });
      glow(pen, 1, -33.5, 5, GLOW, 0.7);
      orb(pen, 1, -33.5, 2, 2.2, LIME, { gloss: 1.5 });
    }),
};

/** Units face right; pose 1 is mid-stride (or firing). Flyers have no foot shadow (the scene draws it). */
export const MYCEL_UNITS: Record<UnitKind, (pose: 0 | 1) => Art> = {
  worker: (pose) =>
    paint(14, 16, 7, 14, 401 + pose, P.ink, (pen) => {
      footShadow(pen, 5, 1.5);
      // a round six-legged shell critter carrying a glowing sac of what it gathered
      const st = pose ? 0.9 : 0;
      for (const [x, s] of [
        [-3.2, 1],
        [-0.2, -1],
        [2.8, 1],
      ] as const) leg(pen, x + 0.5, -3.2, s * st, shade(KELP, 0.25), 0.7);
      for (const [x, s] of [
        [-3.6, -1],
        [-0.6, 1],
        [2.4, -1],
      ] as const) leg(pen, x, -3.2, s * st, KELP, 0.8);
      orb(pen, 4.4, -3.8, 2, 1.8, JADE);
      pore(pen, 5.6, -4.2, 0.55);
      bulb(pen, -0.4, -5, 5, 3.4, SHELL, { flat: 0.4 });
      line(pen, bend(-3.2, -3.2, -2.6, -6, -1.4, -8, 5), shade(SHELL, 0.35), 0.4, 0.8);
      line(pen, bend(0.8, -3, 1.6, -5.4, 2.2, -7.4, 5), shade(SHELL, 0.35), 0.4, 0.8);
      sac(pen, -0.8, -9.4, 3.2, 2.8, { core: 0.9 });
    }),
  scout: (pose) =>
    paint(20, 14, 10, 12, 403 + pose, P.ink, (pen) => {
      // a little floating spore cap trailing two threads
      const sw = pose ? -1.4 : 0;
      const a = wave(-2, -4, -2.5 + sw, 4.2, 0.5, pose * 2, 6);
      const b = wave(1.2, -4, -1.5 + sw, 4.4, 0.5, 1 + pose * 2, 6);
      strand(pen, a, 0.7, 0.2, PALE);
      strand(pen, b, 0.7, 0.2, PALE);
      pore(pen, a[6][0], a[6][1], 0.45);
      pore(pen, b[6][0], b[6][1], 0.5);
      cap(pen, 0, -5, 7.5, 3.6, JADE);
      orb(pen, -3, -8, 1.6, 0.9, SHELL, { line: 0.4 });
      orb(pen, 2.4, -8.2, 1.1, 0.6, SHELL, { line: 0.4 });
      pore(pen, 5.6, -6.4, 0.7 + pose * 0.2);
    }),
  t1: (pose) =>
    paint(12, 18, 6, 16, 405 + pose, P.ink, (pen) => {
      footShadow(pen, 3.8, 1.2);
      // a spore-ball body scuttling on six little legs, its fuzz swept back
      const st = pose ? 1.1 : 0;
      for (const [x, s] of [
        [-2.2, 1],
        [0, -1],
        [2.2, 1],
      ] as const) leg(pen, x + 0.4, -3.6, s * st - 0.2, shade(KELP, 0.25), 0.6);
      for (const [x, s] of [
        [-2.6, -1],
        [-0.4, 1],
        [1.8, -1],
      ] as const) leg(pen, x, -3.6, s * st - 0.2, KELP, 0.7);
      for (const y of [-8.6, -6.4, -4.4]) strand(pen, [
        [-2, y],
        [-5.6, y + 0.6],
      ], 1, 0.2, PALE, 0.8);
      bulb(pen, 0, -6.4, 3.8, 3.4, JADE, { lumps: 0.1 });
      pore(pen, -1.4, -8, 0.5);
      pore(pen, 0.4, -4.9, 0.45);
      orb(pen, 3.1, -6.8, 1.5, 1.3, mix(SHELL, PALE, 0.3), { line: 0.5 });
      pore(pen, 3.7, -7, 0.5);
    }),
  t1b: (pose) =>
    paint(14, 18, 6, 16, 407 + pose, P.ink, (pen) => {
      footShadow(pen, 4.2, 1.2);
      const st = pose ? 0.6 : 0;
      for (const [x, s] of [
        [-2.4, 1],
        [0, -1],
        [2.4, 1],
      ] as const) leg(pen, x + 0.4, -3.4, s * st, shade(KELP, 0.25), 0.7);
      for (const [x, s] of [
        [-2.8, -1],
        [-0.4, 1],
        [2, -1],
      ] as const) leg(pen, x, -3.4, s * st, KELP, 0.8);
      // coral spikes on its back; the front one is thrown when it fires
      branch(pen, bend(-2.2, -7.5, -3.6, -10.5, -4.6, -13.5), 1.6, 0.35, CORAL);
      branch(pen, bend(-0.2, -8.4, -0.4, -12, 0.4, -15), 1.7, 0.35, CORAL);
      if (!pose) branch(pen, bend(1.8, -7.8, 2.8, -10.4, 4.2, -12.6), 1.5, 0.35, CORAL);
      bulb(pen, -0.2, -5.6, 4.2, 3.2, JADE, { flat: 0.3 });
      orb(pen, -1.4, -7.4, 1.8, 0.9, SHELL, { line: 0.4 });
      orb(pen, 3.6, -5, 1.7, 1.5, mix(JADE, PALE, 0.4), { line: 0.5 });
      pore(pen, 4.4, -5.4, 0.5);
      if (pose) {
        branch(pen, [
          [3.8, -10],
          [6.6, -12.2],
        ], 1.4, 0.35, lighten(CORAL, 0.2));
        glow(pen, 6.6, -12.2, 1.2, P.shot, 0.9);
      }
    }),
  t2: (pose) =>
    paint(24, 30, 12, 28, 409 + pose, P.ink, (pen) => {
      footShadow(pen, 8, 2);
      // a segmented burrowing grub reared up, ivory plates on its back, a digging snout in front
      const r = pose ? 1 : 0;
      for (const x of [-8.6, -6.2, -3.8, -1.4]) line(pen, [
        [x, -1.6],
        [x + 0.6, 0],
      ], KELP, 0.8);
      const segs: [number, number, number, number][] = [
        [-7.8, -2.8, 3.2, 2.7],
        [-4.4, -4.3, 4, 3.7],
        [-0.8, -7.2, 4.4, 4.2],
        [1.8 + r * 0.3, -11.4 - r * 0.6, 4.2, 4],
        [3.6 + r * 0.5, -15.8 - r, 3.8, 3.6],
      ];
      segs.forEach(([x, y, rx, ry], i) => {
        bulb(pen, x, y, rx, ry, i % 2 ? JADE : mix(JADE, PALE, 0.2));
        orb(pen, x - rx * 0.25, y - ry * 0.55, rx * 0.6, ry * 0.32, SHELL, { line: 0.4 });
        pore(pen, x + rx * 0.2, y + ry * 0.35, 0.5);
      });
      const hx = 5 + r * 0.6;
      const hy = -19.6 - r * 1.2;
      bulb(pen, hx, hy, 3.3, 3.1, mix(JADE, PALE, 0.25));
      bulb(pen, hx + 2.8, hy + 0.8, 2.2, 1.6, SHELL, { rot: 0.4 });
      line(pen, [
        [hx + 2, hy - 0.2],
        [hx + 2.6, hy + 2],
      ], shade(SHELL, 0.4), 0.35, 0.8);
      line(pen, [
        [hx + 3.2, hy + 0.2],
        [hx + 3.6, hy + 2.2],
      ], shade(SHELL, 0.4), 0.35, 0.8);
      pore(pen, hx + 0.6, hy - 1, 0.6);
      if (pose) glow(pen, hx + 4.6, hy + 1.8, 1.3, P.shot, 0.9);
    }),
  t2s: (pose) =>
    paint(28, 20, 12, 17, 411 + pose, P.ink, (pen) => {
      // a floating jellyfish: a glowing bell and tendrils trailing behind (pose 1: the bell
      // squeezes and lets a spore drop go)
      const c = pose ? 1 : 0;
      for (let i = 0; i < 5; i++) {
        const pts = wave(-4 + i * 2, -8.5, -3 - c * 1.4 - i * 0.3, 7.4 - Math.abs(i - 2) * 0.8, 0.8, i + c * 1.5);
        strand(pen, pts, 0.8, 0.2, PALE);
      }
      bell(pen, 1, -8.5, 6 + c * 0.8, 7 - c * 0.9, 'up');
      for (const v of [-0.7, -0.25, 0.25, 0.7]) orb(pen, 1 + v * (7 - c * 0.9), -8.3, 1, 0.6, lighten(PALE, 0.15), { line: 0.4, alpha: 0.85 });
      if (pose) {
        glow(pen, 2.5, -1.5, 2.2, P.shot, 0.8);
        orb(pen, 2.5, -1.5, 1.1, 1.1, LIME, { line: 0.4 });
      }
    }),
  t3: (pose) =>
    paint(32, 22, 15, 19, 413 + pose, P.ink, (pen) => {
      footShadow(pen, 13, 2.6);
      // a big beast under an ivory shell, on four sturdy legs
      const st = pose ? 1.4 : 0;
      for (const [x, s] of [
        [-6, 1],
        [7, -1],
      ] as const) {
        line(pen, [
          [x + 1, -5],
          [x + 1 + s * st, -0.4],
        ], shade(KELP, 0.2), 2.6);
        orb(pen, x + 1 + s * st, -0.4, 1.5, 0.8, shade(SHELL, 0.3), { line: 0.4 });
      }
      bulb(pen, -11.8, -5, 2.4, 1.7, JADE, { rot: -0.3 });
      bulb(pen, 0, -6.2, 12, 4.6, mix(JADE, KELP, 0.15));
      bulb(pen, 11.6, -6.4, 3.8, 3.2, JADE);
      orb(pen, 13.2, -7.6, 2.3, 1.7, SHELL, { line: 0.5 });
      pore(pen, 14.2, -6.2, 0.6);
      for (const [x, s] of [
        [-5, -1],
        [8, 1],
      ] as const) {
        line(pen, [
          [x, -5],
          [x + s * st, -0.4],
        ], KELP, 3);
        orb(pen, x + s * st, -0.4, 1.7, 0.9, SHELL, { line: 0.4 });
      }
      // the great shell: ivory plates, pores glowing between them
      bulb(pen, -0.8, -9, 12, 7.5, mix(SHELL, JADE, 0.35), { flat: 0.6 });
      ribs(pen, -0.8, -9, 11, 7, 5, 2.6, 0.85);
      gapPores(pen, -0.8, -9, 11, 7, 5, 0.3, 0.7);
      if (pose) glow(pen, 15.4, -6.6, 1.3, P.shot, 0.9);
    }),
  t3a: (pose) =>
    paint(30, 22, 14, 20, 415 + pose, P.ink, (pen) => {
      // a great floating balloon creature: ivory bands, glowing pores, spore bombs slung beneath
      // (pose 1: the middle one is let go)
      for (const [x, len, k] of [
        [-3.5, 3.4, 0],
        [0.8, 3.6, 1],
        [5, 3.2, 0],
      ] as const) {
        if (pose && k) continue;
        line(pen, [
          [x, -4.6],
          [x - 0.5, -4.6 + len],
        ], shade(PALE, 0.2), 0.45, 0.85);
        sac(pen, x - 0.5, -4.6 + len + 1.2, 1.5, 1.4, { tint: mix(LIME, PALE, 0.4), core: 0.9 });
      }
      if (pose) {
        glow(pen, 1.2, -0.4, 1.6, P.shot, 0.9);
        sac(pen, 1.2, -0.4, 1.3, 1.2, { tint: mix(LIME, PALE, 0.4), core: 0.9 });
      }
      bulb(pen, -10.4, -11, 2.4, 4, PALE, { rot: 0.25 });
      bulb(pen, 1, -11.4, 9.6, 7.4, JADE);
      for (const s of [-0.62, -0.2, 0.22, 0.64]) {
        const pts: XY[] = [];
        for (let j = 0; j <= 10; j++) {
          const v = (-1 + (2 * j) / 10) * (Math.PI / 2) * 0.88;
          pts.push([1 + 9.1 * s * Math.cos(v), -11.4 - 7 * Math.sin(v)]);
        }
        line(pen, pts, P.ink, 1.8, 0.55);
        line(pen, pts, mix(lighten(SHELL, 0.1), shade(SHELL, 0.3), (s + 1) / 2), 1.3);
      }
      for (const s of [-0.41, 0.01, 0.43, 0.85]) pore(pen, 1 + 9.1 * s, -10.6, 0.75 * (1 - Math.abs(s) * 0.3));
      orb(pen, 10, -9.6, 1.8, 1.4, SHELL, { line: 0.5 });
      pore(pen, 10.6, -9.8, 0.5);
    }),
  s1: (pose) =>
    paint(40, 18, 20, 12, 417 + pose, P.ink, (pen) => {
      // a small swarm of star jellies swimming bell first, pulsing out of step
      const J: [number, number, number, number][] = [
        [-9, -1.5, 3.4, 2.6],
        [0, -6.4, 3.8, 2.9],
        [1.6, 2.2, 3.6, 2.7],
        [10, -1.8, 4.8, 3.5],
      ];
      J.forEach(([x, y, len, half], i) => {
        const c = (pose + i) % 2;
        for (let k = -1; k <= 1; k++) {
          strand(pen, wave(x + 0.3, y + k * half * 0.5, -(5 + len) * (1 + c * 0.15), k * 0.6, 0.7, i + k + pose * 2), 0.7, 0.15, PALE, 0.8);
        }
      });
      J.forEach(([x, y, len, half], i) => {
        const c = (pose + i) % 2;
        bell(pen, x, y, len * (1 - c * 0.12), half * (1 + c * 0.1), 'right');
      });
    }),
  s2: (pose) =>
    paint(80, 32, 40, 18, 419 + pose, P.ink, (pen) => {
      // a spore whale: a long jade body, ivory back plates, a glowing belly full of young jellies
      const f = pose ? 1.6 : 0;
      glow(pen, -34, -3 + f, 3 + pose, GLOW, 0.5);
      bulb(pen, -33.5, -6.5 + f, 4.6, 1.9, PALE, { rot: 0.5 });
      bulb(pen, -33.5, -0.5 + f, 4.6, 1.9, PALE, { rot: -0.5 });
      branch(pen, [
        [-20, -2],
        [-27, -3 + f * 0.4],
        [-32, -3.5 + f],
      ], 9, 3, mix(JADE, KELP, 0.2));
      bulb(pen, 9, 7.6, 6.4, 2, shade(JADE, 0.2), { rot: 0.45 });
      bulb(pen, 4, -2, 28, 10.5, JADE, { lumps: 0.04 });
      // the belly window
      haze(pen, 6, 3.4, 21, 7.5, 0.45 + pose * 0.1);
      orb(pen, 6, 3.6, 19, 4.6, MEMB, { alpha: 0.6, line: 0.6 });
      for (const [x, y, s] of [
        [-6, 3.6, 1.4],
        [0, 2.4, 1.7],
        [6.5, 4.8, 1.5],
        [12.5, 2.8, 1.6],
        [18, 4.4, 1.2],
      ] as const) {
        strand(pen, wave(x, y, -s * 2.4, 0, 0.4, x + pose * 2, 5), 0.5, 0.1, lighten(PALE, 0.2), 0.8);
        bell(pen, x, y, s, s * 0.8, 'right', mix(MEMB, LIME, 0.3));
      }
      // pores along its flank, plates on its back and brow, an eye and a mouth
      for (let x = -16; x <= 18; x += 5.6) pore(pen, x, -4.4 + Math.sin(x * 0.3) * 0.5, 0.8);
      for (let x = -14; x <= 20; x += 6) {
        const yt = -2 - 10.5 * Math.sqrt(1 - ((x - 4) / 28) ** 2);
        orb(pen, x, yt + 1.4, 2.6, 1.5, SHELL, { line: 0.5 });
      }
      orb(pen, 25.5, -6, 6.4, 3.8, SHELL);
      pore(pen, 27.6, -2.6, 0.9);
      line(pen, bend(29.5, 1.2, 26, 3.4, 21, 3.2, 6), KELP, 0.6, 0.8);
      bulb(pen, 12, 8.6, 6.4, 2, PALE, { rot: 0.45 });
    }),
  s3: (pose) =>
    paint(150, 60, 75, 34, 421 + pose, P.ink, (pen) => {
      // a drifting coral island: forked roots trailing beneath, a reef of domes and branching
      // coral on top, jellies hanging from the branches, an ivory prow whose spore pore charges
      const sw = pose ? 1.2 : 0;
      const rootC = mix(ROOT, KELP, 0.3);
      for (let i = 0; i < 9; i++) {
        const x = -46 + i * 11.5;
        const len = 8 + ((i * 7) % 5) * 1.75;
        const pts = wave(x, 8, -2 - sw, len, 0.9, i * 1.3);
        strand(pen, pts, 3, 0.4, rootC, 1);
        const [fx, fy] = pts[4];
        strand(pen, bend(fx, fy, fx + 2, fy + 3, fx + 3.5 - sw, fy + len * 0.4), 1.4, 0.3, rootC, 1);
        if (i % 2 === 0) pore(pen, pts[8][0], pts[8][1] + 0.4, 0.7);
      }
      // the underside and the reef plate
      bulb(pen, 2, 3, 54, 12, shade(ROOT, 0.15), { lumps: 0.06 });
      for (let x = -40; x <= 40; x += 10) line(pen, bend(x, 4, x + 2, 7, x + 1, 10 - Math.abs(x) * 0.05, 5), LIME, 0.5, 0.45);
      bulb(pen, 0, -4, 64, 9, JADE, { lumps: 0.05 });
      // coral domes on the reef
      bulb(pen, -44, -11, 11, 6, CORAL, { flat: 0.7 });
      bulb(pen, -22, -13, 13, 7.5, mix(JADE, PALE, 0.4), { flat: 0.7 });
      bulb(pen, 6, -12, 10, 6.5, SHELL, { flat: 0.7 });
      ribs(pen, 6, -11, 9, 5.6, 4, 1.6, 0.75, shade(SHELL, 0.15));
      bulb(pen, 30, -11, 12, 6.5, PALE, { flat: 0.7 });
      bulb(pen, 48, -9, 8, 5, CORAL, { flat: 0.7 });
      // branching coral, lit tips
      branch(pen, bend(-30, -12, -33, -20, -31, -28), 3.4, 1.6, CORAL);
      branch(pen, bend(-31.5, -21, -37, -21, -42, -25), 2, 0.8, CORAL);
      branch(pen, bend(-31, -25, -27, -26, -24, -30), 1.8, 0.8, CORAL);
      branch(pen, bend(18, -12, 21, -20, 20, -29), 3.2, 1.5, CORAL);
      branch(pen, bend(19.6, -20, 25, -20, 29, -24), 1.9, 0.8, CORAL);
      branch(pen, bend(19.8, -25, 16, -27, 12, -30), 1.7, 0.8, CORAL);
      branch(pen, bend(42, -10, 45, -15, 44, -22), 2.2, 0.9, CORAL);
      for (const [x, y] of [
        [-31, -28.6],
        [20, -29.6],
        [44, -22.6],
      ] as const) pore(pen, x, y, 1.1);
      // jellies hanging from the branch tips on silk threads
      for (const [x, y, s] of [
        [-42, -25, 2.6],
        [-24, -30, 2.4],
        [12, -30, 2.4],
        [29, -24, 2.6],
      ] as const) {
        const jx = x + sw * 0.6;
        const jy = y + 7.5;
        line(pen, [
          [x, y],
          [jx, jy - s],
        ], lighten(SHELL, 0.2), 0.35, 0.8);
        for (const v of [-0.55, 0, 0.55]) strand(pen, wave(jx + v * s, jy, -sw * 0.5, 4.2, 0.4, v * 3 + pose * 2, 5), 0.5, 0.1, PALE, 0.8);
        bell(pen, jx, jy, s, s, 'up');
      }
      // pore lights along the reef's flank
      for (let x = -52; x <= 52; x += 7.4) pore(pen, x, -1.5 + Math.sin(x * 0.21) * 0.8, 0.9);
      // the ivory prow and its charging spore pore; a spore wake at the stern
      bulb(pen, 62, -2, 9, 7.5, SHELL);
      line(pen, bend(58, -8.5, 61, -2, 58, 4.8, 6), shade(SHELL, 0.35), 0.5, 0.8);
      line(pen, bend(63, -8.8, 66.5, -2, 63, 4.8, 6), shade(SHELL, 0.35), 0.5, 0.8);
      glow(pen, 69, -1.5, 2.4 + pose * 2.5, LIME, 0.9);
      orb(pen, 69, -1.5, 1.6, 1.6, LIME, { line: 0.5, gloss: 1.5 });
      glow(pen, -70, -2, 4, GLOW, 0.45);
      pore(pen, -71.5, -6, 0.6);
      pore(pen, -71, 2.5, 0.5);
    }),
};
