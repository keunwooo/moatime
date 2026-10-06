/**
 * The air over the battlefield: the war tide's storm phase (the planet's own storm — sand, snow,
 * ash, rain, crystal glitter or ion haze — veiling the field and streaming in one direction), the
 * eclipse's darkness, and at night the union's searchlight cones sweeping slowly over the front.
 * Screen-space over the ground stage; everything ramps over tens of seconds (no flashes).
 */

import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { BIOME_PAL } from '../palette';
import { makeCanvas, softEllipse, toTexture, releaseTexture } from '../../paint/brush';
import { css, num } from '../../paint/color';
import { hash01, vis, type FrontFrame } from '../frame';
import type { StructureSystem } from './structures';
import type { FrontTextures } from '../textures';

function streakTile(): Texture {
  const pc = makeCanvas(256, 256);
  const { ctx } = pc;
  let s = 99;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const l = 6 + rnd() * 18;
    ctx.strokeStyle = css([255, 250, 240], 0.15 + rnd() * 0.35);
    ctx.lineWidth = 0.6 + rnd() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l, y + l * 0.18);
    ctx.stroke();
  }
  return toTexture(pc, { label: 'front-storm-streaks', repeat: 'xy' });
}

function coneTex(): Texture {
  const pc = makeCanvas(128, 256);
  const { ctx } = pc;
  const g = ctx.createLinearGradient(64, 256, 64, 0);
  g.addColorStop(0, 'rgba(255,240,210,0.55)');
  g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(64, 256);
  ctx.lineTo(0, 0);
  ctx.lineTo(128, 0);
  ctx.closePath();
  ctx.fill();
  softEllipse(ctx, 64, 22, 60, 20, [255, 240, 210], 0.25, 0);
  return toTexture(pc, { label: 'front-cone' });
}

export class AtmosSystem {
  /** Over the ground (moves with the camera): searchlight cones. */
  readonly field = new Container();
  /** Screen space: the storm's veil and streaks. */
  readonly screen = new Container();
  private veil: Sprite;
  private streaks: TilingSprite;
  private cones: Sprite[] = [];
  private streakTex: Texture;
  private cone: Texture;
  /** Extra darkness of an eclipse (0..1), read by the ground's tint. */
  eclipse = 0;

  constructor(tex: FrontTextures) {
    this.streakTex = streakTile();
    this.cone = coneTex();
    this.veil = new Sprite(tex.smoke);
    this.veil.anchor.set(0.5);
    this.streaks = new TilingSprite({ texture: this.streakTex, width: 10, height: 10 });
    this.streaks.blendMode = 'add';
    this.screen.addChild(this.veil, this.streaks);
    for (let i = 0; i < 6; i++) {
      const c = new Sprite(this.cone);
      c.anchor.set(0.5, 1);
      c.blendMode = 'add';
      this.cones.push(c);
      this.field.addChild(c);
    }
  }

  update(f: FrontFrame, st: StructureSystem, night: number) {
    const { w, h } = f;
    const pal = BIOME_PAL[f.v.planet.biome];
    // the storm: a veil of the planet's storm colour and streaks blowing across
    const storm = f.v.planet.idx >= 0 ? f.tide.storm : 0;
    this.veil.position.set(w / 2, h * 0.62);
    this.veil.scale.set((w * 2.2) / 64, (h * 1.6) / 64);
    this.veil.tint = num(pal.storm);
    vis(this.veil, storm * 0.42);
    this.streaks.width = w;
    this.streaks.height = h;
    this.streaks.tint = num(pal.storm);
    vis(this.streaks, f.motion ? storm * 0.5 : 0);
    if (f.motion) {
      this.streaks.tilePosition.x = -f.t * 140;
      this.streaks.tilePosition.y = -f.t * 26;
    }
    // an eclipse darkens the day while it lasts (ramps over 30 s at either end)
    const e = f.event;
    let ecl = 0;
    if (e && e.kind === 'eclipse') {
      const d = (e.t1 - e.t0) / 1000;
      const s = f.eventP * d;
      ecl = Math.min(1, s / 30, (d - s) / 30);
    }
    this.eclipse = Math.max(0, ecl);
    // searchlights: the union's defences sweep the front at night and in an eclipse
    const dark = Math.max(night, this.eclipse * 0.8) * (1 - storm * 0.5);
    let n = 0;
    if (f.v.race === 0 && dark > 0.05) {
      for (const [site, b] of st.basesAt) {
        if (!b.mine || n >= this.cones.length) continue;
        const c = this.cones[n++];
        c.position.set(b.x + (hash01(site, 1) - 0.5) * 30 * b.k, b.y - 18 * b.k);
        c.rotation = -0.5 + 0.9 * Math.sin(f.t * 0.12 + hash01(site, 2) * 6) * (f.motion ? 1 : 0);
        c.scale.set((70 * b.k) / 128, (150 * b.k) / 256);
        vis(c, dark * 0.32);
      }
    }
    for (; n < this.cones.length; n++) this.cones[n].visible = false;
  }

  destroy() {
    releaseTexture(this.streakTex);
    releaseTexture(this.cone);
  }
}
