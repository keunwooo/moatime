/**
 * The colony's drones, painted once (side view, facing right, 2 px per world unit):
 *
 * - the work drone: a hovering hauler with two thruster pods, a teal stripe and a cargo clamp
 *   under its belly (the manipulator arm and the beam are added by the scene);
 * - the maintenance drone: a small quad-rotor with a coral stripe and a welding arm.
 *
 * Same gouache language as the buildings: soft outlines, light from the upper left.
 */

import { Rng } from '../../core/rng';
import { fray, gouache, makeCanvas, smoothPath, softEllipse, type PaintCanvas, type Pt } from '../paint/brush';
import { css, mix, shade } from '../paint/color';
import { hullOpts } from './paint';
import { S } from './palette';

const TAU = Math.PI * 2;

/** Pixel position of a point given in world units around the canvas origin. */
const at = (ox: number, oy: number) => (x: number, y: number): Pt => ({ x: ox + x * 2, y: oy + y * 2 });

/** Work drone body: 200×100 px for 100×50 wu; origin (hull center) at px (100, 50). */
export const HAULER = { W: 200, H: 100, ox: 100, oy: 50 } as const;

export function paintHauler(seed: number): PaintCanvas {
  const pc = makeCanvas(HAULER.W, HAULER.H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const p = at(HAULER.ox, HAULER.oy);
  const metal = mix(S.armor, S.hullShadow, 0.35);
  // thruster pods (behind the hull)
  for (const cx of [-27, 25]) {
    const pod: Pt[] = [p(cx - 9, 2), p(cx + 9, 2), p(cx + 8, 14), p(cx + 4, 17), p(cx - 4, 17), p(cx - 8, 14)];
    gouache(ctx, pod, { ...hullOpts(r, metal), roundness: 0.45 });
    // the nozzle ring
    ctx.fillStyle = css(shade(S.armor, 0.45));
    ctx.beginPath();
    ctx.ellipse(p(cx, 17).x, p(cx, 17).y, 9, 3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = css(S.energy, 0.85);
    ctx.beginPath();
    ctx.ellipse(p(cx, 17).x, p(cx, 17).y + 1, 6, 1.6, 0, 0, TAU);
    ctx.fill();
  }
  // hull: a low chamfered wedge, nose forward
  const hull: Pt[] = [p(-42, -2), p(-36, -12), p(-14, -16), p(22, -15), p(38, -8), p(44, 0), p(38, 7), p(-38, 7)];
  gouache(ctx, hull, { ...hullOpts(r), roundness: 0.35 });
  // armour plate along the back
  const plate: Pt[] = [p(-36, -11), p(-14, -15), p(10, -14.5), p(6, -9), p(-30, -8)];
  ctx.fillStyle = css(mix(S.armor, S.lavender, 0.2), 0.95);
  ctx.fill(smoothPath(plate));
  ctx.fillStyle = css(S.text, 0.18);
  ctx.fillRect(p(-26, -12).x, p(-26, -12).y, 40, 2);
  // the colony's teal stripe and a belly in shadow
  ctx.fillStyle = css(S.team, 0.95);
  ctx.beginPath();
  ctx.moveTo(p(-40, -1).x, p(-40, -1).y);
  ctx.lineTo(p(41, -1).x, p(41, -1).y);
  ctx.lineTo(p(42, 2).x, p(42, 2).y);
  ctx.lineTo(p(-39, 2).x, p(-39, 2).y);
  ctx.fill();
  ctx.fillStyle = css(mix(S.hullShadow, S.lavender, 0.4), 0.85);
  ctx.fillRect(p(-37, 4).x, p(-37, 4).y, 148, 5);
  // sensor visor and its eye at the nose
  const visor: Pt[] = [p(18, -13), p(34, -8), p(38, -3), p(20, -4)];
  ctx.fillStyle = css(mix(S.deep, S.space, 0.4));
  ctx.fill(smoothPath(visor));
  softEllipse(ctx, p(31, -6).x, p(31, -6).y, 7, 4, S.energy, 0.95, 0);
  ctx.fillStyle = css([255, 255, 255], 0.8);
  ctx.beginPath();
  ctx.arc(p(31, -6).x, p(31, -6).y, 1.8, 0, TAU);
  ctx.fill();
  // tail fin with a running light
  const fin: Pt[] = [p(-36, -11), p(-44, -24), p(-39, -25), p(-28, -13)];
  gouache(ctx, fin, { ...hullOpts(r, mix(S.hull, S.hullShadow, 0.25)), roundness: 0.3 });
  softEllipse(ctx, p(-42, -24).x, p(-42, -24).y, 4, 4, S.coral, 1, 0);
  // panel seams
  ctx.strokeStyle = css(S.hullShadow, 0.55);
  ctx.lineWidth = 1.2;
  for (const x of [-20, 2]) {
    ctx.beginPath();
    ctx.moveTo(p(x, -14).x, p(x, -14).y);
    ctx.lineTo(p(x - 1, 6).x, p(x - 1, 6).y);
    ctx.stroke();
  }
  fray(ctx, hull, S.hull, r, 2, 0.12);
  return pc;
}

/** Maintenance drone body: 160×110 px for 80×55 wu; origin (body center) at px (80, 60). */
export const FIXER = { W: 160, H: 110, ox: 80, oy: 60 } as const;

export function paintFixer(seed: number): PaintCanvas {
  const pc = makeCanvas(FIXER.W, FIXER.H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const p = at(FIXER.ox, FIXER.oy);
  const metal = mix(S.armor, S.hullShadow, 0.3);
  // rotor arms and hubs (the discs are separate sprites so they can spin)
  for (const s of [-1, 1]) {
    ctx.strokeStyle = css(shade(metal, 0.15));
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p(s * 8, -6).x, p(s * 8, -6).y);
    ctx.lineTo(p(s * 30, -13).x, p(s * 30, -13).y);
    ctx.stroke();
    const hub: Pt[] = [p(s * 30 - 5, -12), p(s * 30 - 4, -18), p(s * 30 + 4, -18), p(s * 30 + 5, -12)];
    gouache(ctx, hub, { ...hullOpts(r, metal), roundness: 0.5 });
  }
  // body: a compact octagon
  const body: Pt[] = [p(-15, -9), p(-9, -14), p(9, -14), p(16, -8), p(16, 4), p(10, 10), p(-10, 10), p(-16, 4)];
  gouache(ctx, body, { ...hullOpts(r), roundness: 0.4 });
  // coral band with hazard ticks
  ctx.fillStyle = css(S.coral, 0.95);
  ctx.fillRect(p(-16, -2).x, p(-16, -2).y, 64, 6);
  ctx.fillStyle = css(S.text, 0.85);
  for (let i = 0; i < 4; i++) {
    const x = p(-12 + i * 7, -2).x;
    ctx.beginPath();
    ctx.moveTo(x, p(0, -2).y);
    ctx.lineTo(x + 4, p(0, -2).y);
    ctx.lineTo(x + 1, p(0, 1).y);
    ctx.lineTo(x - 3, p(0, 1).y);
    ctx.fill();
  }
  // lens at the front, a warning light on top
  ctx.fillStyle = css(mix(S.deep, S.space, 0.4));
  ctx.beginPath();
  ctx.ellipse(p(11, -7).x, p(11, -7).y, 7, 5, 0, 0, TAU);
  ctx.fill();
  softEllipse(ctx, p(12, -7).x, p(12, -7).y, 5, 4, S.energy, 0.95, 0);
  softEllipse(ctx, p(0, -16).x, p(0, -16).y, 5, 4, S.coral, 1, 0);
  // underside
  ctx.fillStyle = css(mix(S.hullShadow, S.lavender, 0.4), 0.8);
  ctx.fillRect(p(-12, 6).x, p(-12, 6).y, 48, 6);
  fray(ctx, body, S.hull, r, 2, 0.12);
  return pc;
}

/** A spinning rotor seen from the side: a thin blurred disc. 96×24 px. */
export function paintRotor(): PaintCanvas {
  const pc = makeCanvas(96, 24);
  const { ctx } = pc;
  softEllipse(ctx, 48, 12, 46, 6, mix(S.text, S.hullShadow, 0.4), 0.55, 0.05);
  ctx.strokeStyle = css(S.text, 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(48, 12, 44, 4, 0, 0, TAU);
  ctx.stroke();
  return pc;
}

/** A soft straight beam (mining laser, welding arc), white, to be tinted. 64×16 px. */
export function paintBeam(): PaintCanvas {
  const pc = makeCanvas(64, 16);
  const { ctx } = pc;
  const g = ctx.createLinearGradient(0, 0, 0, 16);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 16);
  // soft ends
  ctx.globalCompositeOperation = 'destination-in';
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0.2)');
  h.addColorStop(0.1, 'rgba(0,0,0,1)');
  h.addColorStop(0.9, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 64, 16);
  return pc;
}

/** Defence drone: a slim armoured wedge with a gun pod; 112×64 px for 56×32 wu, origin at px (56, 32). */
export const SENTRY = { W: 112, H: 64, ox: 56, oy: 32 } as const;

export function paintSentry(seed: number): PaintCanvas {
  const pc = makeCanvas(SENTRY.W, SENTRY.H);
  const { ctx } = pc;
  const r = new Rng(seed);
  const p = at(SENTRY.ox, SENTRY.oy);
  const armor = mix(S.armor, S.lavender, 0.15);
  // gun pod under the nose
  const pod: Pt[] = [p(4, 4), p(24, 4), p(26, 8), p(6, 9)];
  gouache(ctx, pod, { ...hullOpts(r, shade(armor, 0.3)), roundness: 0.2 });
  softEllipse(ctx, p(26, 6).x, p(26, 6).y, 4, 3, S.energy, 0.95, 0);
  // body: a flat wedge
  const body: Pt[] = [p(-26, -2), p(-18, -10), p(12, -10), p(28, -2), p(18, 5), p(-22, 5)];
  gouache(ctx, body, { ...hullOpts(r, armor), roundness: 0.2 });
  const top: Pt[] = [p(-16, -9.5), p(10, -9.5), p(18, -5), p(-12, -5)];
  ctx.fillStyle = css(S.hull, 0.95);
  ctx.fill(smoothPath(top));
  ctx.fillStyle = css(S.team, 0.95);
  ctx.fillRect(p(-22, 0).x, p(-22, 0).y, 84, 4);
  // sensor and a tail light
  softEllipse(ctx, p(20, -4).x, p(20, -4).y, 4, 3, S.energy, 0.95, 0);
  softEllipse(ctx, p(-25, -3).x, p(-25, -3).y, 3, 3, S.coral, 1, 0);
  fray(ctx, body, armor, r, 2, 0.1);
  return pc;
}
