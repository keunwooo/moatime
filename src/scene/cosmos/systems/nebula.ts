/**
 * The first stars and what their deaths leave behind. Each first-generation star lights where the
 * web's knot drew tight, burns away the murk with a clear blue bubble, and dies: it swells and
 * reddens (the first one), draws in, and blows out a shell of stardust that slows into a nebula —
 * the first on the left, the second on the right at 35 minutes. Blue giants born later die the same
 * way where they stand, and their remnants stay as small nebulae that widen and fade over many
 * hours, so the sky keeps what happened in it. Nebulae breathe slowly and lean with the stellar wind.
 */

import { Container, Sprite } from 'pixi.js';
import { CHRON, deathAt, firstGen, starKind, unitAt, unitEnd } from '../../../sim/cosmos';
import { clamp01, easeOut, env, hash01, mixHex, px, sm, vis, type CosmosFrame } from '../frame';
import { systemPos } from '../layout';
import { N } from '../palette';
import type { CosmosTextures } from '../textures';

class Burst {
  readonly root = new Container();
  private flash: Sprite;
  private shells: Sprite[];
  private remnant: Sprite;
  private pulsar: Sprite;

  constructor(tex: CosmosTextures) {
    this.remnant = new Sprite(tex.remnant);
    this.remnant.tint = N.rose;
    this.shells = [N.gold, N.teal, N.rose].map((tint) => {
      const s = new Sprite(tex.shell);
      s.tint = tint;
      s.blendMode = 'add';
      return s;
    });
    this.flash = new Sprite(tex.glowSoft);
    this.flash.tint = N.emberCore;
    this.flash.blendMode = 'add';
    this.pulsar = new Sprite(tex.dot);
    this.pulsar.tint = N.firstStar;
    for (const s of [this.remnant, ...this.shells, this.flash, this.pulsar]) s.anchor.set(0.5);
    this.root.addChild(this.remnant, ...this.shells, this.flash, this.pulsar);
  }

  /** `tD`: the death (s of age); `R`: shell radius (px); `fadeTo`: shell brightness left later. */
  update(x: number, y: number, tD: number, s: number, R: number, fadeTo: number) {
    const e = s - tD;
    if (e < 0 || !Number.isFinite(tD)) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.root.position.set(x, y);
    // one soft swell of light: 3 s up, 8 s down, small and local
    this.flash.width = this.flash.height = R * 0.9;
    vis(this.flash, 0.7 * env(0, 3, 4, 12, e));
    this.shells.forEach((sh, k) => {
      const grow = easeOut(e / (55 + 25 * k));
      sh.width = sh.height = R * 2 * (0.08 + 0.92 * grow) * (0.85 + 0.12 * k);
      sh.rotation = k * 1.3 + e * 0.002;
      vis(sh, sm(0, 2, e) * (0.5 - (0.5 - fadeTo) * sm(30, 420, e)));
    });
    this.remnant.width = this.remnant.height = R * 1.6;
    vis(this.remnant, 0.22 * sm(30, 240, e));
    this.pulsar.width = this.pulsar.height = Math.max(3, R * 0.05);
    vis(this.pulsar, 0.8 * sm(20, 60, e));
  }
}

interface FirstView {
  knot: Sprite;
  halo: Sprite;
  core: Sprite;
  bubble: Sprite;
  burst: Burst;
}

export class NebulaSystem {
  readonly root = new Container();
  private firsts: FirstView[] = [];
  private nebA = new Container();
  private nebB = new Container();
  private layersA: Sprite[];
  private layersB: Sprite[];
  private lanes: Sprite;
  private blue: Burst[] = [];
  private patchLayer = new Container();
  private patches: { wisp: Sprite; glow: Sprite }[] = [];

  constructor(tex: CosmosTextures) {
    // emission nebulae glow: their washes add light rather than cover what is behind
    this.layersA = tex.nebulaA.map((t) => {
      const s = new Sprite(t);
      s.blendMode = 'add';
      return s;
    });
    this.lanes = new Sprite(tex.lanesA);
    this.nebA.addChild(...this.layersA, this.lanes);
    this.layersB = tex.nebulaB.map((t) => {
      const s = new Sprite(t);
      s.blendMode = 'add';
      return s;
    });
    this.nebB.addChild(...this.layersB);
    for (let i = 0; i < 16; i++) {
      const glow = new Sprite(tex.glowSoft);
      glow.blendMode = 'add';
      const wisp = new Sprite(tex.remnant);
      for (const x of [glow, wisp]) x.anchor.set(0.5);
      this.patchLayer.addChild(glow, wisp);
      this.patches.push({ wisp, glow });
    }
    this.root.addChild(this.nebB, this.nebA, this.patchLayer);
    for (let i = 0; i < 5; i++) {
      const knot = new Sprite(tex.glowSoft);
      knot.tint = N.webViolet;
      knot.blendMode = 'add';
      const bubble = new Sprite(tex.bubble);
      const halo = new Sprite(tex.glowSoft);
      halo.blendMode = 'add';
      const core = new Sprite(tex.glow);
      core.blendMode = 'add';
      for (const s of [knot, bubble, halo, core]) s.anchor.set(0.5);
      const burst = new Burst(tex);
      this.root.addChild(bubble, knot, halo, core, burst.root);
      this.firsts.push({ knot, halo, core, bubble, burst });
    }
    for (let i = 0; i < 6; i++) {
      const b = new Burst(tex);
      this.blue.push(b);
      this.root.addChild(b.root);
    }
  }

  update(f: CosmosFrame) {
    const s = f.As;
    const { w, h } = f;
    const fg = firstGen(f.seed);
    const unit = Math.max(4, w * 0.004);
    const wind = f.weather.wind;
    const breathe = 1 + f.weather.glow;
    // nebulae: the first grows from the first star's shell, the second from the second's
    const tA = CHRON.shell / 1000;
    const tB = fg[1].death / 1000;
    this.placeNebula(f, this.nebA, this.layersA, f.L.nebulaA, px(f, f.L.firstGen[0]), tA, 0, breathe, wind);
    this.placeNebula(f, this.nebB, this.layersB, f.L.nebulaB, px(f, f.L.firstGen[1]), tB, 1, breathe, wind);
    vis(this.lanes, 0.75 * sm(tA + 120, tA + 330, s));

    fg.forEach((st, i) => {
      const v = this.firsts[i];
      const p = px(f, f.L.firstGen[i]);
      const ig = st.ignite / 1000;
      const dd = st.death / 1000;
      // the knot draws tight just before it lights
      v.knot.position.set(p.x, p.y);
      const tight = sm(ig - 15, ig, s);
      v.knot.width = v.knot.height = unit * (9 - 5 * tight);
      vis(v.knot, sm(ig - 70, ig - 30, s) * (0.25 + 0.45 * tight) * (1 - sm(ig, ig + 6, s)));
      // lit: blue-white; the first swells and reddens before it dies
      const on = sm(ig, ig + CHRON.igniteMs / 1000, s);
      const giant = i === 0 ? sm(CHRON.redGiant / 1000, dd - 8, s) : sm(dd - 240, dd - 8, s) * 0.5;
      const pinch = sm(dd - 5, dd, s);
      const gone = s >= dd ? 1 : 0;
      const pulse = 1 + (giant > 0 ? 0.06 * giant * Math.sin(((f.A / 1000) * Math.PI * 2) / 10) : 0);
      const tint = giant < 0.5 ? mixHex(N.firstStar, N.ember, giant * 2) : mixHex(N.ember, N.redStar, (giant - 0.5) * 2);
      const size = unit * (2.2 + 1.6 * giant) * (1 - 0.5 * pinch) * pulse;
      v.core.position.set(p.x, p.y);
      v.core.width = v.core.height = size * 2;
      v.core.tint = tint;
      vis(v.core, on * (1 - gone) * (0.95 + 0.2 * pinch));
      v.halo.position.set(p.x, p.y);
      v.halo.width = v.halo.height = size * 7;
      v.halo.tint = tint;
      vis(v.halo, on * (1 - gone) * 0.32);
      // the ionised bubble clears the murk around it, then thins out as nebulae take over
      v.bubble.position.set(p.x, p.y);
      const br = easeOut((s - ig) / 30);
      v.bubble.width = v.bubble.height = w * (f.aspect === 'wide' ? 0.15 : 0.32) * (0.2 + 0.8 * br);
      vis(v.bubble, on * 0.55 * (1 - sm(600, 1500, s)));
      // its death: a shell of stardust (the first two grow into the nebulae)
      v.burst.update(p.x, p.y, dd, s, w * (i < 2 ? 0.16 : 0.08) * (f.aspect === 'wide' ? 1 : 1.6), i < 2 ? 0.05 : 0.12);
    });

    // blue giants of the star systems die where they stand
    const cur = unitAt(f.seed, f.A);
    let n = 0;
    if (cur) {
      for (let k = cur.k; k >= Math.max(1, cur.k - 14) && n < this.blue.length; k--) {
        if (starKind(f.seed, k) !== 'blue') continue;
        const d = deathAt(f.seed, k) / 1000;
        if (d > s || s - d > 1800) continue;
        const q = systemPos(f.L, f.seed, k);
        const depth = q.scale;
        this.blue[n++].update(q.x * w, q.y * h, d, s, w * 0.05 * depth * (f.aspect === 'wide' ? 1 : 1.6), 0.08);
      }
    }
    for (; n < this.blue.length; n++) this.blue[n].update(0, 0, Infinity, s, 0, 0);
    this.updatePatches(f, cur);
    void unitEnd;
  }

  /** What blue giants left: small nebulae that widen and slowly fade (the burst covers the first 30 min). */
  private updatePatches(f: CosmosFrame, cur: { k: number } | null) {
    const s = f.As;
    let m = 0;
    if (cur) {
      for (let k = cur.k; k >= Math.max(1, cur.k - 160) && m < this.patches.length; k--) {
        if (starKind(f.seed, k) !== 'blue') continue;
        const d = deathAt(f.seed, k) / 1000;
        const age = s - d;
        if (age < 1500) continue;
        const q = systemPos(f.L, f.seed, k);
        const p = this.patches[m++];
        const a = sm(1500, 1800, age) * (1 - 0.55 * sm(10 * 3600, 50 * 3600, age));
        const R = f.w * 0.08 * q.scale * (f.aspect === 'wide' ? 1 : 1.6) * (1 + 0.45 * sm(1800, 8 * 3600, age));
        const tint = hash01(k, 61) < 0.5 ? N.rose : hash01(k, 62) < 0.6 ? N.teal : N.gold;
        p.wisp.position.set(q.x * f.w, q.y * f.h);
        p.wisp.width = p.wisp.height = R;
        p.wisp.rotation = hash01(k, 63) * 6.28 + age * 0.00002;
        p.wisp.tint = tint;
        vis(p.wisp, 0.24 * a);
        p.glow.position.set(q.x * f.w, q.y * f.h);
        p.glow.width = p.glow.height = R * 1.5;
        p.glow.tint = tint;
        vis(p.glow, 0.12 * a);
      }
    }
    for (; m < this.patches.length; m++) this.patches[m].wisp.visible = this.patches[m].glow.visible = false;
  }

  private placeNebula(
    f: CosmosFrame,
    c: Container,
    layers: Sprite[],
    box: { x0: number; y0: number; x1: number; y1: number },
    from: { x: number; y: number },
    t0: number,
    which: number,
    breathe: number,
    wind: number,
  ) {
    const s = f.As;
    const grow = sm(t0, t0 + 330, s);
    if (grow <= 0) {
      c.visible = false;
      return;
    }
    c.visible = true;
    // it spreads out from where the star died
    c.pivot.set(from.x, from.y);
    c.position.set(from.x + wind * f.w * 0.01, from.y);
    c.scale.set(0.35 + 0.65 * easeOut(clamp01((s - t0) / 330)));
    layers.forEach((l, i) => {
      l.position.set(box.x0 * f.w, box.y0 * f.h);
      l.width = (box.x1 - box.x0) * f.w;
      l.height = (box.y1 - box.y0) * f.h;
      // each wash drifts and breathes on its own slow beat
      const per = 47 + i * 19 + which * 11;
      const ph = hash01(i, which, 5) * 6.28;
      l.position.x += Math.sin((f.t * Math.PI * 2) / per + ph) * f.w * 0.004;
      l.position.y += Math.cos((f.t * Math.PI * 2) / (per * 1.3) + ph) * f.h * 0.004;
      const b = 1 + 0.08 * breathe * Math.sin((f.t * Math.PI * 2) / (per * 0.9) + ph * 2);
      vis(l, sm(t0 + i * 30, t0 + 240 + i * 60, s) * (i === 2 ? 0.7 : 0.58) * b);
    });
  }
}
