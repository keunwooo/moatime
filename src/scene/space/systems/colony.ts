/**
 * Colony: outposts, facilities, roads and settlement decor of each zone, built from the
 * simulation, and the occlusion fade of finished modules standing in front of the work.
 */

import type { Card } from '../../diorama';
import { OcclusionFader, projectBox, timerRect, unionRect } from '../../occlusion';
import type { WorldSpec } from '../../types';
import { SpaceZone } from '../zone';
import type { SpaceCtx, SpaceFrame, SpaceWork } from './types';

export class Colony {
  readonly zones = new Map<string, SpaceZone>();
  private ctx: SpaceCtx;
  private world!: WorldSpec;
  private fader = new OcclusionFader();
  private kinds = '';

  constructor(ctx: SpaceCtx) {
    this.ctx = ctx;
  }

  setWorld(world: WorldSpec) {
    this.world = world;
    for (const z of this.zones.values()) z.destroy();
    this.zones.clear();
  }

  sync(f: SpaceFrame) {
    const sim = f.sim;
    // migrated facilities keep their kinds: rebuild the zones when that boundary changes
    const kinds = `${sim.legacyUnits}:${sim.v1Units}`;
    if (kinds !== this.kinds) {
      this.kinds = kinds;
      for (const z of this.zones.values()) z.destroy();
      this.zones.clear();
    }
    const k = sim.zone;
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
    for (const [key, w] of want) if (!this.zones.has(key)) this.zones.set(key, new SpaceZone(ctx, w.zone, w.level, sim.legacyUnits, sim.v1Units));
  }

  active(zone: number): SpaceZone | undefined {
    return this.zones.get(`${zone}:detail`);
  }

  update(f: SpaceFrame, work: SpaceWork, glowBoost: number) {
    const { sim, W, t, motion, wt, proj } = f;
    for (const zn of this.zones.values()) {
      zn.update({
        sim,
        W,
        t,
        motion,
        wt,
        proj,
        glowBoost,
        depotCrates: work.depot,
        depotReserved: Math.max(0, work.reserved),
        siteCrates: work.site,
        charging: work.charging,
        link: work.link,
        setupK: work.setupK,
        surveyK: work.surveyK,
        careUnit: work.careUnit,
        careK: work.careK,
      });
    }
  }

  /**
   * Finished modules standing in front of the work or close over the timer step back; while
   * a finished outpost is being shown, only the timer still makes them step back.
   */
  occlude(f: SpaceFrame, work: SpaceWork, revealing = false) {
    const { sim, proj, vp } = f;
    const p = sim.proj;
    const d = this.ctx.node('d' + sim.cluster);
    const o = this.ctx.node('o' + sim.cluster);
    const site = this.ctx.node('u' + p.unit);
    let rect = unionRect(projectBox(proj, d.x, d.z + 30, 130, 40), projectBox(proj, o.x, o.z + 36, 170, 50));
    rect = unionRect(rect, projectBox(proj, site.x, site.z, 220, 130));
    for (const rn of work.now) if (rn) rect = unionRect(rect, projectBox(proj, rn.x, rn.z, 80, 50));
    const workZ = Math.min(d.z, o.z, site.z) - 20;
    const cards: Card[] = [];
    for (const zn of this.zones.values()) for (const c of zn.occluders()) if (c.Z < workZ - 30) cards.push(c);
    this.fader.update(cards, proj, revealing ? null : rect, workZ, timerRect(vp.w, vp.h), f.realDt, f.jumped);
  }

  detailedCount(): number {
    return [...this.zones.keys()].filter((k) => k.endsWith('detail')).length;
  }

  destroy() {
    for (const z of this.zones.values()) z.destroy();
    this.zones.clear();
  }
}
