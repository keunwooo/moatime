/**
 * Terrain: the painted ground bands (tinted by season) and the haze between depths. The haze
 * starts behind the work, so the target and its path stay clear while the distance recedes.
 */

import { mix, num } from '../../paint/color';
import { GroundSystem, HazeSystem } from '../../systems';
import { F } from '../palette';
import type { ForestLight } from './light';
import type { ForestCtx, ForestFrame } from './types';

export class ForestTerrain {
  readonly ground: GroundSystem;
  readonly haze: HazeSystem;
  private ctx: ForestCtx;

  constructor(ctx: ForestCtx) {
    this.ctx = ctx;
    const tex = ctx.tex;
    this.ground = new GroundSystem(ctx.layer, {
      edgeNear: tex.edgeNear,
      edgeFar: tex.edgeFar,
      softNear: tex.softNear,
      softFar: tex.softFar,
      bodyNear: tex.bodyNear,
      bodyFar: tex.bodyFar,
      periodWU: 1800,
      edgeHeightWU: 176,
      groundFrac: 0.6,
      bodyPeriodWU: 520,
      snowEdge: tex.snowEdge,
      snowSoft: tex.snowSoft,
      snowBody: tex.snowBody,
    });
    this.haze = new HazeSystem(ctx.layer, tex.haze, num(F.mist), 0.13, 320);
    this.haze.minDepth = 700;
  }

  update(f: ForestFrame, light: ForestLight) {
    const { proj, t, sim, env } = f;
    const sw = f.season.w;
    const w = env.weather;
    const warm = mix(mix(mix([255, 255, 255], [255, 250, 236], sw[1]), [255, 238, 214], sw[2]), [238, 244, 248], sw[3]);
    let ground = mix([255, 255, 255], warm, 0.6);
    // wet ground is darker and a little cooler; snow and frost lighten it
    ground = mix(ground, [ground[0] * 0.86, ground[1] * 0.88, ground[2] * 0.93], w.wet);
    ground = mix(ground, [246, 248, 252], w.snowCover * 0.55);
    ground = mix(ground, [236, 242, 250], light.frost * 0.35);
    this.ground.tint = num(ground);
    // real snow cover, and a thin white of hoarfrost on cold clear mornings
    this.ground.snow = Math.min(0.92, Math.max(w.snowCover * 1.35, light.frost * 0.3));
    this.ground.update(proj);
    this.haze.color = light.hazeColor;
    this.haze.alpha = Math.min(0.5, 0.13 + sw[3] * 0.05 - sw[1] * 0.02 + light.hazeAdd);
    // the haze starts behind the work, so the target and its path stay clear even in fog
    const site = this.ctx.node('u' + sim.tree.unit);
    const fogPull = w.fog * 220;
    this.haze.minDepth = Math.max(700 - fogPull, proj.depth(site.z) + 260 - fogPull * 0.4);
    this.haze.update(proj, t);
  }

  destroy() {
    this.ground.destroy();
    this.haze.destroy();
  }
}
