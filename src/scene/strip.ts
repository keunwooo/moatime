/**
 * A painted strip lying on the ground along a polyline (tyre tracks, cables, a dug channel).
 * Each short piece is a flat card whose sprite is turned to the piece's direction, so the
 * strip foreshortens with the ground. `reveal` shows it growing from its start.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import type { Vec2 } from '../core/world';
import type { Card, CardLayer } from './diorama';

interface Piece {
  card: Card;
  sprite: Sprite;
  /** Share of the strip length at this piece's end. */
  t1: number;
  t0: number;
}

export class GroundStrip {
  private pieces: Piece[] = [];
  private layer: CardLayer;
  private alpha = -1;
  private shown = -1;
  readonly cards: Card[] = [];

  constructor(layer: CardLayer, tex: Texture, pts: Vec2[], width: number, opts: { order?: number; tint?: number; maxPiece?: number } = {}) {
    this.layer = layer;
    const maxPiece = opts.maxPiece ?? 56;
    // split into short pieces
    const segs: { a: Vec2; b: Vec2 }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(len / maxPiece));
      for (let j = 0; j < n; j++) {
        segs.push({
          a: { x: a.x + ((b.x - a.x) * j) / n, z: a.z + ((b.z - a.z) * j) / n },
          b: { x: a.x + ((b.x - a.x) * (j + 1)) / n, z: a.z + ((b.z - a.z) * (j + 1)) / n },
        });
      }
    }
    const total = segs.reduce((s, g) => s + Math.hypot(g.b.x - g.a.x, g.b.z - g.a.z), 0) || 1;
    let acc = 0;
    for (const g of segs) {
      const dx = g.b.x - g.a.x;
      const dz = g.b.z - g.a.z;
      const len = Math.hypot(dx, dz);
      const obj = new Container();
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      // flat card space: x right, y toward the viewer (screen down), foreshortened by the layer
      sprite.rotation = Math.atan2(-dz, dx);
      sprite.width = len * 1.08;
      sprite.height = width;
      if (opts.tint !== undefined) sprite.tint = opts.tint;
      obj.addChild(sprite);
      const card: Card = { obj, X: (g.a.x + g.b.x) / 2, Y: 0, Z: (g.a.z + g.b.z) / 2, radius: len, height: 8, flat: true, order: opts.order ?? -2, alpha: 0, hidden: true };
      layer.add(card);
      this.cards.push(card);
      const t0 = acc / total;
      acc += len;
      this.pieces.push({ card, sprite, t0, t1: acc / total });
    }
  }

  /** Shows the first `reveal` (0..1) of the strip at the given opacity. */
  set(reveal: number, alpha: number) {
    if (reveal === this.shown && alpha === this.alpha) return;
    this.shown = reveal;
    this.alpha = alpha;
    for (const p of this.pieces) {
      const k = reveal >= p.t1 ? 1 : reveal <= p.t0 ? 0 : (reveal - p.t0) / (p.t1 - p.t0);
      p.card.hidden = k <= 0 || alpha <= 0.003;
      p.card.alpha = alpha * Math.min(1, k * 1.5);
    }
  }

  destroy() {
    for (const p of this.pieces) this.layer.remove(p.card);
    this.pieces = [];
    this.cards.length = 0;
  }
}
