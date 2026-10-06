/**
 * The orbit stage (FRONT_PROMPT.md 13.3절): the starry deep with the red star Aster, a planet's
 * curved horizon along the bottom (city lights on the night side of a developed planet), and two
 * fleets in the side thirds. A battle is replayed from its progress: the fleets close, beams pass
 * between them, the enemy draws back and folds away (smoke, spores or light by its people). The
 * flagship's orbital gun charges for six seconds before its thin warm beam. Before a landing the
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
    const myX = left ? 0.2 : 0.8;
    const enX = left ? 0.8 : 0.2;
    const p = battle ? f.eventP : 0;
    const secs = battle ? p * ((battle.t1 - battle.t0) / 1000) : f.t;
    const close = battle ? easeInOut(sm(0, 0.25, p)) : 0;
    const back = battle ? sm(0.82, 1, p) : 0;
    const enemyRace: RaceId = v.rivalRaces[battle ? battle.enemy - 1 : 0];
    const mine = this.fleet(v.ships, 8, 4);
    const theirs = battle ? this.fleet(v.rivalShips.s1 + v.rivalShips.s2 > 0 ? v.rivalShips : { s1: 4, s2: 1, s3: 0 }, 7, 3) : [];
    const mineAt: { x: number; y: number; kind: ShipKind }[] = [];
    const enAt: { x: number; y: number; kind: ShipKind }[] = [];
    const fy = (i: number, n: number) => h * (0.2 + 0.42 * ((i + 0.5) / Math.max(1, n)));
    mine.forEach((kind, i) => {
      const drift = Math.sin(f.t * 0.3 + i) * 3 * k;
      const x = w * lerp(myX + (left ? -0.08 : 0.08), myX + (left ? 0.06 : -0.06), close) + (kind === 's3' ? (left ? -60 : 60) * k : (hash01(i, 5) - 0.5) * 50 * k);
      const y = kind === 's3' ? h * 0.42 : fy(i, mine.length) + drift;
      this.ship(v.race, kind, x, y, k, left ? 1 : -1, 1);
      mineAt.push({ x, y, kind });
    });
    theirs.forEach((kind, i) => {
      const drift = Math.sin(f.t * 0.33 + i * 2) * 3 * k;
      const x = w * lerp(enX + (left ? 0.1 : -0.1), enX + (left ? -0.04 : 0.04), close) + (hash01(i, 6) - 0.5) * 50 * k + (left ? 1 : -1) * back * 160 * k;
      const y = fy(i, theirs.length) + drift;
      const falls = hash01(battle!.seed, i, 7) < 0.45 && p > 0.4 + 0.4 * hash01(battle!.seed, i, 8);
      const a = (falls ? 0.25 : 1) * (1 - back);
      this.ship(enemyRace, kind, x, y, k, left ? -1 : 1, a);
      if (falls) this.glow(x, y, 10 * k, num(RACE_PAL[enemyRace].glow), 0.35 * (1 - back));
      enAt.push({ x, y: falls ? NaN : y, kind });
    });

    // beams between the fleets (each ship on its own period; thin lines, no flash)
    if (battle && f.motion && p > 0.22 && p < 0.84) {
      const fire = (from: typeof mineAt, to: typeof enAt, color: number, salt: number) => {
        for (let i = 0; i < from.length; i++) {
          const a = from[i];
          if (!Number.isFinite(a.y) || !to.length) continue;
          const period = 1.6 + 1.4 * hash01(battle.seed, i, salt);
          const ph = (secs + hash01(battle.seed, i, salt + 1) * period) % period;
          if (ph > 0.3) continue;
          const tgt = to[Math.floor(hash01(battle.seed, i, Math.floor(secs / period), salt) * to.length)];
          if (!Number.isFinite(tgt.y)) continue;
          this.beam(a.x, a.y, tgt.x, tgt.y, color, k * (a.kind === 's2' ? 1.6 : 1), 1 - ph / 0.3);
        }
      };
      fire(mineAt, enAt, num(RACE_PAL[v.race].shot), 31);
      fire(enAt, mineAt, num(RACE_PAL[enemyRace].shot), 51);
      // the flagship's gun: a six-second charge, then a thin warm beam
      const flag = mineAt.find((s) => s.kind === 's3');
      if (flag && (battle.kind === 'fleet' || battle.grade >= 7)) {
        const cyc = 16;
        const ph = secs % cyc;
        if (ph < 6) this.glow(flag.x + (left ? 70 : -70) * k, flag.y, (4 + ph * 2) * k, num(RACE_PAL[v.race].accent2), 0.25 + ph * 0.06);
        else if (ph < 8 && enAt.length) {
          const tgt = enAt[Math.floor(secs / cyc) % enAt.length];
          if (Number.isFinite(tgt.y)) this.beam(flag.x + (left ? 70 : -70) * k, flag.y, tgt.x, tgt.y, num(RACE_PAL[v.race].accent2), k * 2.4, 1 - (ph - 6) / 2);
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
        const x = w * (myX + (left ? 0.05 : -0.05)) + i * 12 * k;
        const y = lerp(h * 0.45, top + 20 * k, fall);
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

  private ship(race: RaceId, kind: ShipKind, x: number, y: number, k: number, facing: number, alpha: number) {
    const art = this.tex.race[race].u[kind][0];
    const s = this.ships.next();
    s.texture = art.tex;
    s.anchor.set(art.ax, art.ay);
    s.position.set(x, y);
    const sc = (kind === 's3' ? 1.5 : kind === 's2' ? 1.25 : 1.1) * k;
    s.scale.set((facing * sc) / PX, sc / PX);
    s.alpha = alpha;
    s.tint = 0xffffff;
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

  private beam(ax: number, ay: number, bx: number, by: number, color: number, k: number, a: number) {
    const s = this.fx.next();
    s.texture = this.tex.streak;
    s.anchor.set(1, 0.5);
    s.position.set(bx, by);
    s.rotation = Math.atan2(by - ay, bx - ax);
    s.scale.set(Math.hypot(bx - ax, by - ay) / 64, (1.6 * k) / 8);
    s.tint = color;
    s.alpha = 0.6 * a;
  }

  destroy() {
    releaseTexture(this.deepTex);
    releaseTexture(this.limbTex);
    releaseTexture(this.starTex);
  }
}
