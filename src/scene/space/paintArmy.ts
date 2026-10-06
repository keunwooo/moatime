/**
 * The garrison and the raiders, in the same gouache language as the colony. Original designs:
 * guards in slate armour with white helmets and a teal visor band; tanks with an angular slate
 * hull on treads and a long-barrelled housing; the sand swarm are shell-backed
 * critters that curl up into balls; the light wardens are hovering faceted shells of light.
 * Nothing here is gory — the "fallen" states are a curled ball, a guard's shield capsule and a
 * smoking, dark tank hull.
 */

import { Rng } from '../../core/rng';
import { blobPoints, gouache, makeCanvas, softEllipse, type PaintCanvas, type Pt } from '../paint/brush';
import { css, lighten, mix, shade, vary, type RGB } from '../paint/color';
import { S } from './palette';

const TAU = Math.PI * 2;

function hull(r: Rng, base: RGB = S.hull) {
  return { base, light: mix(S.text, [255, 248, 230], 0.4), shadow: mix(S.hullShadow, S.lavender, 0.3), r, roundness: 0.85, dabDensity: 10, grain: 0.06, rimLight: 0.3 };
}

const ARMOR: RGB = mix(S.armor, S.lavender, 0.15);

/**
 * A guard, side view facing right: slate armour with a white chest plate, a white helmet with
 * a teal visor band, a backpack with a cyan cell. 48×72 for 12×18 wu, feet at (24, 68).
 * pose 0: standing at ease; 1: stepping; 2: holding the emitter forward.
 */
export function paintGuard(seed: number, pose: 0 | 1 | 2): PaintCanvas {
  const pc = makeCanvas(48, 72);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 24, 68, 11, 2.6, [20, 26, 44], 0.4, 0);
  // legs (armoured, with boots)
  ctx.strokeStyle = css(shade(ARMOR, 0.15));
  ctx.lineCap = 'round';
  ctx.lineWidth = 5.5;
  const step = pose === 1 ? 5 : 1.5;
  for (const dx of [-step, step]) {
    ctx.beginPath();
    ctx.moveTo(24, 50);
    ctx.lineTo(24 + dx, 64);
    ctx.stroke();
    ctx.fillStyle = css(shade(ARMOR, 0.4));
    ctx.fillRect(24 + dx - 3.5, 63, 8, 4);
  }
  // backpack with its cell
  gouache(ctx, [
    { x: 10, y: 30 },
    { x: 11, y: 50 },
    { x: 19, y: 51 },
    { x: 19, y: 29 },
  ], { ...hull(r, shade(ARMOR, 0.2)), roundness: 0.35 });
  softEllipse(ctx, 14.5, 38, 3, 4, S.energy, 0.95, 0);
  // armoured body with a white chest plate and a teal band
  gouache(ctx, blobPoints(25, 41, 8, 12, r, { lumps: 0.05, n: 16 }), { ...hull(r, ARMOR), shadow: shade(ARMOR, 0.3) });
  gouache(ctx, [
    { x: 24, y: 31 },
    { x: 32, y: 33 },
    { x: 32, y: 44 },
    { x: 25, y: 46 },
  ], { ...hull(r), roundness: 0.4 });
  ctx.fillStyle = css(S.team, 0.95);
  ctx.fillRect(18, 47, 15, 2.5);
  // arm with the emitter
  ctx.strokeStyle = css(ARMOR);
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(27, 34);
  if (pose === 2) ctx.lineTo(39, 37);
  else ctx.lineTo(30, 47);
  ctx.stroke();
  ctx.fillStyle = css(shade(ARMOR, 0.35));
  if (pose === 2) {
    ctx.fillRect(36, 34, 11, 4.5);
    softEllipse(ctx, 47, 36, 2.4, 2.4, S.energy, 0.9, 0);
  } else ctx.fillRect(28, 46, 4, 9);
  // helmet with a visor band
  gouache(ctx, blobPoints(25, 21, 9, 9, r, { lumps: 0.03, n: 18 }), hull(r));
  ctx.fillStyle = css(mix(S.deep, S.space, 0.4));
  ctx.beginPath();
  ctx.moveTo(22, 18);
  ctx.lineTo(34, 19);
  ctx.lineTo(34, 24);
  ctx.lineTo(23, 23.5);
  ctx.fill();
  ctx.fillStyle = css(S.energy, 0.85);
  ctx.fillRect(26, 20, 7, 1.6);
  ctx.fillStyle = css(S.team, 0.95);
  ctx.fillRect(17, 15, 3, 7);
  return pc;
}

/**
 * Tank hull, side view facing right: a tread band under an angular armoured hull with white
 * upper plates and the colony's teal stripe. 160×80 for 64×32 wu, base (80, 74).
 */
export function paintTankHull(seed: number): PaintCanvas {
  const pc = makeCanvas(160, 80);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 84, 74, 66, 6, [20, 26, 44], 0.45, 0);
  // the tread: a rounded band with road wheels inside
  const tread: Pt[] = [
    { x: 24, y: 58 },
    { x: 30, y: 72 },
    { x: 132, y: 72 },
    { x: 142, y: 58 },
    { x: 132, y: 52 },
    { x: 30, y: 52 },
  ];
  gouache(ctx, tread, { ...hull(r, shade(ARMOR, 0.45)), roundness: 0.6, dabDensity: 8 });
  for (let i = 0; i < 6; i++) {
    const x = 38 + i * 18;
    ctx.fillStyle = css(shade(ARMOR, 0.2));
    ctx.beginPath();
    ctx.arc(x, 63, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = css(S.metal);
    ctx.beginPath();
    ctx.arc(x, 63, 2.4, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = css(shade(ARMOR, 0.6), 0.8);
  ctx.lineWidth = 1.2;
  for (let x = 30; x < 136; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 71);
    ctx.lineTo(x + 2, 73);
    ctx.stroke();
  }
  // the hull: sloped glacis forward, a flat deck, a stepped rear
  const body: Pt[] = [
    { x: 16, y: 54 },
    { x: 20, y: 38 },
    { x: 40, y: 30 },
    { x: 118, y: 30 },
    { x: 148, y: 44 },
    { x: 146, y: 54 },
  ];
  gouache(ctx, body, { ...hull(r, ARMOR), roundness: 0.25, dabDensity: 14 });
  gouache(ctx, [
    { x: 42, y: 31 },
    { x: 116, y: 31 },
    { x: 124, y: 38 },
    { x: 40, y: 38 },
  ], { ...hull(r), roundness: 0.2 });
  ctx.fillStyle = css(S.team, 0.95);
  ctx.fillRect(22, 46, 120, 3.5);
  // headlight and a running light
  softEllipse(ctx, 142, 46, 4, 3, S.window, 1, 0);
  softEllipse(ctx, 22, 40, 2.6, 2.6, S.coral, 1, 0);
  return pc;
}

/** Tank turret: an angular housing with a long barrel pointing right; pivot (40, 28). 112×48 for 44×19 wu. */
export function paintTankTurret(seed: number): PaintCanvas {
  const pc = makeCanvas(112, 48);
  const { ctx } = pc;
  const r = new Rng(seed);
  // barrel with a muzzle brake and an energy coil
  gouache(ctx, [
    { x: 54, y: 22 },
    { x: 54, y: 29 },
    { x: 104, y: 28 },
    { x: 104, y: 23 },
  ], { ...hull(r, shade(ARMOR, 0.25)), roundness: 0.2, dabDensity: 6 });
  ctx.fillStyle = css(shade(ARMOR, 0.5));
  ctx.fillRect(98, 20.5, 8, 10);
  ctx.fillStyle = css(S.energy, 0.85);
  ctx.fillRect(66, 23.5, 10, 4);
  // the housing
  gouache(ctx, [
    { x: 14, y: 38 },
    { x: 18, y: 18 },
    { x: 30, y: 12 },
    { x: 56, y: 12 },
    { x: 66, y: 22 },
    { x: 64, y: 38 },
  ], { ...hull(r), roundness: 0.2 });
  ctx.fillStyle = css(ARMOR, 0.95);
  ctx.fillRect(16, 30, 48, 8);
  ctx.fillStyle = css(S.team, 0.95);
  ctx.fillRect(18, 27, 44, 2.5);
  // sight
  ctx.fillStyle = css(mix(S.deep, S.space, 0.4));
  ctx.fillRect(44, 15, 12, 5);
  softEllipse(ctx, 53, 17.5, 2.5, 2, S.energy, 0.9, 0);
  return pc;
}

/** A sand-swarm critter, side view facing right (or curled into a ball). 64×48 for 22×16 wu, base (32, 44). */
export function paintCritter(seed: number, curled: boolean): PaintCanvas {
  const pc = makeCanvas(64, 48);
  const { ctx } = pc;
  const r = new Rng(seed);
  const shell = mix(S.dust, [196, 150, 104], 0.55);
  softEllipse(ctx, 32, 44, 18, 3, [20, 26, 44], 0.4, 0);
  if (curled) {
    gouache(ctx, blobPoints(32, 30, 13, 13, r, { lumps: 0.05, n: 18 }), { base: shell, light: lighten(shell, 0.35), shadow: shade(shell, 0.35), r, roundness: 0.95, dabDensity: 10, grain: 0.1 });
    ctx.strokeStyle = css(shade(shell, 0.35), 0.8);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(32, 30, 5 + i * 3.5, -1.2, 1.4);
      ctx.stroke();
    }
    return pc;
  }
  // stubby feet peeking out under the rim
  for (let i = 0; i < 4; i++) softEllipse(ctx, 18 + i * 9, 41, 3.4, 2.2, shade(shell, 0.45), 0.95, 0);
  // a round shell made of three overlapping plates, scalloped at the rim
  const dome: Pt[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (i / 20) * Math.PI;
    dome.push({ x: 31 + Math.cos(a) * 20, y: 39 + Math.sin(a) * 19 });
  }
  gouache(ctx, dome, { base: shell, light: lighten(shell, 0.35), shadow: shade(shell, 0.35), r, roundness: 0.95, dabDensity: 12, grain: 0.1 });
  ctx.strokeStyle = css(shade(shell, 0.32), 0.75);
  ctx.lineWidth = 1.5;
  for (const k of [0.45, 0.75]) {
    ctx.beginPath();
    ctx.ellipse(31, 39, 20 * k, 19 * k, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  // scalloped rim and a pale band
  for (let i = 0; i < 5; i++) softEllipse(ctx, 15 + i * 8, 38, 4.2, 2.4, lighten(shell, 0.2), 0.8, 0);
  // a small face at the front
  ctx.fillStyle = css(shade(shell, 0.5));
  ctx.beginPath();
  ctx.ellipse(49, 33, 4, 4.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = css(mix(S.window, [255, 240, 200], 0.4));
  for (const y of [31.5, 35]) {
    ctx.beginPath();
    ctx.arc(50.5, y, 1.3, 0, TAU);
    ctx.fill();
  }
  return pc;
}

/** A light warden: a hovering faceted shell of pale light around a glowing core. 96×96 for 36×36 wu, centre. */
export function paintWarden(seed: number): PaintCanvas {
  const pc = makeCanvas(96, 96);
  const { ctx } = pc;
  const r = new Rng(seed);
  const glass = mix(S.lavender, [210, 236, 240], 0.55);
  const core = ctx.createRadialGradient(48, 48, 0, 48, 48, 20);
  core.addColorStop(0, 'rgba(255,255,245,0.95)');
  core.addColorStop(0.5, css(mix(S.teal, S.text, 0.4), 0.6));
  core.addColorStop(1, css(S.teal, 0));
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 96, 96);
  // facets: an irregular octagon split into triangles from the centre
  const n = 8;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.range(-0.12, 0.12);
    const rad = r.range(30, 40);
    pts.push({ x: 48 + Math.cos(a) * rad, y: 48 + Math.sin(a) * rad * 1.1 });
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    ctx.fillStyle = css(vary(glass, r), r.range(0.18, 0.38));
    ctx.beginPath();
    ctx.moveTo(48, 48);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(lighten(glass, 0.4), 0.7);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  return pc;
}

/** A guard's shield capsule: a small translucent dome. 64×48 for 24×18 wu, base (32, 44). */
export function paintCapsule(): PaintCanvas {
  const pc = makeCanvas(64, 48);
  const { ctx } = pc;
  const g = ctx.createRadialGradient(28, 24, 2, 32, 34, 30);
  g.addColorStop(0, css(mix(S.teal, S.text, 0.6), 0.55));
  g.addColorStop(1, css(S.teal, 0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(32, 44, 26, 34, 0, Math.PI, TAU);
  ctx.fill();
  ctx.strokeStyle = css(lighten(S.teal, 0.5), 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(32, 44, 26, 34, 0, Math.PI, TAU);
  ctx.stroke();
  ctx.fillStyle = css(S.text, 0.45);
  ctx.beginPath();
  ctx.ellipse(22, 22, 5, 2.4, -0.6, 0, TAU);
  ctx.fill();
  return pc;
}

/** Rubble of a lost building: bent panels, a beam, crates. 320×160 for 160×80 wu, base (160, 150). */
export function paintRubble(seed: number): PaintCanvas {
  const pc = makeCanvas(320, 160);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 166, 150, 150, 14, [20, 26, 44], 0.5, 0);
  for (let i = 0; i < 9; i++) {
    const x = 60 + r.range(0, 200);
    const y = 150 - r.range(0, 30);
    const w = r.range(30, 70);
    const h = r.range(10, 22);
    const a = r.range(-0.6, 0.6);
    const pts: Pt[] = [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 },
    ].map((p) => ({ x: x + p.x * Math.cos(a) - p.y * Math.sin(a), y: y - 8 + p.x * Math.sin(a) + p.y * Math.cos(a) }));
    gouache(ctx, pts, { ...hull(r, r.chance(0.5) ? S.hull : mix(S.hull, S.hullShadow, 0.5)), roundness: 0.2, dabDensity: 8 });
  }
  ctx.strokeStyle = css(S.metal);
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(90, 146);
  ctx.lineTo(210, 104);
  ctx.stroke();
  // scorch marks
  for (let i = 0; i < 4; i++) softEllipse(ctx, 100 + r.range(0, 120), 140 - r.range(0, 30), r.range(14, 26), r.range(5, 9), [44, 40, 56], 0.35, 0);
  return pc;
}
