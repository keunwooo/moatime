/**
 * Space sky: the deep sky of a thin atmosphere with two faint nebulae, the star field with
 * thirty breathing stars (a few slowly brightening and fading), the ringed gas giant drifting
 * across its corner over hours with its lit side turned to the sun and a small moon going round
 * it every three hours, the small far sun crossing the sky over the planet's day, a glow along
 * the horizon at dawn and dusk, and the distant ridges (settlement lights appear as zones grow).
 * Positions in the sky follow world time W; breathing and drifting bands follow ambient time.
 */

import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { rngFor } from '../../../core/rng';
import { timerRect } from '../../occlusion';
import { Backdrop } from '../../systems';
import type { SpaceLight } from '../light';
import { GIANT, HILLS } from '../paint';
import type { SpaceTextures } from '../textures';
import type { SpaceFrame } from './types';

export class SpaceSky {
  readonly backdrop: Backdrop;
  private stars: TilingSprite;
  private twinkles: { s: Sprite; x: number; y: number; f: number; p: number; a: number }[] = [];
  private giant: Container;
  private streaks: TilingSprite;
  private shade: Sprite;
  private moonlet: Sprite;
  private nebulae: { s: Sprite; x: number; y: number; w: number; p: number }[] = [];
  private glow: Sprite;
  private sun: Container;

  constructor(tex: SpaceTextures) {
    this.backdrop = new Backdrop(tex.sky);
    const root = this.backdrop.root;
    this.stars = new TilingSprite({ texture: tex.stars, width: 100, height: 100 });
    root.addChildAt(this.stars, 1);
    // two faint nebulae behind the stars, in the corners
    [
      { tex: tex.nebula[0], tint: 0xd8a0c8, x: 0.12, y: 0.22, w: 0.5 },
      { tex: tex.nebula[1], tint: 0x8cc8d0, x: 0.86, y: 0.3, w: 0.45 },
    ].forEach((n, i) => {
      const s = new Sprite(n.tex);
      s.anchor.set(0.5);
      s.tint = n.tint;
      s.blendMode = 'add';
      root.addChildAt(s, 1);
      this.nebulae.push({ s, x: n.x, y: n.y, w: n.w, p: i * 2.1 });
    });
    this.glow = new Sprite(tex.horizonGlow);
    this.glow.anchor.set(0, 1);
    root.addChildAt(this.glow, 2);
    // thirty stars breathe, softly, none behind the timer; a few brighten and fade slowly
    const rr = rngFor(9, 9);
    for (let i = 0; i < 30; i++) {
      const s = new Sprite(tex.star);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      root.addChildAt(s, 3);
      const band = i % 3;
      const x = band === 0 ? rr.range(0.02, 0.3) : band === 1 ? rr.range(0.7, 0.98) : rr.range(0.3, 0.7);
      const y = band === 2 ? rr.range(0.03, 0.2) : rr.range(0.05, 0.6);
      const slow = i % 7 === 0;
      this.twinkles.push({ s, x, y, f: slow ? rr.range(0.04, 0.08) : rr.range(0.2, 0.5), p: rr.range(0, 6.28), a: slow ? rr.range(0.6, 0.9) : rr.range(0.25, 0.6) });
    }
    // the sun: a small bright disk in a wide soft halo
    this.sun = new Container();
    const halo = new Sprite(tex.sunHalo);
    halo.anchor.set(0.5);
    halo.scale.set(1.6);
    halo.alpha = 0.45;
    halo.blendMode = 'add';
    const disk = new Sprite(tex.sun);
    disk.anchor.set(0.5);
    this.sun.addChild(halo, disk);
    root.addChildAt(this.sun, 4);
    // the gas giant: disk with the far ring, drifting streaks on the disk, night side, near ring
    this.giant = new Container();
    const body = new Sprite(tex.giant);
    body.anchor.set(0.5);
    this.streaks = new TilingSprite({ texture: tex.giantStreaks, width: GIANT.R * 2, height: GIANT.R * 2 });
    this.streaks.anchor.set(0.5);
    this.streaks.rotation = GIANT.tilt;
    this.streaks.alpha = 0.55;
    const mask = new Graphics().circle(0, 0, GIANT.R - 1).fill({ color: 0xffffff });
    this.streaks.mask = mask;
    this.shade = new Sprite(tex.giantShade);
    this.shade.anchor.set(0.5);
    const ring = new Sprite(tex.giantRing);
    ring.anchor.set(0.5);
    // its small moon passes behind the planet and in front of it
    this.moonlet = new Sprite(tex.moonlet);
    this.moonlet.anchor.set(0.5);
    this.moonlet.scale.set((GIANT.R * 0.42) / tex.moonlet.width);
    this.giant.sortableChildren = true;
    body.zIndex = 0;
    this.streaks.zIndex = 1;
    mask.zIndex = 1;
    this.shade.zIndex = 2;
    ring.zIndex = 3;
    this.giant.addChild(body, this.streaks, mask, this.shade, ring, this.moonlet);
    root.addChildAt(this.giant, 5);
    for (let i = HILLS.length - 1; i >= 0; i--) {
      const h = HILLS[i];
      this.backdrop.addHill({ texture: tex.hills[i], depth: h.depth, periodWU: h.period, heightWU: h.height, dressing: i === 0 ? tex.ridge : undefined, dressingAlpha: 0 });
    }
  }

  /** Puts a layer of sky sights in front of the gas giant and behind the hills. */
  insertSky(c: Container) {
    const root = this.backdrop.root;
    root.addChildAt(c, root.getChildIndex(this.giant) + 1);
  }

  /** Puts a layer over the hills (far haze). */
  overHills(c: Container) {
    this.backdrop.root.addChild(c);
  }

  private bodyXY(az: number, elev: number, horizon: number, vp: { w: number; h: number }) {
    return { x: vp.w * (0.5 + az * 0.46), y: horizon - elev * (horizon - vp.h * 0.12) };
  }

  /** Returns the sky height on screen (the horizon line). */
  update(f: SpaceFrame, busy: boolean, light: SpaceLight): number {
    const { proj, vp, t, motion, sim, env } = f;
    const bd = this.backdrop;
    bd.update(proj, vp);
    bd.setDressingAlpha(HILLS.length - 1, Math.min(0.95, Math.max(0, (sim.zone - 1) / 8)));
    // settlement lights on the ridge keep their own glow at night
    bd.tintHills(light.hills, 0xffffff);
    const skyH = Math.max(1, proj.horizon);
    const k = Math.max(vp.w / 1024, skyH / 640);
    this.stars.width = vp.w;
    this.stars.height = skyH + 10;
    this.stars.tileScale.set(k);
    this.stars.tilePosition.x = -proj.camX * 0.004;
    this.stars.y = 0;
    this.stars.alpha = light.stars;
    const twinkleK = busy ? 0.5 : 1;
    this.twinkles.forEach((tw, i) => {
      tw.s.visible = i < Math.round(this.twinkles.length * Math.min(1, f.effects));
      tw.s.position.set(tw.x * vp.w, tw.y * skyH);
      tw.s.scale.set(Math.max(0.45, vp.h / 1300));
      tw.s.alpha = tw.a * light.stars * (motion ? 0.72 + 0.28 * Math.sin(t * tw.f + tw.p) * twinkleK : 0.8);
    });

    // the glow band along the horizon
    this.glow.position.set(0, skyH + 2);
    this.glow.width = vp.w;
    this.glow.height = Math.max(40, vp.h * 0.24);
    this.glow.tint = light.glow;
    this.glow.alpha = light.glowAlpha;

    // the sun crosses the sky over the planet's day and steps back behind the timer
    const day = env.day;
    const sp = this.bodyXY(day.sun.az, day.sun.elev, skyH, vp);
    this.sun.position.set(sp.x, sp.y);
    this.sun.scale.set(Math.max(0.42, vp.h / 1500));
    const tr = timerRect(vp.w, vp.h);
    const behind = sp.x > tr.x0 && sp.x < tr.x1 && sp.y > tr.y0 - vp.h * 0.04 && sp.y < tr.y1 ? 0.4 : 1;
    this.sun.alpha = Math.min(1, Math.max(0, (day.sun.elev + 0.04) / 0.08)) * behind;
    this.sun.visible = this.sun.alpha > 0.01;

    // the gas giant hangs in the upper corner; on tall screens it is smaller and sits in the
    // gap at the right between the theme toggles and the status line
    const wideVp = vp.w > vp.h;
    const r = wideVp ? Math.max(40, 0.048 * vp.w) : Math.max(14, 0.042 * vp.w);
    // over hours of running time it drifts within its corner
    const drift = (f.W / (6 * 3600_000)) * Math.PI * 2;
    if (wideVp) this.giant.position.set(vp.w * (0.15 + 0.035 * Math.sin(drift)), Math.max(r * 1.7, skyH * (0.3 + 0.04 * Math.cos(drift * 0.7))));
    else this.giant.position.set(vp.w * 0.91, vp.h * 0.162);
    this.giant.scale.set(r / GIANT.R);
    // its bands drift very slowly
    this.streaks.tilePosition.x = (motion ? t : 0) * 0.4;
    // the lit side faces the sun (the night side was painted toward the lower right)
    const toSun = Math.atan2(sp.y - this.giant.y, sp.x - this.giant.x);
    this.shade.rotation = toSun - Math.atan2(-1, -1);
    // the moon goes round every three hours, in the plane of the ring
    const th = (f.W / (3 * 3600_000)) * Math.PI * 2 + 1.3;
    const ox = Math.cos(th) * GIANT.R * 2.05;
    const oy = Math.sin(th) * GIANT.R * 0.5;
    this.moonlet.position.set(ox * Math.cos(GIANT.tilt) - oy * Math.sin(GIANT.tilt), ox * Math.sin(GIANT.tilt) + oy * Math.cos(GIANT.tilt));
    this.moonlet.zIndex = Math.sin(th) > 0 ? 4 : -1;
    // nebulae breathe very slowly
    for (const n of this.nebulae) {
      n.s.position.set(n.x * vp.w, n.y * skyH);
      n.s.scale.set((n.w * vp.w) / n.s.texture.width);
      n.s.alpha = light.stars * (0.1 + (motion ? 0.03 * Math.sin(t * 0.05 + n.p) : 0));
    }
    return skyH;
  }
}
