/**
 * Workers: the work drones driven by their simulated steps, crates and ore chunks in flight
 * between the clamps and the piles, cutting dust, weld sparks at the structure, the charging
 * cable, and the maintenance drones flying to repairs.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { RES, SPACE, type Res } from '../../../sim/config';
import { innerOfUnit, type NodeId } from '../../../sim/layout';
import { amtTotal, needOf, type SpaceSim } from '../../../sim/space';
import { RULES_UNITS_PER_CLUSTER as UPC } from '../../../sim/units';
import type { Card, Projector } from '../../diorama';
import { clearIfDrawn, ownGroup } from '../../gfx';
import { num } from '../../paint/color';
import { CHUNK_TINT, CRATE_TINT, S } from '../palette';
import { CARGO_H, Drone, Fixer, type FixerMode, type RoverMode } from '../drone';
import type { SpaceZone } from '../zone';
import { ease, stepP, transfer, type Flight, type RoverNow, type SpaceCtx, type SpaceFrame, type SpaceWork } from './types';

interface RoverActor {
  rover: Drone;
  card: Card;
  odo: number;
  lastT0: number;
  lastLen: number;
  facing: number;
}

interface Pooled {
  card: Card;
  sprite: Sprite;
}

const MAX_FLYING = 8;

const resOf = (c: string): Res | null => {
  const t = c.slice(c.indexOf('-') + 1);
  return t === 'm' || t === 'c' || t === 'r' ? t : null;
};
const MAX_PUFFS = 14;
/** The odometer only phases the hover bob; it wraps so it never grows. */
const ODO_WRAP = 1000;

interface FixerActor {
  fixer: Fixer;
  card: Card;
  facing: number;
}

/** Where a maintenance drone hovers at a node: height above the ground and facing. */
interface Hover {
  x: number;
  z: number;
  h: number;
  facing: number;
  fac: ReturnType<SpaceZone['facilityFor']>;
}

export class Workers {
  private ctx: SpaceCtx;
  private actors: RoverActor[] = [];
  private crew: FixerActor[] = [];
  private flying: Pooled[] = [];
  private puffs: Pooled[] = [];
  private weld: Pooled;
  private cable: { card: Card; g: Graphics };

  constructor(ctx: SpaceCtx) {
    this.ctx = ctx;
    const tex = ctx.tex;
    for (let i = 0; i < SPACE.maxRovers; i++) {
      const rover = new Drone(tex);
      const obj = new Container();
      obj.addChild(rover.root);
      const card: Card = { obj, X: 0, Y: 0, Z: 0, radius: 60, height: 70, order: 3, hidden: true };
      ctx.layer.add(card);
      this.actors.push({ rover, card, odo: 0, lastT0: -1, lastLen: 0, facing: 1 });
    }
    for (let i = 0; i < SPACE.crew.max; i++) {
      const fixer = new Fixer(tex);
      const obj = new Container();
      obj.addChild(fixer.root);
      const card: Card = { obj, X: 0, Y: 0, Z: 0, radius: 50, height: 60, order: 4, hidden: true };
      ctx.layer.add(card);
      this.crew.push({ fixer, card, facing: 1 });
    }
    const pooled = (texture: typeof tex.crate, order: number, radius: number): Pooled => {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      const obj = new Container();
      obj.addChild(sprite);
      const card: Card = { obj, X: 0, Y: 0, Z: 0, radius, height: radius * 2, order, hidden: true };
      ctx.layer.add(card);
      return { card, sprite };
    };
    for (let i = 0; i < MAX_FLYING; i++) this.flying.push(pooled(tex.crate, 4, 20));
    for (let i = 0; i < MAX_PUFFS; i++) this.puffs.push(pooled(tex.dust, 5, 30));
    this.weld = pooled(tex.spark, 6, 30);
    this.weld.sprite.blendMode = 'add';
    const g = ownGroup(new Graphics());
    const cobj = new Container();
    cobj.addChild(g);
    this.cable = { card: { obj: cobj, X: 0, Y: 0, Z: 0, radius: 400, height: 400, order: 2, hidden: true }, g };
    ctx.layer.add(this.cable.card);
  }

  resetWorld() {
    for (const a of this.actors) a.lastT0 = -1;
  }

  /** Where each rover is and what moves between beds, the depot pile and the site pile. */
  read(f: SpaceFrame, active: SpaceZone | undefined): SpaceWork {
    const { sim, W } = f;
    const p = sim.proj;
    const work: SpaceWork = {
      now: [],
      flights: [],
      depot: { ...sim.depot },
      reserved: amtTotal(p.atDepot),
      site: { ...p.onSite },
      charging: false,
      link: null,
      setupK: 0,
      surveyK: 0,
      careUnit: -1,
      careK: 0,
      siteEntry: active?.facilityFor(p.unit) ?? null,
      zone: active,
    };
    const flights: Flight[] = work.flights;
    const op = active?.outpost(sim.cluster) ?? null;
    const siteEntry = work.siteEntry;
    const sitePileAt = (i: number) => {
      const pile = siteEntry?.pile;
      if (!pile) return { x: 0, y: 0, z: 0 };
      const inner = innerOfUnit(p.unit);
      return { x: pile.X + inner * ((i % 3) - 1) * 15, y: Math.floor(i / 3) * 11.5 + 6, z: pile.Z };
    };
    sim.rovers.forEach((r, i) => {
      const st = r.step;
      const a = this.actors[i];
      if (!st || !a) return;
      const k = stepP(st, W);
      const A = this.ctx.node(st.a);
      const B = this.ctx.node(st.b);
      if (st.t0 !== a.lastT0) {
        // odometer: earlier drives (modulo the spoke period, so it never grows) + this one
        a.odo = f.jumped || a.lastT0 < 0 ? 0 : (a.odo + a.lastLen) % ODO_WRAP;
        a.lastT0 = st.t0;
        a.lastLen = st.k === 'drive' || st.k === 'link' ? Math.hypot(B.x - A.x, B.z - A.z) : 0;
      }
      let x = B.x;
      let z = B.z;
      let facing = a.facing;
      if (st.k === 'drive' || st.k === 'link') {
        // laying a power line is a steady crawl; driving starts and stops gently
        const e = st.k === 'link' ? k : ease(k);
        x = A.x + (B.x - A.x) * e;
        z = A.z + (B.z - A.z) * e;
        if (Math.abs(B.x - A.x) > 8) facing = B.x > A.x ? 1 : -1;
      } else {
        // face what is being worked on
        const atSite = st.k === 'build' || st.k === 'drop' || st.k === 'care' || st.k === 'patrol' || st.k === 'repair' || st.k === 'clear' || st.k === 'rebuild';
        const inner = innerOfUnit((atSite || st.k === 'assist') && st.ref >= 0 ? st.ref : sim.cluster * UPC);
        if (st.k === 'assist') facing = inner;
        else if (st.k === 'drill' || st.k === 'loadOre' || st.k === 'survey' || atSite) facing = -inner;
        else if (st.k === 'unload' || st.k === 'pick' || st.k === 'setup' || st.k === 'charge') facing = inner;
      }
      a.facing = facing;
      let mode: RoverMode;
      if (st.k === 'drive' || st.k === 'link') mode = 'drive';
      else if (st.k === 'survey' || st.k === 'patrol') mode = 'scan';
      else if (st.k === 'build' || st.k === 'assist') {
        // marking out the plot and the final check are scans; everything else is assembly
        const id = SPACE.stages[p.stage]?.id;
        mode = (id === 'inspect' || id === 'marking') && (st.k === 'assist' || st.ref === p.unit) ? 'scan' : 'build';
      }
      else mode = st.k as RoverMode;
      work.now[i] = { x, z, facing, mode, st, k };
      const bed = { x: x - facing * 4, y: CARGO_H, z };
      const t = resOf(st.c) ?? 'm';
      const onPile = amtTotal(sim.depot);
      if (st.k === 'unload') {
        const tr = transfer(st.n, k);
        work.depot[t] += tr.landed;
        for (const it of tr.items) flights.push({ from: bed, to: op ? op.crateAt(onPile + it.i) : bed, k: it.k, kind: 'ore', tint: CHUNK_TINT[t] });
      } else if (st.k === 'pick') {
        const tr = transfer(st.n, k);
        work.depot[t] -= tr.lifted;
        work.reserved -= tr.lifted;
        for (const it of tr.items) flights.push({ from: op ? op.crateAt(onPile - 1 - it.i) : bed, to: bed, k: it.k, kind: 'crate', tint: CRATE_TINT[t] });
      } else if (st.k === 'drop' && st.ref === p.unit) {
        const tr = transfer(st.n, k);
        work.site[t] += tr.landed;
        for (const it of tr.items) flights.push({ from: bed, to: sitePileAt(amtTotal(p.onSite) + it.i), k: it.k, kind: 'crate', tint: CRATE_TINT[t] });
      } else if (st.k === 'build' && st.ref === p.unit) {
        // the stage's crates disappear into the structure as it is assembled
        const need = needOf(p, p.stage);
        for (const r of RES) work.site[r] -= Math.min(need[r], Math.floor(k * (need[r] + 1)));
      } else if (st.k === 'link') work.link = { c: st.ref, k };
      else if (st.k === 'charge') work.charging = true;
      else if (st.k === 'setup') work.setupK = Math.max(work.setupK, k);
      else if (st.k === 'survey') work.surveyK = Math.max(work.surveyK, k);
      else if (st.k === 'care') {
        work.careUnit = st.ref;
        work.careK = Math.sin(k * Math.PI);
      } else if (st.k === 'loadOre') {
        const tr = transfer(st.n, k);
        for (const it of tr.items) flights.push({ from: { x: x + facing * 46, y: 2, z: z + 4 }, to: bed, k: it.k, kind: 'ore', tint: CHUNK_TINT[t] });
      }
    });
    return work;
  }

  /** Rovers, dust at the drill bit, sparks at the structure's working joint, crates in flight. */
  update(f: SpaceFrame, work: SpaceWork) {
    const { sim, motion, wt } = f;
    const p = sim.proj;
    const layer = this.ctx.layer;
    const tex = this.ctx.tex;
    const now = work.now;
    const siteEntry = work.siteEntry;
    let puff = 0;
    let welding = false;
    const fx = Math.min(1, f.effects);
    this.actors.forEach((a, i) => {
      const rn = now[i];
      const r = sim.rovers[i];
      if (!rn || !r) {
        a.card.hidden = true;
        return;
      }
      a.card.hidden = false;
      a.card.X = rn.x;
      layer.move(a.card, rn.z);
      const st = rn.st;
      let cargo: '' | 'ore' | 'crate' = '';
      let n = 0;
      const rt = resOf(st.c) ?? 'm';
      if (st.k === 'drive' && (st.c.startsWith('ore') || st.c.startsWith('crate'))) {
        cargo = st.c.startsWith('ore') ? 'ore' : 'crate';
        n = st.n;
      } else if (st.k === 'loadOre') {
        cargo = 'ore';
        n = transfer(st.n, rn.k).landed;
      } else if (st.k === 'unload') {
        cargo = 'ore';
        n = st.n - transfer(st.n, rn.k).lifted;
      } else if (st.k === 'pick') {
        cargo = 'crate';
        n = transfer(st.n, rn.k).landed;
      } else if (st.k === 'drop') {
        cargo = 'crate';
        n = st.n - transfer(st.n, rn.k).lifted;
      }
      const dist = a.odo + (st.k === 'drive' ? a.lastLen * ease(rn.k) : st.k === 'link' ? a.lastLen * rn.k : 0);
      const scanLow = st.k === 'survey' || ((st.k === 'build' || st.k === 'assist') && SPACE.stages[p.stage]?.id === 'marking');
      const pts = a.rover.pose({ dist, facing: rn.facing, mode: rn.mode, p: rn.k, wt: wt + i * 3.1, cargo, n, bat: r.bat / SPACE.battery.cap, helper: i > 0, tint: cargo === 'crate' ? CRATE_TINT[rt] : CHUNK_TINT[rt], scanLow });
      if (rn.mode === 'drill' && motion) {
        for (let j = 0; j < 5 && puff < MAX_PUFFS; j++, puff++) {
          const age = (wt * 0.85 + j / 5 + i * 0.13) % 1;
          const pf = this.puffs[puff];
          pf.card.hidden = false;
          pf.card.X = rn.x + pts.tipX + rn.facing * age * 16;
          pf.card.Y = 2 + age * 14;
          layer.move(pf.card, rn.z - 2);
          pf.sprite.texture = tex.dust;
          pf.sprite.blendMode = 'normal';
          pf.sprite.alpha = Math.sin(age * Math.PI) * 0.4 * fx;
          pf.sprite.scale.set(0.18 + age * 0.4);
        }
      }
      // weld sparks at the structure being assembled
      const weldAt = rn.mode !== 'build' ? null : st.ref === p.unit ? siteEntry : null;
      if (weldAt && !welding) {
        const siteEntry = weldAt;
        const wp = siteEntry.fac.workPoint();
        welding = true;
        const wc = this.weld.card;
        wc.hidden = false;
        wc.X = siteEntry.pos.x + wp.x;
        wc.Y = -wp.y;
        layer.move(wc, siteEntry.pos.z - 6);
        const flick = motion ? (Math.sin(wt * 29 + Math.sin(wt * 7)) > 0.1 ? 1 : 0.35) : 0.7;
        this.weld.sprite.alpha = 0.85 * flick;
        this.weld.sprite.scale.set(0.55 + 0.25 * flick);
        if (motion) {
          for (let j = 0; j < 4 && puff < MAX_PUFFS; j++, puff++) {
            const age = (wt * 2.2 + j / 4) % 1;
            const pf = this.puffs[puff];
            const dir = ((j * 2.39) % 2) - 1;
            pf.card.hidden = false;
            pf.card.X = wc.X + dir * age * 10;
            pf.card.Y = wc.Y - age * age * 12 + age * 6;
            layer.move(pf.card, siteEntry.pos.z - 7);
            pf.sprite.texture = tex.spark;
            pf.sprite.blendMode = 'add';
            pf.sprite.alpha = (1 - age) * 0.8 * fx;
            pf.sprite.scale.set(0.18);
          }
        }
      }
    });
    puff = this.updateCrew(f, work, puff, welding);
    if (!this.welding && !welding) this.weld.card.hidden = true;
    for (let j = puff; j < MAX_PUFFS; j++) this.puffs[j].card.hidden = true;

    // --- crates and chunks in flight
    for (let j = 0; j < MAX_FLYING; j++) {
      const fl = this.flying[j];
      const it = work.flights[j];
      if (!it) {
        fl.card.hidden = true;
        continue;
      }
      const e = it.k * it.k * (3 - 2 * it.k);
      fl.card.hidden = false;
      fl.card.X = it.from.x + (it.to.x - it.from.x) * e;
      fl.card.Y = it.from.y + (it.to.y - it.from.y) * e + Math.sin(it.k * Math.PI) * 14;
      layer.move(fl.card, it.from.z + (it.to.z - it.from.z) * e - 1);
      const crate = it.kind === 'crate';
      fl.sprite.texture = crate ? tex.crate : tex.oreChunk;
      fl.sprite.tint = it.tint;
      fl.sprite.anchor.set(0.5, crate ? 74 / 80 : 34 / 40);
      fl.sprite.scale.set(crate ? 14 / 68 : 0.24);
    }

    // the charging cable card stands at the rover; its curve is drawn after projection
    const crn = this.chargingRover(sim, work);
    this.cable.card.hidden = !crn;
    if (crn) {
      this.cable.card.X = crn.x;
      layer.move(this.cable.card, crn.z - 3);
    }
  }

  private welding = false;

  /** Where a maintenance drone stands at a node: over the building it works on, or in its bay. */
  private hoverAt(id: NodeId, work: SpaceWork, side: number): Hover {
    const P = this.ctx.node(id);
    if (id.startsWith('u')) {
      const unit = Number(id.slice(1));
      const fac = work.zone?.facilityFor(unit) ?? null;
      if (fac) {
        const wp = fac.fac.workPoint();
        const top = fac.fac.art.h;
        return { x: fac.pos.x + Math.max(-1, Math.min(1, wp.x / Math.max(1, fac.fac.art.w / 2))) * 20 + side * (fac.fac.art.w * 0.35 + 22), z: fac.pos.z - 26, h: Math.max(22, Math.min(top + 10, -wp.y + 12)), facing: -side, fac };
      }
      return { x: P.x + side * 60, z: P.z - 26, h: 46, facing: -side, fac: null };
    }
    // the bay: parked low
    return { x: P.x, z: P.z, h: 9, facing: -1, fac: null };
  }

  /** Maintenance drones: flights to damaged buildings, welding, clearing rubble, the bay. */
  private updateCrew(f: SpaceFrame, work: SpaceWork, puff: number, roverWelding: boolean): number {
    const { sim, W, wt, motion } = f;
    const layer = this.ctx.layer;
    const tex = this.ctx.tex;
    const fx = Math.min(1, f.effects);
    this.welding = false;
    this.crew.forEach((c, i) => {
      const w = sim.crew[i];
      const st = w?.step;
      if (!st) {
        c.card.hidden = true;
        return;
      }
      c.card.hidden = false;
      const side = i % 2 ? -1 : 1;
      const k = stepP(st, W);
      const B = this.hoverAt(st.b, work, side);
      let x = B.x;
      let z = B.z;
      let h = B.h;
      let facing = B.facing;
      let mode: FixerMode = st.k === 'repair' || st.k === 'rebuild' ? 'weld' : st.k === 'clear' ? 'clear' : st.k === 'park' ? 'park' : 'fly';
      if (st.k === 'drive') {
        const A = this.hoverAt(st.a, work, side);
        const e = ease(k);
        x = A.x + (B.x - A.x) * e;
        z = A.z + (B.z - A.z) * e;
        // up, across and down
        h = A.h + (B.h - A.h) * e + Math.sin(k * Math.PI) * 50;
        if (Math.abs(B.x - A.x) > 8) facing = B.x > A.x ? 1 : -1;
        mode = 'fly';
      }
      c.facing = facing;
      c.card.X = x;
      c.card.Y = h;
      layer.move(c.card, z);
      const tool = c.fixer.pose({ mode, facing, wt: wt + i * 2.3, height: h, reachTo: mode === 'weld' ? { x: 22, y: 4 } : mode === 'clear' ? { x: 14, y: 16 } : undefined });
      // sparks where the tool touches the building
      if (mode === 'weld' && !roverWelding && !this.welding) {
        this.welding = true;
        const wc = this.weld.card;
        wc.hidden = false;
        wc.X = x + tool.tipX;
        wc.Y = h - tool.tipY;
        layer.move(wc, z - 2);
        const flick = motion ? (Math.sin(wt * 29 + Math.sin(wt * 7)) > 0.1 ? 1 : 0.35) : 0.7;
        this.weld.sprite.alpha = 0.85 * flick;
        this.weld.sprite.scale.set(0.5 + 0.25 * flick);
        if (motion) {
          for (let j = 0; j < 4 && puff < MAX_PUFFS; j++, puff++) {
            const age = (wt * 2.2 + j / 4) % 1;
            const pf = this.puffs[puff];
            const dir = ((j * 2.39) % 2) - 1;
            pf.card.hidden = false;
            pf.card.X = wc.X + dir * age * 10;
            pf.card.Y = wc.Y - age * age * 12 + age * 6;
            layer.move(pf.card, z - 3);
            pf.sprite.texture = tex.spark;
            pf.sprite.blendMode = 'add';
            pf.sprite.alpha = (1 - age) * 0.8 * fx;
            pf.sprite.scale.set(0.18);
          }
        }
      }
    });
    return puff;
  }

  private chargingRover(sim: SpaceSim, work: SpaceWork): RoverNow | undefined {
    const i = sim.rovers.findIndex((r) => r.step?.k === 'charge');
    return i >= 0 ? work.now[i] : undefined;
  }

  /** A charging cable from the rover to the battery or charger (drawn after projection). */
  drawCable(sim: SpaceSim, work: SpaceWork, proj: Projector) {
    const rn = this.chargingRover(sim, work);
    const cg = this.cable.g;
    clearIfDrawn(cg);
    const card = this.cable.card;
    if (!rn || card.hidden || !card.obj.visible) return;
    const s = card.obj.scale.x;
    if (!(s > 0)) return;
    const inner = innerOfUnit(sim.cluster * UPC);
    const ch = this.ctx.node(sim.cluster === 0 ? 'L0' : `c${sim.cluster}`);
    const bx = sim.cluster === 0 ? ch.x + inner * 58 : ch.x;
    const bz = sim.cluster === 0 ? ch.z + 22 : ch.z + 24;
    const ox = card.obj.position.x;
    const oy = card.obj.position.y;
    const local = (X: number, Y: number, Z: number) => ({ x: (proj.sx(X, Z) - ox) / s, y: (proj.sy(Y, Z) - oy) / s });
    const a = local(rn.x + rn.facing * 18, 20, rn.z);
    const b = local(bx, 18, bz);
    cg.moveTo(a.x, a.y)
      .quadraticCurveTo((a.x + b.x) / 2, Math.max(a.y, b.y) + 16, b.x, b.y)
      .stroke({ color: num(S.metal), width: 1.6, alpha: 0.9 });
  }
}
