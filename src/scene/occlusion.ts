/**
 * Keeps the work and the timer visible without breaking depth: things that stand in front of
 * the current work area (or very close to the camera over the timer) fade gently, instead of the
 * target being pulled to the front. They come back as soon as the view moves on.
 */

import type { Card, Projector } from './diorama';

export interface ScreenRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function overlaps(a: ScreenRect, b: ScreenRect, margin = 0): boolean {
  return a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.y0 < b.y1 + margin && a.y1 > b.y0 - margin;
}

export class OcclusionFader {
  private fade = new Map<Card, number>();

  /**
   * cards: candidates (grown trees, facilities, large rocks). workZ: depth of the front of the
   * work area. work and timer are screen rectangles in px. dt: real seconds.
   */
  update(cards: Iterable<Card>, proj: Projector, work: ScreenRect | null, workZ: number, timer: ScreenRect, dt: number, snap: boolean) {
    const k = snap ? 1 : 1 - Math.exp(-Math.max(0, dt) / 0.6);
    const seen = new Set<Card>();
    for (const c of cards) {
      seen.add(c);
      let target = 1;
      if (!c.hidden && c.Z < workZ - 30) {
        const s = proj.scale(c.Z);
        if (s > 0) {
          const r = c.radius * s * 0.8;
          const x = proj.sx(c.X, c.Z);
          const rect = { x0: x - r, x1: x + r, y0: proj.sy(c.occH ?? c.height ?? c.radius, c.Z), y1: proj.sy(0, c.Z) };
          if (work && overlaps(rect, work, 6)) target = 0.22;
          // very near and tall over the timer: almost gone
          if (overlaps(rect, timer) && proj.depth(c.Z) < proj.depth(workZ) * 0.8) target = Math.min(target, proj.depth(c.Z) < proj.depth(workZ) * 0.45 ? 0.05 : 0.14);
        }
      }
      const cur = this.fade.get(c) ?? 1;
      const next = cur + (target - cur) * k;
      this.fade.set(c, next);
      c.dim = next > 0.995 ? undefined : next;
    }
    for (const c of this.fade.keys()) if (!seen.has(c)) this.fade.delete(c);
  }
}

/** Screen rectangle of a world box (x center, depth z, width w, height h). */
export function projectBox(proj: Projector, x: number, z: number, w: number, h: number): ScreenRect | null {
  const s = proj.scale(z);
  if (s <= 0) return null;
  return { x0: proj.sx(x - w / 2, z), x1: proj.sx(x + w / 2, z), y0: proj.sy(h, z), y1: proj.sy(0, z) };
}

export function unionRect(a: ScreenRect | null, b: ScreenRect | null): ScreenRect | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
}

/** Where the timer and its buttons sit (fractions → px). */
export function timerRect(w: number, h: number): ScreenRect {
  return w > h ? { x0: w * 0.33, x1: w * 0.67, y0: h * 0.24, y1: h * 0.62 } : { x0: w * 0.04, x1: w * 0.96, y0: h * 0.14, y1: h * 0.5 };
}
