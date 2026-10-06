/**
 * The keeper's working corner of one clearing (cluster): the spring, the bench with the seed
 * basket (its seeds are the real stock), the compost bin whose heap and leaf mould follow the
 * composting batches, the rain barrel and its water level, the dug channel and its basin, and
 * the flowerbeds made from mould and spare seeds.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { rngFor } from '../../core/rng';
import type { Geometry, Vec2 } from '../../core/world';
import { FOREST } from '../../sim/config';
import { channelPoint, innerOfUnit, nodePos } from '../../sim/layout';
import { RULES_UNITS_PER_CLUSTER as UPC } from '../../sim/units';
import type { Card, CardLayer } from '../diorama';
import { GroundStrip } from '../strip';
import type { ForestTextures } from './textures';

export interface ClearingCtx {
  seed: number;
  geom: Geometry;
  layer: CardLayer;
  tex: ForestTextures;
}

export interface ClearingView {
  t: number;
  motion: boolean;
  wind: number;
  /** The clearing has been reached (the bench stands here or stood here). */
  reached: boolean;
  /** Seeds in the basket on this bench (0 when the basket is elsewhere). */
  basket: number;
  basketHere: boolean;
  /** Compost: leaves still turning, and scoops of mould ready. */
  fresh: number;
  mould: number;
  /** Barrel: built (0..1 while being built) and water units. */
  barrel: number;
  water: number;
  /** Channel segments dug (0..segments, fractional while digging). */
  channel: number;
  /** Flowerbeds: growth 0..1 for spots 0 and 1 (−1 none). */
  beds: number[];
  /** Water ripples from filling the can here. */
  stir: number;
  /** Ground wetness (puddles), ice on still water, rain now. */
  wet: number;
  ice: number;
  rain: number;
}

function spriteCard(tex: Texture, anchor: [number, number], width: number, X: number, Z: number, opts: Partial<Card> = {}) {
  const obj = new Container();
  const sprite = new Sprite(tex);
  sprite.anchor.set(anchor[0], anchor[1]);
  sprite.scale.set(width / tex.width);
  obj.addChild(sprite);
  const h = (tex.height * width) / tex.width;
  const card: Card = { obj, X, Y: 0, Z, radius: Math.max(width, h) * 0.7, height: h, ...opts };
  return { card, sprite };
}

export class Clearing {
  readonly cluster: number;
  readonly spring: Vec2;
  readonly bench: Vec2;
  readonly compost: Vec2;
  readonly barrelAt: Vec2;
  readonly basin: Vec2;
  readonly inner: number;
  readonly blockers: { x: number; z: number; r: number }[] = [];
  private ctx: ClearingCtx;
  private cards: Card[] = [];
  private ripples: { s: Sprite; phase: number }[] = [];
  private benchCard: Card;
  private basketCard: Card;
  private seeds: Sprite[] = [];
  private heap: { card: Card; sprite: Sprite };
  private mouldPile: { card: Card; sprite: Sprite };
  private binCard: Card;
  private barrel: { card: Card; water: Sprite };
  private channel: GroundStrip;
  private basinCard: Card;
  private beds: { soil: Card; flowers: { card: Card; sprite: Sprite; delay: number }[] }[] = [];
  private puddles: { card: Card; sprite: Sprite; k: number }[] = [];
  private ice: Card[] = [];
  private springCards: Card[] = [];

  constructor(ctx: ClearingCtx, cluster: number) {
    this.ctx = ctx;
    this.cluster = cluster;
    const { seed, geom, tex, layer } = ctx;
    const r = rngFor(seed, cluster, 930);
    this.inner = innerOfUnit(cluster * UPC);
    const node = (id: string) => nodePos('forest', seed, geom, id);
    this.spring = node(`w${cluster}`);
    this.bench = node(`b${cluster}`);
    this.compost = node(`k${cluster}`);
    this.barrelAt = node(`r${cluster}`);
    this.basin = node(`a${cluster}`);
    const inner = this.inner;

    // spring: a small pool with reeds and stones, a little behind where the keeper kneels
    const sp = { x: this.spring.x - inner * 14, z: this.spring.z + 20 };
    this.springCards.push(this.add(spriteCard(tex.pond, [0.5, 0.5], 82, sp.x, sp.z, { flat: true, order: -1 }).card));
    for (let i = 0; i < 3; i++) {
      const { card, sprite } = spriteCard(tex.shadow, [0.5, 0.5], 18, sp.x + r.range(-22, 20), sp.z + r.range(-6, 7), { flat: true, order: 1 });
      sprite.tint = 0xffffff;
      sprite.blendMode = 'add';
      this.add(card);
      this.ripples.push({ s: sprite, phase: r.range(0, 1) });
    }
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (0.1 + i * 0.3) + r.range(-0.1, 0.1);
      this.add(spriteCard(tex.reeds[i % 2], [0.5, 218 / 224], r.range(16, 22), sp.x - inner * Math.cos(a) * 38, sp.z + Math.sin(a) * 12 + 8).card);
    }
    this.add(spriteCard(tex.rocks[r.int(0, 1)], [0.5, 146 / 160], 16, sp.x + inner * 40, sp.z + 3).card);
    this.blockers.push({ x: sp.x, z: sp.z, r: 56 });
    // ice over the pool in hard winter weather
    this.ice.push(this.add(spriteCard(tex.ice, [0.5, 0.5], 78, sp.x, sp.z - 0.5, { flat: true, order: 2, hidden: true }).card));
    // puddles collect in low spots along the work paths after rain
    const spots = [
      { x: (sp.x + this.bench.x) / 2 + r.range(-20, 20), z: (sp.z + this.bench.z) / 2 + r.range(-6, 6) },
      { x: this.bench.x - inner * r.range(40, 70), z: this.bench.z + r.range(-26, -10) },
      { x: sp.x + inner * r.range(50, 80), z: sp.z - r.range(18, 34) },
      { x: this.compost.x - inner * r.range(30, 50), z: this.compost.z - r.range(10, 24) },
    ];
    spots.forEach((q, i) => {
      const { card, sprite } = spriteCard(tex.puddle[i % 2], [0.5, 0.5], r.range(34, 52), q.x, q.z, { flat: true, order: -1, hidden: true });
      this.add(card);
      this.puddles.push({ card, sprite, k: r.range(0.1, 0.55) });
    });

    // bench with the seed basket
    this.benchCard = this.add(spriteCard(tex.bench, [0.5, 90 / 96], 44, this.bench.x + inner * 4, this.bench.z + 16).card);
    const bobj = new Container();
    const basket = new Sprite(tex.basket);
    basket.anchor.set(0.5, 60 / 64);
    basket.scale.set(16 / 96);
    bobj.addChild(basket);
    for (let i = 0; i < FOREST.pouchCap; i++) {
      const s = new Sprite(tex.seed);
      s.anchor.set(0.5);
      s.scale.set(4.2 / 48);
      s.position.set(((i % 4) - 1.5) * 2.5, -8.4 - Math.floor(i / 4) * 1.3);
      s.rotation = i * 0.9;
      s.visible = false;
      bobj.addChild(s);
      this.seeds.push(s);
    }
    this.basketCard = this.add({ obj: bobj, X: this.bench.x + inner * 12, Y: 7, Z: this.bench.z + 15, radius: 20, height: 20, order: 1 });
    this.blockers.push({ x: this.bench.x, z: this.bench.z + 10, r: 46 });

    // compost bin, its heap and the leaf mould ready in front
    this.binCard = this.add(spriteCard(tex.compostBin, [0.5, 122 / 128], 46, this.compost.x + inner * 10, this.compost.z + 22).card);
    this.heap = spriteCard(tex.compostHeap, [0.5, 90 / 96], 40, this.compost.x + inner * 10, this.compost.z + 21, { order: 1 });
    this.add(this.heap.card);
    this.mouldPile = spriteCard(tex.mould, [0.5, 60 / 64], 26, this.compost.x - inner * 6, this.compost.z + 5, { order: 1 });
    this.add(this.mouldPile.card);
    this.blockers.push({ x: this.compost.x, z: this.compost.z + 16, r: 60 });

    // rain barrel (later clearings) with its water surface
    const { card: bc } = spriteCard(tex.barrel, [0.5, 122 / 128], 20, this.barrelAt.x - inner * 7, this.barrelAt.z + 10);
    const water = new Sprite(tex.pond);
    water.anchor.set(0.5);
    water.width = 16.5;
    water.height = 3.4;
    bc.obj.addChild(water);
    bc.hidden = true;
    this.add(bc);
    this.barrel = { card: bc, water };
    this.blockers.push({ x: this.barrelAt.x, z: this.barrelAt.z, r: 30 });

    // channel from the spring to a small basin among the back trees
    const pts: Vec2[] = [];
    for (let i = 0; i <= 12; i++) pts.push(channelPoint(seed, cluster, geom, i / 12));
    this.channel = new GroundStrip(layer, tex.channel, pts, 13, { order: -2 });
    this.basinCard = this.add(spriteCard(tex.pond, [0.5, 0.5], 60, this.basin.x, this.basin.z, { flat: true, order: -1, hidden: true }).card);
    this.ice.push(this.add(spriteCard(tex.ice, [0.5, 0.5], 58, this.basin.x, this.basin.z - 0.5, { flat: true, order: 2, hidden: true }).card));

    // flowerbed spots
    for (let k = 0; k < FOREST.flowerbed.perCluster; k++) {
      const at = node(`f${cluster * 4 + k}`);
      const { card: soil } = spriteCard(tex.soil[k % 3], [0.5, 0.5], 64, at.x, at.z, { flat: true, order: -2, hidden: true });
      soil.alpha = 0.85;
      this.add(soil);
      const flowers: { card: Card; sprite: Sprite; delay: number }[] = [];
      const kinds = ['daisy', 'bell', 'puff', 'rose'] as const;
      for (let i = 0; i < 9; i++) {
        const a = r.range(0, Math.PI * 2);
        const d = Math.sqrt(r.next()) * 24;
        const { card, sprite } = spriteCard(tex.flowers[kinds[(i + k) % 4]][i % 2], [0.5, 140 / 144], r.range(12, 16), at.x + Math.cos(a) * d, at.z + Math.sin(a) * d * 0.5, { hidden: true });
        this.add(card);
        flowers.push({ card, sprite, delay: i / 9 });
      }
      this.beds.push({ soil, flowers });
      this.blockers.push({ x: at.x, z: at.z, r: 40 });
    }
  }

  private add(card: Card) {
    this.ctx.layer.add(card);
    this.cards.push(card);
    return card;
  }

  update(v: ClearingView) {
    const show = v.reached;
    this.benchCard.hidden = !show;
    this.binCard.hidden = !show;
    // seeds in the basket are the stock
    this.basketCard.hidden = !(show && v.basketHere);
    const n = Math.max(0, Math.min(this.seeds.length, Math.round(v.basket)));
    this.seeds.forEach((s, i) => (s.visible = i < n));
    // heap grows with leaves turning; the mould pile with scoops ready
    const fresh = Math.max(0, v.fresh);
    this.heap.card.hidden = !show || fresh <= 0;
    this.heap.sprite.scale.set((40 / 192) * (0.55 + 0.45 * Math.min(1, fresh / 8)), (40 / 192) * (0.4 + 0.6 * Math.min(1, fresh / 8)));
    const mould = Math.max(0, v.mould);
    this.mouldPile.card.hidden = !show || mould <= 0;
    this.mouldPile.sprite.scale.set((26 / 160) * (0.6 + 0.4 * Math.min(1, mould / 4)), (26 / 160) * (0.45 + 0.55 * Math.min(1, mould / 4)));
    // barrel
    this.barrel.card.hidden = v.barrel <= 0;
    if (!this.barrel.card.hidden) {
      const b = this.barrel.card;
      b.obj.scale.y = 1;
      b.alpha = Math.min(1, v.barrel * 1.5);
      const k = Math.max(0, Math.min(1, v.water / FOREST.barrel.cap));
      this.barrel.water.visible = k > 0 && v.barrel >= 1;
      // the surface rises inside the rim (texture px of the barrel art at this card scale)
      this.barrel.water.position.set(0, -(20 / 96) * (122 - 23 - (1 - k) * 18));
      this.barrel.water.alpha = 0.9;
    }
    // channel and basin
    const segs = FOREST.channel.segments;
    this.channel.set(Math.max(0, Math.min(1, v.channel / segs)), 0.95);
    this.basinCard.hidden = v.channel < segs;
    // ripples on the spring (stronger while the can is filled or it rains; none under ice)
    const frozen = v.ice > 0.5;
    for (const rp of this.ripples) {
      const q = ((v.motion ? v.t * (0.12 + v.rain * 0.5) : 0) + rp.phase) % 1;
      rp.s.scale.set((0.35 + q * 1.8) * (18 / 256));
      rp.s.alpha = frozen ? 0 : (v.motion ? 0.3 * Math.sin(q * Math.PI) : 0.12) * (1 + v.stir * 1.6 + v.rain * 1.2);
    }
    // ice on still water: the pool, and the basin once it exists
    this.ice.forEach((c, i) => {
      c.hidden = v.ice <= 0.02 || (i === 1 && this.basinCard.hidden);
      c.alpha = v.ice * 0.85;
    });
    // puddles: the lowest spots fill first; frozen in winter
    for (const pd of this.puddles) {
      const k = Math.max(0, Math.min(1, (v.wet - pd.k) / 0.35));
      pd.card.hidden = !show || k <= 0.01;
      pd.card.alpha = k * 0.75;
      pd.card.obj.scale.set(0.55 + 0.45 * k);
      pd.sprite.tint = frozen ? 0xeef4fb : 0xffffff;
    }
    // flowerbeds
    this.beds.forEach((bed, k) => {
      const g = v.beds[k] ?? -1;
      bed.soil.hidden = g < 0;
      for (const f of bed.flowers) {
        const kk = Math.max(0, Math.min(1, (g - f.delay * 0.6) / 0.4));
        f.card.hidden = g < 0 || kk <= 0;
        f.sprite.scale.y = Math.abs(f.sprite.scale.x) * (0.3 + 0.7 * kk);
        f.card.obj.skew.x = v.motion ? -v.wind * 0.06 : 0;
      }
    });
  }

  /** Where seeds rest in the basket (world), for transfers. */
  basketPoint(): { x: number; y: number; z: number } {
    return { x: this.basketCard.X, y: 18, z: this.basketCard.Z };
  }

  springCardsShown(on: boolean) {
    for (const c of this.springCards) c.hidden = !on;
  }

  destroy() {
    for (const c of this.cards) this.ctx.layer.remove(c);
    this.channel.destroy();
    this.cards = [];
  }
}
