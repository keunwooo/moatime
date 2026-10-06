/**
 * Content of one colony zone, rebuilt deterministically from (seed, zone) and driven by the
 * simulation state:
 * 'detail': outposts (depot, deposit, charger, tracks, cables), facilities assembled by stage,
 *           corridors and roads appearing after completions, craters and rocks, the feature.
 * 'lod': distant domes and window lights for older settlements.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { rngFor, type Rng } from '../../core/rng';
import type { GrowthRules } from '../../core/rules';
import { clusterWorld, featureWorld, pathWorld, slotWorld, zoneOrigin, type Geometry, type Vec2 } from '../../core/world';
import { innerOfUnit, nodePos } from '../../sim/layout';
import { RES, SPACE, type Amt } from '../../sim/config';
import { depositLeft, gridLevel, rareAt, spaceDoneAt, spaceUnitProgress, type SpaceSim } from '../../sim/space';
import { raidLevel } from '../../sim/raid';
import { kindOf, spaceFlavorOf, type SpaceFlavor } from '../../sim/spacePlan';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from '../../sim/units';
import { CardLayer, Projector, type Card } from '../diorama';
import { Facility } from './facility';
import { GroundStrip } from '../strip';
import { Outpost } from './outpost';
import { CRATE_TINT, artOf } from './palette';
import type { SpaceTextures } from './textures';

export interface SpaceZoneContext {
  seed: number;
  rules: GrowthRules;
  geom: Geometry;
  layer: CardLayer;
  tex: SpaceTextures;
}

export interface SpaceZoneView {
  sim: SpaceSim;
  W: number;
  t: number;
  motion: boolean;
  wt: number;
  proj: Projector;
  glowBoost: number;
  /** Crates on the active depot pile and the site pile right now (transfers included). */
  depotCrates: Amt;
  depotReserved: number;
  siteCrates: Amt;
  /** A rover is charging at the active outpost. */
  charging: boolean;
  /** A power line being laid to outpost c, k of the way there. */
  link: { c: number; k: number } | null;
  /** 0..1 progress of the depot set-up step (active outpost). */
  setupK: number;
  /** A rover is scanning the active deposit now (it appears as the scan goes). */
  surveyK: number;
  /** Greenhouse being cared for (unit) and the care progress. */
  careUnit: number;
  careK: number;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Fade-in after a completion time: 1 if long done, 0 if not done yet. */
export function appear(done: number, delay: number, span: number, W: number): number {
  if (done === -Infinity) return 1;
  if (done === Infinity) return 0;
  return smooth(done + delay, done + delay + span, W);
}

export function spriteCard(tex: Texture, anchor: [number, number], width: number, X: number, Z: number, opts: Partial<Card> = {}) {
  const obj = new Container();
  const sprite = new Sprite(tex);
  sprite.anchor.set(anchor[0], anchor[1]);
  sprite.scale.set(width / tex.width);
  obj.addChild(sprite);
  const h = (tex.height * width) / tex.width;
  const card: Card = { obj, X, Y: 0, Z, radius: Math.max(width, h) * 0.7, height: h, ...opts };
  return { card, sprite };
}

interface FacEntry {
  unit: number;
  fac: Facility;
  card: Card;
  ground: Card;
  pos: Vec2;
  pile: Card;
  pileSprites: Sprite[];
  props: { card: Card; delay: number }[];
}

/** Decor that appears some seconds after a unit is complete. */
interface Timed {
  card: Card;
  unit: number;
  delay: number;
  span: number;
  baseAlpha: number;
}

interface TubeSeg {
  card: Card;
  sprite: Sprite;
  a: Vec2;
  b: Vec2;
  unit: number;
  delay: number;
}

const SITE_PILE_W = 14;

export class SpaceZone {
  readonly zone: number;
  readonly level: 'detail' | 'lod';
  private ctx: SpaceZoneContext;
  private cards: Card[] = [];
  private facs = new Map<number, FacEntry>();
  private timed: Timed[] = [];
  private tubes: TubeSeg[] = [];
  private beacons: { s: Sprite; phase: number }[] = [];
  private flavor: SpaceFlavor;
  private firstUnit: number;
  readonly outposts: Outpost[] = [];
  private markers: { card: Card; cluster: number }[] = [];
  /** Power lines from the previous outpost to each outpost of this zone. */
  private links: { c: number; strip: GroundStrip }[] = [];
  /** Rubble cards of lost buildings (made when needed). */
  private rubble = new Map<number, Card>();

  private rubbleFor(unit: number, e: FacEntry): Card {
    let c = this.rubble.get(unit);
    if (!c) {
      const tex = this.ctx.tex.rubble;
      const obj = new Container();
      const s = new Sprite(tex);
      s.anchor.set(0.5, 150 / 160);
      s.scale.set(Math.max(120, e.fac.width * 0.9) / tex.width);
      obj.addChild(s);
      c = { obj, X: e.card.X, Y: 0, Z: e.card.Z + 1, radius: 160, height: 60, hidden: true };
      this.ctx.layer.add(c);
      this.cards.push(c);
      this.rubble.set(unit, c);
    }
    return c;
  }
  private legacyUnits: number;
  private v1Units: number;

  constructor(ctx: SpaceZoneContext, zone: number, level: 'detail' | 'lod', legacyUnits: number, v1Units: number) {
    this.ctx = ctx;
    this.zone = zone;
    this.level = level;
    this.flavor = spaceFlavorOf(ctx.seed, zone);
    this.firstUnit = zone * UPZ;
    this.legacyUnits = legacyUnits;
    this.v1Units = v1Units;
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
    return slotWorld(seed, this.zone, Math.floor(i / UPC), i % UPC, geom, 'space');
  }

  private kind(unit: number) {
    return kindOf(this.ctx.seed, unit, this.legacyUnits, this.v1Units);
  }

  private buildLod() {
    const { tex, seed, geom } = this.ctx;
    // the planet network: lit roads from outpost to outpost and on to the next settlement
    const centers = [0, 1, 2, 3].map((c) => clusterWorld(seed, this.zone, c, geom));
    centers.push(clusterWorld(seed, this.zone + 1, 0, geom));
    for (let c = 0; c < 4; c++) {
      const a = centers[c];
      const b = centers[c + 1];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(2, Math.round(d / 150));
      for (let j = 1; j < n; j++) {
        const k = j / n;
        const x = a.x + (b.x - a.x) * k;
        const z = a.z + (b.z - a.z) * k;
        const { card } = spriteCard(tex.road, [0.5, 0.5], 150, x, z, { flat: true, order: -3, alpha: 0.45 });
        this.add(card);
        if (j % 2 === 1) {
          const obj = new Container();
          const s = new Sprite(tex.windowGlow);
          s.anchor.set(0.5);
          s.blendMode = 'add';
          s.scale.set(0.5);
          s.position.set(0, -6);
          obj.addChild(s);
          this.add({ obj, X: x + 40, Y: 0, Z: z, radius: 20, height: 20, alpha: 0.85 });
        }
      }
    }
    for (let i = 0; i < UPZ; i++) {
      const p = this.slot(i);
      const ft = tex.facilities[artOf(this.kind(this.firstUnit + i))][0];
      const { card } = spriteCard(ft.body, [ft.art.ax / ft.body.width, ft.art.ay / ft.body.height], ft.art.w * 1.1, p.x, p.z);
      const glow = new Sprite(tex.windowGlow);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.scale.set(1.6);
      glow.position.set(0, -ft.art.h * 0.5);
      glow.alpha = 0.6;
      card.obj.addChild(glow);
      this.add(card);
    }
  }

  private buildDetail() {
    const { seed, geom, tex } = this.ctx;
    const r = rngFor(seed, this.zone, 650);
    const o = zoneOrigin(seed, this.zone, geom);
    const slots = Array.from({ length: UPZ }, (_, i) => this.slot(i));
    const path = pathWorld(seed, this.zone, geom, 40);
    const feature = featureWorld(seed, this.zone, geom);

    for (let c = 0; c < 4; c++) this.outposts.push(new Outpost(this.ctx, this.zone * 4 + c));
    // power lines laid from the previous outpost's depot to each new one
    for (const op of this.outposts) {
      const c = op.cluster;
      if (c < 1) continue;
      const a = nodePos('space', seed, geom, `d${c - 1}`);
      const b = op.depot;
      const n = 14;
      const pts: Vec2[] = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        // a gentle sideways sag, so it reads as laid by hand rather than ruled
        const bow = Math.sin(Math.PI * k) * 40 * (c % 2 ? 1 : -1);
        pts.push({ x: a.x + (b.x - a.x) * k + bow, z: a.z + 30 + (b.z - a.z) * k });
      }
      this.links.push({ c, strip: new GroundStrip(this.ctx.layer, tex.cable, pts, 6, { order: -1 }) });
    }
    const blockers = this.outposts.flatMap((op) => op.blockers);
    const blocked = (x: number, z: number, rad = 120) => {
      for (const s of slots) if (Math.hypot(s.x - x, (s.z - z) * 1.2) < rad) return true;
      for (const p of path) if (Math.hypot(p.x - x, (p.z - z) * 1.4) < 50) return true;
      for (const b of blockers) if (Math.hypot(b.x - x, (b.z - z) * 1.2) < b.r + rad * 0.4) return true;
      return Math.hypot(feature.x - x, (feature.z - z) * 1.3) < 230;
    };

    // Large soft fields of light and shade over the regolith; the work areas get the light.
    for (let i = 0; i < 10; i++) {
      const x = o.x + r.range(-geom.halfWidth * 1.3, geom.halfWidth * 1.3);
      const z = o.z + r.range(-300, geom.depth + 300);
      const lit = r.chance(0.4);
      const { card, sprite } = spriteCard(lit ? tex.softLight : tex.shadow, [0.5, 0.5], r.range(320, 760), x, z, { flat: true, order: -4 });
      if (lit) {
        sprite.blendMode = 'add';
        card.alpha = r.range(0.06, 0.1);
      } else {
        sprite.tint = 0x2a3352;
        card.alpha = r.range(0.25, 0.38);
      }
      this.add(card);
    }
    for (const op of this.outposts) {
      // a pool of soft work light over each outpost: it is where the eye should rest
      const cx = (op.depot.x + op.ore.x) / 2;
      const { card, sprite } = spriteCard(tex.poolGlow, [0.5, 0.5], 560, cx, op.depot.z + 60, { flat: true, order: -4 });
      sprite.blendMode = 'add';
      card.alpha = 0.1;
      this.add(card);
    }

    // craters and rocks across the zone (kept away from the work areas)
    const craterN = Math.round(7 * this.flavor.craters);
    for (let i = 0, tries = 0; i < craterN && tries < 240; tries++) {
      const x = o.x + r.range(-geom.halfWidth * 1.3, geom.halfWidth * 1.3);
      const z = o.z + r.range(-300, geom.depth + 400);
      if (blocked(x, z, 200)) continue;
      this.addFlat(tex.craters[r.int(0, 2)], r.range(110, 320), x, z, r.range(0.75, 1));
      i++;
    }
    for (let i = 0, tries = 0; i < 40 && tries < 400; tries++) {
      const x = o.x + r.range(-geom.halfWidth * 1.3, geom.halfWidth * 1.3);
      const z = o.z + r.range(-320, geom.depth + 300);
      const central = Math.abs(x - o.x) < geom.halfWidth * 0.25 && z - o.z < geom.depth * 0.7;
      if (blocked(x, z, 100) || (central && !r.chance(0.3))) continue;
      this.addUpright(tex.rocks[r.int(0, 2)], [0.5, 146 / 160], r.range(14, 50), x, z);
      i++;
    }

    // Corridors inside an outpost, lit roads between outposts and to the next settlement.
    for (let i = 0; i < UPZ; i++) {
      const unit = this.firstUnit + i;
      const next = unit + 1;
      const a = slots[i];
      const nz = Math.floor(next / UPZ);
      const ni = next - nz * UPZ;
      const b = slotWorld(seed, nz, Math.floor(ni / UPC), ni % UPC, geom, 'space');
      if (nz === this.zone && Math.floor(ni / UPC) === Math.floor(i / UPC)) this.addTube(a, b, next);
      else this.addRoad(a, b, unit, r);
    }

    // Main causeway, uncovered as each outpost is completed.
    const centers = [0, 1, 2, 3].map((c) => clusterWorld(seed, this.zone, c, geom));
    for (let i = 0; i < path.length - 1; i++) {
      const p = path[i];
      if (p.z < o.z - 40) continue;
      let bc = -1;
      let bd = 800;
      centers.forEach((c, ci) => {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bd) {
          bd = d;
          bc = ci;
        }
      });
      const lastUnit = this.firstUnit + (bc >= 0 ? (bc + 1) * UPC - 1 : UPZ - 1);
      const delay = 4000 + (i / path.length) * 30_000;
      const { card } = spriteCard(tex.road, [0.5, 0.5], 120, p.x, p.z, { flat: true, order: -2, alpha: 0, hidden: true });
      this.add(card);
      this.timed.push({ card, unit: lastUnit, delay, span: 8000, baseAlpha: 0.85 });
      if (i % 3 === 0) this.addMarker(p.x + 70, p.z, lastUnit, delay + 2000);
    }

    // Settlement feature, discovered when the zone completes.
    this.buildFeature(feature, this.firstUnit + UPZ - 1, r);
    // survey markers at the deposits an antenna has found ahead of time
    for (const op of this.outposts) {
      const obj = new Container();
      const s = new Sprite(tex.windowGlow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.scale.set(0.5);
      s.position.set(0, -30);
      obj.addChild(s);
      const card: Card = { obj, X: op.ore.x, Y: 0, Z: op.ore.z + 4, radius: 30, height: 40, hidden: true };
      this.add(card);
      this.markers.push({ card, cluster: op.cluster });
      this.beacons.push({ s, phase: r.range(0, 6.28) });
    }
  }

  private addFlat(tex: Texture, width: number, x: number, z: number, alpha: number) {
    const { card } = spriteCard(tex, [0.5, 0.5], width, x, z, { flat: true, order: -3 });
    card.alpha = alpha;
    this.add(card);
    return card;
  }

  private addUpright(tex: Texture, anchor: [number, number], width: number, x: number, z: number) {
    const { card } = spriteCard(tex, anchor, width, x, z);
    this.add(card);
    return card;
  }

  private addTimed(card: Card, unit: number, delay: number, span = 6000, baseAlpha = 1) {
    card.alpha = 0;
    card.hidden = true;
    this.add(card);
    this.timed.push({ card, unit, delay, span, baseAlpha });
  }

  private addBeacon(x: number, z: number, r: Rng, unit: number, delay: number) {
    const obj = new Container();
    const s = new Sprite(this.ctx.tex.windowGlow);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.scale.set(0.42);
    s.position.set(0, -26);
    obj.addChild(s);
    this.addTimed({ obj, X: x, Y: 0, Z: z, radius: 30, height: 40 }, unit, delay);
    this.beacons.push({ s, phase: r.range(0, 6.28) });
  }

  private addMarker(x: number, z: number, unit: number, delay: number) {
    const obj = new Container();
    const s = new Sprite(this.ctx.tex.windowGlow);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.scale.set(0.28);
    s.position.set(0, -4);
    obj.addChild(s);
    this.addTimed({ obj, X: x, Y: 0, Z: z, radius: 20, height: 20 }, unit, delay, 3000, 0.9);
  }

  /** Corridor segments between two sites; it is built once the later one is complete. */
  private addTube(a: Vec2, b: Vec2, unit: number) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.round(d / 34));
    for (let j = 0; j < n; j++) {
      const pa = { x: a.x + ((b.x - a.x) * j) / n, z: a.z + ((b.z - a.z) * j) / n };
      const pb = { x: a.x + ((b.x - a.x) * (j + 1)) / n, z: a.z + ((b.z - a.z) * (j + 1)) / n };
      const obj = new Container();
      const sprite = new Sprite(this.ctx.tex.tube);
      sprite.anchor.set(0.5, 0.75);
      obj.addChild(sprite);
      const card: Card = { obj, X: (pa.x + pb.x) / 2, Y: 0, Z: (pa.z + pb.z) / 2, radius: 60, height: 30, alpha: 0, order: 1, hidden: true };
      this.add(card);
      this.tubes.push({ card, sprite, a: pa, b: pb, unit, delay: 2000 + ((j + 0.5) / n) * 14_000 });
    }
  }

  private addRoad(a: Vec2, b: Vec2, unit: number, r: Rng) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.round(d / 70));
    for (let j = 1; j < n; j++) {
      const t = j / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const delay = 3000 + t * 26_000;
      const { card } = spriteCard(this.ctx.tex.road, [0.5, 0.5], 110, x, z, { flat: true, order: -3 });
      this.addTimed(card, unit, delay, 3000, 0.5);
      if (j % 2 === 0) this.addMarker(x + r.range(-50, 50), z, unit, delay + 1000);
    }
  }

  private buildFeature(f: Vec2, unit: number, r: Rng) {
    const { tex } = this.ctx;
    const id = this.flavor.id;
    const at = (t: Texture, anchor: [number, number], w: number, x: number, z: number, flat = false, alpha = 1, delay = 2000) => {
      const { card } = spriteCard(t, anchor, w, x, z, flat ? { flat: true, order: -2 } : {});
      this.addTimed(card, unit, delay, 6000, alpha);
    };
    if (id === 'landing') {
      at(tex.pad, [0.5, 0.5], 300, f.x, f.z, true);
      at(tex.lander, [0.5, 186 / 192], 110, f.x + 10, f.z + 10);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        this.addBeacon(f.x + Math.cos(a) * 150, f.z + Math.sin(a) * 90, r, unit, 8000 + i * 900);
      }
    } else if (id === 'crater') {
      at(tex.craters[1], [0.5, 0.5], 360, f.x, f.z + 40, true);
      at(tex.dish, [0.5, 92 / 96], 170, f.x - 40, f.z - 20);
      this.addBeacon(f.x - 40, f.z - 22, r, unit, 8000);
    } else if (id === 'greenhouse') {
      const ft = tex.facilities.greenhouse[0];
      at(ft.body, [ft.art.ax / ft.body.width, ft.art.ay / ft.body.height], 300, f.x, f.z + 20);
      at(tex.poolGlow, [0.5, 0.5], 420, f.x, f.z + 10, true, 0.35, 8000);
    } else {
      for (let i = 0; i < 6; i++) at(tex.crate, [0.5, 74 / 80], r.range(24, 36), f.x + r.range(-90, 90), f.z + r.range(-30, 50), false, 1, 2000 + i * 1200);
      const ft = tex.facilities.workshop[0];
      at(ft.body, [ft.art.ax / ft.body.width, ft.art.ay / ft.body.height], 220, f.x + 40, f.z + 90);
      this.addBeacon(f.x - 100, f.z, r, unit, 8000);
    }
  }

  private ensureFacility(unit: number): FacEntry {
    let e = this.facs.get(unit);
    if (e) return e;
    const { seed, tex } = this.ctx;
    const pos = this.slot(unit - this.firstUnit);
    const kind = this.kind(unit);
    const fac = new Facility(rngFor(seed, unit, 88).int(0, 2 ** 30), artOf(kind), tex);
    const obj = new Container();
    obj.addChild(fac.root);
    const card: Card = { obj, X: pos.x, Y: 0, Z: pos.z, radius: fac.width * 0.7, height: fac.art.h + 120, occH: fac.topH };
    const gobj = new Container();
    gobj.addChild(fac.ground);
    const ground: Card = { obj: gobj, X: pos.x, Y: 0, Z: pos.z + 0.5, radius: fac.width, height: 10, flat: true, order: -1 };
    this.add(ground);
    this.add(card);
    // materials delivered to the site wait beside it, on the depot side
    const inner = innerOfUnit(unit);
    const pobj = new Container();
    const pileSprites: Sprite[] = [];
    for (let i = 0; i < 10; i++) {
      const s = new Sprite(tex.crate);
      s.anchor.set(0.5, 74 / 80);
      s.scale.set(SITE_PILE_W / 68);
      s.position.set(inner * ((i % 3) - 1) * (SITE_PILE_W + 1), -Math.floor(i / 3) * 11.5);
      s.visible = false;
      pileSprites.push(s);
      pobj.addChild(s);
    }
    const pile: Card = { obj: pobj, X: pos.x + inner * (fac.width * 0.5 + 18), Y: 0, Z: pos.z - 24, radius: 40, height: 50, hidden: true };
    this.add(pile);
    // small signs of life by a finished habitat (they appear over the following minutes)
    const props: FacEntry['props'] = [];
    if (kind === 'habitat') {
      const { card: pc } = spriteCard(tex.pot, [0.5, 60 / 64], 15, pos.x - inner * 70, pos.z - 16);
      pc.hidden = true;
      this.add(pc);
      props.push({ card: pc, delay: 90_000 });
      const { card: lc } = spriteCard(tex.crate, [0.5, 74 / 80], 13, pos.x - inner * 52, pos.z - 10);
      lc.hidden = true;
      this.add(lc);
      props.push({ card: lc, delay: 240_000 });
    }
    e = { unit, fac, card, ground, pos, pile, pileSprites, props };
    this.facs.set(unit, e);
    return e;
  }

  update(v: SpaceZoneView) {
    if (this.level === 'lod') return;
    const { sim, W, t, motion, wt, proj, glowBoost } = v;
    const last = this.firstUnit + UPZ - 1;
    const p = sim.proj;
    for (let unit = this.firstUnit; unit <= last; unit++) {
      const u = spaceUnitProgress(sim, unit, W);
      const e = u === null ? this.facs.get(unit) : this.ensureFacility(unit);
      if (!e) continue;
      const shown = u !== null;
      e.card.hidden = !shown;
      e.ground.hidden = !shown;
      if (!shown) {
        e.pile.hidden = true;
        continue;
      }
      // a lost building: rubble until it is cleared, then rebuilt stage by stage
      const wk = sim.wreck && sim.wreck.u === unit ? sim.wreck : null;
      const job = (k: string) => {
        for (const r of sim.rovers) if (r.step && r.step.k === k && r.step.ref === unit && W >= r.step.t0 && W < r.step.t1) return (W - r.step.t0) / (r.step.t1 - r.step.t0);
        return -1;
      };
      const rub = this.rubbleFor(unit, e);
      if (wk && !wk.cleared) {
        const k = Math.max(0, job('clear'));
        e.card.hidden = true;
        rub.hidden = false;
        rub.alpha = 1 - k * 0.85;
        e.pile.hidden = true;
        continue;
      }
      rub.hidden = true;
      if (wk && wk.cleared) {
        const k = Math.max(0, job('rebuild'));
        e.fac.setProgress(0.07 + 0.93 * Math.min(1, (wk.stage + k) / SPACE.raid.rebuildSteps));
      } else e.fac.setProgress(u);
      // raid damage: as the plan lands it, then until a drone has repaired it
      let lv = sim.raid ? raidLevel(sim.raid, unit, W) : 0;
      const dm = sim.damage.find((d) => d.u === unit);
      if (dm) {
        const k = job('repair');
        lv = Math.max(lv, dm.level * (k >= 0 ? 1 - k : 1));
      }
      e.fac.setDamage(lv);
      e.fac.setGlowBoost(glowBoost);
      e.fac.ambient(t, motion, wt, v.careUnit === unit ? v.careK : 0);
      // site pile, in resource order
      const site = unit === p.unit ? v.siteCrates : null;
      const order: (keyof Amt)[] = [];
      if (site) for (const r of RES) for (let k = 0; k < Math.max(0, Math.round(site[r])); k++) order.push(r);
      e.pile.hidden = order.length <= 0;
      e.pileSprites.forEach((s, i) => {
        s.visible = i < order.length;
        if (s.visible) s.tint = CRATE_TINT[order[i]];
      });
      const done = spaceDoneAt(sim, unit);
      for (const pr of e.props) pr.card.hidden = !(done === -Infinity || W - done >= pr.delay);
    }
    // outposts
    const zoneOfC = (c: number) => Math.floor(c / 4);
    for (const op of this.outposts) {
      const c = op.cluster;
      const active = c === sim.cluster;
      const past = c < sim.cluster;
      const cables: number[] = [];
      for (let s = 0; s < UPC; s++) {
        const unit = c * UPC + s;
        const u = spaceUnitProgress(sim, unit, W);
        cables.push(u === null ? 0 : Math.max(0, Math.min(1, (u - 0.85) / 0.05)));
      }
      const discovered = sim.antennaZone === zoneOfC(c) || (sim.antennaZone === zoneOfC(c) - 1 && c % 4 === 0);
      const known = past || (active && (sim.oreKnown || v.surveyK > 0)) || (!past && !active && discovered);
      op.update({
        W,
        t,
        motion,
        setup: past ? 1 : active ? (sim.setup === 2 ? 1 : v.setupK) : 0,
        crates: active ? v.depotCrates : { m: 0, c: 0, r: 0 },
        reserved: active ? v.depotReserved : 0,
        depletion: past ? { m: 1, c: 1, r: 1 } : active ? { m: 1 - depositLeft(sim, 'm'), c: 1 - depositLeft(sim, 'c'), r: 1 - depositLeft(sim, 'r') } : { m: 0, c: 0, r: 0 },
        rare: rareAt(sim, c),
        oreTrips: past ? 14 : active ? sim.wear.ore : 0,
        siteTrips: past ? 14 : active ? sim.wear.site : 0,
        grid: c === 0 ? gridLevel(sim, W) : 0,
        charging: active && v.charging,
        cables,
        known,
      });
      const m = this.markers.find((x) => x.cluster === c);
      if (m) m.card.hidden = !(c > sim.cluster && discovered);
    }
    // the line to each outpost unrolls behind the drone laying it
    for (const l of this.links) {
      const k = sim.linked >= l.c ? 1 : v.link && v.link.c === l.c ? v.link.k : 0;
      l.strip.set(k, 0.95);
    }
    // decor that appears after completions
    for (const d of this.timed) {
      const a = appear(spaceDoneAt(sim, d.unit), d.delay, d.span, W);
      d.card.alpha = a * d.baseAlpha;
      d.card.hidden = a <= 0.001;
    }
    // tube segments align with the projected corridor direction
    for (const s of this.tubes) {
      const a = appear(spaceDoneAt(sim, s.unit), s.delay, 2500, W);
      s.card.hidden = a <= 0.001;
      if (s.card.hidden) continue;
      s.card.alpha = a;
      const sc = proj.scale(s.card.Z);
      if (sc <= 0) continue;
      const ax = proj.sx(s.a.x, s.a.z);
      const ay = proj.sy(0, s.a.z);
      const bx = proj.sx(s.b.x, s.b.z);
      const by = proj.sy(0, s.b.z);
      const len = Math.hypot(bx - ax, by - ay) / sc;
      s.sprite.rotation = Math.atan2(by - ay, bx - ax);
      s.sprite.width = len * 1.12;
      s.sprite.height = 22 * (0.6 + 0.4 * a);
    }
    for (const b of this.beacons) {
      b.s.alpha = motion ? 0.45 + 0.35 * Math.sin(t * 1.1 + b.phase) : 0.7;
    }
  }

  /** Facilities that may stand in front of the work (faded by the scene when they do). */
  occluders(): Card[] {
    const out: Card[] = [];
    for (const e of this.facs.values()) if (!e.card.hidden) out.push(e.card);
    return out;
  }

  facilityFor(unit: number): FacEntry | null {
    return this.facs.get(unit) ?? null;
  }

  outpost(cluster: number): Outpost | null {
    return this.outposts.find((o) => o.cluster === cluster) ?? null;
  }

  cardCount() {
    return this.cards.length;
  }

  destroy() {
    for (const c of this.cards) this.ctx.layer.remove(c);
    for (const op of this.outposts) op.destroy();
    this.outposts.length = 0;
    for (const l of this.links) l.strip.destroy();
    this.links = [];
    this.cards = [];
    this.facs.clear();
    this.timed = [];
    this.tubes = [];
    this.beacons = [];
  }
}
