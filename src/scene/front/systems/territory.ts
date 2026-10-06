/**
 * Territory: each people's ground mark spreads out from the bases and sites it holds (the radius
 * grows with the base's age, FRONT.md 3.5절):
 * - the union lays paving and roads (a grid of plates and lamp-lit lines),
 * - the swarm's carpet covers the ground with glowing veins (it pulses),
 * - the choir's resonance field draws rings of chords on the ground.
 * Painted into a small canvas when ownership changes or the regions grow, laid over the terrain;
 * the swarm's veins have a second, additive layer that breathes on the ambient clock.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { RaceId } from '../../../core/session';
import { HOME, NAT, RIVAL_HOME, SITE_COUNT } from '../../../sim/front';
import { makeCanvas, type PaintCanvas } from '../../paint/brush';
import { css, lighten } from '../../paint/color';
import { hash01, vis, type FrontFrame } from '../frame';
import { sitePos, type P } from '../layout';
import { RACE_PAL } from '../palette';

const TW = 384;
const TH = 216;
const MIN = 60_000;

interface Region {
  c: P;
  /** Radius as a share of the map's width. */
  r: number;
  race: RaceId;
  seed: number;
}

export class TerritorySystem {
  readonly root = new Container();
  private pc: PaintCanvas;
  private glowPc: PaintCanvas;
  private tex: Texture;
  private glowTex: Texture;
  private sprite: Sprite;
  private glow: Sprite;
  private key = '';
  /** The territory canvas (the minimap shows it too). */
  get texture(): Texture {
    return this.tex;
  }

  constructor() {
    this.pc = makeCanvas(TW, TH);
    this.glowPc = makeCanvas(TW, TH);
    this.tex = Texture.from(this.pc.canvas);
    this.glowTex = Texture.from(this.glowPc.canvas);
    this.sprite = new Sprite(this.tex);
    this.glow = new Sprite(this.glowTex);
    this.glow.blendMode = 'add';
    this.root.addChild(this.sprite, this.glow);
  }

  update(f: FrontFrame) {
    const { v, L, w, h } = f;
    const p = v.planet;
    this.sprite.width = w;
    this.sprite.height = h;
    this.glow.width = w;
    this.glow.height = h;
    // the carpet's veins breathe (ambient clock)
    vis(this.glow, 0.55 + 0.35 * Math.sin(f.t * 0.8));

    const regions: Region[] = [];
    const grow = (age: number, r0: number, r1: number) => r0 + (r1 - r0) * (1 - Math.exp(-Math.max(0, age) / (20 * MIN)));
    const A = v.A;
    // mine
    for (const b of v.bases) {
      if (b.lost) continue;
      const at = b.site === HOME ? L.home : sitePos(L, p.seed, b.site, p.natSide);
      const age = b.age >= 0 ? b.age * 1000 : -1;
      if (age < 0 && b.site !== HOME) continue;
      const r = b.site === HOME ? grow(A - p.landAt, 0.1, 0.16) : grow(age, b.site === NAT ? 0.05 : 0.04, b.site === NAT ? 0.1 : 0.085);
      regions.push({ c: at, r, race: v.race, seed: b.site + 3 });
    }
    // the rivals'
    for (let s = 0; s < 2; s++) {
      if (v.owners[RIVAL_HOME[s]] !== s + 1) continue;
      regions.push({ c: L.rivalHome[s], r: grow(A - p.landAt, 0.08, 0.13), race: v.rivalRaces[s], seed: 90 + s });
    }
    for (let i = 0; i < SITE_COUNT; i++) {
      const o = v.owners[i];
      if (o !== 1 && o !== 2) continue;
      const since = v.since[i] >= 0 ? v.since[i] : 0;
      regions.push({ c: sitePos(L, p.seed, i, p.natSide), r: grow(A - since - 30_000, 0.03, 0.075), race: v.rivalRaces[o - 1], seed: 40 + i });
    }
    // repaint when a region appears, goes or grows by a visible step
    const key = `${p.idx}:${f.aspect}:${regions.map((g) => `${g.race}${Math.round(g.c.x * 99)}${Math.round(g.r * 400)}`).join(',')}`;
    if (key === this.key) return;
    this.key = key;
    this.paint(regions, w / h);
  }

  private paint(regions: Region[], aspect: number) {
    const ctx = this.pc.ctx;
    const gctx = this.glowPc.ctx;
    ctx.clearRect(0, 0, TW, TH);
    gctx.clearRect(0, 0, TW, TH);
    const sy = 0.62 * aspect * (TH / TW);
    for (const race of [0, 1, 2] as RaceId[]) {
      const mine = regions.filter((g) => g.race === race);
      if (!mine.length) continue;
      const pal = RACE_PAL[race];
      const tmp = makeCanvas(TW, TH);
      const t = tmp.ctx;
      // the region: soft-edged ellipses
      for (const g of mine) {
        const x = g.c.x * TW;
        const y = g.c.y * TH;
        const R = g.r * TW;
        t.save();
        t.translate(x, y);
        t.scale(1, sy);
        const grad = t.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
        grad.addColorStop(0, css(pal.ground, race === 1 ? 0.5 : 0.3));
        grad.addColorStop(0.85, css(pal.ground, race === 1 ? 0.42 : 0.22));
        grad.addColorStop(1, css(pal.ground, 0));
        t.fillStyle = grad;
        t.beginPath();
        t.arc(0, 0, R, 0, Math.PI * 2);
        t.fill();
        t.restore();
      }
      // the people's own pattern, only where the region is
      t.save();
      t.globalCompositeOperation = 'source-atop';
      if (race === 0) {
        // paving: a grid of plate seams and a lamp-lit road between the bases
        t.strokeStyle = css(lighten(pal.ground, 0.25), 0.35);
        t.lineWidth = 0.6;
        for (let x = 0; x < TW; x += 7) {
          t.beginPath();
          t.moveTo(x, 0);
          t.lineTo(x + TH * 0.3, TH);
          t.stroke();
        }
        for (let y = 0; y < TH; y += 4.5) {
          t.beginPath();
          t.moveTo(0, y);
          t.lineTo(TW, y);
          t.stroke();
        }
      } else if (race === 1) {
        // the carpet: branching veins
        t.strokeStyle = css(pal.bodyDark, 0.55);
        t.lineWidth = 0.9;
        for (const g of mine) this.veins(t, g, sy, 34);
      } else {
        // resonance: rings of chords around each spire
        t.strokeStyle = css(pal.accent, 0.42);
        t.lineWidth = 0.7;
        for (const g of mine) {
          for (let k = 0.25; k < 1; k += 0.16) {
            t.beginPath();
            t.ellipse(g.c.x * TW, g.c.y * TH, g.r * TW * k, g.r * TW * k * sy, 0, 0, Math.PI * 2);
            t.stroke();
          }
        }
      }
      t.restore();
      ctx.drawImage(tmp.canvas, 0, 0);
      // the carpet's glowing veins and the field's light go to the additive layer
      if (race === 1) {
        gctx.save();
        gctx.strokeStyle = css(pal.glow, 0.32);
        gctx.lineWidth = 0.7;
        for (const g of mine) this.veins(gctx, g, sy, 18);
        gctx.restore();
      } else if (race === 2) {
        gctx.save();
        gctx.strokeStyle = css(pal.glow, 0.16);
        gctx.lineWidth = 0.6;
        for (const g of mine) {
          gctx.beginPath();
          gctx.ellipse(g.c.x * TW, g.c.y * TH, g.r * TW * 0.5, g.r * TW * 0.5 * sy, 0, 0, Math.PI * 2);
          gctx.stroke();
        }
        gctx.restore();
      }
    }
    this.tex.source.update();
    this.glowTex.source.update();
  }

  /** Branching veins from a region's centre (deterministic per region). */
  private veins(t: CanvasRenderingContext2D, g: Region, sy: number, n: number) {
    const cx = g.c.x * TW;
    const cy = g.c.y * TH;
    const R = g.r * TW;
    for (let i = 0; i < n; i++) {
      let a = hash01(g.seed, i, 1) * Math.PI * 2;
      let x = cx;
      let y = cy;
      const len = R * (0.45 + 0.55 * hash01(g.seed, i, 2));
      t.beginPath();
      t.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        a += (hash01(g.seed, i, s + 3) - 0.5) * 0.9;
        x += Math.cos(a) * (len / 6);
        y += Math.sin(a) * (len / 6) * sy;
        t.lineTo(x, y);
      }
      t.stroke();
    }
  }

  destroy() {
    this.tex.destroy(true);
    this.glowTex.destroy(true);
  }
}
