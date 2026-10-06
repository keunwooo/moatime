/**
 * Space ambient: an occasional shooting star, a shuttle lifting off from the far settlements
 * once the colony has a planet network (stage 9), slow motes and the paper texture
 * (decoration only).
 */

import { Container, Sprite } from 'pixi.js';
import { rngFor } from '../../../core/rng';
import { EFFECTS } from '../../../sim/config';
import { spaceStage } from '../../../sim/space';
import type { SpaceLight } from '../light';
import { Overlay } from '../../systems';
import type { SpaceTextures } from '../textures';
import type { SpaceFrame } from './types';

export class SpaceAmbient {
  readonly overlay: Overlay;
  private meteor: Sprite;
  private star = { next: 50, t0: -10, dur: 1.4, x0: 0, y0: 0, dx: 0, dy: 0 };
  private ship: Container;
  private shipBody: Sprite;
  private shipFlame: Sprite;
  private trip = { next: 25, t0: -99, dur: 12, x0: 0, y0: 0, x1: 0, y1: 0, dir: 1 };
  /** A small far asteroid drifting across an upper corner now and then. */
  private rock: Sprite;
  private drift = { next: 70, t0: -99, dur: 26, x0: 0, y0: 0, x1: 0, y1: 0, spin: 0.2 };

  constructor(tex: SpaceTextures, lowPower: boolean) {
    this.overlay = new Overlay(tex.paper, 0.1);
    this.overlay.setMotes(tex.mote, lowPower ? 5 : 8);
    this.meteor = new Sprite(tex.star);
    this.meteor.anchor.set(0.9, 0.5);
    this.meteor.blendMode = 'add';
    this.meteor.visible = false;
    this.overlay.root.addChildAt(this.meteor, 0);
    this.ship = new Container();
    this.shipFlame = new Sprite(tex.windowGlow);
    this.shipFlame.anchor.set(0.5);
    this.shipFlame.blendMode = 'add';
    this.shipFlame.tint = 0xffc890;
    this.shipBody = new Sprite(tex.shuttle);
    this.shipBody.anchor.set(0.5);
    this.ship.addChild(this.shipFlame, this.shipBody);
    this.ship.visible = false;
    this.overlay.root.addChildAt(this.ship, 0);
    this.rock = new Sprite(tex.rocks[1]);
    this.rock.anchor.set(0.5);
    this.rock.tint = 0x8a7c96;
    this.rock.visible = false;
    this.overlay.root.addChildAt(this.rock, 0);
  }

  update(f: SpaceFrame, skyH: number, busy: boolean, light: SpaceLight) {
    const { vp, proj, t, motion } = f;
    this.updateShootingStar(f, vp, skyH, busy);
    this.updateShuttle(f, vp, skyH, light);
    this.updateRock(f, vp, skyH);
    const fx = Math.min(1, f.effects);
    this.overlay.update(vp, proj.horizon, t, { x: 0.1, y: -0.1 }, -0.6, { x0: 0.05, x1: 0.32, y0: 0.55, y1: 0.95 }, motion ? 0.5 * fx : 0);
    this.overlay.motes.visible = motion && f.effects > 0.5;
  }

  /**
   * A shuttle lifts off from the far settlements near the horizon, to one side of the timer,
   * and climbs out past the edge of the screen (every 70–140 s of screen time).
   */
  private updateShuttle(f: SpaceFrame, vp: { w: number; h: number }, skyH: number, light: SpaceLight) {
    const tr = this.trip;
    const t = f.t;
    const ship = this.ship;
    if (!f.motion || spaceStage(f.sim) < 9 || f.sim.raid) {
      ship.visible = false;
      return;
    }
    const age = t - tr.t0;
    if (age >= 0 && age < tr.dur) {
      const q = age / tr.dur;
      // slow lift, then it picks up speed as it climbs away
      const e = q * q * (1.6 - 0.6 * q);
      ship.visible = true;
      ship.position.set(tr.x0 + (tr.x1 - tr.x0) * e, tr.y0 + (tr.y1 - tr.y0) * e);
      const k = Math.max(0.5, vp.w / 1440) * (0.45 + 0.75 * e);
      this.shipBody.scale.set(tr.dir * k * 0.42, k * 0.42);
      this.shipBody.rotation = tr.dir * -0.18 * Math.min(1, q * 3);
      this.shipBody.tint = light.tint;
      this.shipFlame.position.set(-tr.dir * 34 * k, 4 * k);
      this.shipFlame.scale.set(k * (0.5 + 0.15 * Math.sin(t * 23)));
      ship.alpha = Math.min(1, q * 6) * Math.min(1, (1 - q) * 5);
      return;
    }
    ship.visible = false;
    if (t < tr.next) return;
    // it keeps to the sides near the horizon, so building work does not hold it back (only a
    // moving camera does, inside the director)
    if (!f.director.request('shuttle', 'ambient', 14)) {
      tr.next = t + 5;
      return;
    }
    const r = rngFor(Math.floor(t * 1000), 41);
    const left = r.chance(0.5);
    tr.t0 = t;
    tr.dur = r.range(10, 14);
    tr.dir = left ? -1 : 1;
    tr.x0 = vp.w * (left ? r.range(0.08, 0.24) : r.range(0.76, 0.92));
    tr.y0 = skyH - vp.h * 0.012;
    tr.x1 = left ? -0.08 * vp.w : 1.08 * vp.w;
    tr.y1 = skyH * r.range(0.2, 0.38);
    tr.next = t + tr.dur + r.range(70, 140) / Math.max(0.5, Math.min(1.5, f.effects));
  }

  /** A far asteroid tumbling slowly across an upper corner (every 90–180 s of screen time). */
  private updateRock(f: SpaceFrame, vp: { w: number; h: number }, skyH: number) {
    const d = this.drift;
    const t = f.t;
    const rock = this.rock;
    if (!f.motion || f.sim.raid) {
      rock.visible = false;
      return;
    }
    const age = t - d.t0;
    if (age >= 0 && age < d.dur) {
      const q = age / d.dur;
      rock.visible = true;
      rock.position.set(d.x0 + (d.x1 - d.x0) * q, d.y0 + (d.y1 - d.y0) * q);
      rock.rotation = age * d.spin;
      rock.scale.set(Math.max(0.05, vp.w / 14000));
      rock.alpha = Math.min(1, q * 6, (1 - q) * 6) * 0.85;
      return;
    }
    rock.visible = false;
    if (t < d.next) return;
    if (!f.director.request('asteroid', 'ambient', 28)) {
      d.next = t + 6;
      return;
    }
    const r = rngFor(Math.floor(t * 1000), 43);
    // on the side away from the gas giant (top left on wide screens, top right on tall ones)
    const left = vp.w <= vp.h;
    d.t0 = t;
    d.dur = r.range(22, 32);
    d.spin = r.range(-0.4, 0.4);
    d.x0 = vp.w * (left ? r.range(0.02, 0.08) : r.range(0.92, 0.98));
    d.x1 = vp.w * (left ? r.range(0.26, 0.31) : r.range(0.69, 0.74));
    d.y0 = skyH * r.range(0.05, 0.3);
    d.y1 = d.y0 + skyH * r.range(-0.05, 0.08);
    d.next = t + d.dur + r.range(90, 180);
  }

  /** A soft streak every 45–120 s of visible screen time, never over the timer or a big build. */
  private updateShootingStar(f: SpaceFrame, vp: { w: number; h: number }, skyH: number, busy: boolean) {
    const st = this.star;
    const t = f.t;
    const m = this.meteor;
    if (!f.motion || f.sim.raid) {
      m.visible = false;
      return;
    }
    const age = t - st.t0;
    if (age >= 0 && age < st.dur) {
      const q = age / st.dur;
      m.visible = true;
      m.position.set(st.x0 + st.dx * q, st.y0 + st.dy * q);
      m.rotation = Math.atan2(st.dy, st.dx);
      m.scale.set(5 * Math.max(0.6, vp.w / 1440), 0.3);
      m.alpha = Math.sin(q * Math.PI) * 0.75;
      return;
    }
    m.visible = false;
    if (t < st.next) return;
    // wait while a big build or a camera move holds attention (the director decides)
    if (!f.director.request('shootingStar', 'fx', EFFECTS.shootingStar.durS[1], busy)) {
      st.next = t + 5;
      return;
    }
    const r = rngFor(Math.floor(t * 1000), 31);
    const left = r.chance(0.5);
    st.t0 = t;
    st.dur = r.range(EFFECTS.shootingStar.durS[0], EFFECTS.shootingStar.durS[1]);
    // start in an upper corner and travel outward, away from the timer in the middle
    st.x0 = vp.w * (left ? r.range(0.12, 0.3) : r.range(0.7, 0.88));
    st.y0 = skyH * r.range(0.08, 0.3);
    st.dx = vp.w * (left ? -1 : 1) * r.range(0.1, 0.16);
    st.dy = skyH * r.range(0.06, 0.12);
    const gap = r.range(EFFECTS.shootingStar.minS, EFFECTS.shootingStar.maxS) / Math.max(0.5, Math.min(1.5, f.effects));
    st.next = t + st.dur + gap;
  }
}
