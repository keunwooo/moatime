/**
 * 전선 — "아스테르 변경": a war at the edge of the galaxy built on the time spent in focus.
 *
 * Everything shown is a function of the war's time A = W − origin (sim/front.ts) and of the
 * headline on view (world/front.ts). The ground stage is a high quarter view of the planet being
 * fought for: its painted terrain, the bases and their buildings, workers and ranks, the fights,
 * the fog of war and the minimap. A small camera of its own steps back as the bases spread (zoom
 * 1.6 → 1.0); the host's rig stays still. Ambient motion runs on the ambient clock and stops when
 * paused or with animation off.
 */

import { Container, Sprite, TilingSprite, type Renderer } from 'pixi.js';
import { aspectFor, type AspectClass } from '../../core/world';
import { frontAt, HOME, type FrontSim } from '../../sim/front';
import { isBattle, tideAt } from '../../world/front';
import { box, HORIZON, regionOf } from '../camera';
import { trackTextures } from '../paint/brush';
import type { FramingChoice, FramingRequest, FrameInfo, SceneStats, ThemeScene, WorldSpec } from '../types';
import { FrontCamera, type CamTarget } from './camera';
import { clamp01, type FrontFrame } from './frame';
import { LAYOUT } from './layout';
import { buildFrontTextures, releaseFrontTextures, type FrontTextures } from './textures';
import { GroundSystem } from './systems/ground';
import { StructureSystem } from './systems/structures';
import { UnitSystem } from './systems/units';

export class FrontScene implements ThemeScene {
  readonly id = 'front' as const;
  readonly extents = {
    close: { w: 200, h: 120 },
    sapling: { w: 200, h: 120 },
    mature: { w: 200, h: 120 },
  };
  readonly background = 0x1e2233;
  readonly root = new Container();
  private tex!: FrontTextures;
  private world!: WorldSpec;
  /** The ground stage: everything on the planet moves with the camera. */
  private stageGround = new Container();
  private entities = new Container();
  private overlay = new Container();
  private ground!: GroundSystem;
  private structures!: StructureSystem;
  private units!: UnitSystem;
  private vignette!: Sprite;
  private paper!: TilingSprite;
  private cam = new FrontCamera();
  private aspect: AspectClass | null = null;
  private realT = 0;
  private celebrate0 = -1;
  private lastBases = -1;
  private revealUntil = -1;

  async build(_renderer: Renderer, world: WorldSpec, lowPower: boolean) {
    this.tex = await trackTextures(() => buildFrontTextures(lowPower));
    this.ground = new GroundSystem(this.tex, lowPower);
    this.structures = new StructureSystem(this.tex);
    this.units = new UnitSystem(this.tex);
    this.entities.sortableChildren = true;
    this.structures.layer = this.entities;
    this.units.attach(this.entities);
    this.stageGround.addChild(this.ground.root, this.entities, this.structures.scaffold);
    this.vignette = new Sprite(this.tex.vignette);
    this.paper = new TilingSprite({ texture: this.tex.paper, width: 10, height: 10 });
    this.paper.alpha = 0.04;
    this.overlay.addChild(this.vignette, this.paper);
    this.root.addChild(this.stageGround, this.overlay);
    this.setWorld(world);
  }

  setWorld(world: WorldSpec) {
    this.world = world;
    this.aspect = null;
  }

  /** The host's rig stays still: this scene keeps its own camera in screen space. */
  framing(req: FramingRequest): FramingChoice {
    return {
      framing: { key: 'front', kind: 'overview', tau: 3, boxes: [box(0, 0, 400, 200)], region: regionOf(req.aspect, 'wide'), hy: HORIZON[req.aspect].overview },
      hold: true,
    };
  }

  update(info: FrameInfo) {
    const sim = info.sim as FrontSim;
    const { w, h } = info.vp;
    const aspect = aspectFor(w, h);
    const L = LAYOUT[aspect];
    const seed = this.world.seed;
    const A = Math.max(0, info.W - sim.origin);
    this.realT += info.realDt;
    const v = frontAt(seed, sim.race, A);
    const e = info.env.event;
    const f: FrontFrame = {
      ...info,
      sim,
      v,
      seed,
      race: sim.race,
      A,
      As: A / 1000,
      origin: sim.origin,
      aspect,
      L,
      w,
      h,
      k: h / 820,
      tide: tideAt(seed, A),
      event: e,
      eventP: e ? clamp01((info.W - e.t0) / Math.max(1, e.t1 - e.t0)) : 0,
      battle: isBattle(e) ? e : null,
      celebrateT: this.celebrate0 >= 0 && this.realT - this.celebrate0 < 15 ? this.realT - this.celebrate0 : -1,
      stage: 'ground',
      stagePlanet: v.planet.idx,
    };
    if (aspect !== this.aspect) this.aspect = aspect;

    this.ground.update(f, v.planet.idx);
    this.structures.update(f, this.ground.tint, this.ground.night);
    this.units.update(f, this.structures, this.ground.tint, () => false);

    this.vignette.width = w;
    this.vignette.height = h;
    this.paper.width = w;
    this.paper.height = h;

    const target = this.target(f);
    const snap = info.jumped || !info.motion;
    const s = this.cam.update(target, info.status === 'paused' ? 0 : info.realDt, snap);
    FrontCamera.apply(this.stageGround, s, 1);
  }

  /** Where the camera wants to be: close on the home plateau at first, stepping back as bases spread. */
  private target(f: FrontFrame): CamTarget {
    const { w, h, L, v } = f;
    const home = { x: L.home.x * w, y: L.home.y * h };
    const rest: CamTarget = { key: 'rest', fx: w / 2, fy: h / 2, ox: 0, oy: 0, z: 1, tau: 4 };
    if (!f.motion) return rest;
    const bases = v.bases.filter((b) => !b.lost && (b.site === HOME || b.age >= 0)).length + (v.planet.idx > 0 ? 1 : 0);
    let z = bases <= 1 ? 1.6 : bases === 2 ? 1.3 : bases === 3 ? 1.1 : 1;
    if (f.cameraLock) z = 1;
    // a new base is shown a little wider for 15 s
    if (this.lastBases >= 0 && bases > this.lastBases && f.live) this.revealUntil = this.realT + 15;
    this.lastBases = bases;
    if (this.realT < this.revealUntil) z *= 0.93;
    if (z <= 1.001) return { ...rest, key: 'wide', z, tau: 14 };
    // zoom about the home plateau, keeping it low on screen
    return { key: 'home', fx: home.x, fy: home.y, ox: 0, oy: 0, z, tau: 16, tauF: 8 };
  }

  celebrate() {
    this.celebrate0 = this.realT;
  }

  stats(): SceneStats {
    return { cards: this.structures.count() + this.units.count(), visible: this.units.count(), detailedZones: 1, textures: this.tex?.all.length ?? 0 };
  }

  destroy() {
    this.root.destroy({ children: true });
    if (this.tex) releaseFrontTextures(this.tex);
  }
}
