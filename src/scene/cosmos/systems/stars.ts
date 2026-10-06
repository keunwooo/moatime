/**
 * The star systems after the chronicle, one every 9–16 minutes: gas flows into the next knot
 * along slow spirals (the "work" of this world), the knot glows red and lights, its light tints
 * the nebula around it, a disk turns, planets gather out of it one by one, and what is left becomes
 * a faint belt. Four make a cluster. Every system stays where it formed, so the sky fills up: the
 * latest 160 are drawn (about 33 hours), planets on the latest 48, the oldest fade out.
 */

import { Container, Sprite } from 'pixi.js';
import { deathAt, igniteAt, planetsOf, starKind, systemPlanets, unitAt, unitStart, unitEnd, UNIT, type StarKind } from '../../../sim/cosmos';
import { clamp01, env, hash01, sm, vis, type CosmosFrame } from '../frame';
import { systemPos } from '../layout';
import { N, STAR_TINT } from '../palette';
import type { CosmosTextures } from '../textures';

const SIZE: Record<StarKind, number> = { red: 0.85, yellow: 1.1, blue: 1.6, binary: 0.9 };
const BEADS = 9;
/** Systems drawn one by one (about 33 hours of the universe); planets on the most recent. */
const SHOWN = 160;
const DETAILED = 48;
const STREAMS = 3;

class SystemView {
  readonly root = new Container();
  readonly plane = new Container();
  halo: Sprite;
  core: Sprite;
  twin: Sprite;
  lit: Sprite;
  disk: Sprite;
  belt: Sprite;
  planets: Sprite[] = [];
  k = -1;

  constructor(tex: CosmosTextures) {
    this.lit = new Sprite(tex.glowSoft);
    this.lit.blendMode = 'add';
    this.halo = new Sprite(tex.glowSoft);
    this.halo.blendMode = 'add';
    this.core = new Sprite(tex.glow);
    this.core.blendMode = 'add';
    this.twin = new Sprite(tex.glow);
    this.twin.blendMode = 'add';
    this.disk = new Sprite(tex.disk);
    this.belt = new Sprite(tex.belt);
    for (const s of [this.lit, this.halo, this.core, this.twin, this.disk, this.belt]) s.anchor.set(0.5);
    for (let i = 0; i < 6; i++) {
      const p = new Sprite(tex.dot);
      p.anchor.set(0.5);
      this.planets.push(p);
    }
    this.plane.scale.set(1, 0.34);
    this.plane.addChild(this.disk, this.belt);
    this.root.addChild(this.lit, this.plane, this.halo, this.core, this.twin, ...this.planets);
  }
}

export class StarSystems {
  readonly root = new Container();
  private views = new Map<number, SystemView>();
  private spare: SystemView[] = [];
  private beads: Sprite[] = [];
  private tex: CosmosTextures;

  constructor(tex: CosmosTextures) {
    this.tex = tex;
    const flow = new Container();
    for (let i = 0; i < BEADS * STREAMS; i++) {
      const b = new Sprite(tex.dot);
      b.anchor.set(0.5);
      b.blendMode = 'add';
      b.tint = i % 3 === 0 ? N.rose : N.webViolet;
      b.visible = false;
      this.beads.push(b);
      flow.addChild(b);
    }
    this.root.addChild(flow);
  }

  private view(k: number): SystemView {
    let v = this.views.get(k);
    if (!v) {
      v = this.spare.pop() ?? new SystemView(this.tex);
      v.k = k;
      this.views.set(k, v);
      this.root.addChildAt(v.root, 0);
    }
    return v;
  }

  update(f: CosmosFrame) {
    const cur = unitAt(f.seed, f.A);
    const s = f.As;
    if (!cur) {
      for (const [k, v] of this.views) this.release(k, v);
      for (const b of this.beads) b.visible = false;
      return;
    }
    // every system stays where it formed; the most recent ones are drawn in full
    const from = Math.max(1, cur.k - SHOWN);
    const seen = new Set<number>();
    const wide = f.aspect === 'wide';
    const base = f.w * (wide ? 0.0042 : 0.0085);
    for (let k = from; k <= cur.k; k++) {
      seen.add(k);
      const v = this.view(k);
      const q = systemPos(f.L, f.seed, k);
      const age = cur.k - k;
      // older systems settle back a little (and the oldest in view fade into the sky)
      const depth = q.scale * (age < DETAILED ? 1 : 0.85);
      const fade = (age < DETAILED ? 1 : 0.8) * (1 - sm(SHOWN - 24, SHOWN, age));
      const detailed = age < DETAILED;
      v.root.position.set(q.x * f.w, q.y * f.h);
      const kind = starKind(f.seed, k);
      const prog = k === cur.k ? cur.f : 1;
      const ig = igniteAt(f.seed, k) / 1000;
      const on = sm(ig, ig + 12, s);
      const death = deathAt(f.seed, k) / 1000;
      const gone = s >= death ? 1 : 0;
      const swell = Number.isFinite(death) ? sm(death - 240, death - 6, s) : 0;
      const proto = k === cur.k ? sm(UNIT.protostar, UNIT.ignite, prog) * (1 - on) : 0;
      const r = base * SIZE[kind] * depth * (1 + 0.5 * swell);
      const tint = proto > 0 && on < 1 ? N.redStar : STAR_TINT[kind];
      v.core.width = v.core.height = r * 2.4;
      v.core.tint = tint;
      vis(v.core, Math.max(on, proto * 0.8) * (1 - gone) * fade);
      v.halo.width = v.halo.height = r * 9;
      v.halo.tint = tint;
      vis(v.halo, (on * 0.3 + proto * 0.2) * (1 - gone) * fade);
      // a binary: two stars circling each other
      if (kind === 'binary') {
        const a = (f.A / 1000 / 40) * Math.PI * 2 + hash01(k, 3) * 6;
        v.core.position.set(Math.cos(a) * r * 1.6, Math.sin(a) * r * 0.6);
        v.twin.position.set(-Math.cos(a) * r * 1.6, -Math.sin(a) * r * 0.6);
        v.twin.width = v.twin.height = r * 2;
        v.twin.tint = N.redStar;
        vis(v.twin, on * fade);
      } else {
        v.core.position.set(0, 0);
        v.twin.visible = false;
      }
      // its light tints the nebula around it for a while
      v.lit.width = v.lit.height = base * 40 * depth;
      v.lit.tint = tint;
      vis(v.lit, 0.22 * env(ig, ig + 12, ig + 60, ig + 300, s) * fade);
      // the disk turns, then thins to a belt
      const diskA = k === cur.k ? sm(UNIT.disk, UNIT.disk + 0.06, prog) * (1 - sm(UNIT.planetsEnd, UNIT.settle, prog)) : 0;
      v.disk.width = v.disk.height = base * 12 * depth;
      v.disk.rotation = (f.A / 1000) * 0.05;
      vis(v.disk, 0.75 * diskA * (1 - gone));
      v.belt.width = v.belt.height = base * 12 * depth;
      vis(v.belt, (k === cur.k ? sm(UNIT.planetsEnd, UNIT.settle, prog) : 1) * 0.35 * (1 - gone) * (detailed ? 1 : 0) * (kind === 'blue' ? 0 : 1));
      // planets, one by one
      const n = planetsOf(f.sim, k)?.n ?? (prog >= UNIT.planets ? systemPlanets(f.sim, k) : 0);
      v.planets.forEach((p, j) => {
        if (j >= n || !detailed || gone) {
          p.visible = false;
          return;
        }
        const t0 = unitStart(f.seed, k) / 1000;
        const dur = unitEnd(f.seed, k) / 1000 - t0;
        const at = t0 + dur * (UNIT.planets + ((UNIT.planetsEnd - UNIT.planets) * (j + 0.5)) / n);
        const grow = sm(at - 10, at, s);
        const P = 40 + 30 * j;
        const ang = hash01(k, j, 9) * 6.28 + ((f.A / 1000) * Math.PI * 2) / P;
        const rad = base * (2.4 + 1.5 * j) * depth;
        p.position.set(Math.sin(ang) * rad, Math.cos(ang) * rad * 0.34);
        p.width = p.height = Math.max(2.5, base * 0.75 * depth) * (0.4 + 0.6 * grow);
        p.tint = j < Math.ceil(n / 2) ? 0xc9b6a6 : 0xe8c890;
        vis(p, grow * 0.95 * fade);
      });
    }
    for (const [k, v] of this.views) if (!seen.has(k)) this.release(k, v);
    this.updateFlow(f, cur);
  }

  /** Gas flows into the forming knot; then on toward the next. */
  private updateFlow(f: CosmosFrame, cur: { k: number; f: number }) {
    const site = systemPos(f.L, f.seed, cur.k);
    const inflow = (1 - sm(UNIT.ignite - 0.02, UNIT.ignite + 0.02, cur.f)) * sm(0, 0.02, cur.f);
    const onward = sm(UNIT.settle, UNIT.settle + 0.02, cur.f);
    const a = inflow > 0 ? (site.x < 0.5 ? f.L.nebulaA.core : f.L.nebulaB.core) : site;
    const next = systemPos(f.L, f.seed, cur.k + 1);
    const b = inflow > 0 ? site : next;
    const amount = Math.max(inflow, onward * 0.7);
    // a packet arriving makes the stream brighten for a moment
    const t0 = unitStart(f.seed, cur.k) / 1000;
    const dur = unitEnd(f.seed, cur.k) / 1000 - t0;
    let pulse = 0;
    for (let i = 0; i < UNIT.packets; i++) {
      const at = t0 + dur * UNIT.packetAt(i);
      pulse = Math.max(pulse, env(at - 6, at - 1, at, at + 2, f.As));
    }
    const dx = (b.x - a.x) * f.w;
    const dy = (b.y - a.y) * f.h;
    const len = Math.hypot(dx, dy);
    this.beads.forEach((bead, i) => {
      if (amount <= 0 || !f.motion) {
        bead.visible = false;
        return;
      }
      const st = Math.floor(i / BEADS);
      const u = (i % BEADS) / BEADS + ((f.t * 0.035 + st * 0.31) % 1);
      const t = u % 1;
      // a slow spiral around the straight line, tightening toward the knot
      const sw = Math.sin(t * Math.PI * 3 + st * 2.1 + f.t * 0.4) * (1 - t) * len * 0.08;
      const nx = -dy / (len || 1);
      const ny = dx / (len || 1);
      bead.position.set(a.x * f.w + dx * t + nx * sw, a.y * f.h + dy * t + ny * sw);
      bead.width = bead.height = Math.max(3, f.w * 0.0035) * (0.7 + 0.5 * t);
      vis(bead, amount * Math.sin(t * Math.PI) * (0.45 + 0.4 * pulse));
    });
    void clamp01;
  }

  private release(k: number, v: SystemView) {
    this.views.delete(k);
    v.root.removeFromParent();
    this.spare.push(v);
  }
}
