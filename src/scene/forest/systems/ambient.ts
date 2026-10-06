/**
 * Ambient effects: leaves drifting down from real crowns, light shafts and floating motes,
 * and the completion glow. Decoration only (ambient clock).
 */

import { Container, Sprite } from 'pixi.js';
import { rngFor } from '../../../core/rng';
import { forestUnitProgress } from '../../../sim/forest';
import type { SeasonMix } from '../../../world/season';
import type { Card } from '../../diorama';
import { num } from '../../paint/color';
import { Overlay, smooth } from '../../systems';
import { F } from '../palette';
import type { ForestZone } from '../zone';
import type { Wildlife } from './wildlife';
import type { ForestLight } from './light';
import type { ForestCtx, ForestFrame, KeeperWork } from './types';

interface FallingLeaf {
  sprite: Sprite;
  card: Card;
  t0: number;
  x0: number;
  y0: number;
  x1: number;
  z: number;
  sway: number;
  spin: number;
  dur: number;
}

const MAX_LEAVES = 12;
const MAX_FIREFLIES = 18;
/** During a firefly swarm (a rare summer-night event, stage 4+) the pool grows to this. */
const SWARM = 64;

const h01 = (i: number, k: number) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

export class AmbientEffects {
  readonly overlay: Overlay;
  private ctx: ForestCtx;
  private glow: Sprite;
  private leaves: FallingLeaf[] = [];
  private nextLeafAt = 6;
  private celebrate0 = -1;
  private realT = 0;
  /** Lights that must not take the night tint: fireflies and the keeper's lantern (screen space). */
  readonly glowLayer = new Container();
  private fireflies: Sprite[] = [];
  private lantern: Sprite;

  constructor(ctx: ForestCtx, lowPower: boolean, wildlife: Wildlife) {
    this.ctx = ctx;
    const tex = ctx.tex;
    this.overlay = new Overlay(tex.paper, 0.17);
    this.overlay.addRays(tex.ray, 5, 0.075, num(F.sun));
    this.overlay.setMotes(tex.mote, lowPower ? 10 : 18);
    this.glow = new Sprite(tex.sunGlow);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.overlay.root.addChildAt(this.glow, 1);
    for (let i = 0; i < MAX_LEAVES; i++) {
      const sprite = new Sprite(tex.fall[i % tex.fall.length]);
      sprite.anchor.set(0.5, 0.6);
      const card = wildlife.actorCard(sprite, 7, 20);
      this.leaves.push({ sprite, card, t0: -100, x0: 0, y0: 0, x1: 0, z: 0, sway: 0, spin: 0, dur: 7 });
    }
    for (let i = 0; i < SWARM; i++) {
      const s = new Sprite(tex.firefly);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.glowLayer.addChild(s);
      this.fireflies.push(s);
    }
    this.lantern = new Sprite(tex.lantern);
    this.lantern.anchor.set(0.5);
    this.lantern.blendMode = 'add';
    this.lantern.visible = false;
    this.glowLayer.addChild(this.lantern);
  }

  resetWorld() {
    for (const l of this.leaves) l.t0 = -100;
  }

  tick(realDt: number) {
    this.realT += realDt;
  }

  celebrate() {
    this.celebrate0 = this.realT;
  }

  /** Leaves drift down from real crown positions, more in autumn, none in winter. */
  updateLeaves(f: ForestFrame, zone: ForestZone | undefined, season: SeasonMix) {
    const { t, motion } = f;
    for (const l of this.leaves) {
      const e = t - l.t0;
      if (e < 0 || e > l.dur + 4 || !motion) {
        l.card.hidden = true;
        continue;
      }
      const q = Math.min(1, e / l.dur);
      l.card.hidden = false;
      l.card.X = l.x0 + (l.x1 - l.x0) * q + Math.sin(e * 1.4) * l.sway * (1 - q);
      l.card.Y = Math.max(0.5, l.y0 * (1 - q));
      l.sprite.rotation = q < 1 ? Math.sin(e * l.spin) * 1.1 : 1.3;
      l.sprite.scale.set(8 / 64, (q < 1 ? 8 : 4) / 64);
      // landed leaves fade into the ground layer
      l.card.alpha = smooth(0, 0.6, e) * (1 - smooth(l.dur + 0.5, l.dur + 4, e));
    }
    if (!motion || !zone || t < this.nextLeafAt) return;
    const sw = season.w;
    const wind = f.env.weather.wind;
    const gust = 1 + 2.2 * Math.max(0, wind - 0.5);
    // leaves per second: many in autumn (more in gusts), a few in summer, petals in spring wind
    const rate = (sw[0] * (0.04 + 0.1 * wind) + sw[1] * 0.05 + sw[2] * 0.3) * gust;
    const r = rngFor(Math.floor(t * 10), 99);
    this.nextLeafAt = t + (rate > 0.005 ? r.range(0.6, 1.4) / (rate * Math.min(1.5, f.effects)) : 20);
    if (rate <= 0.005) return;
    const trees = zone.matureTrees().filter((c) => c.card.obj.visible);
    if (!trees.length) return;
    // falling leaves share the ambient particle budget
    const budget = Math.min(MAX_LEAVES, f.director.particles('ambient'));
    let falling = 0;
    for (const l of this.leaves) if (t - l.t0 <= l.dur + 4) falling++;
    if (falling >= budget) return;
    const slot = this.leaves.find((l) => t - l.t0 > l.dur + 4);
    if (!slot) return;
    const host = trees[Math.floor(r.next() * trees.length)];
    const pt = host.tree.crownLeafPoint(Math.floor(r.next() * 20));
    const s = host.tree.shape;
    // spring blossom trees shed petals that ride the wind further
    const petal = season.id === 0 && host.tree.sp.name === 'blossom';
    const drift = (wind - 0.3) * (petal ? 260 : 120);
    slot.t0 = t;
    slot.dur = r.range(5.5, 8) * (petal ? 1.3 : 1);
    slot.x0 = host.card.X + pt.x;
    slot.y0 = Math.max(20, pt.y);
    slot.x1 = host.card.X + r.range(-s.crownW * 0.5, s.crownW * 0.5) + drift;
    slot.z = host.card.Z - r.range(4, 30);
    slot.sway = r.range(10, 24);
    slot.spin = r.range(2, 4);
    slot.sprite.texture = petal ? this.ctx.tex.petal : this.ctx.tex.fall[Math.floor(r.next() * this.ctx.tex.fall.length)];
    this.ctx.layer.move(slot.card, slot.z);
  }

  /** Light shafts, motes and the completion glow (after the diorama is projected). */
  updateLight(f: ForestFrame, light: ForestLight) {
    const { W, vp, proj, t, motion, sim } = f;
    let dim = 1;
    if (this.celebrate0 >= 0) {
      const e = this.realT - this.celebrate0;
      const env = smooth(0, 2.2, e) * (1 - smooth(4, 8.5, e));
      this.glow.alpha = env * 0.5;
      this.glow.position.set(vp.w * 0.22, vp.h * 0.28);
      this.glow.scale.set((vp.w * 1.5) / 256);
      dim = 1 + env * 1.4;
      if (e > 9) this.celebrate0 = -1;
    } else this.glow.alpha = 0;
    // during a key moment of work, background light is calmer
    const sw = f.season.w;
    const tr = sim.tree;
    const g0 = forestUnitProgress(sim, tr.unit, W) ?? 0;
    const keyWork = tr.phase >= 1 && g0 > 0.006 && g0 < 0.08;
    const k = (motion ? dim : dim * 0.6) * (keyWork ? 0.7 : 1) * (0.85 + 0.15 * sw[1] - 0.25 * sw[3]);
    // shafts fan out from where the sun is, pointing into the scene, only in clear sunshine
    const sun = f.env.day.sun;
    const sx = 0.5 + sun.az * 0.46;
    const sy = (proj.horizon - sun.elev * (proj.horizon - vp.h * 0.14)) / vp.h;
    const angle = -(0.5 - sx) * 1.25;
    // never straight down through the timer: shafts only while the sun is off to one side
    const side = Math.min(1, Math.max(0, (Math.abs(sun.az) - 0.28) / 0.25));
    this.overlay.update(vp, proj.horizon, t, { x: sx, y: sy - 0.04 }, angle, { x0: 0.03, x1: 0.34, y0: 0.12, y1: 0.86 }, k * Math.max(0, light.rays) * side * 1.15);
    this.overlay.motes.visible = motion && f.effects > 0.4 && light.night < 0.5;
  }

  /** Fireflies over the clearing on summer nights, and the keeper's lantern after dark. */
  updateGlow(f: ForestFrame, work: KeeperWork, light: ForestLight) {
    const { proj, t, motion, sim, env } = f;
    const sw = env.season.w;
    const night = light.night;
    const season = sw[1] + sw[0] * 0.35 + sw[2] * 0.25;
    let strength = night * season * (1 - Math.min(1, env.weather.rain * 1.5)) * (1 - env.weather.fog * 0.5);
    // a swarm: many more, gathering in a slow ring over the clearing
    const ev = env.event;
    const swarm = ev && ev.kind === 'fireflies' && f.stage >= 4 ? Math.min(1, (f.W - ev.t0) / 40_000, (ev.t1 - f.W) / 40_000) : 0;
    strength = Math.max(strength, swarm * night);
    const cap = Math.round(MAX_FIREFLIES + (SWARM - MAX_FIREFLIES) * swarm);
    const n = motion ? Math.min(cap, Math.round(cap * strength * Math.min(1.3, f.effects))) : 0;
    const c = sim.cluster;
    const anchors = [this.ctx.node('w' + c), this.ctx.node('b' + c), this.ctx.node('k' + c), this.ctx.node('u' + sim.tree.unit)];
    const centre = this.ctx.node('b' + c);
    this.fireflies.forEach((s, i) => {
      if (i >= n) {
        s.visible = false;
        return;
      }
      const a = anchors[i % anchors.length];
      const ph = h01(i, 3) * 6.28;
      let X = a.x + (h01(i, 1) - 0.5) * 220 + Math.sin(t * 0.23 + ph) * 18;
      let Z = a.z + (h01(i, 2) - 0.5) * 120;
      let Y = 10 + h01(i, 4) * 34 + Math.sin(t * 0.41 + ph * 2) * 7;
      if (i >= MAX_FIREFLIES || swarm > 0) {
        const ang = ph + t * (0.08 + h01(i, 6) * 0.06);
        const rad = 90 + h01(i, 7) * 160;
        const sx = centre.x + Math.cos(ang) * rad;
        const sz = centre.z + 40 + Math.sin(ang) * rad * 0.5;
        const sy = 20 + h01(i, 8) * 60 + Math.sin(t * 0.5 + ph) * 10;
        X = X + (sx - X) * swarm;
        Z = Z + (sz - Z) * swarm;
        Y = Y + (sy - Y) * swarm;
      }
      const sc = proj.scale(Z);
      if (sc <= 0) {
        s.visible = false;
        return;
      }
      s.visible = true;
      s.position.set(proj.sx(X, Z), proj.sy(Y, Z));
      s.scale.set(Math.max(0.12, sc * 0.22));
      const pulse = Math.max(0, Math.sin(t * (0.7 + h01(i, 5) * 0.5) + ph * 3));
      s.alpha = Math.min(1, strength * 1.4) * (0.25 + 0.75 * pulse * pulse);
    });
    // the keeper carries a small lantern once it is dark
    const lamp = night > 0.25;
    this.lantern.visible = lamp;
    if (lamp) {
      const Z = work.st ? work.kz : this.ctx.node(sim.keeper.at).z;
      const X = (work.st ? work.kx : this.ctx.node(sim.keeper.at).x) + 7;
      const Y = (work.st ? work.ky : 0) + 21;
      const sc = proj.scale(Z);
      this.lantern.visible = sc > 0;
      this.lantern.position.set(proj.sx(X, Z), proj.sy(Y, Z));
      this.lantern.scale.set(sc * 0.55);
      this.lantern.alpha = Math.min(1, (night - 0.25) * 2) * (motion ? 0.82 + 0.06 * Math.sin(t * 7.3) : 0.85);
    }
  }
}
