/**
 * 은하 — "처음의 우주": the history of a universe compressed onto the time spent in focus.
 *
 * Everything shown is a function of the universe's age A = W − origin (sim/cosmos.ts) and of the
 * headline on view (world/cosmos.ts): the chronicle from a single point of light to the first
 * planetary system in 24 min 20 s, then star systems, nebulae, the life planet and the galaxy.
 * The view is fixed and painted in screen space, in layers with their own parallax; a small camera
 * leans toward where a star is forming, steps back when a cluster is complete and visits the life
 * planet for its milestones. Ambient motion (twinkles, drifting fog, flowing gas) runs on the
 * ambient clock and stops when paused or with animation off.
 */

import { Container, Sprite, TilingSprite, type Renderer } from 'pixi.js';
import { aspectFor, type AspectClass } from '../../core/world';
import { CHRON, cosmosStage, milestones, PER_CLUSTER, PER_ZONE, unitAt, unitEnd, type CosmosSim } from '../../sim/cosmos';
import { spaceWeatherAt } from '../../world/cosmos';
import { box, HORIZON, regionOf } from '../camera';
import { trackTextures } from '../paint/brush';
import type { FramingChoice, FramingRequest, FrameInfo, SceneStats, ThemeScene, WorldSpec } from '../types';
import { CosmosCamera, type CamTarget } from './camera';
import { clamp01, px, type CosmosFrame } from './frame';
import { LAYOUT, systemPos } from './layout';
import { buildCosmosTextures, releaseCosmosTextures, type CosmosTextures } from './textures';
import { SkyEvents } from './systems/events';
import { FogSystem } from './systems/fog';
import { GalaxySystem } from './systems/galaxy';
import { HomeSystem } from './systems/home';
import { NebulaSystem } from './systems/nebula';
import { SkySystem } from './systems/sky';
import { StarSystems } from './systems/stars';

/** Textures are painted once with a fixed seed; a world's own seed places things, not brushwork. */
const PAINT_SEED = 0x51a7;

/** Parallax of each layer (0 fixed .. 1 moves fully with the camera). */
const PARALLAX = { deep: 0.04, web: 0.12, galaxy: 0.18, stars: 0.22, nebula: 0.5, systems: 0.56, home: 1, events: 0.42 };

export class CosmosScene implements ThemeScene {
  readonly id = 'cosmos' as const;
  readonly extents = {
    close: { w: 200, h: 120 },
    sapling: { w: 200, h: 120 },
    mature: { w: 200, h: 120 },
  };
  readonly background = 0x120f2a;
  readonly root = new Container();
  private tex!: CosmosTextures;
  private world!: WorldSpec;
  private layers = {
    deep: new Container(),
    web: new Container(),
    galaxy: new Container(),
    stars: new Container(),
    nebula: new Container(),
    systems: new Container(),
    home: new Container(),
    events: new Container(),
  };
  private fogLayer = new Container();
  private overlay = new Container();
  private sky!: SkySystem;
  private galaxy!: GalaxySystem;
  private nebula!: NebulaSystem;
  private stars!: StarSystems;
  private home!: HomeSystem;
  private events!: SkyEvents;
  private fog!: FogSystem;
  private vignette!: Sprite;
  private paper!: TilingSprite;
  private cam = new CosmosCamera();
  private aspect: AspectClass | null = null;
  private realT = 0;
  private celebrate0 = -1;
  private visit: { id: string; until: number } | null = null;
  private lastA = -1;

  async build(_renderer: Renderer, world: WorldSpec, lowPower: boolean) {
    this.tex = await trackTextures(() => buildCosmosTextures(PAINT_SEED, lowPower));
    this.sky = new SkySystem(this.tex, lowPower);
    this.galaxy = new GalaxySystem(this.tex);
    this.nebula = new NebulaSystem(this.tex);
    this.stars = new StarSystems(this.tex);
    this.home = new HomeSystem(this.tex);
    this.events = new SkyEvents(this.tex);
    this.fog = new FogSystem(this.tex);
    const L = this.layers;
    L.deep.addChild(this.sky.deep);
    L.web.addChild(this.sky.webLayer);
    L.galaxy.addChild(this.galaxy.root);
    L.stars.addChild(this.sky.starLayer);
    L.nebula.addChild(this.nebula.root);
    L.systems.addChild(this.stars.root);
    L.home.addChild(this.home.root);
    L.events.addChild(this.events.root);
    this.fogLayer.addChild(this.fog.root);
    this.vignette = new Sprite(this.tex.vignette);
    this.paper = new TilingSprite({ texture: this.tex.paper, width: 10, height: 10 });
    this.paper.alpha = 0.035;
    this.overlay.addChild(this.vignette, this.paper, this.fog.veil);
    this.root.addChild(L.deep, L.web, L.galaxy, L.stars, L.nebula, L.systems, L.events, L.home, this.fogLayer, this.overlay);
    this.setWorld(world);
  }

  setWorld(world: WorldSpec) {
    this.world = world;
    this.aspect = null;
  }

  /** The host's rig stays still: this scene keeps its own camera in screen space. */
  framing(req: FramingRequest): FramingChoice {
    return {
      framing: { key: 'cosmos', kind: 'overview', tau: 3, boxes: [box(0, 0, 400, 200)], region: regionOf(req.aspect, 'wide'), hy: HORIZON[req.aspect].overview },
      hold: true,
    };
  }

  update(info: FrameInfo) {
    const sim = info.sim as CosmosSim;
    const { w, h } = info.vp;
    const aspect = aspectFor(w, h);
    const L = LAYOUT[aspect];
    const seed = this.world.seed;
    const A = Math.max(0, info.W - sim.origin);
    this.realT += info.realDt;
    const e = info.env.event;
    const f: CosmosFrame = {
      ...info,
      sim,
      seed,
      A,
      As: A / 1000,
      origin: sim.origin,
      aspect,
      L,
      stage: cosmosStage(seed, A),
      event: e,
      eventP: e ? clamp01((info.W - e.t0) / Math.max(1, e.t1 - e.t0)) : 0,
      weather: spaceWeatherAt(seed, A),
      w,
      h,
      R: w,
      celebrateT: this.celebrate0 >= 0 && this.realT - this.celebrate0 < 15 ? this.realT - this.celebrate0 : -1,
    };
    if (aspect !== this.aspect) {
      this.aspect = aspect;
      this.sky.setAspect(aspect, { L, seed, w, h });
    }
    this.sky.update(f);
    this.galaxy.update(f);
    this.nebula.update(f);
    this.stars.update(f);
    this.home.update(f);
    this.events.update(f);
    this.fog.update(f);
    this.vignette.width = w;
    this.vignette.height = h;
    this.vignette.alpha = 1 - 0.7 * this.fog.brightness;
    this.paper.width = w;
    this.paper.height = h;

    const target = this.target(f);
    const snap = info.jumped || !info.motion;
    const s = this.cam.update(target, info.status === 'paused' ? 0 : info.realDt, snap);
    for (const [k, c] of Object.entries(this.layers)) CosmosCamera.apply(c, s, PARALLAX[k as keyof typeof PARALLAX]);
    this.lastA = A;
  }

  /** Where the camera wants to be (lean toward the work, step back for reveals, visit the planet). */
  private target(f: CosmosFrame): CamTarget {
    const { w, h, A, seed } = f;
    const rest: CamTarget = { fx: w / 2, fy: h / 2, ox: 0, oy: 0, z: 1, tau: 4 };
    if (!f.motion || f.cameraLock) {
      this.visit = null;
      return rest;
    }
    // a milestone of the life planet is visited only when it is passed live
    if (f.jumped) this.visit = null;
    if (f.live && this.lastA >= 0) {
      for (const m of milestones(seed)) {
        if (m.visit && this.lastA < m.A && A >= m.A) this.visit = { id: m.id, until: m.A + Math.max(m.dur, 80_000) };
      }
    }
    if (this.visit && A >= this.visit.until) this.visit = null;
    const lp = this.home.lifeAt;
    if (this.visit && lp.r > 0) {
      const z = Math.max(1, Math.min(3.2, (0.22 * Math.min(w, h)) / (2 * lp.r)));
      const tx = lp.x * 0.7 + w * 0.15;
      const ty = h * (f.aspect === 'wide' ? 0.76 : 0.78);
      return { fx: lp.x, fy: lp.y, ox: lp.x - tx, oy: lp.y - ty, z, tau: 6 };
    }
    // sights on the life planet are small: the view leans in toward it while they last
    const planetSight = f.event && ['aurora', 'moonShadow', 'nightMeteors', 'orbitLight'].includes(f.event.kind);
    if (planetSight && lp.r > 0) {
      const z = Math.max(1, Math.min(1.8, (0.12 * Math.min(w, h)) / (2 * lp.r)));
      return { fx: lp.x, fy: lp.y, ox: (lp.x - w / 2) * 0.25, oy: (lp.y - h * 0.72) * 0.5, z, tau: 6 };
    }
    // a finished cluster (20 s) or zone (30 s) is shown whole
    const cur = unitAt(seed, A);
    if (cur && f.live !== undefined) {
      const done = cur.k - 1;
      const ended = unitEnd(seed, done);
      const zone = (done + 1) % PER_ZONE === 0;
      if ((done + 1) % PER_CLUSTER === 0 && A - ended < (zone ? 30_000 : 20_000)) return { ...rest, z: zone ? 0.88 : 0.93, tau: 4 };
    }
    // lean a little toward where the universe is at work
    let site = f.L.home;
    if (A < CHRON.firstStar - 20_000) site = { x: 0.5, y: 0.5 };
    else if (A < CHRON.supernova + 60_000) site = f.L.firstGen[0];
    else if (A < CHRON.cradle) site = f.L.nebulaA.core;
    else if (A < CHRON.end) site = f.L.home;
    else if (cur) site = systemPos(f.L, seed, cur.k, Math.floor(cur.k / PER_ZONE));
    const p = px(f, site);
    return { fx: p.x, fy: p.y, ox: (p.x - w / 2) * 0.1, oy: (p.y - h / 2) * 0.06, z: site === f.L.home ? 1.04 : 1.07, tau: 5 };
  }

  celebrate() {
    this.celebrate0 = this.realT;
  }

  stats(): SceneStats {
    let n = 0;
    const count = (c: Container) => {
      for (const ch of c.children) {
        n++;
        if (ch.children.length) count(ch as Container);
      }
    };
    count(this.root);
    return { cards: n, visible: n, detailedZones: 1, textures: 0 };
  }

  destroy() {
    this.root.destroy({ children: true });
    if (this.tex) releaseCosmosTextures(this.tex);
  }
}
