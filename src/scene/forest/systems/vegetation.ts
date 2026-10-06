/**
 * Vegetation: the zones of the forest (trees, clearings, soil, litter, flowerbeds) built from
 * the simulation, and the occlusion fade of grown trees standing in front of the work.
 */

import { forestUnitProgress } from '../../../sim/forest';
import { innerOfUnit } from '../../../sim/layout';
import { RULES_UNITS_PER_CLUSTER as UPC } from '../../../sim/units';
import type { Card } from '../../diorama';
import { OcclusionFader, projectBox, timerRect, unionRect } from '../../occlusion';
import type { WorldSpec } from '../../types';
import { forestWind } from '../wind';
import { ForestZone, type ZoneEnv } from '../zone';
import type { ForestCtx, ForestFrame, KeeperWork } from './types';

export class Vegetation {
  readonly zones = new Map<string, ForestZone>();
  private ctx: ForestCtx;
  private fader = new OcclusionFader();
  private world!: WorldSpec;

  constructor(ctx: ForestCtx) {
    this.ctx = ctx;
  }

  setWorld(world: WorldSpec) {
    this.world = world;
    for (const z of this.zones.values()) z.destroy();
    this.zones.clear();
  }

  /** Detailed zones around the active one, simplified older zones behind. */
  sync(k: number) {
    const want = new Map<string, { zone: number; level: 'detail' | 'lod' }>();
    for (let z = k - 1; z <= k + 1; z++) if (z >= 0) want.set(`${z}:detail`, { zone: z, level: 'detail' });
    for (let z = k - 5; z <= k - 2; z++) if (z >= 0) want.set(`${z}:lod`, { zone: z, level: 'lod' });
    for (const [key, zone] of this.zones) {
      if (!want.has(key)) {
        zone.destroy();
        this.zones.delete(key);
      }
    }
    const ctx = { seed: this.world.seed, rules: this.world.rules, geom: this.ctx.geom, layer: this.ctx.layer, tex: this.ctx.tex };
    for (const [key, w] of want) if (!this.zones.has(key)) this.zones.set(key, new ForestZone(ctx, w.zone, w.level));
  }

  active(zone: number): ForestZone | undefined {
    return this.zones.get(`${zone}:detail`);
  }

  update(f: ForestFrame, work: KeeperWork, env: ZoneEnv) {
    const { sim, W, t, motion, season } = f;
    for (const z of this.zones.values()) {
      z.update({
        sim,
        W,
        t,
        motion,
        wind: forestWind,
        season,
        basket: Math.max(0, work.basket),
        basketHome: work.basketHome,
        picking: work.picking,
        barrelBuild: work.barrelBuild,
        digging: work.digging,
        clearing: work.clearing,
        stir: work.stir,
        bedMaking: work.bedMaking,
        pondDig: work.pondDig,
        pondLine: work.pondLine,
        env,
      });
    }
  }

  /** Grown trees standing in front of the work corner or close over the timer step back. */
  occlude(f: ForestFrame, work: KeeperWork) {
    const { sim, W, proj, vp } = f;
    const c = sim.cluster;
    const inner = innerOfUnit(c * UPC);
    const w = this.ctx.node('w' + c);
    const b = this.ctx.node('b' + c);
    const site = this.ctx.node('u' + sim.tree.unit);
    const g0w = forestUnitProgress(sim, sim.tree.unit, W) ?? 0;
    let rect = unionRect(projectBox(proj, w.x - inner * 14, w.z + 20, 80, 40), projectBox(proj, b.x, b.z + 16, 60, 40));
    rect = unionRect(rect, projectBox(proj, site.x, site.z, 90, g0w < 0.3 ? 60 : g0w < 0.6 ? 170 : 300));
    if (work.st) rect = unionRect(rect, projectBox(proj, work.kx, work.kz, 40, 40));
    const workZ = Math.min(w.z, b.z, site.z) - 10;
    const cards: Card[] = [];
    for (const z of this.zones.values()) cards.push(...z.occluders());
    this.fader.update(cards, proj, rect, workZ, timerRect(vp.w, vp.h), f.realDt, f.jumped);
  }

  cardCount(): number {
    let n = 0;
    for (const z of this.zones.values()) n += z.cardCount();
    return n;
  }

  detailedCount(): number {
    return [...this.zones.keys()].filter((k) => k.endsWith('detail')).length;
  }

  destroy() {
    for (const z of this.zones.values()) z.destroy();
    this.zones.clear();
  }
}
