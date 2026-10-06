/**
 * Expansion: the scout drone that flies ahead to each new outpost once research stands. It
 * takes off from the finished outpost, flies low over the plain, circles the new site while a
 * scan ring pulses on the ground, sets down a beacon by the future depot and climbs away.
 * Everything here is read from the simulation's scout flight (`sim.scout`), so a reload shows
 * the same flight at the same moment.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { SPACE } from '../../../sim/config';
import { innerOfUnit } from '../../../sim/layout';
import { RULES_UNITS_PER_CLUSTER as UPC } from '../../../sim/units';
import type { Card } from '../../diorama';
import { num } from '../../paint/color';
import { S } from '../palette';
import type { SpaceCtx, SpaceFrame } from './types';
import { ease } from './types';

const SCOUT_W = 72;
const BEACON_W = 22;
/** After the beacon is down the scout climbs away for this long (visual only). */
const LEAVE_S = 8;

export class Expansion {
  private ctx: SpaceCtx;
  private scout: Card;
  private body: Sprite;
  private lamp: Sprite;
  private shadow: Card;
  private ring: Card;
  private ringG = new Graphics();
  private beacon: Card;
  private beaconInner = new Container();
  private beaconLight: Sprite;

  constructor(ctx: SpaceCtx) {
    this.ctx = ctx;
    const tex = ctx.tex;
    const obj = new Container();
    this.body = new Sprite(tex.scout);
    this.body.anchor.set(0.5);
    this.body.scale.set(SCOUT_W / tex.scout.width);
    this.lamp = new Sprite(tex.windowGlow);
    this.lamp.anchor.set(0.5);
    this.lamp.blendMode = 'add';
    this.lamp.scale.set(0.45);
    this.lamp.position.set(14, 8);
    obj.addChild(this.lamp, this.body);
    this.scout = { obj, X: 0, Y: 0, Z: 0, radius: 40, height: 40, hidden: true, order: 6 };
    ctx.layer.add(this.scout);

    const sobj = new Container();
    const sh = new Sprite(tex.shadow);
    sh.anchor.set(0.5);
    sh.scale.set(84 / 256);
    sobj.addChild(sh);
    this.shadow = { obj: sobj, X: 0, Y: 0, Z: 0, radius: 40, height: 4, flat: true, order: -1, hidden: true };
    ctx.layer.add(this.shadow);

    const robj = new Container();
    robj.addChild(this.ringG);
    this.ring = { obj: robj, X: 0, Y: 0, Z: 0, radius: 160, height: 4, flat: true, order: -1, hidden: true };
    ctx.layer.add(this.ring);

    const bobj = new Container();
    const b = new Sprite(tex.beacon);
    b.anchor.set(0.5, 92 / 96);
    b.scale.set(BEACON_W / tex.beacon.width);
    this.beaconLight = new Sprite(tex.windowGlow);
    this.beaconLight.anchor.set(0.5);
    this.beaconLight.blendMode = 'add';
    this.beaconLight.scale.set(0.5);
    this.beaconLight.position.set(0, -(92 - 15) * (BEACON_W / tex.beacon.width));
    this.beaconInner.addChild(b, this.beaconLight);
    bobj.addChild(this.beaconInner);
    this.beacon = { obj: bobj, X: 0, Y: 0, Z: 0, radius: 20, height: 36, hidden: true };
    ctx.layer.add(this.beacon);
  }

  /** Where the scout is in its flight right now (null when it is not flying). */
  static phase(f: SpaceFrame): { stage: 'fly' | 'scan' | 'drop' | 'leave'; k: number } | null {
    const sc = f.sim.scout;
    if (!sc) return null;
    const { flyMs, scanMs, dropMs } = SPACE.scout;
    const e = f.W - sc.t0;
    if (e < 0) return null;
    if (e < flyMs) return { stage: 'fly', k: e / flyMs };
    if (e < flyMs + scanMs) return { stage: 'scan', k: (e - flyMs) / scanMs };
    if (e < flyMs + scanMs + dropMs) return { stage: 'drop', k: (e - flyMs - scanMs) / dropMs };
    if (e < flyMs + scanMs + dropMs + LEAVE_S * 1000) return { stage: 'leave', k: (e - flyMs - scanMs - dropMs) / (LEAVE_S * 1000) };
    return null;
  }

  update(f: SpaceFrame) {
    const { sim, W, wt, motion } = f;
    const sc = sim.scout;
    const ph = Expansion.phase(f);
    const layer = this.ctx.layer;
    this.scout.hidden = true;
    this.shadow.hidden = true;
    this.ring.hidden = true;
    // the beacon stands by the new depot until the outpost's first building is done
    const doneIn = sim.done - sim.cluster * UPC;
    const beaconOn = !!sc && sc.c === sim.cluster && doneIn <= 0 && W >= sc.t1 - SPACE.scout.dropMs * 0.5;
    this.beacon.hidden = !beaconOn;
    if (!sc) return;
    const A = this.ctx.node(`d${sc.from}`);
    const B = this.ctx.node(`d${sc.c}`);
    const inner = innerOfUnit(sc.c * UPC);
    const bx = B.x - inner * 64;
    const bz = B.z + 44;
    if (beaconOn) {
      this.beacon.X = bx;
      layer.move(this.beacon, bz);
      const appear = Math.min(1, Math.max(0, (W - (sc.t1 - SPACE.scout.dropMs * 0.5)) / 1500));
      // it unfolds upward from the ground as it is set down
      this.beaconInner.scale.set(1, appear);
      this.beaconLight.alpha = motion ? (Math.sin(wt * 2.4) > 0.6 ? 1 : 0.35) : 0.7;
    }
    if (!ph) return;
    let x = B.x;
    let z = B.z;
    let y = 70;
    let face = B.x >= A.x ? 1 : -1;
    if (ph.stage === 'fly') {
      const e = ease(ph.k);
      x = A.x + (B.x - A.x) * e;
      z = A.z + (B.z - A.z) * e;
      y = 26 + (70 - 26) * ph.k + 50 * Math.sin(Math.PI * ph.k);
    } else if (ph.stage === 'scan') {
      // one slow circle over the site
      const a = ph.k * Math.PI * 2 - Math.PI / 2;
      x = B.x + Math.cos(a) * 110;
      z = B.z + 30 + Math.sin(a) * 60;
      y = 70;
      face = -Math.sin(a) >= 0 ? 1 : -1;
      this.ring.hidden = false;
      this.ring.X = B.x;
      layer.move(this.ring, B.z + 30);
      const g = this.ringG;
      g.clear();
      // two rings travel outward from the centre of the site
      for (const off of [0, 0.5]) {
        const q = (ph.k * 3 + off) % 1;
        g.ellipse(0, 0, 30 + q * 150, (30 + q * 150) * 0.62).stroke({ color: num(S.teal), width: 4, alpha: 0.8 * (1 - q) * Math.sin(Math.min(1, ph.k * 8) * Math.PI * 0.5) });
      }
    } else if (ph.stage === 'drop') {
      x = bx + inner * 10;
      z = bz;
      y = 70 - 34 * ease(ph.k);
    } else {
      // climbs away back toward the colony
      const e = ease(ph.k);
      x = bx + (A.x - bx) * e * 0.4;
      z = bz + (A.z - bz) * e * 0.4;
      y = 40 + 260 * e;
      face = A.x >= B.x ? 1 : -1;
    }
    this.scout.hidden = false;
    this.scout.X = x;
    this.scout.Y = y;
    layer.move(this.scout, z);
    // a gentle hover bob and a little bank into the turn
    const bob = motion ? Math.sin(wt * 3.1) * 1.5 : 0;
    this.body.y = bob;
    this.body.scale.x = face * Math.abs(this.body.scale.y);
    this.lamp.x = face * 14;
    this.lamp.alpha = 0.5 + 0.3 * (ph.stage === 'scan' ? 1 : 0);
    this.scout.alpha = ph.stage === 'leave' ? 1 - ph.k : 1;
    this.shadow.hidden = false;
    this.shadow.X = x;
    layer.move(this.shadow, z);
    this.shadow.alpha = Math.max(0.1, 0.5 - y / 400) * (ph.stage === 'leave' ? 1 - ph.k : 1);
  }

  destroy() {
    for (const c of [this.scout, this.shadow, this.ring, this.beacon]) this.ctx.layer.remove(c);
  }
}
