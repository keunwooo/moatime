/**
 * The home galaxy, far off in a corner: proto-galactic clumps draw together and merge into a
 * turning disk (8 hours a turn), arms and dust lanes sharpen, the core wakes with two thin jets,
 * satellites gather, and over a hundred hours a neighbour drifts in and merges. All from the age.
 */

import { Container, Sprite } from 'pixi.js';
import { galaxyAt } from '../../../sim/cosmos';
import { clamp01, easeInOut, eventIs, lerp, mixHex, px, sm, vis, type CosmosFrame } from '../frame';
import { N } from '../palette';
import type { CosmosTextures } from '../textures';

export class GalaxySystem {
  readonly root = new Container();
  private plane = new Container();
  private disk: Sprite;
  private arms: Sprite;
  private core: Sprite;
  private clumps: Sprite[];
  private jets: Sprite[];
  private sats: Sprite[];
  private nbPlane = new Container();
  private nb: Sprite;
  private tails: Sprite;
  private pass: Sprite;

  constructor(tex: CosmosTextures) {
    this.disk = new Sprite(tex.galaxyDisk);
    this.arms = new Sprite(tex.galaxyArms);
    this.core = new Sprite(tex.glowSoft);
    for (const s of [this.disk, this.arms, this.core]) s.anchor.set(0.5);
    this.core.tint = N.emberCore;
    this.core.blendMode = 'add';
    this.clumps = [0, 1, 2].map(() => {
      const s = new Sprite(tex.blob);
      s.anchor.set(0.5);
      return s;
    });
    this.plane.addChild(this.disk, this.arms, ...this.clumps);
    this.jets = [0, 1].map(() => {
      const s = new Sprite(tex.jet);
      s.anchor.set(0.5, 1);
      s.blendMode = 'add';
      return s;
    });
    this.sats = [0, 1].map(() => {
      const s = new Sprite(tex.blob);
      s.anchor.set(0.5);
      return s;
    });
    this.nb = new Sprite(tex.neighbour);
    this.nb.anchor.set(0.5);
    this.nbPlane.addChild(this.nb);
    this.tails = new Sprite(tex.band);
    this.tails.anchor.set(0.5);
    this.tails.tint = N.rose;
    this.pass = new Sprite(tex.neighbour);
    this.pass.anchor.set(0.5);
    this.root.addChild(this.tails, this.nbPlane, this.plane, this.core, ...this.jets, ...this.sats, this.pass);
  }

  update(f: CosmosFrame) {
    const g = galaxyAt(f.A);
    const L = f.L.galaxy;
    const c = px(f, L);
    const R = L.r * f.w;
    const dust = f.weather.dust;
    this.plane.position.set(c.x, c.y);
    this.plane.rotation = L.angle;
    this.plane.scale.set(1, L.tilt);
    const size = R * 2;
    const reddish = mixHex(0xffffff, 0xf0c8b8, dust);
    this.disk.width = this.disk.height = size;
    this.disk.rotation = g.angle;
    this.disk.tint = reddish;
    vis(this.disk, 0.85 * g.disk * (1 - 0.3 * dust));
    this.arms.width = this.arms.height = size;
    this.arms.rotation = g.angle;
    this.arms.tint = reddish;
    vis(this.arms, (0.25 + 0.75 * g.arms) * g.disk * (1 - 0.3 * dust));
    // three clumps drawing together
    this.clumps.forEach((s, i) => {
      const a = (i / 3) * Math.PI * 2 + 0.6;
      const d = R * 1.3 * (1 - g.merge);
      s.position.set(Math.cos(a + g.merge * 1.4) * d, Math.sin(a + g.merge * 1.4) * d);
      s.width = s.height = R * (0.55 + 0.35 * g.merge);
      vis(s, 0.75 * g.clumps * (1 - g.disk));
    });
    const pulse = eventIs(f, 'corePulse');
    const pulseK = pulse ? Math.sin(pulse.p * Math.PI) : 0;
    this.core.position.set(c.x, c.y);
    this.core.width = this.core.height = R * (0.45 + 0.2 * g.jets + 0.25 * pulseK);
    vis(this.core, (0.35 * g.core + 0.25 * pulseK) * (1 - 0.3 * dust));
    // jets stand out of the disk plane
    const up = L.angle - Math.PI / 2;
    this.jets.forEach((s, i) => {
      s.position.set(c.x, c.y);
      s.rotation = up + i * Math.PI + Math.PI / 2;
      s.width = R * 0.12;
      s.height = R * (0.55 + 0.6 * g.jets + 0.3 * pulseK);
      vis(s, 0.5 * g.jets + 0.3 * pulseK * g.jets);
    });
    this.sats.forEach((s, i) => {
      const a = L.angle + (i ? 2.5 : -0.4) + g.angle * 0.15;
      s.position.set(c.x + Math.cos(a) * R * 1.5, c.y + Math.sin(a) * R * 0.75);
      s.width = s.height = R * 0.28;
      vis(s, 0.55 * g.satellites);
    });
    // the neighbour drifts in over a hundred hours and merges
    const n = px(f, f.L.neighbour);
    const k = easeInOut(g.approach);
    const merged = sm(0.9, 1, g.approach);
    this.nbPlane.position.set(lerp(n.x, c.x + R * 0.25, k), lerp(n.y, c.y + R * 0.08, k));
    this.nbPlane.rotation = 0.5 - k * 0.6;
    this.nbPlane.scale.set(1, 0.55);
    this.nb.width = this.nb.height = R * (0.9 + 0.3 * k);
    this.nb.rotation = g.angle * 0.8;
    vis(this.nb, 0.75 * g.neighbour * (1 - merged));
    this.tails.position.set((this.nbPlane.x + c.x) / 2, (this.nbPlane.y + c.y) / 2);
    this.tails.rotation = Math.atan2(this.nbPlane.y - c.y, this.nbPlane.x - c.x);
    this.tails.width = Math.hypot(this.nbPlane.x - c.x, this.nbPlane.y - c.y) + R * 1.4;
    this.tails.height = R * 0.5;
    vis(this.tails, 0.35 * clamp01(g.approach * 2) * g.neighbour * (1 - 0.5 * merged));
    // a satellite galaxy passing far off (a session sight)
    const sp = eventIs(f, 'satellitePass');
    if (sp) {
      const b = f.L.band;
      this.pass.position.set(lerp(-0.05, 1.05, sp.p) * f.w, (b[0] + (b[1] - b[0]) * 0.5) * f.h);
      this.pass.width = this.pass.height = R * 0.6;
      this.pass.rotation = sp.p * 0.6;
      vis(this.pass, 0.85 * Math.sin(sp.p * Math.PI));
    } else this.pass.visible = false;
  }
}
