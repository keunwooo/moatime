/**
 * Sights over the battlefield that are not fights:
 * - the sky band at the top: the developed planets as small lit discs, and now and then one of my
 *   ships crossing (a parade of the fleet, the three fleets gathering, as rare sights),
 * - rare sights on the ground: a supply pod coming down, a meteor uncovering time crystal, a vast
 *   native creature swimming through the ground (every gun falls silent while it passes), the
 *   ancient gate waking in the lake (slow rings of light, a truce),
 * - operation flags: a small pennant on the site each recent session won (the last one rises when a
 *   session is completed live).
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { RaceId } from '../../../core/session';
import { BIOMES, type BiomeId, type ShipKind } from '../../../sim/frontPlan';
import { clearIfDrawn, ownGroup } from '../../gfx';
import { makeCanvas, releaseTexture, toTexture } from '../../paint/brush';
import { css, lighten, num, shade } from '../../paint/color';
import { clamp01, hash01, lerp, sm, vis, type FrontFrame } from '../frame';
import { depthScale, sitePos } from '../layout';
import { RACE_PAL } from '../palette';
import { PX } from '../paint/kit';
import { paintDisc } from '../paint/space';
import type { FrontTextures } from '../textures';
import type { StructureSystem } from './structures';

class Pool {
  private list: Sprite[] = [];
  private used = 0;
  constructor(
    private layer: Container,
    private make: () => Sprite,
  ) {}
  begin() {
    this.used = 0;
  }
  next(): Sprite {
    let s = this.list[this.used];
    if (!s) {
      s = this.make();
      this.layer.addChild(s);
      this.list.push(s);
    }
    this.used++;
    s.visible = true;
    return s;
  }
  end() {
    for (let i = this.used; i < this.list.length; i++) this.list[i].visible = false;
  }
}

function pennant(race: RaceId): Texture {
  const pal = RACE_PAL[race];
  const pc = makeCanvas(24, 40);
  const { ctx } = pc;
  ctx.strokeStyle = css(pal.ink, 0.9);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(4, 39);
  ctx.lineTo(4, 3);
  ctx.stroke();
  ctx.fillStyle = css(pal.accent);
  ctx.beginPath();
  ctx.moveTo(5, 4);
  ctx.lineTo(22, 9);
  ctx.lineTo(5, 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(lighten(pal.accent, 0.35));
  ctx.fillRect(5, 4, 8, 2);
  ctx.strokeStyle = css(shade(pal.accent, 0.4));
  ctx.lineWidth = 0.8;
  ctx.stroke();
  return toTexture(pc, { label: `front-pennant-${race}` });
}

export interface FlagMark {
  site: number;
  name: string;
  at: number;
}

export class EventSystem {
  /** In the sky band and on the ground (moves with the camera). */
  readonly root = new Container();
  private sky = new Container();
  private ground: Pool;
  private skyPool: Pool;
  private flags: Pool;
  private discs: Sprite[] = [];
  private discTex = new Map<BiomeId, Texture>();
  private pennants: Texture[];
  private rings = ownGroup(new Container());
  private ringG = new Graphics();
  private ringKey = '';
  /** Guns fall silent (the creature passes, the gate wakes). */
  truce = false;

  constructor(private tex: FrontTextures) {
    for (const b of BIOMES) this.discTex.set(b, toTexture(paintDisc(b, 3 + b.length, 64), { label: `front-skydisc-${b}` }));
    this.pennants = [pennant(0), pennant(1), pennant(2)];
    const groundLayer = new Container();
    const flagLayer = new Container();
    this.rings.addChild(this.ringG);
    this.root.addChild(this.sky, groundLayer, this.rings, flagLayer);
    for (let i = 0; i < 6; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      this.discs.push(s);
      this.sky.addChild(s);
    }
    this.skyPool = new Pool(this.sky, () => new Sprite());
    this.ground = new Pool(groundLayer, () => {
      const s = new Sprite();
      s.anchor.set(0.5);
      return s;
    });
    this.flags = new Pool(flagLayer, () => {
      const s = new Sprite();
      s.anchor.set(0.15, 1);
      return s;
    });
  }

  update(f: FrontFrame, st: StructureSystem, flags: FlagMark[], celebrateT: number, tint: number) {
    const { w, h, v, L } = f;
    const k = f.k;
    this.skyPool.begin();
    this.ground.begin();
    this.flags.begin();
    this.truce = false;
    const bandY = L.top * h * 0.55;

    // ---- the sky band: developed planets (the latest six) ------------------------------------
    const dev = v.developed.slice(-6);
    for (let i = 0; i < this.discs.length; i++) {
      const s = this.discs[i];
      const d = dev[i];
      if (!d) {
        s.visible = false;
        continue;
      }
      s.texture = this.discTex.get(d.biome)!;
      const x = w * (0.08 + i * 0.065 + (i >= 3 ? 0.62 : 0));
      s.position.set(x, bandY + Math.sin(i * 1.7) * 6 * k);
      s.scale.set(((22 + d.level * 3) * k) / 64);
      s.tint = tint;
      vis(s, 0.9);
    }

    // ---- ships crossing the band ----------------------------------------------------------------
    const e = f.event;
    const crossing = (race: RaceId, kind: ShipKind, p: number, y: number, scale: number, dir: number) => {
      const art = this.tex.race[race].u[kind][0];
      const s = this.skyPool.next();
      s.texture = art.tex;
      s.anchor.set(art.ax, art.ay);
      const x = lerp(dir > 0 ? -0.15 : 1.15, dir > 0 ? 1.15 : -0.15, p) * w;
      s.position.set(x, y);
      s.scale.set((dir * scale * k) / PX, (scale * k) / PX);
      s.tint = tint;
      s.alpha = 0.92;
    };
    if (e && (e.kind === 'parade' || e.kind === 'grandFleet')) {
      const races: RaceId[] = e.kind === 'parade' ? [v.race] : [v.race, v.rivalRaces[0], v.rivalRaces[1]];
      races.forEach((race, g) => {
        for (let i = 0; i < 6; i++) {
          const kind: ShipKind = i === 0 && v.ships.s2 > 0 ? 's2' : 's1';
          const lag = i * 0.03 + g * 0.06;
          crossing(race, kind, clamp01(f.eventP * 1.15 - lag), bandY + (i % 3) * 9 * k + g * 12 * k, kind === 's2' ? 0.7 : 0.6, g === 1 ? -1 : 1);
        }
      });
    } else if (v.ships.s1 > 0 && f.motion) {
      // now and then one of mine passes high above
      const period = 95;
      const q = (f.t % period) / 26;
      if (q < 1) crossing(v.race, v.ships.s2 > 0 && Math.floor(f.t / period) % 3 === 0 ? 's2' : 's1', q, bandY + 10 * k, 0.55, Math.floor(f.t / period) % 2 ? 1 : -1);
    }

    // ---- rare sights on the ground ----------------------------------------------------------------
    clearIfDrawn(this.ringG);
    let rk = '';
    if (e) {
      const p = f.eventP;
      if (e.kind === 'supplyPod') {
        const home = st.basesAt.get(-1);
        if (home) {
          const fall = sm(0.05, 0.4, p);
          const y = lerp(-20, home.y + 10 * k, fall);
          this.glowAt(home.x + 40 * k, y, 7 * k, num(RACE_PAL[v.race].glow), fall < 1 ? 0.9 : 0.5 * (1 - sm(0.4, 0.9, p)));
          if (fall >= 1) this.puffAt(home.x + 40 * k, home.y + 12 * k, (10 + 18 * sm(0.4, 0.6, p)) * k, 0xc8b8a6, 0.4 * (1 - sm(0.4, 0.8, p)));
        }
      } else if (e.kind === 'meteor') {
        const site = Math.floor(hash01(e.seed, 1) * 12);
        const at = sitePos(L, v.planet.seed, site, v.planet.natSide);
        const tx = at.x * w;
        const ty = at.y * h;
        const fall = sm(0.05, 0.25, p);
        if (fall < 1) {
          const x = lerp(tx - 0.25 * w, tx, fall);
          const y = lerp(-30, ty, fall);
          this.glowAt(x, y, 9 * k, 0xf2a35a, 0.85);
          this.puffAt(x - 20 * k, y - 12 * k, 10 * k, 0x8a7a6a, 0.3);
        } else {
          this.puffAt(tx, ty, (12 + 30 * sm(0.25, 0.5, p)) * k * depthScale(at.y), 0xa89884, 0.5 * (1 - sm(0.3, 0.75, p)));
          this.glowAt(tx, ty - 6 * k, 10 * k * sm(0.4, 0.7, p), 0xf2b544, 0.6);
        }
      } else if (e.kind === 'whale') {
        // a vast back moving through the ground, a wake of dust; the guns fall silent
        this.truce = true;
        const y = h * (L.lake.c.y + L.lake.r.y + 0.12);
        const x = lerp(-0.2, 1.2, p) * w;
        const s = this.ground.next();
        s.texture = this.tex.shadow;
        s.position.set(x, y);
        s.scale.set((260 * k) / 64, (60 * k) / 32);
        s.tint = 0x3a2a24;
        s.alpha = 0.5 * sm(0, 0.1, p) * (1 - sm(0.9, 1, p));
        for (let i = 0; i < 5; i++) this.puffAt(x - (40 + i * 34) * k, y + (hash01(i, 2) - 0.5) * 16 * k, (20 + i * 4) * k, 0xc8a882, 0.18 * (1 - i / 6));
      } else if (e.kind === 'gate') {
        // the ancient ring in the lake wakes: slow rings of light (a truce)
        this.truce = true;
        const step = Math.floor(f.t * 8) % 64;
        rk = `gate:${step}:${Math.round(p * 50)}`;
        if (rk !== this.ringKey) {
          const cx = L.lake.c.x * w;
          const cy = L.lake.c.y * h;
          const amp = sm(0, 0.15, p) * (1 - sm(0.85, 1, p));
          for (let j = 0; j < 3; j++) {
            const q = ((step / 64 + j / 3) % 1);
            this.ringG.ellipse(cx, cy, L.lake.r.x * w * (0.2 + 0.8 * q), L.lake.r.y * h * (0.2 + 0.8 * q)).stroke({ width: 1.6, color: 0xf2b544, alpha: 0.5 * amp * (1 - q) });
          }
        }
      }
    }
    if (!rk) this.ringKey = '';
    else this.ringKey = rk;

    // ---- operation flags ------------------------------------------------------------------------
    const last = flags[flags.length - 1];
    for (const fl of flags) {
      const at = sitePos(L, v.planet.seed, fl.site, v.planet.natSide);
      const s = this.flags.next();
      s.texture = this.pennants[v.race];
      const kk = k * depthScale(at.y);
      // the last one rises when a session is completed live
      const rise = fl === last && celebrateT >= 0 ? clamp01(celebrateT / 4) : 1;
      s.position.set(at.x * w + 22 * kk, at.y * h - 10 * kk);
      s.scale.set((kk * 0.7) / 1, ((kk * 0.7) / 1) * rise);
      s.tint = tint;
      s.alpha = 0.95;
    }
    this.skyPool.end();
    this.ground.end();
    this.flags.end();
  }

  private glowAt(x: number, y: number, r: number, color: number, a: number) {
    const s = this.ground.next();
    s.texture = this.tex.glow;
    s.blendMode = 'add';
    s.position.set(x, y);
    s.scale.set((r * 2) / 64);
    s.tint = color;
    s.alpha = a;
  }

  private puffAt(x: number, y: number, r: number, color: number, a: number) {
    const s = this.ground.next();
    s.texture = this.tex.smoke;
    s.blendMode = 'normal';
    s.position.set(x, y);
    s.scale.set((r * 2) / 64);
    s.tint = color;
    s.alpha = a;
  }

  destroy() {
    for (const t of this.discTex.values()) releaseTexture(t);
    for (const t of this.pennants) releaseTexture(t);
  }
}
