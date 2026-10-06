/**
 * The orbit stage (FRONT_PROMPT.md 13.3절): the starry deep with the red star Aster, a planet's
 * curved horizon along the bottom (city lights on the night side of a developed planet), and two
 * fleets in the side thirds. A battle is replayed from its progress: the fleets close, bolts pass
 * between them, the enemy draws back and folds away (smoke, spores or light by its people). The
 * flagship's orbital gun charges for six seconds before one great slow bolt. Before a landing the
 * drop pods go down to the planet. Nothing crosses the timer.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import type { RaceId } from '../../../core/session';
import { planetsTo, type PlanetPlan } from '../../../sim/front';
import { devLevel, type ShipKind } from '../../../sim/frontPlan';
import type { Battle } from '../../../world/front';
import { releaseTexture, toTexture } from '../../paint/brush';
import { num } from '../../paint/color';
import { clamp01, easeInOut, hash01, lerp, sm, vis, type FrontFrame } from '../frame';
import { RACE_PAL } from '../palette';
import { PX } from '../paint/kit';
import { paintDeep, paintLimb, paintStar } from '../paint/space';
import type { FrontTextures } from '../textures';

/**
 * Formation slots in units of the fleet scale (x forward toward the enemy, y down) for a fleet listed
 * flagship first, then capital ships, then escorts: the big ships hold the middle and the escorts
 * fly a wedge ahead of them.
 */
function formation(kinds: ShipKind[]): { dx: number; dy: number }[] {
  const flag = kinds[0] === 's3';
  const caps = kinds.filter((k) => k === 's2').length;
  const CAP = flag
    ? [
        [-6, -82],
        [-6, 84],
        [-70, -138],
        [-70, 140],
      ]
    : [
        [0, -34],
        [-36, 42],
        [-84, -96],
        [-112, 98],
      ];
  const tip = flag ? 150 : caps ? 96 : 30;
  let c = 0;
  let e = 0;
  return kinds.map((kind) => {
    if (kind === 's3') return { dx: -40, dy: 0 };
    if (kind === 's2') {
      const [dx, dy] = CAP[Math.min(c++, CAP.length - 1)];
      return { dx, dy };
    }
    const row = e >> 1;
    const side = e++ % 2 ? 1 : -1;
    return { dx: tip - row * 34, dy: side * (24 + row * 34) };
  });
}

/** Half sizes of the ships' art (art units) times their draw scale (see OrbitStage.ship). */
const SHIP_HALF: Record<ShipKind, [number, number]> = { s1: [20 * 1.7, 9 * 1.7], s2: [40 * 2, 16 * 2], s3: [75 * 2.3, 30 * 2.3] };

/** How far a formation reaches ahead of, behind and above/below its centre (fleet-scale units). */
function extent(kinds: ShipKind[], slots: { dx: number; dy: number }[]): { front: number; back: number; vert: number } {
  let front = 0;
  let back = 0;
  let vert = 0;
  kinds.forEach((kind, i) => {
    const [hw, hh] = SHIP_HALF[kind];
    front = Math.max(front, slots[i].dx + hw);
    back = Math.max(back, hw - slots[i].dx);
    vert = Math.max(vert, Math.abs(slots[i].dy) + hh);
  });
  return { front, back, vert };
}

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

export class OrbitStage {
  readonly root = new Container();
  private deep = new Sprite();
  private star = new Sprite();
  private limb = new Sprite();
  private ships: Pool;
  private fx: Pool;
  private lights: Pool;
  private deepKey = '';
  private limbKey = '';
  private deepTex: Texture | null = null;
  private starTex: Texture;
  private limbTex: Texture | null = null;

  constructor(private tex: FrontTextures) {
    this.starTex = toTexture(paintStar(256), { label: 'front-star' });
    this.star.texture = this.starTex;
    this.star.anchor.set(0.5);
    const shipLayer = new Container();
    const fxLayer = new Container();
    const lightLayer = new Container();
    this.root.addChild(this.deep, this.star, this.limb, lightLayer, shipLayer, fxLayer);
    this.ships = new Pool(shipLayer, () => new Sprite());
    this.fx = new Pool(fxLayer, () => {
      const s = new Sprite(tex.glow);
      s.blendMode = 'add';
      return s;
    });
    this.lights = new Pool(lightLayer, () => {
      const s = new Sprite(tex.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      return s;
    });
  }

  update(f: FrontFrame, planet: PlanetPlan, battle: Battle | null, alpha: number) {
    vis(this.root, alpha);
    if (alpha <= 0.003) return;
    const { w, h } = f;
    const k = f.k;
    // the deep and the star (painted for the viewport shape)
    const dk = `${Math.round(w / 8)}x${Math.round(h / 8)}`;
    if (dk !== this.deepKey) {
      this.deepKey = dk;
      releaseTexture(this.deepTex);
      this.deepTex = toTexture(paintDeep(Math.min(1600, w), Math.round(Math.min(1600, w) * (h / w)), 0x5d0), { label: 'front-deep' });
      this.deep.texture = this.deepTex;
    }
    this.deep.width = w;
    this.deep.height = h;
    this.star.position.set(w * 0.12, h * 0.15);
    this.star.scale.set((h * 0.34) / 256);
    this.star.alpha = 0.9;
    // the planet's horizon
    const lk = `${planet.idx}:${dk}`;
    if (lk !== this.limbKey) {
      this.limbKey = lk;
      releaseTexture(this.limbTex);
      const lw = Math.min(1600, w);
      this.limbTex = toTexture(paintLimb(planet.biome, planet.seed, lw, Math.round(lw * 0.24)), { label: 'front-limb' });
      this.limb.texture = this.limbTex;
    }
    const top = h * (f.aspect === 'wide' ? 0.7 : 0.76);
    this.limb.position.set(0, top);
    this.limb.width = w;
    this.limb.height = h - top + 4;
    this.limb.tint = 0xffffff;

    this.ships.begin();
    this.fx.begin();
    this.lights.begin();
    const v = f.v;
    const A = v.A;
    // a developed planet's night side shows its cities
    const lvl = A >= planet.conqueredAt ? devLevel(A - planet.conqueredAt) : -1;
    if (lvl >= 1) {
      const n = 18 + lvl * 10;
      for (let i = 0; i < n; i++) {
        const x = w * (0.55 + 0.42 * hash01(planet.idx, i, 1));
        const y = top + (h - top) * (0.25 + 0.7 * hash01(planet.idx, i, 2));
        const s = this.lights.next();
        s.position.set(x, y);
        s.scale.set((3 + 4 * hash01(i, 3)) * k * 2 / 64);
        s.tint = num(RACE_PAL[v.race].glow);
        s.alpha = 0.35 + 0.25 * Math.sin(f.t * 0.7 + i);
      }
    }

    // the fleets
    const left = battle ? battle.enemy === 2 : true;
    const p = battle ? f.eventP : 0;
    const secs = battle ? p * ((battle.t1 - battle.t0) / 1000) : f.t;
    const close = battle ? easeInOut(sm(0, 0.25, p)) : 0;
    const back = battle ? sm(0.82, 1, p) : 0;
    const enemyRace: RaceId = v.rivalRaces[battle ? battle.enemy - 1 : 0];
    const mine = this.fleet(v.ships, 8, 4);
    // between battles a rival picket holds the far side, dim and still (a standoff over the planet)
    const theirs = battle ? this.fleet(v.rivalShips.s1 + v.rivalShips.s2 > 0 ? v.rivalShips : { s1: 4, s2: 1, s3: 0 }, 7, 3) : this.fleet(v.rivalShips, 4, 1);
    const picket = battle ? 1 : 0.42;
    const mineAt: { x: number; y: number; kind: ShipKind; sc: number }[] = [];
    const enAt: { x: number; y: number; kind: ShipKind; sc: number }[] = [];
    // each fleet keeps to its side of the timer (wide: the side thirds; tall: the band between
    // the timer and the horizon, one half each); both share one scale so like ships match
    const tall = f.aspect !== 'wide';
    const [tx0, , , ty1] = f.L.timer;
    const m = 14;
    // (the timer's preset row is about 540 px wide, so on narrow wide screens it passes the box)
    const lim = (tall ? 0.47 * w : Math.min(tx0 * w, w / 2 - 272)) - m;
    const cy = tall ? (ty1 * h + top) / 2 : h * 0.43;
    const half = tall ? (top - ty1 * h) / 2 - 6 : h * 0.27;
    const mySlots = formation(mine);
    const enSlots = formation(theirs);
    const me = extent(mine, mySlots);
    const en = extent(theirs, enSlots);
    const fk = Math.min(k, (lim - m) / (Math.max(me.front + me.back, en.front + en.back) + 24), half / Math.max(me.vert, en.vert, 1));
    // the group's x (distance in from its own edge) as the fleets close
    const groupX = (e: { front: number; back: number }, reach: number, q: number) => {
      const near = lim - e.front * fk - (1 - reach) * 0.03 * w;
      const far = Math.max(m + e.back * fk, near - 0.06 * w);
      return lerp(far, near, q);
    };
    const sideX = (onLeft: boolean, d: number) => (onLeft ? d : w - d);
    const myG = groupX(me, 1, close);
    mine.forEach((kind, i) => {
      const dir = left ? 1 : -1;
      const drift = Math.sin(f.t * 0.3 + i * 1.7) * 3 * fk;
      const x = sideX(left, myG + mySlots[i].dx * fk);
      const y = cy + mySlots[i].dy * fk + drift;
      const sc = this.ship(v.race, kind, x, y, fk, dir, 1);
      this.engine(x, y, kind, sc, dir, v.race, f.t + i);
      mineAt.push({ x, y, kind, sc });
    });
    const enG = groupX(en, 0, close) - back * 160 * fk;
    theirs.forEach((kind, i) => {
      const dir = left ? -1 : 1;
      const drift = Math.sin(f.t * 0.33 + i * 2) * 3 * fk;
      const x = sideX(!left, enG + enSlots[i].dx * fk);
      const y = cy + enSlots[i].dy * fk + drift;
      const falls = !!battle && hash01(battle.seed, i, 7) < 0.45 && p > 0.4 + 0.4 * hash01(battle.seed, i, 8);
      const a = (falls ? 0.25 : 1) * (1 - back) * picket;
      const sc = this.ship(enemyRace, kind, x, y, fk, dir, a);
      if (!falls) this.engine(x, y, kind, sc, dir, enemyRace, f.t + i * 1.3, (1 - back) * picket);
      if (falls) this.glow(x, y, 10 * fk, num(RACE_PAL[enemyRace].glow), 0.35 * (1 - back));
      enAt.push({ x, y: falls ? NaN : y, kind, sc });
    });

    // bolts between the fleets: short streaks of light that travel, each ship on its own period,
    // hidden while they pass behind the timer
    if (battle && f.motion && p > 0.22 && p < 0.84) {
      const [x0, y0, x1, y1] = f.L.timer;
      const bx0 = Math.min(x0 * w, w / 2 - 272);
      const bx1 = Math.max(x1 * w, w / 2 + 272);
      const behind = (x: number, y: number) => x > bx0 - 8 && x < bx1 + 8 && y > y0 * h - 8 && y < y1 * h + 8;
      const TRAVEL = 0.7;
      const fire = (from: typeof mineAt, to: typeof enAt, color: number, salt: number) => {
        for (let i = 0; i < from.length; i++) {
          const a = from[i];
          if (!Number.isFinite(a.y) || !to.length) continue;
          const period = 1.6 + 1.4 * hash01(battle.seed, i, salt);
          const ph = (secs + hash01(battle.seed, i, salt + 1) * period) % period;
          if (ph > TRAVEL) continue;
          const tgt = to[Math.floor(hash01(battle.seed, i, Math.floor(secs / period), salt) * to.length)];
          if (!Number.isFinite(tgt.y)) continue;
          const q = ph / TRAVEL;
          const bx = lerp(a.x, tgt.x, q);
          const by = lerp(a.y, tgt.y, q);
          const big = a.kind === 's2' ? 1.5 : 1;
          if (!behind(bx, by)) this.bolt(bx, by, tgt.x - a.x, tgt.y - a.y, color, fk * big);
          if (q > 0.86) this.glow(tgt.x, tgt.y, 6 * fk * big, color, 0.6 * (1 - q) * 7);
        }
      };
      fire(mineAt, enAt, num(RACE_PAL[v.race].shot), 31);
      fire(enAt, mineAt, num(RACE_PAL[enemyRace].shot), 51);
      // the flagship's gun: a six-second charge at the bow, then one great slow bolt
      const flag = mineAt.find((s) => s.kind === 's3');
      if (flag && (battle.kind === 'fleet' || battle.grade >= 7)) {
        const cyc = 16;
        const ph = secs % cyc;
        const bow = flag.x + (left ? 1 : -1) * 66 * flag.sc;
        const color = num(RACE_PAL[v.race].accent2);
        if (ph < 6) this.glow(bow, flag.y, (4 + ph * 2) * fk, color, 0.25 + ph * 0.06);
        else if (ph < 7.6 && enAt.length) {
          const tgt = enAt[Math.floor(secs / cyc) % enAt.length];
          if (Number.isFinite(tgt.y)) {
            const q = (ph - 6) / 1.6;
            const bx = lerp(bow, tgt.x, q);
            const by = lerp(flag.y, tgt.y, q);
            if (!behind(bx, by)) {
              this.bolt(bx, by, tgt.x - bow, tgt.y - flag.y, color, fk * 2.6);
              this.glow(bx, by, 9 * fk, color, 0.55);
            }
            if (q > 0.85) this.glow(tgt.x, tgt.y, 22 * fk, color, 0.7);
          }
        }
      }
    }

    // drop pods going down before a landing
    const next = planetsTo(v.seed, A)[planet.idx];
    if (next && next.orbitAt >= 0 && A > next.landAt - 70_000 && A < next.landAt) {
      const q = clamp01((A - (next.landAt - 70_000)) / 70_000);
      for (let i = 0; i < 6; i++) {
        const t0 = i * 0.12;
        const fall = sm(t0, t0 + 0.35, q);
        if (fall <= 0 || fall >= 1) continue;
        const x = sideX(left, myG + (40 + i * 12) * fk);
        const y = lerp(cy, top + 20 * k, fall);
        this.glow(x, y, 5 * k, num(RACE_PAL[v.race].glow), 0.85);
      }
    }
    this.ships.end();
    this.fx.end();
    this.lights.end();
  }

  /** The ships of a fleet to draw: capital ships and the flagship first, then escorts. */
  private fleet(s: { s1: number; s2: number; s3: number }, maxEsc: number, maxCap: number): ShipKind[] {
    const out: ShipKind[] = [];
    if (s.s3 > 0) out.push('s3');
    for (let i = 0; i < Math.min(maxCap, s.s2); i++) out.push('s2');
    for (let i = 0; i < Math.min(maxEsc, s.s1); i++) out.push('s1');
    return out;
  }

  /** Draws one ship; returns its scale (screen px per art unit). */
  private ship(race: RaceId, kind: ShipKind, x: number, y: number, k: number, facing: number, alpha: number): number {
    const art = this.tex.race[race].u[kind][0];
    const s = this.ships.next();
    s.texture = art.tex;
    s.anchor.set(art.ax, art.ay);
    s.position.set(x, y);
    const sc = (kind === 's3' ? 2.3 : kind === 's2' ? 2 : 1.7) * k;
    s.scale.set((facing * sc) / PX, sc / PX);
    s.alpha = alpha;
    s.tint = 0xffffff;
    return sc;
  }

  /** A soft engine glow at a ship's stern, flickering a little. */
  private engine(x: number, y: number, kind: ShipKind, sc: number, facing: number, race: RaceId, t: number, a = 1) {
    const half = kind === 's3' ? 70 : kind === 's2' ? 38 : 18;
    const r = (kind === 's3' ? 9 : kind === 's2' ? 6 : 3.5) * sc;
    this.glow(x - facing * half * sc, y - 4 * sc, r, num(RACE_PAL[race].glow), a * (0.4 + 0.12 * Math.sin(t * 9)));
  }

  private glow(x: number, y: number, r: number, color: number, a: number) {
    const g = this.fx.next();
    g.anchor.set(0.5);
    g.texture = this.tex.glow;
    g.position.set(x, y);
    g.rotation = 0;
    g.scale.set((r * 2) / 64);
    g.tint = color;
    g.alpha = Math.min(1, a);
  }

  /** A short streak of light at (x, y) pointing along (dx, dy), its head at the point. */
  private bolt(x: number, y: number, dx: number, dy: number, color: number, k: number) {
    const s = this.fx.next();
    s.texture = this.tex.streak;
    s.anchor.set(1, 0.5);
    s.position.set(x, y);
    s.rotation = Math.atan2(dy, dx);
    s.scale.set((30 * k) / 64, (2.2 * k) / 8);
    s.tint = color;
    s.alpha = 0.9;
  }

  destroy() {
    releaseTexture(this.deepTex);
    releaseTexture(this.limbTex);
    releaseTexture(this.starTex);
  }
}
