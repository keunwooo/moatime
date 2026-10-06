/**
 * Colony buildings, one painting per kind, in a shared SF language of the colony's own:
 * chamfered modules on armoured plinths with teal trim and cyan ground lights, slate armour
 * plates, long warm window bands, and a silhouette that tells each building's job from afar:
 *
 *   extractor   a lattice derrick over the ore hopper     generator  a glowing energy core between radiator fins
 *   habitat     a two-storey block with window bands      storage    hex-capped silos with resource gauges
 *   command     a broad hub, control tower and pad        research   a sensor tower with a radar head
 *   turret      an armoured bunker with a gun housing     barracks   a long hangar with a chevron door
 *   factory     a sawtooth hall, bay door and stack       relay/dish equipment houses for their masts
 *   greenhouse  a faceted glass dome of plants            dome       a faceted city dome with towers inside
 *
 * Each art keeps the metadata the construction stages use (extent, shell kind, plinth height,
 * window lights), so building them up step by step works as before.
 */

import { Rng } from '../../core/rng';
import { blobPoints, gouache, makeCanvas, smoothPath, softEllipse, type Pt } from '../paint/brush';
import { css, lighten, mix, shade, vary, type RGB } from '../paint/color';
import { FAC_PX, hullOpts, type FacilityArt } from './paint';
import { S, type FacilityKind } from './palette';

const TAU = Math.PI * 2;

type XY = [number, number];

const DIMS: Record<FacilityKind, { w: number; h: number; shape: FacilityArt['shape']; baseH: number }> = {
  habitat: { w: 150, h: 86, shape: 'box', baseH: 12 },
  bigdome: { w: 210, h: 130, shape: 'dome', baseH: 22 },
  greenhouse: { w: 160, h: 88, shape: 'dome', baseH: 16 },
  observatory: { w: 100, h: 132, shape: 'tower', baseH: 80 },
  comms: { w: 90, h: 50, shape: 'box', baseH: 50 },
  relay: { w: 60, h: 32, shape: 'box', baseH: 32 },
  workshop: { w: 184, h: 86, shape: 'box', baseH: 80 },
  power: { w: 120, h: 78, shape: 'box', baseH: 34 },
  command: { w: 180, h: 100, shape: 'box', baseH: 60 },
  extractor: { w: 112, h: 112, shape: 'box', baseH: 40 },
  storage: { w: 154, h: 74, shape: 'box', baseH: 16 },
  turret: { w: 86, h: 54, shape: 'box', baseH: 24 },
  barracks: { w: 180, h: 58, shape: 'box', baseH: 50 },
};

const ARMOR: RGB = mix(S.armor, S.lavender, 0.18);
const DARK: RGB = shade(S.armor, 0.35);

export function paintBuilding(kind: FacilityKind, seed: number): FacilityArt {
  const r = new Rng(seed);
  const P = FAC_PX;
  const d = DIMS[kind];
  const pad = 24;
  const pc = makeCanvas(d.w * P + pad * 2, d.h * P + pad * 2);
  const { ctx } = pc;
  const ax = pc.w / 2;
  const ay = pc.h - pad;
  const X = (wu: number) => ax + wu * P;
  const Y = (wu: number) => ay - wu * P;
  const windows: FacilityArt['windows'] = [];
  const pts = (xs: XY[]): Pt[] => xs.map(([x, y]) => ({ x: X(x), y: Y(y) }));

  /** A block from x0..x1, y0..y1 (wu, y up) with its top corners cut by c. */
  const chamfer = (x0: number, x1: number, y0: number, y1: number, c: number, cb = 0): XY[] => [
    [x0 + cb, y0],
    [x0, y0 + cb],
    [x0, y1 - c],
    [x0 + c, y1],
    [x1 - c, y1],
    [x1, y1 - c],
    [x1, y0 + cb],
    [x1 - cb, y0],
  ];
  const paint = (xs: XY[], base: RGB = S.hull, roundness = 0.22) => gouache(ctx, pts(xs), { ...hullOpts(r, base), roundness });
  const flat = (xs: XY[], color: RGB, a = 1) => {
    ctx.fillStyle = css(color, a);
    ctx.fill(smoothPath(pts(xs)));
  };
  const rect = (x0: number, x1: number, y0: number, y1: number, color: RGB, a = 1) => {
    ctx.fillStyle = css(color, a);
    ctx.fillRect(X(x0), Y(y1), (x1 - x0) * P, (y1 - y0) * P);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, color: RGB, w: number, a = 1) => {
    ctx.strokeStyle = css(color, a);
    ctx.lineWidth = w * P;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X(x0), Y(y0));
    ctx.lineTo(X(x1), Y(y1));
    ctx.stroke();
  };
  const dot = (x: number, y: number, rad: number, color: RGB, a = 1) => softEllipse(ctx, X(x), Y(y), rad * P, rad * P, color, a, 0);
  /** Teal trim line. */
  const trim = (x0: number, x1: number, y: number, h = 2.2) => rect(x0, x1, y, y + h, S.team, 0.95);
  /** The armoured plinth every building stands on, with cyan ground lights. */
  const plinth = (w2: number, h: number) => {
    paint(chamfer(-w2, w2, 0, h, 3), ARMOR, 0.2);
    rect(-w2 + 3, w2 - 3, h - 1.6, h, lighten(ARMOR, 0.35), 0.6);
    const n = Math.max(2, Math.round((w2 * 2) / 22));
    for (let i = 0; i < n; i++) dot(-w2 + 8 + ((w2 * 2 - 16) * i) / Math.max(1, n - 1), h * 0.45, 1.6, S.energy, 0.95);
  };
  /** A long window band of warm light with mullions; its lights come on at the power stage. */
  const band = (x0: number, x1: number, y: number, h: number, light: RGB = S.window) => {
    rect(x0 - 1, x1 + 1, y - 1, y + h + 1, DARK, 0.95);
    const g = ctx.createLinearGradient(0, Y(y + h), 0, Y(y));
    g.addColorStop(0, css(mix(light, [255, 255, 255], 0.2), 0.95));
    g.addColorStop(1, css(mix(light, S.apricot, 0.4), 0.85));
    ctx.fillStyle = g;
    ctx.fillRect(X(x0), Y(y + h), (x1 - x0) * P, h * P);
    for (let x = x0 + 7; x < x1 - 2; x += 7) line(x, y, x, y + h, DARK, 0.9, 0.8);
    for (let x = x0 + 6; x <= x1 - 4; x += 14) windows.push({ x, y: -(y + h / 2), r: Math.min(5, h * 0.45) });
  };
  /** Dark slits (vents). */
  const vents = (x0: number, y: number, n: number, gap = 4) => {
    for (let i = 0; i < n; i++) rect(x0 + i * gap, x0 + i * gap + 2, y, y + 6, DARK, 0.8);
  };
  /** Contact shadow on the ground. */
  softEllipse(ctx, X(8), Y(0), d.w * P * 0.6, 10 * P, [16, 22, 40], 0.45, 0);

  switch (kind) {
    case 'habitat': {
      plinth(75, 10);
      paint(chamfer(-70, 70, 10, 50, 7), S.hull);
      paint(chamfer(-70, -50, 10, 50, 7), ARMOR);
      paint(chamfer(50, 70, 10, 50, 7), ARMOR);
      trim(-50, 50, 14);
      band(-44, 40, 24, 11);
      // door
      rect(42, 48, 10, 32, DARK, 0.9);
      // upper floor, set back
      paint(chamfer(-42, 30, 50, 78, 7), mix(S.hull, S.hullShadow, 0.1));
      band(-34, 20, 58, 10);
      // roof unit and antenna
      paint(chamfer(34, 50, 50, 64, 3), ARMOR);
      vents(36, 54, 3);
      line(44, 64, 44, 84, S.metal, 1.4);
      dot(44, 85, 2.2, S.coral);
      break;
    }
    case 'storage': {
      plinth(77, 10);
      // a pipe linking the silos
      rect(-54, 54, 20, 25, DARK, 0.9);
      const fill: RGB[] = [mix(S.metal, S.text, 0.3), [247, 205, 228], [255, 200, 120]];
      [-48, 0, 48].forEach((cx, i) => {
        const top = i === 1 ? 72 : 64;
        paint(chamfer(cx - 19, cx + 19, 10, top - 10, 2), i === 1 ? S.hull : mix(S.hull, S.hullShadow, 0.12));
        paint(chamfer(cx - 19, cx + 19, top - 12, top, 8), ARMOR);
        rect(cx - 19, cx + 19, 30, 33, ARMOR, 0.85);
        trim(cx - 19, cx + 19, 44, 1.6);
        // the level gauge in its resource's colour
        rect(cx - 5, cx + 5, 14, top - 16, DARK, 0.95);
        rect(cx - 3.5, cx + 3.5, 16, 16 + (top - 34) * (0.45 + 0.3 * r.next()), fill[i], 0.95);
        windows.push({ x: cx, y: -(top - 6), r: 2.4 });
      });
      break;
    }
    case 'command': {
      plinth(90, 10);
      // landing pad on one side
      rect(-90, -66, 10, 13, ARMOR, 0.95);
      for (const x of [-86, -78, -70]) dot(x, 14, 1.4, S.coral);
      paint(chamfer(-72, 72, 10, 58, 12), S.hull);
      paint(chamfer(-72, -54, 10, 58, 12), ARMOR);
      paint(chamfer(54, 72, 10, 58, 12), ARMOR);
      trim(-54, 54, 16);
      band(-48, 48, 32, 11);
      vents(58, 20, 3);
      // the control tower and its glazed cab
      paint(chamfer(-16, 16, 58, 80, 2), mix(S.hull, S.hullShadow, 0.15));
      rect(-16, 16, 64, 66, S.team, 0.9);
      paint(chamfer(-32, 32, 78, 98, 6), ARMOR);
      band(-26, 26, 84, 8, mix(S.energy, S.window, 0.35));
      break;
    }
    case 'observatory': {
      // research: a tapering sensor tower with a radar head
      plinth(48, 10);
      paint([[-38, 10], [-28, 80], [28, 80], [38, 10]], S.hull, 0.2);
      paint([[-38, 10], [-34, 40], [-24, 40], [-26, 10]], ARMOR, 0.2);
      paint([[26, 10], [24, 40], [34, 40], [38, 10]], ARMOR, 0.2);
      trim(-30, 30, 44);
      band(-14, 14, 52, 14, mix(S.energy, S.window, 0.4));
      // the head deck and its radar dish
      paint(chamfer(-44, 44, 80, 92, 5), ARMOR);
      for (const x of [-34, -18, 18, 34]) dot(x, 86, 1.5, S.energy);
      const dish: XY[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI * (0.08 + (0.84 * i) / 16);
        dish.push([-Math.cos(a) * 36, 112 - Math.sin(a) * 14]);
      }
      dish.push([30, 120], [-30, 120]);
      paint(dish, mix(S.hull, S.lavender, 0.15), 0.4);
      line(0, 92, 0, 104, S.metal, 2.4);
      line(0, 118, 0, 130, S.metal, 1.2);
      dot(0, 131, 2.2, S.coral);
      break;
    }
    case 'comms': {
      // the dish's equipment house (the mast and the dish are added on site)
      plinth(45, 8);
      paint(chamfer(-40, 40, 8, 48, 6), S.hull);
      paint(chamfer(-40, -24, 8, 48, 6), ARMOR);
      trim(-24, 40, 14);
      band(-16, 30, 26, 9);
      vents(-36, 34, 3);
      break;
    }
    case 'relay': {
      // the relay cabinet at the foot of its lattice mast
      plinth(30, 6);
      paint(chamfer(-24, 24, 6, 30, 5), ARMOR);
      rect(-20, 20, 22, 24, S.team, 0.9);
      band(-14, 6, 12, 6);
      dot(16, 14, 1.8, S.energy);
      break;
    }
    case 'workshop': {
      // factory: a sawtooth hall with a bay door and a stack
      plinth(92, 10);
      paint(chamfer(-86, 70, 10, 62, 2), S.hull);
      // the sawtooth roof, glazed on its steep faces
      const teeth = 5;
      const tw = 156 / teeth;
      for (let i = 0; i < teeth; i++) {
        const x0 = -86 + i * tw;
        paint([[x0, 62], [x0, 76], [x0 + tw, 62]], ARMOR, 0.1);
        flat([[x0 + 1.5, 63], [x0 + 1.5, 73], [x0 + 6, 70.5], [x0 + 6, 63]], mix(S.energy, S.glass, 0.4), 0.85);
      }
      trim(-86, 70, 54);
      // the bay door with chevrons over it
      rect(-32, 24, 10, 50, DARK, 0.95);
      for (let y = 14; y < 48; y += 6) line(-30, y, 22, y, mix(DARK, S.hullShadow, 0.4), 1, 0.8);
      for (let i = 0; i < 7; i++) {
        const x = -32 + i * 8;
        flat([[x, 50], [x + 4, 50], [x + 8, 46], [x + 4, 46]], i % 2 ? S.coral : S.hull, 0.95);
      }
      band(-78, -42, 32, 9);
      band(32, 64, 32, 9);
      // stack with a warm vent
      paint(chamfer(72, 86, 10, 86, 3), ARMOR);
      rect(72, 86, 70, 72, S.coral, 0.9);
      dot(79, 86, 4, mix(S.window, S.coral, 0.4), 0.7);
      windows.push({ x: 79, y: -84, r: 3 });
      break;
    }
    case 'power': {
      // generator: an energy core in a cage between two radiator banks
      plinth(60, 10);
      paint(chamfer(-54, 54, 10, 32, 5), ARMOR);
      trim(-50, 50, 26);
      vents(-48, 14, 6);
      vents(26, 14, 6);
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -54 : 24;
        paint(chamfer(x0, x0 + 30, 32, 56, 4), mix(S.hull, S.hullShadow, 0.15));
        for (let x = x0 + 4; x < x0 + 28; x += 4) line(x, 35, x, 53, S.hullShadow, 0.9, 0.8);
      }
      // the core: a tall glass cylinder full of cyan light
      const g = ctx.createLinearGradient(X(-12), 0, X(12), 0);
      g.addColorStop(0, css(mix(S.energy, S.space, 0.45)));
      g.addColorStop(0.5, css(lighten(S.energy, 0.4)));
      g.addColorStop(1, css(mix(S.energy, S.space, 0.55)));
      ctx.fillStyle = g;
      ctx.fillRect(X(-12), Y(70), 24 * P, 38 * P);
      for (const x of [-16, 16]) line(x, 32, x, 72, DARK, 2.6);
      line(-16, 50, 16, 50, DARK, 1.6, 0.8);
      paint(chamfer(-20, 20, 70, 78, 3), ARMOR);
      paint(chamfer(-20, 20, 30, 34, 1), ARMOR);
      windows.push({ x: -40, y: -20, r: 3 }, { x: 40, y: -20, r: 3 });
      break;
    }
    case 'extractor': {
      // drill rig: a housing and ore hopper under a lattice derrick (the rod moves on site)
      plinth(54, 8);
      paint(chamfer(-48, 48, 8, 40, 8), S.hull);
      paint(chamfer(-48, -30, 8, 40, 8), ARMOR);
      trim(-30, 48, 14);
      band(-26, -2, 22, 8);
      paint([[26, 40], [22, 58], [54, 58], [48, 40]], ARMOR, 0.15);
      softEllipse(ctx, X(38), Y(57), 13 * P, 3 * P, mix(S.dust, [176, 110, 88], 0.45), 0.95, 0);
      for (const sx of [-1, 1]) line(sx * 28, 40, sx * 6, 106, DARK, 2.6);
      for (const y of [56, 72, 88]) {
        const half = 28 - ((y - 40) / 66) * 22;
        line(-half, y, half, y + 8, DARK, 1.3, 0.9);
        line(half, y, -half, y + 8, DARK, 1.3, 0.9);
      }
      paint(chamfer(-11, 11, 102, 112, 3), ARMOR);
      dot(0, 113, 2, S.coral);
      break;
    }
    case 'turret': {
      // a low armoured bunker under a gun housing (the barrels sweep on site)
      plinth(43, 8);
      paint(chamfer(-38, 38, 8, 30, 10), ARMOR);
      trim(-30, 30, 22);
      vents(-28, 12, 4, 5);
      vents(10, 12, 4, 5);
      paint(chamfer(-22, 22, 30, 52, 9), mix(S.hull, S.hullShadow, 0.1));
      rect(-14, 18, 38, 42, DARK, 0.95);
      dot(10, 40, 2.4, S.coral);
      windows.push({ x: 10, y: -40, r: 3 });
      break;
    }
    case 'barracks': {
      // a long hangar with a chevron door, window bands and the colony's mark
      plinth(90, 8);
      paint(chamfer(-84, 84, 8, 44, 4), S.hull);
      paint([[-84, 44], [-78, 56], [78, 56], [84, 44]], ARMOR, 0.15);
      for (const x of [-60, -30, 30, 60]) flat([[x - 8, 47], [x - 6, 53], [x + 6, 53], [x + 8, 47]], mix(S.energy, S.glass, 0.4), 0.8);
      trim(-84, 84, 14);
      rect(-15, 15, 8, 36, DARK, 0.95);
      for (let i = 0; i < 4; i++) {
        const x = -15 + i * 7.5;
        flat([[x, 36], [x + 3.75, 36], [x + 7.5, 32], [x + 3.75, 32]], i % 2 ? S.hull : S.coral, 0.95);
      }
      band(-72, -26, 20, 8);
      band(26, 60, 20, 8);
      // the colony's chevron
      flat([[62, 30], [70, 38], [78, 30], [78, 26], [70, 34], [62, 26]], S.team, 0.95);
      break;
    }
    case 'greenhouse':
    case 'bigdome': {
      const city = kind === 'bigdome';
      const baseH = d.baseH;
      plinth(d.w / 2, 10);
      paint(chamfer(-d.w / 2 + 5, d.w / 2 - 5, 10, baseH, 3), mix(S.hull, S.hullShadow, 0.1));
      trim(-d.w / 2 + 8, d.w / 2 - 8, baseH - 5);
      const rx = d.w / 2 - 8;
      const ry = d.h - baseH;
      const dome: XY[] = [];
      for (let i = 0; i <= 12; i++) {
        // a faceted dome: straight panels between joints
        const a = Math.PI + (i / 12) * Math.PI;
        dome.push([Math.cos(a) * rx, baseH - Math.sin(a) * ry]);
      }
      ctx.save();
      ctx.beginPath();
      dome.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath();
      ctx.clip();
      const g = ctx.createLinearGradient(X(-rx), Y(baseH + ry), X(rx), Y(baseH));
      g.addColorStop(0, css(mix(S.glass, S.text, 0.35), 0.8));
      g.addColorStop(1, css(mix(S.glass, S.space, 0.4), 0.85));
      ctx.fillStyle = g;
      ctx.fillRect(X(-rx), Y(baseH + ry), rx * 2 * P, ry * P);
      if (city) {
        // the city's towers seen through the glass
        const towers: [number, number, number][] = [[-62, 34, 14], [-36, 62, 16], [-8, 86, 18], [22, 70, 16], [50, 44, 14], [72, 28, 10]];
        for (const [x, h, w] of towers) {
          paint(chamfer(x - w / 2, x + w / 2, baseH, baseH + h, 4), mix(S.hull, S.glass, 0.35), 0.15);
          for (let y = baseH + 6; y < baseH + h - 4; y += 7) rect(x - w / 2 + 3, x + w / 2 - 3, y, y + 2.4, S.window, 0.85);
          windows.push({ x, y: -(baseH + h * 0.6), r: 4 });
        }
      } else {
        for (let i = 0; i < 26; i++) {
          const x = r.range(-rx * 0.8, rx * 0.8);
          const hh = r.range(10, 34);
          gouache(ctx, blobPoints(X(x), Y(baseH + hh * 0.5), r.range(8, 16) * P, hh * P * 0.55, r, { lumps: 0.25 }), {
            base: vary(mix(S.plant, S.glass, 0.25), r),
            light: lighten(S.plant, 0.35),
            shadow: mix(S.plant, S.space, 0.4),
            r,
            grain: 0.05,
            rimLight: 0.2,
          });
        }
        windows.push({ x: -30, y: -(baseH + 20), r: 10 }, { x: 28, y: -(baseH + 24), r: 10 });
      }
      ctx.restore();
      // the frame: panel joints and rings
      ctx.strokeStyle = css(mix(S.hull, S.hullShadow, 0.2), 0.95);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      dome.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke();
      ctx.lineWidth = 1.3;
      for (let i = 2; i < 12; i += 2) {
        const a = Math.PI + (i / 12) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(X(Math.cos(a) * rx), Y(baseH - Math.sin(a) * ry));
        ctx.lineTo(X(Math.cos(a) * rx * 0.35), Y(baseH - Math.sin(a) * ry * 1.02 + 2));
        ctx.lineTo(X(0), Y(baseH + ry));
        ctx.stroke();
      }
      for (const k of [0.45, 0.8]) {
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = Math.PI + (i / 12) * Math.PI;
          const x = X(Math.cos(a) * rx * Math.sqrt(1 - k * k));
          const y = Y(baseH + ry * k);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = css(S.text, 0.3);
      ctx.beginPath();
      ctx.ellipse(X(-rx * 0.45), Y(baseH + ry * 0.7), 14 * P, 5 * P, -0.5, 0, TAU);
      ctx.fill();
      if (city) {
        paint(chamfer(-12, 12, d.h - 4, d.h + 2, 3), ARMOR);
        dot(0, d.h + 3, 2.4, S.coral);
      }
      break;
    }
  }
  return { canvas: pc, ax, ay, w: d.w, h: d.h, shape: d.shape, windows, baseH: d.baseH };
}

/** An energy vent seen from above (a flat card): a glowing fissure in the regolith. 160×80 px. */
export function paintVent(seed: number) {
  const pc = makeCanvas(160, 80);
  const { ctx } = pc;
  const r = new Rng(seed);
  softEllipse(ctx, 80, 40, 76, 36, mix(S.sandShadow, S.lavender, 0.3), 0.55, 0);
  softEllipse(ctx, 80, 40, 52, 22, S.energy, 0.35, 0);
  // the fissure: a jagged dark crack lit from inside
  const crack: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    crack.push({ x: 26 + t * 108, y: 40 + Math.sin(t * 9 + r.next()) * 4 - 6 * Math.sin(t * Math.PI) });
  }
  for (let i = 10; i >= 0; i--) {
    const t = i / 10;
    crack.push({ x: 26 + t * 108, y: 40 + Math.sin(t * 7 + 1.3) * 3 + 7 * Math.sin(t * Math.PI) });
  }
  ctx.fillStyle = css(mix(S.deep, S.space, 0.4), 0.95);
  ctx.fill(smoothPath(crack));
  ctx.strokeStyle = css(lighten(S.energy, 0.2), 0.9);
  ctx.lineWidth = 2;
  ctx.stroke(smoothPath(crack));
  softEllipse(ctx, 80, 40, 30, 6, lighten(S.energy, 0.4), 0.9, 0);
  return pc;
}
