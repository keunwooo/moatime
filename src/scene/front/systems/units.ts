/**
 * Workers and armies on the battlefield. Workers walk between their base and its ore field
 * (mine, carry, drop) on the war's clock, so they stop when the timer does. The army stands in
 * ranks at its rally point — the heavy units in front, flyers above — and new units walk out
 * from the production building to their place in the ranks. The rivals' armies stand at their
 * homes. During a fight the scene's combat system takes units from here (see `slots`).
 */

import { Container, Sprite } from 'pixi.js';
import type { RaceId } from '../../../core/session';
import { HOME, NAT, planetWorks, workerTimes } from '../../../sim/front';
import { armyArrival, flies, type ArmyKind, type UnitKind } from '../../../sim/frontPlan';
import { clamp01, easeInOut, hash01, lerp, vis, type FrontFrame } from '../frame';
import { depthScale, sitePos, type P } from '../layout';
import { PX, UNIT_SCALE } from '../paint/kit';
import type { FrontTextures } from '../textures';
import type { StructureSystem } from './structures';

/** Rank order: heavy ground units in front, then the line, flyers above the ranks. */
const ORDER: ArmyKind[] = ['t3', 't2', 't2s', 't1b', 't1', 't3a'];
const MAX_SHOWN = 60;
const MAX_RIVAL = 24;
const MAX_WORKERS = 34;

export interface UnitSlot {
  kind: UnitKind;
  /** Screen position (on the ground) and size factor. */
  x: number;
  y: number;
  k: number;
  air: boolean;
}

class Pool {
  private list: { root: Container; body: Sprite; shadow: Sprite }[] = [];
  private used = 0;
  constructor(
    private layer: Container,
    private tex: FrontTextures,
  ) {}
  begin() {
    this.used = 0;
  }
  next() {
    let it = this.list[this.used];
    if (!it) {
      const root = new Container();
      const shadow = new Sprite(this.tex.shadow);
      shadow.anchor.set(0.5);
      const body = new Sprite();
      root.addChild(shadow, body);
      this.layer.addChild(root);
      it = { root, body, shadow };
      this.list.push(it);
    }
    this.used++;
    it.root.visible = true;
    return it;
  }
  end() {
    for (let i = this.used; i < this.list.length; i++) this.list[i].root.visible = false;
  }
  get size() {
    return this.used;
  }
}

export class UnitSystem {
  layer!: Container;
  private pool!: Pool;
  /** The army's slots this frame (screen px), read by the combat system. */
  readonly army: UnitSlot[] = [];
  readonly rivals: [UnitSlot[], UnitSlot[]] = [[], []];
  /** Where the army gathers (map point), read by the camera and combat. */
  rally: P = { x: 0.5, y: 0.8 };

  constructor(private tex: FrontTextures) {}

  attach(layer: Container) {
    this.layer = layer;
    this.pool = new Pool(layer, this.tex);
  }

  private draw(race: RaceId, kind: UnitKind, x: number, y: number, k0: number, pose: 0 | 1, facing: number, tint: number, alpha = 1) {
    const k = k0 * UNIT_SCALE;
    const art = this.tex.race[race].u[kind][pose];
    const it = this.pool.next();
    const air = flies(race, kind);
    const lift = air ? (kind === 't3a' ? 26 : 16) * k : 0;
    it.root.position.set(x, y);
    it.root.zIndex = y + (air ? 2000 : 0);
    it.body.texture = art.tex;
    it.body.anchor.set(art.ax, art.ay);
    it.body.position.set(0, -lift);
    it.body.scale.set((facing * k) / PX, k / PX);
    it.body.tint = tint;
    it.body.alpha = alpha;
    const sw = (art.w / PX) * k * (air ? 0.7 : 0.9);
    it.shadow.scale.set(sw / 64, (sw * 0.3) / 32);
    it.shadow.alpha = air ? 0.35 : 0.55;
  }

  update(f: FrontFrame, st: StructureSystem, tint: number, hidden: (x: number, y: number, mine: boolean) => boolean, pulled = 0, rivalPulled: [number, number] = [0, 0]) {
    const v = f.v;
    const planet = v.planet;
    const L = f.L;
    this.pool.begin();
    const A = v.A;

    // ---- workers -------------------------------------------------------------------------------
    const ws = workerTimes(planet).filter((w) => w.t <= A);
    const lostSites = new Set(planetWorks(planet).bases.filter((b) => b.lostAt >= 0 && A >= b.lostAt).map((b) => b.site));
    const bySite = new Map<number, number>();
    let shownW = 0;
    for (let j = 0; j < ws.length && shownW < MAX_WORKERS; j++) {
      const w = ws[j];
      if (lostSites.has(w.site) && w.site !== HOME) continue;
      const n = bySite.get(w.site) ?? 0;
      bySite.set(w.site, n + 1);
      const base = st.basesAt.get(w.site);
      if (!base) continue;
      const level = w.site === HOME ? 1 : 0;
      const at = w.site === HOME ? { x: L.home.x, y: L.home.y } : sitePos(L, planet.seed, w.site, planet.natSide);
      const k = f.k * depthScale(at.y);
      // the ore arc behind the base: each worker has its own rock
      const ang = -Math.PI * 0.92 + (((n * 0.37) % 1) * 0.84 + 0.04) * Math.PI;
      const ox = at.x * f.w + Math.cos(ang) * 34 * k;
      const oy = at.y * f.h - level * L.cliff * f.h + Math.sin(ang) * 15 * k - 2 * k;
      const bx = base.x + (n % 2 ? 6 : -6) * k;
      const by = base.y + 3 * k;
      const trip = 24_000 + hash01(planet.idx, j, 61) * 6000;
      const ph = (((A - w.t) / trip) % 1 + 1) % 1;
      let x: number;
      let y: number;
      let facing = 1;
      if (ph < 0.38) {
        const e = easeInOut(ph / 0.38);
        x = lerp(bx, ox, e);
        y = lerp(by, oy, e);
        facing = ox >= bx ? 1 : -1;
      } else if (ph < 0.56) {
        x = ox;
        y = oy;
        facing = ox >= bx ? 1 : -1;
      } else if (ph < 0.94) {
        const e = easeInOut((ph - 0.56) / 0.38);
        x = lerp(ox, bx, e);
        y = lerp(oy, by, e);
        facing = ox >= bx ? -1 : 1;
      } else {
        x = bx;
        y = by;
      }
      if (hidden(x, y, true)) continue;
      const pose = (Math.floor((A / 1000) * 3 + j) % 2) as 0 | 1;
      this.draw(v.race, 'worker', x, y, k, ph > 0.38 && ph < 0.56 ? 1 : pose, facing, tint);
      shownW++;
    }

    // ---- my army ----------------------------------------------------------------------------
    // the rally point: below the home ramp at first, then in front of the newest base
    const bases = v.bases.filter((b) => !b.lost && b.age >= 0 && b.site !== HOME);
    const newest = bases.length ? bases[bases.length - 1] : null;
    let rally: P;
    if (!newest || newest.site === NAT || bases.length < 2) {
      const n = L.nat[planet.natSide];
      rally = { x: (L.home.x + n.x) / 2, y: Math.max(L.home.y, n.y) - 0.02 };
    } else {
      const at = sitePos(L, planet.seed, newest.site, planet.natSide);
      // a step toward the lake's rim from the base (the front line), never onto the lake
      const toward = { x: lerp(at.x, L.lake.c.x, 0.22), y: lerp(at.y, L.lake.c.y + L.lake.r.y * 0.9, 0.2) };
      rally = toward;
    }
    // in the offensive the ranks move up toward the front
    const march = f.tide.march;
    rally = { x: rally.x, y: rally.y - 0.02 * march };
    this.rally = rally;
    this.army.length = 0;
    const counts = { ...v.army };
    const kinds: ArmyKind[] = [];
    for (const kind of ORDER) for (let i = 0; i < counts[kind]; i++) kinds.push(kind);
    const shown = Math.min(MAX_SHOWN, kinds.length);
    const rk = f.k * depthScale(rally.y);
    const cols = 8;
    const side = rally.x < 0.5 ? 1 : -1;
    for (let i = 0; i < shown; i++) {
      const kind = kinds[i];
      const air = flies(v.race, kind);
      const row = Math.floor(i / cols);
      const col = i % cols;
      // ranks: a slight stagger, facing the front (toward the lake's side)
      let x = rally.x * f.w + (col - cols / 2 + 0.5) * 9.5 * UNIT_SCALE * rk + (row % 2) * 3 * rk;
      let y = rally.y * f.h + row * 7 * UNIT_SCALE * rk - (air ? 6 * rk : 0);
      // a new unit walks out from the production building
      const idx = v.armyN - shown + i;
      const born = armyArrival(Math.max(0, idx));
      const since = A - born;
      if (since >= 0 && since < 18_000 && idx >= 0) {
        const home = st.basesAt.get(HOME);
        if (home) {
          const e = easeInOut(clamp01(since / 18_000));
          x = lerp(home.x + 30 * rk, x, e);
          y = lerp(home.y + 8 * rk, y, e);
        }
      }
      // the slot is kept even when its unit is away fighting (the fight starts from here)
      this.army.push({ kind, x, y, k: rk, air });
      if (i < pulled || hidden(x, y, true)) continue;
      // idle: a little shuffle; in the offensive, marching in step
      const pose = (Math.floor(f.t * (march > 0.5 ? 2.2 : 0.6) + hash01(i, 9) * 4) % 2) as 0 | 1;
      this.draw(v.race, kind, x, y, rk, pose, side, tint);
    }

    // ---- the rivals' armies at home ---------------------------------------------------------------
    for (let s = 0; s < 2; s++) {
      this.rivals[s].length = 0;
      if (v.owners[13 + s] !== s + 1) continue;
      const race = v.rivalRaces[s];
      const c = L.rivalHome[s];
      const at = { x: c.x + (s === 0 ? 0.06 : -0.06), y: c.y + L.rivalR.y * 1.25 };
      const k = f.k * depthScale(at.y) * 0.95;
      const mix = v.rivals[s];
      const list: ArmyKind[] = [];
      for (const kind of ORDER) for (let i = 0; i < mix[kind]; i++) list.push(kind);
      const n = Math.min(MAX_RIVAL, list.length);
      for (let i = rivalPulled[s]; i < n; i++) {
        const row = Math.floor(i / 6);
        const col = i % 6;
        const x = at.x * f.w + (col - 2.5) * 9 * UNIT_SCALE * k;
        const y = at.y * f.h + row * 6.5 * UNIT_SCALE * k;
        if (hidden(x, y, false)) continue;
        this.rivals[s].push({ kind: list[i], x, y, k, air: flies(race, list[i]) });
        const pose = (Math.floor(f.t * 0.5 + hash01(s, i) * 4) % 2) as 0 | 1;
        this.draw(race, list[i], x, y, k, pose, s === 0 ? 1 : -1, tint, 0.95);
      }
    }
    this.pool.end();
    void vis;
  }

  count(): number {
    return this.pool.size;
  }
}
