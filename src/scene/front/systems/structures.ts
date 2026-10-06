/**
 * Buildings on the battlefield: my bases (the home plateau, the natural, every expansion site I
 * hold) and the rivals' (their home plateaus and the sites they hold), each with its buildings in
 * fixed slots. Construction shows each people's way of building (FRONT_PROMPT.md 4절):
 * - the union raises scaffolding and the building rises behind it from the ground up,
 * - the swarm's buildings sprout and swell out of the carpet,
 * - the choir's appear as a glowing outline that fills and hardens.
 * A lost base stands wrecked (dark, smoking) until the site is won back.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import type { RaceId } from '../../../core/session';
import { HOME, NAT, planetWorks, RIVAL_HOME, rivalLag, type BuildEvt } from '../../../sim/front';
import { BUILD_MS, type BuildingKind } from '../../../sim/frontPlan';
import { clearIfDrawn, ownGroup } from '../../gfx';
import { num } from '../../paint/color';
import { clamp01, easeOut, hash01, sm, vis, type FrontFrame } from '../frame';
import { depthScale, sitePos, type P } from '../layout';
import { RACE_PAL } from '../palette';
import { PX } from '../paint/kit';
import type { FrontTextures } from '../textures';

/** Slot offsets on a plateau, in shares of its radii (back first, the front lane kept free). */
const PLATEAU_SLOTS: [number, number][] = [
  [-0.46, -0.5],
  [0.46, -0.52],
  [-0.8, -0.08],
  [0.0, 0.0],
  [0.8, -0.1],
  [0.62, 0.34],
  [-0.62, 0.34],
  [-0.2, -0.72],
  [-0.72, 0.66],
  [0.2, -0.74],
  [0.72, 0.64],
  [-0.92, 0.3],
  [0.92, 0.28],
  [-0.4, 0.66],
  [0.0, -0.86],
  [0.4, 0.68],
  [0.95, -0.38],
  [-0.95, -0.36],
];
/** Slots around an expansion's base building (art units at depth 1). */
const SITE_SLOTS: [number, number][] = [
  [-30, -6],
  [28, -4],
  [-20, 12],
  [22, 13],
  [0, -18],
];

interface Piece {
  root: Container;
  body: Sprite;
  shadow: Sprite;
  light: Sprite;
  mask: Graphics | null;
  maskStep: number;
  race: RaceId;
  seen: number;
}

export class StructureSystem {
  /** Buildings are children of the shared depth-sorted entity layer (set by the scene). */
  layer!: Container;
  /** Scaffolding lines (redrawn only while something is going up). */
  readonly scaffold = ownGroup(new Container());
  private scaffoldG = new Graphics();
  private pieces = new Map<string, Piece>();
  private frame = 0;
  /** Base positions this frame (screen px, on the ground), read by units and effects. */
  readonly basesAt = new Map<number, { x: number; y: number; k: number; mine: boolean }>();

  constructor(private tex: FrontTextures) {
    this.scaffold.addChild(this.scaffoldG);
  }

  /** Screen point of a map point standing on its ground level. */
  static ground(f: FrontFrame, p: P, level: number): { x: number; y: number } {
    return { x: p.x * f.w, y: p.y * f.h - level * f.L.cliff * f.h };
  }

  private piece(key: string, race: RaceId, kind: BuildingKind): Piece {
    let p = this.pieces.get(key);
    if (p && p.race === race) return p;
    if (p) this.drop(key);
    const art = this.tex.race[race].b[kind];
    const root = new Container();
    const shadow = new Sprite(this.tex.shadow);
    shadow.anchor.set(0.5);
    const body = new Sprite(art.tex);
    body.anchor.set(art.ax, art.ay);
    const light = new Sprite(this.tex.glow);
    light.anchor.set(0.5);
    light.blendMode = 'add';
    light.tint = num(RACE_PAL[race].glow);
    root.addChild(shadow, body, light);
    this.layer.addChild(root);
    p = { root, body, shadow, light, mask: null, maskStep: -1, race, seen: 0 };
    this.pieces.set(key, p);
    return p;
  }

  private drop(key: string) {
    const p = this.pieces.get(key);
    if (!p) return;
    p.mask?.destroy();
    p.root.destroy({ children: true });
    this.pieces.delete(key);
  }

  update(f: FrontFrame, landTint: number, night: number) {
    this.frame++;
    const frame = this.frame;
    const v = f.v;
    const planet = v.planet;
    const L = f.L;
    const g = this.scaffoldG;
    clearIfDrawn(g);
    this.basesAt.clear();
    const works = planetWorks(planet);

    const place = (key: string, race: RaceId, kind: BuildingKind, x: number, y: number, k: number, u: number, opts: { wreck?: boolean; t0?: number } = {}) => {
      const p = this.piece(key, race, kind);
      p.seen = frame;
      const art = this.tex.race[race].b[kind];
      const s = (k * 1) / PX;
      p.root.position.set(x, y);
      p.root.zIndex = y;
      p.shadow.position.set(art.w * s * 0.06, 0);
      p.shadow.scale.set((art.w * s * 0.95) / 64, (art.w * s * 0.28) / 32);
      p.body.scale.set(s);
      p.body.tint = opts.wreck ? 0x5a5258 : landTint;
      // construction by people
      const done = u >= 1;
      if (race === 0) {
        // the union: foundation, then the building rises behind scaffolding
        const rise = sm(0.12, 0.92, u);
        p.body.visible = rise > 0;
        if (!done && rise > 0) {
          if (!p.mask) {
            p.mask = new Graphics();
            p.root.addChild(p.mask);
            p.body.mask = p.mask;
            p.maskStep = -1;
          }
          const bw = art.w * s;
          const bh = art.h * s;
          // the mask is redrawn only when the rise moves on a step (a redraw rebuilds the draw list)
          const step = Math.round(rise * 48) + Math.round(bh);
          if (step !== p.maskStep) {
            p.maskStep = step;
            const top = -art.ay * bh + bh * (1 - Math.round(rise * 48) / 48);
            p.mask.clear().rect(-art.ax * bw - 2, top, bw + 4, bh).fill(0xffffff);
          }
          // scaffold poles and planks over the unfinished part
          const sx = x - art.ax * bw * 0.85;
          const ex = x + (1 - art.ax) * bw * 0.85;
          const yTop = y - art.ay * bh * 0.95;
          const col = num(RACE_PAL[0].accent2);
          for (const px of [sx, (sx + ex) / 2, ex]) g.moveTo(px, y).lineTo(px, yTop).stroke({ width: Math.max(1, k * 0.7), color: 0x3e474f, alpha: 0.8 });
          for (let yy = y - bh * 0.15; yy > yTop; yy -= bh * 0.22) g.moveTo(sx, yy).lineTo(ex, yy).stroke({ width: Math.max(1, k * 0.6), color: col, alpha: 0.75 });
        } else if (p.mask) {
          p.body.mask = null;
          p.mask.destroy();
          p.mask = null;
        }
        p.body.alpha = 1;
      } else if (race === 1) {
        // the swarm: it sprouts and swells
        const e = easeOut(sm(0.05, 1, u));
        p.body.visible = e > 0.01;
        p.body.scale.set(s * (0.55 + 0.45 * e) * (done ? 1 : 1 + 0.03 * Math.sin(f.t * 2 + x)), s * e);
        p.body.alpha = 0.6 + 0.4 * e;
      } else {
        // the choir: an outline of light that fills and hardens
        const e = sm(0.1, 1, u);
        p.body.visible = e > 0.01;
        p.body.alpha = 0.25 + 0.75 * e;
        if (!done) p.body.tint = 0xfff4f6;
      }
      // light: windows and pores glow at night (and a construction glow)
      const bw = art.w * s;
      p.light.position.set(0, -art.ay * art.h * s * 0.5);
      p.light.scale.set((bw * 1.4) / 64);
      vis(p.light, opts.wreck ? 0 : done ? night * 0.32 : race === 2 ? 0.35 * (1 - u) + 0.1 : 0);
      // a wreck smokes
      if (opts.wreck) p.body.alpha = 0.85;
    };

    const plateauSlot = (c: P, r: P, slot: number, level: number, kind: BuildingKind) => {
      const o = PLATEAU_SLOTS[slot % PLATEAU_SLOTS.length];
      let ox = o[0];
      let oy = o[1];
      if (kind === 'wall') {
        // the wall stands at the top of the ramp, on the natural's side
        ox = (planet.natSide === 0 ? -1 : 1) * 0.55;
        oy = 0.72;
      }
      const pos = { x: c.x + ox * r.x * 0.82, y: c.y + oy * r.y * 0.78 };
      return { ...StructureSystem.ground(f, pos, level), k: f.k * depthScale(pos.y) };
    };

    // ---- my bases ---------------------------------------------------------------------------
    const myRace = v.race;
    for (const b of v.bases) {
      const base = works.bases[b.i];
      const level = b.site === HOME ? 1 : 0;
      const at = b.site === HOME ? L.home : sitePos(L, planet.seed, b.site, planet.natSide);
      const kind: BuildingKind = b.site === HOME ? 'hq' : 'outpost';
      const gp = b.site === HOME ? StructureSystem.ground(f, { x: at.x, y: at.y - L.homeR.y * 0.18 }, level) : StructureSystem.ground(f, at, level);
      const k = f.k * depthScale(at.y);
      this.basesAt.set(b.site, { x: gp.x, y: gp.y, k, mine: !b.lost });
      place(`me:${planet.idx}:${b.i}:base`, myRace, kind, gp.x, gp.y, k, b.u, { wreck: b.lost });
      void base;
    }
    for (const bd of v.builds) {
      const base = works.bases[bd.base];
      const b = v.bases.find((x) => x.i === bd.base);
      if (!b) continue;
      const lost = base.lostAt >= 0 && v.A >= base.lostAt;
      let pos: { x: number; y: number; k: number };
      if (bd.site === HOME) pos = plateauSlot(L.home, L.homeR, bd.slot, 1, bd.kind);
      else {
        const at = sitePos(L, planet.seed, bd.site, planet.natSide);
        const o = SITE_SLOTS[bd.slot % SITE_SLOTS.length];
        const k = f.k * depthScale(at.y);
        pos = { x: at.x * f.w + o[0] * k, y: at.y * f.h + o[1] * k, k };
      }
      place(`me:${planet.idx}:${bd.base}:${bd.slot}`, myRace, bd.kind, pos.x, pos.y, pos.k, bd.u, { wreck: lost });
    }

    // ---- the rivals ----------------------------------------------------------------------------
    const lag = rivalLag(v.seed);
    const homeOrder = works.builds.filter((x: BuildEvt) => x.site === HOME);
    for (let side = 0; side < 2; side++) {
      const race = v.rivalRaces[side];
      const homeSite = RIVAL_HOME[side];
      const owned = v.owners[homeSite] === side + 1;
      if (!owned) continue;
      const c = L.rivalHome[side];
      const gp = StructureSystem.ground(f, { x: c.x, y: c.y - L.rivalR.y * 0.2 }, 1);
      const k = f.k * depthScale(c.y);
      this.basesAt.set(homeSite, { x: gp.x, y: gp.y, k, mine: false });
      place(`rv:${planet.idx}:${side}:base`, race, 'hq', gp.x, gp.y, k, 1);
      // their home grows on the same plan, a little later
      for (const bd of homeOrder) {
        const t0 = bd.t0 + lag;
        if (v.A < t0 || bd.kind === 'shipyard') continue;
        const u = clamp01((v.A - t0) / Math.max(1, bd.t1 - bd.t0));
        const pos = plateauSlot(c, L.rivalR, bd.slot + 1, 1, bd.kind === 'wall' ? 'defense' : bd.kind);
        place(`rv:${planet.idx}:${side}:${bd.slot}`, race, bd.kind === 'wall' ? 'defense' : bd.kind, pos.x, pos.y, pos.k * 0.92, u);
      }
    }
    // sites the rivals hold
    for (let s = 0; s < 12; s++) {
      const o = v.owners[s];
      if (o !== 1 && o !== 2) continue;
      const race = v.rivalRaces[o - 1];
      const since = v.since[s] >= 0 ? v.since[s] : 0;
      const at = sitePos(L, planet.seed, s, planet.natSide);
      const k = f.k * depthScale(at.y);
      const gp = StructureSystem.ground(f, at, 0);
      this.basesAt.set(s, { x: gp.x, y: gp.y, k, mine: false });
      const u = clamp01((v.A - since - 30_000) / BUILD_MS.outpost);
      if (u <= 0) continue;
      place(`rs:${planet.idx}:${s}:${since}:base`, race, 'outpost', gp.x, gp.y, k, u);
      const extra: BuildingKind[] = ['gas', 'defense'];
      extra.forEach((kind, i) => {
        const t0 = since + 30_000 + BUILD_MS.outpost + (i + 1) * 60_000;
        if (v.A < t0) return;
        const o2 = SITE_SLOTS[i];
        place(`rs:${planet.idx}:${s}:${since}:${i}`, race, kind, gp.x + o2[0] * k, gp.y + o2[1] * k, k, clamp01((v.A - t0) / BUILD_MS[kind]));
      });
    }
    void NAT;
    void hash01;

    // drop what is no longer on the field
    for (const [key, p] of this.pieces) if (p.seen !== frame) this.drop(key);
  }

  count(): number {
    return this.pieces.size;
  }
}
