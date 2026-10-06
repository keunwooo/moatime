/**
 * One tree, grown as a pure function of its unit progress u ∈ [0, 1].
 *
 *  0.000–0.012  soil swells around the seed
 *  0.012–0.036  seed coat splits, a hooked sprout rises
 *  0.036–0.062  two cotyledons unfold from the tip (≈10 s each)
 *  0.06–0.22    the stem lengthens, true leaves unfold node by node
 *  0.22–0.55    the stem turns woody and thickens, branches split from fixed heights
 *  0.42–0.85    foliage clumps unfold one by one from branch tips (≈11 s each)
 *  0.865–0.93   a few leaves fall and stay around the roots
 *
 * Stems extend from the root, leaves and clumps open from their attachment points, and
 * every quantity is continuous in u, so any W (reload, return, dev jump) renders directly.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { Rng } from '../../core/rng';
import { secondsToU, type GrowthRules } from '../../core/rules';
import { mix, num, type RGB } from '../paint/color';
import type { SpeciesPalette } from './palette';

export interface TreeTextures {
  clumps: Texture[];
  /** Autumn-coloured clumps; empty for evergreens. */
  autumn: Texture[];
  leaves: Texture[];
  cotyledon: Texture;
  seed: Texture;
  fall: Texture[];
  twigs: Texture;
  snowCap: Texture;
}

/** Season weights (spring, summer, autumn, winter), dominant season and its progress. */
export interface SeasonState {
  w: readonly [number, number, number, number];
  id: number;
  p: number;
  /** Snow cover from the weather (0..1); without it, a little snow by season. */
  snow?: number;
}

/** Autumn colours in order: each clump walks this ramp at its own pace. */
const AUTUMN_RAMP: [number, number, number][] = [
  [238, 200, 96],
  [230, 148, 74],
  [202, 98, 76],
  [168, 116, 80],
];
/** How far along the ramp a species goes (birches stay golden, maples turn red). */
const RAMP_MAX: Record<string, number> = { birch: 0.3, maple: 0.78, blossom: 0.62, tall: 0.9, round: 1 };

/** Summer leaves of a blossom tree once the flowers are over. */
const LEAF_GREEN: [number, number, number] = [152, 180, 120];

function rampColor(k: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, k)) * (AUTUMN_RAMP.length - 1);
  const i = Math.min(AUTUMN_RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = AUTUMN_RAMP[i];
  const b = AUTUMN_RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

interface Branch {
  /** Attachment height on the trunk (wu above ground). */
  h: number;
  side: number;
  angle: number;
  len: number;
  curve: number;
  w0: number;
  u0: number;
  u1: number;
}

interface Clump {
  /** -1: trunk top, otherwise branch index. */
  branch: number;
  /** Offset from the attachment point when fully grown. */
  ox: number;
  oy: number;
  r: number;
  u0: number;
  u1: number;
  sprite: Sprite;
  /** The same clump in autumn colours, stacked on top and faded in by season. */
  autumn: Sprite | null;
  /** When in autumn this clump turns (0..0.55 of the season), so the crown turns patchily. */
  delay: number;
  back: boolean;
  rot: number;
  phase: number;
  tint: number;
  /** Alpha from growth (opening); seasons multiply it. */
  baseAlpha: number;
}

interface Leaf {
  h: number;
  side: number;
  angle: number;
  size: number;
  u0: number;
  u1: number;
  fade0: number;
  sprite: Sprite;
  phase: number;
  cotyledon: boolean;
}

interface Fall {
  u0: number;
  u1: number;
  fromX: number;
  fromY: number;
  toX: number;
  sway: number;
  spin: number;
  sprite: Sprite;
}

export interface TreeShape {
  H: number;
  trunkH: number;
  baseW: number;
  lean: number;
  bend: number;
  crownW: number;
  crownH: number;
}

const SPROUT_LEN = 34;
/** Seed sprite scale (≈ 9 wu); shared with the wind-borne seed so landing matches exactly. */
export const SEED_SCALE = 9 / 48;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Reverses a flat [x0, y0, x1, y1, ...] list point-wise. */
function reversePairs(a: number[]): number[] {
  const out: number[] = new Array(a.length);
  for (let i = 0, j = a.length - 2; j >= 0; i += 2, j -= 2) {
    out[i] = a[j];
    out[i + 1] = a[j + 1];
  }
  return out;
}

function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export class Tree {
  readonly root = new Container();
  readonly sp: SpeciesPalette;
  readonly shape: TreeShape;
  private backLayer = new Container();
  private trunk = new Graphics();
  private frontLayer = new Container();
  private leafLayer = new Container();
  private fallLayer = new Container();
  private mound = new Graphics();
  private seedSprite: Sprite;
  private branches: Branch[] = [];
  private clumps: Clump[] = [];
  private leaves: Leaf[] = [];
  private falls: Fall[] = [];
  private lastDrawnU = -1;
  u = 0;
  private twigs: Sprite;
  private snow: Sprite[] = [];
  readonly evergreen: boolean;
  private seasonKey = '';
  private stemColor: RGB;
  private barkCol: RGB;
  private litCol: RGB;
  private darkCol: RGB;
  private markCol: RGB;
  readonly windPhase: number;

  constructor(seed: number, sp: SpeciesPalette, tex: TreeTextures, rules: GrowthRules, sizeScale = 1) {
    this.sp = sp;
    const r = new Rng(seed);
    this.windPhase = r.range(0, 6.28);
    const tall = sp.name === 'tall' || sp.name === 'pine';
    const birch = sp.name === 'birch';
    const H = (tall ? r.range(285, 325) : birch ? r.range(260, 300) : r.range(232, 275)) * sizeScale;
    this.shape = {
      H,
      trunkH: H * (tall ? 0.62 : birch ? 0.66 : 0.56),
      baseW: (tall ? r.range(15, 19) : birch ? r.range(11, 14) : r.range(17, 23)) * sizeScale,
      lean: r.range(-14, 14) * sizeScale,
      bend: r.range(-1, 1),
      crownW: (tall ? r.range(120, 145) : birch ? r.range(140, 170) : r.range(185, 225)) * sizeScale,
      crownH: (tall ? r.range(200, 230) : r.range(160, 195)) * sizeScale,
    };
    this.stemColor = mix(sp.leaf, [206, 214, 150], 0.45);
    this.barkCol = sp.bark;
    this.litCol = sp.barkLight;
    this.darkCol = mix(sp.bark, [44, 52, 58], 0.45);
    this.markCol = birch ? [72, 70, 72] : mix(sp.bark, [44, 52, 58], 0.6);

    this.evergreen = sp.name === 'pine';
    this.twigs = new Sprite(tex.twigs);
    this.twigs.anchor.set(0.5, 200 / 256);
    this.twigs.alpha = 0;
    this.twigs.visible = false;
    this.mound.alpha = 0.95;
    this.seedSprite = new Sprite(tex.seed);
    this.seedSprite.anchor.set(0.5, 0.8);
    this.seedSprite.scale.set(SEED_SCALE);
    this.root.addChild(this.mound, this.backLayer, this.trunk, this.twigs, this.leafLayer, this.frontLayer, this.fallLayer, this.seedSprite);

    this.buildStructure(r, tex, rules);
    // bare twigs over the trunk top for winter, sized to the crown
    const sh = this.shape;
    this.twigs.position.set(sh.lean * 0.9, -sh.trunkH + 8);
    this.twigs.scale.set((sh.crownW * 0.95) / 200, (sh.crownH * 0.85) / 150);
    // a little snow where it can rest: on an evergreen's upper crown, on a bare tree's
    // branch tips and the top of its trunk (never floating where the leaves used to be)
    const spots: { x: number; y: number; w: number; layer: Container }[] = [];
    if (this.evergreen) {
      for (let i = 0; i < 4; i++) {
        spots.push({
          x: sh.lean * 0.9 + (i - 1.5) * sh.crownW * 0.24 + r.range(-6, 6),
          y: -(sh.H - sh.crownH * (0.12 + Math.abs(i - 1.5) * 0.12)) + r.range(-4, 4),
          w: sh.crownW * r.range(0.26, 0.34),
          layer: this.frontLayer,
        });
      }
    } else {
      for (const b of this.branches) {
        const tip = this.branchTip(b, 1, 1);
        spots.push({ x: tip.x - b.side * 3, y: tip.y + 3, w: Math.max(14, b.len * 0.42), layer: this.leafLayer });
      }
      spots.push({ x: sh.lean, y: -sh.trunkH + 4, w: sh.baseW * 1.6, layer: this.leafLayer });
    }
    for (const sp of spots) {
      const cs = new Sprite(tex.snowCap);
      cs.anchor.set(0.5, 40 / 48);
      cs.position.set(sp.x, sp.y);
      cs.scale.set(sp.w / 128, (sp.w / 128) * (this.evergreen ? 1 : 0.7));
      cs.alpha = 0;
      cs.visible = false;
      sp.layer.addChild(cs);
      this.snow.push(cs);
    }
  }

  private buildStructure(r: Rng, tex: TreeTextures, rules: GrowthRules) {
    const s = this.shape;
    const leafWindow = secondsToU(10, rules);

    // Branches from fixed heights, lower ones first.
    const nb = this.sp.name === 'tall' || this.sp.name === 'pine' ? r.int(4, 5) : r.int(3, 5);
    for (let i = 0; i < nb; i++) {
      const t = 0.5 + (i / Math.max(1, nb - 1)) * 0.42 + r.range(-0.04, 0.04);
      const h = s.trunkH * t;
      const u0 = this.uWhenTrunkReaches(h + 14);
      const narrow = this.sp.name === 'tall' || this.sp.name === 'pine';
      this.branches.push({
        h,
        side: i % 2 === 0 ? -1 : 1,
        angle: (narrow ? r.range(0.35, 0.6) : r.range(0.55, 1.0)) * (1 - t * 0.35),
        len: (narrow ? r.range(0.16, 0.24) : r.range(0.24, 0.36)) * s.H * (1.15 - t * 0.4),
        curve: r.range(-0.3, 0.1),
        w0: s.baseW * r.range(0.3, 0.42) * (1.1 - t * 0.5),
        u0,
        u1: u0 + secondsToU(r.range(45, 70), rules),
      });
    }

    // True leaves along the young stem (alternating). Each sits at a fraction of the stem,
    // so as the stem lengthens they stay spread along its upper part like a real sapling.
    const fracs = [0.46, 0.55, 0.63, 0.71, 0.78, 0.85, 0.91, 0.97];
    fracs.forEach((frac, i) => {
      const u0 = this.uWhenStemReaches(14 + i * 2.6);
      const sprite = new Sprite(r.pick(tex.leaves));
      sprite.anchor.set(0.5, 106 / 112);
      this.leafLayer.addChild(sprite);
      this.leaves.push({
        h: frac,
        side: i % 2 === 0 ? 1 : -1,
        angle: r.range(0.8, 1.15) - frac * 0.25,
        size: r.range(10.5, 14) / 14,
        u0,
        u1: u0 + leafWindow,
        fade0: 0.5 + (i / fracs.length) * 0.1 + r.range(0, 0.01),
        sprite,
        phase: r.range(0, 6.28),
        cotyledon: false,
      });
    });
    // young leaves at each branch tip until the crown takes over
    this.branches.forEach((b, bi) => {
      for (let k = 0; k < 2; k++) {
        const sprite = new Sprite(r.pick(tex.leaves));
        sprite.anchor.set(0.5, 106 / 112);
        this.leafLayer.addChild(sprite);
        const u0 = b.u1 - secondsToU(12, rules) + k * secondsToU(5, rules);
        this.leaves.push({
          h: -1 - bi,
          side: k === 0 ? b.side : -b.side,
          angle: 0.55 + k * 0.35,
          size: r.range(0.75, 0.95),
          u0,
          u1: u0 + leafWindow,
          fade0: Math.min(0.66, Math.max(u0 + 0.06, 0.58)),
          sprite,
          phase: r.range(0, 6.28),
          cotyledon: false,
        });
      }
    });
    for (let i = 0; i < 2; i++) {
      const sprite = new Sprite(tex.cotyledon);
      sprite.anchor.set(0.5, 106 / 112);
      sprite.tint = 0xf4f8e6;
      this.leafLayer.addChild(sprite);
      const u0 = 0.036 + i * secondsToU(6, rules);
      this.leaves.push({
        h: 12.5,
        side: i === 0 ? -1 : 1,
        angle: 1.15,
        size: 0.66,
        u0,
        u1: u0 + leafWindow,
        fade0: 0.3 + i * 0.02,
        sprite,
        phase: r.range(0, 6.28),
        cotyledon: true,
      });
    }

    // Crown composition: a back ring makes the silhouette, mid clumps fill it, and a few
    // front clumps (lightest toward the upper left) give it volume. Each clump opens from
    // its nearest branch tip.
    const crownCy = -(s.H - s.crownH * 0.5);
    const ccx = s.lean * 0.9;
    const hw = s.crownW * 0.5;
    const hh = s.crownH * 0.5;
    const narrowCrown = this.sp.name === 'tall' || this.sp.name === 'pine';
    type Target = { x: number; y: number; r: number; layer: 0 | 1 | 2 };
    const targets: Target[] = [];
    // clump size follows the larger crown dimension so tall crowns stay closed too
    const rBase = 0.5 * Math.max(hw, hh * 0.8);
    const nBack = narrowCrown ? 8 : 7;
    for (let i = 0; i < nBack; i++) {
      const a = Math.PI * (0.9 + (i / (nBack - 1)) * 1.2) + r.range(-0.07, 0.07);
      targets.push({ x: ccx + Math.cos(a) * hw * 0.58, y: crownCy + Math.sin(a) * hh * 0.6, r: rBase * r.range(0.86, 1), layer: 0 });
    }
    const nMid = narrowCrown ? 5 : 6;
    for (let i = 0; i < nMid; i++) {
      const a = (i / nMid) * Math.PI * 2 + r.range(-0.4, 0.4);
      const d = r.range(0.12, 0.4);
      targets.push({ x: ccx + Math.cos(a) * hw * d, y: crownCy + Math.sin(a) * hh * d, r: rBase * r.range(0.8, 0.92), layer: 1 });
    }
    const nFront = narrowCrown ? 3 : 4;
    for (let i = 0; i < nFront; i++) {
      const a = Math.PI * (0.12 + (i / Math.max(1, nFront - 1)) * 0.76) + r.range(-0.1, 0.1);
      targets.push({ x: ccx + Math.cos(a) * hw * 0.44, y: crownCy + Math.sin(a) * hh * 0.44, r: rBase * r.range(0.66, 0.74), layer: 2 });
    }
    targets.push({ x: ccx - hw * 0.3, y: crownCy - hh * 0.34, r: rBase * 0.68, layer: 2 });
    // grow outward from the trunk top
    const top0 = { x: s.lean, y: -s.trunkH };
    const order = targets
      .map((t, i) => ({ t, i, d: Math.hypot(t.x - top0.x, (t.y - top0.y) * 0.8) + t.layer * 18 }))
      .sort((a, b) => a.d - b.d);
    const tips = this.branches.map((b, i) => ({ i, ...this.branchTip(b, 1, 1) }));
    tips.push({ i: -1, x: s.lean, y: -s.trunkH });
    const span = 0.85 - 0.42;
    const frontItems: { sprite: Sprite; y: number; layer: number; autumn: Sprite | null }[] = [];
    order.forEach(({ t }, k) => {
      let best = tips[0];
      let bd = Infinity;
      for (const tp of tips) {
        const d = Math.hypot(tp.x - t.x, tp.y - t.y);
        if (d < bd) {
          bd = d;
          best = tp;
        }
      }
      const branchReady = best.i >= 0 ? this.branches[best.i].u1 : 0.42;
      const u0 = Math.max(branchReady, 0.42 + (k / order.length) * span + r.range(-0.01, 0.01));
      const sprite = new Sprite(r.pick(tex.clumps));
      sprite.anchor.set(0.5, 140 / 256);
      const autumn = tex.autumn.length ? new Sprite(tex.autumn[Math.floor(r.next() * tex.autumn.length)]) : null;
      if (autumn) {
        autumn.anchor.set(0.5, 140 / 256);
        autumn.alpha = 0;
        autumn.visible = false;
      }
      const back = t.layer === 0;
      // one light for the whole crown: upper-left clumps lighter, lower-right darker
      const lit = Math.min(1, Math.max(0, ((ccx - t.x) * 0.6 + (crownCy - t.y) * 0.8) / hw * 0.6 + 0.5));
      const layerK = [0.86, 0.94, 1][t.layer];
      const v = layerK * (0.88 + 0.12 * lit);
      const tint = mix([v * 238, v * 244, v * 232], [255, 255, 250], lit * 0.25 * (t.layer === 2 ? 1 : 0.4));
      sprite.tint = num(tint);
      if (autumn) autumn.tint = num(tint);
      if (back) {
        this.backLayer.addChild(sprite);
        if (autumn) this.backLayer.addChild(autumn);
      } else frontItems.push({ sprite, y: t.y, layer: t.layer, autumn });
      this.clumps.push({
        branch: best.i,
        ox: t.x - best.x,
        oy: t.y - best.y,
        r: t.r,
        u0,
        u1: u0 + secondsToU(r.range(10, 12.5), rules),
        sprite,
        autumn,
        delay: r.range(0, 0.55),
        back,
        rot: r.range(-0.4, 0.4),
        phase: r.range(0, 6.28),
        tint: num(tint),
        baseAlpha: 0,
      });
    });
    // mid before front, and lower clumps over higher ones
    frontItems.sort((a, b) => a.layer - b.layer || a.y - b.y);
    for (const f of frontItems) {
      this.frontLayer.addChild(f.sprite);
      if (f.autumn) this.frontLayer.addChild(f.autumn);
    }

    // Leaves that fall at maturity.
    const nf = r.int(3, 5);
    for (let i = 0; i < nf; i++) {
      const u0 = 0.865 + (i / nf) * 0.06 + r.range(0, 0.004);
      const from = targets[Math.floor(r.next() * targets.length)];
      const sprite = new Sprite(r.pick(tex.fall));
      sprite.anchor.set(0.5, 0.6);
      sprite.visible = false;
      this.fallLayer.addChild(sprite);
      this.falls.push({
        u0,
        u1: u0 + secondsToU(r.range(5.5, 7), rules),
        fromX: from.x + r.range(-20, 20),
        fromY: from.y + from.r * 0.5,
        toX: r.range(-s.crownW * 0.4, s.crownW * 0.4),
        sway: r.range(10, 22),
        spin: r.range(2, 5) * (r.chance(0.5) ? 1 : -1),
        sprite,
      });
    }
  }

  /** Trunk/stem length at progress u. Continuous across the sprout → wood transition. */
  trunkLen(u: number): number {
    if (u < 0.012) return 0;
    if (u < 0.22) {
      // fast early sprouting, then steady
      const a = smooth(0.012, 0.062, u) * 13;
      const b = Math.max(0, (u - 0.062) / (0.22 - 0.062)) * (SPROUT_LEN - 13);
      return a + b;
    }
    const x = (u - 0.22) / 0.78;
    return SPROUT_LEN + (this.shape.trunkH - SPROUT_LEN) * (1 - Math.pow(1 - x, 2.4));
  }

  private trunkWidth(u: number): number {
    if (u < 0.22) return 1.4 + smooth(0.012, 0.22, u) * 1.2;
    const x = (u - 0.22) / 0.78;
    return 2.6 + (this.shape.baseW - 2.6) * (1 - Math.pow(1 - x, 1.8));
  }

  private uWhenTrunkReaches(h: number): number {
    let lo = 0.22;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (this.trunkLen(m) >= h) hi = m;
      else lo = m;
    }
    return hi;
  }

  private uWhenStemReaches(h: number): number {
    let lo = 0;
    let hi = 0.3;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (this.trunkLen(m) >= h) hi = m;
      else lo = m;
    }
    return hi;
  }

  /** Point on the trunk centerline at height h for trunk length L. */
  private trunkPoint(h: number, L: number): { x: number; y: number } {
    const s = L > 0 ? Math.min(1, h / L) : 0;
    const full = L / this.shape.trunkH;
    const x = this.shape.lean * s * s * full + this.shape.bend * Math.sin(Math.PI * s) * L * 0.035;
    return { x, y: -h };
  }

  private branchTip(b: Branch, grow: number, trunkFrac: number) {
    const base = this.trunkPoint(b.h * trunkFrac, this.shape.trunkH * trunkFrac);
    const len = b.len * grow;
    const a = b.angle * b.side;
    return {
      x: base.x + Math.sin(a) * len + b.curve * b.side * len * 0.2,
      y: base.y - Math.cos(a) * len - len * 0.08,
    };
  }

  /** Current mature size factor (0 seed .. 1), used for shadows and framing. */
  get crownScale(): number {
    return smooth(0.3, 0.9, this.u);
  }

  setProgress(u: number) {
    const uu = Math.min(1, Math.max(0, u));
    this.u = uu;
    if (Math.abs(uu - this.lastDrawnU) < 0.00025 && this.lastDrawnU >= 0) return;
    this.lastDrawnU = uu;
    this.layout(uu);
  }

  private layout(u: number) {
    const s = this.shape;
    const L = this.trunkLen(u);
    const trunkFrac = L / s.trunkH;
    // soil mound and seed
    this.mound.clear();
    // the soil swells softly around the seed, then settles as the stem thickens
    const swell = smooth(0, 0.012, u) * (1 - smooth(0.25, 0.45, u));
    if (swell > 0.01) {
      this.mound.ellipse(0.6, 0.2, 5.5 + swell * 1.6, 0.8 + swell * 1.5).fill({ color: 0x8f7c6e, alpha: 0.55 * swell + 0.15 });
      this.mound.ellipse(-0.9, -0.4 - swell * 0.7, 3 + swell, 0.5 + swell * 0.8).fill({ color: 0xc6b19d, alpha: 0.45 * swell });
    }
    const seedVis = 1 - smooth(0.03, 0.065, u);
    this.seedSprite.visible = seedVis > 0.01;
    if (this.seedSprite.visible) {
      const split = smooth(0.012, 0.03, u);
      this.seedSprite.alpha = seedVis;
      this.seedSprite.position.set(3 * split, -swell * 2.4 - split * 1.5);
      this.seedSprite.rotation = -0.25 + split * 0.9;
    }

    this.drawTrunk(u, L);

    // leaves
    const trunkFrac0 = L / s.trunkH;
    for (const lf of this.leaves) {
      const open = easeOut((u - lf.u0) / (lf.u1 - lf.u0));
      const fade = 1 - smooth(lf.fade0, lf.fade0 + (lf.cotyledon ? 0.05 : 0.07), u);
      let p: { x: number; y: number } | null = null;
      if (open > 0.001 && fade > 0.001) {
        if (lf.cotyledon) {
          // cotyledons ride on the tip until the stem passes them, then stay at their node
          if (L > 6) p = this.trunkPoint(Math.min(lf.h, L), L);
        } else if (lf.h < 0) {
          const b = this.branches[-1 - lf.h];
          const grow = easeOut((u - b.u0) / (b.u1 - b.u0));
          if (grow > 0.3) p = this.branchTip(b, grow, trunkFrac0);
        } else if (L >= 12) {
          p = this.trunkPoint(lf.h * L, L);
        }
      }
      lf.sprite.visible = !!p;
      if (!p) continue;
      const droop = lf.cotyledon ? smooth(lf.fade0 - 0.08, lf.fade0, u) * 0.6 : smooth(lf.fade0 - 0.05, lf.fade0 + 0.05, u) * 0.5;
      lf.sprite.position.set(p.x, p.y);
      const closed = 0.12 * lf.side;
      lf.sprite.rotation = closed + (lf.side * lf.angle - closed) * open + lf.side * droop;
      const grown = lf.cotyledon ? 1 : 0.85 + 0.15 * smooth(lf.u1, lf.u1 + 0.1, u);
      const sc = (lf.size * grown * (0.35 + 0.65 * open) * 14) / 106;
      lf.sprite.scale.set(sc * (0.6 + 0.4 * open), sc);
      lf.sprite.alpha = fade * Math.min(1, open * 3);
    }

    // clumps
    for (const c of this.clumps) {
      const open = (u - c.u0) / (c.u1 - c.u0);
      if (open <= 0) {
        c.sprite.visible = false;
        c.baseAlpha = 0;
        if (c.autumn) c.autumn.visible = false;
        continue;
      }
      c.sprite.visible = true;
      const e = easeOut(open);
      const anchor =
        c.branch < 0
          ? this.trunkPoint(L, L)
          : this.branchTip(this.branches[c.branch], easeOut((u - this.branches[c.branch].u0) / (this.branches[c.branch].u1 - this.branches[c.branch].u0)), trunkFrac);
      const late = smooth(c.u1, 1, u);
      const k = 0.15 + 0.67 * e + 0.18 * late;
      c.sprite.position.set(anchor.x + c.ox * (0.25 + 0.75 * e), anchor.y + c.oy * (0.25 + 0.75 * e));
      c.sprite.scale.set((c.r * 2 * k) / 150);
      c.baseAlpha = Math.min(1, open * 4);
      c.sprite.alpha = c.baseAlpha;
      c.sprite.rotation = c.rot * (1 - e * 0.6);
      if (c.autumn) {
        c.autumn.position.copyFrom(c.sprite.position);
        c.autumn.scale.copyFrom(c.sprite.scale);
        c.autumn.rotation = c.sprite.rotation;
      }
    }
    this.seasonKey = '';

    // falling leaves (lie at the roots afterwards)
    for (const f of this.falls) {
      const t = (u - f.u0) / (f.u1 - f.u0);
      if (t <= 0) {
        f.sprite.visible = false;
        continue;
      }
      f.sprite.visible = true;
      const tt = Math.min(1, t);
      const y = f.fromY + (0 - f.fromY) * (tt * tt * (3 - 2 * tt) * 0.3 + tt * 0.7);
      const x = f.fromX + (f.toX - f.fromX) * tt + Math.sin(tt * Math.PI * 3) * f.sway * (1 - tt);
      f.sprite.position.set(x, Math.min(-0.5, y));
      const landed = tt >= 1;
      f.sprite.rotation = landed ? f.spin * 0.25 : Math.sin(tt * f.spin) * 1.2;
      f.sprite.scale.set(9 / 64, (landed ? 4.5 : 9) / 64);
    }
  }

  private drawTrunk(u: number, L: number) {
    const g = this.trunk;
    g.clear();
    if (L <= 0.2) return;
    const s = this.shape;
    const wood = smooth(0.18, 0.5, u);
    const w0 = this.trunkWidth(u);
    const bark = mix(this.stemColor, this.barkCol, wood);
    const lit = mix(mix(this.stemColor, [235, 240, 210], 0.35), this.litCol, wood);
    const dark = mix(mix(this.stemColor, [60, 80, 60], 0.4), this.darkCol, wood);
    const n = 14;
    const left: number[] = [];
    const right: number[] = [];
    const litPoly: number[] = [];
    const darkPoly: number[] = [];
    const hook = u < 0.045 ? (1 - smooth(0.014, 0.045, u)) * 2.3 : 0;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let p = this.trunkPoint(L * t, L);
      if (hook > 0 && t > 0.45) {
        // the emerging sprout is bent over like a hook and straightens out
        const k = (t - 0.45) / 0.55;
        const ang = hook * k * k;
        const base = this.trunkPoint(L * 0.45, L);
        const seg = L * 0.55 * k;
        p = { x: base.x + Math.sin(ang) * seg * 0.9, y: base.y - Math.cos(ang) * seg * 0.9 };
      }
      pts.push(p);
    }
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n, i + 1)];
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const flare = wood * Math.max(0, 1 - t / 0.09) ** 2 * 0.55;
      // a young stem is nearly even with a soft round tip; wood tapers toward the crown
      const taperK = 0.22 + 0.48 * wood;
      const tipRound = wood < 0.5 && t > 0.9 ? Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.1) ** 2)) : 1;
      const w = (w0 * (1 - taperK * t) * (1 + flare) * (0.35 + 0.65 * tipRound)) / 2;
      left.push(p.x - nx * w, p.y - ny * w);
      right.unshift(p.x + nx * w, p.y + ny * w);
      litPoly.push(p.x - nx * w, p.y - ny * w);
      darkPoly.push(p.x + nx * w, p.y + ny * w);
    }
    // centerline for the lit and shadow strips
    const center: number[] = [];
    const centerR: number[] = [];
    for (let i = 0; i <= n; i++) {
      center.unshift(pts[i].x - 0.15 * w0 * (1 - 0.7 * (i / n)), pts[i].y);
      centerR.push(pts[i].x + 0.22 * w0 * (1 - 0.7 * (i / n)), pts[i].y);
    }
    g.poly([...left, ...right]).fill({ color: num(bark) });
    g.poly([...litPoly, ...center]).fill({ color: num(lit), alpha: 0.55 });
    g.poly([...centerR, ...reversePairs(darkPoly)]).fill({ color: num(dark), alpha: 0.32 });

    // bark marks once woody
    if (wood > 0.3) {
      const marks = s.baseW > 15 ? 6 : 9;
      for (let i = 0; i < marks; i++) {
        const t = 0.12 + (i / marks) * 0.75;
        if (L * t < 10) continue;
        const p = this.trunkPoint(L * t, L);
        const w = (w0 * (1 - 0.7 * t)) / 2;
        const birch = this.sp.name === 'birch';
        g.moveTo(p.x - w * (birch ? 0.7 : 0.1), p.y)
          .lineTo(p.x + w * (birch ? 0.25 : 0.05), p.y - (birch ? 0.8 : 7))
          .stroke({ color: num(this.markCol), width: birch ? 1.7 : 1.1, alpha: (wood - 0.3) * (birch ? 0.85 : 0.35) });
      }
    }

    // branches
    const trunkFrac = L / s.trunkH;
    for (const b of this.branches) {
      const grow = easeOut((u - b.u0) / (b.u1 - b.u0));
      if (grow <= 0) continue;
      const base = this.trunkPoint(b.h * trunkFrac, L);
      const tipP = this.branchTip(b, grow, trunkFrac);
      const midX = (base.x + tipP.x) / 2 - b.side * 6 * grow;
      const midY = (base.y + tipP.y) / 2 + 4 * grow;
      const w = b.w0 * (0.4 + 0.6 * grow) * Math.min(1, w0 / s.baseW + 0.3);
      const upper: number[] = [];
      const lower: number[] = [];
      const litInner: number[] = [];
      const m = 8;
      for (let i = 0; i <= m; i++) {
        const t = i / m;
        const it = 1 - t;
        const x = it * it * base.x + 2 * it * t * midX + t * t * tipP.x;
        const y = it * it * base.y + 2 * it * t * midY + t * t * tipP.y;
        const ww = (w * (1 - 0.75 * t)) / 2;
        upper.push(x, y - ww);
        lower.push(x, y + ww);
        litInner.push(x, y - ww * 0.1);
      }
      g.poly([...upper, ...reversePairs(lower)]).fill({ color: num(bark) });
      g.poly([...upper, ...reversePairs(litInner)]).fill({ color: num(lit), alpha: 0.4 });
    }
  }

  /**
   * Seasons change the crown without touching growth: in autumn clumps turn gold or apricot one
   * by one, late in autumn a deciduous crown thins to bare twigs, winter brings a little snow,
   * and spring leafs out again. Young trees keep their leaves (and are protected in winter).
   */
  setSeason(se: SeasonState) {
    const key = se.id + ':' + Math.round(se.p * 400) + ':' + Math.round(this.u * 200) + ':' + Math.round((se.snow ?? -1) * 50);
    if (key === this.seasonKey) return;
    this.seasonKey = key;
    const mature = smooth(0.8, 1, this.u);
    const ws = se.w;
    // progress within each season: the dominant one is at p, the previous one has ended and
    // the next one has just begun
    const pOf = (i: number) => (i === se.id ? se.p : (i + 1) % 4 === se.id ? 1 : 0);
    let twig = 0;
    const rampMax = RAMP_MAX[this.sp.name] ?? 1;
    // blossom trees flower in spring, then leaf out green until autumn turns them
    const blossom = this.sp.name === 'blossom';
    for (const c of this.clumps) {
      let foliage = 0;
      let autumn = 0;
      let stage = 0;
      let stageW = 0;
      let green = 0;
      for (let i = 0; i < 4; i++) {
        const w = ws[i];
        if (w <= 0) continue;
        const p = pOf(i);
        let fo = 1;
        let au = 0;
        let st = 0;
        if (!this.evergreen) {
          if (i === 0) fo = 0.12 + 0.88 * smooth(0, 0.4, p);
          else if (i === 2) {
            // green → yellow first, then along the ramp to brown before the leaves drop
            au = smooth(c.delay * 0.6, c.delay * 0.6 + 0.3, p);
            st = Math.min(1, Math.max(0, (p - c.delay * 0.55 - 0.12) / 0.62));
            fo = 1 - 0.88 * smooth(0.72 + c.delay * 0.2, 1, p);
          } else if (i === 3) {
            // a few dry leaves hang on through winter
            fo = 0.12;
            au = 1;
            st = 1;
          }
        }
        foliage += w * fo;
        autumn += w * au;
        stage += w * au * st;
        stageW += w * au;
        if (blossom) green += w * (i === 0 ? smooth(0.4 + c.delay * 0.15, 0.85 + c.delay * 0.1, p) : i === 3 ? 0 : 1);
      }
      // only grown trees go through leaf fall
      foliage = 1 - (1 - foliage) * mature;
      autumn *= 0.35 + 0.65 * mature;
      const over = blossom ? Math.max(autumn, green) : autumn;
      c.sprite.alpha = c.baseAlpha * foliage * (1 - over * 0.85);
      if (c.autumn) {
        c.autumn.visible = c.sprite.visible && over > 0.01;
        c.autumn.alpha = c.baseAlpha * foliage * over;
        if (c.autumn.visible) {
          const ramp = rampColor((stageW > 0 ? stage / stageW : 0) * rampMax);
          const k = blossom ? Math.min(1, autumn / Math.max(over, 1e-3)) : 1;
          const col: [number, number, number] = [LEAF_GREEN[0] + (ramp[0] - LEAF_GREEN[0]) * k, LEAF_GREEN[1] + (ramp[1] - LEAF_GREEN[1]) * k, LEAF_GREEN[2] + (ramp[2] - LEAF_GREEN[2]) * k];
          const lit = c.tint;
          c.autumn.tint = (Math.round((col[0] * ((lit >> 16) & 255)) / 255) << 16) | (Math.round((col[1] * ((lit >> 8) & 255)) / 255) << 8) | Math.round((col[2] * (lit & 255)) / 255);
        }
      }
      twig = Math.max(twig, 1 - foliage);
    }
    twig = this.evergreen ? 0 : twig * mature;
    // snow rests on grown crowns during winter (never on the young tree being cared for); it
    // has melted by the time winter ends, so the blend into spring never brings it back
    const wp = pOf(3);
    const snow = (se.snow !== undefined ? se.snow : ws[3] * smooth(0.12, 0.4, wp) * (1 - smooth(0.82, 1, wp))) * mature;
    this.twigs.visible = twig > 0.02 && this.u > 0.5;
    this.twigs.alpha = Math.min(1, twig * 1.3);
    // on a bare tree the snow sits on the twigs, so it only shows as the leaves are gone
    const rest = this.evergreen ? snow : snow * Math.min(1, twig * 1.3);
    for (const sc of this.snow) {
      sc.visible = rest > 0.02;
      sc.alpha = rest * 0.92;
    }
  }

  /** Offsets (relative to the trunk base, y up) of visible crown clumps, for falling leaves. */
  crownLeafPoint(i: number): { x: number; y: number } {
    const vis = this.clumps.filter((c) => c.sprite.visible && c.baseAlpha > 0.5);
    if (!vis.length) return this.crownPoint('side');
    const c = vis[i % vis.length];
    return { x: c.sprite.x, y: -c.sprite.y - c.r * 0.2 };
  }

  /** Ambient sway. `wind` in [-1, 1]; t in seconds. */
  sway(t: number, wind: number, motion: boolean) {
    if (!motion) {
      this.root.skew.x = 0;
      return;
    }
    const young = 1 - smooth(0.2, 0.6, this.u);
    const amp = 0.012 + young * 0.05;
    this.root.skew.x = -wind * amp - Math.sin(t * 0.9 + this.windPhase) * 0.002;
    for (const c of this.clumps) {
      if (!c.sprite.visible) continue;
      const local = Math.sin(t * 1.3 + c.phase) * 0.5 + Math.sin(t * 0.7 + c.phase * 1.7) * 0.5;
      c.sprite.rotation = c.rot * (1 - Math.min(1, (this.u - c.u0) / (c.u1 - c.u0)) * 0.6) + (wind * 0.5 + local * 0.5) * 0.035;
      c.sprite.skew.x = -local * 0.02;
      if (c.autumn) {
        c.autumn.rotation = c.sprite.rotation;
        c.autumn.skew.x = c.sprite.skew.x;
      }
    }
    for (const lf of this.leaves) {
      if (!lf.sprite.visible) continue;
      lf.sprite.skew.x = -Math.sin(t * 1.9 + lf.phase) * 0.06 - wind * 0.05;
    }
  }

  /** World offset of a point high in the crown, for birds and falling seeds. */
  crownPoint(which: 'top' | 'side' | 'perch'): { x: number; y: number } {
    const s = this.shape;
    if (which === 'top') return { x: s.lean * 0.9, y: -(s.H - 30) };
    if (which === 'side') return { x: s.lean * 0.9 + s.crownW * 0.32, y: -(s.H - s.crownH * 0.45) };
    return { x: s.lean * 0.9 - s.crownW * 0.38, y: -(s.H - s.crownH * 0.62) };
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}
