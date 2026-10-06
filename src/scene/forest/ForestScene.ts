/**
 * 비밀의 숲 — forest theme scene.
 *
 * The keeper and the squirrel move by their simulated steps; the seed basket, leaf piles,
 * compost heap and leaf mould show the simulated stock; trees grow by the keeper's care.
 * Seasons (from world running time) change crowns, light and the leaf layer without touching
 * the work. Visitors (birds, butterflies, bees at the flowerbeds) and falling leaves are
 * decoration only.
 *
 * The world around the work follows the world clock and the weather (src/world): the sun
 * rises and sets, the sky, light, shadows and haze change with it, the moon and stars come out
 * at night; rain, fog, storms and snow come and go by the weather's state machine, and leave
 * wet ground, puddles and snow cover behind.
 *
 * The scene composes systems (src/scene/forest/systems): Sky (sky keyframes, sun, moon, stars,
 * clouds, lightning, distant hills), Light (one light colour for the diorama, haze, shafts),
 * Terrain (ground bands, haze), Vegetation (zones, trees with seasons and sun shadows,
 * occlusion), Wildlife (keeper, squirrel, bees, visitors), Weather (rain, snow, splashes) and
 * Ambient (falling leaves and petals, fireflies and the lantern, light shafts, motes).
 * Layers, back to front: Backdrop, the diorama (CardLayer, tinted by the light), glows (not
 * tinted), weather particles, the Overlay.
 */

import { Container, type Renderer } from 'pixi.js';
import { geometryFor } from '../../core/world';
import { forestDoneAt, forestStage, forestUnitProgress, type ForestSim } from '../../sim/forest';
import { innerOfUnit, nodePos, pondCenter } from '../../sim/layout';
import { num } from '../paint/color';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from '../../sim/units';
import { box, HORIZON, regionOf, type SubjectBox } from '../camera';
import { CardLayer } from '../diorama';
import { trackTextures } from '../paint/brush';
import { SceneCtx } from '../system';
import type { FramingChoice, FramingRequest, FrameInfo, SceneStats, ThemeScene, WorldSpec } from '../types';
import { AmbientEffects } from './systems/ambient';
import { forestLight } from './systems/light';
import { ForestSky } from './systems/sky';
import { ForestTerrain } from './systems/terrain';
import type { ForestCtx, ForestFrame } from './systems/types';
import { Vegetation } from './systems/vegetation';
import { ForestWeather } from './systems/weather';
import type { ZoneEnv } from './zone';
import { Wildlife } from './systems/wildlife';
import { buildForestTextures, releaseForestTextures, type ForestTextures } from './textures';

export { forestWind } from './wind';

export class ForestScene implements ThemeScene {
  readonly id = 'forest' as const;
  readonly extents = {
    close: { w: 74, h: 40 },
    sapling: { w: 150, h: 120 },
    mature: { w: 230, h: 300 },
  };
  readonly regions = {
    wide: {
      work: { x0: 0.28, x1: 0.72, y0: 0.6, y1: 0.885 },
      left: { x0: 0.03, x1: 0.42, y0: 0.27, y1: 0.92 },
      right: { x0: 0.58, x1: 0.97, y0: 0.27, y1: 0.92 },
    },
    tall: {
      work: { x0: -0.04, x1: 1.04, y0: 0.6, y1: 0.86 },
    },
  };
  readonly background = 0xf1ead9;
  readonly root = new Container();
  private tex!: ForestTextures;
  private layer = new CardLayer();
  private ctx!: ForestCtx;
  private world!: WorldSpec;
  private sky!: ForestSky;
  private terrain!: ForestTerrain;
  private vegetation!: Vegetation;
  private wildlife!: Wildlife;
  private ambient!: AmbientEffects;
  private weather!: ForestWeather;

  async build(_renderer: Renderer, world: WorldSpec, lowPower: boolean) {
    this.tex = await trackTextures(() => buildForestTextures(lowPower));
    this.ctx = new SceneCtx('forest', this.layer, this.tex);
    // creation order matters: cards that share a depth keep the order they were added in
    this.sky = new ForestSky(this.tex);
    this.terrain = new ForestTerrain(this.ctx);
    this.vegetation = new Vegetation(this.ctx);
    this.wildlife = new Wildlife(this.ctx);
    this.ambient = new AmbientEffects(this.ctx, lowPower, this.wildlife);
    this.weather = new ForestWeather(this.tex);
    // the migrating flock flies behind the trees, in the sky
    const bd = this.sky.backdrop;
    bd.root.addChildAt(this.wildlife.flock.g, bd.root.getChildIndex(bd.glowLayer));
    this.setWorld(world);
    this.root.addChild(this.sky.backdrop.root, this.layer.container, this.ambient.glowLayer, this.weather.root, this.ambient.overlay.root);
  }

  setWorld(world: WorldSpec) {
    this.world = world;
    this.ctx.setWorld(world.seed, geometryFor(world.aspect));
    this.vegetation.setWorld(world);
    this.wildlife.resetWorld();
    this.ambient.resetWorld();
  }

  // ---------------------------------------------------------------------------
  // Camera: the clearing's work corner (spring, bench, compost) and the site, then the grove.

  framing(req: FramingRequest): FramingChoice {
    const sim = req.sim as ForestSim;
    const g = geometryFor(req.aspect);
    const node = (id: string) => nodePos('forest', this.world.seed, g, id);
    const c = sim.cluster;
    const tr = sim.tree;
    // the back clearings of a zone are seen from a little higher, over the front grove
    const back = c % 4 >= 2 ? 0.05 : 0;
    const hz0 = HORIZON[req.aspect];
    const hz = { ...hz0, work: hz0.work - back, grow: hz0.grow - back };
    const doneIn = sim.done - c * UPC;
    const inner = innerOfUnit(c * UPC);
    const treeBox = (unit: number, h: number): SubjectBox => {
      const q = node(`u${unit}`);
      return box(q.x, q.z, h > 200 ? 220 : 120, h);
    };
    const job = sim.keeper.job;
    const filling = sim.pond.linedAt >= 0 && req.W - sim.pond.linedAt < 100_000;
    const landmark = job === 'pond' || filling ? 'pond' : job === 'elder' ? 'elder' : '';
    const workBoxes = (): SubjectBox[] => {
      const w = node(`w${c}`);
      const b = node(`b${c}`);
      const k = node(`k${c}`);
      const site = node(`u${tr.unit}`);
      // the haul path from the spring to the sprout and the bench (the compost joins later)
      const out = [box(w.x - inner * 14, w.z + 20, 70, 26), box(b.x + inner * 6, b.z + 16, 52, 40), box(site.x, site.z, 70, 44)];
      if (sim.done > c * UPC || sim.composts.some((x) => x.c === c)) out.push(box(k.x + inner * 10, k.z + 22, 50, 44));
      // the zone's landmarks join the view while the keeper works on them (and as the pond fills)
      if (landmark === 'pond') {
        const f = pondCenter(this.world.seed, sim.zone, g);
        out.push(box(f.x, f.z, 230, 50));
      } else if (landmark === 'elder') {
        const e = node(`g${sim.zone}`);
        out.push(box(e.x, e.z, 120, 90));
      }
      return out;
    };
    const g0 = forestUnitProgress(sim, tr.unit, req.W) ?? 0;
    if (sim.done > 0 && sim.done % UPC === 0 && doneIn === 0 && !req.reduced) {
      const t = forestDoneAt(sim, sim.done - 1);
      if (Number.isFinite(t) && req.W - t < 26_000) {
        const boxes: SubjectBox[] = [];
        const zoneDone = sim.done % UPZ === 0;
        for (let u = zoneDone ? sim.done - UPZ : sim.done - UPC; u < sim.done; u++) boxes.push(treeBox(u, 300));
        return { framing: { key: `reveal:${sim.done}`, kind: 'reveal', tau: 4.5, boxes, region: regionOf(req.aspect, 'wide', this.regions), hy: hz.reveal }, hold: false };
      }
    }
    if (req.reduced) {
      const boxes = workBoxes();
      for (let u = Math.floor(sim.done / UPZ) * UPZ; u < sim.done; u++) boxes.push(treeBox(u, 300));
      return { framing: { key: `overview:${c}:${sim.done}`, kind: 'overview', tau: 3, boxes, region: regionOf(req.aspect, 'wide', this.regions), hy: hz.overview }, hold: false };
    }
    // sprouting and the first leaves are watched without the view moving
    const kst = sim.keeper.step;
    const hold = (tr.phase >= 1 && g0 > 0.006 && g0 < 0.08) || (!!kst && (kst.k === 'plant' || kst.k === 'water') && kst.ref === tr.unit && req.W >= kst.t0);
    if (doneIn === 0 && g0 < 0.3) {
      return {
        framing: { key: `work:${c}:${tr.unit}${landmark}`, kind: 'work', tau: sim.done === 0 ? 2.6 : 4.6, boxes: workBoxes(), region: regionOf(req.aspect, 'work', this.regions), hy: hz.work, maxK: 3.2 },
        hold,
      };
    }
    // the grove of this clearing grows: frame the work corner with the trees, beside the timer
    const stage = g0 < 0.3 ? 60 : g0 < 0.6 ? 170 : 300;
    const boxes = workBoxes();
    boxes.push(treeBox(tr.unit, tr.phase === 0 ? 40 : stage));
    for (let u = c * UPC; u < sim.done; u++) boxes.push(treeBox(u, 300));
    const side = regionOf(req.aspect, inner > 0 ? 'left' : 'right', this.regions);
    return {
      framing: { key: `grow:${c}:${doneIn}:${stage}${landmark}`, kind: 'grow', tau: 5, boxes, region: side, hy: hz.grow, maxK: 2.3 },
      hold,
    };
  }

  // ---------------------------------------------------------------------------

  update(info: FrameInfo) {
    const sim = info.sim as ForestSim;
    const f: ForestFrame = { ...info, sim, season: info.env.season, wt: info.W / 1000, stage: forestStage(sim, info.W) };
    const light = forestLight(info.env);
    const w = info.env.weather;
    const sh = info.env.day.shadow;
    const zoneEnv: ZoneEnv = {
      wet: w.wet,
      snowCover: w.snowCover,
      // still water freezes in winter, harder under snow and on frosty mornings
      ice: f.season.w[3] * Math.min(1, 0.4 + w.snowCover * 0.8 + light.frost * 0.3),
      rain: w.rain,
      shadowDir: sh.dir,
      shadowLen: sh.len,
      shadowAlpha: sh.alpha * (1 - w.cloud * 0.8),
      // the old tree blossoms once a spring (stage 9 and up)
      bloom: (() => {
        const e = info.env.event;
        if (!e || e.kind !== 'blossom' || f.stage < 9) return 0;
        return Math.min(1, (info.W - e.t0) / 60_000, (e.t1 - info.W) / 60_000);
      })(),
    };
    this.ambient.tick(f.realDt);
    this.vegetation.sync(sim.zone);
    // the keeper's step first: zones show what it is moving right now
    const work = this.wildlife.readKeeper(f);
    this.vegetation.update(f, work, zoneEnv);
    const zone = this.vegetation.active(sim.zone);
    this.wildlife.update(f, work, zone);
    this.ambient.updateLeaves(f, zone, f.season);
    this.sky.update(f, light);
    this.terrain.update(f, light);
    // one light for the whole diorama: morning, noon, dusk, moonlight, storm
    this.layer.container.tint = num(light.tint);
    this.vegetation.occlude(f, work);
    this.layer.project(f.proj);
    this.ambient.updateGlow(f, work, light);
    this.weather.update(f, light);
    this.ambient.updateLight(f, light);
  }

  celebrate() {
    this.ambient.celebrate();
  }

  stats(): SceneStats {
    return { cards: this.layer.size, visible: this.layer.visibleCount, detailedZones: this.vegetation.detailedCount(), textures: this.vegetation.cardCount() };
  }

  destroy() {
    this.vegetation?.destroy();
    this.terrain?.destroy();
    this.sky?.destroy();
    this.layer.clear();
    this.root.destroy({ children: true });
    if (this.tex) releaseForestTextures(this.tex);
  }
}
