/**
 * Landmarks of a forest zone, built by the keeper and grown by running time:
 *  - the pond at the zone's feature spot: dug in three goes (the hole widens), lined with
 *    stones one by one, then it fills (faster in rain); reeds and lily pads follow the water,
 *    rain ripples it, winter ices it over;
 *  - the old tree beside it: planted early in the zone, a normal tree after half an hour of
 *    running time, then slowly a giant over its zone's hours, with moss gathering at its foot.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { rngFor, type Rng } from '../../core/rng';
import type { Geometry, Vec2 } from '../../core/world';
import { FOREST } from '../../sim/config';
import { nodePos, pondCenter } from '../../sim/layout';
import type { Card } from '../diorama';
import { SPECIES } from './palette';
import type { ForestTextures } from './textures';
import { Tree, type SeasonState } from './tree';

interface Ctx {
  seed: number;
  geom: Geometry;
  tex: ForestTextures;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function sprite(t: Texture, anchor: [number, number], width: number, X: number, Z: number, opts: Partial<Card> = {}) {
  const obj = new Container();
  const s = new Sprite(t);
  s.anchor.set(anchor[0], anchor[1]);
  s.scale.set(width / t.width);
  obj.addChild(s);
  const h = (t.height * width) / t.width;
  const card: Card = { obj, X, Y: 0, Z, radius: Math.max(width, h) * 0.7, height: h, ...opts };
  return { card, sprite: s };
}

export interface PondView {
  dug: number;
  water: number;
  /** Progress of the dig or the stones being placed right now (0..1, 0 none). */
  digging: number;
  lining: number;
  t: number;
  motion: boolean;
  ice: number;
  rain: number;
}

export class ZonePond {
  readonly center: Vec2;
  readonly radius = 100;
  private hole: Card;
  private holeSprite: Sprite;
  private water: Card;
  private waterSprite: Sprite;
  private ice: Card;
  private stones: Card[] = [];
  private reeds: Card[] = [];
  private lilies: Card[] = [];
  private ripples: { s: Sprite; card: Card; phase: number }[] = [];

  constructor(ctx: Ctx, zone: number, add: (c: Card) => Card) {
    const { tex, seed, geom } = ctx;
    const r: Rng = rngFor(seed, zone, 640);
    const f = pondCenter(seed, zone, geom);
    this.center = f;
    const h = sprite(tex.soil[1], [0.5, 0.5], 210, f.x, f.z + 0.6, { flat: true, order: -2, hidden: true });
    this.hole = add(h.card);
    this.holeSprite = h.sprite;
    this.holeSprite.tint = 0xb8a890;
    const w = sprite(tex.pond, [0.5, 0.5], 196, f.x, f.z + 0.4, { flat: true, order: -1, hidden: true });
    this.water = add(w.card);
    this.waterSprite = w.sprite;
    this.ice = add(sprite(tex.ice, [0.5, 0.5], 186, f.x, f.z, { flat: true, order: 2, hidden: true }).card);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + r.range(-0.12, 0.12);
      const x = f.x + Math.cos(a) * this.radius * r.range(0.96, 1.05);
      const z = f.z + Math.sin(a) * this.radius * 0.36;
      this.stones.push(add(sprite(tex.rocks[i % 2], [0.5, 146 / 160], r.range(13, 20), x, z, { hidden: true, order: 1 }).card));
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.05 + i * 0.2) + r.range(-0.08, 0.08);
      this.reeds.push(add(sprite(tex.reeds[i % 2], [0.5, 218 / 224], r.range(24, 34), f.x + Math.cos(a) * this.radius * 0.9, f.z + Math.sin(a) * 30 + 10, { hidden: true }).card));
    }
    for (let i = 0; i < 5; i++) {
      const x = f.x + r.range(-60, 60);
      const z = f.z + r.range(-18, 18);
      this.lilies.push(add(sprite(tex.lily[i % 2], [0.5, 0.5], r.range(16, 24), x, z, { flat: true, order: 0, hidden: true }).card));
    }
    for (let i = 0; i < 4; i++) {
      const { card, sprite: s } = sprite(tex.shadow, [0.5, 0.5], 36, f.x + r.range(-60, 50), f.z + r.range(-18, 18), { flat: true, order: 1, hidden: true });
      s.tint = 0xffffff;
      s.blendMode = 'add';
      add(card);
      this.ripples.push({ s, card, phase: r.range(0, 1) });
    }
  }

  update(v: PondView) {
    const dugK = Math.min(1, (v.dug + v.digging) / FOREST.pond.digs);
    this.hole.hidden = dugK <= 0.01;
    this.hole.obj.scale.set(0.35 + 0.65 * dugK, 0.3 + 0.7 * dugK);
    this.hole.alpha = 0.55 + 0.4 * dugK;
    // stones go round the edge one by one while lining, then stay
    const placed = v.dug >= FOREST.pond.digs ? (v.water > 0 || v.lining >= 1 ? this.stones.length : Math.floor(v.lining * this.stones.length)) : 0;
    this.stones.forEach((c, i) => (c.hidden = i >= placed));
    const w = v.water;
    this.water.hidden = w <= 0.005;
    this.water.alpha = 0.35 + 0.6 * smooth(0, 0.4, w);
    this.water.obj.scale.set(0.55 + 0.45 * w, 0.5 + 0.5 * w);
    const frozen = v.ice > 0.5;
    this.waterSprite.tint = frozen ? 0xe6eef6 : 0xffffff;
    this.ice.hidden = w < 0.2 || v.ice <= 0.02;
    this.ice.alpha = v.ice * 0.85;
    this.reeds.forEach((c, i) => {
      const k = smooth(0.7 + i * 0.05, 1, w);
      c.hidden = k <= 0.01;
      c.alpha = k;
      const s = c.obj.children[0];
      if (s) s.scale.y = Math.abs(s.scale.x) * (0.4 + 0.6 * k);
      c.obj.skew.x = v.motion ? Math.sin(v.t * 0.8 + i) * 0.04 : 0;
    });
    this.lilies.forEach((c, i) => {
      const k = smooth(0.9, 1, w) * (frozen ? 0 : 1);
      c.hidden = k <= 0.01;
      c.alpha = k;
      if (v.motion) c.obj.rotation = Math.sin(v.t * 0.2 + i * 1.7) * 0.06;
    });
    for (const rp of this.ripples) {
      const q = ((v.motion ? v.t * (0.1 + v.rain * 0.6) : 0) + rp.phase) % 1;
      rp.card.hidden = w < 0.5 || frozen;
      rp.s.scale.set((0.4 + q * 2) * (36 / 256));
      rp.s.alpha = (v.motion ? 0.3 * Math.sin(q * Math.PI) : 0.1) * (1 + v.rain * 1.5);
    }
  }
}

export interface ElderView {
  /** Age at W (ms), null if not planted. */
  age: number | null;
  season: SeasonState;
  t: number;
  wind: number;
  motion: boolean;
  shadowDir: number;
  shadowAlpha: number;
  /** The old tree in blossom (a rare spring event, stage 9+): 0..1. */
  bloom: number;
}

export class ElderTree {
  readonly tree: Tree;
  readonly card: Card;
  readonly pos: Vec2;
  private shadow: Card;
  private moss: Card;
  private k = 1;
  /** Blossom clusters over the crown (shown in a blossoming spring). */
  private bloom = new Container();
  private blooms: { s: Sprite; phase: number }[] = [];

  constructor(ctx: Ctx, zone: number, add: (c: Card) => Card) {
    const { tex, seed, geom } = ctx;
    this.pos = nodePos('forest', seed, geom, `g${zone}`);
    const st = tex.species.round;
    this.tree = new Tree(
      rngFor(seed, zone, 650).int(0, 2 ** 30),
      SPECIES.round,
      { clumps: st.clumps, autumn: st.autumn, leaves: st.leaves, cotyledon: tex.species.birch.leaves[0], seed: tex.seed, fall: tex.fall, twigs: st.twigs, snowCap: tex.snowCap },
      { version: 2, unitMs: FOREST.elder.matureMs, unitsPerCluster: 4, clustersPerZone: 4 },
      1.12,
    );
    const obj = new Container();
    obj.addChild(this.tree.root);
    // blossom clusters scattered over the crown (crown space: x across, y up negative)
    const r = rngFor(seed, zone, 652);
    const W = this.tree.shape.crownW;
    const H = this.tree.shape.H;
    for (let i = 0; i < 96; i++) {
      const s = new Sprite(tex.petal);
      s.anchor.set(0.5);
      const a = r.range(0, Math.PI * 2);
      const d = Math.sqrt(r.next());
      s.position.set(Math.cos(a) * d * W * 0.42, -H * 0.66 + Math.sin(a) * d * H * 0.28);
      s.rotation = r.range(0, Math.PI * 2);
      s.tint = r.chance(0.6) ? 0xf6c8d8 : 0xfff0f4;
      const k = r.range(0.7, 1.3);
      s.scale.set((13 * k) / tex.petal.width);
      this.bloom.addChild(s);
      this.blooms.push({ s, phase: r.range(0, 6.28) });
    }
    this.bloom.visible = false;
    this.tree.root.addChild(this.bloom);
    this.shadow = add(sprite(tex.shadow, [0.5, 0.5], this.tree.shape.crownW, this.pos.x, this.pos.z - 8, { flat: true, order: -1, hidden: true }).card);
    this.moss = add(sprite(tex.moss[2], [0.5, 0.5], 150, this.pos.x, this.pos.z + 0.5, { flat: true, order: -1, hidden: true }).card);
    this.card = add({ obj, X: this.pos.x, Y: 0, Z: this.pos.z, radius: this.tree.shape.crownW, height: this.tree.shape.H + 20, hidden: true });
  }

  /** The giant's growth factor (1 when young, ~1.9 after three hours). */
  get scale(): number {
    return this.k;
  }

  update(v: ElderView) {
    const shown = v.age !== null;
    this.card.hidden = !shown;
    this.shadow.hidden = !shown;
    this.moss.hidden = !shown;
    if (v.age === null) return;
    const age = v.age;
    const u = Math.min(1, age / FOREST.elder.matureMs);
    this.k = 1 + 0.9 * smooth(FOREST.elder.matureMs, FOREST.elder.giantMs, age);
    this.tree.setProgress(u);
    this.tree.setSeason(v.season);
    this.tree.root.scale.set(this.k);
    this.card.radius = this.tree.shape.crownW * this.k;
    this.card.height = (this.tree.shape.H + 20) * this.k;
    this.tree.sway(v.t, v.wind * 0.6, v.motion);
    const cs = this.tree.crownScale;
    const sun = Math.min(1, v.shadowAlpha / 0.5);
    this.shadow.alpha = (0.16 + cs * 0.32) * (0.62 + 0.38 * sun);
    this.shadow.X = this.pos.x + v.shadowDir * this.tree.shape.crownW * this.k * (0.06 + 0.25 * sun);
    this.shadow.obj.scale.set((0.25 + cs * 0.85) * this.k * (1 + 0.6 * sun), (0.25 + cs * 0.85) * this.k);
    this.bloom.visible = v.bloom > 0.01 && u >= 1;
    if (this.bloom.visible) {
      this.bloom.alpha = v.bloom;
      for (const b of this.blooms) b.s.alpha = v.motion ? 0.8 + 0.2 * Math.sin(v.t * 0.7 + b.phase) : 0.9;
    }
    // a soft pink cast over the whole crown while it is in bloom
    const pink = this.bloom.visible ? v.bloom * 0.28 : 0;
    const tint = (Math.round(255) << 16) | (Math.round(255 - 50 * pink) << 8) | Math.round(255 - 30 * pink);
    if (this.tree.root.tint !== tint) this.tree.root.tint = tint;
    const moss = smooth(1.2 * 3_600_000, 2.6 * 3_600_000, age);
    this.moss.hidden = moss <= 0.01;
    this.moss.alpha = moss * 0.9;
    this.moss.obj.scale.set(0.6 + 0.6 * this.k * moss);
  }
}
