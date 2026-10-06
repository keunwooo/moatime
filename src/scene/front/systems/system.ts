/**
 * The system stage (FRONT_PROMPT.md 13.4절): the dim red star Aster in the upper left, seven tilted
 * orbits sweeping across the view and the sector's planets turning on them — rings of my people's
 * colour on the planets held, both colours on the one fought for, a slow ring round a planet where
 * a battle is on (it never blinks). A planet passing behind the timer is drawn faint. Used for the
 * stage switches, a conquest's reveal and (in words) the detail panel's sector map.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { heldCount, planetsTo } from '../../../sim/front';
import { BIOMES, devLevel, type BiomeId } from '../../../sim/frontPlan';
import { clearIfDrawn, ownGroup } from '../../gfx';
import { releaseTexture, toTexture } from '../../paint/brush';
import { num } from '../../paint/color';
import { hash01, vis, type FrontFrame } from '../frame';
import { inTimer } from '../layout';
import { RACE_PAL } from '../palette';
import { paintDeep, paintDisc, paintStar } from '../paint/space';

const TAU = Math.PI * 2;
const H = 3_600_000;

export class SystemStage {
  readonly root = new Container();
  private deep = new Sprite();
  private star = new Sprite();
  private orbits = ownGroup(new Container());
  private orbitG = new Graphics();
  private rings = ownGroup(new Container());
  private ringG = new Graphics();
  private discs: Sprite[] = [];
  private discTex = new Map<BiomeId, Texture>();
  private deepTex: Texture | null = null;
  private starTex: Texture;
  private sizeKey = '';
  private ringKey = '';
  /** Where each planet of the sector is drawn (screen px), read by the stage switch. */
  readonly at: { x: number; y: number; r: number; dim: number }[] = [];

  constructor() {
    this.starTex = toTexture(paintStar(256), { label: 'front-sys-star' });
    this.star.texture = this.starTex;
    this.star.anchor.set(0.5);
    for (const b of BIOMES) this.discTex.set(b, toTexture(paintDisc(b, 7 + b.length, 96), { label: `front-disc-${b}` }));
    this.orbits.addChild(this.orbitG);
    this.rings.addChild(this.ringG);
    this.root.addChild(this.deep, this.star, this.orbits);
    for (let i = 0; i < 7; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      this.discs.push(s);
      this.root.addChild(s);
    }
    this.root.addChild(this.rings);
  }

  /** Ellipse of orbit i (screen px): centre on the star, tilted. */
  private orbit(f: FrontFrame, i: number) {
    const cx = f.w * 0.12;
    const cy = f.h * 0.15;
    const rx = f.w * (0.22 + i * 0.13);
    const ry = rx * 0.34;
    return { cx, cy, rx, ry };
  }

  /** A planet's place on its orbit at war time A (slow; the inner ones faster). */
  planetPos(f: FrontFrame, i: number, A: number) {
    const o = this.orbit(f, i);
    // only the lower-right quarter of each orbit shows on screen; planets wander along it
    const period = (8 + i * 4) * H;
    const a = 0.05 * TAU + (0.2 * TAU) * (0.5 + 0.5 * Math.sin((A / period) * TAU + hash01(i, 3) * TAU));
    return { x: o.cx + Math.cos(a) * o.rx, y: o.cy + Math.sin(a) * o.ry };
  }

  update(f: FrontFrame, alpha: number, battlePlanet: number) {
    vis(this.root, alpha);
    if (alpha <= 0.003) return;
    const { w, h, v } = f;
    const sk = `${Math.round(w)}x${Math.round(h)}`;
    if (sk !== this.sizeKey) {
      this.sizeKey = sk;
      releaseTexture(this.deepTex);
      const dw = Math.min(1600, w);
      this.deepTex = toTexture(paintDeep(dw, Math.round(dw * (h / w)), 0x5e2), { label: 'front-sys-deep' });
      this.deep.texture = this.deepTex;
      clearIfDrawn(this.orbitG);
      for (let i = 0; i < 7; i++) {
        const o = this.orbit(f, i);
        this.orbitG.ellipse(o.cx, o.cy, o.rx, o.ry).stroke({ width: 1, color: 0xe8e6f0, alpha: 0.12 });
      }
    }
    this.deep.width = w;
    this.deep.height = h;
    this.star.position.set(w * 0.12, h * 0.15);
    this.star.scale.set((h * 0.42) / 256);
    const A = v.A;
    const sector = Math.floor(v.planet.idx / 7);
    const list = planetsTo(v.seed, A);
    const held = heldCount(v.seed, A);
    const k = f.k;
    this.at.length = 0;
    let rk = '';
    for (let i = 0; i < 7; i++) {
      const p = list[sector * 7 + i];
      const s = this.discs[i];
      if (!p) {
        s.visible = false;
        continue;
      }
      const pos = this.planetPos(f, i, A);
      const r = (14 + i * 2.2) * k * (p.idx === v.planet.idx ? 1.25 : 1);
      s.texture = this.discTex.get(p.biome)!;
      s.position.set(pos.x, pos.y);
      s.scale.set((r * 2.5) / 96);
      const behind = inTimer(f.L, { x: pos.x / w, y: pos.y / h }, 0.01);
      const known = p.idx <= v.planet.idx + 1;
      s.alpha = (behind ? 0.25 : 1) * (known ? 1 : 0.45);
      s.visible = true;
      this.at.push({ x: pos.x, y: pos.y, r, dim: behind ? 0.3 : 1 });
      rk += `${Math.round(pos.x)},${Math.round(pos.y)},${p.idx < held ? devLevel(A - p.conqueredAt) : -1};`;
    }
    // rings (redrawn when a planet moves a pixel or a battle ring grows a step)
    const ringStep = battlePlanet >= 0 ? Math.floor((f.t * 6) % 30) : -1;
    rk += `${battlePlanet}:${ringStep}:${v.planet.idx}:${held}`;
    if (rk !== this.ringKey) {
      this.ringKey = rk;
      clearIfDrawn(this.ringG);
      const mine = num(RACE_PAL[v.race].accent);
      const rival = num(RACE_PAL[v.rivalRaces[0]].accent);
      for (let i = 0; i < this.at.length; i++) {
        const p = list[sector * 7 + i];
        const a = this.at[i];
        if (p.idx < held) {
          this.ringG.circle(a.x, a.y, a.r * 1.35).stroke({ width: 1.6, color: mine, alpha: 0.75 * a.dim });
          const lvl = devLevel(A - p.conqueredAt);
          if (lvl >= 3) this.ringG.circle(a.x, a.y, a.r * 1.65).stroke({ width: 1, color: mine, alpha: 0.4 * a.dim });
        } else if (p.idx === v.planet.idx) {
          this.ringG.arc(a.x, a.y, a.r * 1.35, 0, Math.PI).stroke({ width: 1.6, color: mine, alpha: 0.8 * a.dim });
          this.ringG.arc(a.x, a.y, a.r * 1.35, Math.PI, Math.PI * 2).stroke({ width: 1.6, color: rival, alpha: 0.8 * a.dim });
        }
        if (p.idx === battlePlanet && ringStep >= 0) {
          const q = ringStep / 30;
          this.ringG.circle(a.x, a.y, a.r * (1.5 + q * 1.4)).stroke({ width: 1.2, color: 0xf2b544, alpha: 0.7 * (1 - q) * a.dim });
        }
      }
      // routes between the planets held and the front
      for (let i = 1; i < this.at.length; i++) {
        const p = list[sector * 7 + i];
        if (p.idx > v.planet.idx) break;
        const a = this.at[i - 1];
        const b = this.at[i];
        const n = 14;
        for (let j = 0; j < n; j += 2) {
          const t0 = j / n;
          const t1 = (j + 1) / n;
          this.ringG.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
        }
        this.ringG.stroke({ width: 1, color: 0xe8e6f0, alpha: 0.25 });
      }
    }
  }

  destroy() {
    releaseTexture(this.deepTex);
    releaseTexture(this.starTex);
    for (const t of this.discTex.values()) releaseTexture(t);
  }
}
