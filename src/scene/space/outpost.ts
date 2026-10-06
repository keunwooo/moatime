/**
 * The working ground of one outpost (cluster): depot pad with the crate pile that matches the
 * stock (metal, crystal and rare crates in their colours), the deposits that are worked down
 * (a metal vein, a crystal outcrop, and a rare seam once research has found one), the charger
 * (the landing pod and its base battery in the first outpost), worn tracks between them and
 * power cables to finished buildings.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { rngFor } from '../../core/rng';
import type { Geometry, Vec2 } from '../../core/world';
import { innerOfUnit, nodePos } from '../../sim/layout';
import { RES, type Amt } from '../../sim/config';
import { RULES_UNITS_PER_CLUSTER as UPC } from '../../sim/units';
import type { Card, CardLayer } from '../diorama';
import { GroundStrip } from '../strip';
import { CRATE_TINT } from './palette';
import type { SpaceTextures } from './textures';

export interface OutpostCtx {
  seed: number;
  geom: Geometry;
  layer: CardLayer;
  tex: SpaceTextures;
}

export interface OutpostView {
  W: number;
  t: number;
  motion: boolean;
  /** 0..1: the depot is being marked out / ready. */
  setup: number;
  /** Crates standing on the pile right now (by resource), and how many of them are reserved. */
  crates: Amt;
  reserved: number;
  /** 0..1 how far each deposit has been worked. */
  depletion: Amt;
  /** This outpost has a rare seam (research found rare mineral). */
  rare: boolean;
  /** Trips driven on each route (worn tracks). */
  oreTrips: number;
  siteTrips: number;
  /** Base battery fill (first outpost only). */
  grid: number;
  charging: boolean;
  /** Cable reveal 0..1 for each unit of the outpost. */
  cables: number[];
  /** The deposit is known (surveyed or found by an antenna). */
  known: boolean;
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

const CRATE_W = 15;
const PILE = 32;

/** Crate i of a pile: four across, two rows, then a second level. */
function crateSlot(i: number, inner: number): { x: number; y: number; row: number } {
  const col = i % 4;
  const row = Math.floor(i / 4) % 2;
  const level = Math.floor(i / 8);
  return { x: inner * (col - 1.5) * (CRATE_W + 1.5) + row * inner * 6, y: -level * 12.5 - row * 4.5, row };
}

/** A gently bent path between two ground points (for cables). */
function curve0(a: Vec2, b: Vec2, bend: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const k = 4 * t * (1 - t);
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t - k * bend });
  }
  return out;
}

export class Outpost {
  readonly cluster: number;
  readonly depot: Vec2;
  readonly pile: Vec2;
  readonly ore: Vec2;
  readonly charger: Vec2;
  readonly inner: number;
  readonly first: boolean;
  private ctx: OutpostCtx;
  private cards: Card[] = [];
  private pileCard: Card;
  private crates: Sprite[] = [];
  private straps: Sprite[] = [];
  private padCard: Card;
  private rocks: { card: Card; glint: Sprite; phase: number }[] = [];
  private crystals: Card[] = [];
  private rares: { card: Card; glow: Sprite; phase: number }[] = [];
  readonly crystal: Vec2;
  readonly rareAt: Vec2;
  private bed: Card;
  private beacons: { s: Sprite; phase: number }[] = [];
  private cells: Sprite[] = [];
  private tracks: GroundStrip[] = [];
  private cables: GroundStrip[] = [];
  private chargeGlow: Sprite | null = null;
  /** The energy vent: a glowing fissure with a soft plume and motes rising from it. */
  private plume: Sprite[] = [];
  private motes: Sprite[] = [];
  private ventCable: GroundStrip | null = null;
  readonly blockers: { x: number; z: number; r: number }[] = [];

  constructor(ctx: OutpostCtx, cluster: number) {
    this.ctx = ctx;
    this.cluster = cluster;
    const { seed, geom, tex, layer } = ctx;
    this.first = cluster === 0;
    this.inner = innerOfUnit(cluster * UPC);
    this.depot = nodePos('space', seed, geom, `d${cluster}`);
    this.ore = nodePos('space', seed, geom, `o${cluster}`);
    this.crystal = nodePos('space', seed, geom, `x${cluster}`);
    this.rareAt = nodePos('space', seed, geom, `y${cluster}`);
    this.charger = nodePos('space', seed, geom, this.first ? 'L0' : `c${cluster}`);
    const inner = this.inner;
    // the pile stands beside the rover's unloading spot, a little farther back
    this.pile = { x: this.depot.x + inner * 52, z: this.depot.z + 30 };
    this.blockers.push({ x: this.pile.x, z: this.pile.z, r: 90 }, { x: this.ore.x, z: this.ore.z + 40, r: 150 }, { x: this.charger.x, z: this.charger.z + 40, r: 110 }, { x: this.depot.x, z: this.depot.z, r: 70 });

    // depot pad
    this.padCard = this.add(spriteCard(tex.pad, [0.5, 0.5], 130, this.pile.x, this.pile.z + 2, { flat: true, order: -3, alpha: 0 }).card);
    // crate pile
    const pobj = new Container();
    for (let i = 0; i < PILE; i++) {
      const s = new Sprite(tex.crate);
      s.anchor.set(0.5, 74 / 80);
      s.scale.set(CRATE_W / 68);
      const slot = crateSlot(i, inner);
      s.position.set(slot.x, slot.y);
      s.visible = false;
      // back row slightly smaller: it stands farther away
      if (slot.row === 1) s.scale.set((CRATE_W / 68) * 0.94);
      const strap = new Sprite(tex.windowGlow);
      strap.anchor.set(0.5);
      strap.blendMode = 'add';
      strap.scale.set(0.12);
      strap.position.set(slot.x, slot.y - 11);
      strap.visible = false;
      this.crates.push(s);
      this.straps.push(strap);
    }
    // draw back row and lower level first
    const order = [...this.crates.keys()].sort((a, b) => crateSlot(b, inner).row - crateSlot(a, inner).row || a - b);
    for (const i of order) pobj.addChild(this.crates[i], this.straps[i]);
    this.pileCard = this.add({ obj: pobj, X: this.pile.x, Y: 0, Z: this.pile.z, radius: 80, height: 40 });

    // ore deposit: worked ground and boulders behind the rover's drilling spot
    const r = rngFor(seed, cluster, 870);
    this.bed = this.add(spriteCard(tex.oreBed, [0.5, 0.5], 200, this.ore.x - inner * 40, this.ore.z + 46, { flat: true, order: -3 }).card);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 1.3 - 0.2 + r.range(-0.2, 0.2);
      const x = this.ore.x - inner * (40 + Math.cos(a) * 52) + r.range(-10, 10);
      const z = this.ore.z + 36 + Math.sin(a) * 30 + r.range(-8, 8);
      const w = i === 0 ? 64 : r.range(30, 52);
      const { card } = spriteCard(tex.oreRocks[i % 3], [0.5, 160 / 176], w, x, z);
      // a glint on the crystals (sprites cannot hold children: it sits beside the rock)
      const k = w / tex.oreRocks[i % 3].width;
      const glint = new Sprite(tex.spark);
      glint.anchor.set(0.5);
      glint.blendMode = 'add';
      glint.scale.set(0.7 * k);
      glint.position.set(r.range(-40, 40) * k, -r.range(58, 84) * k);
      card.obj.addChild(glint);
      this.add(card);
      this.rocks.push({ card, glint, phase: r.range(0, 6.28) });
    }

    // crystal outcrop in front of the depot side, rare seam on the far side (hidden until found)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 1.2 + r.range(-0.2, 0.2);
      const x = this.crystal.x - inner * (Math.cos(a) * 44) + r.range(-6, 6);
      const z = this.crystal.z + 26 + Math.sin(a) * 22;
      this.crystals.push(this.add(spriteCard(tex.crystalRocks[i % 2], [0.5, 160 / 176], i === 0 ? 70 : r.range(40, 56), x, z, { hidden: true }).card));
    }
    for (let i = 0; i < 3; i++) {
      const x = this.rareAt.x - inner * (i - 1) * 30 + r.range(-6, 6);
      const z = this.rareAt.z + 24 + r.range(-8, 8);
      const w = i === 1 ? 54 : r.range(32, 42);
      const { card } = spriteCard(tex.rareRocks[i % 2], [0.5, 160 / 176], w, x, z, { hidden: true });
      const k = w / tex.rareRocks[i % 2].width;
      const glow = new Sprite(tex.windowGlow);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = 0xffc070;
      glow.scale.set(1.6 * k);
      glow.position.set(0, -60 * k);
      card.obj.addChild(glow);
      this.add(card);
      this.rares.push({ card, glow, phase: r.range(0, 6.28) });
    }
    this.blockers.push({ x: this.crystal.x, z: this.crystal.z + 26, r: 70 }, { x: this.rareAt.x, z: this.rareAt.z + 24, r: 80 });

    // charger or lander + battery
    if (this.first) {
      // the lander stands behind its battery, outside the outpost's building sites
      const lx = this.charger.x + inner * 150;
      const lz = this.charger.z + 120;
      this.add(spriteCard(tex.lander, [0.5, 186 / 192], 104, lx, lz).card);
      this.add(spriteCard(tex.pad, [0.5, 0.5], 240, lx, lz + 2, { flat: true, order: -3 }).card);
      const { card } = spriteCard(tex.battery, [0.5, 96 / 104], 60, this.charger.x + inner * 58, this.charger.z + 22);
      const k = 60 / tex.battery.width;
      for (let i = 0; i < 5; i++) {
        const c = new Sprite(tex.windowGlow);
        c.anchor.set(0.5);
        c.blendMode = 'add';
        c.scale.set(0.42 * k, 0.7 * k);
        c.position.set((-43 + i * 21) * k, -33 * k);
        c.tint = 0xbfe6d6;
        card.obj.addChild(c);
        this.cells.push(c);
      }
      this.add(card);
      this.blockers.push({ x: lx, z: lz, r: 130 });
    } else {
      this.add(spriteCard(tex.charger, [0.5, 104 / 112], 22, this.charger.x, this.charger.z + 24).card);
    }
    const glow = new Sprite(tex.windowGlow);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.scale.set(0.9);
    glow.alpha = 0;
    const gc: Card = { obj: new Container(), X: this.charger.x, Y: 0, Z: this.charger.z + 2, radius: 40, height: 40, order: 2 };
    gc.obj.addChild(glow);
    glow.position.set(0, -20);
    this.add(gc);
    this.chargeGlow = glow;

    // the energy vent and the cable that takes its power to the charger
    const vent = nodePos('space', seed, geom, `v${cluster}`);
    this.add(spriteCard(tex.vent, [0.5, 0.5], 96, vent.x, vent.z, { flat: true, order: -3 }).card);
    {
      const obj = new Container();
      for (let i = 0; i < 2; i++) {
        const s = new Sprite(tex.windowGlow);
        s.anchor.set(0.5, 0.75);
        s.blendMode = 'add';
        s.tint = 0x9fefff;
        s.scale.set(0.9 - i * 0.35, 2.6 - i * 0.9);
        obj.addChild(s);
        this.plume.push(s);
      }
      for (let i = 0; i < 4; i++) {
        const m = new Sprite(tex.windowGlow);
        m.anchor.set(0.5);
        m.blendMode = 'add';
        m.tint = 0xcff8ff;
        m.scale.set(0.14);
        obj.addChild(m);
        this.motes.push(m);
      }
      this.add({ obj, X: vent.x, Y: 0, Z: vent.z + 1, radius: 50, height: 90, order: 1 });
    }
    this.ventCable = new GroundStrip(layer, tex.cable, curve0(vent, { x: this.charger.x, z: this.charger.z + 10 }, 20), 5, { order: -1 });
    this.blockers.push({ x: vent.x, z: vent.z, r: 60 });

    // beacon posts marking the depot corners (lit once the depot is set up)
    for (const [dx, dz] of [
      [-64, -26],
      [64, 34],
    ]) {
      const obj = new Container();
      const s = new Sprite(tex.windowGlow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.scale.set(0.3);
      s.position.set(0, -14);
      obj.addChild(s);
      this.add({ obj, X: this.pile.x + dx * inner, Y: 0, Z: this.pile.z + dz, radius: 20, height: 20 });
      this.beacons.push({ s, phase: r.range(0, 6.28) });
    }

    // tracks: depot ↔ deposit, depot ↔ each site
    const curve = (a: Vec2, b: Vec2, bend: number): Vec2[] => {
      const out: Vec2[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const k = 4 * t * (1 - t);
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t - k * bend });
      }
      return out;
    };
    this.tracks.push(new GroundStrip(layer, tex.track, curve(this.depot, this.ore, 26), 20, { order: -2 }));
    for (let s = 0; s < UPC; s++) {
      const site = nodePos('space', seed, geom, `s${cluster * UPC + s}`);
      this.tracks.push(new GroundStrip(layer, tex.track, curve(this.depot, site, 12), 20, { order: -2 }));
      const fac = nodePos('space', seed, geom, `u${cluster * UPC + s}`);
      this.cables.push(new GroundStrip(layer, tex.cable, curve({ x: this.charger.x, z: this.charger.z + 16 }, { x: fac.x + inner * 40, z: fac.z - 8 }, -18), 5, { order: -1 }));
    }
  }

  private add(card: Card) {
    this.ctx.layer.add(card);
    this.cards.push(card);
    return card;
  }

  /** World position of a crate on the pile (for transfers). */
  crateAt(i: number): { x: number; y: number; z: number } {
    const s = crateSlot(Math.max(0, Math.min(PILE - 1, i)), this.inner);
    return { x: this.pile.x + s.x, y: -s.y + 6, z: this.pile.z + (s.row ? 6 : 0) };
  }

  update(v: OutpostView) {
    const setup = Math.max(0, Math.min(1, v.setup));
    this.padCard.alpha = 0.55 * setup;
    this.padCard.hidden = setup <= 0;
    // the pile in resource order: metal, then crystal, then rare mineral
    const kinds: (keyof Amt)[] = [];
    for (const t of RES) for (let k = 0; k < Math.max(0, Math.round(v.crates[t])); k++) kinds.push(t);
    const n = Math.min(PILE, kinds.length);
    const reserved = Math.max(0, Math.min(n, Math.round(v.reserved)));
    for (let i = 0; i < PILE; i++) {
      const c = this.crates[i];
      c.visible = i < n;
      if (i < n) c.tint = CRATE_TINT[kinds[i]];
      // reserved crates are the first on the pile: a small warm tag light marks them
      this.straps[i].visible = i < reserved;
      this.straps[i].alpha = 0.75;
    }
    this.pileCard.hidden = n === 0;
    // the deposits are worked down: rocks go from the outer edge in
    const left = (count: number, dep: number, keep: number) => Math.max(keep, Math.round(count * (1 - 0.6 * Math.min(1, dep))));
    const ml = left(this.rocks.length, v.depletion.m, 2);
    this.rocks.forEach((rk, i) => {
      rk.card.hidden = i >= ml || !v.known;
      const tw = v.motion ? 0.5 + 0.5 * Math.sin(v.t * 0.7 + rk.phase) : 0.7;
      rk.glint.alpha = 0.25 + 0.5 * tw * tw;
    });
    const cl = left(this.crystals.length, v.depletion.c, 1);
    this.crystals.forEach((c, i) => (c.hidden = i >= cl || !v.known));
    const rl = left(this.rares.length, v.depletion.r, 1);
    this.rares.forEach((rk, i) => {
      rk.card.hidden = i >= rl || !v.known || !v.rare;
      rk.glow.alpha = v.motion ? 0.3 + 0.2 * Math.sin(v.t * 0.9 + rk.phase) : 0.4;
    });
    this.bed.alpha = v.known ? 0.35 + 0.4 * Math.min(1, v.depletion.m + 0.2) : 0;
    this.bed.hidden = !v.known;
    for (const b of this.beacons) b.s.alpha = setup * (v.motion ? 0.55 + 0.35 * Math.sin(v.t * 1.1 + b.phase) : 0.75);
    // battery cells show the stored power
    const lit = v.grid * 5;
    this.cells.forEach((c, i) => {
      const k = Math.max(0, Math.min(1, lit - i));
      c.alpha = 0.15 + 0.75 * k;
    });
    if (this.chargeGlow) this.chargeGlow.alpha = v.charging ? 0.35 + 0.25 * (v.motion ? Math.sin(v.t * 2.4) * 0.5 + 0.5 : 0.5) : 0;
    // the vent breathes; motes of energy drift up from it
    const breath = v.motion ? 0.5 + 0.5 * Math.sin(v.t * 0.8 + this.cluster) : 0.6;
    this.plume.forEach((p, i) => (p.alpha = (0.4 + 0.3 * breath) * (i ? 1.3 : 0.75)));
    this.motes.forEach((m, i) => {
      const q = ((v.motion ? v.t * 0.18 : 0.4) + i / this.motes.length) % 1;
      m.position.set(Math.sin(q * 6 + i * 2.1) * 12, -q * 110);
      m.alpha = Math.sin(q * Math.PI) * 0.8;
    });
    this.ventCable?.set(Math.max(0, Math.min(1, v.setup)), 0.85);
    // worn tracks grow with the trips driven
    const wear = (trips: number) => Math.min(0.5, trips * 0.035);
    this.tracks[0].set(1, wear(v.oreTrips));
    for (let s = 0; s < UPC; s++) this.tracks[1 + s].set(1, wear(v.siteTrips / 2));
    for (let s = 0; s < UPC; s++) this.cables[s].set(v.cables[s] ?? 0, 0.9);
  }

  destroy() {
    for (const c of this.cards) this.ctx.layer.remove(c);
    for (const t of this.tracks) t.destroy();
    for (const c of this.cables) c.destroy();
    this.ventCable?.destroy();
    this.ventCable = null;
    this.cards = [];
    this.tracks = [];
    this.cables = [];
  }
}
