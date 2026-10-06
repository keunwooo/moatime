/**
 * The minimap in the lower left corner (above the footer): the planet's ground, the territories
 * and the fog shrunk into a rounded frame, a thin box for what the camera shows, and a small ring
 * where a fight starts that fades over four seconds (it never blinks). Hidden in the orbit and
 * system stages and when turned off in the settings.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { clearIfDrawn, ownGroup } from '../../gfx';
import { clamp01, vis, type FrontFrame } from '../frame';
import type { P } from '../layout';

export class Minimap {
  readonly root = ownGroup(new Container());
  private frame = new Graphics();
  private view = new Graphics();
  private pings = new Graphics();
  private ground = new Sprite();
  private terr = new Sprite();
  private fog = new Sprite();
  private maskG = new Graphics();
  private size = '';
  private viewKey = '';
  private pingKey = '';
  private footT = Infinity;
  private footAt = -1;

  constructor() {
    const inner = new Container();
    inner.addChild(this.ground, this.terr, this.fog);
    inner.mask = this.maskG;
    this.root.addChild(this.frame, inner, this.maskG, this.view, this.pings);
  }

  /**
   * The top of the page's footer text (stats, opened details) over the canvas, read twice a
   * second: the footer wraps on narrower screens and grows when the details open.
   */
  private footTop(t: number): number {
    if (t - this.footAt > 0.5 || t < this.footAt) {
      this.footAt = t;
      const foot = typeof document !== 'undefined' ? document.querySelector('.world-info') : null;
      const cv = foot ? document.querySelector('.stage canvas') : null;
      this.footT = foot && cv ? foot.getBoundingClientRect().top - cv.getBoundingClientRect().top : Infinity;
    }
    return this.footT;
  }

  update(f: FrontFrame, tex: { ground: Texture | null; territory: Texture; fog: Texture }, view: { x0: number; y0: number; x1: number; y1: number }, pingAt: P | null, pingP: number, show: boolean) {
    vis(this.root, show ? 1 : 0);
    if (!show) return;
    const m = f.L.minimap;
    const w = m.w;
    const h = m.h;
    const x = m.x;
    const y = Math.round(Math.min(f.h - m.yFromBottom - h, this.footTop(f.t) - 12 - h));
    const sz = `${x},${y},${w},${h}`;
    if (sz !== this.size) {
      this.size = sz;
      this.frame.clear().roundRect(x - 3, y - 3, w + 6, h + 6, 9).fill({ color: 0x14141e, alpha: 0.55 }).stroke({ width: 1, color: 0xf2f1e9, alpha: 0.22 });
      this.maskG.clear().roundRect(x, y, w, h, 7).fill(0xffffff);
      for (const s of [this.ground, this.terr, this.fog]) {
        s.position.set(x, y);
        s.width = w;
        s.height = h;
      }
    }
    if (tex.ground && this.ground.texture !== tex.ground) this.ground.texture = tex.ground;
    if (this.terr.texture !== tex.territory) this.terr.texture = tex.territory;
    if (this.fog.texture !== tex.fog) this.fog.texture = tex.fog;
    this.root.alpha = 0.8;
    // what the camera shows (redrawn only when it moves by a pixel)
    const vx0 = x + clamp01(view.x0) * w;
    const vy0 = y + clamp01(view.y0) * h;
    const vx1 = x + clamp01(view.x1) * w;
    const vy1 = y + clamp01(view.y1) * h;
    const vk = `${Math.round(vx0)},${Math.round(vy0)},${Math.round(vx1)},${Math.round(vy1)}`;
    if (vk !== this.viewKey) {
      this.viewKey = vk;
      clearIfDrawn(this.view);
      if (vx1 - vx0 < w - 1 || vy1 - vy0 < h - 1) this.view.rect(vx0, vy0, vx1 - vx0, vy1 - vy0).stroke({ width: 1, color: 0xf2f1e9, alpha: 0.6 });
    }
    // a fight: a ring that widens and fades over the first seconds (no blinking)
    const pk = pingAt && pingP < 1 ? `${Math.round(pingAt.x * 100)},${Math.round(pingAt.y * 100)},${Math.round(pingP * 40)}` : '';
    if (pk !== this.pingKey) {
      this.pingKey = pk;
      clearIfDrawn(this.pings);
      if (pingAt && pingP < 1) {
        const r = 3 + 6 * pingP;
        this.pings.circle(x + pingAt.x * w, y + pingAt.y * h, r).stroke({ width: 1.2, color: 0xf2b544, alpha: 0.85 * (1 - pingP) });
      }
    }
  }
}
