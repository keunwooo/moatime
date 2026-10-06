/**
 * 2.5D diorama: painted cards (billboards) standing on a ground plane, viewed by a pinhole
 * camera that looks horizontally along +Z. Moving the camera gives real parallax: near
 * grass slides by quickly, distant forests barely move, and the horizon stays put.
 *
 * Camera parameters are expressed as screen-space intent (focus point, its screen
 * position, zoom at the focus, horizon height), which interpolate smoothly.
 */

import { Container } from 'pixi.js';

export interface CamParams {
  /** Focus point on the ground (world). */
  fx: number;
  fz: number;
  /** ln(px per world unit) at the focus depth. */
  lk: number;
  /** Screen position of the focus point (fractions of the viewport). */
  sx: number;
  sy: number;
  /** Horizon height (fraction of the viewport). */
  hy: number;
}

export interface Viewport {
  w: number;
  h: number;
  /** Focal length in CSS px. */
  f: number;
}

export function focalFor(w: number, h: number): number {
  return 1.18 * Math.max(w, h * 1.25);
}

export class Projector {
  w = 1;
  h = 1;
  f = 1;
  camX = 0;
  camZ = 0;
  camH = 1;
  horizon = 0;
  near = 24;

  set(p: CamParams, vp: Viewport) {
    this.w = vp.w;
    this.h = vp.h;
    this.f = vp.f;
    const k = Math.exp(p.lk);
    const D = vp.f / k;
    this.camZ = p.fz - D;
    this.camX = p.fx - (p.sx * vp.w - vp.w / 2) / k;
    this.horizon = p.hy * vp.h;
    this.camH = Math.max(4, (p.sy * vp.h - this.horizon) / k);
  }

  depth(Z: number): number {
    return Z - this.camZ;
  }

  scale(Z: number): number {
    const d = Z - this.camZ;
    return d > this.near ? this.f / d : 0;
  }

  /** Screen x/y of a world point (X, height Y, depth Z). */
  sx(X: number, Z: number): number {
    return this.w / 2 + (X - this.camX) * this.scale(Z);
  }
  sy(Y: number, Z: number): number {
    return this.horizon + (this.camH - Y) * this.scale(Z);
  }

  /** Foreshortening for flat ground cards: apparent height / width of a ground patch. */
  flatness(Z: number): number {
    const d = Math.max(this.near, Z - this.camZ);
    return Math.min(1, Math.max(0.035, this.camH / d));
  }

  /** World X range visible at depth Z (with margin factor). */
  visibleX(Z: number, margin = 1.15): [number, number] {
    const d = Math.max(this.near, Z - this.camZ);
    const half = ((this.w / 2) * d) / this.f;
    return [this.camX - half * margin, this.camX + half * margin];
  }
}

export interface Card {
  obj: Container;
  X: number;
  Y: number;
  Z: number;
  /** Ground decal: squashed vertically by the viewing angle. */
  flat?: boolean;
  /** Culling radius in world units around the anchor (x and up). */
  radius: number;
  /** Extra vertical extent above the anchor for culling (world units). */
  height?: number;
  /** Height of what actually covers the view, for occlusion (defaults to `height`). */
  occH?: number;
  /** Hidden by the owner (e.g. not yet grown). */
  hidden?: boolean;
  /** Fade with depth (0..1), computed by the layer when set. */
  fadeNear?: number;
  fadeFar?: number;
  alpha?: number;
  /** Extra fade for things standing in front of the work or the timer (see occlusion.ts). */
  dim?: number;
  /** Called after projection while visible. */
  onFrame?: (scale: number) => void;
  /** Sorting tiebreak for equal Z (higher draws later). */
  order?: number;
  /**
   * Added to Z for draw ordering only. Ground bands use a positive bias so the grass edge
   * just in front of a subject never hides a seed or sapling.
   */
  sortBias?: number;
}

const sortKey = (c: Card) => c.Z + (c.sortBias ?? 0);

/** Holds cards sorted far-to-near. Depth order never changes because cards face the camera. */
export class CardLayer {
  readonly container = new Container();
  private cards: Card[] = [];
  visibleCount = 0;

  add(card: Card) {
    // binary search: cards sorted by descending Z, then ascending order
    let lo = 0;
    let hi = this.cards.length;
    const key = sortKey(card);
    const ord = card.order ?? 0;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      const c = this.cards[m];
      const ck = sortKey(c);
      if (ck > key || (ck === key && (c.order ?? 0) <= ord)) lo = m + 1;
      else hi = m;
    }
    this.cards.splice(lo, 0, card);
    this.container.addChildAt(card.obj, lo);
    return card;
  }

  remove(card: Card, destroy = true) {
    const i = this.cards.indexOf(card);
    if (i >= 0) this.cards.splice(i, 1);
    if (card.obj.parent) card.obj.parent.removeChild(card.obj);
    if (destroy) card.obj.destroy({ children: true });
  }

  /**
   * Re-sorts a card after its Z changed. Moving actors usually stay near their place, so the
   * card walks to its new slot from where it is (same final order as removing and re-adding).
   */
  move(card: Card, Z: number) {
    if (card.Z === Z) return;
    const cards = this.cards;
    const i = cards.indexOf(card);
    card.Z = Z;
    if (i < 0) {
      this.add(card);
      return;
    }
    const key = sortKey(card);
    const ord = card.order ?? 0;
    // true for cards that belong before this one (farther, or same depth and added earlier)
    const before = (c: Card) => {
      const ck = sortKey(c);
      return ck > key || (ck === key && (c.order ?? 0) <= ord);
    };
    let j = i;
    while (j > 0 && !before(cards[j - 1])) j--;
    if (j === i) while (j < cards.length - 1 && before(cards[j + 1])) j++;
    if (j === i) return;
    cards.splice(i, 1);
    cards.splice(j, 0, card);
    this.container.addChildAt(card.obj, j);
  }

  get size() {
    return this.cards.length;
  }

  project(p: Projector) {
    let visible = 0;
    const margin = 60;
    for (const c of this.cards) {
      const o = c.obj;
      if (c.hidden) {
        o.visible = false;
        continue;
      }
      const s = p.scale(c.Z);
      if (s <= 0) {
        o.visible = false;
        continue;
      }
      const x = p.sx(c.X, c.Z);
      const y = p.sy(c.Y, c.Z);
      const r = c.radius * s;
      const up = (c.height ?? c.radius) * s;
      if (x + r < -margin || x - r > p.w + margin || y + r < -margin || y - up > p.h + margin) {
        o.visible = false;
        continue;
      }
      let a = (c.alpha ?? 1) * (c.dim ?? 1);
      if (c.fadeFar !== undefined || c.fadeNear !== undefined) {
        const d = p.depth(c.Z);
        if (c.fadeNear !== undefined && d < c.fadeNear) a *= Math.max(0, (d - p.near) / (c.fadeNear - p.near));
        if (c.fadeFar !== undefined && d > c.fadeFar * 0.75) a *= Math.max(0, 1 - (d - c.fadeFar * 0.75) / (c.fadeFar * 0.25));
      }
      if (a <= 0.003) {
        o.visible = false;
        continue;
      }
      o.visible = true;
      o.alpha = a;
      o.position.set(x, y);
      if (c.flat) o.scale.set(s, s * p.flatness(c.Z));
      else o.scale.set(s, s);
      c.onFrame?.(s);
      visible++;
    }
    this.visibleCount = visible;
  }

  clear() {
    for (const c of this.cards) {
      if (c.obj.parent) c.obj.parent.removeChild(c.obj);
      c.obj.destroy({ children: true });
    }
    this.cards = [];
  }
}
