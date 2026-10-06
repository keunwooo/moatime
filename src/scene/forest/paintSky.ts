/**
 * Forest sky and weather art: the sky at dawn, dusk, night and under overcast (blended with
 * the day sky by the world clock), the sun and the moon, a pastel star field, and the small
 * things weather is drawn with (rain streaks, snowflakes, splashes, puddles, ice, petals).
 */

import { makeCanvas, softEllipse, type PaintCanvas } from '../paint/brush';
import { css, hex, mix, type RGB } from '../paint/color';
import { Rng } from '../../core/rng';
import { F } from './palette';

const TAU = Math.PI * 2;

/**
 * Sky colours at each time, at the same stop positions as the day sky (horizon at 0.72), so the
 * scene can blend them stop by stop into one gradient (one quad: no seams between layers).
 */
export const SKY_STOP_AT = [0, 0.38, 0.66, 0.73, 0.8, 1] as const;
export const SKY_DAWN: RGB[] = ['#B4BBD8', '#D6CADC', '#EFCFC4', '#F6DCC6', '#EEE0D6', '#CCD2CB'].map(hex);
export const SKY_DUSK: RGB[] = ['#9EA2C6', '#CFB2C4', '#EAB49A', '#F2C49B', '#E6CBB6', '#BDB3A8'].map(hex);
export const SKY_NIGHT: RGB[] = ['#222C4B', '#323F66', '#475680', '#58688F', '#5E6C8E', '#47536E'].map(hex);
export const SKY_OVERCAST: RGB[] = ['#B7BDC3', '#C8CDD0', '#D6D9D6', '#DADCD7', '#D3D6D0', '#BFC5BE'].map(hex);

/** A soft sun: bright core with a wide warm halo. 256², centered. */
export function paintSunDisk(): PaintCanvas {
  const pc = makeCanvas(256, 256);
  const { ctx } = pc;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, css([255, 252, 236], 1));
  g.addColorStop(0.16, css([255, 246, 214], 1));
  g.addColorStop(0.2, css(mix(F.sun, [255, 255, 255], 0.5), 0.4));
  g.addColorStop(0.42, css(F.sun, 0.1));
  g.addColorStop(1, css(F.sun, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return pc;
}

/** The moon: a pale disk with faint maria and a soft glow. 128², centered (disk radius 40). */
export function paintMoonDisk(seed: number): PaintCanvas {
  const pc = makeCanvas(128, 128);
  const { ctx } = pc;
  const r = new Rng(seed);
  const halo = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
  halo.addColorStop(0, css([236, 238, 246], 0.32));
  halo.addColorStop(1, css([236, 238, 246], 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(56, 56, 4, 64, 64, 40);
  g.addColorStop(0, css([250, 249, 240], 1));
  g.addColorStop(1, css([222, 226, 236], 1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, TAU);
  ctx.clip();
  for (let i = 0; i < 9; i++) softEllipse(ctx, 64 + r.range(-24, 24), 64 + r.range(-24, 24), r.range(5, 13), r.range(4, 10), [184, 190, 206], r.range(0.18, 0.32));
  ctx.restore();
  return pc;
}

/** A disk used to shade the unlit part of the moon (tinted with the sky behind it). */
export function paintMoonShade(): PaintCanvas {
  const pc = makeCanvas(128, 128);
  const { ctx } = pc;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 41, 0, TAU);
  ctx.fill();
  return pc;
}

/** Sparse, soft stars for the forest night (screen-space tile 1024×512, denser up high). */
export function paintForestStars(seed: number): PaintCanvas {
  const W = 1024;
  const H = 512;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const r = new Rng(seed);
  for (let i = 0; i < 260; i++) {
    const x = r.next() * W;
    const y = Math.pow(r.next(), 1.4) * H;
    const big = r.chance(0.07);
    const s = big ? r.range(1.3, 2) : r.range(0.5, 1.1);
    const c: RGB = r.chance(0.25) ? [255, 240, 214] : r.chance(0.3) ? [214, 226, 255] : [246, 246, 240];
    const a = (1 - y / H) * 0.55 + r.range(0.15, 0.35);
    if (big) softEllipse(ctx, x, y, s * 3, s * 3, c, a * 0.22, 0);
    ctx.fillStyle = css(c, Math.min(1, a));
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.fill();
  }
  return pc;
}

/** One rain streak: a thin, soft vertical line fading at both ends. 8×96. */
export function paintRainStreak(): PaintCanvas {
  const pc = makeCanvas(8, 96);
  const { ctx } = pc;
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, css([236, 242, 250], 0));
  g.addColorStop(0.55, css([236, 242, 250], 0.65));
  g.addColorStop(1, css([248, 250, 255], 0.9));
  ctx.fillStyle = g;
  ctx.fillRect(3, 0, 2, 96);
  return pc;
}

/** A soft snowflake. 32². */
export function paintFlake(): PaintCanvas {
  const pc = makeCanvas(32, 32);
  softEllipse(pc.ctx, 16, 16, 9, 9, [255, 255, 255], 0.95, 0, 0.8);
  return pc;
}

/** A splash ring seen from the side (flat ellipse). 64×24. */
export function paintSplash(): PaintCanvas {
  const pc = makeCanvas(64, 24);
  const { ctx } = pc;
  ctx.strokeStyle = css([246, 250, 255], 0.75);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(32, 12, 26, 8, 0, 0, TAU);
  ctx.stroke();
  return pc;
}

/** A shallow puddle reflecting the sky, with a light rim. 192×64 (flat on the ground). */
export function paintPuddle(seed: number): PaintCanvas {
  const pc = makeCanvas(192, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  ctx.save();
  ctx.beginPath();
  // a slightly irregular outline
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + r.range(-0.12, 0.1);
    const x = 96 + Math.cos(a) * 88 * k;
    const y = 32 + Math.sin(a) * 26 * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, css([176, 190, 204], 0.85));
  g.addColorStop(1, css([214, 222, 228], 0.85));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 192, 64);
  softEllipse(ctx, 70, 26, 44, 6, [250, 252, 255], 0.5);
  ctx.restore();
  return pc;
}

/** A pale ice sheen laid over still water in winter. 192×64. */
export function paintIce(seed: number): PaintCanvas {
  const pc = makeCanvas(192, 64);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 96, 32, 90, 28, [232, 240, 248], 0.9, 0, 0.7);
  ctx.strokeStyle = css([255, 255, 255], 0.55);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    const x = r.range(30, 160);
    const y = r.range(16, 48);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r.range(-26, 26), y + r.range(-8, 8));
    ctx.stroke();
  }
  return pc;
}

/** A blossom petal. 24×18. */
export function paintPetal(): PaintCanvas {
  const pc = makeCanvas(24, 18);
  softEllipse(pc.ctx, 12, 9, 9, 5.5, mix(F.rose, [255, 255, 255], 0.45), 0.95, 0.3, 0.5);
  return pc;
}

/** A soft horizontal fog band (screen-space, stretched). 64×128, opaque in the middle. */
export function paintFogBand(): PaintCanvas {
  const pc = makeCanvas(64, 128);
  const { ctx } = pc;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, css([255, 255, 255], 0));
  g.addColorStop(0.45, css([255, 255, 255], 0.9));
  g.addColorStop(0.6, css([255, 255, 255], 0.9));
  g.addColorStop(1, css([255, 255, 255], 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  return pc;
}

/** Faint slanted streaks for rain when animation is off (one still image). 256². */
export function paintRainSheet(seed: number): PaintCanvas {
  const pc = makeCanvas(256, 256);
  const { ctx } = pc;
  const r = new Rng(seed);
  ctx.strokeStyle = css([240, 244, 250], 0.4);
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = r.next() * 256;
    const y = r.next() * 256;
    const len = r.range(10, 22);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.18, y + len);
    ctx.stroke();
  }
  return pc;
}

/** A rainbow arc, white-backed bands in soft pastels, clear in the middle. 1024×512, base centre. */
export function paintRainbow(): PaintCanvas {
  const W = 1024;
  const H = 512;
  const pc = makeCanvas(W, H);
  const { ctx } = pc;
  const bands: [number, number, number][] = [
    [236, 150, 160],
    [244, 196, 150],
    [244, 232, 160],
    [170, 220, 170],
    [150, 196, 236],
    [180, 160, 220],
  ];
  const R0 = 470;
  const bw = 11;
  bands.forEach(([r, g, b], i) => {
    ctx.strokeStyle = `rgba(${r},${g},${b},0.85)`;
    ctx.lineWidth = bw;
    ctx.beginPath();
    ctx.arc(W / 2, H, R0 - i * bw, Math.PI, 2 * Math.PI);
    ctx.stroke();
  });
  // soften: fade the ends into the air
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.7, 'rgba(0,0,0,0.1)');
  fade.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  return pc;
}
