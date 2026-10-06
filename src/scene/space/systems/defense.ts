/**
 * Defence: the colony's garrison and the raids it meets, replayed from the simulation.
 *
 * Between raids the guards stand in rows on a parade ground beside the active outpost (two of
 * them walk a slow round past the depot) and the tanks are parked behind them; the rows fill
 * up as the barracks and the factory train more. When a raid comes (`sim.raid`, a plan made
 * once by the simulation) the garrison moves out to a line beyond the deposits, the raiders
 * come in from the wilderness, light bolts fly while the raiders are driven off one by one,
 * and the plan's hits land on the buildings. Guards whose shield gives out sit down inside a
 * capsule and a medic drone flies them back; a tank that is knocked out goes dark and smokes.
 * Defence drones lift off from the depot for every raid (the landing pod's before there are
 * turrets and a garrison), hold station above the line and fire on the raiders.
 * The shots themselves are derived from the plan (who fires when, at whom), so a reload shows
 * the same fight at the same moment.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { clearIfDrawn, ownGroup } from '../../gfx';
import { innerOfUnit } from '../../../sim/layout';
import type { RaidPlan } from '../../../sim/raid';
import { RULES_UNITS_PER_CLUSTER as UPC } from '../../../sim/units';
import type { Card, Projector } from '../../diorama';
import { num } from '../../paint/color';
import { S } from '../palette';
import type { SpaceCtx, SpaceFrame } from './types';
import { ease } from './types';

const GUARDS = 24;
const TANKS = 8;
const RAIDERS = 18;
const PUFFS = 28;
const MEDICS = 3;
const GUARD_W = 16;
const TANK_W = 72;
const CRITTER_W = 30;
const WARDEN_W = 46;
const CAPSULE_W = 30;
const SENTRIES = 3;
const SENTRY_W = 40;

interface Unit {
  card: Card;
  body: Sprite;
  extra: Sprite | null;
}

const hash = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

export interface DefenseView {
  /** Where the fight is, for the camera (null between raids). */
  line: { x: number; z: number } | null;
  /** Where the garrison stands. */
  ground: { x: number; z: number } | null;
}

export class Defense {
  private ctx: SpaceCtx;
  private guards: Unit[] = [];
  private tanks: Unit[] = [];
  private raiders: Unit[] = [];
  private puffs: { card: Card; sprite: Sprite }[] = [];
  private medics: Unit[] = [];
  private sentries: { unit: Unit; jet: Sprite }[] = [];
  private bolts: Card;
  private boltG = ownGroup(new Graphics());
  /** Bolts and orbs of this frame in world space, drawn after projection. */
  private segs: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; color: number; width: number; orb: boolean }[] = [];

  constructor(ctx: SpaceCtx) {
    this.ctx = ctx;
    const tex = ctx.tex;
    const unit = (t: Texture, anchor: [number, number], width: number, extra: Texture | null = null, extraAnchor: [number, number] = [0.5, 0.5]): Unit => {
      const obj = new Container();
      const body = new Sprite(t);
      body.anchor.set(anchor[0], anchor[1]);
      body.scale.set(width / t.width);
      let ex: Sprite | null = null;
      if (extra) {
        ex = new Sprite(extra);
        ex.anchor.set(extraAnchor[0], extraAnchor[1]);
        ex.scale.set(width / t.width);
      }
      obj.addChild(body);
      if (ex) obj.addChild(ex);
      const card: Card = { obj, X: 0, Y: 0, Z: 0, radius: width, height: width * 1.6, hidden: true };
      ctx.layer.add(card);
      return { card, body, extra: ex };
    };
    for (let i = 0; i < GUARDS; i++) {
      const g = unit(tex.guard[0], [0.5, 68 / 72], GUARD_W, tex.capsule, [0.5, 44 / 48]);
      g.extra!.scale.set(CAPSULE_W / tex.capsule.width);
      g.extra!.visible = false;
      this.guards.push(g);
    }
    for (let i = 0; i < TANKS; i++) {
      const tk = unit(tex.tankHull, [0.5, 74 / 80], TANK_W, tex.tankTurret, [40 / 112, 28 / 48]);
      // the turret sits on the hull's roof (44 px above the base)
      tk.extra!.position.set(-2, -44 * (TANK_W / tex.tankHull.width) - 3);
      this.tanks.push(tk);
    }
    for (let i = 0; i < RAIDERS; i++) this.raiders.push(unit(tex.critter, [0.5, 44 / 48], CRITTER_W));
    for (let i = 0; i < SENTRIES; i++) {
      const u = unit(tex.sentry, [0.5, 0.5], SENTRY_W);
      const jet = new Sprite(tex.windowGlow);
      jet.anchor.set(0.5);
      jet.blendMode = 'add';
      jet.tint = num(S.energy);
      jet.scale.set(0.3, 0.18);
      jet.position.set(-SENTRY_W * 0.42, 2);
      u.card.obj.addChildAt(jet, 0);
      u.card.order = 6;
      this.sentries.push({ unit: u, jet });
    }
    for (let i = 0; i < MEDICS; i++) {
      const m = unit(tex.scout, [0.5, 0.5], 40, tex.capsule, [0.5, 0]);
      m.extra!.scale.set(CAPSULE_W / tex.capsule.width);
      m.extra!.position.set(0, 8);
      this.medics.push(m);
    }
    for (let i = 0; i < PUFFS; i++) {
      const obj = new Container();
      const sprite = new Sprite(tex.dust);
      sprite.anchor.set(0.5);
      obj.addChild(sprite);
      const card: Card = { obj, X: 0, Y: 0, Z: 0, radius: 30, height: 30, hidden: true, order: 5 };
      ctx.layer.add(card);
      this.puffs.push({ card, sprite });
    }
    const bobj = new Container();
    bobj.addChild(this.boltG);
    this.bolts = { obj: bobj, X: 0, Y: 0, Z: 0, radius: 2000, height: 200, hidden: true, order: 6 };
    ctx.layer.add(this.bolts);
  }

  /** The parade ground and the defence line of outpost c. */
  private places(c: number) {
    const kx = this.ctx.geom.aspect === 'tall' ? 0.62 : 1;
    const D = this.ctx.node(`d${c}`);
    // the deposits (and the wilderness the raiders come from) lie on the outer side; the line
    // is held just beyond them
    const side = -innerOfUnit(c * UPC);
    const ground = { x: D.x - side * 250 * kx, z: D.z - 30 };
    const line = { x: D.x + side * 520 * kx, z: D.z + 30 };
    return { D, side, kx, ground, line };
  }

  private guardSlot(i: number, c: number) {
    const { ground, side, kx } = this.places(c);
    const row = Math.floor(i / 6);
    const col = i % 6;
    return { x: ground.x + side * (col - 2.5) * 15 * kx + (row % 2) * 4, z: ground.z + row * 17 };
  }

  private tankSlot(i: number, c: number) {
    const { ground, side, kx } = this.places(c);
    const row = Math.floor(i / 4);
    const col = i % 4;
    return { x: ground.x + side * (col - 1.5) * 70 * kx, z: ground.z + 95 + row * 44 };
  }

  private guardLine(i: number, n: number, p: RaidPlan) {
    const { line, side, kx } = this.places(p.c);
    // a loose skirmish line: four across, rows going back, every other row shifted
    const col = i % 4;
    const row = Math.floor(i / 4);
    const rows = Math.max(1, Math.ceil(n / 4));
    return { x: line.x - side * (12 + col * 24 + (row % 2) * 12) * kx, z: line.z - 30 + (row - (rows - 1) / 2) * 34 + 40 };
  }

  private tankLine(i: number, n: number, p: RaidPlan) {
    const { line, side, kx } = this.places(p.c);
    // tanks behind the guards, two abreast, spaced well apart
    const col = i % 2;
    const row = Math.floor(i / 2);
    const rows = Math.max(1, Math.ceil(n / 2));
    return { x: line.x - side * (130 + col * 90 + (row % 2) * 30) * kx, z: line.z + 40 + (row - (rows - 1) / 2) * 62 };
  }

  /** Where raider j is at W (and whether it is down, retreating, gone). */
  private raider(p: RaidPlan, j: number, W: number) {
    const { line, side, kx } = this.places(p.c);
    const rd = p.raiders[j];
    const z = line.z - 50 + rd.lane * 160;
    const far = line.x + side * 620 * kx;
    const front = line.x + side * (170 + hash(p.n, j) * 70) * kx;
    let x = far;
    let state: 'come' | 'fight' | 'down' | 'back' | 'gone' = 'come';
    let k = 0;
    if (W < p.tFight) {
      const q = Math.max(0, (W - p.t0) / (p.tFight - p.t0));
      x = far + (front - far) * ease(q);
    } else if (rd.down >= 0 && W >= rd.down) {
      state = 'down';
      k = (W - rd.down) / 3500;
      x = front + side * k * 160 * kx;
      if (k >= 1) state = 'gone';
    } else if (W < p.tBack) {
      state = 'fight';
      // pressing in and falling back a little, in waves
      x = front - side * (40 + 30 * Math.sin((W - p.tFight) / 1700 + j)) * kx * (p.faction === 'swarm' ? 1 : 0.4);
    } else {
      state = 'back';
      k = (W - p.tBack) / (p.t1 - p.tBack);
      x = front + side * ease(k) * 520 * kx;
      if (k >= 1) state = 'gone';
    }
    return { x, z, state, k };
  }

  update(f: SpaceFrame): DefenseView {
    const { sim, W, wt, motion } = f;
    const tex = this.ctx.tex;
    const layer = this.ctx.layer;
    const p = sim.raid;
    const c = p ? p.c : sim.cluster;
    const a = sim.army;
    const present = Math.min(GUARDS, a.inf - a.out);
    const tanks = Math.min(TANKS, a.tanks);
    const pl = this.places(c);
    const fighting = !!p && W >= p.t0 && W < p.t1 + 25_000;
    // during a raid the line is held by those who were there when it began
    // everyone present is drawn; those the raid's plan sent out (all of them for a full raid, a
    // detachment for a skirmish) go to the line, the rest stay on the parade ground
    const outG = fighting ? p!.inf : 0;
    const outT = fighting ? p!.tanks : 0;
    const nG = Math.max(present, outG);
    const nT = Math.max(tanks, outT);
    let puff = 0;
    const smoke = (x: number, y: number, z: number, age: number, grey = true) => {
      if (puff >= PUFFS || !motion) return;
      const pf = this.puffs[puff++];
      pf.card.hidden = false;
      pf.card.X = x + age * 6;
      pf.card.Y = y + age * 30;
      layer.move(pf.card, z - 2);
      pf.sprite.texture = grey ? tex.dust : tex.spark;
      pf.sprite.blendMode = grey ? 'normal' : 'add';
      pf.sprite.tint = grey ? 0x6a6478 : 0xffc890;
      pf.sprite.alpha = Math.sin(Math.min(1, age) * Math.PI) * (grey ? 0.5 : 0.9);
      pf.sprite.scale.set(grey ? 0.25 + age * 0.5 : 0.2);
    };

    // guards
    for (let i = 0; i < GUARDS; i++) {
      const g = this.guards[i];
      if (i >= nG) {
        g.card.hidden = true;
        continue;
      }
      let pos = this.guardSlot(i, c);
      let face = -pl.side;
      let pose: 0 | 1 | 2 = 0;
      let sheltered = -1;
      if (fighting && p && i < outG) {
        const home = pos;
        const out = this.guardLine(i, outG, p);
        const go = Math.min(1, Math.max(0, (W - p.t0 - 1500 - (i % 6) * 300) / 16_000));
        const back = Math.min(1, Math.max(0, (W - p.t1 - 2000 - (i % 6) * 300) / 18_000));
        const k = ease(go) * (1 - ease(back));
        pos = { x: home.x + (out.x - home.x) * k, z: home.z + (out.z - home.z) * k };
        const moving = (go > 0 && go < 1) || (back > 0 && back < 1);
        face = go < 1 || back > 0 ? Math.sign(out.x - home.x) * (back > 0 ? -1 : 1) || face : pl.side;
        pose = moving ? (motion && Math.sin(wt * 9 + i) > 0 ? 1 : 0) : W >= p.tFight && W < p.tBack ? 2 : 0;
        const sh = p.infShield.find((s) => s.i === i);
        if (sh && W >= sh.t) sheltered = sh.t;
      } else if (i < 2 && present >= 4 && motion) {
        // two guards walk a slow round past the depot
        const q = ((f.t / 46 + i * 0.5) % 1 + 1) % 1;
        const a0 = this.guardSlot(i, c);
        const a1 = { x: pl.D.x - pl.side * 70 * pl.kx, z: pl.D.z - 70 };
        const k = q < 0.5 ? ease(q * 2) : 1 - ease((q - 0.5) * 2);
        pos = { x: a0.x + (a1.x - a0.x) * k, z: a0.z + (a1.z - a0.z) * k };
        face = (q < 0.5 ? 1 : -1) * Math.sign(a1.x - a0.x) || 1;
        pose = Math.sin(wt * 8 + i) > 0 ? 1 : 0;
      }
      g.card.hidden = false;
      g.card.X = pos.x;
      layer.move(g.card, pos.z);
      // a medic drone lifts the sheltered ones away after the raid
      let lift = 0;
      if (sheltered >= 0 && p) {
        const order = p.infShield.findIndex((s) => s.i === i);
        const t0 = p.t1 + 3000 + order * 2500;
        lift = Math.min(1, Math.max(0, (W - t0 - 1200) / 2500));
      }
      g.body.texture = tex.guard[pose];
      g.body.scale.set(face * (GUARD_W / tex.guard[0].width), (GUARD_W / tex.guard[0].width) * (sheltered >= 0 ? 0.7 : 1));
      g.body.visible = lift <= 0;
      const cap = g.extra!;
      cap.visible = sheltered >= 0 && lift < 1;
      if (cap.visible) {
        const k = Math.min(1, (W - sheltered) / 600);
        cap.scale.set((CAPSULE_W / tex.capsule.width) * k);
        cap.y = -lift * 140;
        cap.alpha = 1 - lift;
      }
      g.card.hidden = lift >= 1;
    }

    // tanks
    for (let i = 0; i < TANKS; i++) {
      const tk = this.tanks[i];
      if (i >= nT) {
        tk.card.hidden = true;
        continue;
      }
      let pos = this.tankSlot(i, c);
      let face = -pl.side;
      let aim = 0;
      let ko = -1;
      if (fighting && p && i < outT) {
        const home = pos;
        const out = this.tankLine(i, outT, p);
        const go = Math.min(1, Math.max(0, (W - p.t0 - 1000 - i * 400) / 14_000));
        const back = Math.min(1, Math.max(0, (W - p.t1 - 1500 - i * 400) / 16_000));
        const k = ease(go) * (1 - ease(back));
        pos = { x: home.x + (out.x - home.x) * k, z: home.z + (out.z - home.z) * k };
        face = pl.side;
        if (W >= p.tFight && W < p.tBack) aim = -0.12 + Math.sin((W - p.tFight) / 2100 + i) * 0.1;
        const kd = p.tankKo.find((x) => x.i === i);
        if (kd && W >= kd.t) ko = kd.t;
      }
      // a knocked-out tank stays dark on the line and smokes for a while, then is towed away
      if (ko >= 0 && p) {
        const gone = W > p.t1 + 45_000;
        tk.card.hidden = gone;
        if (gone) continue;
        const ln = this.tankLine(i, outT, p);
        pos = ln;
        tk.body.tint = 0x6a6470;
        tk.extra!.tint = 0x6a6470;
        tk.extra!.rotation = 0.25;
        const age = ((W - ko) / 1000) % 2.2;
        smoke(pos.x, 26, pos.z, age / 2.2);
        if (W - ko < 900) smoke(pos.x + 8, 22, pos.z, (W - ko) / 900, false);
      } else {
        tk.body.tint = 0xffffff;
        tk.extra!.tint = 0xffffff;
        tk.extra!.rotation = aim;
      }
      tk.card.hidden = false;
      tk.card.X = pos.x;
      layer.move(tk.card, pos.z);
      const sc = TANK_W / tex.tankHull.width;
      tk.body.scale.set(face * sc, sc);
      tk.extra!.scale.set(face * sc, sc);
      tk.extra!.x = face * -2;
    }

    // defence drones: up from the depot when a raid comes, on station above the line, back after
    const nS = Math.min(SENTRIES, 2 + (sim.counts.command > 0 ? 1 : 0));
    const sentryAt: { x: number; y: number; z: number; face: number }[] = [];
    for (let i = 0; i < SENTRIES; i++) {
      const sn = this.sentries[i];
      const live = fighting && p && i < nS && W >= p.t0 - 2000 && W < p.t1 + 14_000;
      if (!live || !p) {
        sn.unit.card.hidden = true;
        continue;
      }
      const home = { x: pl.D.x + (i - 1) * 30, y: 12, z: pl.D.z - 20 };
      const station = {
        x: pl.line.x - pl.side * (40 + i * 75) * pl.kx,
        y: 78 + i * 16 + (motion ? Math.sin(wt * 1.7 + i * 2) * 5 : 0),
        z: pl.line.z - 30 + i * 34,
      };
      const go = Math.min(1, Math.max(0, (W - (p.t0 - 2000) - i * 700) / 7000));
      const back = Math.min(1, Math.max(0, (W - p.t1 - 2000 - i * 700) / 9000));
      const k = ease(go) * (1 - ease(back));
      const x = home.x + (station.x - home.x) * k + (motion && k > 0.99 ? Math.sin(wt * 0.8 + i) * 18 : 0);
      const y = home.y + (station.y - home.y) * k + Math.sin(Math.min(go, 1 - back) * Math.PI) * 30;
      const z = home.z + (station.z - home.z) * k;
      const face = back > 0 ? -pl.side : pl.side;
      sn.unit.card.hidden = false;
      sn.unit.card.X = x;
      sn.unit.card.Y = y;
      sn.unit.card.alpha = Math.min(1, go * 4) * (1 - Math.max(0, back - 0.85) / 0.15);
      layer.move(sn.unit.card, z);
      const sc = SENTRY_W / tex.sentry.width;
      sn.unit.body.scale.set(face * sc, sc);
      sn.unit.body.rotation = face * ((go > 0 && go < 1) || (back > 0 && back < 1) ? 0.12 : motion ? Math.sin(wt * 1.1 + i) * 0.04 : 0);
      sn.jet.x = -face * SENTRY_W * 0.42;
      sn.jet.alpha = 0.55 + (motion ? 0.25 * Math.sin(wt * 21 + i) : 0);
      sentryAt.push({ x, y, z, face });
    }

    // raiders and bolts
    this.segs.length = 0;
    let line: DefenseView['line'] = null;
    if (fighting && p && W < p.t1 + 2000) {
      line = pl.line;
      this.bolts.hidden = false;
      this.bolts.X = pl.line.x;
      layer.move(this.bolts, pl.line.z - 120);
      const alive: number[] = [];
      for (let j = 0; j < RAIDERS; j++) {
        const rv = this.raiders[j];
        if (j >= p.raiders.length) {
          rv.card.hidden = true;
          continue;
        }
        const r = this.raider(p, j, W);
        rv.card.hidden = r.state === 'gone' || W < p.t0;
        if (rv.card.hidden) continue;
        rv.card.X = r.x;
        rv.card.alpha = r.state === 'down' || r.state === 'back' ? Math.max(0, 1 - r.k * 1.2) : Math.min(1, (W - p.t0) / 2500);
        layer.move(rv.card, r.z);
        if (p.faction === 'swarm') {
          rv.body.texture = r.state === 'down' ? tex.critterBall : tex.critter;
          const sc = CRITTER_W / tex.critter.width;
          // they face the colony while coming in, and the other way when they run off
          const dir = r.state === 'back' ? pl.side : -pl.side;
          rv.body.scale.set(dir * sc, sc);
          rv.body.rotation = r.state === 'down' ? r.k * 6 * pl.side : 0;
          rv.card.Y = r.state === 'fight' && motion ? Math.abs(Math.sin(wt * 7 + j)) * 3 : 0;
          if (r.state === 'down' && r.k > 0.6) smoke(r.x, 4, r.z, (r.k - 0.6) / 0.4);
        } else {
          rv.body.texture = tex.warden;
          const sc = WARDEN_W / tex.warden.width;
          const flick = r.state === 'down' ? (Math.sin(W / 60) > 0 ? 1 : 0.4) * (1 - r.k) : 1;
          rv.body.scale.set(sc * (r.state === 'down' ? 1 - r.k * 0.8 : 1));
          rv.body.rotation = (motion ? wt * 0.6 : 0) + j;
          rv.body.alpha = flick;
          rv.card.Y = 40 + (motion ? Math.sin(wt * 1.3 + j) * 6 : 0);
        }
        if (r.state === 'fight' || r.state === 'come') alive.push(j);
      }
      // bolts: each defender fires on its own rhythm at one of the raiders still in the fight
      if (W >= p.tFight && W < p.tBack && alive.length > 0) {
        const shoot = (sx: number, sy: number, sz: number, id: number, interval: number, color: number, width: number, until = Infinity) => {
          const phase = hash(p.n, id) * interval;
          const m = Math.floor((W - p.tFight - phase) / interval);
          if (m < 0) return;
          const tau = p.tFight + phase + m * interval;
          if (tau >= until) return;
          const q = (W - tau) / 260;
          if (q < 0 || q > 1) return;
          const j = alive[Math.floor(hash(id * 131 + m, p.n) * alive.length)];
          const r = this.raider(p, j, tau + 200);
          const ty = p.faction === 'warden' ? 40 : 10;
          const a0 = Math.max(0, q - 0.22);
          const at = (k: number) => ({ x: sx + (r.x - sx) * k, y: sy + (ty - sy) * k, z: sz + (r.z - sz) * k });
          const A = at(a0);
          const B = at(q);
          this.segs.push({ x0: A.x, y0: A.y, z0: A.z, x1: B.x, y1: B.y, z1: B.z, color, width, orb: false });
        };
        for (let i = 0; i < Math.min(outG, 10); i++) {
          const sh = p.infShield.find((s) => s.i === i);
          const g = this.guardLine(i, outG, p);
          shoot(g.x + pl.side * 8, 11, g.z, 100 + i, 1800 + hash(i, 7) * 800, num(S.teal), 1.6, sh ? sh.t : Infinity);
        }
        for (let i = 0; i < outT; i++) {
          const kd = p.tankKo.find((x) => x.i === i);
          const t = this.tankLine(i, outT, p);
          shoot(t.x + pl.side * 36, 24, t.z, 200 + i, 2400 + hash(i, 9) * 600, num(S.window), 2.4, kd ? kd.t : Infinity);
        }
        for (const u of p.turrets) {
          const q = this.ctx.node(`u${u}`);
          shoot(q.x, 40, q.z, 300 + u, 1300, num(S.energy), 2.6);
        }
        sentryAt.forEach((sp, i) => shoot(sp.x + sp.face * 20, sp.y - 6, sp.z, 400 + i, 1500 + hash(i, 11) * 600, num(S.energy), 1.8));
      }
      // the raiders' strikes on the buildings: a slow orb (wardens) or a sand burst (swarm)
      for (const h of p.hits) {
        const q = this.ctx.node(`u${h.u}`);
        if (p.faction === 'warden' && W >= h.t - 1500 && W < h.t) {
          const k = (W - (h.t - 1500)) / 1500;
          const src = this.raider(p, h.level % Math.max(1, p.raiders.length), h.t - 1500);
          const x = src.x + (q.x - src.x) * k;
          const z = src.z + (q.z - src.z) * k;
          const y = 40 + 30 * Math.sin(k * Math.PI);
          this.segs.push({ x0: x, y0: y, z0: z, x1: x, y1: y, z1: z, color: 0xd8f4ff, width: 5, orb: true });
        }
        if (W >= h.t && W < h.t + 900) smoke(q.x + (hash(h.u, h.level) - 0.5) * 60, 20 + h.level * 6, q.z - 10, (W - h.t) / 900, p.faction === 'swarm');
      }
    } else {
      this.bolts.hidden = true;
      for (const rv of this.raiders) rv.card.hidden = true;
    }

    // medic drones fetch the sheltered guards after the raid
    for (let k = 0; k < MEDICS; k++) this.medics[k].card.hidden = true;
    if (p && W >= p.t1) {
      let used = 0;
      p.infShield.forEach((s, order) => {
        if (used >= MEDICS) return;
        const t0 = p.t1 + 3000 + order * 2500;
        const e = W - t0;
        if (e < 0 || e > 3700) return;
        const m = this.medics[used++];
        const g = this.guardLine(s.i, outG, p);
        const down = Math.min(1, e / 1200);
        const up = Math.max(0, (e - 1200) / 2500);
        m.card.hidden = false;
        m.card.X = g.x - pl.side * up * 120;
        m.card.Y = 150 - 135 * down + up * 140;
        m.card.alpha = 1 - Math.max(0, up - 0.7) / 0.3;
        layer.move(m.card, g.z - 1);
        m.extra!.visible = up > 0;
      });
    }
    for (let k = puff; k < PUFFS; k++) this.puffs[k].card.hidden = true;
    return { line, ground: nG + nT > 0 ? pl.ground : null };
  }

  /** Bolts and orbs, drawn after projection in the line card's local space. */
  drawBolts(proj: Projector) {
    const g = this.boltG;
    clearIfDrawn(g);
    const card = this.bolts;
    if (card.hidden || !card.obj.visible || this.segs.length === 0) return;
    const s = card.obj.scale.x;
    if (!(s > 0)) return;
    const ox = card.obj.position.x;
    const oy = card.obj.position.y;
    for (const b of this.segs) {
      const x0 = (proj.sx(b.x0, b.z0) - ox) / s;
      const y0 = (proj.sy(b.y0, b.z0) - oy) / s;
      if (b.orb) {
        const k = proj.scale(b.z0) / s;
        g.circle(x0, y0, b.width * k).fill({ color: b.color, alpha: 0.95 });
        g.circle(x0, y0, b.width * 2.2 * k).fill({ color: num(S.teal), alpha: 0.3 });
        continue;
      }
      const x1 = (proj.sx(b.x1, b.z1) - ox) / s;
      const y1 = (proj.sy(b.y1, b.z1) - oy) / s;
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: b.color, width: b.width, alpha: 0.9, cap: 'round' });
    }
  }

  destroy() {
    const all = [...this.guards, ...this.tanks, ...this.raiders, ...this.medics].map((u) => u.card);
    for (const c of all) this.ctx.layer.remove(c);
    for (const p of this.puffs) this.ctx.layer.remove(p.card);
    this.ctx.layer.remove(this.bolts);
  }
}
