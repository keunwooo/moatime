/**
 * The battlefield's ground, painted once per planet and viewport shape: low ground with a gouache
 * mottle, mesa plateaus (the home and the rivals' homes) with their sunlit cliff faces toward the
 * viewer, the ramp down from home toward the natural, the time-crystal lake behind the timer, worn
 * paths between the sites, the ore fields and heat vents of every site, and the planet's own
 * scatter (dunes, ice cracks, lava seams, ferns, salt crystals, ruins, amber veins).
 */

import { Rng } from '../../../core/rng';
import { NAT, RIVAL_HOME, SITE_COUNT, HOME } from '../../../sim/front';
import type { BiomeId } from '../../../sim/frontPlan';
import { applyGrain, blobPoints, gouache, makeCanvas, softEllipse, type PaintCanvas } from '../../paint/brush';
import { css, hex, lighten, mix, shade, vary, type RGB } from '../../paint/color';
import { fbmField } from '../noise';
import { sitePos, type FrontLayout, type P } from '../layout';
import { BIOME_PAL, LAKE } from '../palette';

export interface TerrainSpec {
  biome: BiomeId;
  planetSeed: number;
  natSide: 0 | 1;
  crystal: boolean[];
  L: FrontLayout;
  /** Canvas size in px. */
  w: number;
  h: number;
}

/** A plateau: an ellipse with a hand-drawn edge, raised by `lift` px. */
interface Mesa {
  c: P;
  r: P;
  lift: number;
  /** Ramp direction (−1 left, 1 right, 0 none) on its near edge. */
  ramp: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function paintTerrain(spec: TerrainSpec): PaintCanvas {
  const { biome, planetSeed, L, w, h } = spec;
  const pal = BIOME_PAL[biome];
  const pc = makeCanvas(w, h);
  const { ctx } = pc;
  const r = new Rng(planetSeed ^ 0x7e11);

  // ---- pixel pass: low ground, plateaus, cliffs, lake --------------------------------------
  const fw = Math.max(64, Math.round(w / 4));
  const fh = Math.max(36, Math.round(h / 4));
  const mottle = fbmField(planetSeed + 11, fw, fh, 7, 4);
  const edge = fbmField(planetSeed + 23, fw, fh, 14, 3);
  // big, slow wobble of mesa rims and the shore (hand-drawn, not compass-drawn)
  const wob = fbmField(planetSeed + 37, fw, fh, 5, 3);
  const sample = (f: Float32Array, x: number, y: number) => {
    const fx = Math.min(fw - 1, Math.max(0, (x / w) * fw));
    const fy = Math.min(fh - 1, Math.max(0, (y / h) * fh));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(fw - 1, x0 + 1);
    const y1 = Math.min(fh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = f[y0 * fw + x0];
    const b = f[y0 * fw + x1];
    const c = f[y1 * fw + x0];
    const d = f[y1 * fw + x1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  const cliffPx = L.cliff * h;
  const mesas: Mesa[] = [
    { c: L.home, r: L.homeR, lift: cliffPx, ramp: spec.natSide === 0 ? -1 : 1 },
    { c: L.rivalHome[0], r: L.rivalR, lift: cliffPx * 0.85, ramp: 1 },
    { c: L.rivalHome[1], r: L.rivalR, lift: cliffPx * 0.85, ramp: -1 },
  ];
  // the edge of a mesa wobbles a little (hand-drawn rims)
  const inside = (m: Mesa, x: number, y: number) => {
    const dx = (x / w - m.c.x) / m.r.x;
    const dy = (y / h - m.c.y) / m.r.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    return d - 0.26 * (sample(wob, x, y) - 0.5) - 0.06 * (sample(edge, x, y) - 0.5);
  };
  const lake = L.lake;
  const img = ctx.createImageData(w, h);
  const D = img.data;
  const top = h * L.top;
  for (let y = 0; y < h; y++) {
    // far ground is a little hazier and cooler
    const depth = y / h;
    for (let x = 0; x < w; x++) {
      const m = sample(mottle, x, y);
      let c: RGB = mix(pal.lowDark, pal.low, smooth(0.3, 0.7, m));
      c = mix(c, pal.sky1, (1 - depth) * 0.18);
      // plateaus: the top is drawn raised by `lift`, the band below it is the cliff face
      for (const ms of mesas) {
        const dTop = inside(ms, x, y + ms.lift);
        if (dTop < 1) {
          const tm = sample(mottle, x + 31, y + 17);
          c = mix(shade(pal.top, 0.08), lighten(pal.top, 0.08), tm);
          // a lighter rim along the top's edge, darker toward its far side
          c = mix(c, lighten(pal.top, 0.2), smooth(0.86, 0.99, dTop) * 0.5);
          break;
        }
        const dBase = inside(ms, x, y);
        if (dBase < 1) {
          // the cliff face: lit from the upper left, striated
          const yy = (x / w - ms.c.x) / ms.r.x;
          const lit = 0.5 + 0.35 * -yy;
          const stri = 0.5 + 0.5 * Math.sin(x * 0.55 + sample(edge, x, y) * 9);
          c = mix(shade(pal.cliff, 0.2), lighten(pal.cliff, 0.12), Math.min(1, Math.max(0, lit * 0.8 + stri * 0.25)));
          // the ramp: a slope instead of a wall on one side of the near edge
          if (ms.ramp !== 0) {
            const side = (x / w - ms.c.x) * ms.ramp;
            if (side > ms.r.x * 0.35 && side < ms.r.x * 0.72) c = mix(pal.path, pal.top, 0.45 + 0.3 * stri * 0.3);
          }
          break;
        }
      }
      // the lake: dark water, a soft shore
      const lx = (x / w - lake.c.x) / lake.r.x;
      const ly = (y / h - lake.c.y) / lake.r.y;
      const ld = Math.sqrt(lx * lx + ly * ly) - 0.2 * (sample(wob, x + 101, y + 7) - 0.5) - 0.05 * (sample(edge, x + 101, y + 7) - 0.5);
      if (ld < 1.08) {
        if (ld < 1) {
          // deep in the middle, a lighter shelf near the shore, slow ripples across
          const rip = sample(edge, x * 0.6 + 40, y * 2.2);
          c = mix(LAKE.deep, LAKE.water, smooth(0.2, 1.0, ld) * 0.7 + rip * 0.18);
          c = mix(c, mix(LAKE.shore, pal.cliff, 0.25), smooth(0.84, 1, ld) * 0.75);
        } else c = mix(mix(pal.cliff, LAKE.shore, 0.4), c, smooth(1, 1.08, ld));
      }
      // the sky band at the very top fades out
      if (y < top) c = mix(pal.sky1, c, smooth(top * 0.4, top, y));
      const i = (y * w + x) * 4;
      D[i] = c[0];
      D[i + 1] = c[1];
      D[i + 2] = c[2];
      D[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const px = (p: P) => ({ x: p.x * w, y: p.y * h });
  const scale = h / 820;

  // ---- worn paths between the sites (they keep clear of the lake) ----------------------------
  const nat = px(L.nat[spec.natSide]);
  const home = px(L.home);
  const sites = Array.from({ length: SITE_COUNT }, (_, i) => px(sitePos(L, planetSeed, i, spec.natSide)));
  const rival = [px(L.rivalHome[0]), px(L.rivalHome[1])];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (pts: { x: number; y: number }[], width: number, alpha: number) => {
    ctx.strokeStyle = css(pal.path, alpha);
    ctx.lineWidth = width * scale;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      ctx.quadraticCurveTo(a.x + (b.x - a.x) * 0.5 + r.range(-8, 8) * scale, a.y + (b.y - a.y) * 0.5 + r.range(-6, 6) * scale, b.x, b.y);
    }
    ctx.stroke();
  };
  const left = [0, 1, 2, 3, 4, 5].map((i) => sites[i]);
  const right = [6, 7, 8, 9, 10, 11].map((i) => sites[i]);
  for (const side of [left, right]) {
    const chain = [home, ...[...side].sort((a, b) => b.y - a.y)];
    stroke(chain, 9, 0.28);
    stroke(chain, 3, 0.22);
  }
  stroke([home, nat], 10, 0.3);
  stroke([sites[5], rival[0]], 8, 0.24);
  stroke([sites[11], rival[1]], 8, 0.24);
  ctx.restore();

  // ---- rocks along the foot of every cliff, and a few long reflections on the lake ------------
  for (const ms of mesas) {
    const rr = new Rng(planetSeed ^ Math.round(ms.c.x * 1000));
    for (let i = 0; i < 26; i++) {
      const a = rr.range(0.05, 0.95) * Math.PI;
      const x = (ms.c.x + Math.cos(a) * ms.r.x * rr.range(0.95, 1.08)) * w;
      const y = (ms.c.y + Math.sin(a) * ms.r.y * rr.range(1.0, 1.12)) * h + rr.range(0, 4) * scale;
      const k = (0.8 + 0.3 * (y / h)) * scale * rr.range(0.5, 1.15);
      softEllipse(ctx, x + 2 * k, y + 1.5 * k, 6 * k, 2.2 * k, shade(pal.cliff, 0.5), 0.3, 0);
      gouache(ctx, blobPoints(x, y - 2 * k, 5 * k, 3.6 * k, rr, { lumps: 0.25, flatBottom: 0.6 }), { base: vary(pal.cliff, rr), r: rr, dabDensity: 8, roundness: 0.8, grain: 0.3 });
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const x = (lake.c.x + r.range(-0.7, 0.7) * lake.r.x) * w;
    const y = (lake.c.y + r.range(-0.6, 0.7) * lake.r.y) * h;
    const len = r.range(30, 90) * scale;
    ctx.strokeStyle = css(LAKE.mote, r.range(0.03, 0.07));
    ctx.lineWidth = r.range(1, 2.4) * scale;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.stroke();
  }
  ctx.restore();

  // ---- time crystals growing at the lake's waterline: small amber clusters with a mauve shade --
  // (the lake is what the timer sits on; the clusters show at its ends and below the timer)
  const lit = hex('#F6D58A');
  const dark = hex('#8E6C8C');
  const cr = new Rng(planetSeed ^ 0x51c7);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + cr.range(-0.08, 0.08);
    const x = (lake.c.x + Math.cos(a) * lake.r.x * cr.range(0.97, 1.06)) * w;
    const y = (lake.c.y + Math.sin(a) * lake.r.y * cr.range(0.97, 1.06)) * h;
    const k = (0.8 + 0.3 * (y / h)) * scale * cr.range(0.7, 1.25);
    const n = 2 + Math.floor(cr.range(0, 3));
    softEllipse(ctx, x, y + k, 10 * k, 2.8 * k, shade(pal.cliff, 0.55), 0.35, 0);
    for (let j = 0; j < n; j++) {
      const ox = (j - (n - 1) / 2) * 5.2 * k + cr.range(-1, 1) * k;
      const hgt = cr.range(9, 17) * k * (j === n >> 1 ? 1.35 : 1);
      const wd = cr.range(2.6, 3.9) * k;
      const tipX = x + ox + (cr.range(-0.2, 0.2) + ox / (12 * k) * 0.4) * hgt;
      const tipY = y - hgt;
      const mid = x + ox + (tipX - x - ox) * 0.08;
      // the lit face on the left, the shaded face on the right, a pale edge between them
      ctx.fillStyle = css(lit, 0.92);
      ctx.beginPath();
      ctx.moveTo(x + ox - wd, y);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(mid, y + 0.6 * k);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = css(dark, 0.92);
      ctx.beginPath();
      ctx.moveTo(mid, y + 0.6 * k);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(x + ox + wd, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = css(lighten(lit, 0.5), 0.55);
      ctx.lineWidth = 0.8 * k;
      ctx.beginPath();
      ctx.moveTo(mid, y + 0.6 * k);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }
  }
  // their light on the water
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 30; i += 2) {
    const a = (i / 30) * Math.PI * 2;
    const x = (lake.c.x + Math.cos(a) * lake.r.x * 0.9) * w;
    const y = (lake.c.y + Math.sin(a) * lake.r.y * 0.9) * h;
    softEllipse(ctx, x, y, 26 * scale, 8 * scale, LAKE.mote, 0.05, 0);
  }
  ctx.restore();

  // ---- the planet's own scatter ------------------------------------------------------------
  const clear = (x: number, y: number, m = 0.04) => {
    const p = { x: x / w, y: y / h };
    if (((p.x - lake.c.x) / (lake.r.x + m)) ** 2 + ((p.y - lake.c.y) / (lake.r.y + m)) ** 2 < 1) return false;
    if (p.y < L.top + 0.02) return false;
    for (const s of [...sites, nat, home, ...rival]) if (Math.hypot(x - s.x, (y - s.y) * 1.6) < 46 * scale) return false;
    return true;
  };
  const scatter = (n: number, draw: (x: number, y: number, k: number) => void) => {
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const x = r.range(0, w);
      const y = r.range(h * L.top, h);
      if (!clear(x, y)) continue;
      draw(x, y, depthOf(y / h));
      i++;
    }
  };
  const depthOf = (y: number) => 0.8 + 0.3 * y;
  const rockBlob = (x: number, y: number, s: number, col: RGB) => {
    const rr = new Rng(r.int(1, 1e9));
    softEllipse(ctx, x + 2 * s, y + 1.5 * s, 7 * s, 2.6 * s, shade(col, 0.6), 0.35, 0);
    gouache(ctx, blobPoints(x, y - 2 * s, 6 * s, 4.2 * s, rr, { lumps: 0.22, flatBottom: 0.6 }), { base: vary(col, rr), r: rr, dabDensity: 8, roundness: 0.8, grain: 0.3 });
  };
  switch (biome) {
    case 'karna':
      scatter(70, (x, y, k) => rockBlob(x, y, k * scale * r.range(0.6, 1.3), pal.rock));
      // dune ripples
      ctx.save();
      ctx.strokeStyle = css(lighten(pal.low, 0.18), 0.35);
      for (let i = 0; i < 40; i++) {
        const x = r.range(0, w);
        const y = r.range(h * L.top, h);
        if (!clear(x, y)) continue;
        ctx.lineWidth = 1.4 * scale;
        ctx.beginPath();
        ctx.moveTo(x - 30 * scale, y);
        ctx.quadraticCurveTo(x, y - 6 * scale, x + 30 * scale, y);
        ctx.stroke();
      }
      ctx.restore();
      break;
    case 'hwiel':
      scatter(40, (x, y, k) => rockBlob(x, y, k * scale * r.range(0.5, 1), pal.rock));
      ctx.save();
      ctx.strokeStyle = css(pal.feature, 0.55);
      for (let i = 0; i < 26; i++) {
        let x = r.range(0, w);
        let y = r.range(h * L.top, h);
        if (!clear(x, y)) continue;
        ctx.lineWidth = 1.2 * scale;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += r.range(-14, 14) * scale;
          y += r.range(-4, 6) * scale;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      break;
    case 'onyx':
      scatter(50, (x, y, k) => rockBlob(x, y, k * scale * r.range(0.6, 1.2), pal.rock));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // lava seams: a wide soft glow under a thin bright core, forking now and then
      for (let i = 0; i < 40; i++) {
        let x = r.range(0, w);
        let y = r.range(h * L.top, h);
        if (!clear(x, y)) continue;
        const pts: [number, number][] = [[x, y]];
        const n = 3 + Math.floor(r.range(0, 4));
        for (let k = 0; k < n; k++) {
          x += r.range(-18, 18) * scale;
          y += r.range(-3, 6) * scale;
          pts.push([x, y]);
        }
        for (const [width, alpha] of [
          [9, 0.1],
          [4, 0.26],
          [1.6, 0.75],
        ] as const) {
          ctx.strokeStyle = css(width < 2 ? lighten(pal.feature, 0.35) : pal.feature, alpha);
          ctx.lineWidth = width * scale;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (const [px2, py2] of pts.slice(1)) ctx.lineTo(px2, py2);
          ctx.stroke();
        }
      }
      ctx.restore();
      break;
    case 'verda':
      scatter(90, (x, y, k) => {
        const s = k * scale * r.range(0.7, 1.4);
        ctx.save();
        ctx.translate(x, y);
        for (let f = 0; f < 5; f++) {
          ctx.rotate(r.range(-1.4, -0.3));
          ctx.fillStyle = css(vary(pal.lowDark, r, 0.03, 0.08, 0.08), 0.85);
          ctx.beginPath();
          ctx.ellipse(0, -6 * s, 2.2 * s, 8 * s, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        if (r.next() < 0.15) softEllipse(ctx, x + 6, y - 4, 3 * s, 3 * s, pal.feature, 0.8, 0);
      });
      break;
    case 'solen':
      scatter(60, (x, y, k) => {
        const s = k * scale * r.range(0.6, 1.2);
        for (let c = 0; c < 3; c++) {
          const cx = x + r.range(-6, 6) * s;
          const hh = r.range(8, 16) * s;
          ctx.fillStyle = css(vary(pal.feature, r, 0.02, 0.05, 0.06), 0.85);
          ctx.beginPath();
          ctx.moveTo(cx - 2.4 * s, y);
          ctx.lineTo(cx, y - hh);
          ctx.lineTo(cx + 2.4 * s, y);
          ctx.closePath();
          ctx.fill();
        }
      });
      break;
    case 'arche':
      scatter(34, (x, y, k) => {
        const s = k * scale * r.range(0.8, 1.4);
        ctx.fillStyle = css(shade(pal.rock, 0.1), 0.95);
        const cw = r.range(12, 26) * s;
        const ch = r.range(5, 16) * s;
        ctx.fillRect(x - cw / 2, y - ch, cw, ch);
        ctx.fillStyle = css(lighten(pal.rock, 0.2), 0.8);
        ctx.fillRect(x - cw / 2, y - ch, cw, 2 * s);
      });
      scatter(40, (x, y, k) => rockBlob(x, y, k * scale * r.range(0.5, 1), pal.rock));
      break;
    case 'heart':
      scatter(50, (x, y, k) => rockBlob(x, y, k * scale * r.range(0.6, 1.2), pal.rock));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 22; i++) {
        let x = r.range(0, w);
        let y = r.range(h * L.top, h);
        if (!clear(x, y)) continue;
        ctx.strokeStyle = css(pal.feature, 0.35);
        ctx.lineWidth = 1.6 * scale;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += r.range(-18, 18) * scale;
          y += r.range(-4, 4) * scale;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      break;
  }

  // ---- every site: an ore field and a heat vent ------------------------------------------------
  const field = (c: { x: number; y: number }, k: number, salt: number) => {
    const rr = new Rng(planetSeed ^ (salt * 7919));
    const s = k * scale;
    // ore rocks in a wide arc behind the base spot, reaching out past the building's sides so
    // the workers' rocks show (the same arc the workers use in systems/units.ts)
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.96 + (i / 8) * Math.PI * 0.92;
      const x = c.x + Math.cos(a) * 58 * s;
      const y = c.y + Math.sin(a) * 22 * s - 2 * s;
      // copper ore: a lump with a darker band and bright metal flecks (never blue crystals)
      const ore: RGB = mix(pal.rock, [196, 116, 58], 0.7);
      const rx = rr.range(5.5, 8) * s;
      const ry = rr.range(3.8, 5.2) * s;
      softEllipse(ctx, x + 2 * s, y + 2 * s, rx * 1.3, 2.8 * s, shade(ore, 0.65), 0.36, 0);
      gouache(ctx, blobPoints(x, y - 2 * s, rx, ry, rr, { lumps: 0.32, flatBottom: 0.5 }), {
        base: vary(ore, rr, 0.02, 0.06, 0.06),
        r: rr,
        dabDensity: 9,
        roundness: 0.9,
        grain: 0.35,
      });
      ctx.fillStyle = css(shade(ore, 0.35), 0.45);
      ctx.fillRect(x - rx * 0.7, y - 1.6 * s, rx * 1.4, 1.1 * s);
      for (let g = 0; g < 3; g++) {
        ctx.fillStyle = css(g ? lighten(ore, 0.55) : [255, 236, 196], g ? 0.8 : 0.95);
        ctx.fillRect(x + rr.range(-0.6, 0.4) * rx, y - 2 * s - rr.range(0.2, 0.8) * ry, 1.8 * s, 1.2 * s);
      }
    }
    // the vent: a dark crack with a warm glow inside
    const vx = c.x + 30 * s * (salt % 2 ? 1 : -1);
    const vy = c.y + 6 * s;
    softEllipse(ctx, vx, vy, 10 * s, 4 * s, shade(pal.rock, 0.5), 0.8, 0.1);
    softEllipse(ctx, vx, vy, 5 * s, 2 * s, [240, 138, 75], 0.75, 0);
  };
  for (let i = 0; i < SITE_COUNT; i++) field(sites[i], depthOf(sites[i].y / h), i + 1);
  field(nat, depthOf(nat.y / h), 40);
  field({ x: home.x, y: home.y - cliffPx }, depthOf(home.y / h), 41);
  for (const [i, rp] of rival.entries()) field({ x: rp.x, y: rp.y - cliffPx * 0.85 }, depthOf(rp.y / h), 50 + i);
  void HOME;
  void NAT;
  void RIVAL_HOME;

  applyGrain(ctx, null, w, h, 0.22);
  return pc;
}
