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
import { frontAt, HOME, planetsTo, type FrontSim } from '../../sim/front';
import { flagsOn, frontBattles, isBattle, tideAt } from '../../world/front';
import { currentPace } from '../../world/pace';
import { box, HORIZON, regionOf } from '../camera';
import { trackTextures } from '../paint/brush';
import type { FramingChoice, FramingRequest, FrameInfo, SceneStats, ThemeScene, WorldSpec } from '../types';
import { FrontCamera, type CamTarget } from './camera';
import { clamp01, vis, type FrontFrame } from './frame';
import { LAYOUT } from './layout';
import { buildFrontTextures, releaseFrontTextures, type FrontTextures } from './textures';
import { GroundSystem } from './systems/ground';
import { StructureSystem } from './systems/structures';
import { UnitSystem } from './systems/units';
import { FogSystem } from './systems/fog';
import { TerritorySystem } from './systems/territory';
import { CombatSystem } from './systems/combat';
import { Minimap } from './systems/minimap';
import { frontPrefs } from './prefs';
import { OrbitStage } from './systems/orbit';
import { SystemStage } from './systems/system';
import { awayView, stageMix } from './systems/stage';
import { AtmosSystem } from './systems/atmos';
import { EventSystem } from './systems/events';

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
  private fog!: FogSystem;
  private territory!: TerritorySystem;
  private combat!: CombatSystem;
  private minimap!: Minimap;
  private orbit!: OrbitStage;
  private atmos!: AtmosSystem;
  private events!: EventSystem;
  private system!: SystemStage;
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
    this.fog = new FogSystem();
    this.territory = new TerritorySystem();
    this.combat = new CombatSystem(this.tex);
    this.minimap = new Minimap();
    this.orbit = new OrbitStage(this.tex);
    this.atmos = new AtmosSystem(this.tex);
    this.events = new EventSystem(this.tex);
    this.system = new SystemStage();
    this.entities.sortableChildren = true;
    this.structures.layer = this.entities;
    this.units.attach(this.entities);
    this.combat.attach(this.entities);
    // the ground, its territories, then everything standing (depth-sorted), lights, smoke and fog
    this.stageGround.addChild(
      this.ground.root,
      this.territory.root,
      this.ground.lake,
      this.ground.crystals,
      this.entities,
      this.structures.scaffold,
      this.events.root,
      this.combat.smoke,
      this.combat.fx,
      this.atmos.field,
      this.fog.root,
    );
    this.vignette = new Sprite(this.tex.vignette);
    this.paper = new TilingSprite({ texture: this.tex.paper, width: 10, height: 10 });
    this.paper.alpha = 0.04;
    this.overlay.addChild(this.vignette, this.paper, this.minimap.root);
    this.root.addChild(this.stageGround, this.atmos.screen, this.orbit.root, this.system.root, this.overlay);
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
      // art is sized for a 820 px tall view; a narrow portrait screen sizes it by its width too
      k: aspect === 'wide' ? h / 820 : Math.min(h / 820, w / 560),
      tide: tideAt(seed, A),
      event: e,
      eventP: e ? clamp01((info.W - e.t0) / Math.max(1, e.t1 - e.t0)) : 0,
      battle: isBattle(e) ? e : null,
      celebrateT: this.celebrate0 >= 0 && this.realT - this.celebrate0 < 15 ? this.realT - this.celebrate0 : -1,
      stage: 'ground',
      stagePlanet: v.planet.idx,
    };
    if (aspect !== this.aspect) this.aspect = aspect;

    // which stage is on view (ground, orbit, the system) and which planet each shows
    const session = frontBattles(seed, sim.origin, currentPace());
    // a battle called up in dev is not in the session list; switches follow it too
    const battles = f.battle && !session.includes(f.battle) ? [...session, f.battle].sort((a, b) => a.t0 - b.t0) : session;
    const mix = stageMix(f, battles, info.motion && !info.cameraLock);
    const gv = mix.groundPlanet === v.planet.idx ? v : awayView(v, mix.groundPlanet);
    const fg: FrontFrame = gv === v ? f : { ...f, v: gv, allSeen: true };
    vis(this.stageGround, mix.ground);
    vis(this.atmos.screen, mix.ground);
    if (mix.ground > 0.003) {
      this.ground.update(fg, gv.planet.idx, this.atmos.eclipse);
      this.territory.update(fg);
      this.structures.update(fg, this.ground.tint, this.ground.night);
      this.combat.truce = this.events.truce;
      this.combat.update(fg, this.structures, this.units, this.ground.tint);
      fg.rally = this.units.rally;
      fg.sight = this.combat.fight ? [this.combat.fight.at] : [];
      this.fog.update(fg);
      // my own see themselves; the rivals' units show only in the clear
      this.units.update(fg, this.structures, this.ground.tint, (x, y, mine) => !mine && this.fog.at(fg, x, y) !== 0, this.combat.pulled, this.combat.rivalPulled);
      this.atmos.update(fg, this.structures, this.ground.night);
      const flags = gv === v ? flagsOn(seed, sim.origin, currentPace(), A) : [];
      this.events.update(fg, this.structures, flags, f.celebrateT, this.ground.tint);
    }
    this.orbit.update(f, planetsTo(seed, A)[mix.orbitPlanet] ?? v.planet, mix.orbitBattle, mix.orbit);
    this.system.update(f, mix.system, mix.ringPlanet);

    this.vignette.width = w;
    this.vignette.height = h;
    this.paper.width = w;
    this.paper.height = h;

    const target = this.target(fg);
    const snap = info.jumped || !info.motion;
    const s = this.cam.update(target, info.status === 'paused' ? 0 : info.realDt, snap);
    FrontCamera.apply(this.stageGround, s, 1);
    // drawing back into the system: the ground shrinks toward the middle as it fades
    if (mix.system > 0 && mix.ground > 0) {
      const c = 1 - 0.22 * mix.system;
      const g = this.stageGround;
      g.scale.set(g.scale.x * c);
      g.position.set((g.position.x - w / 2) * c + w / 2, (g.position.y - h / 2) * c + h / 2);
    }
    // the minimap: what the camera shows, and a ring where a fight has just begun
    const toMap = (sx: number, sy: number) => ({ x: ((sx - s.fx + s.ox) / s.z + s.fx) / w, y: ((sy - s.fy + s.oy) / s.z + s.fy) / h });
    const a = toMap(0, 0);
    const b = toMap(w, h);
    const fight = this.combat.fight;
    const pingP = fight ? Math.min(1, (fight.p * fight.dur) / 4) : 1;
    this.minimap.update(fg, { ground: this.ground.texture, territory: this.territory.texture, fog: this.fog.texture }, { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, fight ? fight.at : null, pingP, frontPrefs.minimap && mix.ground > 0.5);
  }

  /** Where the camera wants to be: close on the home plateau at first, stepping back as bases spread. */
  private target(f: FrontFrame): CamTarget {
    const { w, h, L, v } = f;
    const home = { x: L.home.x * w, y: L.home.y * h };
    const rest: CamTarget = { key: 'rest', fx: w / 2, fy: h / 2, ox: 0, oy: 0, z: 1, tau: 4 };
    if (!f.motion || f.allSeen) return rest;
    const bases = v.bases.filter((b) => !b.lost && (b.site === HOME || b.age >= 0)).length + (v.planet.idx > 0 ? 1 : 0);
    let z = bases <= 1 ? 1.6 : bases === 2 ? 1.3 : bases === 3 ? 1.1 : 1;
    if (f.cameraLock) z = 1;
    // a new base is shown a little wider for 15 s
    if (this.lastBases >= 0 && bases > this.lastBases && f.live) this.revealUntil = this.realT + 15;
    this.lastBases = bases;
    if (this.realT < this.revealUntil) z *= 0.93;
    // a fight on view is kept in the frame: the zoom eases back until its point fits
    const fight = this.combat.fight;
    if (fight && z > 1) {
      const fx = fight.at.x * w;
      const fy = fight.at.y * h;
      const fit = (d: number, room: number) => (Math.abs(d) < 1 ? Infinity : room / Math.abs(d));
      const zx = fit(fx - home.x, fx < home.x ? home.x - 0.08 * w : 0.92 * w - home.x);
      const zy = fit(fy - home.y, fy < home.y ? home.y - 0.14 * h : 0.95 * h - home.y);
      z = Math.max(1, Math.min(z, zx, zy));
    }
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
    this.fog?.destroy();
    this.territory?.destroy();
    this.orbit?.destroy();
    this.atmos?.destroy();
    this.events?.destroy();
    this.system?.destroy();
    this.root.destroy({ children: true });
    if (this.tex) releaseFrontTextures(this.tex);
  }
}
