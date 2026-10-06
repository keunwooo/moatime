/**
 * The forest keeper. Every pose comes from the simulated step and its progress: walking with
 * what is really carried (leaf basket, leaf mould, a seed, the seed basket), filling the can at
 * the water, raking, kneeling to plant, pouring, digging. Feet are planted while walking (the
 * stance foot's world x is fixed), so the figure never slides.
 *
 * The keeper is a quiet silhouette without a face; presence comes from gait and tools.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { ownGroup } from '../gfx';
import { mix, num } from '../paint/color';
import type { ActorTextures } from './actors';
import { F } from './palette';

const PX = 4;
const LEG = 8.5;
const STEP_ANGLE = 0.36;
export const STRIDE = 4 * LEG * Math.sin(STEP_ANGLE);
/** The keeper is drawn a little larger than the old visitor so tools read at a distance. */
export const KEEPER_SCALE = 1.05;
const TAU = Math.PI * 2;

export type KeeperMode =
  | 'walk'
  | 'fill'
  | 'clear'
  | 'plant'
  | 'water'
  | 'protect'
  | 'mulch'
  | 'pickSeed'
  | 'bench'
  | 'rake'
  | 'dump'
  | 'scoop'
  | 'bed'
  | 'build'
  | 'dig'
  | 'carryBox'
  | 'rest'
  | 'watch';

export interface KeeperPose {
  mode: KeeperMode;
  /** Step progress 0..1. */
  p: number;
  /** Clock that freezes with world time (s). */
  wt: number;
  facing: number;
  /** Distance walked (world units) for the gait. */
  dist: number;
  /** What the free hand carries while walking. */
  carry: '' | 'leaf' | 'mould' | 'seed' | 'seedbox';
  n: number;
  /** Water in the can (0..1) — the can hangs from the other hand. */
  can: number;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Keeper {
  /** Limbs and tools are redrawn every frame, so the keeper has its own render group. */
  readonly root = ownGroup(new Container());
  private inner = new Container();
  private legs = new Graphics();
  private body: Sprite;
  private backArm = new Graphics();
  private frontArm = new Graphics();
  private tool = new Graphics();
  private canArm: Sprite;
  private broomArm: Sprite;
  private seedSprite: Sprite;
  private leafSprites: Sprite[] = [];
  private drops: Sprite[] = [];

  constructor(tex: ActorTextures, seedTex: Texture, leafTex: Texture[]) {
    this.body = new Sprite(tex.body);
    this.body.anchor.set(48 / 96, 96 / 112);
    this.body.scale.set(1 / PX);
    this.canArm = new Sprite(tex.armCan);
    this.canArm.anchor.set(16 / 112, 16 / 72);
    this.canArm.scale.set(1 / PX);
    this.broomArm = new Sprite(tex.armBroom);
    this.broomArm.anchor.set(16 / 112, 16 / 96);
    this.broomArm.scale.set(1 / PX);
    this.seedSprite = new Sprite(seedTex);
    this.seedSprite.anchor.set(0.5);
    this.seedSprite.scale.set(5 / 48);
    for (let i = 0; i < 6; i++) {
      const s = new Sprite(leafTex[i % leafTex.length]);
      s.anchor.set(0.5, 0.6);
      s.scale.set(6 / 64);
      this.leafSprites.push(s);
    }
    for (let i = 0; i < 10; i++) {
      const s = new Sprite(tex.drop);
      s.anchor.set(0.5);
      s.scale.set(1.3 / 16);
      s.visible = false;
      this.drops.push(s);
    }
    this.inner.addChild(this.backArm, this.legs, this.body, this.canArm, this.broomArm, this.frontArm, this.tool, this.seedSprite, ...this.leafSprites, ...this.drops);
    this.inner.scale.set(KEEPER_SCALE);
    this.root.addChild(this.inner);
  }

  /** Hand position (keeper space, facing applied) for effects such as falling crumbs. */
  hand = { x: 0, y: 0 };

  pose(o: KeeperPose) {
    const f = o.facing >= 0 ? 1 : -1;
    const { mode, p, wt } = o;
    const walking = mode === 'walk' || mode === 'carryBox';
    const kneel = mode === 'plant' || mode === 'protect' || mode === 'bed';
    const sit = mode === 'rest';
    const bend =
      mode === 'fill' || mode === 'pickSeed' || mode === 'scoop' || mode === 'mulch'
        ? 0.32 * Math.sin(Math.min(1, p * 1.25) * Math.PI) + 0.08
        : mode === 'clear' || mode === 'rake' || mode === 'dig'
          ? 0.14
          : mode === 'dump'
            ? 0.1
            : 0;

    // ---- legs
    let footA = 1.6;
    let footB = -1.4;
    let liftA = 0;
    let liftB = 0;
    let hipY = -10.2;
    const g = this.legs;
    g.clear();
    const trouser = num(mix(F.moss, F.deep, 0.35));
    const boot = num(mix(F.bark, F.deep, 0.2));
    if (walking) {
      const cyc = o.dist / STRIDE;
      const phase = cyc - Math.floor(cyc);
      const legPose = (ph: number) => {
        if (ph < 0.5) {
          const q = ph / 0.5;
          return { dx: LEG * Math.sin(STEP_ANGLE) * (1 - 2 * q), lift: 0 };
        }
        const q = (ph - 0.5) / 0.5;
        return { dx: -LEG * Math.sin(STEP_ANGLE) * (1 - 2 * smoothstep(0, 1, q)), lift: Math.sin(q * Math.PI) * 2.4 };
      };
      const A = legPose(phase);
      const B = legPose((phase + 0.5) % 1);
      footA = A.dx;
      footB = B.dx;
      liftA = A.lift;
      liftB = B.lift;
      const stance = phase < 0.5 ? footA : footB;
      hipY = -Math.sqrt(Math.max(1, LEG * LEG - stance * stance)) - 1.7;
    }
    if (kneel) {
      hipY = -5.4;
      // one knee on the ground, the other foot planted forward
      g.moveTo(-1.2, hipY).quadraticCurveTo(-4.2, -2.6, -6.5, -0.8).stroke({ color: trouser, width: 3.1, alpha: 0.85, cap: 'round' });
      g.moveTo(1.2, hipY).quadraticCurveTo(4.6, -6.2, 4.4, -0.9).stroke({ color: trouser, width: 3.1, cap: 'round' });
      g.ellipse(-7.4, -0.6, 2, 1).fill({ color: boot, alpha: 0.85 });
      g.ellipse(5.2, -0.6, 2.2, 1.1).fill({ color: boot });
    } else if (sit) {
      hipY = -7.8;
      g.moveTo(-1.2, hipY).lineTo(4.4, hipY + 0.6).lineTo(4.6, -0.8).stroke({ color: trouser, width: 3.1, alpha: 0.85, cap: 'round', join: 'round' });
      g.moveTo(1.2, hipY).lineTo(6.2, hipY + 0.8).lineTo(6.6, -0.8).stroke({ color: trouser, width: 3.1, cap: 'round', join: 'round' });
      g.ellipse(5.4, -0.6, 2, 1).fill({ color: boot, alpha: 0.85 });
      g.ellipse(7.4, -0.6, 2.2, 1.1).fill({ color: boot });
    } else {
      for (const [fx, lift, back] of [
        [footB, liftB, true],
        [footA, liftA, false],
      ] as const) {
        const hx = back ? -1.2 : 1.2;
        const kx = (hx + fx) / 2 + 0.8;
        const ky = (hipY + -lift) / 2;
        g.moveTo(hx, hipY).quadraticCurveTo(kx, ky, fx, -lift - 0.8).stroke({ color: trouser, width: 3.1, alpha: back ? 0.85 : 1, cap: 'round' });
        g.ellipse(fx + 0.9, -lift - 0.6, 2.2, 1.1).fill({ color: boot, alpha: back ? 0.85 : 1 });
      }
    }
    this.legs.scale.x = f;

    // ---- body
    const sway = walking ? Math.sin((o.dist / STRIDE) * TAU * 2) * 0.012 : mode === 'watch' ? Math.sin(wt * 0.6) * 0.02 : 0;
    this.body.position.set(0, hipY + 1.2);
    this.body.scale.x = f / PX;
    this.body.rotation = f * (sway + bend);
    const shoulderX = f * (1.2 + bend * 9);
    const shoulderY = hipY + 1.2 - 12.5 + bend * 2.5;
    const skin = num(mix(F.apricot, F.cream, 0.45));
    const sleeve = num(mix(F.sage, F.cream, 0.3));

    // ---- arms and tools
    this.canArm.visible = false;
    this.broomArm.visible = false;
    this.seedSprite.visible = false;
    for (const l of this.leafSprites) l.visible = false;
    const fa = this.frontArm;
    const ba = this.backArm;
    const tl = this.tool;
    fa.clear();
    ba.clear();
    tl.clear();
    const arm = (gr: Graphics, ang: number, len = 9.5, alpha = 1) => {
      // angle 0 = hanging down; positive = forward
      const ex = shoulderX + f * Math.sin(ang) * len * 0.55;
      const ey = shoulderY + Math.cos(ang) * len * 0.55;
      const hx = shoulderX + f * Math.sin(ang * 1.15) * len;
      const hy = shoulderY + Math.cos(ang * 1.15) * len;
      gr.moveTo(shoulderX, shoulderY).quadraticCurveTo(ex, ey, hx, hy).stroke({ color: sleeve, width: 2.6, cap: 'round', alpha });
      gr.circle(hx, hy, 1.3).fill({ color: skin, alpha });
      return { x: hx, y: hy };
    };
    const canHanging = (hand: { x: number; y: number }, alpha = 1) => {
      // a small can hanging from the back hand; its colour darkens when it holds water
      const c = num(mix(mix(F.stone, F.water, 0.35), mix(F.water, F.deep, 0.25), o.can * 0.35));
      tl.roundRect(hand.x - 2.6, hand.y + 0.8, 5.2, 4.2, 1.2).fill({ color: c, alpha });
      tl.moveTo(hand.x + f * 2.2, hand.y + 1.8).lineTo(hand.x + f * 5, hand.y - 0.6).stroke({ color: c, width: 1.1, alpha });
    };
    let pouring = false;
    let spout = { x: 0, y: 0 };
    switch (mode) {
      case 'water': {
        // the can goes to the front hand and tips
        const raise = smoothstep(0, 0.15, p) * (1 - smoothstep(0.88, 1, p));
        this.canArm.visible = true;
        this.canArm.position.set(shoulderX, shoulderY);
        this.canArm.scale.x = f / PX;
        this.canArm.rotation = f * raise * 0.62;
        arm(ba, 0.1, 9, 0.85);
        pouring = p > 0.16 && p < 0.86;
        const ang = this.canArm.rotation;
        const lx = (100 - 16) / PX;
        const ly = (24 - 16) / PX;
        spout = { x: shoulderX + f * (lx * Math.cos(ang * f) - ly * Math.sin(ang * f)), y: shoulderY + lx * Math.sin(ang * f) + ly * Math.cos(ang * f) };
        break;
      }
      case 'fill': {
        // the can is dipped into the water with the front hand
        const dip = Math.sin(Math.min(1, p * 1.1) * Math.PI);
        const h = arm(fa, 0.55 + dip * 0.45, 10);
        canHanging({ x: h.x, y: h.y + dip * 1.2 });
        arm(ba, 0.15, 9, 0.85);
        break;
      }
      case 'clear':
      case 'rake': {
        const sweep = Math.sin(p * Math.PI * (mode === 'rake' ? 8 : 6)) * 0.32;
        this.broomArm.visible = true;
        this.broomArm.position.set(shoulderX, shoulderY);
        this.broomArm.scale.x = f / PX;
        this.broomArm.rotation = f * (0.3 + sweep);
        const hb = arm(ba, 0.1, 9, 0.85);
        canHanging(hb, 0.9);
        break;
      }
      case 'plant':
      case 'bed':
      case 'protect': {
        const reach = 0.95 + Math.sin(p * Math.PI * (mode === 'bed' ? 5 : 3)) * 0.15;
        const h = arm(fa, reach, 10);
        if (mode === 'plant' && p < 0.55) {
          this.seedSprite.visible = true;
          this.seedSprite.position.set(h.x + f * 0.8, h.y + 0.6);
        }
        if (mode === 'protect') {
          // a bundle of straw wrapped around the young stem
          tl.ellipse(h.x + f * 2.5, h.y - 1, 2.6, 3.6).fill({ color: num(mix(F.sun, F.bark, 0.25)), alpha: 0.9 });
        }
        arm(ba, 0.25, 9, 0.85);
        break;
      }
      case 'mulch': {
        const toss = Math.abs(Math.sin(p * Math.PI * 5));
        const h = arm(fa, 0.6 + toss * 0.35, 10);
        tl.roundRect(h.x - 2.2, h.y - 0.5, 4.4, 3.6, 1).fill({ color: num(mix(F.bark, F.deep, 0.35)) });
        this.hand = { x: h.x, y: h.y };
        arm(ba, 0.15, 9, 0.85);
        break;
      }
      case 'pickSeed':
      case 'scoop': {
        const h = arm(fa, 0.85 + Math.sin(p * Math.PI * 2) * 0.12, 10.5);
        if (mode === 'scoop') tl.moveTo(h.x, h.y).lineTo(h.x + f * 4, h.y + 3).stroke({ color: num(F.bark), width: 1.2 });
        if (mode === 'pickSeed' && p > 0.45) {
          this.seedSprite.visible = true;
          this.seedSprite.position.set(h.x, h.y + 0.5);
        }
        canHanging(arm(ba, 0.1, 9, 0.85), 0.9);
        break;
      }
      case 'bench': {
        const h = arm(fa, 0.7 + Math.sin(p * Math.PI) * 0.25, 10);
        if (o.carry === 'seed' || o.n > 0) {
          this.seedSprite.visible = true;
          this.seedSprite.position.set(h.x, h.y + 0.5);
        }
        canHanging(arm(ba, 0.1, 9, 0.85), 0.9);
        break;
      }
      case 'dump': {
        // the basket is tipped over the compost
        const tip = Math.sin(Math.min(1, p * 1.2) * Math.PI);
        const h = arm(fa, 0.5 + tip * 0.7, 10);
        this.basket(tl, h, f, o.n * (1 - smoothstep(0.2, 0.8, p)), tip * 1.2);
        arm(ba, 0.4 + tip * 0.3, 9, 0.85);
        break;
      }
      case 'build':
      case 'dig': {
        const beat = Math.abs(Math.sin(p * Math.PI * (mode === 'dig' ? 6 : 10)));
        const h = arm(fa, 0.4 + beat * 0.9, 10);
        if (mode === 'dig') tl.moveTo(h.x, h.y - 5).lineTo(h.x + f * 1.5, h.y + 7).stroke({ color: num(F.bark), width: 1.4 }).rect(h.x + f * 0.5 - 1.8, h.y + 6, 3.6, 3).fill({ color: num(F.stone) });
        else tl.moveTo(h.x, h.y).lineTo(h.x + f * 1.2, h.y - 4.5).stroke({ color: num(F.bark), width: 1.3 }).rect(h.x + f * 1.2 - 1.6, h.y - 6, 3.2, 2).fill({ color: num(F.stone) });
        arm(ba, 0.3 + beat * 0.4, 9, 0.85);
        break;
      }
      case 'carryBox':
      case 'walk':
      default: {
        const swing = walking ? Math.sin((o.dist / STRIDE) * TAU) * 0.28 : 0;
        if (o.carry === 'leaf') {
          const h = arm(fa, 0.55, 9);
          this.basket(tl, h, f, o.n, 0);
        } else if (o.carry === 'mould') {
          const h = arm(fa, 0.5, 9);
          tl.roundRect(h.x - 2.4, h.y + 0.5, 4.8, 4.2, 1).fill({ color: num(mix(F.stone, F.bark, 0.4)) });
          tl.ellipse(h.x, h.y + 0.9, 2.2, 0.9).fill({ color: num(mix(F.bark, F.deep, 0.4)) });
        } else if (o.carry === 'seedbox') {
          const h = arm(fa, 0.75, 9);
          this.basket(tl, { x: h.x, y: h.y - 1 }, f, 0, 0, Math.min(6, o.n));
        } else if (o.carry === 'seed') {
          const h = arm(fa, 0.35 + swing * 0.5, 9);
          this.seedSprite.visible = true;
          this.seedSprite.position.set(h.x, h.y + 0.4);
        } else if (mode === 'rest') {
          arm(fa, 0.9, 8);
        } else {
          arm(fa, swing, 9.5);
        }
        canHanging(arm(ba, -swing * 0.8 + 0.08, 9, 0.85), 0.92);
      }
    }
    this.backArm.alpha = 0.92;

    // ---- water drops from the spout
    this.drops.forEach((d, i) => {
      if (!pouring) {
        d.visible = false;
        return;
      }
      const life = 0.09;
      const birth = 0.18 + (i / this.drops.length) * life;
      let q = (p - birth) / life;
      q = q - Math.floor(q);
      const tt = q * 0.55;
      d.visible = true;
      d.position.set(spout.x + f * (2.5 + tt * 6), spout.y + tt * 4 + tt * tt * 46);
      d.alpha = 0.85 * (1 - q * 0.6);
    });
  }

  /** A small woven basket in the hand, with leaves or seeds showing over the rim. */
  private basket(g: Graphics, h: { x: number; y: number }, f: number, leaves: number, tilt: number, seeds = 0) {
    const cx = h.x + f * 0.5;
    const cy = h.y + 3.2;
    const wood = num(mix(F.sun, F.bark, 0.45));
    g.ellipse(cx, cy, 4.2, 2.6).fill({ color: wood });
    g.moveTo(cx - 4, cy - 0.6).lineTo(cx + 4, cy - 0.6).stroke({ color: num(mix(F.bark, F.deep, 0.2)), width: 0.8, alpha: 0.6 });
    g.moveTo(cx - 3.4, cy - 1.2).quadraticCurveTo(cx, cy - 6, cx + 3.4, cy - 1.2).stroke({ color: wood, width: 0.9 });
    const n = Math.max(0, Math.min(6, Math.round(leaves)));
    for (let i = 0; i < 6; i++) {
      const s = this.leafSprites[i];
      s.visible = i < n;
      if (!s.visible) continue;
      s.position.set(cx + ((i % 3) - 1) * 2.2 + f * tilt * 3, cy - 1.6 - Math.floor(i / 3) * 1.4 - tilt * 1.5);
      s.rotation = i * 1.3 + tilt;
    }
    for (let i = 0; i < seeds; i++) g.ellipse(cx + ((i % 3) - 1) * 1.8, cy - 1.4 - Math.floor(i / 3) * 1, 0.9, 0.6).fill({ color: num(F.bark) });
  }
}

/** A squirrel that runs with a hop, carries a seed in its mouth and buries it. */
export class Squirrel {
  /** Redrawn every frame, so it has its own render group. */
  readonly root = ownGroup(new Container());
  private g = new Graphics();
  private seed: Sprite;

  constructor(seedTex: Texture) {
    this.seed = new Sprite(seedTex);
    this.seed.anchor.set(0.5);
    this.seed.scale.set(4 / 48);
    this.root.addChild(this.g, this.seed);
  }

  pose(o: { mode: 'run' | 'nibble' | 'bury' | 'perch'; p: number; wt: number; facing: number; dist: number; carrying: boolean }) {
    const f = o.facing >= 0 ? 1 : -1;
    const g = this.g;
    g.clear();
    const fur = num(mix(F.bark, F.apricot, 0.35));
    const light = num(mix(F.cream, F.apricot, 0.3));
    let hop = 0;
    let lean = 0;
    if (o.mode === 'run') {
      const ph = (o.dist / 9) % 1;
      hop = Math.abs(Math.sin(ph * Math.PI)) * 3.2;
      lean = 0.15;
    } else if (o.mode === 'bury' || o.mode === 'nibble') {
      lean = 0.35 + Math.sin(o.wt * 12) * 0.08;
    }
    const y = -hop;
    // tail: a soft S-curve behind
    g.moveTo(-f * 3, y - 3)
      .bezierCurveTo(-f * 9, y - 4, -f * 10, y - 13, -f * 5, y - 15)
      .stroke({ color: fur, width: 4.2, cap: 'round', alpha: 0.95 });
    g.moveTo(-f * 5.2, y - 14.6).quadraticCurveTo(-f * 8.6, y - 12, -f * 8.2, y - 7).stroke({ color: light, width: 1.2, alpha: 0.6 });
    // body and head
    g.ellipse(0, y - 4.5 + lean * 1.5, 4.6, 3.6).fill({ color: fur });
    g.ellipse(f * 0.6, y - 3.6 + lean * 1.5, 2.4, 2).fill({ color: light, alpha: 0.7 });
    const hx = f * (4 + lean * 2.5);
    const hy = y - 7.5 + lean * 4;
    g.circle(hx, hy, 2.6).fill({ color: fur });
    g.ellipse(hx - f * 0.8, hy - 2.6, 0.8, 1.4).fill({ color: fur });
    g.circle(hx + f * 1.2, hy - 0.4, 0.45).fill({ color: num(F.deep) });
    // legs
    g.ellipse(-f * 2, -0.6, 1.6, 0.9).fill({ color: num(mix(F.bark, F.deep, 0.2)) });
    g.ellipse(f * 2.4, -0.6 - (o.mode === 'run' ? hop * 0.4 : 0), 1.3, 0.8).fill({ color: num(mix(F.bark, F.deep, 0.2)) });
    this.seed.visible = o.carrying;
    this.seed.position.set(hx + f * 2.2, hy + 1);
  }
}
