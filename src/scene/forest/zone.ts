/**
 * Content of one forest zone, rebuilt deterministically from (seed, zone) and driven by the
 * simulation state:
 * 'detail': clearings (spring, bench, compost, barrel, channel, flowerbeds), trees grown by the
 *           keeper's care, cleared and mulched soil, collectable seeds and leaf piles under
 *           mature trees, the seasonal leaf layer and snow, decor, paths and the zone feature.
 * 'lod': distant silhouettes only (older zones far behind).
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { rngFor, type Rng } from '../../core/rng';
import type { GrowthRules } from '../../core/rules';
import { clusterWorld, featureWorld, pathWorld, slotWorld, zoneOrigin, type Geometry, type Vec2 } from '../../core/world';
import { FOREST } from '../../sim/config';
import { barrelAt, compostAt, elderAge, forestDoneAt, forestUnitProgress, groundAt, pondAt, type ForestSim } from '../../sim/forest';
import { elderPos, innerOfUnit, pondCenter } from '../../sim/layout';
import type { SeasonMix } from '../../world/season';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from '../../sim/units';
import { CardLayer, type Card } from '../diorama';
import { mix, num } from '../paint/color';
import { Clearing } from './clearing';
import { ElderTree, ZonePond } from './landmarks';
import { F, flavorOf, SPECIES, type Flavor, type SpeciesPalette } from './palette';
import type { ForestTextures } from './textures';
import { Tree } from './tree';

export interface ZoneContext {
  seed: number;
  rules: GrowthRules;
  geom: Geometry;
  layer: CardLayer;
  tex: ForestTextures;
}

/** What the scene knows about the work right now (transfers in progress included). */
export interface ForestZoneView {
  sim: ForestSim;
  W: number;
  t: number;
  motion: boolean;
  wind: (t: number, x: number) => number;
  season: SeasonMix;
  /** Seeds shown in the active bench basket and whether the basket stands there. */
  basket: number;
  basketHome: boolean;
  /** Leaf piles / seeds under a tree that are being picked up right now. */
  picking: Map<number, { seeds: number; leaves: number }>;
  /** Progress of building the barrel (0..1) and digging (fractional segments). */
  barrelBuild: number;
  digging: number;
  /** Soil being cleared at a unit right now (0..1). */
  clearing: { unit: number; k: number } | null;
  /** Ripples at the spring being used. */
  stir: { cluster: number; k: number } | null;
  /** A flowerbed being made: cluster, spot, progress. */
  bedMaking: { c: number; k: number; p: number } | null;
  /** The pond being dug or lined right now (progress of the step, 0 none). */
  pondDig: number;
  pondLine: number;
  /** Weather and light at W: ground wetness, snow cover, ice on still water, rain, sun shadows. */
  env: ZoneEnv;
}

export interface ZoneEnv {
  wet: number;
  snowCover: number;
  ice: number;
  rain: number;
  /** Shadow direction (−1 left .. 1 right), length factor and directional strength (0..0.5). */
  shadowDir: number;
  shadowLen: number;
  shadowAlpha: number;
  /** The old tree in blossom (0..1). */
  bloom: number;
}

interface TreeEntry {
  unit: number;
  tree: Tree;
  card: Card;
  shadow: Card;
  litter: Card;
  soil: Card;
  mulch: Card;
  pos: Vec2;
  seedDots: Sprite[];
  seedCard: Card;
  leafCard: Card;
  leafPiles: Sprite[];
}

interface Decor {
  card: Card;
  sway: number;
  phase: number;
  /** Appears after this unit is complete (delay, span); null = always present. */
  appear: { unit: number; delay: number; span: number } | null;
  flower?: boolean;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function appear(done: number, delay: number, span: number, W: number): number {
  if (done === -Infinity) return 1;
  if (done === Infinity) return 0;
  return smooth(done + delay, done + delay + span, W);
}

/** A card holding one sprite sized to `width` world units. */
export function spriteCard(tex: Texture, anchor: [number, number], width: number, X: number, Z: number, opts: Partial<Card> = {}): { card: Card; sprite: Sprite } {
  const obj = new Container();
  const sprite = new Sprite(tex);
  sprite.anchor.set(anchor[0], anchor[1]);
  sprite.scale.set(width / tex.width);
  obj.addChild(sprite);
  const h = (tex.height * width) / tex.width;
  const card: Card = { obj, X, Y: 0, Z, radius: Math.max(width, h) * 0.7, height: h, ...opts };
  return { card, sprite };
}

export function speciesFor(seed: number, unit: number, flavor: Flavor, upc: number): SpeciesPalette {
  const pick = (u: number) => {
    const r = rngFor(seed, u, 31);
    return r.weighted(flavor.species, flavor.weights);
  };
  let name = pick(unit);
  if (unit % upc !== 0 && name === pick(unit - 1)) name = rngFor(seed, unit, 32).weighted(flavor.species, flavor.weights);
  return SPECIES[name];
}

export class ForestZone {
  readonly zone: number;
  readonly level: 'detail' | 'lod';
  private ctx: ZoneContext;
  private cards: Card[] = [];
  private trees = new Map<number, TreeEntry>();
  private decor: Decor[] = [];
  private flavor: Flavor;
  private firstUnit: number;
  private fireflies: { s: Sprite; phase: number; r: number; h: number }[] = [];
  private fireflyCard: Card | null = null;
  private featureUnit: number;
  private ripples: { s: Sprite; phase: number }[] = [];
  readonly clearings: Clearing[] = [];
  private snow: Card[] = [];
  private pond: ZonePond | null = null;
  private elder: ElderTree | null = null;

  constructor(ctx: ZoneContext, zone: number, level: 'detail' | 'lod') {
    this.ctx = ctx;
    this.zone = zone;
    this.level = level;
    this.flavor = flavorOf(ctx.seed, zone);
    this.firstUnit = zone * UPZ;
    this.featureUnit = this.firstUnit + UPZ - 1;
    if (level === 'lod') this.buildLod();
    else this.buildDetail();
  }

  private add(card: Card) {
    this.ctx.layer.add(card);
    this.cards.push(card);
    return card;
  }

  private slot(i: number): Vec2 {
    const { seed, geom } = this.ctx;
    return slotWorld(seed, this.zone, Math.floor(i / UPC), i % UPC, geom, 'forest');
  }

  // ---- LOD ------------------------------------------------------------------

  private buildLod() {
    const { seed, geom, tex } = this.ctx;
    for (let i = 0; i < UPZ; i++) {
      const unit = this.firstUnit + i;
      const p = this.slot(i);
      const sp = speciesFor(seed, unit, this.flavor, UPC);
      const t = tex.species[sp.name].distant[unit % 2];
      const h = rngFor(seed, unit, 5).range(250, 300);
      const { card } = spriteCard(t, [0.5, 186 / 192], (h * 128) / 192, p.x, p.z);
      this.add(card);
    }
    const f = featureWorld(seed, this.zone, geom);
    const { card } = spriteCard(tex.pond, [0.5, 0.5], 200, f.x, f.z, { flat: true });
    card.obj.alpha = 0.8;
    this.add(card);
    // the zone's pond and old tree, grown into a giant long ago
    const pc = pondCenter(seed, this.zone, geom);
    this.add(spriteCard(tex.pond, [0.5, 0.5], 190, pc.x, pc.z, { flat: true, order: -1 }).card);
    const e = elderPos(seed, this.zone, geom);
    this.add(spriteCard(tex.species.round.distant[0], [0.5, 186 / 192], 330, e.x, e.z).card);
  }

  // ---- detail ---------------------------------------------------------------

  private buildDetail() {
    const { seed, geom, tex } = this.ctx;
    const r = rngFor(seed, this.zone, 600);
    const o = zoneOrigin(seed, this.zone, geom);
    const slots: Vec2[] = [];
    for (let i = 0; i < UPZ; i++) slots.push(this.slot(i));
    const path = resample(pathWorld(seed, this.zone, geom), 34);
    const feature = featureWorld(seed, this.zone, geom);
    const elderAt = elderPos(seed, this.zone, geom);
    const pondAtPos = pondCenter(seed, this.zone, geom);
    for (let c = 0; c < 4; c++) this.clearings.push(new Clearing(this.ctx, this.zone * 4 + c));
    // the zone's landmarks: a pond the keeper digs, an old tree it plants
    this.pond = new ZonePond(this.ctx, this.zone, (c) => this.add(c));
    this.elder = new ElderTree(this.ctx, this.zone, (c) => this.add(c));
    const blockers = this.clearings.flatMap((cl) => cl.blockers);
    const blocked = (x: number, z: number, slotR = 70, pathR = 40) => {
      for (const s of slots) if (Math.hypot(s.x - x, (s.z - z) * 1.2) < slotR) return true;
      for (const p of path) if (Math.hypot(p.x - x, (p.z - z) * 1.4) < pathR) return true;
      for (const b of blockers) if (Math.hypot(b.x - x, (b.z - z) * 1.2) < b.r + slotR * 0.35) return true;
      if (Math.hypot(feature.x - x, (feature.z - z) * 1.3) < 190) return true;
      if (Math.hypot(elderAt.x - x, (elderAt.z - z) * 1.3) < 130) return true;
      if (Math.hypot(pondAtPos.x - x, (pondAtPos.z - z) * 2.4) < 150) return true;
      return false;
    };

    // Large soft color fields: sunlit pools and cool shade break up the meadow.
    for (let i = 0; i < 12; i++) {
      const x = o.x + r.range(-geom.halfWidth * 1.25, geom.halfWidth * 1.25);
      const z = o.z + r.range(-260, geom.depth + 300);
      const lit = r.chance(0.5);
      const { card, sprite } = spriteCard(lit ? tex.sunGlow : tex.shadow, [0.5, 0.5], r.range(300, 700), x, z, { flat: true, order: -3 });
      if (lit) {
        sprite.blendMode = 'add';
        card.alpha = r.range(0.08, 0.14);
      } else {
        sprite.tint = num(mix(F.moss, F.deep, 0.3));
        card.alpha = r.range(0.22, 0.34);
      }
      this.add(card);
    }

    // Each clearing sits in its own patch of sunlight: light soil and warm light mark the work.
    for (const cl of this.clearings) {
      const cx = (cl.spring.x + cl.bench.x) / 2;
      const { card, sprite } = spriteCard(tex.sunGlow, [0.5, 0.5], 420, cx, cl.bench.z + 50, { flat: true, order: -3 });
      sprite.blendMode = 'add';
      card.alpha = 0.16;
      this.add(card);
    }

    // Hero composition around the zone's first tree: the close-up must already be a picture.
    const s0 = slots[0];
    const inner0 = innerOfUnit(this.firstUnit);
    this.addDecor(tex.mossyRocks[0], [0.5, 146 / 160], 84, s0.x - inner0 * 70, s0.z + 96, 0, r);
    this.addDecor(tex.rocks[r.int(0, 1)], [0.5, 146 / 160], 22, s0.x + inner0 * 52, s0.z + 30, 0, r);
    this.addDecor(tex.ferns[r.int(0, 2)], [0.5, 170 / 176], 58, s0.x - inner0 * 96, s0.z + 70, 0.02, r);
    this.addDecor(tex.moss[0], [0.5, 0.5], 80, s0.x - inner0 * 50, s0.z + 44, 0, r, { flat: true });
    this.addDecor(tex.mushrooms[r.int(0, 2)], [0.5, 90 / 96], 14, s0.x - inner0 * 44, s0.z + 60, 0, r);
    this.addDecor(tex.flowers.daisy[0], [0.5, 140 / 144], 13, s0.x - inner0 * 26, s0.z + 26, 0.06, r);
    this.addDecor(tex.grass[1], [0.5, 122 / 128], 40, s0.x + inner0 * 70, s0.z + 64, 0.05, r);

    // Scattered environment. Density is lower in the central clearing to keep it calm.
    const fl = this.flavor;
    const kinds: { k: string; w: number }[] = [
      { k: 'grass', w: 44 },
      { k: 'tall', w: 8 },
      { k: 'flower', w: 20 * fl.flowers },
      { k: 'fern', w: 8 * fl.ferns },
      { k: 'rock', w: 4 },
      { k: 'mrock', w: 4 },
      { k: 'mush', w: 4 * fl.mushrooms },
      { k: 'moss', w: 6 },
    ];
    const total = kinds.reduce((s, k) => s + k.w, 0);
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 140; tries++) {
      const lx = r.range(-geom.halfWidth * 1.2, geom.halfWidth * 1.2);
      const lz = r.range(-320, geom.depth + 260);
      const x = o.x + lx;
      const z = o.z + lz;
      const central = Math.abs(lx) < geom.halfWidth * 0.26 && lz < geom.depth * 0.7;
      if (central && !r.chance(0.25)) continue;
      if (blocked(x, z)) continue;
      let pick = r.next() * total;
      let kind = 'grass';
      for (const k of kinds) {
        pick -= k.w;
        if (pick <= 0) {
          kind = k.k;
          break;
        }
      }
      if (central && (kind === 'rock' || kind === 'mrock' || kind === 'fern' || kind === 'tall')) kind = 'flower';
      this.addKind(kind, x, z, r);
      placed++;
    }
    // Foreground framing at the zone's front edge (low, so it never covers the work).
    for (let i = 0; i < 20; i++) {
      const lx = r.range(-geom.halfWidth * 1.1, geom.halfWidth * 1.1);
      if (Math.abs(lx) < geom.halfWidth * 0.18) continue;
      const x = o.x + lx;
      const z = o.z + r.range(-340, -200);
      if (blocked(x, z, 60, 30)) continue;
      this.addKind(r.chance(0.5) ? 'grass' : r.chance(0.5) ? 'flower' : 'fern', x, z, r);
    }

    // Cluster connections: moss, wildflowers and a stepping-stone trail to the path, laid
    // once the clearing's last tree has grown.
    for (let c = 0; c < 4; c++) {
      const lastUnit = this.firstUnit + (c + 1) * UPC - 1;
      const cc = clusterWorld(seed, this.zone, c, geom);
      const cs = slots.slice(c * UPC, (c + 1) * UPC);
      const cx = cs.reduce((s, p) => s + p.x, 0) / cs.length;
      const cz = cs.reduce((s, p) => s + p.z, 0) / cs.length;
      const rr = rngFor(seed, this.zone, c, 610);
      let k = 0;
      const next = () => ({ unit: lastUnit, delay: 3000 + k++ * 2400, span: 9000 });
      for (let i = 0; i < 3; i++) {
        const a = rr.range(0, Math.PI * 2);
        this.addDecor(tex.moss[rr.int(0, 2)], [0.5, 0.5], rr.range(70, 110), cx + Math.cos(a) * 70, cz + Math.sin(a) * 50, 0, rr, { flat: true }, next());
      }
      const flowerKinds = ['daisy', 'bell', 'puff', 'rose'] as const;
      for (let i = 0; i < 7; i++) {
        const a = rr.range(0, Math.PI * 2);
        const d = rr.range(40, 150);
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d * 0.7;
        if (cs.some((s) => Math.hypot(s.x - x, s.z - z) < 36)) continue;
        this.addDecor(tex.flowers[flowerKinds[rr.int(0, 3)]][rr.int(0, 1)], [0.5, 140 / 144], rr.range(13, 17), x, z, 0.06, rr, {}, next());
      }
      let best = path[0];
      let bd = Infinity;
      for (const p of path) {
        const d = Math.hypot(p.x - cc.x, p.z - cc.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      const steps = Math.max(3, Math.min(9, Math.round(bd / 40)));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const x = cx + (best.x - cx) * t + rr.range(-8, 8);
        const z = cz + (best.z - cz) * t + rr.range(-6, 6);
        this.addDecor(tex.stones[rr.int(0, 2)], [0.5, 0.5], rr.range(24, 32), x, z, 0, rr, { flat: true }, { unit: lastUnit, delay: 8000 + i * 1800, span: 6000 });
      }
    }

    // Main path: each stretch is uncovered when its nearest clearing is complete.
    const centers = [0, 1, 2, 3].map((c) => clusterWorld(seed, this.zone, c, geom));
    path.forEach((p, i) => {
      let bc = -1;
      let bd = 760;
      centers.forEach((c, ci) => {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bd) {
          bd = d;
          bc = ci;
        }
      });
      const lastUnit = this.firstUnit + (bc >= 0 ? (bc + 1) * UPC - 1 : UPZ - 1);
      const { card } = spriteCard(tex.pathPatches[i % 3], [0.5, 0.5], r.range(70, 86), p.x + r.range(-5, 5), p.z, { flat: true, order: -2 });
      card.alpha = 0;
      card.hidden = true;
      this.add(card);
      this.decor.push({ card, sway: 0, phase: 0, appear: { unit: lastUnit, delay: 6000 + (i / path.length) * 40_000, span: 8000 } });
    });

    // Zone feature, discovered when the zone completes.
    this.buildFeature(feature, r);

    // Thin snow patches for winter, kept off the clearings' work corners and the paths.
    for (let i = 0, tries = 0; i < 34 && tries < 400; tries++) {
      const x = o.x + r.range(-geom.halfWidth * 1.2, geom.halfWidth * 1.2);
      const z = o.z + r.range(-260, geom.depth + 200);
      if (blocked(x, z, 64, 44)) continue;
      const { card } = spriteCard(tex.snowGround, [0.5, 0.5], r.range(110, 260), x, z, { flat: true, order: -2, hidden: true });
      this.add(card);
      this.snow.push(card);
      i++;
    }
  }

  private buildFeature(at: Vec2, r: Rng) {
    let f = at;
    const { tex } = this.ctx;
    const unit = this.featureUnit;
    const fid = this.flavor.id;
    const win = (i = 0) => ({ unit, delay: 4000 + i * 1500, span: 9000 });
    if (fid === 'spring' || fid === 'brook') {
      // the keeper's pond is the heart of this zone: a few rocks and ferns gather round it
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * (1.05 + i * 0.27);
        this.addDecor(tex.rocks[i % 2], [0.5, 146 / 160], r.range(20, 32), f.x + Math.cos(a) * 128, f.z + Math.sin(a) * 46 - 4, 0, r, {}, win(i));
      }
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * (0.15 + i * 0.32);
        this.addDecor(tex.ferns[i % 3], [0.5, 0.95], r.range(30, 42), f.x + Math.cos(a) * 134, f.z + Math.sin(a) * 44 + 14, 0.05, r, {}, win(i + 2));
      }
    } else if (fid === 'mossy') {
      f = { x: f.x + 190, z: f.z + 50 };
      this.addDecor(tex.stump, [0.5, 180 / 192], 110, f.x, f.z + 10, 0, r, {}, win());
      this.addDecor(tex.moss[2], [0.5, 0.5], 170, f.x, f.z, 0, r, { flat: true }, win());
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        this.addDecor(tex.mushrooms[i % 3], [0.5, 90 / 96], r.range(14, 20), f.x + Math.cos(a) * 92, f.z + Math.sin(a) * 52, 0, r, {}, win(i));
      }
    } else {
      f = { x: f.x + 190, z: f.z + 50 };
      const kinds = ['daisy', 'rose', 'puff', 'bell'] as const;
      for (let i = 0; i < 26; i++) {
        const a = r.range(0, Math.PI * 2);
        const d = Math.sqrt(r.next()) * 120;
        this.addDecor(tex.flowers[kinds[i % 4]][r.int(0, 1)], [0.5, 140 / 144], r.range(14, 19), f.x + Math.cos(a) * d, f.z + Math.sin(a) * d * 0.55, 0.06, r, {}, win(i * 0.4));
      }
      this.addDecor(tex.moss[1], [0.5, 0.5], 200, f.x, f.z, 0, r, { flat: true }, win());
    }
    if (fid !== 'flower') {
      const obj = new Container();
      const card: Card = { obj, X: f.x, Y: 0, Z: f.z - 4, radius: 220, height: 120, order: 3, hidden: true };
      for (let i = 0; i < 6; i++) {
        const s = new Sprite(tex.firefly);
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.scale.set(7 / 48);
        obj.addChild(s);
        this.fireflies.push({ s, phase: r.range(0, 6.28), r: r.range(60, 150), h: r.range(14, 60) });
      }
      this.fireflyCard = card;
      this.add(card);
    }
  }

  private addKind(kind: string, x: number, z: number, r: Rng) {
    const tex = this.ctx.tex;
    switch (kind) {
      case 'grass':
        return this.addDecor(tex.grass[r.int(0, 3)], [0.5, 122 / 128], r.range(38, 56), x, z, 0.05, r);
      case 'tall':
        return this.addDecor(tex.tallGrass[r.int(0, 1)], [0.5, 122 / 128], r.range(52, 70), x, z, 0.045, r);
      case 'flower': {
        const kinds = ['daisy', 'bell', 'puff', 'rose'] as const;
        return this.addDecor(tex.flowers[kinds[r.int(0, 3)]][r.int(0, 1)], [0.5, 140 / 144], r.range(12, 17), x, z, 0.07, r);
      }
      case 'fern':
        return this.addDecor(tex.ferns[r.int(0, 2)], [0.5, 170 / 176], r.range(50, 70), x, z, 0.025, r);
      case 'rock':
        return this.addDecor(tex.rocks[r.int(0, 1)], [0.5, 146 / 160], r.range(22, 46), x, z, 0, r);
      case 'mrock':
        return this.addDecor(tex.mossyRocks[r.int(0, 2)], [0.5, 146 / 160], r.range(46, 80), x, z, 0, r);
      case 'mush':
        return this.addDecor(tex.mushrooms[r.int(0, 2)], [0.5, 90 / 96], r.range(13, 18), x, z, 0, r);
      default:
        return this.addDecor(tex.moss[r.int(0, 2)], [0.5, 0.5], r.range(60, 110), x, z, 0, r, { flat: true });
    }
  }

  private addDecor(tex: Texture, anchor: [number, number], width: number, x: number, z: number, sway: number, r: Rng, opts: Partial<Card> = {}, appearAt: Decor['appear'] = null) {
    const { card, sprite } = spriteCard(tex, anchor, width, x, z, opts);
    if (r.chance(0.5) && !opts.flat) sprite.scale.x *= -1;
    if (appearAt) {
      card.alpha = 0;
      card.hidden = true;
    }
    this.add(card);
    const flower = Object.values(this.ctx.tex.flowers).some((list) => list.includes(tex));
    this.decor.push({ card, sway, phase: r.range(0, 6.28), appear: appearAt, flower });
  }

  private ensureTree(unit: number): TreeEntry {
    let e = this.trees.get(unit);
    if (e) return e;
    const { seed, tex } = this.ctx;
    const i = unit - this.firstUnit;
    const p = this.slot(i);
    const sp = speciesFor(seed, unit, this.flavor, UPC);
    const st = tex.species[sp.name];
    // seedlings are green whatever the crown will become (blossom and maple included)
    const greenLeaves = sp.name === 'blossom' || sp.name === 'maple' ? tex.species.round.leaves : st.leaves;
    const tree = new Tree(
      rngFor(seed, unit, 77).int(0, 2 ** 30),
      sp,
      { clumps: st.clumps, autumn: st.autumn, leaves: greenLeaves, cotyledon: tex.species.birch.leaves[0], seed: tex.seed, fall: tex.fall, twigs: st.twigs, snowCap: tex.snowCap },
      { version: 2, unitMs: FOREST.growMs, unitsPerCluster: UPC, clustersPerZone: 4 },
      rngFor(seed, unit, 78).range(0.92, 1.08),
    );
    const obj = new Container();
    obj.addChild(tree.root);
    const card: Card = { obj, X: p.x, Y: 0, Z: p.z, radius: tree.shape.crownW, height: tree.shape.H + 20 };
    const shadow = spriteCard(tex.shadow, [0.5, 0.5], tree.shape.crownW, p.x + tree.shape.crownW * 0.16, p.z - 6, { flat: true, order: -1 }).card;
    const litter = spriteCard(tex.litter[unit % 2], [0.5, 0.5], tree.shape.crownW * 0.85, p.x + 6, p.z - 2, { flat: true, order: -1 }).card;
    const soil = spriteCard(tex.soil[unit % 3], [0.5, 0.5], 64, p.x, p.z + 0.5, { flat: true, order: -1 }).card;
    const { card: mulch, sprite: ms } = spriteCard(tex.mould, [0.5, 0.5], 40, p.x, p.z + 0.4, { flat: true, order: -1 });
    ms.scale.y *= 2.2;
    // collectable seeds and leaf piles at the tree's foot (separate from the decorative litter)
    const inner = innerOfUnit(unit);
    const sobj = new Container();
    const seedDots: Sprite[] = [];
    for (let k = 0; k < FOREST.seedGroundCap; k++) {
      const s = new Sprite(tex.seed);
      s.anchor.set(0.5, 0.8);
      s.scale.set(5 / 48);
      s.position.set(k * 6 - 3, k * 0.6);
      s.rotation = 0.6 + k * 1.1;
      seedDots.push(s);
      sobj.addChild(s);
    }
    const seedCard: Card = { obj: sobj, X: p.x - inner * 22, Y: 0, Z: p.z - 14, radius: 14, height: 10, hidden: true };
    const lobj = new Container();
    const leafPiles: Sprite[] = [];
    for (let k = 0; k < FOREST.leafGroundCap * 3; k++) {
      const s = new Sprite(tex.fall[k % tex.fall.length]);
      s.anchor.set(0.5, 0.6);
      const pile = Math.floor(k / 3);
      s.position.set((pile % 2 ? 1 : -1) * (10 + pile * 7) + ((k % 3) - 1) * 3.2, (k % 3) * -0.9);
      s.scale.set(7 / 64, 4.2 / 64);
      s.rotation = k * 1.7;
      leafPiles.push(s);
      lobj.addChild(s);
    }
    const leafCard: Card = { obj: lobj, X: p.x + inner * 14, Y: 0, Z: p.z - 18, radius: 50, height: 10, hidden: true };
    this.add(soil);
    this.add(mulch);
    this.add(shadow);
    this.add(litter);
    this.add(seedCard);
    this.add(leafCard);
    this.add(card);
    e = { unit, tree, card, shadow, litter, soil, mulch, pos: p, seedDots, seedCard, leafCard, leafPiles };
    this.trees.set(unit, e);
    return e;
  }

  update(v: ForestZoneView) {
    if (this.level === 'lod') return;
    const { sim, W, t, motion, wind, season } = v;
    const last = this.firstUnit + UPZ - 1;
    const tr = sim.tree;
    // seasonal ground: fallen-leaf layer thickens in autumn and melts into the soil after
    const sw = season.w;
    const litterK = sw[0] * (0.45 - 0.3 * (season.id === 0 ? season.p : 0)) + sw[1] * 0.2 + sw[2] * (0.3 + 0.65 * (season.id === 2 ? season.p : 1)) + sw[3] * 0.55;
    // snow on the ground is what has really fallen (and not melted) this winter
    const snowK = v.env.snowCover;
    const sun = Math.min(1, v.env.shadowAlpha / 0.5);
    const reach = Math.min(1, v.env.shadowLen / 2.5);
    for (let unit = this.firstUnit; unit <= last; unit++) {
      const g = forestUnitProgress(sim, unit, W);
      const isCurrent = unit === tr.unit;
      const prepped = sim.prep !== null && sim.prep.u === unit;
      const clearingNow = v.clearing && v.clearing.unit === unit ? v.clearing.k : 0;
      const soilShown = g !== null || (isCurrent && tr.cleared) || prepped || clearingNow > 0;
      const e = soilShown ? this.ensureTree(unit) : this.trees.get(unit);
      if (!e) continue;
      for (const c of [e.card, e.shadow, e.litter, e.soil, e.mulch]) c.hidden = !soilShown;
      if (!soilShown) {
        e.seedCard.hidden = true;
        e.leafCard.hidden = true;
        continue;
      }
      const grown = g ?? 0;
      e.tree.root.visible = g !== null;
      e.tree.setProgress(grown);
      e.tree.setSeason({ w: season.w, id: season.id, p: season.p, snow: snowK });
      const cs = e.tree.crownScale;
      // a soft contact shadow always; in sunshine it stretches away from the sun
      const sh = e.tree.shape;
      e.shadow.alpha = g !== null ? (0.16 + cs * 0.32) * (0.62 + 0.38 * sun) : 0;
      e.shadow.X = e.pos.x + v.env.shadowDir * sh.crownW * (0.06 + 0.3 * sun * reach);
      e.shadow.obj.scale.set((0.25 + cs * 0.85) * (1 + 0.8 * sun * reach), 0.25 + cs * 0.85);
      e.litter.alpha = smooth(0.88, 1, grown) * litterK * 0.95 * (1 - snowK * 0.7);
      // light, freshly worked soil marks where the work is; it settles as the tree grows
      const soilIn = g !== null || (isCurrent && tr.cleared) || prepped ? 1 : clearingNow;
      e.soil.alpha = soilIn * (1 - 0.6 * smooth(0.5, 1, grown));
      const mulched = (isCurrent && tr.mulched) || (prepped && sim.prep!.mould) || (unit < sim.done && unit >= sim.zone * UPZ);
      e.mulch.hidden = !mulched;
      e.mulch.alpha = mulched ? 0.75 * (1 - 0.7 * smooth(0.6, 1, grown)) : 0;
      // only trees on screen (last frame's projection) need their clumps moved
      if (g !== null && e.card.obj.visible) e.tree.sway(t, wind(t, e.pos.x), motion);
      // collectable piles under mature trees of the current zone
      const gt = sim.ground.find((x) => x.u === unit);
      if (gt) {
        const now = groundAt(sim, gt, W);
        const pick = v.picking.get(unit);
        const seeds = Math.max(0, now.seeds - (pick?.seeds ?? 0));
        const leaves = Math.max(0, now.leaves - (pick?.leaves ?? 0));
        e.seedCard.hidden = seeds <= 0;
        e.seedDots.forEach((s, i) => (s.visible = i < seeds));
        e.leafCard.hidden = leaves <= 0;
        e.leafPiles.forEach((s, i) => (s.visible = i < leaves * 3));
      } else {
        e.seedCard.hidden = true;
        e.leafCard.hidden = true;
      }
    }
    // clearings
    for (const cl of this.clearings) {
      const c = cl.cluster;
      const active = c === sim.cluster;
      const reached = c <= sim.cluster;
      let fresh = 0;
      let mould = 0;
      const cp = sim.composts.find((x) => x.c === c);
      if (cp) {
        const a = compostAt(cp, W);
        fresh = a.fresh;
        mould = a.mould;
      }
      const bedP = [-1, -1];
      for (const b of sim.beds) if (b.c === c) bedP[b.k] = Math.min(1, (W - b.at) / 60_000);
      if (v.bedMaking && v.bedMaking.c === c) bedP[v.bedMaking.k] = Math.max(bedP[v.bedMaking.k], v.bedMaking.p * 0.15);
      const barrel = active && sim.barrel ? (sim.barrel.built ? 1 : v.barrelBuild) : sim.barrels[c] ? 1 : 0;
      cl.update({
        t,
        motion,
        wind: wind(t, cl.bench.x),
        reached,
        basket: active ? v.basket : 0,
        basketHere: active && v.basketHome,
        fresh,
        mould,
        barrel,
        water: active ? barrelAt(sim, W) : 0,
        channel: active ? sim.channel + v.digging : (sim.dug[c] ?? 0),
        beds: bedP,
        stir: v.stir && v.stir.cluster === c ? v.stir.k : 0,
        wet: v.env.wet,
        ice: v.env.ice,
        rain: v.env.rain,
      });
    }
    // the zone's pond and old tree
    if (this.pond) {
      const pd = pondAt(sim, this.zone, W);
      const here = this.zone === sim.zone;
      this.pond.update({ ...pd, digging: here ? v.pondDig : 0, lining: here ? v.pondLine : 0, t, motion, ice: v.env.ice, rain: v.env.rain });
    }
    if (this.elder) {
      this.elder.update({
        age: elderAge(sim, this.zone, W),
        season: { w: season.w, id: season.id, p: season.p, snow: snowK },
        t,
        wind: wind(t, this.elder.pos.x),
        motion,
        shadowDir: v.env.shadowDir,
        shadowAlpha: v.env.shadowAlpha,
        bloom: v.env.bloom,
      });
    }
    // decor fade-ins and sway
    for (const d of this.decor) {
      if (d.appear) {
        const a = appear(forestDoneAt(sim, d.appear.unit), d.appear.delay, d.appear.span, W);
        d.card.alpha = a;
        d.card.hidden = a <= 0.001;
        const sprite = d.card.obj.children[0];
        if (sprite) sprite.scale.y = Math.abs(sprite.scale.x) * (0.4 + 0.6 * a);
      }
      if (d.sway > 0 && motion && d.card.obj.visible) {
        d.card.obj.skew.x = -(wind(t + d.phase * 0.3, d.card.X) * 0.7 + Math.sin(t * 1.7 + d.phase) * 0.3) * d.sway * 2.2;
      } else if (!motion) d.card.obj.skew.x = 0;
    }
    // patches appear one by one as the cover builds up, and melt the same way
    this.snow.forEach((sn, i) => {
      const k = Math.min(1, Math.max(0, snowK * 1.6 - (i / this.snow.length) * 0.6));
      sn.hidden = k <= 0.01;
      sn.alpha = k * 0.85;
    });
    for (const rp of this.ripples) {
      const q = (t * 0.12 + rp.phase) % 1;
      rp.s.scale.set((0.4 + q * 2.2) * (40 / 256));
      rp.s.alpha = motion ? 0.35 * Math.sin(q * Math.PI) : 0;
    }
    if (this.fireflyCard) {
      const done = forestDoneAt(sim, this.featureUnit);
      const a = appear(done, 15_000, 15_000, W);
      this.fireflyCard.hidden = a <= 0.001;
      for (const f of this.fireflies) {
        const tt = motion ? t : 0;
        f.s.position.set(Math.cos(tt * 0.21 + f.phase) * f.r, -f.h - Math.sin(tt * 0.37 + f.phase * 2) * 12);
        f.s.alpha = a * (0.35 + 0.65 * Math.max(0, Math.sin(tt * 0.9 + f.phase * 3)));
      }
    }
  }

  /** Grown trees that may stand in front of the work (faded by the scene when they do). */
  occluders(): Card[] {
    const out: Card[] = [];
    for (const e of this.trees.values()) if (e.tree.u > 0.3 && !e.card.hidden) out.push(e.card);
    if (this.elder && this.elder.tree.u > 0.3 && !this.elder.card.hidden) out.push(this.elder.card);
    return out;
  }

  /** Mature trees in this zone (for birds and falling leaves). */
  matureTrees(): { tree: Tree; card: Card; unit: number }[] {
    const out: { tree: Tree; card: Card; unit: number }[] = [];
    for (const e of this.trees.values()) if (e.tree.u >= 0.999 && !e.card.hidden) out.push(e);
    if (this.elder && this.elder.tree.u >= 0.999 && !this.elder.card.hidden) out.push({ tree: this.elder.tree, card: this.elder.card, unit: -1 });
    return out;
  }

  treeFor(unit: number): { tree: Tree; card: Card; pos: Vec2 } | null {
    return this.trees.get(unit) ?? null;
  }

  clearing(cluster: number): Clearing | null {
    return this.clearings.find((c) => c.cluster === cluster) ?? null;
  }

  /** Flowers available for butterflies (world positions of flower tops). */
  flowerSpots(): { x: number; y: number; z: number }[] {
    const out: { x: number; y: number; z: number }[] = [];
    for (const d of this.decor) {
      if (!d.flower) continue;
      if (d.card.hidden || (d.appear && (d.card.alpha ?? 1) < 0.99)) continue;
      out.push({ x: d.card.X, y: (d.card.height ?? 20) * 0.62, z: d.card.Z });
    }
    return out;
  }

  cardCount() {
    return this.cards.length;
  }

  destroy() {
    for (const c of this.cards) this.ctx.layer.remove(c);
    for (const c of this.clearings) c.destroy();
    this.clearings.length = 0;
    this.cards = [];
    this.trees.clear();
    this.decor = [];
  }
}

/** Points along a polyline at a fixed spacing. */
function resample(pts: Vec2[], spacing: number): Vec2[] {
  const out: Vec2[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg <= 0) continue;
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  return out;
}
