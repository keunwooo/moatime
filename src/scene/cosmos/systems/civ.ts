/**
 * Peoples among the stars, seen from the universe's distance: our colonies glow gold around the
 * stars they settled, other peoples' systems sit in their own hue (teal, rose, violet), trade routes
 * run between colonies as faint dotted light with convoys moving along them, colony fleets set out
 * as small glints, and where another people's reach meets ours, fleets clash with thin bolts of
 * light and shimmering shields until one side draws back. Paths that would cross the timer bend
 * around it. Everything is placed from (seed, A) and the headline on view.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { CIV, homeColonies, rivalsAt, unitAt, type Colony, type Rival } from '../../../sim/cosmos';
import { ownGroup } from '../../gfx';
import { clamp01, easeInOut, env, eventIs, hash01, lerp, mixHex, sm, vis, type CosmosFrame } from '../frame';
import { pathAround, pathAt, systemPos, type P, type Path } from '../layout';
import { N } from '../palette';
import type { CosmosTextures } from '../textures';

export const RIVAL_HUE = [N.teal, N.rose, 0x9d8cf0];
const SHIPS = 9;
const BOLTS = 12;
const CONVOYS = 10;

interface Mark {
  ring: Sprite;
  halo: Sprite;
  lights: Sprite[];
}

interface Ship {
  s: Sprite;
  halo: Sprite;
  trail: Sprite;
  shield: Sprite;
  boom: Sprite;
}

export class CivSystem {
  readonly root = new Container();
  /** Where a civilisation sight is happening (layer px), for the camera; null when none. */
  focus: P | null = null;
  private routes = ownGroup(new Graphics());
  private routeKey = '';
  private routeList: { path: Path; hue: number }[] = [];
  private marks = new Map<number, Mark>();
  private spare: Mark[] = [];
  private markLayer = new Container();
  private convoys: Sprite[] = [];
  private ships: Ship[] = [];
  private bolts: Sprite[] = [];
  private haze: Sprite;
  private tex: CosmosTextures;

  constructor(tex: CosmosTextures) {
    this.tex = tex;
    const fleet = new Container();
    const add = (t: CosmosTextures['glow'], ax = 0.5) => {
      const s = new Sprite(t);
      s.anchor.set(ax, 0.5);
      s.blendMode = 'add';
      s.visible = false;
      return s;
    };
    this.haze = add(tex.glowSoft);
    fleet.addChild(this.haze);
    for (let i = 0; i < SHIPS * 2; i++) {
      const sh: Ship = { trail: add(tex.streak, 1), halo: add(tex.glow), s: add(tex.dot), shield: add(tex.shield), boom: add(tex.glowSoft) };
      fleet.addChild(sh.trail, sh.halo, sh.s, sh.shield, sh.boom);
      this.ships.push(sh);
    }
    for (let i = 0; i < BOLTS; i++) {
      const b = add(tex.streak, 0);
      this.bolts.push(b);
      fleet.addChild(b);
    }
    for (let i = 0; i < CONVOYS; i++) this.convoys.push(add(tex.dot));
    this.root.addChild(this.routes, this.markLayer, ...this.convoys, fleet);
  }

  private mark(k: number): Mark {
    let m = this.marks.get(k);
    if (!m) {
      m = this.spare.pop() ?? this.newMark();
      this.marks.set(k, m);
      this.markLayer.addChild(m.halo, m.ring, ...m.lights);
    }
    return m;
  }

  private newMark(): Mark {
    const halo = new Sprite(this.tex.glowSoft);
    halo.blendMode = 'add';
    const ring = new Sprite(this.tex.loop);
    ring.blendMode = 'add';
    const lights = [0, 1, 2].map(() => {
      const l = new Sprite(this.tex.dot);
      l.blendMode = 'add';
      return l;
    });
    for (const s of [halo, ring, ...lights]) s.anchor.set(0.5);
    return { ring, halo, lights };
  }

  update(f: CosmosFrame) {
    const A = f.A;
    const { w, h } = f;
    const cur = unitAt(f.seed, A);
    const window0 = cur ? cur.k - 160 : 0;
    const colonies = A >= CIV.interstellar ? homeColonies(f.seed, A).filter((c) => c.k > window0) : [];
    const rivals = rivalsAt(f.seed, A).filter((r) => r.k > window0);
    const home = f.L.home;
    const base = w * (f.aspect === 'wide' ? 0.0042 : 0.0085);
    const P = (k: number) => systemPos(f.L, f.seed, k);

    // marks: our colonies in gold, other peoples in their hue
    const seen = new Set<number>();
    const put = (c: Colony, hue: number, homeworld: boolean) => {
      seen.add(c.k);
      const m = this.mark(c.k);
      const q = P(c.k);
      const x = q.x * w;
      const y = q.y * h;
      const grow = sm(c.at / 1000, c.at / 1000 + 20, f.As);
      const sc = q.scale;
      m.halo.position.set(x, y);
      m.halo.width = m.halo.height = base * (homeworld ? 30 : 16) * sc;
      m.halo.tint = hue;
      vis(m.halo, (homeworld ? 0.3 : 0.18) * grow);
      m.ring.position.set(x, y);
      m.ring.width = base * 8 * sc;
      m.ring.height = base * 8 * sc * 0.55;
      m.ring.tint = hue;
      vis(m.ring, (homeworld ? 0.5 : 0.38) * grow);
      m.lights.forEach((l, i) => {
        const a = (A / 1000 / (18 + i * 7)) * Math.PI * 2 + hash01(c.k, i) * 6.28;
        l.position.set(x + Math.cos(a) * base * 4 * sc, y + Math.sin(a) * base * 1.8 * sc);
        l.width = l.height = Math.max(3, base * 0.75);
        l.tint = hue;
        vis(l, 0.9 * grow * (0.75 + 0.25 * Math.sin(f.t * 1.3 + i * 2 + c.k)));
      });
    };
    for (const c of colonies) put(c, N.gold, false);
    for (const r of rivals) {
      const hue = RIVAL_HUE[r.i % RIVAL_HUE.length];
      put({ k: r.k, at: r.at }, hue, true);
      for (const c of r.colonies) if (c.k > window0) put(c, hue, false);
    }
    for (const [k, m] of this.marks) {
      if (seen.has(k)) continue;
      this.marks.delete(k);
      for (const s of [m.halo, m.ring, ...m.lights]) s.removeFromParent();
      this.spare.push(m);
    }

    this.updateRoutes(f, colonies, rivals, home, P);
    this.updateConvoys(f);
    for (const sh of this.ships) for (const s of [sh.s, sh.halo, sh.trail, sh.shield, sh.boom]) s.visible = false;
    for (const b of this.bolts) b.visible = false;
    this.haze.visible = false;
    this.focus = null;
    this.updateVoyages(f, colonies, home, P);
    this.updateContact(f, colonies, rivals, home, P);
    this.updateBattle(f, colonies, rivals, home, P);
  }

  /** Dotted routes: home to the first colony, each later colony to its nearest earlier stop. */
  private updateRoutes(f: CosmosFrame, colonies: Colony[], rivals: Rival[], home: P, P: (k: number) => P) {
    const key = `${f.w}x${f.h}:${colonies.map((c) => c.k).join(',')}|${rivals.map((r) => `${r.k}:${r.colonies.map((c) => c.k).join(',')}`).join('/')}`;
    if (key === this.routeKey) return;
    this.routeKey = key;
    const list: { path: Path; hue: number }[] = [];
    const chain = (stops: P[], start: P, hue: number) => {
      const done: P[] = [start];
      for (const s of stops) {
        let best = done[0];
        for (const d of done) if (Math.hypot(d.x - s.x, d.y - s.y) < Math.hypot(best.x - s.x, best.y - s.y)) best = d;
        list.push({ path: pathAround(f.L, best, s), hue });
        done.push(s);
      }
    };
    chain(colonies.map((c) => P(c.k)), home, N.gold);
    for (const r of rivals) chain(r.colonies.map((c) => P(c.k)), P(r.k), RIVAL_HUE[r.i % RIVAL_HUE.length]);
    this.routeList = list;
    const g = this.routes;
    g.clear();
    for (const r of list) {
      // dashes of even length along the path
      const n = Math.max(12, Math.round(r.path.len * 70)) * 2;
      for (let i = 0; i < n; i += 2) {
        const p0 = pathAt(r.path, i / n);
        const p1 = pathAt(r.path, (i + 1) / n);
        g.moveTo(p0.x * f.w, p0.y * f.h).lineTo(p1.x * f.w, p1.y * f.h);
      }
      g.stroke({ width: Math.max(1, f.w / 1100), color: r.hue, alpha: 0.22 });
    }
  }

  /** Convoys of light running to and fro along the routes. */
  private updateConvoys(f: CosmosFrame) {
    const routes = this.routeList;
    const busy = eventIs(f, 'convoy') ? 1.6 : 1;
    this.convoys.forEach((c, i) => {
      if (!routes.length || i >= routes.length * 2) {
        c.visible = false;
        return;
      }
      const r = routes[i % routes.length];
      const period = 50 + 30 * hash01(i, 41);
      const clock = f.motion ? f.t : f.As;
      const u = (((clock / period + hash01(i, 42)) % 1) + 1) % 1;
      // there and back
      const t = u < 0.5 ? u * 2 : 2 - u * 2;
      const p = pathAt(r.path, easeInOut(t));
      c.position.set(p.x * f.w, p.y * f.h);
      c.width = c.height = Math.max(4, f.w * 0.004) * (busy > 1 ? 1.3 : 1);
      c.tint = r.hue;
      vis(c, Math.min(1, busy * (0.75 * Math.sin(Math.PI * clamp01(t * 1.1 - 0.05)) + 0.1)));
    });
  }

  /** A ship drawn at (x, y) heading `ang` (px), with its halo and a trail of `trail` sizes. */
  private drawShip(sh: Ship, x: number, y: number, ang: number, size: number, hue: number, a: number, trail: number) {
    sh.s.position.set(x, y);
    sh.s.width = sh.s.height = size;
    sh.s.tint = 0xfff4e0;
    vis(sh.s, a);
    sh.halo.position.set(x, y);
    sh.halo.width = sh.halo.height = size * 4;
    sh.halo.tint = hue;
    vis(sh.halo, 0.75 * a);
    sh.trail.position.set(x, y);
    sh.trail.rotation = ang;
    sh.trail.width = size * trail;
    sh.trail.height = size * 1.4;
    sh.trail.tint = hue;
    vis(sh.trail, 0.65 * a * (trail > 0 ? 1 : 0));
  }

  /** The first voyage (milestone), a colony fleet setting out, or a long trade caravan. */
  private updateVoyages(f: CosmosFrame, colonies: Colony[], home: P, P: (k: number) => P) {
    const { w, h } = f;
    const size = Math.max(4, w * 0.0042);
    const fl = eventIs(f, 'fleet', 'convoy');
    if (fl && fl.kind === 'convoy' && this.routeList.length) {
      const r = this.routeList[Math.floor(hash01(fl.seed, 8) * this.routeList.length)];
      for (let i = 0; i < 7; i++) {
        const t = easeInOut(clamp01((fl.p - i * 0.035) / 0.76));
        const q = pathAt(r.path, t);
        const q2 = pathAt(r.path, Math.max(0, t - 0.02));
        const a = clamp01(Math.sin(Math.PI * t) * 1.4) * (t > 0 && t < 1 ? 1 : 0);
        this.drawShip(this.ships[i], q.x * w, q.y * h, Math.atan2((q.y - q2.y) * h, (q.x - q2.x) * w), size * (i === 0 ? 1.2 : 0.9), r.hue, a, 6);
      }
      const mid = pathAt(r.path, 0.5);
      this.focus = { x: mid.x * w, y: mid.y * h };
    }
    const voyage = f.A >= CIV.interstellar && f.A < CIV.interstellar + CIV.voyageMs ? (f.A - CIV.interstellar) / CIV.voyageMs : -1;
    if (voyage < 0 && !(fl && fl.kind === 'fleet')) return;
    const p = voyage >= 0 ? voyage : fl!.p;
    const first = homeColonies(f.seed, CIV.interstellar + CIV.voyageMs + 1)[0];
    const pick = voyage < 0 && colonies.length ? colonies[Math.floor(hash01(fl!.seed, 5) * colonies.length)] : first;
    const target = P(pick.k);
    const path = pathAround(f.L, home, target);
    const n = voyage >= 0 ? 1 : 5;
    for (let i = 0; i < n; i++) {
      const t = easeInOut(clamp01((p - i * 0.025) / 0.9));
      const q = pathAt(path, t);
      const q2 = pathAt(path, Math.max(0, t - 0.02));
      const off = (i - (n - 1) / 2) * 0.012;
      const a = Math.sin(Math.PI * clamp01(p)) * 0.95 + 0.05;
      this.drawShip(this.ships[i], (q.x + off * 0.3) * w, (q.y + off) * h, Math.atan2((q.y - q2.y) * h, (q.x - q2.x) * w), size * (voyage >= 0 ? 1.5 : 1), N.gold, a, 9);
    }
    const mid = pathAt(path, 0.5);
    this.focus = { x: mid.x * w, y: mid.y * h };
  }

  /** Our colony nearest to a point (or home). */
  private nearest(colonies: Colony[], home: P, to: P, P: (k: number) => P): P {
    let best = home;
    let d0 = Math.hypot(home.x - to.x, home.y - to.y);
    for (const c of colonies) {
      const q = P(c.k);
      const d = Math.hypot(q.x - to.x, q.y - to.y);
      if (d < d0) {
        d0 = d;
        best = q;
      }
    }
    return best;
  }

  /** Where two sides meet: in the open at `t` of the way, off the galaxy, below the top bar, never over the timer. */
  private meetPoint(f: CosmosFrame, a: P, b: P, t0: number): P {
    const [tx0, ty0, tx1, ty1] = f.L.timer;
    const g = f.L.galaxy;
    const gr = g.r * 1.15;
    const onGalaxy = (q: P) => Math.hypot((q.x - g.x) / gr, ((q.y - g.y) * f.h) / (f.w * gr * 0.6)) < 1;
    const meet = (t: number): P => {
      const q = { x: Math.min(Math.max(lerp(a.x, b.x, t), 0.1), 0.9), y: Math.min(Math.max(lerp(a.y, b.y, t), 0.2), 0.82) };
      if (q.x > tx0 - 0.06 && q.x < tx1 + 0.06 && q.y > ty0 - 0.06 && q.y < ty1 + 0.06) q.x = q.x < 0.5 ? tx0 - 0.11 : tx1 + 0.11;
      return q;
    };
    let m = meet(t0);
    for (let t = t0 - 0.07; t > 0.1 && onGalaxy(m); t -= 0.07) m = meet(t);
    return m;
  }

  /** First contact (milestone): one ship from each side meets the other halfway, a light passes between them, both turn home. */
  private updateContact(f: CosmosFrame, colonies: Colony[], rivals: Rival[], home: P, P: (k: number) => P) {
    const ev = eventIs(f, 'ms:contact');
    if (!ev || !rivals.length) return;
    const { w, h } = f;
    const r = rivals[0];
    const hue = RIVAL_HUE[r.i % RIVAL_HUE.length];
    const rp = P(r.k);
    const ours = this.nearest(colonies, home, rp, P);
    const m = this.meetPoint(f, ours, rp, 0.5);
    const p = ev.p;
    const go = easeInOut(clamp01(p / 0.35));
    const back = easeInOut(clamp01((p - 0.72) / 0.26));
    const size = Math.max(5, w * (f.aspect === 'wide' ? 0.005 : 0.009));
    const dir = Math.atan2((rp.y - ours.y) * h, (rp.x - ours.x) * w);
    const gap = w * 0.022;
    const sides: [P, number, number][] = [
      [ours, N.gold, -1],
      [rp, hue, 1],
    ];
    for (const [i, [from, tint, sgn]] of sides.entries()) {
      const hold = { x: m.x * w + sgn * Math.cos(dir) * gap, y: m.y * h + sgn * Math.sin(dir) * gap };
      const x = lerp(lerp(from.x * w, hold.x, go), from.x * w, back);
      const y = lerp(lerp(from.y * h, hold.y, go), from.y * h, back);
      const heading = (sgn < 0 ? dir : dir + Math.PI) + (back > 0 ? Math.PI : 0);
      const moving = p < 0.36 || p > 0.72;
      this.drawShip(this.ships[i], x, y, heading, size, tint, sm(0, 0.04, p) * (1 - sm(0.95, 1, p)), moving ? 8 : 0);
    }
    // the greeting: a soft light passes back and forth, and a shared glow
    const meetK = env(0.36, 0.42, 0.66, 0.72, p);
    this.haze.position.set(m.x * w, m.y * h);
    this.haze.width = this.haze.height = gap * 7;
    this.haze.tint = mixHex(N.gold, hue, 0.5);
    vis(this.haze, 0.3 * meetK);
    if (meetK > 0) {
      const b = this.bolts[0];
      const a = this.ships[0].s;
      const c = this.ships[1].s;
      const u = f.motion ? (Math.sin(f.t * 2.2) + 1) / 2 : 0.5;
      b.position.set(a.x, a.y);
      b.rotation = Math.atan2(c.y - a.y, c.x - a.x);
      b.width = Math.hypot(c.x - a.x, c.y - a.y);
      b.height = Math.max(5, size * 1.2);
      b.tint = mixHex(N.gold, hue, u);
      vis(b, 0.55 * meetK);
    }
    this.focus = { x: m.x * w, y: m.y * h };
  }

  /**
   * A clash with another people: two chevrons of ships close in, trade thin bolts of light that
   * flash on shields, a few ships are lost in small bursts, and one side draws back.
   */
  private updateBattle(f: CosmosFrame, colonies: Colony[], rivals: Rival[], home: P, P: (k: number) => P) {
    const bt = eventIs(f, 'battle');
    if (!bt || !rivals.length || !f.event) return;
    const { w, h } = f;
    const r = rivals[Math.floor(hash01(bt.seed, 1) * rivals.length)];
    const hue = RIVAL_HUE[r.i % RIVAL_HUE.length];
    const rp = P(r.k);
    // our side sets out from the colony nearest to them (or from home)
    const ours = this.nearest(colonies, home, rp, P);
    const m = this.meetPoint(f, ours, rp, 0.62);
    const p = bt.p;
    const secs = (p * (f.event.t1 - f.event.t0)) / 1000;
    const mx = m.x * w;
    const my = m.y * h;
    this.focus = { x: mx, y: my };
    const dir = Math.atan2((rp.y - ours.y) * h, (rp.x - ours.x) * w);
    const ux = Math.cos(dir);
    const uy = Math.sin(dir);
    const span = w * (f.aspect === 'wide' ? 0.085 : 0.15);
    const size = Math.max(4, w * (f.aspect === 'wide' ? 0.0042 : 0.008));
    const loser = hash01(bt.seed, 2) < 0.5 ? 0 : 1;
    const lostAt = (side: number, i: number) => {
      // up to three of the losing side (one of the winner's) are lost during the fight
      const limit = side === loser ? 3 : 1;
      const order = Math.floor(hash01(bt.seed, side, i) * SHIPS);
      return order < limit ? 0.32 + 0.48 * hash01(bt.seed, side, i, 7) : 2;
    };
    const go = easeInOut(clamp01(p / 0.2));
    const posOf = (side: number, i: number) => {
      const sgn = side === 0 ? -1 : 1;
      // a chevron: the tip toward the enemy, wings trailing
      const c = (SHIPS - 1) / 2;
      const lat = ((i - c) / c) * span * 0.42 + (hash01(bt.seed, side, i, 3) - 0.5) * span * 0.08;
      const back = (Math.abs(i - c) / c) * span * 0.3 + hash01(bt.seed, side, i, 4) * span * 0.06;
      const hold = { x: mx + sgn * ux * (span * 0.5 + back) - uy * lat, y: my + sgn * uy * (span * 0.5 + back) + ux * lat };
      const from = side === 0 ? ours : rp;
      const start = { x: from.x * w + sgn * ux * back * 0.5 - uy * lat * 0.4, y: from.y * h + sgn * uy * back * 0.5 + ux * lat * 0.4 };
      const away = side === loser ? easeInOut(clamp01((p - 0.84) / 0.16)) : 0;
      const weave = f.motion ? Math.sin(f.t * (0.7 + hash01(side, i) * 0.6) + i * 1.3) * span * 0.05 : 0;
      return {
        x: lerp(lerp(start.x, hold.x, go), start.x, away) - uy * weave,
        y: lerp(lerp(start.y, hold.y, go), start.y, away) + ux * weave,
      };
    };
    const fadeAll = sm(0, 0.04, p) * (1 - sm(0.94, 1, p));
    // a faint glow over the field draws the eye from afar
    this.haze.position.set(mx, my);
    this.haze.width = this.haze.height = span * 3.4;
    this.haze.tint = mixHex(N.gold, hue, 0.5);
    vis(this.haze, 0.22 * env(0.12, 0.25, 0.84, 0.96, p) * (f.motion ? 0.85 + 0.15 * Math.sin(f.t * 2.3) : 1));
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < SHIPS; i++) {
        const sh = this.ships[side * SHIPS + i];
        const q = posOf(side, i);
        const out = lostAt(side, i);
        const alive = 1 - sm(out, out + 0.012, p);
        const heading = side === 0 ? dir : dir + Math.PI;
        const moving = p < 0.22 || (side === loser && p > 0.85);
        this.drawShip(sh, q.x, q.y, side === loser && p > 0.85 ? heading + Math.PI : heading, size, side === 0 ? N.gold : hue, fadeAll * alive, moving ? 7 : 2.5);
        // lost: a small burst of light
        const e = (p - out) / 0.05;
        if (f.motion && e > 0 && e < 1) {
          sh.boom.position.set(q.x, q.y);
          sh.boom.width = sh.boom.height = size * (2.5 + 8 * Math.sqrt(e));
          sh.boom.tint = e < 0.3 ? N.emberCore : N.ember;
          vis(sh.boom, 0.9 * (1 - e));
        }
      }
    }
    // bolts: a few at a time, each a short-lived line; the target's shield flashes in its own hue
    // (no flashing bolts with motion reduced: the fleets simply face each other)
    if (f.motion && p > 0.22 && p < 0.86) {
      const beat = 0.7;
      const slot = Math.floor(secs / beat);
      const life = (secs / beat) % 1;
      for (let b = 0; b < BOLTS; b++) {
        const seedB = slot * 31 + b;
        if (hash01(bt.seed, seedB, 3) > 0.5) continue;
        const side = hash01(bt.seed, seedB, 4) < 0.5 ? 0 : 1;
        const i = Math.floor(hash01(bt.seed, seedB, 5) * SHIPS);
        const j = Math.floor(hash01(bt.seed, seedB, 6) * SHIPS);
        if (p >= lostAt(side, i) || p >= lostAt(1 - side, j)) continue;
        const a = posOf(side, i);
        const c = posOf(1 - side, j);
        const bolt = this.bolts[b];
        const reach = Math.min(1, life * 4);
        bolt.position.set(a.x, a.y);
        bolt.rotation = Math.atan2(c.y - a.y, c.x - a.x);
        bolt.width = Math.hypot(c.x - a.x, c.y - a.y) * reach;
        // the streak texture is a thin line in a taller strip
        bolt.height = Math.max(5, size * 1.2);
        bolt.tint = side === 0 ? N.emberCore : mixHex(hue, 0xffffff, 0.35);
        vis(bolt, 0.95 * (1 - life) * fadeAll);
        const target = this.ships[(1 - side) * SHIPS + j];
        if (life > 0.2) {
          target.shield.position.set(c.x, c.y);
          target.shield.width = target.shield.height = size * 3.2;
          target.shield.tint = side === 0 ? hue : N.gold;
          vis(target.shield, 0.6 * Math.sin(Math.PI * clamp01((life - 0.2) / 0.8)));
        }
      }
    }
  }
}
