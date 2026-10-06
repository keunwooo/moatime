/**
 * Fights on the ground stage (FRONT_PROMPT.md 12절): site fights (점령전), the session's battles by
 * grade, and the decisive battle. A fight is replayed from its progress p (0..1), so a reload shows
 * the same moment:
 * - approach: a squad leaves the ranks for the fight point, the enemy comes from its side,
 * - engage: short tracer lines, spines or light beams pass between them; some fall — the union's
 *   soldiers kneel under a shield capsule, the swarm's curl into spores, the choir's fold into light,
 * - resolve: the enemy draws back and fades; my squad returns to the ranks.
 * Grade 5 and up adds the sky: a ship above the fight lays thin beams, drop pods come down; grade 7
 * brings the flagship over the front. Nothing flashes: lights are small and local (18절).
 */

import { Container, Sprite } from 'pixi.js';
import type { RaceId } from '../../../core/session';
import { HOME } from '../../../sim/front';
import { flies, type ArmyKind, type UnitKind } from '../../../sim/frontPlan';
import type { Battle } from '../../../world/front';
import { num } from '../../paint/color';
import { clamp01, easeInOut, hash01, lerp, sm, type FrontFrame } from '../frame';
import { depthScale, inLake, inTimer, sitePos, type P } from '../layout';
import { RACE_PAL } from '../palette';
import { PX, UNIT_SCALE } from '../paint/kit';
import type { FrontTextures } from '../textures';
import type { StructureSystem } from './structures';
import type { UnitSystem } from './units';

const ORDER: ArmyKind[] = ['t3', 't2', 't2s', 't1b', 't1', 't3a'];
const S = 1000;

export interface Fight {
  /** Fight point (map). */
  at: P;
  /** Rival side 0 (left) or 1 (right). */
  side: 0 | 1;
  /** Progress 0..1 and its length in seconds. */
  p: number;
  dur: number;
  mine: number;
  theirs: number;
  grade: number;
  kind: string;
  seed: number;
  /** The decisive battle at a rival's home. */
  decisive?: boolean;
}

class SpritePool {
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

export class CombatSystem {
  /** Lights over the field (added). */
  readonly fx = new Container();
  /** Smoke and dust (normal blend), above the units. */
  readonly smoke = new Container();
  private bodies!: SpritePool;
  private shadows!: SpritePool;
  private streaks: SpritePool;
  private glows: SpritePool;
  private puffs: SpritePool;
  /** How many of my ranks (heaviest first) are in the fight, and of each rival's home army. */
  pulled = 0;
  rivalPulled: [number, number] = [0, 0];
  /** The fight on view (map point) and its progress, read by fog, minimap and camera. */
  fight: Fight | null = null;
  /** Every gun is silent (a native creature passes, the ancient gate wakes). */
  truce = false;
  private shots = 0;

  constructor(private tex: FrontTextures) {
    this.streaks = new SpritePool(this.fx, () => {
      const s = new Sprite(tex.streak);
      s.anchor.set(1, 0.5);
      s.blendMode = 'add';
      return s;
    });
    this.glows = new SpritePool(this.fx, () => {
      const s = new Sprite(tex.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      return s;
    });
    this.puffs = new SpritePool(this.smoke, () => {
      const s = new Sprite(tex.smoke);
      s.anchor.set(0.5);
      return s;
    });
  }

  attach(entities: Container) {
    this.shadows = new SpritePool(entities, () => {
      const s = new Sprite(this.tex.shadow);
      s.anchor.set(0.5);
      return s;
    });
    this.bodies = new SpritePool(entities, () => new Sprite());
  }

  /** Works out the fight on view (or none) from the headline and the site fight. */
  private find(f: FrontFrame, st: StructureSystem, units: UnitSystem): Fight | null {
    const v = f.v;
    const p = v.planet;
    const L = f.L;
    const e = f.event;
    if (f.stage !== 'ground') return null;
    // the decisive battle: at the last rival's home
    if (e && e.kind === 'ms:decisive') {
      const fin = p.events.find((x) => x.kind === 'final');
      const side = ((fin?.enemy ?? 1) - 1) as 0 | 1;
      return { at: { x: L.rivalHome[side].x + (side ? -0.03 : 0.03), y: L.rivalHome[side].y + L.rivalR.y * 1.1 }, side, p: f.eventP, dur: (e.t1 - e.t0) / S, mine: 40, theirs: 26, grade: 6, kind: 'decisive', seed: e.seed, decisive: true };
    }
    // a site fight
    const cap = v.capture;
    if (cap && e && e.kind.startsWith('cap:')) {
      const site = cap.sites[0];
      const at = sitePos(L, p.seed, site, p.natSide);
      const pr = clamp01((v.A - (cap.t - cap.dur)) / (cap.dur + 8 * S));
      const tier = Math.max(1, v.tier);
      const n = Math.min(26, 6 + tier * 4);
      return { at: { x: at.x, y: at.y + 0.02 }, side: (cap.enemy - 1) as 0 | 1, p: pr, dur: (cap.dur + 8 * S) / S, mine: cap.kind === 'lose' ? Math.round(n * 0.5) : n, theirs: cap.kind === 'lose' ? n : Math.round(n * 0.7), grade: Math.min(5, tier + 1), kind: cap.kind, seed: (cap.t / 1000) | 0 };
    }
    const b = f.battle;
    if (!b || b.stage !== 'ground' || (b.away && b.planet !== p.idx)) return null;
    const side = (b.enemy - 1) as 0 | 1;
    const sizes = [0, [4, 3], [8, 6], [12, 9], [18, 14], [22, 16], [22, 16], [30, 22]][Math.min(7, b.grade)] as [number, number];
    let mine = sizes[0];
    let theirs = sizes[1];
    if (b.big) {
      mine = Math.round(mine * 1.5);
      theirs = Math.round(theirs * 1.5);
    }
    const at = this.where(f, b, st, units, side);
    if (!at) return null;
    if (b.kind === 'supplyDrop' || b.kind === 'shadow') mine = theirs = 0;
    return { at, side, p: f.eventP, dur: (b.t1 - b.t0) / S, mine, theirs, grade: b.grade, kind: b.kind, seed: b.seed };
  }

  /** Where a session battle is fought. */
  private where(f: FrontFrame, b: Battle, _st: StructureSystem, units: UnitSystem, side: 0 | 1): P | null {
    const v = f.v;
    const L = f.L;
    const p = v.planet;
    const enemyHome = L.rivalHome[side];
    const mineSites = v.bases.filter((x) => !x.lost && x.site !== HOME).map((x) => x.site);
    const newest = mineSites.length ? sitePos(L, p.seed, mineSites[mineSites.length - 1], p.natSide) : L.home;
    const clampOut = (q: P): P => {
      let x = q.x;
      let y = q.y;
      if (inLake(L, { x, y }, 0.02) || inTimer(L, { x, y }, 0.02)) x = x < 0.5 ? Math.min(x, L.lake.c.x - L.lake.r.x - 0.04) : Math.max(x, L.lake.c.x + L.lake.r.x + 0.04);
      y = Math.max(L.top + 0.06, Math.min(0.97, y));
      return { x, y };
    };
    const toward = (a: P, c: P, k: number): P => ({ x: lerp(a.x, c.x, k), y: lerp(a.y, c.y, k) });
    switch (b.kind) {
      case 'scout':
      case 'stormRaid':
        return clampOut(toward(newest, enemyHome, 0.18));
      case 'harass': {
        const base = mineSites.length ? sitePos(L, p.seed, mineSites[Math.floor(hash01(b.seed, 1) * mineSites.length)], p.natSide) : L.home;
        return clampOut({ x: base.x + (base.x < 0.5 ? -0.04 : 0.04), y: base.y - 0.03 });
      }
      case 'drop':
        return clampOut({ x: newest.x + (newest.x < 0.5 ? -0.05 : 0.05), y: newest.y - 0.05 });
      case 'air':
        return { x: side === 0 ? 0.16 : 0.84, y: 0.4 };
      case 'siege': {
        // the rival-held site nearest my side
        let best: P | null = null;
        let bd = Infinity;
        for (let i = 0; i < 12; i++) {
          if (v.owners[i] !== side + 1) continue;
          const q = sitePos(L, p.seed, i, p.natSide);
          const d = Math.hypot(q.x - units.rally.x, q.y - units.rally.y);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
        return clampOut(best ? { x: best.x, y: best.y + 0.04 } : toward(enemyHome, units.rally, 0.4));
      }
      case 'supplyDrop':
        return { x: L.home.x + 0.07, y: L.home.y + 0.02 };
      case 'shadow':
        return { x: 0.5, y: 0.78 };
      default:
        return clampOut(toward(units.rally, enemyHome, 0.38));
    }
  }

  private body(race: RaceId, kind: UnitKind, x: number, y: number, k0: number, pose: 0 | 1, facing: number, tint: number, alpha: number) {
    const k = k0 * UNIT_SCALE;
    const art = this.tex.race[race].u[kind][pose];
    const air = flies(race, kind);
    const lift = air ? (kind === 't3a' ? 26 : 16) * k : 0;
    const sh = this.shadows.next();
    sh.position.set(x, y);
    sh.zIndex = y - 0.1;
    const sw = (art.w / PX) * k * 0.85;
    sh.scale.set(sw / 64, (sw * 0.3) / 32);
    sh.alpha = 0.5 * alpha;
    const s = this.bodies.next();
    s.texture = art.tex;
    s.anchor.set(art.ax, art.ay);
    s.position.set(x, y - lift);
    s.zIndex = y + (air ? 2000 : 0);
    s.scale.set((facing * k) / PX, k / PX);
    s.tint = tint;
    s.alpha = alpha;
    return { x, y: y - lift - (art.ay * art.h * k) / PX / 2 };
  }

  private shot(ax: number, ay: number, bx: number, by: number, color: number, k: number, t: number) {
    // a short tracer that travels from a to b over its life t (0..1)
    if (this.shots >= 14) return;
    this.shots++;
    const s = this.streaks.next();
    const x = lerp(ax, bx, t);
    const y = lerp(ay, by, t);
    s.position.set(x, y);
    s.rotation = Math.atan2(by - ay, bx - ax);
    s.scale.set((22 * k) / 64, (2.2 * k) / 8);
    s.tint = color;
    s.alpha = 0.92;
    if (t < 0.3) this.glow(ax, ay, 5.5 * k, color, 0.75 * (1 - t * 3.3));
  }

  private glow(x: number, y: number, r: number, color: number, a: number) {
    if (a <= 0.01) return;
    const g = this.glows.next();
    g.position.set(x, y);
    g.scale.set((r * 2) / 64);
    g.tint = color;
    g.alpha = a;
  }

  private puff(x: number, y: number, r: number, color: number, a: number) {
    if (a <= 0.01) return;
    const s = this.puffs.next();
    s.position.set(x, y);
    s.scale.set((r * 2) / 64);
    s.tint = color;
    s.alpha = a;
  }

  update(f: FrontFrame, st: StructureSystem, units: UnitSystem, tint: number) {
    this.bodies.begin();
    this.shadows.begin();
    this.streaks.begin();
    this.glows.begin();
    this.puffs.begin();
    this.shots = 0;
    this.pulled = 0;
    this.rivalPulled = [0, 0];
    const F = this.find(f, st, units);
    this.fight = F;
    if (F && (F.mine > 0 || F.kind === 'supplyDrop' || F.kind === 'shadow')) this.play(f, F, units, tint);
    this.bodies.end();
    this.shadows.end();
    this.streaks.end();
    this.glows.end();
    this.puffs.end();
  }

  private play(f: FrontFrame, F: Fight, units: UnitSystem, tint: number) {
    const v = f.v;
    const { w, h } = f;
    const L = f.L;
    const fx = F.at.x * w;
    const fy = F.at.y * h;
    const k = f.k * depthScale(F.at.y);
    const myRace = v.race;
    const enRace = v.rivalRaces[F.side];
    const myPal = RACE_PAL[myRace];
    const enPal = RACE_PAL[enRace];
    const p = F.p;
    const secs = p * F.dur;
    // phases (in progress): approach, engage, resolve
    const app = sm(0, 0.2, p);
    const end = sm(0.84, 1, p);
    const motion = f.motion;

    // the special sights
    if (F.kind === 'supplyDrop') {
      const fall = sm(0.05, 0.3, p);
      const y = lerp(L.top * h - 40 * k, fy, fall);
      this.glow(fx, y, 10 * k, num(myPal.glow), 0.5 * (1 - end));
      if (fall >= 1) this.puff(fx, fy, (8 + 20 * sm(0.3, 0.45, p)) * k, 0xc9b9a8, 0.45 * (1 - sm(0.3, 0.6, p)));
      return;
    }
    if (F.kind === 'shadow') {
      // a vast shape passing behind the storm's haze
      const x = lerp(-0.2, 1.2, p) * w;
      this.puff(x, fy - 30 * k, 120 * k, 0x2a2430, 0.28 * sm(0, 0.15, p) * (1 - end));
      this.puff(x - 80 * k, fy - 24 * k, 70 * k, 0x2a2430, 0.22 * sm(0, 0.15, p) * (1 - end));
      return;
    }

    // which way is mine (toward my ranks) and theirs (toward their home)
    const rally = { x: units.rally.x * w, y: units.rally.y * h };
    let dx = rally.x - fx;
    let dy = rally.y - fy;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    if (F.decisive || dl < 20) {
      dx = F.side === 0 ? 0.7 : -0.7;
      dy = 0.7;
    }
    const px = -dy;
    const py = dx;
    const gap = (F.grade >= 4 ? 40 : 30) * k * UNIT_SCALE;

    // my squad: the heaviest of the ranks
    const mineKinds: ArmyKind[] = [];
    for (const kind of ORDER) for (let i = 0; i < v.army[kind]; i++) mineKinds.push(kind);
    const nMine = Math.min(F.mine, mineKinds.length);
    this.pulled = nMine;
    const enKinds: ArmyKind[] = [];
    const rmix = v.rivals[F.side];
    for (const kind of ORDER) for (let i = 0; i < rmix[kind]; i++) enKinds.push(kind);
    const nEn = Math.min(F.theirs, Math.max(F.theirs > 0 ? 2 : 0, enKinds.length));
    this.rivalPulled[F.side] = Math.min(nEn, enKinds.length);
    const losersMine = F.kind === 'lose';

    const place = (i: number, n: number, sign: number) => {
      const cols = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(n * 2))));
      const row = Math.floor(i / cols);
      const col = i % cols;
      const off = (col - (Math.min(cols, n - row * cols) - 1) / 2) * 9 * UNIT_SCALE * k;
      const back = gap + row * 8 * UNIT_SCALE * k;
      return { x: fx + px * off + dx * back * sign, y: fy + py * off * 0.6 + dy * back * sign };
    };
    const mineAt: { x: number; y: number }[] = [];
    const enAt: { x: number; y: number }[] = [];
    for (let i = 0; i < nMine; i++) {
      const kind = mineKinds[i];
      const slot = place(i, nMine, 1);
      // from the ranks to the fight and back
      const from = units.army[i] ?? { x: rally.x, y: rally.y };
      const out = easeInOut(app) * (1 - easeInOut(end));
      const x = lerp(from.x, slot.x, out);
      const y = lerp(from.y, slot.y, out);
      // some of mine fall (fewer when we win); they go under a capsule / into spores / into light
      const fallAt = 0.35 + 0.5 * hash01(F.seed, i, 7);
      const falls = hash01(F.seed, i, 8) < (losersMine ? 0.35 : 0.12) && p > fallAt;
      const fade = falls ? 1 - sm(fallAt, fallAt + 0.06, p) : 1;
      const pose = (motion ? Math.floor(f.t * 2 + i) % 2 : 0) as 0 | 1;
      const c = this.body(myRace, kind, x, y, k, out > 0.95 && !falls ? (((secs * 1.3 + hash01(F.seed, i)) | 0) % 2 as 0 | 1) : pose, dx > 0 ? -1 : 1, tint, Math.max(0.15, fade));
      if (falls) this.fallMark(myRace, c.x, c.y, k, p - fallAt);
      mineAt.push(falls ? { x: NaN, y: NaN } : c);
    }
    // the enemy comes from its side and draws back at the end
    for (let i = 0; i < nEn; i++) {
      const kind = enKinds[i % Math.max(1, enKinds.length)] ?? 't1';
      const slot = place(i, nEn, -1);
      const home = { x: (L.rivalHome[F.side].x + (F.side ? -0.05 : 0.05)) * w, y: (L.rivalHome[F.side].y + L.rivalR.y) * h };
      const inn = easeInOut(sm(0, 0.22, p));
      const back = sm(0.84, 1, p);
      let x = lerp(lerp(slot.x - dx * 60 * k, slot.x, 1), home.x, back * 0.35);
      let y = lerp(slot.y - dy * 60 * k * (1 - inn), home.y, back * 0.35);
      x = lerp(slot.x - dx * 80 * k, x, inn);
      const fallAt = 0.3 + 0.55 * hash01(F.seed, i, 9);
      const falls = hash01(F.seed, i, 10) < (losersMine ? 0.15 : 0.55) && p > fallAt;
      const fade = (falls ? 1 - sm(fallAt, fallAt + 0.06, p) : 1) * (1 - back * 0.9);
      const pose = (motion ? Math.floor(f.t * 2 + i + 1) % 2 : 0) as 0 | 1;
      const c = this.body(enRace, kind, x, y, k, pose, dx > 0 ? 1 : -1, tint, Math.max(0.05, fade));
      if (falls) this.fallMark(enRace, c.x, c.y, k, p - fallAt);
      enAt.push(falls || back > 0.5 ? { x: NaN, y: NaN } : c);
    }

    // shots in the engagement (each shooter on its own period; a short line, no flashes)
    if (motion && !this.truce && p > 0.18 && p < 0.86) {
      const exchange = (from: { x: number; y: number }[], to: { x: number; y: number }[], color: number, salt: number) => {
        for (let i = 0; i < from.length; i++) {
          const a = from[i];
          if (!Number.isFinite(a.x) || !to.length) continue;
          const period = 1.3 + 1.1 * hash01(F.seed, i, salt);
          const ph = (secs + hash01(F.seed, i, salt + 1) * period) % period;
          if (ph > 0.24) continue;
          const tgt = to[Math.floor(hash01(F.seed, i, Math.floor((secs + 9) / period), salt) * to.length)];
          if (!tgt || !Number.isFinite(tgt.x)) continue;
          this.shot(a.x, a.y, tgt.x, tgt.y, color, k, ph / 0.24);
          if (ph > 0.2) this.puff(tgt.x, tgt.y + 2 * k, 4 * k, 0xb8a898, 0.3);
        }
      };
      exchange(mineAt, enAt, num(myPal.shot), 21);
      exchange(enAt, mineAt, num(enPal.shot), 41);
    }

    // dust over the fight while it lasts
    if (p > 0.15 && p < 0.92) for (let i = 0; i < 3; i++) this.puff(fx + (hash01(F.seed, i) - 0.5) * 60 * k, fy + 6 * k, (14 + 6 * Math.sin(f.t * 0.6 + i)) * k, 0xa8988a, 0.14);

    // grade 5 and up: the sky joins — a ship above the fight lays thin beams; drop pods come down
    if (F.grade >= 5 || F.kind === 'support' || F.kind === 'pods' || F.kind === 'descend' || F.decisive) {
      const big = F.kind === 'descend' || F.grade >= 7 || F.decisive;
      const ship = this.tex.race[myRace].u[big ? 's3' : 's1'][0];
      const sx = fx + dx * 40 * k;
      const syTop = Math.max(L.top * h - 20 * k, fy - (big ? 220 : 170) * k);
      const arrive = sm(0.05, 0.25, p) * (1 - sm(0.9, 1, p));
      const s = this.bodies.next();
      s.texture = ship.tex;
      s.anchor.set(ship.ax, ship.ay);
      const sk = (big ? 1.1 : 0.9) * k;
      s.position.set(lerp(sx - 200 * k, sx, arrive), syTop);
      s.zIndex = 100000;
      s.scale.set((dx > 0 ? -sk : sk) / PX, sk / PX);
      s.tint = tint;
      s.alpha = arrive;
      if (big) {
        // its shadow over the front
        const sh = this.shadows.next();
        sh.position.set(lerp(sx - 200 * k, sx, arrive), fy);
        sh.zIndex = fy - 1;
        sh.scale.set((260 * k) / 64, (70 * k) / 32);
        sh.alpha = 0.32 * arrive;
      }
      if (motion && arrive > 0.9 && p < 0.86) {
        const period = big ? 4.5 : 2.6;
        const ph = (secs % period) / period;
        if (ph < 0.18 && enAt.length) {
          const tgt = enAt[Math.floor(hash01(F.seed, Math.floor(secs / period), 77) * enAt.length)];
          if (tgt && Number.isFinite(tgt.x)) {
            // a thin warm beam down to the ground, then a slow ring of dust (no flash)
            const b = this.streaks.next();
            b.position.set(tgt.x, tgt.y);
            b.rotation = Math.atan2(tgt.y - syTop, tgt.x - sx);
            const len = Math.hypot(tgt.x - sx, tgt.y - syTop);
            b.scale.set(len / 64, ((big ? 2.2 : 1.4) * k) / 8);
            b.tint = big ? num(myPal.accent2) : num(myPal.shot);
            b.alpha = 0.55 * (1 - ph / 0.18);
            this.puff(tgt.x, tgt.y + 3 * k, (10 + 26 * ph) * k, 0xb0a090, 0.35 * (1 - ph / 0.18));
          }
        }
      }
      if (F.kind === 'pods' || F.decisive) {
        for (let i = 0; i < 4; i++) {
          const t0 = 0.12 + i * 0.05;
          const fall = sm(t0, t0 + 0.08, p);
          if (fall <= 0 || fall >= 1) continue;
          const tx = fx + dx * gap + px * (i - 1.5) * 14 * k;
          const ty = fy + dy * gap;
          const x = lerp(sx, tx, fall);
          const y = lerp(syTop, ty, fall);
          this.glow(x, y, 4 * k, num(myPal.glow), 0.8);
        }
      }
    }
  }

  /** What falling looks like, by people: a shield capsule, a puff of spores, folded light. */
  private fallMark(race: RaceId, x: number, y: number, k: number, since: number) {
    const a = clamp01(1 - since * 2.5);
    if (race === 0) this.glow(x, y + 3 * k, 5 * k, 0x9fd0e8, 0.45 * Math.min(1, since * 12) * (0.6 + 0.4 * a));
    else if (race === 1) this.puff(x, y - 2 * k * since * 10, (3 + 6 * since * 4) * k, num(RACE_PAL[1].glow), 0.45 * a);
    else this.glow(x, y - 4 * k * since * 10, 4 * k, num(RACE_PAL[2].glow), 0.7 * a);
  }
}

