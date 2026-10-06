/**
 * Scene systems: each theme scene is a composer of small systems (sky, terrain, vegetation,
 * wildlife, weather, ...). A system owns its display objects, reads one frame and writes
 * them; it never changes the simulation. Systems run in a fixed order each frame, so the
 * draw order of cards that share a depth stays stable.
 */

import type { WorkTheme as ThemeId } from '../core/session';
import type { Geometry, Vec2 } from '../core/world';
import { nodePos } from '../sim/layout';
import type { CardLayer } from './diorama';

export interface SceneSystem<F> {
  update(f: F): void;
  destroy?(): void;
}

/** Shared per-scene context: the card layer, the world and cached simulation node positions. */
export class SceneCtx<T> {
  readonly layer: CardLayer;
  readonly tex: T;
  seed = 0;
  geom!: Geometry;
  private theme: ThemeId;
  private cache = new Map<string, Vec2>();

  constructor(theme: ThemeId, layer: CardLayer, tex: T) {
    this.theme = theme;
    this.layer = layer;
    this.tex = tex;
  }

  setWorld(seed: number, geom: Geometry) {
    this.seed = seed;
    this.geom = geom;
    this.cache.clear();
  }

  /** World position of a simulation node (`b0`, `u12`, ...). */
  node(id: string): Vec2 {
    let p = this.cache.get(id);
    if (!p) {
      p = nodePos(this.theme, this.seed, this.geom, id);
      if (this.cache.size > 600) this.cache.clear();
      this.cache.set(id, p);
    }
    return p;
  }
}
