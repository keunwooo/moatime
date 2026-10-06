/**
 * Wildlife: the keeper and the squirrel (moved by their simulated steps), bees at real
 * flowerbeds, and visiting birds and butterflies (ambient clock only).
 */

import { Container, Graphics } from 'pixi.js';
import { rngFor } from '../../../core/rng';
import { EFFECTS, FOREST } from '../../../sim/config';
import { groundAt, type ForestSim } from '../../../sim/forest';
import { innerOfUnit } from '../../../sim/layout';
import { RULES_UNITS_PER_CLUSTER as UPC } from '../../../sim/units';
import type { Card } from '../../diorama';
import { timerRect } from '../../occlusion';
import { num } from '../../paint/color';
import { Bird, Butterfly } from '../actors';
import { Deer, Flock, Rabbit, type HopPlan } from '../fauna';
import { Keeper, KEEPER_SCALE, Squirrel, type KeeperMode } from '../keeper';
import { F } from '../palette';
import type { ForestZone } from '../zone';
import { ease, stepP, type ForestCtx, type ForestFrame, type KeeperWork } from './types';

interface Walker {
  card: Card;
  odo: number;
  lastT0: number;
  lastLen: number;
  facing: number;
}

const MAX_BEES = 4;

const MODE: Record<string, KeeperMode> = {
  walk: 'walk',
  fill: 'fill',
  clear: 'clear',
  mulch: 'mulch',
  spread: 'mulch',
  plant: 'plant',
  water: 'water',
  protect: 'protect',
  pickSeed: 'pickSeed',
  takeSeed: 'bench',
  storeSeed: 'bench',
  rake: 'rake',
  dump: 'dump',
  scoop: 'scoop',
  bed: 'bed',
  build: 'build',
  dig: 'dig',
  pondDig: 'dig',
  pondLine: 'bed',
  liftBasket: 'carryBox',
  setBench: 'carryBox',
  rest: 'rest',
  watch: 'watch',
};

export class Wildlife {
  private ctx: ForestCtx;
  private keeper: Keeper;
  private keeperWalk: Walker;
  private squirrel: Squirrel;
  private squirrelWalk: Walker;
  private butterfly: Butterfly;
  private bird: Bird;
  private visitorCards: { butterfly: Card; bird: Card };
  private bees: { card: Card; g: Graphics }[] = [];
  private visit = { bird: { next: 40, t0: -100, dur: 7 }, fly: { next: 25, t0: -100, dur: 8 } };
  private rabbit: Rabbit;
  private rabbitCard: Card;
  private hop: HopPlan | null = null;
  private nextHop = 30;
  private deer: Deer;
  private deerCard: Card;
  readonly flock = new Flock();
  private flight = { t0: -100, dur: 20, next: 90, dir: -1 };

  constructor(ctx: ForestCtx) {
    this.ctx = ctx;
    const tex = ctx.tex;
    this.keeper = new Keeper(tex.actors, tex.seed, tex.fall);
    this.keeperWalk = { card: this.actorCard(this.keeper.root, 6, 50), odo: 0, lastT0: -1, lastLen: 0, facing: 1 };
    this.squirrel = new Squirrel(tex.seed);
    this.squirrelWalk = { card: this.actorCard(this.squirrel.root, 5, 30), odo: 0, lastT0: -1, lastLen: 0, facing: 1 };
    this.butterfly = new Butterfly(tex.actors);
    this.bird = new Bird(tex.actors);
    this.visitorCards = { butterfly: this.actorCard(this.butterfly.root), bird: this.actorCard(this.bird.root) };
    for (let i = 0; i < MAX_BEES; i++) {
      const g = new Graphics();
      g.ellipse(0, 0, 1.6, 1.1).fill({ color: num(F.sun) });
      g.ellipse(0.4, 0, 0.5, 1.1).fill({ color: num(F.bark), alpha: 0.8 });
      g.ellipse(-0.3, -1.3, 1.2, 0.7).fill({ color: 0xffffff, alpha: 0.6 });
      this.bees.push({ card: this.actorCard(g, 6, 10), g });
    }
    this.rabbit = new Rabbit(tex.rabbit);
    this.rabbitCard = this.actorCard(this.rabbit.root, 5, 20);
    this.deer = new Deer(tex.deer);
    this.deerCard = this.actorCard(this.deer.root, 2, 60);
  }

  /** A hidden card in the diorama for a small actor. */
  actorCard(root: Container, order = 6, radius = 60): Card {
    const obj = new Container();
    obj.addChild(root);
    const card: Card = { obj, X: 0, Y: 0, Z: 0, radius, height: 60, hidden: true, order };
    this.ctx.layer.add(card);
    return card;
  }

  resetWorld() {
    this.keeperWalk.lastT0 = -1;
    this.squirrelWalk.lastT0 = -1;
  }

  /** The keeper's step → position, pose and what is being moved on screen right now. */
  readKeeper(f: ForestFrame): KeeperWork {
    const { sim, W } = f;
    const k = sim.keeper;
    const st = k.step;
    const work: KeeperWork = {
      st,
      p: 0,
      mode: 'watch',
      kx: 0,
      kz: 0,
      ky: 0,
      carry: '',
      carryN: 0,
      picking: new Map(),
      basket: sim.seeds,
      basketHome: sim.setup === 2,
      barrelBuild: 0,
      digging: 0,
      clearing: null,
      stir: null,
      bedMaking: null,
      pondDig: 0,
      pondLine: 0,
    };
    if (!st) return work;
    const p = stepP(st, W);
    work.p = p;
    const w = this.keeperWalk;
    const A = this.ctx.node(st.a);
    const B = this.ctx.node(st.b);
    if (st.t0 !== w.lastT0) {
      w.odo = f.jumped || w.lastT0 < 0 ? 0 : w.odo + w.lastLen;
      if (w.odo > 1e6) w.odo = 0;
      w.lastT0 = st.t0;
      w.lastLen = st.k === 'walk' ? Math.hypot(B.x - A.x, B.z - A.z) / KEEPER_SCALE : 0;
    }
    work.mode = MODE[st.k] ?? 'watch';
    work.kx = B.x;
    work.kz = B.z;
    const inner = innerOfUnit(st.ref >= 0 && st.b.startsWith('s') ? st.ref : sim.cluster * UPC);
    let facing = w.facing;
    if (st.k === 'walk') {
      const e = ease(p);
      work.kx = A.x + (B.x - A.x) * e;
      work.kz = A.z + (B.z - A.z) * e;
      if (Math.abs(B.x - A.x) > 4) facing = B.x > A.x ? 1 : -1;
      work.carry = (st.c as KeeperWork['carry']) || '';
      work.carryN = st.n;
    } else if (st.k === 'rest') {
      // sit on the bench seat
      const b = this.ctx.node(`b${sim.cluster}`);
      work.kx = b.x + innerOfUnit(sim.cluster * UPC) * 2;
      work.kz = b.z + 15;
      work.ky = 9;
      facing = -innerOfUnit(sim.cluster * UPC);
    } else {
      const atSite = st.b.startsWith('s');
      if (atSite || st.k === 'fill' || st.k === 'build') facing = -inner;
      else if (st.b.startsWith('b') || st.b.startsWith('k')) facing = innerOfUnit(sim.cluster * UPC);
    }
    w.facing = facing;
    const [fx, a] = st.fx.split(':');
    switch (st.k) {
      case 'takeSeed':
        work.basket -= p > 0.5 ? 1 : 0;
        break;
      case 'storeSeed':
        work.basket += p > 0.6 ? sim.hand : 0;
        break;
      case 'liftBasket':
        work.basketHome = p < 0.4 && st.b === `b${sim.cluster}`;
        work.carry = p >= 0.4 ? 'seedbox' : '';
        work.carryN = sim.seeds;
        break;
      case 'setBench':
        work.basketHome = p > 0.6;
        work.carry = p <= 0.6 ? 'seedbox' : '';
        work.carryN = sim.seeds;
        break;
      case 'pickSeed':
        if (fx === 'pick') work.picking.set(Number(a), { seeds: p > 0.45 ? 99 : 0, leaves: 0 });
        break;
      case 'rake': {
        const u = Number(a);
        const gtree = sim.ground.find((x) => x.u === u);
        if (gtree) {
          const pile = groundAt(sim, gtree, W).leaves;
          work.picking.set(u, { seeds: 0, leaves: Math.floor(Math.min(1, p * 1.1) * Math.min(pile, FOREST.basketCap - sim.basket)) });
        }
        work.carry = 'leaf';
        work.carryN = sim.basket + (work.picking.get(Number(a))?.leaves ?? 0);
        break;
      }
      case 'dump':
        work.carryN = st.n;
        break;
      case 'clear':
        work.clearing = { unit: st.ref, k: p };
        break;
      case 'build':
        work.barrelBuild = p;
        break;
      case 'dig':
        work.digging = p;
        break;
      case 'pondDig':
        work.pondDig = p;
        break;
      case 'pondLine':
        work.pondLine = p;
        break;
      case 'fill':
        work.stir = { cluster: Number(st.a.slice(1)), k: Math.sin(p * Math.PI) };
        break;
      case 'bed': {
        const [, c, kk] = st.fx.split(':');
        work.bedMaking = { c: Number(c), k: Number(kk), p };
        break;
      }
    }
    if (sim.setup < 2 && st.k === 'walk' && st.c === 'seedbox') work.basketHome = false;
    return work;
  }

  /** The keeper's card and pose. */
  updateKeeper(f: ForestFrame, work: KeeperWork) {
    const { sim, wt } = f;
    const k = sim.keeper;
    const st = work.st;
    const kw = this.keeperWalk;
    if (st) {
      kw.card.hidden = false;
      kw.card.X = work.kx;
      kw.card.Y = work.ky;
      this.ctx.layer.move(kw.card, work.kz);
      const dist = kw.odo + (st.k === 'walk' ? kw.lastLen * ease(work.p) : 0);
      this.keeper.pose({ mode: work.mode, p: work.p, wt, facing: kw.facing, dist, carry: work.carry, n: work.carryN, can: sim.can / FOREST.canCap });
    } else {
      // before the first step (or between worlds): standing where the keeper is
      const at = this.ctx.node(k.at);
      kw.card.hidden = false;
      kw.card.X = at.x;
      kw.card.Y = 0;
      this.ctx.layer.move(kw.card, at.z);
      this.keeper.pose({ mode: 'watch', p: 0, wt, facing: kw.facing, dist: 0, carry: '', n: 0, can: sim.can / FOREST.canCap });
    }
  }

  updateSquirrel(sim: ForestSim, W: number, wt: number, jumped: boolean, zone: ForestZone | undefined) {
    const q = sim.squirrel;
    const sw = this.squirrelWalk;
    if (!q || !q.step) {
      sw.card.hidden = true;
      return;
    }
    const st = q.step;
    const p = stepP(st, W);
    const A = this.ctx.node(st.a);
    const B = this.ctx.node(st.b);
    if (st.t0 !== sw.lastT0) {
      sw.odo = jumped || sw.lastT0 < 0 ? 0 : sw.odo + sw.lastLen;
      if (sw.odo > 1e6) sw.odo = 0;
      sw.lastT0 = st.t0;
      sw.lastLen = st.k === 'run' ? Math.hypot(B.x - A.x, B.z - A.z) : 0;
    }
    let x = B.x;
    let z = B.z;
    let y = 0;
    if (st.k === 'run') {
      const e = ease(p);
      x = A.x + (B.x - A.x) * e;
      z = A.z + (B.z - A.z) * e;
      if (Math.abs(B.x - A.x) > 3) sw.facing = B.x > A.x ? 1 : -1;
    } else if (st.k === 'perch') {
      // up on its tree, on a low branch
      const tree = zone?.treeFor(Number(st.b.slice(1)));
      if (tree) {
        x = tree.pos.x + tree.tree.shape.lean * 0.3 + 6;
        y = tree.tree.shape.trunkH * 0.55;
        z = tree.pos.z - 2;
      }
    }
    sw.card.hidden = false;
    sw.card.X = x;
    sw.card.Y = y;
    this.ctx.layer.move(sw.card, z - 1);
    const mode = st.k === 'run' ? 'run' : st.k === 'nibble' ? 'nibble' : st.k === 'bury' ? 'bury' : 'perch';
    const carrying = (st.k === 'run' && st.c === 'seed') || (st.k === 'bury' && p < 0.6) || (st.k === 'nibble' && p > 0.6);
    this.squirrel.pose({ mode, p, wt, facing: sw.facing, dist: sw.odo + sw.lastLen * (st.k === 'run' ? ease(p) : 0), carrying });
  }

  /** Bees drift between the flowers of real flowerbeds (and only where there are some). */
  updateBees(sim: ForestSim, zone: ForestZone | undefined, t: number, motion: boolean, effects: number) {
    const beds = sim.beds.filter((b) => Math.floor(b.c / 4) === sim.zone);
    const n = Math.min(MAX_BEES, Math.round(beds.length * 2 * Math.min(1.2, effects)));
    this.bees.forEach((b, i) => {
      if (i >= n || !zone || !motion) {
        b.card.hidden = true;
        return;
      }
      const bed = beds[i % beds.length];
      const at = this.ctx.node(`f${bed.c * 4 + bed.k}`);
      const ph = t * (0.35 + i * 0.07) + i * 1.7;
      b.card.hidden = false;
      b.card.X = at.x + Math.sin(ph) * 22 + Math.sin(ph * 2.3) * 6;
      b.card.Y = 10 + Math.sin(ph * 1.7) * 5 + 4;
      this.ctx.layer.move(b.card, at.z - 2 + Math.cos(ph) * 8);
      b.g.scale.x = Math.cos(ph) > 0 ? 1 : -1;
    });
  }

  /** Birds visit grown trees and butterflies visit flowers now and then (ambient clock only). */
  updateVisitors(f: ForestFrame, zone: ForestZone | undefined) {
    const { t, motion } = f;
    const vc = this.visitorCards;
    vc.bird.hidden = true;
    vc.butterfly.hidden = true;
    if (!motion || !zone) return;
    // the director grants a visitor slot (none while the camera travels or the weather is rough)
    const dir = f.director;
    const dens = Math.max(0.4, Math.min(1.6, f.effects));
    // bird
    const vb = this.visit.bird;
    if (t - vb.t0 >= vb.dur && t >= vb.next) {
      if (!dir.request('bird', 'ambient', vb.dur)) vb.next = t + 5;
      else {
        vb.t0 = t;
        const r = rngFor(Math.floor(t * 100), 41);
        vb.next = t + vb.dur + r.range(EFFECTS.birdS[0], EFFECTS.birdS[1]) / dens;
      }
    }
    const trees = zone.matureTrees();
    if (t - vb.t0 < vb.dur && trees.length) {
      const pq = (t - vb.t0) / vb.dur;
      const host = trees[Math.floor(vb.t0 * 7) % trees.length];
      const side = Math.floor(vb.t0) % 2 ? 1 : -1;
      const perch = host.tree.crownPoint(side > 0 ? 'perch' : 'side');
      const off = this.bird.update(pq, t, side);
      vc.bird.hidden = false;
      vc.bird.X = host.card.X + perch.x + off.x;
      vc.bird.Y = -perch.y - off.y;
      this.ctx.layer.move(vc.bird, host.card.Z - 3);
    }
    // butterfly
    const vf = this.visit.fly;
    if (t - vf.t0 >= vf.dur && t >= vf.next) {
      if (!dir.request('butterfly', 'ambient', vf.dur)) vf.next = t + 5;
      else {
        vf.t0 = t;
        const r = rngFor(Math.floor(t * 100), 43);
        vf.next = t + vf.dur + r.range(EFFECTS.butterflyS[0], EFFECTS.butterflyS[1]) / dens;
      }
    }
    const spots = zone.flowerSpots();
    if (t - vf.t0 < vf.dur && spots.length) {
      const pq = (t - vf.t0) / vf.dur;
      const spot = spots[Math.floor(vf.t0 * 13) % spots.length];
      const off = this.butterfly.update(pq, t, Math.floor(vf.t0) % 2 ? 1 : -1);
      vc.butterfly.hidden = false;
      vc.butterfly.X = spot.x + off.x;
      vc.butterfly.Y = spot.y - off.y;
      this.ctx.layer.move(vc.butterfly, spot.z - 1);
    }
  }

  /** Keeper, squirrel, bees and visitors, in this order (cards sharing a depth keep their order). */
  update(f: ForestFrame, work: KeeperWork, zone: ForestZone | undefined) {
    this.updateKeeper(f, work);
    this.updateSquirrel(f.sim, f.W, f.wt, f.jumped, zone);
    this.updateBees(f.sim, zone, f.t, f.motion, f.effects);
    this.updateVisitors(f, zone);
    this.updateRabbit(f);
    this.updateDeer(f);
    this.updateFlock(f);
  }

  /** From a grown forest on: a rabbit hops in from the edge of the clearing, nibbles, leaves. */
  private updateRabbit(f: ForestFrame) {
    const { t, motion, env, sim } = f;
    const card = this.rabbitCard;
    card.hidden = true;
    if (!motion || f.stage < 8) {
      this.hop = null;
      return;
    }
    if (this.hop && t > this.hop.t0 + this.hop.dur) this.hop = null;
    if (!this.hop && t >= this.nextHop) {
      const r = rngFor(Math.floor(t * 100), 51);
      const twilight = env.day.sky[1] + env.day.sky[3];
      const chance = env.day.stars > 0.7 ? 0 : twilight > 0.3 ? 1 : 0.3;
      const dens = Math.max(0.4, Math.min(1.6, f.effects));
      if (r.next() < chance && f.director.request('rabbit', 'ambient', 15)) {
        const c = sim.cluster;
        const b = this.ctx.node('b' + c);
        const out = -innerOfUnit(c * UPC);
        const k = this.ctx.geom.aspect === 'tall' ? 0.62 : 1;
        const z0 = b.z + r.range(130, 190);
        this.hop = {
          t0: t,
          dur: r.range(12, 16),
          a: { x: b.x + out * r.range(280, 340) * k, z: z0 },
          b: { x: b.x + out * r.range(130, 170) * k, z: z0 - r.range(10, 30) },
          c: { x: b.x + out * r.range(300, 360) * k, z: z0 + r.range(40, 90) },
        };
      }
      this.nextHop = t + r.range(40, 90) / dens;
    }
    if (!this.hop) return;
    const p = this.rabbit.pose(this.hop, t);
    if (!p) return;
    card.hidden = false;
    card.X = p.x;
    card.Y = p.y;
    card.alpha = p.alpha;
    this.ctx.layer.move(card, p.z);
  }

  /** The rare deer of the world timeline walks far behind the clearing (grown forests only). */
  private updateDeer(f: ForestFrame) {
    const { env, W, t, sim, motion } = f;
    const card = this.deerCard;
    const ev = env.event;
    card.hidden = true;
    if (!ev || ev.kind !== 'deer' || f.stage < 8) return;
    const q = (W - ev.t0) / Math.max(1, ev.t1 - ev.t0);
    const dir = ev.seed % 2 ? 1 : -1;
    const b = this.ctx.node('b' + sim.cluster);
    const span = this.ctx.geom.aspect === 'tall' ? 420 : 700;
    const pose = this.deer.pose(q, motion ? t : 0, dir);
    card.hidden = false;
    card.X = b.x - dir * span + dir * span * 2 * pose.k;
    card.Y = 0;
    card.alpha = pose.alpha;
    this.ctx.layer.move(card, b.z + 520);
  }

  /** In autumn (now and then in spring) a high V of birds crosses the sky. */
  private updateFlock(f: ForestFrame) {
    const { t, motion, env, vp, proj } = f;
    const fl = this.flight;
    const sw = env.season.w;
    const busy = t - fl.t0 < fl.dur;
    if (!busy && t >= fl.next) {
      const r = rngFor(Math.floor(t * 100), 53);
      const season = sw[2] > 0.4 ? 1 : sw[0] > 0.6 ? 0.4 : 0;
      const ok = motion && season > 0 && env.day.stars < 0.3 && env.weather.rain < 0.3 && r.next() < season;
      if (ok && f.director.request('flock', 'fx', fl.dur)) {
        fl.t0 = t;
        fl.dir = sw[0] > 0.6 ? 1 : -1;
      }
      fl.next = t + r.range(140, 260);
    }
    const p = (t - fl.t0) / fl.dur;
    const on = motion && p >= 0 && p <= 1;
    const tr = timerRect(vp.w, vp.h);
    const top = Math.min(proj.horizon * 0.25, tr.y0 - vp.h * 0.05);
    const alpha = on ? 0.55 * Math.min(1, p * 8, (1 - p) * 8) : 0;
    this.flock.draw(on ? p : 0, t, fl.dir, vp, top, alpha, 0x4a5262);
  }
}
