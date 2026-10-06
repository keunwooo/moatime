/**
 * 공명단 — long living crystal in the curves of Korean porcelain (FRONT_PROMPT.md 4.3절): white
 * porcelain (백자) forms thrown like pots, celadon (청자) glaze on their shadow side, rings floating
 * round them, rose resonance light and thin ink lines. Porcelain #EEE8DE, rose #E07A8F, celadon
 * #8FB3A8, ink #3A3540. Ships are porcelain hulls (a droplet, a moon jar, a nave with its spires
 * hanging upside down) with rings round them.
 */

import type { BuildingKind, UnitKind } from '../../../sim/frontPlan';
import { css, lighten, mix, shade, type RGB } from '../../paint/color';
import { RACE_PAL } from '../palette';
import { blob, block, footShadow, glow, line, orb, paint, plate, ring, shard, type Art, type Pen } from './kit';

type Pt2 = [number, number];

const P = RACE_PAL[2];
const BODY = P.body;
/** Porcelain a step back (behind the main form). */
const BACK = mix(P.body, P.bodyDark, 0.3);
const DUSK = P.bodyDark;
const ROSE = P.accent;
const CEL = P.accent2;
const LIT = P.glow;
const GLAZE = mix(BODY, CEL, 0.55);
const DEEP = mix(CEL, P.ink, 0.45);
/** Rose light in windows, niches and gates. */
const SPOT = mix(ROSE, LIT, 0.5);
/** Start angle of an upright ring (its near half is the left one). */
const UPRIGHT = Math.PI / 2;

/** A wheel-thrown profile: [height share, half width share] control points joined by eased curves. */
function profile(...pts: Pt2[]): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, w0] = pts[i];
    const [t1, w1] = pts[i + 1];
    for (let k = 0; k < 5; k++) {
      const s = k / 5;
      out.push([t0 + (t1 - t0) * s, w0 + ((w1 - w0) * (1 - Math.cos(Math.PI * s))) / 2]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const SPIRE = profile([0, 1], [0.14, 0.5], [0.6, 0.2], [1, 0]);
const JAR = profile([0, 0.42], [0.06, 0.46], [0.5, 1], [0.92, 0.36], [1, 0.33]);
const MAEBYEONG = profile([0, 0.5], [0.72, 1], [0.93, 0.34], [1, 0.3]);
const PILLAR = profile([0, 1], [0.08, 0.62], [0.9, 0.55], [1, 0.9]);
const ROBE = profile([0, 1], [0.45, 0.58], [0.86, 1.05], [1, 0.42]);
const TOWER = profile([0, 1], [0.12, 0.55], [0.75, 0.3], [1, 0.55]);
const STEM = profile([0, 1], [0.3, 0.62], [1, 0.75]);

/** Points along an elliptical arc (art units), from angle a0 to a1 (0 = right, π/2 = down). */
function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 10): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/**
 * A wheel-thrown porcelain form standing at (x, y), h tall (a negative h hangs it down), w its
 * widest half width: the right side glazed celadon, a gloss streak on the left. Returns its outline.
 */
function thrown(pen: Pen, x: number, y: number, h: number, w: number, prof: Pt2[], body: RGB = BODY, o: { glaze?: number; lean?: number } = {}): Pt2[] {
  const lean = o.lean ?? 0;
  const at = (t: number, k: number): Pt2 => [x + k * w + t * Math.abs(h) * lean, y - t * h];
  const left = prof.map(([t, k]) => at(t, -k));
  const right = prof.map(([t, k]) => at(t, k)).reverse();
  // a round foot (upright forms only; a hanging one's root is hidden)
  const k0 = prof[0][1] * w;
  const foot: Pt2[] = [];
  if (h > 0) for (let i = 1; i < 8; i++) foot.push([x + Math.cos((Math.PI * i) / 8) * k0, y + Math.sin((Math.PI * i) / 8) * k0 * 0.28]);
  const outline = [...left, ...right, ...foot];
  plate(pen, outline, body, { light: 0.5, dark: 0.25 });
  const seam = prof.map(([t, k]) => at(t, k * 0.3));
  plate(pen, [...seam, ...right, ...foot.filter(([fx]) => fx >= x + k0 * 0.3)], mix(body, CEL, o.glaze ?? 0.5), { light: 0.1, dark: 0.3, line: 0.45 });
  const gloss = prof.filter(([t]) => t > 0.12 && t < 0.8).map(([t, k]) => at(t, -k * 0.55));
  if (gloss.length > 1) line(pen, gloss, lighten(body, 0.5), Math.min(0.9, w * 0.14), 0.5);
  return outline;
}

/** A low round drum seen from high in front (daises, plinths, jar mouths); its front edge on y. */
function drum(pen: Pen, x: number, y: number, rx: number, ry: number, h: number, base: RGB) {
  const cy = y - ry;
  plate(pen, [...arcPts(x, cy - h, rx, ry, 0, Math.PI, 12), ...arcPts(x, cy, rx, ry, Math.PI, 0, 12)], shade(base, 0.08), { light: 0.35, dark: 0.45 });
  orb(pen, x, cy - h, rx, ry, lighten(base, 0.1), { gloss: 0.6 });
}

/** Half of a floating ring: the far half (drawn before what it circles) or the near half (after). */
function halfRing(pen: Pen, cx: number, cy: number, rx: number, ry: number, color: RGB, width: number, near: boolean, o: { a?: number; halo?: boolean; from?: number } = {}) {
  const { ctx } = pen;
  const c = pen.p(cx, cy);
  const a0 = (o.from ?? 0) + (near ? 0 : Math.PI);
  const stroke = (col: string, w: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = pen.u(w);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, pen.u(rx), pen.u(ry), 0, a0, a0 + Math.PI);
    ctx.stroke();
  };
  ctx.save();
  ctx.globalAlpha = o.a ?? 1;
  if (near && (o.halo ?? true)) stroke(css(lighten(color, 0.4), 0.22), width * 3.2);
  stroke(near ? css(lighten(color, 0.2)) : css(shade(color, 0.3), 0.85), width);
  ctx.restore();
}

/** A porcelain hoop standing up (a ring with a body): ink rim, a lit upper left, a glazed lower right. */
function hoop(pen: Pen, cx: number, cy: number, rx: number, ry: number, w: number) {
  const { ctx } = pen;
  const c = pen.p(cx, cy);
  const arc = (col: string, lw: number, a0 = 0, a1 = Math.PI * 2) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = pen.u(lw);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, pen.u(rx), pen.u(ry), 0, a0, a1);
    ctx.stroke();
  };
  ctx.save();
  arc(css(pen.ink, 0.85), w + 1.1);
  arc(css(BODY), w);
  arc(css(GLAZE), w * 0.6, -0.4, 2);
  arc(css(lighten(BODY, 0.45), 0.8), w * 0.3, Math.PI + 0.3, Math.PI * 1.5 + 0.2);
  ctx.restore();
}

/** A thin column of light from (x, y0) toward y1, widening from w0 to w1 and fading as it goes. */
function beam(pen: Pen, x: number, y0: number, y1: number, w0: number, w1: number, color: RGB, a = 0.6) {
  const { ctx } = pen;
  const A = pen.p(x, y0);
  const B = pen.p(x, y1);
  const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
  g.addColorStop(0, css(lighten(color, 0.3), a));
  g.addColorStop(1, css(color, 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(A.x - pen.u(w0 / 2), A.y);
  ctx.lineTo(B.x - pen.u(w1 / 2), B.y);
  ctx.lineTo(B.x + pen.u(w1 / 2), B.y);
  ctx.lineTo(A.x + pen.u(w0 / 2), A.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** An arched niche of rose light (windows and doors of the choir), standing on y. */
function niche(pen: Pen, x: number, y: number, w: number, h: number) {
  plate(pen, [
    [x - w, y],
    [x - w, y - h * 0.72],
    [x, y - h],
    [x + w, y - h * 0.72],
    [x + w, y],
  ], SPOT, { light: 0.7, dark: 0.15, line: 0.5 });
}

/** A translucent dome of light standing on the ground (a shield bubble). */
function dome(pen: Pen, cx: number, cy: number, rx: number, ry: number, a: number) {
  const { ctx } = pen;
  const c = pen.p(cx, cy);
  const R = pen.u(rx);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
  g.addColorStop(0, css(LIT, a * 0.25));
  g.addColorStop(0.75, css(LIT, a * 0.5));
  g.addColorStop(1, css(lighten(LIT, 0.35), a));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // its rim, and a highlight on the upper left
  ctx.save();
  ctx.strokeStyle = css(lighten(LIT, 0.3), 0.7);
  ctx.lineWidth = pen.u(0.5);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, R, pen.u(ry), 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = css(lighten(LIT, 0.7), 0.6);
  ctx.lineWidth = pen.u(0.8);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, R * 0.8, pen.u(ry * 0.8), 0, Math.PI * 1.12, Math.PI * 1.36);
  ctx.stroke();
  ctx.restore();
}

/** A droplet lying along x: a round end at the right, its point trailing at the left; the belly glazed. */
function drop(pen: Pen, x: number, y: number, len: number, r: number, body: RGB = BODY) {
  const cx = x + len / 2 - r;
  const tail: Pt2 = [x - len / 2, y];
  const b = Math.PI - Math.acos(r / (len - r));
  plate(pen, [tail, ...arcPts(cx, y, r, r, -b, b)], body, { light: 0.55, dark: 0.25 });
  plate(pen, [tail, ...arcPts(cx, y, r, r, 0, b)], mix(body, CEL, 0.55), { light: 0.1, dark: 0.3, line: 0.45 });
}

/** A stone floating in the sky garden: an inverted crystal, a celadon garden on top, light under it. */
function isle(pen: Pen, x: number, y: number, w: number, d: number) {
  glow(pen, x + w * 0.12, y + d + 1.4, w * 0.22, LIT, 0.45);
  plate(pen, [
    [x - w / 2, y],
    [x + w / 2, y],
    [x + w * 0.3, y + d * 0.55],
    [x + w * 0.12, y + d],
    [x - w * 0.25, y + d * 0.5],
  ], BODY, { light: 0.5, dark: 0.3 });
  plate(pen, [
    [x + w * 0.1, y],
    [x + w / 2, y],
    [x + w * 0.3, y + d * 0.55],
    [x + w * 0.12, y + d],
  ], GLAZE, { light: 0.1, dark: 0.3, line: 0.45 });
  blob(pen, x, y, w * 0.5, w * 0.13, CEL, { lumps: 0.2 });
}

/** A net of light over a round form: latitudes and meridians clipped to its outline, knots lit. */
function net(pen: Pen, outline: Pt2[], cx: number, cy: number, rx: number, ry: number) {
  const { ctx } = pen;
  const c = pen.p(cx, cy);
  ctx.save();
  ctx.beginPath();
  outline.forEach(([x, y], i) => {
    const q = pen.p(x, y);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = css(LIT, 0.55);
  ctx.lineWidth = pen.u(0.35);
  for (const k of [-0.55, 0, 0.5]) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + pen.u(k * ry), pen.u(rx * 1.1), pen.u(ry * 0.15), 0, 0, Math.PI);
    ctx.stroke();
  }
  for (const s of [0.3, 0.62, 0.88]) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, pen.u(rx * s), pen.u(ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - pen.u(ry));
  ctx.lineTo(c.x, c.y + pen.u(ry));
  ctx.stroke();
  ctx.restore();
  for (const s of [-0.62, 0, 0.62]) glow(pen, cx + s * rx, cy + ry * 0.13, 1, LIT, 0.7);
}

/** A slim crystal figure (the swordsman and the archer): thin legs, a long porcelain robe, a crystal head. */
function chorister(pen: Pen, pose: 0 | 1) {
  footShadow(pen, 3.4, 1.1);
  line(pen, [
    [-0.7, -4.6],
    [-1.3 + pose * 0.9, 0],
  ], shade(DUSK, 0.15), 1);
  line(pen, [
    [0.7, -4.6],
    [1.3 - pose * 0.9, 0],
  ], DUSK, 1);
  thrown(pen, 0, -4.2, 7.2, 1.9, ROBE, BODY);
  shard(pen, 0, -11, 2.4, 4.2, BODY, CEL);
  glow(pen, -0.2, -8.6, 1, ROSE, 0.75);
}

export const CHOIR_BUILDINGS: Record<BuildingKind, () => Art> = {
  hq: () =>
    paint(70, 90, 35, 84, 501, P.ink, (pen) => {
      footShadow(pen, 30, 6);
      drum(pen, 0, 0, 27, 5.5, 3, DUSK);
      drum(pen, 0, -4.3, 20, 4.2, 3, BODY);
      // two lesser spires behind
      thrown(pen, -13, -13, 30, 4.2, SPIRE, BACK, { glaze: 0.6 });
      thrown(pen, 13.5, -13, 40, 4.6, SPIRE, BACK, { glaze: 0.6 });
      // the spire rising through its rings (far halves first)
      halfRing(pen, 0, -46, 17, 3.8, ROSE, 1.4, false);
      halfRing(pen, 0, -64, 9, 2, LIT, 0.8, false);
      thrown(pen, 0, -11.5, 70, 9.5, SPIRE, BODY);
      halfRing(pen, 0, -29.7, 4.4, 1.1, CEL, 0.6, true, { halo: false });
      niche(pen, 0, -9.2, 2.6, 11);
      glow(pen, 0, -14, 5, LIT, 0.5);
      halfRing(pen, 0, -46, 17, 3.8, ROSE, 1.4, true);
      halfRing(pen, 0, -64, 9, 2, LIT, 0.8, true);
      glow(pen, -12.5, -43.4, 1.6, LIT, 0.8);
      glow(pen, 13, -43.5, 1.3, LIT, 0.8);
      glow(pen, 0, -81, 2.2, LIT, 0.7);
    }),
  outpost: () =>
    paint(62, 50, 31, 45, 502, P.ink, (pen) => {
      footShadow(pen, 26, 5);
      drum(pen, 0, 0, 22, 4.6, 3, DUSK);
      thrown(pen, 10.5, -9, 18, 3.2, SPIRE, BACK, { glaze: 0.6 });
      thrown(pen, -9.5, -8.8, 12, 2.6, SPIRE, BACK, { glaze: 0.6 });
      halfRing(pen, 0, -25, 12, 2.8, ROSE, 1.1, false);
      thrown(pen, 0, -7.6, 34, 6.4, SPIRE, BODY);
      halfRing(pen, 0, -17.8, 2.8, 0.7, CEL, 0.5, true, { halo: false });
      niche(pen, 0, -6.2, 1.8, 7.4);
      glow(pen, 0, -9.5, 3.4, LIT, 0.5);
      halfRing(pen, 0, -25, 12, 2.8, ROSE, 1.1, true);
      glow(pen, 0, -41, 1.6, LIT, 0.7);
    }),
  supply: () =>
    paint(36, 42, 18, 38, 503, P.ink, (pen) => {
      footShadow(pen, 13, 3.2);
      drum(pen, 0, 0, 9, 2.4, 2.4, DUSK);
      thrown(pen, 0, -4.8, 9.5, 2.2, STEM, BODY);
      // the fork: a U of porcelain with two prongs, humming between them in a faint ring
      glow(pen, 0, -27, 3.2, LIT, 0.45);
      halfRing(pen, 0, -29, 9.5, 2, ROSE, 0.7, false, { a: 0.6 });
      plate(pen, [
        [-6, -34],
        [-4.7, -36.5],
        [-3.4, -34],
        ...arcPts(0, -19, 3.4, 3.4, Math.PI, 0),
        [3.4, -34],
        [4.7, -36.5],
        [6, -34],
        ...arcPts(0, -19, 6, 6, 0, Math.PI),
      ], BODY, { light: 0.55, dark: 0.25 });
      plate(pen, [
        [4.7, -36.5],
        [6, -34],
        ...arcPts(0, -19, 6, 6, 0, Math.PI / 2, 5),
        ...arcPts(0, -19, 3.4, 3.4, Math.PI / 2, 0, 5),
        [3.4, -34],
      ], GLAZE, { light: 0.1, dark: 0.3, line: 0.45 });
      halfRing(pen, 0, -29, 9.5, 2, ROSE, 0.7, true, { a: 0.6 });
      glow(pen, 0, -14, 1.2, LIT, 0.7);
    }),
  barracks: () =>
    paint(60, 44, 30, 40, 504, P.ink, (pen) => {
      footShadow(pen, 26, 4);
      block(pen, -23, 0, 44, 3.2, 7, mix(BODY, DUSK, 0.45));
      // the gate of rose light between the pillars
      const arch = (w: number, top: number): Pt2[] => [[-w, -3.6], ...arcPts(0, -19, w, top - 19, Math.PI, Math.PI * 2), [w, -3.6]];
      plate(pen, arch(8.5, 29), SPOT, { light: 0.8, dark: 0.1, line: 0.35, alpha: 0.6 });
      plate(pen, arch(5, 25), lighten(LIT, 0.3), { light: 0.6, dark: 0, line: 0, alpha: 0.5 });
      glow(pen, 0, -15, 8, LIT, 0.45);
      for (const x of [-11.5, 11.5]) {
        thrown(pen, x, -5, 26, 2.6, PILLAR, BODY);
        shard(pen, x, -30.6, 3.4, 6.5, BODY, CEL);
        glow(pen, x - 0.4, -20, 0.9, LIT, 0.7);
      }
      ring(pen, 0, -33.5, 6, 1.5, ROSE, 0.9);
      glow(pen, 0, -33.5, 2.4, LIT, 0.4);
    }),
  gas: () =>
    paint(34, 56, 17, 52, 505, P.ink, (pen) => {
      footShadow(pen, 13, 3.2);
      // the vent, breathing rose mist, and a drop falling back into it
      drum(pen, 0, 0, 9, 2.6, 3.2, DUSK);
      orb(pen, 0, -5.8, 6, 1.7, DEEP, { gloss: 0.3 });
      beam(pen, 0, -6, -24, 6, 1.6, LIT, 0.35);
      orb(pen, 0, -16.5, 0.8, 1.1, LIT, { line: 0.3 });
      glow(pen, 0, -16.5, 1.8, LIT, 0.5);
      // the crystal floating above, in its ring
      halfRing(pen, 0, -33, 8.5, 2.1, ROSE, 0.9, false);
      plate(pen, [
        [0, -48],
        [-5.5, -35],
        [0.4, -21],
        [0.9, -34.5],
      ], BODY, { light: 0.6, dark: 0.2 });
      plate(pen, [
        [0, -48],
        [0.9, -34.5],
        [0.4, -21],
        [5, -34],
      ], GLAZE, { light: 0.15, dark: 0.3 });
      glow(pen, -0.8, -34.5, 3.6, ROSE, 0.35);
      line(pen, [
        [-2.2, -42.5],
        [-3.6, -36],
      ], lighten(BODY, 0.5), 0.6, 0.6);
      halfRing(pen, 0, -33, 8.5, 2.1, ROSE, 0.9, true);
      glow(pen, 0, -48.5, 1.4, LIT, 0.6);
    }),
  wall: () =>
    paint(48, 20, 24, 16, 506, P.ink, (pen) => {
      footShadow(pen, 21, 3);
      block(pen, -20, 0, 38, 4.2, 4, mix(BODY, DUSK, 0.35));
      line(pen, [
        [-19.4, -1.8],
        [17.4, -1.8],
      ], CEL, 0.7, 0.9);
      shard(pen, -14, -5.2, 4, 7, BODY, CEL, { tilt: -0.6 });
      shard(pen, -10.4, -5.2, 3, 4.6, BACK, CEL);
      shard(pen, 15.4, -5.2, 2.8, 4, BACK, CEL, { tilt: 0.4 });
      // the turret: a porcelain mount and a crystal lance aimed ahead, ringed at its root
      orb(pen, 2, -6.8, 4.4, 2.6, BODY);
      plate(pen, [
        [-1, -8.2],
        [3, -10.8],
        [15.5, -13],
      ], BODY, { light: 0.6, dark: 0.2 });
      plate(pen, [
        [-1, -8.2],
        [15.5, -13],
        [3.6, -7],
      ], GLAZE, { light: 0.1, dark: 0.3 });
      ring(pen, 2.4, -9.2, 3.2, 0.9, ROSE, 0.6);
      glow(pen, 15.5, -13, 1.4, ROSE, 0.8);
      shard(pen, 9.5, -5.2, 3, 4, BODY, CEL);
    }),
  tech2: () =>
    paint(52, 46, 26, 42, 507, P.ink, (pen) => {
      footShadow(pen, 22, 4);
      drum(pen, 0, 0, 20, 4.6, 2.6, DUSK);
      drum(pen, 0, -3.2, 16, 4, 2.4, BODY);
      // the library: a moon jar with lit niches round its belly and inlaid celadon bands
      thrown(pen, 0, -9.6, 28, 13, JAR, BODY, { lean: -0.015 });
      halfRing(pen, 0, -13, 6.3, 1.3, CEL, 0.5, true, { halo: false });
      for (const [x, w] of [
        [-7, 1.1],
        [-2.4, 1.4],
        [2.2, 1.4],
        [6.8, 1.1],
      ] as const) niche(pen, x, -18.5, w, 6.5);
      halfRing(pen, -0.3, -29.8, 8.6, 1.8, CEL, 0.6, true, { halo: false });
      drum(pen, -0.4, -36.3, 4.5, 1.3, 1.4, BODY);
      orb(pen, -0.4, -39, 3.2, 0.85, DEEP, { gloss: 0.3, line: 0.4 });
      glow(pen, -0.4, -39.4, 2.4, ROSE, 0.5);
      glow(pen, -12, -2.6, 1.2, LIT, 0.7);
      glow(pen, 12.4, -2.6, 1.2, LIT, 0.7);
    }),
  factory: () =>
    paint(70, 50, 35, 46, 508, P.ink, (pen) => {
      footShadow(pen, 30, 4);
      block(pen, -30, 0, 54, 5, 10, mix(BODY, DUSK, 0.45));
      block(pen, -22, -6.5, 36, 4.5, 7, BODY);
      // gardens on the terraces and a rose pool
      for (const [x, y, r] of [
        [-26, -7.6, 3],
        [20, -7.8, 2.6],
        [-15, -12.8, 2.4],
        [9, -13, 2.2],
      ] as const) blob(pen, x, y, r, r * 0.5, CEL, { lumps: 0.25 });
      orb(pen, -3, -13, 5, 1.1, SPOT, { gloss: 0.8, line: 0.4 });
      // stones floating above, each with its own garden
      isle(pen, -4, -22, 6, 4);
      isle(pen, -17, -30, 12, 7);
      isle(pen, 22, -26, 9, 5.5);
      isle(pen, 5, -38, 14, 8);
      shard(pen, 7.5, -38.6, 2, 4, BODY, CEL);
      orb(pen, 14.5, -33, 1, 0.8, BODY, { line: 0.4 });
      orb(pen, -8.5, -36, 0.8, 0.6, BODY, { line: 0.4 });
    }),
  airfield: () =>
    paint(68, 34, 34, 28, 509, P.ink, (pen) => {
      footShadow(pen, 30, 5);
      block(pen, -30, 0, 58, 2.6, 6, mix(BODY, DUSK, 0.45));
      const xs = [-26, -16, -6, 4, 14, 24];
      // the singing light in each bay
      for (let i = 0; i < xs.length - 1; i++) glow(pen, (xs[i] + xs[i + 1]) / 2, -11.5, 3.4, LIT, 0.4);
      for (const x of xs) thrown(pen, x, -4.3, 13.4, 1.5, PILLAR, BODY);
      // the arcade over them, its cornice and a rose inlay line
      const under: Pt2[] = [[26.4, -17.6]];
      for (let i = xs.length - 1; i > 0; i--) under.push(...arcPts((xs[i] + xs[i - 1]) / 2, -17.6, 5, 3.6, 0, -Math.PI));
      under.push([-28.4, -17.6]);
      plate(pen, [[-28.4, -24.4], [26.4, -24.4], ...under], BODY, { light: 0.5, dark: 0.3 });
      plate(pen, [
        [-28.4, -24.4],
        [-27, -26],
        [27.8, -26],
        [26.4, -24.4],
      ], lighten(BODY, 0.12), { light: 0.3, dark: 0.2 });
      line(pen, [
        [-27.4, -22.6],
        [25.4, -22.6],
      ], ROSE, 0.5, 0.75);
      for (const x of xs) glow(pen, x, -25.2, 0.9, LIT, 0.75);
    }),
  tech3: () =>
    paint(52, 64, 26, 58, 510, P.ink, (pen) => {
      footShadow(pen, 22, 5);
      drum(pen, 0, 0, 20, 4.6, 2.6, DUSK);
      drum(pen, 0, -3.6, 15, 3.6, 2.4, BODY);
      // two candles of rose light
      for (const x of [-13.5, 13.5]) {
        thrown(pen, x, -8.4, 7, 1.4, PILLAR, BODY);
        glow(pen, x, -16.6, 1.6, LIT, 0.85);
      }
      // the altar and the crystal on it
      block(pen, -7.5, -7.4, 13, 9, 5, BODY);
      plate(pen, [
        [-7.5, -14],
        [5.5, -14],
        [5.5, -12.6],
        [-7.5, -12.6],
      ], CEL, { line: 0.4 });
      glow(pen, -1, -10.2, 1.6, ROSE, 0.6);
      shard(pen, 0.4, -17.6, 3, 6, BODY, CEL);
      // the chant rising into a halo, and a smaller one above it
      beam(pen, 0.4, -23, -42, 2.4, 0.8, LIT, 0.4);
      halfRing(pen, 0.4, -42, 12, 3.2, ROSE, 1.6, false);
      halfRing(pen, 0.4, -42, 7.5, 2, LIT, 0.7, false);
      glow(pen, 0.4, -42, 3, LIT, 0.35);
      halfRing(pen, 0.4, -42, 12, 3.2, ROSE, 1.6, true);
      halfRing(pen, 0.4, -42, 7.5, 2, LIT, 0.7, true);
      ring(pen, 0.4, -52, 6, 1.5, LIT, 0.6);
      for (const [x, y] of [
        [-9.9, -40.4],
        [10.3, -40.2],
        [0.4, -38.8],
      ] as const) glow(pen, x, y, 1.3, LIT, 0.8);
    }),
  shipyard: () =>
    paint(92, 84, 46, 78, 511, P.ink, (pen) => {
      footShadow(pen, 40, 6);
      drum(pen, 0, 0, 34, 6.5, 3.2, DUSK);
      drum(pen, 0, -4.7, 22, 5, 2.6, BODY);
      // two anchor spires holding the ring by tethers of light
      thrown(pen, -26, -10, 18, 3.6, SPIRE, BACK, { glaze: 0.6 });
      thrown(pen, 27, -10, 20, 3.6, SPIRE, BACK, { glaze: 0.6 });
      line(pen, [
        [-26, -27],
        [-9.6, -52],
      ], LIT, 0.45, 0.5);
      line(pen, [
        [27, -29],
        [9.6, -52],
      ], LIT, 0.45, 0.5);
      // the tower, the ring it holds up, and the thin light it sends to the sky
      thrown(pen, 0, -12.3, 33, 7, TOWER, BODY);
      glow(pen, 0, -59, 8, LIT, 0.35);
      hoop(pen, 0, -59, 10, 14.5, 3);
      beam(pen, 0, -60, -78, 2, 0.5, ROSE, 0.75);
      beam(pen, 0, -60, -78, 0.7, 0.2, LIT, 0.9);
      for (const [x, y] of [
        [-10, -59],
        [10, -59],
        [0, -44.5],
      ] as const) glow(pen, x, y, 1.5, LIT, 0.8);
      glow(pen, -26, -27.6, 1.2, LIT, 0.7);
      glow(pen, 27, -29.6, 1.2, LIT, 0.7);
    }),
  defense: () =>
    paint(36, 26, 18, 22, 512, P.ink, (pen) => {
      footShadow(pen, 15, 3.5);
      drum(pen, 0, 0, 7.5, 2, 1.8, DUSK);
      halfRing(pen, 0, -12, 4.5, 1.1, ROSE, 0.6, false);
      thrown(pen, 0, -3.8, 14, 3, SPIRE, BODY);
      halfRing(pen, 0, -12, 4.5, 1.1, ROSE, 0.6, true);
      glow(pen, 0, -17.4, 1.3, LIT, 0.7);
      // the bubble over it
      dome(pen, 0, -0.8, 15.5, 19, 0.5);
      halfRing(pen, 0, -0.8, 15.5, 3.2, LIT, 0.5, true, { a: 0.55, halo: false });
    }),
  spread: () =>
    paint(14, 44, 7, 40, 513, P.ink, (pen) => {
      footShadow(pen, 5, 1.8);
      drum(pen, 0, 0, 3.6, 1.1, 1.4, DUSK);
      // a slim four-sided obelisk with a rose-inlaid face and a ring at its point
      plate(pen, [
        [-1.9, -2.2],
        [-1.25, -31],
        [0.25, -31],
        [0.45, -2.2],
      ], BODY, { light: 0.55, dark: 0.25 });
      plate(pen, [
        [0.45, -2.2],
        [0.25, -31],
        [1.15, -31],
        [1.9, -2.2],
      ], GLAZE, { light: 0.1, dark: 0.3 });
      for (const y of [-25, -21, -17]) line(pen, [
        [-1.05, y],
        [0, y],
      ], ROSE, 0.45, 0.85);
      halfRing(pen, 0, -32.6, 3.2, 0.8, ROSE, 0.5, false);
      plate(pen, [
        [-1.25, -31],
        [0.1, -35.2],
        [0.25, -31],
      ], lighten(BODY, 0.1), { line: 0.6 });
      plate(pen, [
        [0.25, -31],
        [0.1, -35.2],
        [1.15, -31],
      ], GLAZE, { line: 0.6 });
      halfRing(pen, 0, -32.6, 3.2, 0.8, ROSE, 0.5, true);
      glow(pen, 0.1, -35.4, 1.4, LIT, 0.6);
    }),
};

/**
 * Units face right; pose 1 is mid-stride (or firing). The worker, scout, prism, celadon wing and
 * ships fly: they are drawn without legs or a foot shadow (the scene lifts them and draws theirs).
 */
export const CHOIR_UNITS: Record<UnitKind, (pose: 0 | 1) => Art> = {
  worker: (pose) =>
    paint(14, 16, 7, 14, 601 + pose, P.ink, (pen) => {
      // a porcelain bead in a rose ring (pose 1: tuning the ore with a thread of light)
      const ry = pose ? 2 : 1.4;
      halfRing(pen, 0, -7, 5.4, ry, ROSE, 0.7, false);
      orb(pen, 0, -3.8, 0.8, 0.6, GLAZE, { line: 0.4 });
      orb(pen, 0, -7, 3, 3, BODY);
      glow(pen, 1.2, -5.8, 1.8, CEL, 0.35);
      shard(pen, 0, -9.7, 1.4, 2.2, BODY, CEL);
      glow(pen, 1.5, -7.6, 1, ROSE, 0.8);
      halfRing(pen, 0, -7, 5.4, ry, ROSE, 0.7, true);
      if (pose) {
        line(pen, [
          [2.4, -5],
          [5.4, -1.4],
        ], LIT, 0.5, 0.6);
        glow(pen, 5.4, -1.4, 1.1, P.shot, 0.85);
      }
    }),
  scout: (pose) =>
    paint(20, 14, 10, 12, 603 + pose, P.ink, (pen) => {
      // a small crystal eye drifting in an upright ring, two glazed fins trailing
      const rx = pose ? 3.2 : 2.4;
      halfRing(pen, -0.6, -6, rx, 4.8, ROSE, 0.6, false, { from: UPRIGHT });
      plate(pen, [
        [-6, -6],
        [-9.4, -7.6],
        [-8.4, -6],
      ], GLAZE, { line: 0.5 });
      plate(pen, [
        [-6, -6],
        [-9.4, -4.4],
        [-8.4, -6],
      ], GLAZE, { line: 0.5 });
      const up: Pt2[] = [];
      const lo: Pt2[] = [];
      for (let i = 0; i <= 10; i++) {
        const s = Math.sin((Math.PI * i) / 10);
        up.push([-6 + 1.2 * i, -6 - 3 * s]);
        lo.push([-6 + 1.2 * i, -6 + 2.4 * s]);
      }
      lo.reverse();
      plate(pen, [...up, ...lo], BODY, { light: 0.55, dark: 0.25 });
      plate(pen, [[-6, -6], ...lo], GLAZE, { light: 0.1, dark: 0.3, line: 0.45 });
      orb(pen, 1.2, -6.3, 2, 2, ROSE, { line: 0.45 });
      orb(pen, 1.5, -6.3, 0.45, 1.3, P.ink, { line: 0 });
      glow(pen, 0.6, -7.3, 0.7, LIT, 0.9);
      if (pose) glow(pen, 1.2, -6.3, 3.2, ROSE, 0.45);
      halfRing(pen, -0.6, -6, rx, 4.8, ROSE, 0.6, true, { from: UPRIGHT });
    }),
  t1: (pose) =>
    paint(12, 18, 6, 16, 605 + pose, P.ink, (pen) => {
      chorister(pen, pose);
      // the light blade (raised and ringing when it strikes)
      const hand: Pt2 = pose ? [3.1, -11.2] : [3, -7.6];
      const tip: Pt2 = pose ? [4.7, -15] : [5.1, -3.8];
      line(pen, [[1.5, -9.8], hand], DUSK, 0.7);
      line(pen, [hand, tip], LIT, 0.9, 0.8);
      line(pen, [hand, tip], lighten(LIT, 0.5), 0.35, 0.95);
      if (pose) glow(pen, tip[0], tip[1], 0.9, P.shot, 0.9);
    }),
  t1b: (pose) =>
    paint(14, 18, 6, 16, 607 + pose, P.ink, (pen) => {
      chorister(pen, pose);
      // the bow of light; drawn, an arrow of light on its string
      const nock: Pt2 = pose ? [1.8, -8.6] : [4.2, -8.6];
      line(pen, [[4.2, -13.6], nock, [4.2, -3.6]], lighten(LIT, 0.3), 0.25, 0.8);
      line(pen, [
        [4.2, -13.6],
        [5.4, -12],
        [6.1, -8.6],
        [5.4, -5.2],
        [4.2, -3.6],
      ], ROSE, 0.7, 0.9);
      line(pen, [
        [4.3, -13.4],
        [5.3, -12],
        [5.9, -8.6],
      ], lighten(LIT, 0.4), 0.25, 0.8);
      line(pen, [
        [1.4, -10],
        [5.7, -8.8],
      ], DUSK, 0.7);
      if (pose) {
        line(pen, [[-0.4, -9.6], nock], DUSK, 0.6);
        line(pen, [nock, [6.8, -8.6]], lighten(LIT, 0.3), 0.5, 0.95);
        glow(pen, 6.8, -8.6, 0.85, P.shot, 0.9);
      }
    }),
  t2: (pose) =>
    paint(24, 30, 12, 28, 609 + pose, P.ink, (pen) => {
      footShadow(pen, 7.5, 2);
      line(pen, [
        [-2.2, -8.5],
        [-2.8 + pose * 1.4, 0],
      ], shade(DUSK, 0.15), 2.2);
      line(pen, [
        [2, -8.5],
        [2.6 - pose * 1.4, 0],
      ], DUSK, 2.2);
      line(pen, [
        [-5, -17.6],
        [-6.4, -11],
      ], DUSK, 1.4);
      // a broad crystal body with a rose heart
      plate(pen, [
        [-4.6, -7.5],
        [-6.2, -17.5],
        [-2.6, -22],
        [0.8, -21.4],
        [0.8, -7],
      ], BODY, { light: 0.55, dark: 0.25 });
      plate(pen, [
        [0.8, -7],
        [0.8, -21.4],
        [4.4, -21],
        [5.8, -16.4],
        [4, -7.6],
      ], GLAZE, { light: 0.1, dark: 0.3 });
      shard(pen, -5, -17.4, 3.4, 5, BODY, CEL, { tilt: -0.8 });
      shard(pen, 4.8, -17, 3.4, 5.6, BODY, CEL, { tilt: 0.6 });
      shard(pen, -0.8, -21.6, 3, 5, BODY, CEL);
      orb(pen, -1.4, -14.5, 0.9, 0.9, SPOT, { line: 0.35 });
      glow(pen, -1.4, -14.5, 2.4, ROSE, 0.55);
      line(pen, [
        [4.6, -17],
        [7.2, -13.6],
      ], DUSK, 1.3);
      // the wide shield ring held in front (it flares when it takes a blow)
      const sx = pose ? 8.8 : 8.2;
      halfRing(pen, sx, -14, 2.6, 9.8, ROSE, 0.8, false, { from: UPRIGHT });
      orb(pen, sx, -14, 2.4, 9.4, LIT, { alpha: pose ? 0.42 : 0.26, line: 0 });
      if (pose) glow(pen, sx, -14, 3, LIT, 0.4);
      halfRing(pen, sx, -14, 2.6, 9.8, ROSE, 0.8, true, { from: UPRIGHT });
    }),
  t2s: (pose) =>
    paint(28, 20, 12, 17, 611 + pose, P.ink, (pen) => {
      // a prism of crystal lying in the air, light folding inside it, in an upright ring
      halfRing(pen, -1, -10.4, 2, 5.4, ROSE, 0.55, false, { from: UPRIGHT });
      plate(pen, [
        [-8, -14],
        [6, -14.8],
        [6.8, -7],
        [-9, -6.5],
      ], BODY, { light: 0.6, dark: 0.2 });
      plate(pen, [
        [6, -14.8],
        [10, -11.2],
        [6.8, -7],
      ], GLAZE, { light: 0.2, dark: 0.3 });
      glow(pen, -1, -10.6, 3.6, ROSE, 0.35);
      line(pen, [
        [-4.2, -13.8],
        [-1.4, -6.8],
      ], LIT, 0.5, 0.6);
      line(pen, [
        [1, -14.3],
        [3.4, -6.9],
      ], LIT, 0.4, 0.45);
      line(pen, [
        [-7.6, -13.2],
        [5.6, -14],
      ], lighten(BODY, 0.5), 0.5, 0.7);
      halfRing(pen, -1, -10.4, 2, 5.4, ROSE, 0.55, true, { from: UPRIGHT });
      if (pose) {
        // the light it bends, thrown ahead
        line(pen, [
          [8, -11],
          [14.6, -11.6],
        ], P.shot, 0.8, 0.85);
        glow(pen, 10.4, -11, 2.2, P.shot, 0.9);
      } else glow(pen, 8.4, -11, 1.2, LIT, 0.5);
    }),
  t3: (pose) =>
    paint(24, 34, 12, 32, 613 + pose, P.ink, (pen) => {
      footShadow(pen, 9, 2);
      // a tall gatekeeper of white porcelain: a maebyeong body on two pillar legs, a rose ring
      // at its shoulder
      plate(pen, [
        [-5.6, -22],
        [-8.4, -21],
        [-9.4, -12.5],
        [-7.8, -9.6],
        [-6, -12.5],
      ], BACK, { light: 0.4, dark: 0.35 });
      const st = pose ? 1.2 : 0;
      plate(pen, [
        [-4.6, -9.5],
        [-1.2, -9.5],
        [-1.6 + st, -0.2],
        [-5 + st, -0.2],
      ], BACK);
      plate(pen, [
        [1.2, -9.5],
        [4.6, -9.5],
        [5 - st, -0.2],
        [1.6 - st, -0.2],
      ], BODY);
      thrown(pen, 0, -8.6, 18, 6.6, MAEBYEONG, BODY, { glaze: 0.6 });
      halfRing(pen, 0, -11, 3.7, 0.9, CEL, 0.45, true, { halo: false });
      halfRing(pen, 0, -21.6, 6.8, 1.5, ROSE, 0.8, true);
      shard(pen, 0, -26.2, 3.4, 5.4, BODY, CEL);
      glow(pen, 0.8, -28.6, 0.8, ROSE, 0.9);
      // the front arm hangs, or strikes forward
      const arm: Pt2[] = pose
        ? [
            [5.4, -22.6],
            [8.4, -23.6],
            [11.4, -17.2],
            [10, -15.2],
            [6.6, -18.6],
          ]
        : [
            [5.4, -22.6],
            [8.4, -21.4],
            [9.4, -12.6],
            [7.6, -9.4],
            [5.8, -12.4],
          ];
      plate(pen, arm, mix(BODY, CEL, 0.3));
      if (pose) glow(pen, 10.6, -16.4, 1.2, P.shot, 0.85);
    }),
  t3a: (pose) =>
    paint(30, 22, 14, 20, 615 + pose, P.ink, (pen) => {
      // 'celadon wing': a crane of celadon in the upper air with a rose crown; wings up, then a
      // down-stroke as it strikes
      const wing = mix(CEL, BODY, 0.2);
      const far: Pt2[] = pose
        ? [
            [-1, -11.5],
            [-8, -15.5],
            [-11, -14],
            [-4.5, -11],
          ]
        : [
            [-1, -11.5],
            [-6, -19],
            [-9, -18.6],
            [-4.5, -11],
          ];
      plate(pen, far, shade(wing, 0.25), { light: 0.2, dark: 0.3 });
      line(pen, [
        [-8, -10.6],
        [-13, -12.4],
      ], GLAZE, 0.6, 0.85);
      line(pen, [
        [-8, -10],
        [-13.2, -9.2],
      ], GLAZE, 0.6, 0.85);
      drop(pen, 0, -10.4, 18, 2.6, mix(BODY, CEL, 0.2));
      plate(pen, [
        [6.4, -12],
        [10, -13.6],
        [10.8, -11.8],
        [7.8, -9.6],
      ], BODY, { line: 0.6 });
      orb(pen, 10.8, -12.8, 1.5, 1.2, BODY, { line: 0.5 });
      plate(pen, [
        [12, -13.1],
        [14.8, -12.5],
        [12, -12.1],
      ], DUSK, { line: 0.5 });
      glow(pen, 10.4, -13.6, 0.8, ROSE, 0.9);
      const near: Pt2[] = pose
        ? [
            [0.5, -11.8],
            [-5, -15.6],
            [-9.6, -15.8],
            [-11, -14.6],
            [-3.6, -10.6],
          ]
        : [
            [0.5, -11.8],
            [-3, -19.2],
            [-6.2, -19.4],
            [-7.5, -18.4],
            [-3.6, -11],
          ];
      plate(pen, near, wing, { light: 0.5, dark: 0.25 });
      line(pen, [near[0], near[1]], lighten(BODY, 0.3), 0.5, 0.85);
      // inlaid feather lines
      for (const q of [near[2], near[3]]) line(pen, [
        [-1.4, -11.6],
        [q[0] + 0.6, q[1] + 0.6],
      ], P.ink, 0.25, 0.55);
      if (pose) glow(pen, 14.8, -12.5, 0.9, P.shot, 0.9);
    }),
  s1: (pose) =>
    paint(40, 18, 20, 12, 617 + pose, P.ink, (pen) => {
      // 'droplet': a drop of crystal through an upright ring, two small drops in its wake
      glow(pen, -16.6, -3, 1.6 + pose * 0.8, LIT, 0.7);
      drop(pen, -6.5, -9.6, 7, 1.1);
      drop(pen, -9.5, 3.4, 6, 1);
      halfRing(pen, 1, -3, 1.6, 6.4, ROSE, 0.7, false, { from: UPRIGHT });
      drop(pen, -2.5, -3, 29, 4.1);
      glow(pen, 6, -3.6, 3, ROSE, 0.4);
      orb(pen, 7.6, -5.6, 2, 0.7, lighten(BODY, 0.45), { line: 0, alpha: 0.7 });
      halfRing(pen, 1, -3, 1.6, 6.4, ROSE, 0.7, true, { from: UPRIGHT });
      if (pose) glow(pen, 12.8, -3, 1.6, P.shot, 0.9);
    }),
  s2: (pose) =>
    paint(80, 32, 40, 18, 619 + pose, P.ink, (pen) => {
      // 'moon jar': a white moon jar leaning into its course, held in a net of light that trails
      // behind it, a ring round its belly
      for (const [x, y] of [
        [-4, -11],
        [-6, -4],
        [-6, 1.5],
        [-4, 7],
      ] as const) line(pen, [
        [x, y],
        [-33, -2],
      ], LIT, 0.35, 0.4);
      glow(pen, -33, -2, 2.4, LIT, 0.5);
      glow(pen, 4, 11, 2.6, LIT, 0.4);
      halfRing(pen, 5, -1.5, 19, 3.8, ROSE, 1.1, false);
      const jar = thrown(pen, 4, 10, 23, 13, JAR, BODY, { lean: 0.06 });
      net(pen, jar, 4.7, -1.5, 13, 12.5);
      drum(pen, 5.4, -11.8, 4.3, 1.2, 1.3, BODY);
      orb(pen, 5.4, -14.3, 3.1, 0.8, DEEP, { gloss: 0.3, line: 0.4 });
      glow(pen, 5.4, -14.6, 3, ROSE, 0.5);
      halfRing(pen, 5, -1.5, 19, 3.8, ROSE, 1.1, true);
      if (pose) glow(pen, 24, -0.4, 2.2, P.shot, 0.9);
    }),
  s3: (pose) =>
    paint(150, 60, 75, 32, 621 + pose, P.ink, (pen) => {
      // 'heavenly choir': a nave of porcelain with its spires hanging upside down beneath it,
      // letting down a column of chord light from the longest (its bow glows as it charges)
      beam(pen, -4, 11, 28, 3.2, 10, ROSE, pose ? 0.7 : 0.55);
      beam(pen, -4, 11, 28, 1, 3, LIT, 0.75);
      for (const [x, len, w] of [
        [-50, 6, 2.4],
        [-40, 9, 2.8],
        [-29, 12, 3.2],
        [-17, 15, 3.6],
        [9, 14, 3.6],
        [21, 11, 3.2],
        [33, 8, 2.8],
        [44, 5.5, 2.4],
      ] as const) {
        thrown(pen, x, -6, -len, w, SPIRE, BACK, { glaze: 0.55 });
        glow(pen, x, -5.4 + len, 1.1, LIT, 0.55);
      }
      halfRing(pen, -4, 3, 7, 1.6, ROSE, 0.9, false);
      thrown(pen, -4, -6, -18, 4.2, SPIRE, BODY);
      halfRing(pen, -4, 3, 7, 1.6, ROSE, 0.9, true);
      glow(pen, -4, 12, 1.8, LIT, 0.8);
      // the nave, its glazed keel and its roof
      plate(pen, [
        [-62, -11],
        [-56, -18],
        [50, -18],
        [68, -12],
        [52, -5],
        [-56, -4],
      ], BODY, { light: 0.5, dark: 0.3 });
      plate(pen, [
        [-59.4, -8],
        [60, -8.5],
        [52, -5],
        [-56, -4],
      ], GLAZE, { light: 0.1, dark: 0.3, line: 0.5 });
      plate(pen, [
        [-56, -18],
        [-53, -20],
        [47, -20],
        [50, -18],
      ], lighten(BODY, 0.15), { light: 0.3, dark: 0.2 });
      // lancet windows and a rose window
      for (const x of [-50, -40, -30, -20, -12, 4, 12, 22, 32, 42]) niche(pen, x, -9.6, 1, 5);
      orb(pen, -4, -11.6, 3.4, 3.4, SPOT, { gloss: 0.8, line: 0.6 });
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * i) / 6;
        line(pen, [
          [-4 - Math.cos(a) * 3.2, -11.6 - Math.sin(a) * 3.2],
          [-4 + Math.cos(a) * 3.2, -11.6 + Math.sin(a) * 3.2],
        ], P.ink, 0.25, 0.55);
      }
      glow(pen, -4, -11.6, 4.4, LIT, 0.4);
      // spires on the roof, the tallest in a ring
      for (const [x, h, w] of [
        [-46, 6, 2],
        [-34, 8.5, 2.4],
        [-20, 10.5, 2.8],
        [8, 10.5, 2.8],
        [22, 8.5, 2.4],
        [36, 6, 2],
      ] as const) thrown(pen, x, -19, h, w, SPIRE, BODY);
      halfRing(pen, -6, -25, 6, 1.4, ROSE, 0.8, false);
      thrown(pen, -6, -19, 12, 3.2, SPIRE, BODY);
      halfRing(pen, -6, -25, 6, 1.4, ROSE, 0.8, true);
      glow(pen, -6, -30.4, 1, LIT, 0.7);
      glow(pen, -63, -11, 3.4, LIT, 0.6);
      glow(pen, 68.5, -12, 2 + pose * 2.4, P.shot, 0.9);
    }),
};
