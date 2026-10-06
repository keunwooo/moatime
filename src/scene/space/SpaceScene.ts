/**
 * 우주 — a colony on a nameless planet with a thin atmosphere.
 *
 * Everything that changes is read from the simulation: drones drive, drill, load and unload
 * by their simulated steps; the depot pile shows the real stock of metal, crystal and rare
 * mineral; crates travel from the depot to the site and disappear into the structure stage by
 * stage. The planet's day (32 minutes of running time) lights the land; ambient life (twinkles,
 * the gas giant's bands, an occasional shooting star) is decoration only and never touches
 * the work.
 *
 * The scene composes systems (src/scene/space/systems): Sky (stars, gas giant, sun, ridges),
 * Terrain (ground bands, haze), Colony (zones, outposts, buildings, occlusion), Workers
 * (drones, crates in flight, dust, sparks, cable) and Ambient (shooting star, motes).
 */

import { Container, type Renderer } from 'pixi.js';
import { geometryFor } from '../../core/world';
import { SPACE } from '../../sim/config';
import { innerOfUnit, nodePos } from '../../sim/layout';
import { rareAt, type SpaceSim } from '../../sim/space';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from '../../sim/units';
import { box, HORIZON, regionOf, type SubjectBox } from '../camera';
import { CardLayer } from '../diorama';
import { trackTextures } from '../paint/brush';
import { SceneCtx } from '../system';
import { smooth } from '../systems';
import type { FramingChoice, FramingRequest, FrameInfo, SceneStats, ThemeScene, WorldSpec } from '../types';
import { SpaceAmbient } from './systems/ambient';
import { Colony } from './systems/colony';
import { Defense } from './systems/defense';
import { Expansion } from './systems/expansion';
import { PlanetEvents } from './systems/planet';
import { SpaceSky } from './systems/sky';
import { SpaceTerrain } from './systems/terrain';
import type { SpaceCtx, SpaceFrame } from './systems/types';
import { Workers } from './systems/workers';
import { buildSpaceTextures, releaseSpaceTextures, type SpaceTextures } from './textures';
import { spaceLight } from './light';

export class SpaceScene implements ThemeScene {
  readonly id = 'space' as const;
  readonly extents = {
    close: { w: 230, h: 60 },
    sapling: { w: 280, h: 110 },
    mature: { w: 280, h: 150 },
  };
  readonly regions = {
    wide: {
      work: { x0: 0.27, x1: 0.73, y0: 0.6, y1: 0.875 },
      low: { x0: 0.04, x1: 0.96, y0: 0.62, y1: 0.93 },
      wide: { x0: 0.03, x1: 0.97, y0: 0.6, y1: 0.95 },
    },
    tall: {
      // narrow screens: the deposit's outer boulders and the battery may run off the edges
      work: { x0: -0.06, x1: 1.06, y0: 0.6, y1: 0.86 },
      low: { x0: 0.03, x1: 0.97, y0: 0.62, y1: 0.89 },
      wide: { x0: 0.03, x1: 0.97, y0: 0.6, y1: 0.9 },
    },
  };
  readonly background = 0x1d1b3c;
  readonly root = new Container();
  private tex!: SpaceTextures;
  private layer = new CardLayer();
  private ctx!: SpaceCtx;
  private world!: WorldSpec;
  private sky!: SpaceSky;
  private terrain!: SpaceTerrain;
  private ambient!: SpaceAmbient;
  private workers!: Workers;
  private colony!: Colony;
  private expansion!: Expansion;
  private defense!: Defense;
  private planet!: PlanetEvents;
  private realT = 0;
  private celebrate0 = -1;
  /** The camera is showing a finished outpost or zone: nothing steps back for the work. */
  private revealing = false;

  async build(_renderer: Renderer, world: WorldSpec, lowPower: boolean) {
    this.tex = await trackTextures(() => buildSpaceTextures(lowPower));
    this.ctx = new SceneCtx('space', this.layer, this.tex);
    // creation order matters: cards that share a depth keep the order they were added in
    this.sky = new SpaceSky(this.tex);
    this.terrain = new SpaceTerrain(this.ctx);
    this.ambient = new SpaceAmbient(this.tex, lowPower);
    this.workers = new Workers(this.ctx);
    this.colony = new Colony(this.ctx);
    this.expansion = new Expansion(this.ctx);
    this.defense = new Defense(this.ctx);
    this.planet = new PlanetEvents(this.ctx);
    this.sky.insertSky(this.planet.sky);
    this.sky.overHills(this.planet.hillVeil);
    this.setWorld(world);
    this.root.addChild(this.sky.backdrop.root, this.layer.container, this.planet.front, this.ambient.overlay.root);
  }

  setWorld(world: WorldSpec) {
    this.world = world;
    this.ctx.setWorld(world.seed, geometryFor(world.aspect));
    this.colony.setWorld(world);
    this.workers.resetWorld();
  }

  // ---------------------------------------------------------------------------
  // Camera: the outpost's working ground (depot, deposit, charger, the site), never a rover.

  framing(req: FramingRequest): FramingChoice {
    const choice = this.chooseFraming(req);
    this.revealing = choice.framing.kind === 'reveal';
    return choice;
  }

  private chooseFraming(req: FramingRequest): FramingChoice {
    const sim = req.sim as SpaceSim;
    const g = geometryFor(req.aspect);
    const node = (id: string) => nodePos('space', this.world.seed, g, id);
    const c = sim.cluster;
    const p = sim.proj;
    // the back outposts of a settlement are seen from a little higher, over the front ones
    const back = c % 4 >= 2 ? 0.05 : 0;
    // a slightly higher view than the forest: the rover working in front of a module stays
    // below it on screen instead of covering it
    const hz0 = HORIZON[req.aspect];
    const lift = req.aspect === 'wide' ? 0.05 : 0.03;
    const hz = { ...hz0, work: hz0.work - lift - back, outpost: hz0.outpost - lift - back };
    const doneIn = sim.done - c * UPC;
    const facBox = (unit: number, h: number): SubjectBox => {
      const q = node(`u${unit}`);
      return box(q.x, q.z, 230, h);
    };
    const workBoxes = (): SubjectBox[] => {
      const d = node(`d${c}`);
      const o = node(`o${c}`);
      const ch = node(c === 0 ? 'L0' : `c${c}`);
      const inner = innerOfUnit(c * UPC);
      // the whole haul path: deposit, depot and the site (the charger is visited only now and then)
      const x = node(`x${c}`);
      const out = [box(d.x + inner * 52, d.z + 30, 110, 40), box(o.x - inner * 44, o.z + 36, 140, 50), box(x.x, x.z + 26, 110, 60)];
      if (rareAt(sim, c)) {
        const y = node(`y${c}`);
        out.push(box(y.x, y.z + 24, 110, 50));
      }
      void ch;
      const site = node(`u${p.unit}`);
      out.push(box(site.x, site.z, 200, p.reservedAt >= 0 ? 110 : 30, p.reservedAt < 0));
      return out;
    };
    // a finished outpost is shown whole for a moment before the camera moves on
    if (sim.done > 0 && sim.done % UPC === 0 && doneIn === 0 && !req.reduced) {
      // completion time from the log: a finished zone's times are gone from doneAt already
      const last = sim.log[sim.log.length - 1];
      const t = last && last.u === sim.done - 1 ? last.W : -Infinity;
      if (Number.isFinite(t) && req.W - t < 26_000) {
        const zoneDone = sim.done % UPZ === 0;
        const boxes: SubjectBox[] = [];
        for (let u = zoneDone ? sim.done - UPZ : sim.done - UPC; u < sim.done; u++) boxes.push(facBox(u, 150));
        const d = node(`d${c - 1}`);
        boxes.push(box(d.x, d.z + 30, 120, 40));
        return { framing: { key: `reveal:${sim.done}`, kind: 'reveal', tau: 4.5, boxes, region: regionOf(req.aspect, 'wide', this.regions), hy: hz.reveal }, hold: false };
      }
    }
    if (req.reduced) {
      const boxes = workBoxes();
      for (let u = Math.floor(sim.done / UPZ) * UPZ; u < sim.done; u++) boxes.push(facBox(u, 150));
      return { framing: { key: `overview:${c}:${sim.done}`, kind: 'overview', tau: 3, boxes, region: regionOf(req.aspect, 'wide', this.regions), hy: hz.overview }, hold: false };
    }
    // a raid is watched at the outpost it hits: the depot and the defence line beyond the
    // deposits (one gentle move out at the start and back at the end — the camera does not
    // chase the fight); it comes before expansion views
    const kx = req.aspect === 'tall' ? 0.62 : 1;
    const raid = sim.raid && !req.reduced && req.W >= sim.raid.t0 - 1000 && req.W < sim.raid.t1 + 8000 ? sim.raid : null;
    if (raid) {
      const d = node(`d${raid.c}`);
      const ri = innerOfUnit(raid.c * UPC);
      // the line box reaches from the nearest raider lane to the defence drones above it
      const boxes = [box(d.x + ri * 52, d.z + 20, 120, 50), box(d.x - ri * 630 * kx, d.z - 30, 380 * kx, 150)];
      return { framing: { key: `raid:${raid.n}`, kind: 'outpost', tau: 4, boxes, region: regionOf(req.aspect, 'wide', this.regions), hy: hz.outpost }, hold: false };
    }
    // expansion: the camera waits at the new site while the scout flies in from the finished
    // outpost, circles it and sets the beacon down
    const sc = sim.scout;
    if (sc && !req.reduced && req.W >= sc.t0 - 1000 && req.W < sc.t1 + 6000) {
      const b = node(`d${sc.c}`);
      const boxes = [box(b.x, b.z + 30, 300, 150)];
      return { framing: { key: `expand:${sc.c}`, kind: 'outpost', tau: 4, boxes, region: regionOf(req.aspect, 'wide', this.regions), hy: hz.outpost }, hold: false };
    }
    // then it follows the power line being laid, a stretch at a time, ahead of the drone
    const layer = sim.rovers.find((r) => r.step && r.step.k === 'link' && req.W >= r.step.t0 && req.W < r.step.t1);
    if (layer && !req.reduced) {
      const st = layer.step!;
      const a = node(st.a);
      const b = node(st.b);
      const k = (req.W - st.t0) / (st.t1 - st.t0);
      const step = Math.min(4, Math.floor(k * 5));
      const k0 = step / 5;
      const k1 = Math.min(1, k0 + 0.4);
      const at = (q: number) => ({ x: a.x + (b.x - a.x) * q, z: a.z + (b.z - a.z) * q });
      const p0 = at(k0);
      const p1 = at(k1);
      const boxes = [box(p0.x, p0.z + 30, 200, 70), box(p1.x, p1.z + 30, 200, 70)];
      return { framing: { key: `link:${st.ref}:${step}`, kind: 'outpost', tau: 5, boxes, region: regionOf(req.aspect, 'wide', this.regions), hy: hz.outpost }, hold: false };
    }
    const stage = SPACE.stages[p.stage]?.id;
    // installing parts and switching the power on are watched without the view moving
    const hold = p.building && (stage === 'parts' || stage === 'power') && req.W >= p.st0;
    const boxes = workBoxes();
    // the garrison stands beside the outpost, in view while working
    const inner = innerOfUnit(c * UPC);
    const army = sim.army.inf - sim.army.out + sim.army.tanks;
    if (army > 0) {
      const d = node(`d${c}`);
      boxes.push(box(d.x + inner * 250 * kx, d.z + 20, 130, 30));
    }
    const rk = army > 0 ? ':g' : '';
    if (doneIn <= 1) {
      if (doneIn === 1) boxes.push(facBox(c * UPC, 120));
      return {
        framing: { key: `work:${c}:${p.unit}:${p.reservedAt >= 0 ? 1 : 0}${rk}`, kind: 'work', tau: sim.done === 0 ? 2.6 : 4.2, boxes, region: regionOf(req.aspect, 'work', this.regions), hy: hz.work, maxK: 1.35 },
        hold,
      };
    }
    for (let u = c * UPC; u < sim.done; u++) boxes.push(facBox(u, 150));
    return { framing: { key: `outpost:${c}:${doneIn}${rk}`, kind: 'outpost', tau: 5, boxes, region: regionOf(req.aspect, 'low', this.regions), hy: hz.outpost }, hold };
  }

  // ---------------------------------------------------------------------------

  update(info: FrameInfo) {
    const sim = info.sim as SpaceSim;
    const f: SpaceFrame = { ...info, sim, wt: info.W / 1000 };
    this.realT += f.realDt;
    this.colony.sync(f);
    let boost = 0;
    if (this.celebrate0 >= 0) {
      const e = this.realT - this.celebrate0;
      boost = smooth(0, 1.8, e) * (1 - smooth(4, 8, e));
      if (e > 9) this.celebrate0 = -1;
    }
    const light = spaceLight(f.env);
    // the land takes the light of the hour; windows read brighter at night
    if (this.layer.container.tint !== light.tint) this.layer.container.tint = light.tint;
    const work = this.workers.read(f, this.colony.active(sim.zone));
    this.colony.update(f, work, boost + light.windows * 0.9);
    this.workers.update(f, work);
    this.expansion.update(f);
    this.defense.update(f);
    const p = sim.proj;
    const busy = p.building && f.W >= p.st0;
    const skyH = this.sky.update(f, busy, light);
    this.planet.update(f, skyH);
    this.terrain.update(f, light);
    this.colony.occlude(f, work, this.revealing);
    this.layer.project(f.proj);
    this.workers.drawCable(sim, work, f.proj);
    this.defense.drawBolts(f.proj);
    this.ambient.update(f, skyH, busy, light);
  }

  celebrate() {
    this.celebrate0 = this.realT;
  }

  stats(): SceneStats {
    return {
      cards: this.layer.size,
      visible: this.layer.visibleCount,
      detailedZones: this.colony.detailedCount(),
      textures: 0,
    };
  }

  destroy() {
    this.colony?.destroy();
    this.expansion?.destroy();
    this.defense?.destroy();
    this.planet?.destroy();
    this.terrain?.destroy();
    this.layer.clear();
    this.root.destroy({ children: true });
    if (this.tex) releaseSpaceTextures(this.tex);
  }
}
