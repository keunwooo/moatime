/**
 * Small storybook figures: the textures of the keeper (see keeper.ts), a butterfly and a bird.
 * They are quiet silhouettes without faces or speech; presence comes from gait and tools.
 * Every pose is a function of progress p ∈ [0, 1], so a pause freezes them and nothing depends
 * on frame timing.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { Rng } from '../../core/rng';
import { blobPoints, gouache, makeCanvas, softEllipse, taper, curvePts, toTexture } from '../paint/brush';
import { css, lighten, mix, shade, num } from '../paint/color';
import { F } from './palette';

export interface ActorTextures {
  body: Texture;
  armCan: Texture;
  armBroom: Texture;
  wing: Texture;
  birdBody: Texture;
  birdWing: Texture;
  drop: Texture;
  all: Texture[];
}

const TAU = Math.PI * 2;

export function paintActors(): ActorTextures {
  const r = new Rng(808);
  // --- gardener body (facing right). Hip at (48, 96). ~26 wu tall.
  const b = makeCanvas(96, 112);
  const ctx = b.ctx;
  // smock
  gouache(
    ctx,
    [
      { x: 30, y: 98 },
      { x: 33, y: 70 },
      { x: 38, y: 50 },
      { x: 50, y: 46 },
      { x: 62, y: 52 },
      { x: 66, y: 74 },
      { x: 70, y: 98 },
      { x: 50, y: 102 },
    ],
    { base: mix(F.sage, F.cream, 0.35), light: lighten(F.cream, 0.2), shadow: mix(F.sage, F.moss, 0.5), r, grain: 0.08, dabDensity: 60 },
  );
  // apron
  gouache(
    ctx,
    [
      { x: 44, y: 66 },
      { x: 62, y: 64 },
      { x: 66, y: 96 },
      { x: 46, y: 98 },
    ],
    { base: F.apricot, light: lighten(F.apricot, 0.35), shadow: shade(F.apricot, 0.25), r, grain: 0.08 },
  );
  // head
  gouache(ctx, blobPoints(52, 36, 11, 12, r, { lumps: 0.03 }), {
    base: mix(F.apricot, F.cream, 0.45),
    light: lighten(F.cream, 0.3),
    shadow: mix(F.apricot, F.bark, 0.3),
    r,
    grain: 0.05,
    rimLight: 0.3,
  });
  // hair under the hat
  softEllipse(ctx, 44, 34, 7, 8, F.bark, 0.85, 0.3);
  // straw hat
  gouache(ctx, blobPoints(52, 26, 26, 6, r, { lumps: 0.04 }), {
    base: mix(F.sun, F.cream, 0.25),
    light: lighten(F.sun, 0.45),
    shadow: mix(F.sun, F.bark, 0.35),
    r,
    grain: 0.1,
  });
  gouache(ctx, blobPoints(52, 18, 13, 9, r, { lumps: 0.05, flatBottom: 0.6 }), {
    base: mix(F.sun, F.cream, 0.2),
    light: lighten(F.sun, 0.45),
    shadow: mix(F.sun, F.bark, 0.3),
    r,
    grain: 0.1,
  });
  ctx.fillStyle = css(F.rose, 0.9);
  ctx.fillRect(40, 22, 25, 3);
  const body = toTexture(b, { label: 'gardener' });

  // --- arm holding a watering can. Shoulder at (16, 16).
  const a = makeCanvas(112, 72);
  taper(a.ctx, curvePts(16, 16, 22, 30, 32, 36, 8), 8, 6, mix(F.sage, F.cream, 0.3), 1);
  softEllipse(a.ctx, 33, 37, 4.5, 4.5, mix(F.apricot, F.cream, 0.45), 1, 0.9);
  const can = blobPoints(56, 44, 18, 14, r, { lumps: 0.04, flatBottom: 0.4 });
  gouache(a.ctx, can, { base: mix(F.stone, F.water, 0.35), light: lighten(F.stone, 0.4), shadow: shade(F.stone, 0.35), r, grain: 0.08, rimLight: 0.35 });
  taper(a.ctx, curvePts(70, 46, 86, 38, 100, 24, 8), 5, 3, mix(F.stone, F.water, 0.3), 1);
  a.ctx.fillStyle = css(shade(F.stone, 0.2));
  a.ctx.beginPath();
  a.ctx.ellipse(101, 23, 5, 3, -0.6, 0, TAU);
  a.ctx.fill();
  a.ctx.strokeStyle = css(shade(F.stone, 0.2));
  a.ctx.lineWidth = 3;
  a.ctx.beginPath();
  a.ctx.arc(52, 30, 12, Math.PI * 1.05, Math.PI * 1.95);
  a.ctx.stroke();
  const armCan = toTexture(a, { label: 'arm-can' });

  // --- arm with a small broom. Shoulder at (16, 16).
  const br = makeCanvas(112, 96);
  taper(br.ctx, curvePts(16, 16, 22, 30, 30, 38, 8), 8, 6, mix(F.sage, F.cream, 0.3), 1);
  taper(br.ctx, curvePts(26, 30, 50, 56, 74, 80, 6), 3.4, 3, F.bark, 1);
  softEllipse(br.ctx, 31, 38, 4.5, 4.5, mix(F.apricot, F.cream, 0.45), 1, 0.9);
  for (let i = 0; i < 16; i++) {
    taper(br.ctx, curvePts(72, 78, 78 + i * 0.6, 86, 82 + i * 1.4, 94, 4), 2, 0.8, mix(F.sun, F.bark, 0.3 + (i % 3) * 0.1), 0.95);
  }
  const armBroom = toTexture(br, { label: 'arm-broom' });

  // --- butterfly wing (right wing pair, hinge at x=0, center y=32)
  const w = makeCanvas(64, 64);
  gouache(w.ctx, blobPoints(30, 22, 26, 18, r, { lumps: 0.1, rotation: -0.4 }), {
    base: mix(F.cream, F.apricot, 0.35),
    light: lighten(F.cream, 0.4),
    shadow: F.apricot,
    r,
    grain: 0.05,
  });
  gouache(w.ctx, blobPoints(24, 44, 18, 13, r, { lumps: 0.1, rotation: 0.4 }), {
    base: mix(F.cream, F.lavender, 0.35),
    light: lighten(F.cream, 0.4),
    shadow: F.lavender,
    r,
    grain: 0.05,
  });
  softEllipse(w.ctx, 36, 20, 5, 4, mix(F.lavender, F.bark, 0.3), 0.75, 0.2);
  const wing = toTexture(w, { label: 'bfly-wing' });

  // --- bird (facing right). Feet at (32, 46).
  const bb = makeCanvas(72, 52);
  gouache(bb.ctx, blobPoints(30, 28, 18, 14, r, { lumps: 0.05 }), {
    base: mix(F.sage, F.stone, 0.3),
    light: lighten(F.sage, 0.35),
    shadow: shade(F.sage, 0.35),
    r,
    grain: 0.06,
  });
  gouache(bb.ctx, blobPoints(36, 33, 11, 9, r, { lumps: 0.05 }), {
    base: mix(F.apricot, F.cream, 0.3),
    light: lighten(F.cream, 0.3),
    shadow: F.apricot,
    r,
    grain: 0.05,
  });
  gouache(bb.ctx, blobPoints(46, 18, 9, 8.5, r, { lumps: 0.04 }), {
    base: mix(F.sage, F.stone, 0.25),
    light: lighten(F.sage, 0.4),
    shadow: shade(F.sage, 0.3),
    r,
    grain: 0.05,
  });
  bb.ctx.fillStyle = css(F.sun);
  bb.ctx.beginPath();
  bb.ctx.moveTo(54, 17);
  bb.ctx.lineTo(61, 19);
  bb.ctx.lineTo(54, 21);
  bb.ctx.fill();
  bb.ctx.fillStyle = css(F.deep, 0.85);
  bb.ctx.beginPath();
  bb.ctx.arc(49, 16, 1.6, 0, TAU);
  bb.ctx.fill();
  taper(bb.ctx, curvePts(14, 26, 6, 24, 1, 20, 4), 7, 3, shade(F.sage, 0.25), 1);
  bb.ctx.strokeStyle = css(F.bark);
  bb.ctx.lineWidth = 1.4;
  bb.ctx.beginPath();
  bb.ctx.moveTo(30, 40);
  bb.ctx.lineTo(29, 47);
  bb.ctx.moveTo(35, 40);
  bb.ctx.lineTo(35, 47);
  bb.ctx.stroke();
  const birdBody = toTexture(bb, { label: 'bird' });
  const bw = makeCanvas(48, 32);
  gouache(bw.ctx, blobPoints(22, 14, 20, 9, r, { lumps: 0.08, rotation: -0.2 }), {
    base: shade(F.sage, 0.15),
    light: lighten(F.sage, 0.3),
    shadow: shade(F.sage, 0.4),
    r,
    grain: 0.05,
  });
  const birdWing = toTexture(bw, { label: 'bird-wing' });

  const d = makeCanvas(16, 16);
  softEllipse(d.ctx, 8, 8, 7, 7, lighten(F.water, 0.5), 0.95, 0);
  const drop = toTexture(d, { label: 'drop' });
  return { body, armCan, armBroom, wing, birdBody, birdWing, drop, all: [body, armCan, armBroom, wing, birdBody, birdWing, drop] };
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------

/** A butterfly that drifts in, rests on a flower and leaves. */
export class Butterfly {
  readonly root = new Container();
  private left: Sprite;
  private right: Sprite;
  private bodyG = new Graphics();

  constructor(tex: ActorTextures) {
    this.left = new Sprite(tex.wing);
    this.right = new Sprite(tex.wing);
    for (const w of [this.left, this.right]) {
      w.anchor.set(0, 0.5);
      w.scale.set(5 / 64);
    }
    this.left.scale.x = -5 / 64;
    this.bodyG.ellipse(0, 0, 0.7, 2.6).fill({ color: num(F.bark) });
    this.root.addChild(this.left, this.right, this.bodyG);
  }

  /** Returns local offset from the flower top. */
  update(p: number, t: number, dir: number): { x: number; y: number } {
    const arrive = 0.32;
    const leave = 0.72;
    let x: number;
    let y: number;
    let flap: number;
    if (p < arrive) {
      const q = 1 - p / arrive;
      x = -dir * q * 120 + Math.sin(p * 40) * 6 * q;
      y = -q * 70 + Math.sin(p * 31) * 8 * q;
      flap = Math.abs(Math.sin(t * 15));
    } else if (p < leave) {
      x = 0;
      y = 0;
      flap = 0.35 + 0.35 * Math.sin((p - arrive) * 18);
    } else {
      const q = (p - leave) / (1 - leave);
      x = dir * q * 130 + Math.sin(q * 9) * 8;
      y = -q * 110 + Math.sin(q * 13) * 6;
      flap = Math.abs(Math.sin(t * 16));
    }
    const k = 0.25 + 0.75 * flap;
    this.left.scale.x = (-5 / 64) * k;
    this.right.scale.x = (5 / 64) * k;
    this.root.alpha = smoothstep(0, 0.06, p) * (1 - smoothstep(0.93, 1, p));
    this.root.rotation = p < arrive || p >= leave ? Math.sin(t * 3) * 0.12 : 0;
    return { x, y };
  }
}

/** A small bird that visits a branch. */
export class Bird {
  readonly root = new Container();
  private body: Sprite;
  private wing: Sprite;

  constructor(tex: ActorTextures) {
    this.body = new Sprite(tex.birdBody);
    this.body.anchor.set(32 / 72, 46 / 52);
    this.body.scale.set(0.24);
    this.wing = new Sprite(tex.birdWing);
    this.wing.anchor.set(0.75, 0.45);
    this.wing.scale.set(0.24);
    this.root.addChild(this.body, this.wing);
  }

  update(p: number, t: number, dir: number): { x: number; y: number } {
    const arrive = 0.28;
    const leave = 0.76;
    let x = 0;
    let y = 0;
    let flying = true;
    let facing = dir;
    if (p < arrive) {
      const q = 1 - smoothstep(0, arrive, p);
      x = -dir * q * 180;
      y = -q * 110 + Math.sin(q * Math.PI) * -30;
    } else if (p < leave) {
      flying = false;
      const local = (p - arrive) / (leave - arrive);
      const hop = local > 0.42 && local < 0.52 ? Math.sin(((local - 0.42) / 0.1) * Math.PI) * 3 : 0;
      x = local > 0.47 ? 4 * dir : 0;
      y = -hop;
      facing = local > 0.6 && local < 0.75 ? -dir : dir;
    } else {
      const q = smoothstep(leave, 1, p);
      x = dir * q * 200;
      y = -q * 140;
    }
    this.root.scale.x = facing;
    this.wing.position.set(-2, -7.5);
    this.wing.rotation = flying ? Math.sin(t * 22) * 0.9 - 0.2 : -0.05;
    this.wing.scale.y = flying ? 0.24 * (0.4 + 0.6 * Math.abs(Math.sin(t * 22))) : 0.24;
    this.body.rotation = flying ? -0.15 : Math.sin(t * 2.2) * 0.04;
    this.root.alpha = smoothstep(0, 0.05, p) * (1 - smoothstep(0.95, 1, p));
    return { x, y };
  }
}
