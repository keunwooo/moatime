/**
 * Before and just after the beginning: the single point of light, the Big Bang's bloom (a drop of
 * colour spreading on wet paper, not a shock wave), the hot fog that cools from gold to plum, the
 * clearing that leaves the first light's mottled pattern behind, and the dark age's thin murk that
 * the first stars' bubbles burn away. All of it is a function of the age A, so a reload or a jump
 * shows the same moment; the fog's grain drifts on the ambient clock and stops when paused.
 */

import { Container, Sprite, TilingSprite } from 'pixi.js';
import { CHRON, firstGen } from '../../../sim/cosmos';
import { clamp01, env, hash01, mixHex, px, sm, vis, type CosmosFrame } from '../frame';
import { N } from '../palette';
import type { CosmosTextures } from '../textures';

const EMBERS = 46;

export class FogSystem {
  readonly root = new Container();
  /** Screen-space veil behind the timer (in the overlay). */
  readonly veil: Sprite;
  private seedGlow: Sprite;
  private seedHalo: Sprite;
  private bloom: Sprite;
  private plasma: TilingSprite[];
  private murk: TilingSprite;
  private embers: { s: Sprite; a: number; r: number; v: number; ph: number }[] = [];
  /** How bright the fog is now (0..1): the vignette steps back while it glows. */
  brightness = 0;

  constructor(tex: CosmosTextures) {
    this.murk = new TilingSprite({ texture: tex.fog, width: 10, height: 10 });
    this.murk.tint = N.nightMist;
    this.plasma = [0, 1].map(() => {
      const t = new TilingSprite({ texture: tex.fog, width: 10, height: 10 });
      t.blendMode = 'add';
      return t;
    });
    this.bloom = new Sprite(tex.bloom);
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = 'add';
    this.seedHalo = new Sprite(tex.glowSoft);
    this.seedHalo.anchor.set(0.5);
    this.seedHalo.tint = N.ember;
    this.seedHalo.blendMode = 'add';
    this.seedGlow = new Sprite(tex.glow);
    this.seedGlow.anchor.set(0.5);
    this.seedGlow.tint = N.emberCore;
    this.seedGlow.blendMode = 'add';
    const ember = new Container();
    for (let i = 0; i < EMBERS; i++) {
      const s = new Sprite(tex.dot);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = mixHex(N.ember, N.emberCore, hash01(i, 3));
      ember.addChild(s);
      this.embers.push({ s, a: hash01(i, 1) * Math.PI * 2, r: 0.04 + hash01(i, 2) * 0.5, v: 0.002 + hash01(i, 4) * 0.004, ph: hash01(i, 5) * 6.28 });
    }
    this.veil = new Sprite(tex.veil);
    this.veil.anchor.set(0.5);
    this.root.addChild(this.murk, ...this.plasma, this.bloom, ember, this.seedHalo, this.seedGlow);
  }

  update(f: CosmosFrame) {
    const s = f.As;
    const { w, h } = f;
    const seedP = px(f, f.L.seed);
    const diag = Math.hypot(w, h);

    // the point of light: breathes slowly until it spreads
    const pre = 1 - sm(0, CHRON.bangEnd / 1000, s);
    const breath = 1 + 0.08 * Math.sin((f.t * Math.PI * 2) / 6);
    const r0 = Math.max(5, Math.min(w, h) * 0.011);
    this.seedGlow.position.set(seedP.x, seedP.y);
    this.seedGlow.width = this.seedGlow.height = r0 * 4 * breath * (1 + sm(0, 6, s) * 2);
    vis(this.seedGlow, 0.95 * (1 - sm(4, 12, s)));
    this.seedHalo.position.set(seedP.x, seedP.y);
    this.seedHalo.width = this.seedHalo.height = r0 * 22 * (0.9 + 0.1 * breath);
    vis(this.seedHalo, 0.22 * pre + 0.0);

    // the bloom: an irregular stain spreading over 12 s, its colour carried on by the fog
    // slow at first, then spreading over the whole page by 12 s
    const k = Math.pow(sm(0, CHRON.bangEnd / 1000, s), 1.6);
    const size = (0.03 + 2.7 * k + 0.25 * sm(12, 40, s)) * diag;
    this.bloom.position.set(seedP.x, seedP.y);
    this.bloom.width = this.bloom.height = size;
    this.bloom.rotation = s * 0.01;
    // brightness rises over 8 s or more, never a flash
    // the light thins as it spreads
    vis(this.bloom, s <= 0 ? 0 : (0.6 + 0.3 * sm(0, 6, s)) * (1 - 0.45 * k) * (1 - sm(14, 45, s)));

    // hot fog: gold → orange → rose → plum, clearing from 90 s
    const cool = clamp01((s - 12) / 78);
    const tint = cool < 0.33 ? mixHex(N.ember, N.emberDeep, cool / 0.33) : cool < 0.66 ? mixHex(N.emberDeep, N.roseDeep, (cool - 0.33) / 0.33) : mixHex(N.roseDeep, N.plum, (cool - 0.66) / 0.34);
    const grow = 1 + Math.min(s, 150) / 150;
    this.plasma.forEach((p, i) => {
      p.width = w;
      p.height = h;
      p.tint = tint;
      p.tileScale.set((w / 256) * 0.55 * grow * (i ? 1.35 : 1));
      const drift = f.t * (i ? -7 : 9);
      p.tilePosition.set(drift + i * 90, drift * 0.6 - i * 40);
      const clear = i === 0 ? 1 - sm(90, 128, s) : 1 - sm(104, 150, s);
      // cooling also dims it: a bright gold glow first, a faint plum haze at the end
      const heat = 0.5 - 0.27 * cool;
      vis(p, heat * sm(6, 18, s) * clear);
    });

    // embers drift slowly outward (expansion)
    const emberA = env(8, 18, 70, 100, s) * (f.motion ? 1 : 0.6);
    for (const e of this.embers) {
      if (emberA <= 0) {
        e.s.visible = false;
        continue;
      }
      const rr = (e.r + e.v * f.t) % 0.75;
      e.s.position.set(seedP.x + Math.cos(e.a) * rr * diag, seedP.y + Math.sin(e.a) * rr * diag * 0.8);
      e.s.width = e.s.height = Math.max(3, r0 * 0.9);
      vis(e.s, emberA * (0.35 + 0.35 * Math.sin(f.t * 1.7 + e.ph)) * (1 - rr / 0.75));
    }

    // the dark age's murk, burnt away by the first stars' bubbles
    const fg = firstGen(f.seed);
    let lit = 0;
    for (const st of fg) lit += sm(st.ignite / 1000, st.ignite / 1000 + 40, s);
    const murkA = 0.22 * sm(110, 170, s) * (1 - lit / 5) * (1 - sm(430, 520, s));
    this.murk.width = w;
    this.murk.height = h;
    this.murk.tileScale.set((w / 256) * 0.8);
    this.murk.tilePosition.set(f.t * 2, f.t * -1.2);
    vis(this.murk, murkA);

    // the timer stays readable over the bright moments
    const bright = Math.max(this.bloom.visible ? this.bloom.alpha * Math.min(1, size / diag) : 0, this.plasma[0].visible ? this.plasma[0].alpha / 0.5 : 0);
    this.brightness = bright;
    const [x0, y0, x1, y1] = f.L.timer;
    this.veil.position.set(((x0 + x1) / 2) * w, ((y0 + y1) / 2) * h);
    this.veil.width = (x1 - x0) * w * 2.9;
    this.veil.height = (y1 - y0) * h * 2.8;
    vis(this.veil, 0.34 * bright);
  }
}
