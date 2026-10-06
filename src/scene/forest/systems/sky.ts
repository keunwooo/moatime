/**
 * Sky: one gradient blended stop by stop from the day, dawn, dusk, night and overcast skies
 * by the world clock and the weather (a single quad, repainted only when its colours change); the sun rising in the east and setting in the west, the moon with its phase,
 * stars at night, clouds that thicken, darken and speed up with the weather, and the distant
 * hills (memory forests appear on the far ridge as zones accumulate). A lightning flash
 * brightens the sky only, softly; a thin bolt shows far away on the horizon.
 */

import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { hash32 } from '../../../core/rng';
import { makeCanvas, releaseTexture, toTexture, type PaintCanvas } from '../../paint/brush';
import { css, mix, num, type RGB } from '../../paint/color';
import { timerRect } from '../../occlusion';
import { Backdrop } from '../../systems';
import { HILLS, SKY_STOPS } from '../paint';
import { SKY_DAWN, SKY_DUSK, SKY_NIGHT, SKY_OVERCAST, SKY_STOP_AT } from '../paintSky';
import type { ForestTextures } from '../textures';
import type { ForestLight } from './light';
import type { ForestFrame } from './types';

const MAX_CLOUDS = 6;

const SKY_DAY: RGB[] = SKY_STOPS.map((s) => s[1]);

export class ForestSky {
  readonly backdrop: Backdrop;
  private skyPc: PaintCanvas;
  private skyTex: Texture;
  private skyKey = '';
  private stars: TilingSprite;
  private sun: Sprite;
  private moon: Container;
  private moonShade: Sprite;
  private clouds: { s: Sprite; x: number; y: number; speed: number; w: number }[] = [];
  private flash: Sprite;
  private bolt: Graphics;
  private boltKey = '';
  private fog: Sprite;
  /** A rainbow after spring rain, on the side away from the sun (Phase 9). */
  private rainbow: Sprite;
  /** Shooting stars on clear nights (one every 50–120 s of screen time). */
  private meteor: Sprite;
  private star = { next: 40, t0: -10, dur: 1.2, x0: 0, y0: 0, dx: 0, dy: 0 };

  constructor(tex: ForestTextures) {
    this.skyPc = makeCanvas(32, 512);
    this.skyTex = toTexture(this.skyPc, { label: 'sky-live', mipmaps: false });
    this.paintSky(SKY_DAY);
    this.backdrop = new Backdrop(this.skyTex);
    const bd = this.backdrop;
    const celestial = new Container();
    this.stars = new TilingSprite({ texture: tex.stars, width: 100, height: 100 });
    this.stars.alpha = 0;
    this.sun = new Sprite(tex.sunDisk);
    this.sun.anchor.set(0.5);
    this.sun.blendMode = 'add';
    this.moon = new Container();
    const disk = new Sprite(tex.moonDisk);
    disk.anchor.set(0.5);
    this.moonShade = new Sprite(tex.moonShade);
    this.moonShade.anchor.set(0.5);
    const mask = new Graphics().circle(0, 0, 40.5).fill({ color: 0xffffff });
    this.moonShade.mask = mask;
    this.moon.addChild(disk, this.moonShade, mask);
    celestial.addChild(this.stars, this.moon, this.sun);
    bd.root.addChildAt(celestial, 1);
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const s = new Sprite(tex.clouds[i % 3]);
      s.anchor.set(0.5, 0.62);
      s.alpha = 0;
      bd.root.addChildAt(s, bd.root.getChildIndex(bd.glowLayer));
      this.clouds.push({
        s,
        x: [0.16, 0.62, 0.9, 0.38, 0.78, 0.05][i],
        y: [0.36, 0.44, 0.3, 0.5, 0.24, 0.42][i],
        speed: [2.2, 1.4, 1.8, 1.1, 2.6, 1.6][i],
        w: [0.34, 0.26, 0.3, 0.22, 0.28, 0.24][i],
      });
    }
    // lightning light on the clouds, and a thin bolt far away (behind the hills)
    this.flash = new Sprite(tex.sunGlow);
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.bolt = new Graphics();
    this.rainbow = new Sprite(tex.rainbow);
    this.rainbow.anchor.set(0.5, 1);
    this.rainbow.visible = false;
    bd.root.addChildAt(this.rainbow, bd.root.getChildIndex(bd.glowLayer));
    this.meteor = new Sprite(tex.mote);
    this.meteor.anchor.set(0.9, 0.5);
    this.meteor.blendMode = 'add';
    this.meteor.visible = false;
    bd.root.addChildAt(this.meteor, bd.root.getChildIndex(bd.glowLayer));
    bd.root.addChildAt(this.flash, bd.root.getChildIndex(bd.glowLayer));
    bd.root.addChildAt(this.bolt, bd.root.getChildIndex(bd.glowLayer));
    for (let i = HILLS.length - 1; i >= 0; i--) {
      const h = HILLS[i];
      bd.addHill({ texture: tex.hills[i], depth: h.depth, periodWU: h.period, heightWU: h.height, dressing: i === 0 ? tex.ridge : undefined, dressingAlpha: 0 });
    }
    // fog lies over the distant hills, under everything nearer
    this.fog = new Sprite(tex.fogBand);
    this.fog.anchor.set(0, 0.5);
    this.fog.alpha = 0;
    bd.root.addChild(this.fog);
  }

  private paintSky(stops: RGB[]) {
    const { ctx, w, h } = this.skyPc;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    stops.forEach((c, i) => g.addColorStop(SKY_STOP_AT[i], css(c)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    this.skyTex.source.update();
  }

  destroy() {
    releaseTexture(this.skyTex);
  }

  /** Sun or moon position on screen: rises in the east (left), sets in the west (right). */
  private bodyXY(az: number, elev: number, horizon: number, vp: { w: number; h: number }) {
    return { x: vp.w * (0.5 + az * 0.46), y: horizon - elev * (horizon - vp.h * 0.14) };
  }

  /** Rainbow after a shower and the odd shooting star (Phase 9). */
  private updateSights(f: ForestFrame, horizon: number) {
    const { env, vp, W, t, motion } = f;
    const e = env.event;
    const rb = this.rainbow;
    rb.visible = false;
    if (e && e.kind === 'rainbow') {
      const k = Math.min(1, (W - e.t0) / 40_000) * Math.min(1, (e.t1 - W) / 60_000);
      // opposite the sun, to one side of the timer
      const side = env.day.sun.az > 0 ? -1 : 1;
      rb.visible = k > 0.01;
      rb.position.set(vp.w * (0.5 + side * 0.4), horizon + vp.h * 0.02);
      rb.scale.set((vp.w * 0.56) / rb.texture.width);
      rb.alpha = 0.55 * k * (1 - env.weather.cloud * 0.6);
    }
    // shooting stars on clear nights, away from the timer
    const st = this.star;
    const m = this.meteor;
    if (!motion || env.day.stars < 0.6 || env.weather.cloud > 0.35) {
      m.visible = false;
      return;
    }
    const age = t - st.t0;
    if (age >= 0 && age < st.dur) {
      const q = age / st.dur;
      m.visible = true;
      m.position.set(st.x0 + st.dx * q, st.y0 + st.dy * q);
      m.rotation = Math.atan2(st.dy, st.dx);
      m.scale.set((5 * Math.max(0.6, vp.w / 1440) * 32) / m.texture.width, (0.3 * 32) / m.texture.height);
      m.alpha = Math.sin(q * Math.PI) * 0.7;
      return;
    }
    m.visible = false;
    if (t < st.next) return;
    if (!f.director.request('shootingStar', 'fx', 1.4)) {
      st.next = t + 5;
      return;
    }
    const r = (k: number) => (hash32(Math.floor(t * 1000), k) >>> 0) / 4294967296;
    const left = r(1) < 0.5;
    st.t0 = t;
    st.dur = 0.9 + r(2) * 0.6;
    st.x0 = vp.w * (left ? 0.12 + r(3) * 0.18 : 0.7 + r(3) * 0.18);
    st.y0 = horizon * (0.08 + r(4) * 0.22);
    st.dx = vp.w * (left ? -1 : 1) * (0.1 + r(5) * 0.06);
    st.dy = horizon * (0.06 + r(6) * 0.06);
    st.next = t + st.dur + 50 + r(7) * 70;
  }

  update(f: ForestFrame, light: ForestLight) {
    const { proj, vp, t, sim, env } = f;
    const { day, weather } = env;
    const bd = this.backdrop;
    bd.update(proj, vp);
    bd.setDressingAlpha(HILLS.length - 1, Math.min(0.9, Math.max(0, (sim.zone - 1) / 9)));
    bd.tintHills(light.hills);
    const horizon = proj.horizon;

    // the sky: night, dawn, day, dusk weights, then overcast in the light of the hour
    const [wn, wdn, wd, wdk] = day.sky;
    const oc = Math.min(0.9, Math.max(0, (weather.cloud - 0.3) * 1.35) + weather.fog * 0.3);
    const ocLight = mix(light.tint, [255, 255, 255], 0.15);
    const stops: RGB[] = SKY_DAY.map((d, i) => {
      const c: RGB = [
        SKY_NIGHT[i][0] * wn + SKY_DAWN[i][0] * wdn + d[0] * wd + SKY_DUSK[i][0] * wdk,
        SKY_NIGHT[i][1] * wn + SKY_DAWN[i][1] * wdn + d[1] * wd + SKY_DUSK[i][1] * wdk,
        SKY_NIGHT[i][2] * wn + SKY_DAWN[i][2] * wdn + d[2] * wd + SKY_DUSK[i][2] * wdk,
      ];
      const o = SKY_OVERCAST[i];
      return mix(c, [(o[0] * ocLight[0]) / 255, (o[1] * ocLight[1]) / 255, (o[2] * ocLight[2]) / 255], oc);
    });
    const key = stops.map((c) => `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`).join(';');
    if (key !== this.skyKey) {
      this.skyKey = key;
      this.paintSky(stops);
    }

    // stars and the moon
    const clear = 1 - Math.min(1, weather.cloud * 1.1) * 0.95;
    this.stars.width = vp.w;
    this.stars.height = Math.max(1, horizon);
    this.stars.tileScale.set(Math.max(vp.w / 1024, horizon / 512));
    this.stars.tilePosition.x = -proj.camX * 0.003;
    this.stars.alpha = day.stars * clear * 0.9 * (f.motion ? 0.92 + 0.08 * Math.sin(t * 0.31) : 0.95);
    this.stars.visible = this.stars.alpha > 0.01;
    const mb = day.moon;
    const mp = this.bodyXY(mb.az, mb.elev, horizon, vp);
    this.moon.position.set(mp.x, mp.y);
    this.moon.scale.set((vp.h * 0.017) / 40);
    this.moon.alpha = Math.min(1, Math.max(0, (mb.elev + 0.04) / 0.1)) * (0.22 + 0.78 * day.stars) * Math.pow(1 - weather.cloud, 1.2) * 1.25;
    // the sun and the moon step back while they pass behind the timer
    const tr = timerRect(vp.w, vp.h);
    const behind = (x: number, y: number) => (x > tr.x0 && x < tr.x1 && y > tr.y0 - vp.h * 0.04 && y < tr.y1 ? 0.4 : 1);
    this.moon.alpha *= behind(mp.x, mp.y);
    this.moon.visible = this.moon.alpha > 0.01;
    // the unlit part of the moon in the colour of the sky behind it
    const lit = mb.illum;
    const dir = mb.phase < 0.5 ? -1 : 1;
    this.moonShade.x = dir * lit * 82;
    this.moonShade.visible = lit < 0.985;
    this.moonShade.tint = num(mix([50, 63, 102], [200, 190, 200], 1 - day.stars));

    // the sun: warm and low at dawn and dusk, hidden by cloud and fog
    const sp = this.bodyXY(day.sun.az, day.sun.elev, horizon, vp);
    this.sun.position.set(sp.x, sp.y);
    this.sun.scale.set((vp.h * 0.019) / 20.5);
    // behind real cloud the sun is only a brighter patch; under rain or fog it is gone
    this.sun.alpha = Math.min(1, Math.max(0, (day.sun.elev + 0.05) / 0.09)) * Math.pow(1 - weather.cloud, 1.6) * Math.pow(1 - weather.fog, 2) * 1.3;
    this.sun.alpha *= behind(sp.x, sp.y);
    this.sun.visible = this.sun.alpha > 0.01;
    this.sun.tint = num(mix([255, 255, 255], [255, 196, 150], day.warm));

    // clouds: more, denser, darker and faster as the weather turns
    const n = Math.round(2 + weather.cloud * (MAX_CLOUDS - 2));
    const speedK = 0.5 + weather.wind * 1.7;
    this.clouds.forEach((c, i) => {
      const span = vp.w * 1.7;
      const raw = c.x * span + t * c.speed * speedK - proj.camX * 0.004;
      const x = ((raw % span) + span) % span - vp.w * 0.35;
      c.s.position.set(x, horizon - c.y * vp.h);
      c.s.scale.set(((c.w + weather.cloud * 0.08) * vp.w) / c.s.texture.width);
      const want = i < n ? 0.62 + 0.33 * weather.cloud : 0;
      // clouds fade in and out rather than appear
      c.s.alpha += (want - c.s.alpha) * Math.min(1, f.realDt * 0.4 + (f.jumped ? 1 : 0));
      c.s.visible = c.s.alpha > 0.01;
      c.s.tint = light.cloud;
    });

    // lightning: the sky brightens a little (never a white frame), a thin bolt far away
    const fl = f.motion ? weather.flash : 0;
    // strikes fall to the left or right of the timer, never behind it
    const fx = weather.flashX < 0 ? 0.06 + -weather.flashX * 0.24 : 0.7 + weather.flashX * 0.24;
    this.flash.visible = fl > 0.01;
    if (this.flash.visible) {
      this.flash.position.set(vp.w * fx, horizon * 0.35);
      this.flash.scale.set((vp.w * 1.1) / 256, (horizon * 1.2) / 256);
      this.flash.alpha = fl * 0.1;
    }
    this.bolt.visible = fl > 0.02;
    if (this.bolt.visible) {
      const key = `${weather.flashX.toFixed(3)}:${Math.round(vp.w)}:${Math.round(horizon)}`;
      if (key !== this.boltKey) {
        this.boltKey = key;
        this.bolt.clear();
        const x0 = vp.w * fx;
        let x = x0;
        let y = horizon * 0.3;
        const steps = 7;
        const pts: [number, number][] = [[x, y]];
        for (let i = 1; i <= steps; i++) {
          const h = hash32(Math.round(x0), i) >>> 0;
          x += ((h % 1000) / 1000 - 0.5) * vp.w * 0.03;
          y = horizon * (0.3 + (0.62 * i) / steps);
          pts.push([x, y]);
        }
        // a soft glow around a thin bright core
        for (const [w, a] of [[6, 0.22], [1.8, 1]] as const) {
          this.bolt.moveTo(pts[0][0], pts[0][1]);
          for (const [px, py] of pts.slice(1)) this.bolt.lineTo(px, py);
          this.bolt.stroke({ color: 0xfbfaff, width: w, alpha: a });
        }
      }
      this.bolt.alpha = Math.min(1, fl * 1.1) * 0.85;
    }

    // fog over the distant hills
    this.fog.alpha = Math.min(0.85, weather.fog * 0.75 + light.hazeAdd * 0.4);
    this.fog.visible = this.fog.alpha > 0.01;
    this.fog.tint = light.hazeColor;
    this.fog.position.set(0, horizon - vp.h * 0.01);
    this.fog.width = vp.w;
    this.fog.height = vp.h * 0.14;
    this.updateSights(f, horizon);
  }
}
