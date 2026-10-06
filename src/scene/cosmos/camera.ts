/**
 * The cosmos camera: a fixed view that leans a little toward where a star is forming (at most 8%
 * of the width, a 15% zoom), steps back when a cluster or a zone is complete, and visits the life
 * planet for its milestones. Each layer follows it by its own parallax, so near bodies move more
 * than the far web. Like the other themes' rigs it follows through a two-stage low-pass (no jolt
 * at the start or the end), and a time jump snaps straight to the current view.
 */

import type { Container } from 'pixi.js';

export interface CamTarget {
  /** Focus point in screen px (zoom happens around it). */
  fx: number;
  fy: number;
  /** Offset in px (the view moves toward the focus by this much). */
  ox: number;
  oy: number;
  z: number;
  /** Follow time constant (s). */
  tau: number;
}

interface CamState {
  fx: number;
  fy: number;
  ox: number;
  oy: number;
  z: number;
}

const KEYS = ['fx', 'fy', 'ox', 'oy', 'z'] as const;

export class CosmosCamera {
  private a: CamState | null = null;
  private b: CamState | null = null;
  moving = false;

  update(t: CamTarget, dt: number, snap: boolean): CamState {
    const target: CamState = { fx: t.fx, fy: t.fy, ox: t.ox, oy: t.oy, z: t.z };
    if (!this.a || !this.b || snap) {
      this.a = { ...target };
      this.b = { ...target };
      this.moving = false;
      return this.b;
    }
    const k = 1 - Math.exp(-dt / Math.max(0.1, t.tau));
    let moving = false;
    for (const key of KEYS) {
      this.a[key] += (target[key] - this.a[key]) * k;
      this.b[key] += (this.a[key] - this.b[key]) * k;
      if (Math.abs(target[key] - this.b[key]) > (key === 'z' ? 0.002 : 0.6)) moving = true;
    }
    this.moving = moving;
    return this.b;
  }

  /** Applies the view to a layer with parallax p (0 fixed .. 1 full). */
  static apply(c: Container, s: CamState, p: number) {
    const z = 1 + (s.z - 1) * p;
    c.pivot.set(s.fx, s.fy);
    c.position.set(s.fx - s.ox * p, s.fy - s.oy * p);
    c.scale.set(z);
  }
}
