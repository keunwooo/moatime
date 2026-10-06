/**
 * Small wildlife that makes the forest feel lived in, kept small and slow:
 *  - Rabbit: from a grown forest on (stage 8), it hops in from the edge of the clearing at
 *    dawn and dusk (rarely in the day), nibbles, and hops away.
 *  - Deer: a rare sight from the world timeline; it walks slowly far behind the clearing,
 *    stops once to lift its head, and walks on.
 *  - Flock: in autumn (and now and then in spring) a high V of birds crosses the sky.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { clearIfDrawn, ownGroup } from '../gfx';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface HopPlan {
  t0: number;
  /** Start (edge), the nibbling spot, and where it leaves. */
  a: { x: number; z: number };
  b: { x: number; z: number };
  c: { x: number; z: number };
  dur: number;
}

/** A rabbit card: hops by ambient time along a three-point plan. */
export class Rabbit {
  readonly root = new Container();
  private sprite: Sprite;
  private tex: Texture[];

  constructor(tex: Texture[]) {
    this.tex = tex;
    this.sprite = new Sprite(tex[0]);
    this.sprite.anchor.set(0.5, 44 / 48);
    this.sprite.scale.set(20 / 64);
    this.root.addChild(this.sprite);
  }

  /** Position (world x, z), hop height and alpha at ambient time t, or null when gone. */
  pose(plan: HopPlan, t: number): { x: number; z: number; y: number; alpha: number } | null {
    const e = t - plan.t0;
    if (e < 0 || e > plan.dur) return null;
    // hop in (35%), nibble (30%), hop away (35%)
    const hopIn = plan.dur * 0.35;
    const stay = plan.dur * 0.3;
    let x: number;
    let z: number;
    let y = 0;
    let moving = false;
    let from = plan.a;
    let to = plan.b;
    if (e < hopIn) {
      const q = e / hopIn;
      x = from.x + (to.x - from.x) * q;
      z = from.z + (to.z - from.z) * q;
      moving = true;
      y = Math.abs(Math.sin(q * Math.PI * 5)) * 5;
    } else if (e < hopIn + stay) {
      x = to.x;
      z = to.z;
      // a little nibbling nod
      this.sprite.rotation = Math.sin(e * 6) * 0.05;
    } else {
      from = plan.b;
      to = plan.c;
      const q = (e - hopIn - stay) / (plan.dur - hopIn - stay);
      x = from.x + (to.x - from.x) * q;
      z = from.z + (to.z - from.z) * q;
      moving = true;
      y = Math.abs(Math.sin(q * Math.PI * 5)) * 5;
    }
    if (moving) this.sprite.rotation = 0;
    const airborne = moving && y > 1.5;
    this.sprite.texture = this.tex[airborne ? 1 : 0];
    this.sprite.scale.x = (20 / 64) * (to.x >= from.x ? 1 : -1);
    const alpha = smooth(0, 1.2, e) * (1 - smooth(plan.dur - 1.2, plan.dur, e));
    return { x, z, y, alpha };
  }
}

/** A deer card: walks across over the event's span, with one pause to look up. */
export class Deer {
  readonly root = new Container();
  private sprite: Sprite;
  private tex: Texture[];

  constructor(tex: Texture[]) {
    this.tex = tex;
    this.sprite = new Sprite(tex[0]);
    this.sprite.anchor.set(0.5, 122 / 128);
    this.sprite.scale.set(54 / 128);
    this.root.addChild(this.sprite);
  }

  /** q: progress of the event 0..1, dir: +1 walking right. Returns the walked fraction and alpha. */
  pose(q: number, t: number, dir: number): { k: number; alpha: number } {
    // walk 0–45%, stop and lift the head 45–60%, walk on 60–100%
    let k: number;
    let walking = true;
    if (q < 0.45) k = (q / 0.45) * 0.5;
    else if (q < 0.6) {
      k = 0.5;
      walking = false;
    } else k = 0.5 + ((q - 0.6) / 0.4) * 0.5;
    const step = Math.floor(t * 2.2) % 2;
    this.sprite.texture = this.tex[walking ? step : 2];
    this.sprite.scale.x = (54 / 128) * dir;
    const alpha = smooth(0, 0.08, q) * (1 - smooth(0.92, 1, q));
    return { k, alpha };
  }
}

/** A high V of small birds, drawn in screen space behind the trees. */
export class Flock {
  readonly g = ownGroup(new Graphics());
  private n = 9;

  /** p: progress 0..1 of the crossing; dir: −1 right→left. */
  draw(p: number, t: number, dir: number, vp: { w: number; h: number }, top: number, alpha: number, tint: number) {
    const g = this.g;
    clearIfDrawn(g);
    if (alpha <= 0.01) return;
    const lead = { x: dir < 0 ? vp.w * (1.1 - 1.3 * p) : vp.w * (-0.1 + 1.3 * p), y: top + Math.sin(p * Math.PI * 2) * vp.h * 0.01 };
    const s = Math.max(0.8, vp.h / 900);
    for (let i = 0; i < this.n; i++) {
      const rank = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      const x = lead.x - dir * rank * 15 * s;
      const y = lead.y + rank * 7 * s * side;
      const flap = Math.sin(t * 7 + i * 0.9) * 2.2 * s;
      const w = 4.5 * s;
      g.moveTo(x - w, y - flap).lineTo(x, y).lineTo(x + w, y - flap);
    }
    g.stroke({ color: tint, width: 1.3 * s, alpha });
  }
}

