/**
 * Sights in the sky (session sights and rare sights drawn away from the planets) and the small
 * ambient life of the sky: a shooting star now and then, a far asteroid drifting by. They pass in
 * the band above the timer or beside it, never across it, and brighten slowly.
 */

import { Container, Sprite } from 'pixi.js';
import { firstGen } from '../../../sim/cosmos';
import { easeOut, env, eventIs, hash01, lerp, px, sm, vis, type CosmosFrame } from '../frame';
import { N } from '../palette';
import type { CosmosTextures } from '../textures';

export class SkyEvents {
  readonly root = new Container();
  private head: Sprite;
  private tail: Sprite;
  private ion: Sprite;
  private flash: Sprite;
  private ring: Sprite;
  private beams: Sprite[];
  private small: Sprite[];
  private bridge: Sprite;
  private cloud: Sprite;
  private rogue: Sprite;
  private rogueRim: Sprite;
  private meteor: Sprite;
  private meteorAt = -1;
  private meteorNext = 0;
  private meteorPath = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private rock: Sprite;
  private rockAt = -1;
  private rockNext = 40;
  private rockPath = { x0: 0, y0: 0, x1: 0, y1: 0, dur: 150 };

  constructor(tex: CosmosTextures) {
    const sp = (t: CosmosTextures['glow'], add = true, ax = 0.5, ay = 0.5) => {
      const s = new Sprite(t);
      s.anchor.set(ax, ay);
      if (add) s.blendMode = 'add';
      s.visible = false;
      return s;
    };
    this.tail = sp(tex.tail, false, 0, 0.5);
    this.ion = sp(tex.ionTail, true, 0, 0.5);
    this.head = sp(tex.comet);
    this.ring = sp(tex.shell);
    this.flash = sp(tex.glowSoft);
    this.beams = [0, 1].map(() => sp(tex.beam));
    this.small = Array.from({ length: 10 }, () => sp(tex.glow));
    this.bridge = sp(tex.streak);
    this.cloud = sp(tex.blob);
    this.rogue = sp(tex.circle, false);
    this.rogue.tint = 0x0c0a1c;
    this.rogueRim = sp(tex.rim);
    this.rogueRim.tint = N.ember;
    this.meteor = sp(tex.streak, true, 1, 0.5);
    this.rock = sp(tex.inner, false);
    this.root.addChild(this.cloud, this.ring, this.tail, this.ion, this.head, this.flash, ...this.beams, this.bridge, ...this.small, this.rogue, this.rogueRim, this.meteor, this.rock);
  }

  update(f: CosmosFrame) {
    for (const s of [this.head, this.tail, this.ion, this.flash, this.ring, ...this.beams, ...this.small, this.bridge, this.cloud, this.rogue, this.rogueRim]) s.visible = false;
    const { w, h } = f;
    const band = f.L.band;
    const wide = f.aspect === 'wide';
    const home = px(f, f.L.home);

    // comets: a head and two tails that point away from the home star
    const co = eventIs(f, 'comet', 'bigComet');
    if (co) {
      const big = co.kind === 'bigComet';
      const ltr = hash01(co.seed, 1) > 0.5;
      const p = co.p;
      const x = lerp(ltr ? -0.08 : 1.08, ltr ? 1.08 : -0.08, p) * w;
      const y = (band[0] + (band[1] - band[0]) * (0.3 + 0.5 * hash01(co.seed, 2)) + Math.sin(p * Math.PI) * 0.03) * h;
      const sz = w * (big ? 0.018 : 0.01);
      // nearer the star (lower on screen), brighter
      const bright = 0.75 + 0.25 * Math.sin(p * Math.PI);
      const away = Math.atan2(y - home.y, x - home.x);
      this.head.position.set(x, y);
      this.head.width = this.head.height = sz * 1.6;
      vis(this.head, bright * env(0, 0.06, 0.94, 1, p));
      this.tail.position.set(x, y);
      this.tail.rotation = away + (ltr ? -0.15 : 0.15);
      this.tail.width = sz * (big ? 34 : 18);
      this.tail.height = sz * (big ? 5 : 3);
      vis(this.tail, 0.75 * bright * env(0, 0.08, 0.92, 1, p));
      this.ion.position.set(x, y);
      this.ion.rotation = away;
      this.ion.width = sz * (big ? 40 : 22);
      this.ion.height = sz * 1.2;
      vis(this.ion, 0.55 * bright * env(0, 0.08, 0.92, 1, p));
    }

    // a far star ends: one slow swell, then a ring of light
    const sn = eventIs(f, 'farSupernova');
    if (sn) {
      const side = hash01(sn.seed, 3) > 0.5;
      const x = (side ? 0.06 + 0.2 * hash01(sn.seed, 4) : 0.74 + 0.2 * hash01(sn.seed, 4)) * w;
      const y = (wide ? 0.1 + 0.4 * hash01(sn.seed, 5) : band[0] + 0.05 * hash01(sn.seed, 5)) * h;
      const p = sn.p;
      this.flash.position.set(x, y);
      this.flash.width = this.flash.height = w * 0.05;
      this.flash.tint = N.emberCore;
      vis(this.flash, 0.6 * env(0, 0.06, 0.1, 0.3, p));
      this.ring.position.set(x, y);
      this.ring.width = this.ring.height = w * 0.07 * easeOut(p * 1.3);
      this.ring.tint = hash01(sn.seed, 6) > 0.5 ? N.teal : N.rose;
      vis(this.ring, 0.55 * sm(0.04, 0.12, p) * (1 - sm(0.6, 1, p)));
    }

    // a pulsar at the heart of an old remnant: two thin beams turning
    const pu = eventIs(f, 'pulsar');
    if (pu) {
      const dead = firstGen(f.seed).filter((s) => s.death <= f.A);
      const st = dead[Math.floor(hash01(pu.seed, 7) * dead.length)] ?? firstGen(f.seed)[0];
      const p = px(f, f.L.firstGen[st.i]);
      this.beams.forEach((b, i) => {
        b.position.set(p.x, p.y);
        b.rotation = f.t * 0.9 + i * Math.PI;
        b.width = w * 0.13;
        b.height = w * 0.02;
        b.anchor.set(0, 0.5);
        vis(b, 0.8 * Math.sin(pu.p * Math.PI));
      });
      this.flash.position.set(p.x, p.y);
      this.flash.width = this.flash.height = w * 0.03;
      this.flash.tint = N.firstStar;
      vis(this.flash, 0.8 * Math.sin(pu.p * Math.PI));
    }

    // new stars light one after another in a far nebula; or a whole nebula flares into stars
    const ch = eventIs(f, 'starChain', 'starburst');
    if (ch) {
      const burst = ch.kind === 'starburst';
      const neb = hash01(ch.seed, 8) > 0.5 ? f.L.nebulaB : f.L.nebulaA;
      const c = px(f, neb.core);
      const n = burst ? 10 : 5;
      this.small.forEach((s, i) => {
        if (i >= n) return;
        const at = (i + 0.5) / n * 0.7;
        s.position.set(c.x + (hash01(ch.seed, i, 1) - 0.5) * w * 0.12, c.y + (hash01(ch.seed, i, 2) - 0.5) * h * 0.14);
        // each new star lights with a small swell, then settles
        const lit = sm(at, at + 0.06, ch.p);
        const swell = 1 + 1.4 * Math.max(0, 1 - Math.abs(ch.p - at - 0.04) / 0.06);
        s.width = s.height = w * (burst ? 0.011 : 0.014) * swell;
        s.tint = i % 3 ? N.firstStar : N.sun;
        vis(s, lit * (1 - sm(0.85, 1, ch.p) * 0.5));
      });
      if (burst) {
        this.cloud.position.set(c.x, c.y);
        this.cloud.width = this.cloud.height = w * 0.18;
        this.cloud.tint = N.rose;
        this.cloud.blendMode = 'add';
        vis(this.cloud, 0.35 * Math.sin(ch.p * Math.PI));
      }
    }

    // two stars circling with a bridge of gas; or two collapsing into one (kilonova)
    const bi = eventIs(f, 'binaryDance', 'kilonova');
    if (bi) {
      const kilo = bi.kind === 'kilonova';
      const x = (hash01(bi.seed, 9) > 0.5 ? 0.12 : 0.88) * w;
      const y = (wide ? 0.2 + 0.25 * hash01(bi.seed, 10) : band[0] + 0.04) * h;
      const p = bi.p;
      const merge = kilo ? sm(0.05, 0.6, p) : 0;
      const rad = w * 0.022 * (1 - merge);
      const a = f.A / 1000 / (kilo ? 4 - 3.5 * merge : 9) * Math.PI * 2;
      const pair = [this.small[0], this.small[1]];
      pair.forEach((s, i) => {
        const ang = a + i * Math.PI;
        s.position.set(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * 0.5);
        s.width = s.height = w * 0.016;
        s.tint = i ? N.redStar : N.sun;
        vis(s, Math.sin(Math.min(1, p * (kilo ? 1.6 : 1)) * Math.PI * (kilo ? 0.5 : 1)) * (kilo ? 1 - sm(0.58, 0.62, p) : 1));
      });
      if (!kilo) {
        this.bridge.position.set(pair[0].x, pair[0].y);
        this.bridge.anchor.set(0, 0.5);
        this.bridge.rotation = Math.atan2(pair[1].y - pair[0].y, pair[1].x - pair[0].x);
        this.bridge.width = Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
        this.bridge.height = w * 0.008;
        this.bridge.tint = N.rose;
        vis(this.bridge, 0.75 * Math.sin(p * Math.PI));
      } else {
        this.flash.position.set(x, y);
        this.flash.width = this.flash.height = w * 0.05;
        this.flash.tint = N.gold;
        vis(this.flash, 0.6 * env(0.6, 0.66, 0.68, 0.85, p));
        this.cloud.position.set(x, y);
        this.cloud.width = this.cloud.height = w * 0.1 * easeOut((p - 0.6) / 0.4);
        this.cloud.tint = N.gold;
        this.cloud.blendMode = 'add';
        vis(this.cloud, p < 0.6 ? 0 : 0.45 * (1 - sm(0.85, 1, p)));
      }
    }

    // a dark rogue planet crosses the far stars
    const ro = eventIs(f, 'roguePlanet');
    if (ro) {
      const y = (wide ? 0.08 + 0.12 * hash01(ro.seed, 11) : band[0] + 0.02) * h;
      const x = lerp(-0.05, 1.05, ro.p) * w;
      const r = w * 0.016;
      this.rogue.position.set(x, y);
      this.rogue.width = this.rogue.height = r * 2;
      vis(this.rogue, 0.92 * env(0, 0.05, 0.95, 1, ro.p));
      this.rogueRim.position.set(x, y);
      this.rogueRim.width = this.rogueRim.height = r * 2.25;
      vis(this.rogueRim, 0.3 * env(0, 0.05, 0.95, 1, ro.p));
    }

    this.ambient(f);
  }

  /** A shooting star now and then, a far rock drifting by: on the ambient clock, through the director. */
  private ambient(f: CosmosFrame) {
    const t = f.t;
    const { w, h } = f;
    const band = f.L.band;
    if (f.As > 300) {
      if (this.meteorAt < 0 && t >= this.meteorNext && f.director.request('cosmos-meteor', 'fx', 1.4)) {
        this.meteorAt = t;
        const r1 = hash01(Math.floor(t * 10), 1);
        const r2 = hash01(Math.floor(t * 10), 2);
        const x0 = (r1 < 0.5 ? 0.04 + r1 * 0.4 : 0.56 + (r1 - 0.5) * 0.8) * w;
        const y0 = (band[0] + (band[1] - band[0]) * r2) * h;
        this.meteorPath = { x0, y0, x1: x0 + w * 0.08 * (r1 < 0.5 ? 1 : -1), y1: y0 + h * 0.05 };
      }
      if (this.rockAt < 0 && t >= this.rockNext && f.director.request('cosmos-rock', 'ambient', 150)) {
        this.rockAt = t;
        const r = hash01(Math.floor(t), 3);
        const y = (band[0] + (band[1] - band[0]) * r) * h;
        this.rockPath = { x0: r > 0.5 ? -0.03 * w : 1.03 * w, y0: y, x1: r > 0.5 ? 1.03 * w : -0.03 * w, y1: y + h * 0.03, dur: 120 + r * 60 };
      }
    }
    if (this.meteorAt >= 0) {
      const p = (t - this.meteorAt) / 1.4;
      if (p >= 1 || !f.motion) {
        this.meteorAt = -1;
        this.meteorNext = t + 50 + hash01(Math.floor(t), 4) * 70;
        this.meteor.visible = false;
      } else {
        const m = this.meteorPath;
        this.meteor.position.set(lerp(m.x0, m.x1, p), lerp(m.y0, m.y1, p));
        this.meteor.rotation = Math.atan2(m.y1 - m.y0, m.x1 - m.x0);
        this.meteor.width = w * 0.05;
        this.meteor.height = Math.max(1.5, w * 0.0014);
        vis(this.meteor, 0.75 * Math.sin(p * Math.PI));
      }
    }
    if (this.rockAt >= 0) {
      const r = this.rockPath;
      const p = (t - this.rockAt) / r.dur;
      if (p >= 1 || !f.motion) {
        this.rockAt = -1;
        this.rockNext = t + 90 + hash01(Math.floor(t), 5) * 90;
        this.rock.visible = false;
      } else {
        this.rock.position.set(lerp(r.x0, r.x1, p), lerp(r.y0, r.y1, p));
        this.rock.width = this.rock.height = Math.max(3, w * 0.003);
        this.rock.rotation = t * 0.2;
        this.rock.tint = 0x9a8c92;
        vis(this.rock, 0.7 * env(0, 0.05, 0.95, 1, p));
      }
    }
  }
}
