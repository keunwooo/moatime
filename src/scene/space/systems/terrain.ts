/** Space terrain: sand ground bands and a faint haze behind the site, in the light of the hour. */

import { num } from '../../paint/color';
import { GroundSystem, HazeSystem } from '../../systems';
import { S } from '../palette';
import type { SpaceLight } from '../light';
import type { SpaceCtx, SpaceFrame } from './types';

export class SpaceTerrain {
  readonly ground: GroundSystem;
  readonly haze: HazeSystem;
  private ctx: SpaceCtx;

  constructor(ctx: SpaceCtx) {
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
    });
    this.haze = new HazeSystem(ctx.layer, tex.haze, num(S.lavender), 0.07, 300);
    this.haze.minDepth = 900;
  }

  update(f: SpaceFrame, light: SpaceLight) {
    const { proj, t, sim } = f;
    this.ground.update(proj);
    this.haze.color = light.haze;
    const siteZ = this.ctx.node('u' + sim.proj.unit).z;
    this.haze.minDepth = Math.max(900, proj.depth(siteZ) + 300);
    this.haze.update(proj, t);
  }

  destroy() {
    this.ground.destroy();
    this.haze.destroy();
  }
}
