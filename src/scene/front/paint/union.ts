/**
 * 개척 연합 — angular plate, rivets, yellow warning stripes, container blocks, round floodlights and
 * structures standing on legs (FRONT_PROMPT.md 4.1절). Steel #5B6670, signal #D9603B, warning
 * #E9C46A, window light #F4D29C. Ships are long box hulls with container decks and broadside rows.
 */

import type { BuildingKind, UnitKind } from '../../../sim/frontPlan';
import { lighten, mix, shade, type RGB } from '../../paint/color';
import { RACE_PAL } from '../palette';
import { block, footShadow, glow, line, orb, paint, plate, stripes, windows, type Art, type Pen } from './kit';

const P = RACE_PAL[0];
const STEEL = P.body;
const DARK = P.bodyDark;
const SIGNAL = P.accent;
const WARN = P.accent2;
const LIT = P.glow;
const CONT: RGB[] = [mix(SIGNAL, STEEL, 0.25), mix(STEEL, [90, 110, 96], 0.5), mix(WARN, STEEL, 0.45), shade(SIGNAL, 0.25)];

function legs(pen: Pen, xs: number[], y0: number, y1: number, spread = 3) {
  for (const x of xs) {
    const o = x < 0 ? -spread : spread;
    line(pen, [
      [x, y0],
      [x + o, y1],
    ], DARK, 2.4);
    line(pen, [
      [x + o - 2, y1],
      [x + o + 2, y1],
    ], DARK, 1.6);
  }
}

function lamp(pen: Pen, x: number, y: number, r = 1.4) {
  orb(pen, x, y, r, r, LIT, { line: 0.5 });
  glow(pen, x, y, r * 3, LIT, 0.45);
}

export const UNION_BUILDINGS: Record<BuildingKind, () => Art> = {
  hq: () =>
    paint(84, 66, 42, 60, 101, P.ink, (pen) => {
      footShadow(pen, 40, 7);
      legs(pen, [-28, -14, 14, 28], -10, 0, 4);
      // the ark's hull, landed and opened into a base
      plate(pen, [
        [-36, -12],
        [-30, -32],
        [30, -32],
        [37, -12],
      ], STEEL);
      plate(pen, [
        [-36, -12],
        [37, -12],
        [33, -8],
        [-32, -8],
      ], DARK);
      stripes(pen, -28, -18, 56, 3.2, WARN, DARK);
      windows(pen, -24, -25, 48, 7, 2.6, LIT);
      // the bridge tower
      block(pen, -8, -32, 16, 14, 6, mix(STEEL, [140, 150, 158], 0.25));
      windows(pen, -6, -41, 12, 3, 2.2, LIT);
      plate(pen, [
        [-3, -46],
        [3, -46],
        [3, -50],
        [-3, -50],
      ], SIGNAL);
      line(pen, [
        [0, -50],
        [0, -58],
      ], DARK, 0.9);
      lamp(pen, 0, -58.5, 1.1);
      lamp(pen, -30, -31, 1.3);
      lamp(pen, 30, -31, 1.3);
    }),
  outpost: () =>
    paint(62, 50, 31, 45, 102, P.ink, (pen) => {
      footShadow(pen, 28, 5);
      legs(pen, [-19, 19], -8, 0, 3);
      plate(pen, [
        [-25, -9],
        [-21, -26],
        [21, -26],
        [25, -9],
      ], STEEL);
      stripes(pen, -19, -14, 38, 2.6, WARN, DARK);
      windows(pen, -16, -20, 32, 5, 2.3, LIT);
      block(pen, -6, -26, 12, 8, 4, mix(STEEL, [140, 150, 158], 0.25));
      lamp(pen, 0, -36, 1);
    }),
  supply: () =>
    paint(40, 34, 20, 30, 103, P.ink, (pen) => {
      footShadow(pen, 18, 4);
      block(pen, -15, 0, 14, 9, 5, CONT[0]);
      block(pen, 0, 0, 14, 9, 5, CONT[1]);
      block(pen, -9, -9, 14, 9, 5, CONT[2]);
      line(pen, [
        [-13, -4.5],
        [-3, -4.5],
      ], shade(CONT[0], 0.4), 0.6);
      line(pen, [
        [2, -4.5],
        [12, -4.5],
      ], shade(CONT[1], 0.4), 0.6);
    }),
  barracks: () =>
    paint(60, 44, 30, 40, 104, P.ink, (pen) => {
      footShadow(pen, 27, 5);
      block(pen, -24, 0, 44, 18, 8, STEEL);
      // the shutter door
      plate(pen, [
        [-8, 0],
        [-8, -12],
        [8, -12],
        [8, 0],
      ], shade(STEEL, 0.25));
      for (let y = -11; y < 0; y += 2) line(pen, [
        [-7.4, y],
        [7.4, y],
      ], DARK, 0.5);
      stripes(pen, -8, -14.6, 16, 2.2, WARN, DARK);
      windows(pen, -22, -14, 12, 2, 2.2, LIT);
      windows(pen, 10, -14, 12, 2, 2.2, LIT);
      // a flag
      line(pen, [
        [21, -18],
        [21, -34],
      ], DARK, 0.8);
      plate(pen, [
        [21, -34],
        [29, -32],
        [21, -29],
      ], SIGNAL, { line: 0.5 });
    }),
  gas: () =>
    paint(34, 56, 17, 52, 105, P.ink, (pen) => {
      footShadow(pen, 14, 4);
      plate(pen, [
        [-9, 0],
        [-7, -36],
        [7, -36],
        [9, 0],
      ], STEEL);
      for (const y of [-8, -18, -28]) stripes(pen, -8, y, 16, 1.6, WARN, DARK);
      line(pen, [
        [-9, -12],
        [-14, -12],
        [-14, 0],
      ], DARK, 1.6);
      line(pen, [
        [9, -22],
        [13, -22],
        [13, 0],
      ], DARK, 1.6);
      plate(pen, [
        [-3, -36],
        [-2, -46],
        [2, -46],
        [3, -36],
      ], DARK);
      lamp(pen, 0, -38, 1);
    }),
  wall: () =>
    paint(48, 20, 24, 16, 106, P.ink, (pen) => {
      footShadow(pen, 22, 3);
      for (let i = 0; i < 3; i++) block(pen, -21 + i * 14, 0, 12, 7, 4, i === 1 ? CONT[0] : STEEL);
      stripes(pen, -21, -9.5, 40, 1.4, WARN, DARK);
    }),
  tech2: () =>
    paint(52, 46, 26, 42, 107, P.ink, (pen) => {
      footShadow(pen, 22, 5);
      block(pen, -18, 0, 32, 18, 7, mix(STEEL, [120, 130, 140], 0.2));
      windows(pen, -15, -11, 26, 4, 2.4, LIT);
      // the dish
      line(pen, [
        [4, -22],
        [6, -30],
      ], DARK, 1);
      orb(pen, 6, -32, 7, 3, lighten(STEEL, 0.25));
      orb(pen, 6, -32.4, 4.4, 1.6, shade(STEEL, 0.25), { line: 0.4 });
      lamp(pen, -14, -20, 1);
    }),
  factory: () =>
    paint(70, 50, 35, 46, 108, P.ink, (pen) => {
      footShadow(pen, 32, 6);
      block(pen, -30, 0, 54, 20, 10, STEEL);
      // the sawtooth roof
      for (let i = 0; i < 4; i++) {
        const x = -28 + i * 13;
        plate(pen, [
          [x, -20],
          [x + 6, -27],
          [x + 12, -20],
        ], i % 2 ? shade(STEEL, 0.1) : lighten(STEEL, 0.1), { line: 0.6 });
      }
      plate(pen, [
        [-12, 0],
        [-12, -14],
        [8, -14],
        [8, 0],
      ], shade(STEEL, 0.32));
      stripes(pen, -12, -16.4, 20, 2.2, WARN, DARK);
      block(pen, 16, -20, 5, 14, 3, DARK);
      windows(pen, -27, -12, 12, 2, 2, LIT);
    }),
  airfield: () =>
    paint(68, 34, 34, 28, 109, P.ink, (pen) => {
      footShadow(pen, 32, 5);
      plate(pen, [
        [-30, 0],
        [-24, -8],
        [28, -8],
        [32, 0],
      ], shade(STEEL, 0.15));
      line(pen, [
        [-20, -4],
        [24, -4],
      ], WARN, 0.9, 0.9);
      for (let x = -22; x <= 26; x += 8) lamp(pen, x, -7.6, 0.7);
      block(pen, 18, -8, 6, 14, 3, STEEL);
      windows(pen, 18.5, -18, 5, 1, 2.2, LIT);
    }),
  tech3: () =>
    paint(52, 64, 26, 58, 110, P.ink, (pen) => {
      footShadow(pen, 22, 5);
      block(pen, -16, 0, 28, 30, 7, mix(STEEL, [110, 118, 132], 0.3));
      windows(pen, -14, -22, 24, 4, 2.2, LIT);
      windows(pen, -14, -12, 24, 4, 2.2, LIT);
      for (const x of [-10, -2, 6]) {
        line(pen, [
          [x, -30],
          [x, -44 - (x + 10) * 0.3],
        ], DARK, 0.9);
        lamp(pen, x, -44 - (x + 10) * 0.3, 0.8);
      }
      stripes(pen, -16, -3, 28, 1.6, WARN, DARK);
    }),
  shipyard: () =>
    paint(92, 84, 46, 78, 111, P.ink, (pen) => {
      footShadow(pen, 44, 7);
      // the gantry and its crane
      for (const x of [-36, 34]) {
        plate(pen, [
          [x - 2, 0],
          [x - 2, -58],
          [x + 2, -58],
          [x + 2, 0],
        ], DARK);
        for (let y = -6; y > -56; y -= 8) line(pen, [
          [x - 2, y],
          [x + 2, y - 6],
        ], STEEL, 0.6);
      }
      plate(pen, [
        [-40, -58],
        [40, -58],
        [40, -62],
        [-40, -62],
      ], DARK);
      stripes(pen, -40, -62, 80, 2.4, WARN, DARK);
      line(pen, [
        [10, -58],
        [10, -44],
      ], DARK, 0.6);
      // a hull in the dock
      plate(pen, [
        [-28, -14],
        [-22, -34],
        [26, -34],
        [32, -18],
        [26, -14],
      ], STEEL);
      windows(pen, -18, -26, 40, 8, 1.8, LIT);
      plate(pen, [
        [-36, 0],
        [-34, -8],
        [34, -8],
        [36, 0],
      ], shade(STEEL, 0.2));
      lamp(pen, -36, -60, 1.2);
      lamp(pen, 34, -60, 1.2);
    }),
  defense: () =>
    paint(36, 26, 18, 22, 112, P.ink, (pen) => {
      footShadow(pen, 15, 3.5);
      // sandbags and a plated dome with a slit
      for (let i = 0; i < 5; i++) orb(pen, -12 + i * 6, -2, 3.6, 2.2, mix([170, 150, 112], STEEL, 0.3), { line: 0.5 });
      orb(pen, 0, -8, 10, 7, STEEL);
      plate(pen, [
        [-6, -9],
        [6, -9],
        [6, -7.5],
        [-6, -7.5],
      ], DARK);
      line(pen, [
        [6, -8],
        [15, -10],
      ], DARK, 1.3);
    }),
  spread: () =>
    paint(14, 44, 7, 40, 113, P.ink, (pen) => {
      footShadow(pen, 5, 2);
      line(pen, [
        [0, 0],
        [0, -34],
      ], DARK, 1.4);
      line(pen, [
        [-3, 0],
        [0, -10],
        [3, 0],
      ], DARK, 0.8);
      plate(pen, [
        [-4, -34],
        [4, -34],
        [3, -38],
        [-3, -38],
      ], STEEL);
      lamp(pen, 0, -35, 1.6);
    }),
};

/** Units face right; pose 1 is mid-stride (or firing). */
export const UNION_UNITS: Record<UnitKind, (pose: 0 | 1) => Art> = {
  worker: (pose) =>
    paint(14, 16, 7, 14, 201 + pose, P.ink, (pen) => {
      footShadow(pen, 5, 1.6);
      // a small two-legged work frame with a drill arm
      line(pen, [
        [-2, -4],
        [-3 + pose, 0],
      ], DARK, 1.2);
      line(pen, [
        [2, -4],
        [3 - pose, 0],
      ], DARK, 1.2);
      block(pen, -3, -4, 6, 5, 2, STEEL);
      orb(pen, 0, -10.5, 2.2, 1.8, lighten(STEEL, 0.2), { line: 0.5 });
      glow(pen, 1, -10.6, 1.2, LIT, 0.8);
      line(pen, [
        [3, -6],
        [7, -5 + pose],
      ], WARN, 1);
    }),
  scout: (pose) =>
    paint(20, 14, 10, 12, 203 + pose, P.ink, (pen) => {
      footShadow(pen, 8, 1.8);
      orb(pen, -6, -2, 2, 2, DARK);
      orb(pen, 5, -2, 2, 2, DARK);
      orb(pen, 6, 0 - 2, 2, 2, DARK);
      plate(pen, [
        [-7, -4],
        [-4, -8],
        [5, -8],
        [8, -4],
      ], STEEL);
      stripes(pen, -5, -6, 9, 1.2, WARN, DARK);
      glow(pen, 8, -5, 1.2 + pose * 0.4, LIT);
    }),
  t1: (pose) =>
    paint(12, 18, 6, 16, 205 + pose, P.ink, (pen) => {
      footShadow(pen, 3.6, 1.2);
      line(pen, [
        [-1, -5],
        [-1.6 + pose, 0],
      ], DARK, 1.3);
      line(pen, [
        [1, -5],
        [1.6 - pose, 0],
      ], DARK, 1.3);
      plate(pen, [
        [-2.4, -5],
        [-2.2, -10.5],
        [2.2, -10.5],
        [2.4, -5],
      ], STEEL, { line: 0.6 });
      plate(pen, [
        [-3, -10.5],
        [-0.6, -10.5],
        [-0.6, -8.6],
        [-3, -8.6],
      ], SIGNAL, { line: 0.5 });
      orb(pen, 0, -12.5, 2.1, 2, lighten(STEEL, 0.3), { line: 0.5 });
      // the rifle
      line(pen, [
        [0.5, -8.4],
        [5.5, -9.2 - pose * 0.3],
      ], DARK, 0.9);
      if (pose) glow(pen, 6, -9.4, 1.2, P.shot, 0.9);
    }),
  t1b: (pose) =>
    paint(14, 18, 6, 16, 207 + pose, P.ink, (pen) => {
      footShadow(pen, 4, 1.2);
      line(pen, [
        [-1, -5],
        [-1.4 + pose, 0],
      ], DARK, 1.3);
      line(pen, [
        [1, -5],
        [1.4 - pose, 0],
      ], DARK, 1.3);
      plate(pen, [
        [-2.4, -5],
        [-2.2, -10.5],
        [2.2, -10.5],
        [2.4, -5],
      ], STEEL, { line: 0.6 });
      orb(pen, 0, -12.5, 2.1, 2, lighten(STEEL, 0.3), { line: 0.5 });
      // the shield wall
      plate(pen, [
        [3, -1],
        [3, -12],
        [6.5, -11],
        [6.5, -2],
      ], mix(STEEL, WARN, 0.25));
      stripes(pen, 3.2, -7, 3.1, 1.2, WARN, DARK);
    }),
  t2: (pose) =>
    paint(24, 30, 12, 28, 209 + pose, P.ink, (pen) => {
      footShadow(pen, 7, 2);
      // 'heron': a twin cannon on long legs
      line(pen, [
        [-2, -13],
        [-5 + pose * 2, -6],
        [-3 + pose * 2, 0],
      ], DARK, 1.4);
      line(pen, [
        [2, -13],
        [5 - pose * 2, -6],
        [3 - pose * 2, 0],
      ], DARK, 1.4);
      plate(pen, [
        [-6, -13],
        [-4, -21],
        [5, -21],
        [7, -13],
      ], STEEL);
      stripes(pen, -4, -15.5, 9, 1.4, WARN, DARK);
      line(pen, [
        [4, -19],
        [11, -20],
      ], DARK, 1.1);
      line(pen, [
        [4, -17],
        [11, -18],
      ], DARK, 1.1);
      lamp(pen, -2, -19, 0.8);
      if (pose) glow(pen, 11.5, -19, 1.6, P.shot, 0.9);
    }),
  t2s: (pose) =>
    paint(28, 20, 12, 17, 211 + pose, P.ink, (pen) => {
      footShadow(pen, 11, 2);
      // towed artillery with outriggers (spread when firing)
      if (pose) {
        line(pen, [
          [-6, -2],
          [-12, 0],
        ], DARK, 1);
        line(pen, [
          [6, -2],
          [12, 0],
        ], DARK, 1);
      }
      orb(pen, -6, -2, 2.4, 2.4, DARK);
      orb(pen, 6, -2, 2.4, 2.4, DARK);
      plate(pen, [
        [-9, -3],
        [-7, -8],
        [8, -8],
        [9, -3],
      ], STEEL);
      line(pen, [
        [0, -7],
        [11, -13 - pose * 2],
      ], DARK, 1.8);
      stripes(pen, -6, -6.5, 10, 1.2, WARN, DARK);
      if (pose) glow(pen, 12, -14.5, 2, P.shot, 0.9);
    }),
  t3: (pose) =>
    paint(32, 22, 15, 19, 213 + pose, P.ink, (pen) => {
      footShadow(pen, 13, 2.6);
      // 'turtle': twin turrets on tracks
      plate(pen, [
        [-13, 0],
        [-14, -4],
        [14, -4],
        [13, 0],
      ], DARK);
      for (let x = -11; x <= 11; x += 4.4) orb(pen, x, -2, 1.5, 1.5, shade(DARK, 0.2), { line: 0.4 });
      plate(pen, [
        [-12, -4],
        [-10, -9],
        [11, -9],
        [13, -4],
      ], STEEL);
      stripes(pen, -9, -6.6, 18, 1.4, WARN, DARK);
      for (const [x, k] of [
        [-4, 0],
        [5, 1],
      ] as const) {
        orb(pen, x, -11, 3.6, 2.4, lighten(STEEL, 0.15));
        line(pen, [
          [x + 2, -11.5],
          [x + 10, -12.5 - k],
        ], DARK, 1.1);
      }
      if (pose) glow(pen, 16, -13, 2, P.shot, 0.9);
    }),
  t3a: (pose) =>
    paint(30, 22, 14, 20, 215 + pose, P.ink, (pen) => {
      // 'hawk': a rotor gunship (drawn at height; its shadow is drawn by the scene)
      line(pen, [
        [-12, -14 + pose],
        [12, -14 - pose],
      ], shade(DARK, 0.1), 0.8, 0.7);
      plate(pen, [
        [-10, -8],
        [-6, -12],
        [7, -12],
        [11, -8],
        [6, -6],
      ], STEEL);
      plate(pen, [
        [-10, -8],
        [-14, -10],
        [-14, -8],
      ], DARK);
      windows(pen, 2, -10, 6, 2, 1.6, LIT);
      stripes(pen, -6, -8.5, 8, 1.1, WARN, DARK);
      line(pen, [
        [0, -12],
        [0, -14],
      ], DARK, 0.8);
      if (pose) glow(pen, 12, -7.5, 1.6, P.shot, 0.9);
    }),
  s1: (pose) =>
    paint(40, 18, 20, 12, 217 + pose, P.ink, (pen) => {
      // 'petrel': a small fast wedge with four drones
      plate(pen, [
        [-16, 0],
        [-12, -6],
        [14, -3],
        [17, 0],
        [14, 3],
        [-12, 4],
      ], STEEL);
      stripes(pen, -8, -1.5, 14, 1.4, WARN, DARK);
      windows(pen, 6, -2.4, 6, 2, 1.4, LIT);
      glow(pen, -17, 0, 2 + pose, LIT, 0.8);
      for (let i = 0; i < 2; i++) orb(pen, -6 + i * 8, -8, 1.2, 0.8, DARK, { line: 0.3 });
    }),
  s2: (pose) =>
    paint(80, 32, 40, 18, 219 + pose, P.ink, (pen) => {
      // 'crest': a long box hull with broadside rows and drop-pod tubes
      plate(pen, [
        [-36, -4],
        [-32, -10],
        [30, -10],
        [38, -4],
        [32, 4],
        [-32, 6],
      ], STEEL);
      plate(pen, [
        [-20, -10],
        [-18, -14],
        [10, -14],
        [12, -10],
      ], mix(STEEL, CONT[0], 0.3));
      block(pen, -30, -10, 8, 6, 3, mix(STEEL, [150, 160, 168], 0.2));
      windows(pen, -26, -2, 52, 10, 1.6, LIT);
      stripes(pen, -32, 1.5, 60, 1.6, WARN, DARK);
      glow(pen, -38, 0, 3 + pose, LIT, 0.8);
    }),
  s3: (pose) =>
    paint(150, 60, 75, 34, 221 + pose, P.ink, (pen) => {
      // 'new ark': the ark that brought them, rebuilt as a great warship (its bow gun charges)
      plate(pen, [
        [-70, -6],
        [-62, -18],
        [56, -18],
        [72, -6],
        [64, 8],
        [-62, 10],
      ], STEEL);
      for (let i = 0; i < 6; i++) block(pen, -50 + i * 16, -18, 12, 6, 4, CONT[i % CONT.length]);
      block(pen, -60, -18, 14, 12, 5, mix(STEEL, [150, 160, 168], 0.2));
      windows(pen, -58, -27, 10, 3, 1.8, LIT);
      windows(pen, -54, -4, 110, 22, 1.6, LIT);
      stripes(pen, -60, 4, 118, 2, WARN, DARK);
      plate(pen, [
        [60, -10],
        [76, -7],
        [76, -3],
        [60, -2],
      ], DARK);
      glow(pen, 77, -5, 2.4 + pose * 2.5, WARN, 0.9);
      glow(pen, -72, 0, 5, LIT, 0.8);
    }),
};
