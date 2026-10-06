/**
 * Weather particles: rain in three depths (far, middle, near), snowflakes drifting with the
 * wind, and splashes on the ground. Screen-space particle containers (one draw each), sized
 * by the weather's intensity within the director's particle budget, and thinned over the
 * timer so the numbers stay easy to read.
 *
 * With animation off there are no particles: rain is a still, faint sheet of streaks; snow
 * shows only as snow cover. The state of the weather is always visible either way.
 */

import { Container, Particle, ParticleContainer, TilingSprite } from 'pixi.js';
import { timerRect } from '../../occlusion';
import type { ForestTextures } from '../textures';
import type { ForestLight } from './light';
import type { ForestFrame } from './types';

const MAX_RAIN = 360;
const MAX_SNOW = 220;
const MAX_SPLASH = 36;

const h01 = (i: number, k: number) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** Per-depth look: speed (screen heights per second), streak length, opacity, width. */
const RAIN_LAYER = [
  { v: 0.72, len: 0.034, a: 0.3, w: 0.55 },
  { v: 1.05, len: 0.05, a: 0.45, w: 0.75 },
  { v: 1.55, len: 0.075, a: 0.58, w: 1 },
];
const SNOW_LAYER = [
  { v: 0.045, size: 0.0045, a: 0.55, sway: 0.008 },
  { v: 0.07, size: 0.0065, a: 0.75, sway: 0.012 },
  { v: 0.11, size: 0.0095, a: 0.9, sway: 0.018 },
];

export class ForestWeather {
  readonly root = new Container();
  private rain: ParticleContainer;
  private rainP: Particle[] = [];
  private snow: ParticleContainer;
  private snowP: Particle[] = [];
  private splash: ParticleContainer;
  private splashP: Particle[] = [];
  private sheet: TilingSprite;

  constructor(tex: ForestTextures) {
    const dyn = { position: true, rotation: true, vertex: true, color: true };
    this.rain = new ParticleContainer({ texture: tex.rain, dynamicProperties: dyn });
    this.snow = new ParticleContainer({ texture: tex.flake, dynamicProperties: dyn });
    this.splash = new ParticleContainer({ texture: tex.splash, dynamicProperties: dyn });
    const fill = (c: ParticleContainer, list: Particle[], n: number, texture: typeof tex.rain, anchorY: number) => {
      for (let i = 0; i < n; i++) {
        const p = new Particle({ texture, anchorX: 0.5, anchorY, alpha: 0 });
        c.addParticle(p);
        list.push(p);
      }
    };
    fill(this.rain, this.rainP, MAX_RAIN, tex.rain, 1);
    fill(this.snow, this.snowP, MAX_SNOW, tex.flake, 0.5);
    fill(this.splash, this.splashP, MAX_SPLASH, tex.splash, 0.5);
    this.sheet = new TilingSprite({ texture: tex.rainSheet, width: 100, height: 100 });
    this.sheet.alpha = 0;
    this.root.addChild(this.sheet, this.splash, this.rain, this.snow);
  }

  update(f: ForestFrame, light: ForestLight) {
    const { vp, t, motion, env, director, proj } = f;
    const w = env.weather;
    const timer = timerRect(vp.w, vp.h);
    const inTimer = (x: number, y: number) => x > timer.x0 && x < timer.x1 && y > timer.y0 && y < timer.y1;
    // rain and snow take the light of the hour (bluish at night, warm at dusk)
    const tint = (Math.round(light.tint[0] * 0.25 + 191) << 16) | (Math.round(light.tint[1] * 0.25 + 191) << 8) | Math.round(light.tint[2] * 0.25 + 191);
    const budget = director.particles('weather');
    const slant = (w.wind - 0.3) * 0.32;

    // --- rain
    const nRain = motion ? Math.min(MAX_RAIN, Math.round(budget * Math.min(1, w.rain * 1.15))) : 0;
    this.rain.visible = nRain > 0;
    if (nRain > 0) {
      const rot = -Math.atan(slant);
      for (let i = 0; i < MAX_RAIN; i++) {
        const p = this.rainP[i];
        if (i >= nRain) {
          p.alpha = 0;
          continue;
        }
        const L = RAIN_LAYER[i % 3];
        const ph = h01(i, 1);
        const yf = ((ph + t * L.v * (0.85 + 0.3 * h01(i, 3))) % 1.15) - 0.08;
        let xf = h01(i, 2) * 1.3 - 0.15 + slant * yf;
        xf = ((xf % 1.3) + 1.3) % 1.3 - 0.15;
        const x = xf * vp.w;
        const y = yf * vp.h;
        p.x = x;
        p.y = y;
        p.rotation = rot;
        p.scaleX = L.w * Math.max(0.7, vp.h / 900);
        p.scaleY = (L.len * vp.h) / 96;
        p.alpha = L.a * (inTimer(x, y) ? 0.3 : 1);
        p.tint = tint;
      }
    }

    // --- splashes on the ground in front (only where it rains hard enough)
    const nSplash = motion ? Math.round(MAX_SPLASH * Math.max(0, (w.rain - 0.2) / 0.8) * Math.min(1, budget / 300)) : 0;
    this.splash.visible = nSplash > 0;
    if (nSplash > 0) {
      const ground = proj.horizon + (vp.h - proj.horizon) * 0.25;
      for (let i = 0; i < MAX_SPLASH; i++) {
        const p = this.splashP[i];
        if (i >= nSplash) {
          p.alpha = 0;
          continue;
        }
        const period = 0.55 + h01(i, 7) * 0.35;
        const cyc = Math.floor((t + h01(i, 8) * period) / period);
        const q = ((t + h01(i, 8) * period) % period) / period;
        const x = h01(i * 31 + cyc, 9) * vp.w;
        const y = ground + h01(i * 17 + cyc, 10) * (vp.h - ground);
        const depth = (y - ground) / Math.max(1, vp.h - ground);
        p.x = x;
        p.y = y;
        const s = (0.3 + q * 0.9) * (0.3 + depth * 0.7) * Math.max(0.6, vp.h / 900);
        p.scaleX = s * 0.5;
        p.scaleY = s * 0.5;
        p.alpha = (1 - q) * 0.45 * (inTimer(x, y) ? 0.3 : 1);
        p.tint = tint;
      }
    }

    // --- snow
    const nSnow = motion ? Math.min(MAX_SNOW, Math.round(budget * 0.6 * Math.min(1, w.snow * 1.2))) : 0;
    this.snow.visible = nSnow > 0;
    if (nSnow > 0) {
      for (let i = 0; i < MAX_SNOW; i++) {
        const p = this.snowP[i];
        if (i >= nSnow) {
          p.alpha = 0;
          continue;
        }
        const L = SNOW_LAYER[i % 3];
        const ph = h01(i, 4);
        const yf = ((ph + t * L.v * (0.8 + 0.4 * h01(i, 6))) % 1.1) - 0.05;
        const sway = Math.sin(t * (0.6 + h01(i, 5)) + ph * 6.28) * L.sway;
        let xf = h01(i, 5) * 1.2 - 0.1 + slant * 0.6 * yf + sway;
        xf = ((xf % 1.2) + 1.2) % 1.2 - 0.1;
        const x = xf * vp.w;
        const y = yf * vp.h;
        p.x = x;
        p.y = y;
        const s = (L.size * vp.h) / 9;
        p.scaleX = s;
        p.scaleY = s;
        p.alpha = L.a * (inTimer(x, y) ? 0.35 : 1);
        p.tint = tint;
      }
    }

    // --- animation off: a still, faint sheet of streaks while it rains
    const still = !motion && w.rain > 0.05;
    this.sheet.visible = still;
    if (still) {
      this.sheet.width = vp.w;
      this.sheet.height = vp.h;
      this.sheet.tileScale.set(Math.max(1, vp.h / 700));
      this.sheet.alpha = Math.min(0.5, w.rain * 0.55);
      this.sheet.tint = tint;
    }
  }
}
