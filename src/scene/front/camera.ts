/**
 * The front camera: a fixed quarter view that steps back as the bases spread (zoom 1.6 → 1.0), leans
 * a little toward the work and carries the stage switches between planets. Like the other themes'
 * rigs it follows through a two-stage low-pass, and a time jump snaps straight to the current view.
 *
 * When the view turns to a new subject (its key changes) the zoom's focus moves onto that subject
 * at once while the picture stays exactly where it is; only then do the offset and zoom ease. So a
 * zoom never swings the subject out from a stale focus point.
 */

import type { Container } from 'pixi.js';

export interface CamTarget {
  /** What the view is about ('rest', 'lean', 'visit:moon', ...): a new key re-focuses. */
  key: string;
  /** Focus point in screen px (zoom happens around it). */
  fx: number;
  fy: number;
  /** Offset in px (the view moves toward the focus by this much). */
  ox: number;
  oy: number;
  z: number;
  /** Follow time constant (s) of the offset and zoom. */
  tau: number;
  /** Follow time constant of the focus point (a moving subject is followed closely). */
  tauF?: number;
}

interface CamState {
  fx: number;
  fy: number;
  ox: number;
  oy: number;
  z: number;
}

const KEYS = ['fx', 'fy', 'ox', 'oy', 'z'] as const;

export class FrontCamera {
  private a: CamState | null = null;
  private b: CamState | null = null;
  private key = '';
  moving = false;

  update(t: CamTarget, dt: number, snap: boolean): CamState {
    const target: CamState = { fx: t.fx, fy: t.fy, ox: t.ox, oy: t.oy, z: t.z };
    if (!this.a || !this.b || snap) {
      this.a = { ...target };
      this.b = { ...target };
      this.key = t.key;
      this.moving = false;
      return this.b;
    }
    if (t.key !== this.key) {
      this.key = t.key;
      this.refocus(t.fx, t.fy);
    }
    const k = 1 - Math.exp(-dt / Math.max(0.1, t.tau));
    const kF = 1 - Math.exp(-dt / Math.max(0.1, t.tauF ?? t.tau));
    let moving = false;
    for (const key of KEYS) {
      const kk = key === 'fx' || key === 'fy' ? kF : k;
      this.a[key] += (target[key] - this.a[key]) * kk;
      this.b[key] += (this.a[key] - this.b[key]) * kk;
      if (Math.abs(target[key] - this.b[key]) > (key === 'z' ? 0.002 : 0.6)) moving = true;
    }
    this.moving = moving;
    return this.b;
  }

  /**
   * Moves the focus to (fx, fy) and compensates the offset so nothing on screen moves. Exact for
   * every parallax: a layer maps P to (P − f)·(1 + (z − 1)p) + f − o·p, and the change in f is
   * cancelled by changing o by Δf·(1 − z).
   */
  private refocus(fx: number, fy: number) {
    for (const s of [this.a!, this.b!]) {
      s.ox += (fx - s.fx) * (1 - s.z);
      s.oy += (fy - s.fy) * (1 - s.z);
      s.fx = fx;
      s.fy = fy;
    }
  }

  /** Applies the view to a layer with parallax p (0 fixed .. 1 full). */
  static apply(c: Container, s: CamState, p: number) {
    const z = 1 + (s.z - 1) * p;
    c.pivot.set(s.fx, s.fy);
    c.position.set(s.fx - s.ox * p, s.fy - s.oy * p);
    c.scale.set(z);
  }
}
