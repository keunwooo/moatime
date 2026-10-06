/**
 * The planet's weather and its rare sights, read from the world timeline (`env.event`):
 *
 *  - dust storm: an ochre veil that thickens toward the ground, wind-blown dust, the far hills
 *    fading; the drones keep working
 *  - electrical storm: a dark band of cloud on the horizon with faint flickers (dimmer than the
 *    forest's lightning)
 *  - solar flare: the sky reddens over 40 seconds (never a flash) and a shield dome goes up over
 *    the outpost; the drones take shelter (the simulation does that)
 *  - aurora: green and rose curtains swaying high in the night sky
 *  - meteor shower, comet, a big ship, a far fleet: high in the sky, above the timer
 *  - colony ship (stage 8+): comes down near the newest outpost, waits, lifts off
 *  - satellite (stage 9+): a small rocket goes up from beside the depot
 *
 * Every element is a pure function of W within its event (a reload shows the same moment).
 * Nothing crosses the timer: sky sights keep to the band between the top bar and the timer, or
 * to the sides.
 */

import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { innerOfUnit } from '../../../sim/layout';
import { spaceStage } from '../../../sim/space';
import { RULES_UNITS_PER_CLUSTER as UPC } from '../../../sim/units';
import { eventShown } from '../../../world/events';
import type { WorldEvent } from '../../../world/timeline';
import type { Card } from '../../diorama';
import { clearIfDrawn, ownGroup } from '../../gfx';
import { num } from '../../paint/color';
import { S } from '../palette';
import type { SpaceCtx, SpaceFrame } from './types';
import { ease } from './types';

const u01 = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 0 → 1 over `inS` seconds from the start, back to 0 over `outS` before the end. */
const envelope = (e: WorldEvent, W: number, inS: number, outS: number) => smooth(e.t0, e.t0 + inS * 1000, W) * (1 - smooth(e.t1 - outS * 1000, e.t1, W));

export class PlanetEvents {
  /** Sky layer (behind the hills): aurora, storm band, flickers, meteors, comet, ships. */
  readonly sky = new Container();
  /** Screen overlay over the land: dust veil and streaks, the flare's reddening. */
  readonly front = new Container();
  /** Far haze laid over the hills during a dust storm (added after the hills). */
  readonly hillVeil: Sprite;
  private ctx: SpaceCtx;
  private aurora: TilingSprite[] = [];
  private storm: TilingSprite;
  private flicker: Sprite;
  private bolt = ownGroup(new Graphics());
  private meteors: Sprite[] = [];
  private comet: Sprite;
  private ship: Sprite;
  private fleet: Sprite[] = [];
  private dustVeil: Sprite;
  private dustStreaks: TilingSprite;
  private flareTint: Sprite;
  private shield: Card;
  /** Redrawn every frame while up (shimmer), so it has its own render group. */
  private shieldG = ownGroup(new Graphics());
  private lander: Card;
  private landerGlow: Sprite;
  private rocket: Card;
  private rocketFlame: Sprite;
  private trail: { card: Card; sprite: Sprite }[] = [];

  constructor(ctx: SpaceCtx) {
    this.ctx = ctx;
    const tex = ctx.tex;
    for (const tint of [0x7de0b0, 0xe090c0]) {
      const a = new TilingSprite({ texture: tex.aurora, width: 100, height: 100 });
      a.tint = tint;
      a.blendMode = 'add';
      a.visible = false;
      this.aurora.push(a);
      this.sky.addChild(a);
    }
    this.storm = new TilingSprite({ texture: tex.stormBand, width: 100, height: 100 });
    this.storm.tint = 0x3a3058;
    this.storm.visible = false;
    this.flicker = new Sprite(tex.softLight);
    this.flicker.anchor.set(0.5);
    this.flicker.blendMode = 'add';
    this.flicker.tint = 0xd8e8ff;
    this.flicker.visible = false;
    this.sky.addChild(this.storm, this.flicker, this.bolt);
    for (let i = 0; i < 8; i++) {
      const m = new Sprite(tex.star);
      m.anchor.set(0.9, 0.5);
      m.blendMode = 'add';
      m.visible = false;
      this.meteors.push(m);
      this.sky.addChild(m);
    }
    this.comet = new Sprite(tex.comet);
    this.comet.anchor.set(0.95, 0.5);
    this.comet.blendMode = 'add';
    this.comet.visible = false;
    this.ship = new Sprite(tex.bigShip);
    this.ship.anchor.set(0.5);
    this.ship.visible = false;
    this.sky.addChild(this.comet, this.ship);
    for (let i = 0; i < 7; i++) {
      const c = new Sprite(tex.fleetCraft);
      c.anchor.set(0.5);
      c.visible = false;
      this.fleet.push(c);
      this.sky.addChild(c);
    }
    this.hillVeil = new Sprite(tex.horizonGlow);
    this.hillVeil.anchor.set(0, 1);
    this.hillVeil.tint = 0xc89a78;
    this.hillVeil.visible = false;

    this.dustVeil = new Sprite(tex.horizonGlow);
    this.dustVeil.anchor.set(0, 1);
    this.dustVeil.tint = 0xc89a78;
    this.dustVeil.visible = false;
    this.dustStreaks = new TilingSprite({ texture: tex.dustStreaks, width: 100, height: 100 });
    this.dustStreaks.tint = 0xe6c09c;
    this.dustStreaks.visible = false;
    // the horizon glow texture turned upside down: strongest at the top of the sky
    this.flareTint = new Sprite(tex.horizonGlow);
    this.flareTint.anchor.set(0, 0);
    this.flareTint.tint = 0xff7a5a;
    this.flareTint.visible = false;
    this.front.addChild(this.dustVeil, this.dustStreaks, this.flareTint);

    // world cards: the shield dome, the colony ship, the satellite rocket and its trail
    const sobj = new Container();
    sobj.addChild(this.shieldG);
    this.shield = { obj: sobj, X: 0, Y: 0, Z: 0, radius: 600, height: 300, hidden: true, order: 7 };
    ctx.layer.add(this.shield);
    const lobj = new Container();
    const ls = new Sprite(tex.colonyShip);
    ls.anchor.set(0.5, 184 / 192);
    ls.scale.set(150 / tex.colonyShip.width);
    this.landerGlow = new Sprite(tex.softLight);
    this.landerGlow.anchor.set(0.5);
    this.landerGlow.blendMode = 'add';
    this.landerGlow.tint = 0xffc890;
    this.landerGlow.position.set(0, -20);
    lobj.addChild(this.landerGlow, ls);
    this.lander = { obj: lobj, X: 0, Y: 0, Z: 0, radius: 200, height: 2000, hidden: true };
    ctx.layer.add(this.lander);
    const robj = new Container();
    const rs = new Sprite(tex.rocket);
    rs.anchor.set(0.5, 124 / 128);
    rs.scale.set(40 / tex.rocket.width);
    this.rocketFlame = new Sprite(tex.windowGlow);
    this.rocketFlame.anchor.set(0.5, 0.2);
    this.rocketFlame.blendMode = 'add';
    this.rocketFlame.tint = 0xffb070;
    robj.addChild(this.rocketFlame, rs);
    this.rocket = { obj: robj, X: 0, Y: 0, Z: 0, radius: 80, height: 4000, hidden: true };
    ctx.layer.add(this.rocket);
    for (let i = 0; i < 10; i++) {
      const obj = new Container();
      const sp = new Sprite(tex.dust);
      sp.anchor.set(0.5);
      sp.tint = 0xe8e0e8;
      obj.addChild(sp);
      const card: Card = { obj, X: 0, Y: 0, Z: 0, radius: 60, height: 4000, hidden: true };
      ctx.layer.add(card);
      this.trail.push({ card, sprite: sp });
    }
  }

  update(f: SpaceFrame, skyH: number) {
    const { env, W, vp, t, motion, sim } = f;
    const e = env.event && eventShown(env.event.kind, spaceStage(sim)) ? env.event : null;
    const kind = e ? e.kind : '';
    const layer = this.ctx.layer;
    const hide = () => {
      for (const a of this.aurora) a.visible = false;
      this.storm.visible = this.flicker.visible = false;
      clearIfDrawn(this.bolt);
      for (const m of this.meteors) m.visible = false;
      this.comet.visible = this.ship.visible = false;
      for (const c of this.fleet) c.visible = false;
      this.hillVeil.visible = this.dustVeil.visible = this.dustStreaks.visible = this.flareTint.visible = false;
      this.shield.hidden = this.lander.hidden = this.rocket.hidden = true;
      for (const p of this.trail) p.card.hidden = true;
    };
    hide();
    if (!e) return;

    if (kind === 'dustStorm') {
      const k = envelope(e, W, 30, 30);
      this.hillVeil.visible = true;
      this.hillVeil.position.set(0, skyH + vp.h * 0.06);
      this.hillVeil.width = vp.w;
      this.hillVeil.height = skyH * 0.7;
      this.hillVeil.alpha = 0.75 * k;
      this.dustVeil.visible = true;
      this.dustVeil.position.set(0, vp.h);
      this.dustVeil.width = vp.w;
      this.dustVeil.height = vp.h * 0.85;
      this.dustVeil.alpha = 0.42 * k;
      if (motion) {
        // the blown dust keeps to the land, below the timer
        const top = Math.max(skyH - vp.h * 0.04, vp.h * 0.64);
        this.dustStreaks.visible = true;
        this.dustStreaks.width = vp.w;
        this.dustStreaks.height = vp.h - top;
        this.dustStreaks.position.set(0, top);
        this.dustStreaks.tileScale.set(Math.max(1, vp.w / 900));
        this.dustStreaks.tilePosition.set(t * 260, t * 70);
        this.dustStreaks.alpha = 0.32 * k * Math.min(1, f.effects);
      }
    } else if (kind === 'elecStorm') {
      const k = envelope(e, W, 25, 25);
      this.storm.visible = true;
      const bandH = Math.max(60, vp.h * 0.16);
      this.storm.width = vp.w;
      this.storm.height = bandH;
      this.storm.position.set(0, skyH - bandH * 0.85);
      this.storm.tileScale.set(bandH / 128);
      this.storm.tilePosition.x = motion ? t * 4 : 0;
      this.storm.alpha = 0.75 * k;
      if (motion) {
        // a faint flicker every few seconds, to one side of the timer
        const slot = Math.floor((W - e.t0) / 5000);
        const at = e.t0 + slot * 5000 + u01(e.seed, slot) * 3000;
        const q = (W - at) / 350;
        if (q >= 0 && q < 1 && k > 0.3) {
          const left = u01(e.seed, slot + 99) < 0.5;
          const x = vp.w * (left ? 0.08 + u01(e.seed, slot + 7) * 0.2 : 0.72 + u01(e.seed, slot + 7) * 0.2);
          const y = skyH - bandH * 0.5;
          const a = Math.sin(q * Math.PI);
          this.flicker.visible = true;
          this.flicker.position.set(x, y);
          this.flicker.scale.set((bandH * 2.2) / 256);
          this.flicker.alpha = 0.32 * a;
          const g = this.bolt;
          let bx = x;
          let by = y - bandH * 0.3;
          g.moveTo(bx, by);
          for (let s = 0; s < 4; s++) {
            bx += (u01(e.seed, slot * 10 + s) - 0.5) * 30;
            by += bandH * 0.16;
            g.lineTo(bx, by);
          }
          g.stroke({ color: 0xe8f0ff, width: 1.4, alpha: 0.7 * a });
        }
      }
    } else if (kind === 'solarFlare') {
      // the sky reddens slowly (never a flash) and the shield dome goes up
      const k = smooth(e.t0, e.t0 + 40_000, W) * (1 - smooth(e.t1 - 20_000, e.t1, W));
      this.flareTint.visible = true;
      const th = skyH * 1.1;
      this.flareTint.scale.set(vp.w / this.flareTint.texture.width, -th / this.flareTint.texture.height);
      this.flareTint.position.set(0, th);
      this.flareTint.alpha = 0.2 * k;
      const c = sim.cluster;
      const D = this.ctx.node(`d${c}`);
      const inner = innerOfUnit(c * UPC);
      const kx = this.ctx.geom.aspect === 'tall' ? 0.62 : 1;
      const dome = smooth(e.t0 + 4000, e.t0 + 14_000, W) * (1 - smooth(e.t1 - 12_000, e.t1, W));
      if (dome > 0) {
        this.shield.hidden = false;
        this.shield.X = D.x - inner * 80 * kx;
        layer.move(this.shield, D.z + 120);
        const g = this.shieldG;
        g.clear();
        // a low dome over the depot and the nearest buildings (it must stay under the timer)
        const rx = 300 * kx * dome;
        const ry = 105 * dome;
        // the upper half of an ellipse standing on the ground
        const pts: number[] = [];
        for (let i = 0; i <= 32; i++) {
          const a = (i / 32) * Math.PI;
          pts.push(Math.cos(a) * rx, -Math.sin(a) * ry);
        }
        g.poly(pts).fill({ color: num(S.teal), alpha: 0.16 });
        g.poly(pts, false).stroke({ color: 0xbfeff0, width: 2.6, alpha: 0.55 });
        // hexagon-ish panel lines that shimmer
        for (let i = 1; i < 5; i++) {
          const a = Math.PI + (i / 5) * Math.PI;
          g.moveTo(Math.cos(a) * rx, 0).quadraticCurveTo(Math.cos(a) * rx * 0.6, -ry * 0.9, 0, -ry).stroke({ color: num(S.teal), width: 1, alpha: 0.18 + (motion ? 0.08 * Math.sin(t * 2 + i) : 0) });
        }
      }
    } else if (kind === 'aurora') {
      const k = envelope(e, W, 60, 60) * Math.min(1, env.day.stars * 1.2);
      this.aurora.forEach((a, i) => {
        a.visible = k > 0.01;
        a.width = vp.w;
        a.height = skyH * 0.32;
        a.position.set(0, skyH * (0.02 + i * 0.05));
        a.tileScale.set(Math.max(1, vp.w / 1200), (skyH * 0.32) / 256);
        a.tilePosition.x = (motion ? t * (6 + i * 3) : 0) + i * 180;
        a.skew.x = motion ? Math.sin(t * 0.18 + i) * 0.06 : 0;
        a.alpha = (i === 0 ? 0.42 : 0.28) * k;
      });
    } else if (kind === 'meteorShower') {
      const k = envelope(e, W, 10, 15);
      if (motion) {
        this.meteors.forEach((m, i) => {
          // each meteor slot fires on its own rhythm through the shower
          const period = 2200 + u01(e.seed, i) * 1800;
          const n = Math.floor((W - e.t0 - i * 300) / period);
          const at = e.t0 + i * 300 + n * period;
          const q = (W - at) / 900;
          if (n < 0 || q < 0 || q > 1) return;
          const left = u01(e.seed, i * 31 + n) < 0.5;
          const x0 = vp.w * (left ? 0.04 + u01(e.seed, i * 17 + n) * 0.24 : 0.72 + u01(e.seed, i * 17 + n) * 0.24);
          const y0 = skyH * (0.06 + u01(e.seed, i * 13 + n) * 0.3);
          const dx = vp.w * (left ? -0.09 : 0.09);
          const dy = skyH * 0.08;
          m.visible = true;
          m.position.set(x0 + dx * q, y0 + dy * q);
          m.rotation = Math.atan2(dy, dx);
          m.scale.set(4 * Math.max(0.6, vp.w / 1440), 0.26);
          m.alpha = Math.sin(q * Math.PI) * 0.7 * k;
        });
      }
    } else if (kind === 'comet') {
      const q = (W - e.t0) / (e.t1 - e.t0);
      const ltr = u01(e.seed, 1) < 0.5;
      const k = Math.min(1, q * 8, (1 - q) * 8);
      this.comet.visible = true;
      const x = ltr ? -0.1 * vp.w + q * 1.2 * vp.w : 1.1 * vp.w - q * 1.2 * vp.w;
      const y = vp.h * (0.135 + 0.02 * Math.sin(q * Math.PI));
      this.comet.position.set(x, y);
      this.comet.scale.set(((ltr ? 1 : -1) * 0.22 * vp.w) / 512, (0.22 * vp.w) / 512);
      this.comet.rotation = ltr ? 0.04 : -0.04;
      this.comet.alpha = 0.85 * k;
    } else if (kind === 'bigShip') {
      const q = (W - e.t0) / (e.t1 - e.t0);
      const ltr = u01(e.seed, 2) < 0.5;
      this.ship.visible = true;
      const w = Math.max(220, vp.w * 0.26);
      const x = ltr ? -w + q * (vp.w + 2 * w) : vp.w + w - q * (vp.w + 2 * w);
      this.ship.position.set(x, vp.h * 0.155);
      this.ship.scale.set(((ltr ? 1 : -1) * w) / 640, w / 640);
      this.ship.alpha = Math.min(1, q * 10, (1 - q) * 10) * 0.95;
      this.ship.tint = env.day.stars > 0.6 ? 0xb8b4d0 : 0xffffff;
    } else if (kind === 'fleet') {
      const q = (W - e.t0) / (e.t1 - e.t0);
      const ltr = u01(e.seed, 3) < 0.5;
      const n = 5 + Math.floor(u01(e.seed, 4) * 3);
      this.fleet.forEach((c, i) => {
        if (i >= n) return;
        c.visible = true;
        const row = Math.ceil(i / 2);
        const side = i % 2 ? 1 : -1;
        const lead = (ltr ? 1 : -1) * -row * 34;
        const x = (ltr ? -0.1 * vp.w + q * 1.2 * vp.w : 1.1 * vp.w - q * 1.2 * vp.w) + lead;
        c.position.set(x, vp.h * 0.13 + side * row * 9);
        const s = Math.max(0.28, vp.w / 3600);
        c.scale.set((ltr ? 1 : -1) * s, s);
        c.alpha = Math.min(1, q * 10, (1 - q) * 10) * 0.8;
      });
    } else if (kind === 'colonyShip') {
      const c = sim.cluster;
      const D = this.ctx.node(`d${c}`);
      const inner = innerOfUnit(c * UPC);
      const kx = this.ctx.geom.aspect === 'tall' ? 0.62 : 1;
      const dur = e.t1 - e.t0;
      const down = smooth(e.t0, e.t0 + 35_000, W);
      const up = smooth(e.t1 - 35_000, e.t1, W);
      const y = 900 * (1 - ease(down)) + 1100 * ease(up) * up;
      this.lander.hidden = false;
      // it comes down behind the parade ground, inside the working view
      this.lander.X = D.x + inner * 300 * kx;
      this.lander.Y = y;
      this.lander.alpha = Math.min(1, (W - e.t0) / 3000, (e.t1 - W) / 3000);
      layer.move(this.lander, D.z + 230);
      const burning = (W - e.t0 < 36_000) || (W > e.t1 - 36_000);
      this.landerGlow.visible = burning;
      this.landerGlow.alpha = motion ? 0.6 + 0.2 * Math.sin(t * 20) : 0.7;
      this.landerGlow.scale.set(0.5);
      // dust kicked up at touchdown and take-off
      if (motion) {
        const touch = Math.min(Math.abs(W - (e.t0 + 35_000)), Math.abs(W - (e.t1 - 35_000)));
        if (touch < 6000) {
          this.trail.forEach((p, i) => {
            const q = ((t * 0.6 + i / this.trail.length) % 1 + 1) % 1;
            p.card.hidden = false;
            p.card.X = this.lander.X + (i % 2 ? 1 : -1) * (40 + q * 90);
            p.card.Y = 6 + q * 30;
            p.sprite.tint = 0xd8b8a0;
            p.sprite.alpha = (1 - q) * 0.5 * (1 - touch / 6000);
            p.sprite.scale.set(0.5 + q);
            layer.move(p.card, this.lander.Z - 1);
          });
        }
      }
      void dur;
    } else if (kind === 'satellite') {
      const c = sim.cluster;
      const D = this.ctx.node(`d${c}`);
      const inner = innerOfUnit(c * UPC);
      const kx = this.ctx.geom.aspect === 'tall' ? 0.62 : 1;
      const launch = e.t0 + 20_000;
      const k = Math.max(0, (W - launch) / 40_000);
      const y = k <= 0 ? 0 : 2400 * k * k;
      this.rocket.hidden = k > 1.05;
      this.rocket.X = D.x + inner * 330 * kx;
      this.rocket.Y = y;
      this.rocket.alpha = Math.min(1, (W - e.t0) / 2000) * (1 - smooth(0.85, 1.05, k));
      layer.move(this.rocket, D.z + 60);
      this.rocketFlame.visible = k > 0 && k < 1.05;
      this.rocketFlame.scale.set(motion ? 0.7 + 0.15 * Math.sin(t * 25) : 0.75);
      // the exhaust trail it leaves standing in the air
      if (k > 0) {
        this.trail.forEach((p, i) => {
          const hk = ((i + 1) / this.trail.length) * Math.min(1, k);
          p.card.hidden = false;
          p.card.X = this.rocket.X + Math.sin(i * 1.7) * 6;
          p.card.Y = 2400 * hk * hk;
          p.sprite.tint = 0xe8e0e8;
          p.sprite.alpha = 0.45 * (1 - Math.max(0, (W - (launch + i * 3000)) / 50_000));
          p.sprite.scale.set(0.6 + i * 0.05);
          layer.move(p.card, this.rocket.Z + 1);
        });
      }
    }
  }

  destroy() {
    for (const c of [this.shield, this.lander, this.rocket, ...this.trail.map((p) => p.card)]) this.ctx.layer.remove(c);
  }
}
