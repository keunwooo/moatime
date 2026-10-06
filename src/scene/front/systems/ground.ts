/**
 * The ground: the planet's painted terrain (repainted when the planet or the viewport's shape
 * changes), tinted by the planet's day; amber motes drifting on the time-crystal lake; the
 * time-crystal pillars standing at crystal sites.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { SITE_COUNT } from '../../../sim/front';
import { mix, num, type RGB } from '../../paint/color';
import { clamp01, hash01, vis, type FrontFrame } from '../frame';
import { sitePos } from '../layout';
import { BIOME_PAL, LAKE } from '../palette';
import { groundTex, type FrontTextures } from '../textures';

const NIGHT: RGB = [92, 104, 150];
const DUSK: RGB = [235, 176, 140];

export class GroundSystem {
  readonly root = new Container();
  readonly lake = new Container();
  readonly crystals = new Container();
  private sprite = new Sprite();
  private key = '';
  private motes: Sprite[] = [];
  private pillars: Sprite[] = [];
  /** Day tint of the land (packed), read by the other systems. */
  tint = 0xffffff;
  /** Darkness 0..1 (night), read by lights. */
  night = 0;
  /** The painted ground on view (the minimap shows it too). */
  get texture(): Texture | null {
    return this.sprite.texture ?? null;
  }

  constructor(private tex: FrontTextures, lowPower: boolean) {
    this.root.addChild(this.sprite, this.lake, this.crystals);
    const n = lowPower ? 14 : 26;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(tex.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = num(LAKE.mote);
      this.motes.push(s);
      this.lake.addChild(s);
    }
    for (let i = 0; i < SITE_COUNT; i++) {
      const s = new Sprite(tex.glow);
      s.anchor.set(0.5, 0.9);
      s.blendMode = 'add';
      s.tint = num(LAKE.mote);
      this.pillars.push(s);
      this.crystals.addChild(s);
    }
  }

  update(f: FrontFrame, planetIdx: number, eclipse = 0) {
    const { w, h, L } = f;
    const p = f.v.planet.idx === planetIdx ? f.v.planet : f.v.planet;
    // the ground for this planet and this viewport (painted at most at 1600 px wide)
    const s = Math.min(1, 1600 / w);
    const pw = Math.max(64, Math.round(w * s));
    const ph = Math.max(64, Math.round(h * s));
    const key = `${p.idx}:${pw}x${ph}:${f.aspect}`;
    if (key !== this.key) {
      this.key = key;
      const t: Texture = groundTex(this.tex, { biome: p.biome, planetSeed: p.seed, natSide: p.natSide, crystal: p.crystal, L, w: pw, h: ph }, p.idx);
      this.sprite.texture = t;
    }
    this.sprite.width = w;
    this.sprite.height = h;

    // the planet's day: warm at dusk and dawn, a cool moonlit blue at night
    const d = f.env.day;
    const nightW = Math.max(d.sky[0], eclipse * 0.85);
    const twi = d.sky[1] + d.sky[3];
    let c: RGB = [255, 255, 255];
    c = mix(c, DUSK, twi * 0.35);
    c = mix(c, NIGHT, nightW * 0.62);
    this.night = clamp01(nightW);
    this.tint = num(c);
    this.sprite.tint = this.tint;

    // motes on the lake: slow drifting specks (the ambient clock)
    const t = f.t;
    const lk = L.lake;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      const a = hash01(i, 3) * Math.PI * 2 + t * 0.02 * (hash01(i, 4) - 0.5);
      const rr = Math.sqrt(hash01(i, 5)) * 0.92;
      const x = lk.c.x + Math.cos(a) * lk.r.x * rr;
      const y = lk.c.y + Math.sin(a) * lk.r.y * rr;
      m.position.set(x * w, y * h);
      const tw = 0.5 + 0.5 * Math.sin(t * (0.4 + hash01(i, 6) * 0.5) + i);
      m.scale.set((0.08 + 0.06 * hash01(i, 7)) * (h / 820));
      vis(m, (0.25 + 0.35 * tw) * (0.6 + 0.4 * this.night));
    }

    // time-crystal pillars at crystal sites (amber, breathing slowly)
    const pal = BIOME_PAL[p.biome];
    void pal;
    for (let i = 0; i < SITE_COUNT; i++) {
      const s2 = this.pillars[i];
      if (!p.crystal[i]) {
        s2.visible = false;
        continue;
      }
      const sp = sitePos(L, p.seed, i, p.natSide);
      const k = (h / 820) * (0.8 + 0.3 * sp.y);
      s2.position.set(sp.x * w - 18 * k, sp.y * h - 8 * k);
      s2.scale.set(0.42 * k, 0.9 * k);
      vis(s2, 0.55 + 0.25 * Math.sin(t * 0.5 + i) * 0.5 + 0.2 * this.night);
    }
  }
}
