/**
 * The far sky: the deep ground and the first light's mottled pattern, the cosmic web with gas
 * flowing along its threads, the background stars (one lights every 30 s of the universe's age;
 * the latest few hundred are drawn one by one, the older ones become the milky band), a dust lane
 * when the space weather brings one, and the constellations the sessions left behind.
 */

import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { AspectClass } from '../../../core/world';
import { CHRON, fieldStarAt, fieldStars } from '../../../sim/cosmos';
import { constellations, fieldStar, type Constellation } from '../../../world/cosmos';
import { currentPace, type PaceSeg } from '../../../world/pace';
import { ownGroup } from '../../gfx';
import { clamp01, env, hash01, mixHex, sm, vis, type CosmosFrame } from '../frame';
import { N } from '../palette';
import { webFor, type CosmosTextures, type WebTextures } from '../textures';

interface StarView {
  s: Sprite;
  i: number;
  base: number;
  size: number;
  born: number;
  tw: number;
  ph: number;
}

const FLOWS = 40;

export class SkySystem {
  readonly deep = new Container();
  readonly webLayer = new Container();
  readonly starLayer = new Container();
  private mottle: TilingSprite;
  private cmb: Sprite;
  private band: Sprite;
  private dust: Sprite;
  private threads: Sprite[] = [];
  private nodes: Sprite | null = null;
  private web: WebTextures | null = null;
  private flows: { s: Sprite; e: number; ph: number; v: number }[] = [];
  private stars: StarView[] = [];
  private starKey = '';
  private lines = ownGroup(new Graphics());
  private marks = new Container();
  private consts: Constellation[] = [];
  private constKey: { segs: readonly PaceSeg[] | null; aspect: string; origin: number; W: number } = { segs: null, aspect: '', origin: -1, W: -1 };
  private drawn = '';
  private tex: CosmosTextures;
  private max: number;

  constructor(tex: CosmosTextures, lowPower: boolean) {
    this.tex = tex;
    this.max = lowPower ? 320 : 640;
    this.mottle = new TilingSprite({ texture: tex.fog, width: 10, height: 10 });
    this.mottle.tint = N.nightMist;
    this.cmb = new Sprite(tex.cmb);
    this.band = new Sprite(tex.band);
    this.band.anchor.set(0.5);
    this.dust = new Sprite(tex.dustLane);
    this.dust.anchor.set(0.5);
    this.deep.addChild(this.mottle, this.cmb, this.band, this.dust);
    for (let i = 0; i < this.max; i++) {
      const s = new Sprite(tex.dot);
      s.anchor.set(0.5);
      s.visible = false;
      this.starLayer.addChild(s);
      this.stars.push({ s, i: -1, base: 0, size: 0, born: 0, tw: 0, ph: 0 });
    }
    this.starLayer.addChild(this.marks, this.lines);
    for (let i = 0; i < FLOWS; i++) {
      const s = new Sprite(tex.dot);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = mixHex(N.webViolet, N.rose, hash01(i, 7) * 0.6);
      s.visible = false;
      this.flows.push({ s, e: i, ph: hash01(i, 8), v: 0.025 + hash01(i, 9) * 0.03 });
    }
  }

  setAspect(key: AspectClass, f: { L: CosmosFrame['L']; seed: number; w: number; h: number }) {
    const web = webFor(this.tex, `${key}:${f.seed}`, f.L, f.seed, f.w, f.h);
    if (web === this.web) return;
    this.web = web;
    this.webLayer.removeChildren();
    this.threads = web.threads.map((t) => new Sprite(t));
    this.nodes = new Sprite(web.nodes);
    this.webLayer.addChild(...this.threads, this.nodes, ...this.flows.map((x) => x.s));
    this.starKey = '';
  }

  update(f: CosmosFrame) {
    const { w, h, As: s } = f;
    // deep ground
    this.mottle.width = w;
    this.mottle.height = h;
    this.mottle.tileScale.set((w / 256) * 1.2);
    this.mottle.tilePosition.set(f.t * 0.6, 0);
    vis(this.mottle, 0.16);
    // the first light: bright while the fog clears, then a faint pattern for ever
    this.cmb.width = w;
    this.cmb.height = h;
    vis(this.cmb, s < 90 ? 0 : 0.34 * sm(90, 128, s) * (1 - 0.7 * sm(140, 320, s)) * (1 - 0.3 * sm(1800, 3600, s)));

    // the cosmic web
    const web = this.web;
    if (web) {
      const dim = 1 - 0.55 * sm(600, 1500, s);
      this.threads.forEach((t, i) => {
        t.width = w;
        t.height = h;
        vis(t, (i === 0 ? sm(150, 190, s) : sm(168, 212, s)) * dim);
      });
      if (this.nodes) {
        this.nodes.width = w;
        this.nodes.height = h;
        vis(this.nodes, sm(185, 225, s) * dim);
      }
      const flowA = sm(165, 225, s) * (1 - 0.6 * sm(900, 1800, s)) * (f.motion ? 1 : 0);
      const edges = web.graph.edges;
      for (const fl of this.flows) {
        if (flowA <= 0 || !edges.length) {
          fl.s.visible = false;
          continue;
        }
        const [a, b] = edges[fl.e % edges.length];
        const p = web.graph.nodes[a];
        const q = web.graph.nodes[b];
        const u = (fl.ph + f.t * fl.v) % 1;
        const wob = Math.sin(u * Math.PI) * 0.012;
        fl.s.position.set((p.x + (q.x - p.x) * u - (q.y - p.y) * wob) * w, (p.y + (q.y - p.y) * u + (q.x - p.x) * wob) * h);
        fl.s.width = fl.s.height = Math.max(3, w * 0.0028);
        vis(fl.s, flowA * 0.55 * Math.sin(u * Math.PI));
      }
    }

    // background stars
    const n = fieldStars(f.A);
    const shown = Math.min(n, this.max);
    const key = `${f.aspect}:${f.seed}:${n}`;
    if (key !== this.starKey) {
      this.starKey = key;
      const sz = Math.max(4, Math.min(w, h) * 0.0085);
      for (let j = 0; j < this.max; j++) {
        const v = this.stars[j];
        if (j >= shown) {
          v.i = -1;
          v.s.visible = false;
          continue;
        }
        const i = n - shown + j;
        if (v.i === i) continue;
        const st = fieldStar(f.seed, i, f.aspect);
        v.i = i;
        v.base = 0.3 + 0.7 * st.mag;
        v.size = sz * (0.55 + 1.5 * st.mag);
        v.born = fieldStarAt(i) / 1000;
        v.tw = i % 3 === 0 ? 0.6 + hash01(i, 21) * 1.6 : i % 13 === 0 ? 0.1 + hash01(i, 22) * 0.2 : 0;
        v.ph = hash01(i, 23) * 6.28;
        v.s.position.set(st.x * w, st.y * h);
        v.s.tint = st.temp > 0.4 ? mixHex(0xf2eee6, N.firstStar, (st.temp - 0.4) * 1.6) : st.temp < -0.5 ? mixHex(0xf2eee6, N.redStar, (-st.temp - 0.5) * 2) : 0xf2eee6;
      }
    }
    const dimW = 1 - 0.35 * f.weather.dust;
    const glowBoost = f.celebrateT >= 0 ? env(0, 1.5, 4, 6.5, f.celebrateT) * 0.35 : 0;
    for (const v of this.stars) {
      if (v.i < 0) continue;
      const fade = clamp01((s - v.born) / 4);
      const tw = v.tw === 0 ? 1 : v.tw < 0.4 ? 0.62 + 0.38 * Math.sin(f.t * v.tw + v.ph) : 0.8 + 0.2 * Math.sin(f.t * v.tw + v.ph);
      v.s.width = v.s.height = v.size * (0.6 + 0.4 * fade);
      vis(v.s, Math.min(1, v.base * tw * fade * dimW + glowBoost * v.base));
    }

    // the milky band of long-lit stars, and a passing dust lane
    const wide = f.aspect === 'wide';
    this.band.position.set(w * 0.5, h * (wide ? 0.15 : 0.56));
    this.band.width = w * 1.6;
    this.band.height = h * (wide ? 0.34 : 0.16);
    this.band.rotation = wide ? -0.16 : -0.08;
    vis(this.band, s < CHRON.firstStar / 1000 ? 0 : (0.06 + 0.4 * clamp01((n - 120) / 2400)) * dimW);
    this.dust.position.set(((f.A / 1000) * 0.4) % (w * 0.6) + w * 0.2, h * (wide ? 0.13 : 0.55));
    this.dust.width = w * 1.7;
    this.dust.height = h * (wide ? 0.2 : 0.12);
    vis(this.dust, 0.6 * f.weather.dust);

    this.updateConstellations(f);
  }

  private updateConstellations(f: CosmosFrame) {
    const segs = currentPace();
    const k = this.constKey;
    // recomputed only when the sessions change (a session closes) or the view does
    if (k.segs !== segs || k.aspect !== f.aspect || k.origin !== f.origin || Math.abs(f.W - k.W) > 60_000 || f.jumped) {
      this.consts = constellations(f.seed, f.origin, segs, f.aspect, f.W).slice(-4);
      this.constKey = { segs, aspect: f.aspect, origin: f.origin, W: f.W };
    }
    // with animation off the lines simply appear
    const anim = f.motion && f.celebrateT >= 0 && f.celebrateT < 12 && this.consts.length > 0;
    const sig = `${this.consts.map((c) => c.w0).join(',')}:${f.w}x${f.h}:${anim ? Math.floor(f.celebrateT * 30) : 'still'}`;
    if (sig === this.drawn) return;
    this.drawn = sig;
    const g = this.lines;
    g.clear();
    this.marks.removeChildren().forEach((c) => c.destroy());
    const pos = (i: number) => {
      const st = fieldStar(f.seed, i, f.aspect);
      return { x: st.x * f.w, y: st.y * f.h };
    };
    const lw = Math.max(1, f.w / 1200);
    this.consts.forEach((c, ci) => {
      const latest = ci === this.consts.length - 1;
      let alpha = latest ? 0.17 : 0.11;
      let upto = c.edges.length;
      let part = 1;
      if (latest && anim) {
        // drawn star to star over five seconds, then it settles into the sky
        const t = f.celebrateT;
        const per = 5 / Math.max(1, c.edges.length);
        upto = Math.min(c.edges.length, Math.floor(t / per) + 1);
        part = clamp01((t - (upto - 1) * per) / per);
        alpha = 0.5 - 0.33 * sm(6, 11, t);
      }
      for (let e = 0; e < upto; e++) {
        const [a, b] = c.edges[e];
        const p = pos(a);
        const q = pos(b);
        const k2 = e === upto - 1 ? part : 1;
        g.moveTo(p.x, p.y).lineTo(p.x + (q.x - p.x) * k2, p.y + (q.y - p.y) * k2);
      }
      g.stroke({ width: lw, color: N.gold, alpha });
      for (const i of c.stars) {
        const p = pos(i);
        const m = new Sprite(this.tex.glow);
        m.anchor.set(0.5);
        m.position.set(p.x, p.y);
        m.width = m.height = Math.max(6, f.w * 0.007);
        m.tint = N.gold;
        m.blendMode = 'add';
        m.alpha = latest ? 0.5 : 0.3;
        this.marks.addChild(m);
      }
    });
  }
}
