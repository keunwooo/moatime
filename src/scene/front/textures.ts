/**
 * Textures of the front: the three peoples' art (painted once), small effect sprites, the paper and
 * the vignette, and each planet's ground (painted when first needed for a viewport shape, a few
 * kept).
 */

import type { Texture } from 'pixi.js';
import type { RaceId } from '../../core/session';
import { ARMY_KINDS, SHIP_KINDS, type BuildingKind, type UnitKind } from '../../sim/frontPlan';
import type { BiomeId } from '../../sim/frontPlan';
import { glowTexture, makeCanvas, releaseTexture, softEllipse, toTexture } from '../paint/brush';
import { css, hex } from '../paint/color';
import { paintPaper } from '../paint/landscape';
import type { Art } from './paint/kit';
import { UNION_BUILDINGS, UNION_UNITS } from './paint/union';
import { MYCEL_BUILDINGS, MYCEL_UNITS } from './paint/mycel';
import { CHOIR_BUILDINGS, CHOIR_UNITS } from './paint/choir';
import { paintTerrain, type TerrainSpec } from './paint/terrain';
import type { FrontLayout } from './layout';

export interface ArtTex {
  tex: Texture;
  /** Anchor (ground contact point) as a share of the texture size. */
  ax: number;
  ay: number;
  /** Canvas size in px (art units × PX). */
  w: number;
  h: number;
}

export interface RaceTex {
  b: Record<BuildingKind, ArtTex>;
  u: Record<UnitKind, [ArtTex, ArtTex]>;
}

export interface FrontTextures {
  race: [RaceTex, RaceTex, RaceTex];
  glow: Texture;
  ember: Texture;
  smoke: Texture;
  shadow: Texture;
  dot: Texture;
  streak: Texture;
  paper: Texture;
  vignette: Texture;
  all: Texture[];
  /** Painted grounds, newest last (kept to a few). */
  grounds: { key: string; tex: Texture }[];
}

const BUILDINGS: BuildingKind[] = ['hq', 'outpost', 'supply', 'barracks', 'gas', 'wall', 'tech2', 'factory', 'airfield', 'tech3', 'shipyard', 'defense', 'spread'];
const UNITS: UnitKind[] = ['worker', 'scout', ...ARMY_KINDS, ...SHIP_KINDS];

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function artTex(a: Art, label: string, all: Texture[]): ArtTex {
  const tex = toTexture(a.pc, { label, mipmaps: true });
  all.push(tex);
  return { tex, ax: a.ax / a.pc.w, ay: a.ay / a.pc.h, w: a.pc.w, h: a.pc.h };
}

const PAINTERS: Record<RaceId, { b: Record<BuildingKind, () => Art>; u: Record<UnitKind, (pose: 0 | 1) => Art> }> = {
  0: { b: UNION_BUILDINGS, u: UNION_UNITS },
  1: { b: MYCEL_BUILDINGS, u: MYCEL_UNITS },
  2: { b: CHOIR_BUILDINGS, u: CHOIR_UNITS },
};

async function raceTex(race: RaceId, all: Texture[]): Promise<RaceTex> {
  const P = PAINTERS[race];
  const b = {} as Record<BuildingKind, ArtTex>;
  for (const k of BUILDINGS) b[k] = artTex(P.b[k](), `front-${race}-${k}`, all);
  await tick();
  const u = {} as Record<UnitKind, [ArtTex, ArtTex]>;
  for (const k of UNITS) u[k] = [artTex(P.u[k](0), `front-${race}-${k}-0`, all), artTex(P.u[k](1), `front-${race}-${k}-1`, all)];
  await tick();
  return { b, u };
}

export async function buildFrontTextures(lowPower: boolean): Promise<FrontTextures> {
  const all: Texture[] = [];
  const T = (t: Texture) => {
    all.push(t);
    return t;
  };
  const race: [RaceTex, RaceTex, RaceTex] = [await raceTex(0, all), await raceTex(1, all), await raceTex(2, all)];
  const glow = T(glowTexture(64, hex('#f4d29c'), 0.55, 'front-glow'));
  const ember = T(glowTexture(32, hex('#f2a35a'), 0.4, 'front-ember'));
  // a soft grey puff (smoke, dust), tinted per use
  const sm = makeCanvas(64, 64);
  softEllipse(sm.ctx, 32, 32, 30, 30, [210, 205, 200], 0.6, 0, 1);
  const smoke = T(toTexture(sm, { label: 'front-smoke' }));
  const sh = makeCanvas(64, 32);
  softEllipse(sh.ctx, 32, 16, 30, 14, [28, 26, 34], 0.55, 0, 1);
  const shadow = T(toTexture(sh, { label: 'front-shadow' }));
  const d = makeCanvas(8, 8);
  d.ctx.fillStyle = css([255, 248, 236]);
  d.ctx.beginPath();
  d.ctx.arc(4, 4, 3.2, 0, Math.PI * 2);
  d.ctx.fill();
  const dot = T(toTexture(d, { label: 'front-dot' }));
  // a thin soft streak (tracers, beams), drawn along +x
  const st = makeCanvas(64, 8);
  const g = st.ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,240,220,0)');
  g.addColorStop(0.7, 'rgba(255,240,220,0.85)');
  g.addColorStop(1, 'rgba(255,250,240,1)');
  st.ctx.fillStyle = g;
  st.ctx.fillRect(0, 2.5, 64, 3);
  const streak = T(toTexture(st, { label: 'front-streak' }));
  const paper = T(toTexture(paintPaper(0x5e11, hex('#8a7a6a')), { label: 'front-paper', repeat: 'xy' }));
  const vg = makeCanvas(256, 256);
  const vgr = vg.ctx.createRadialGradient(128, 128, 60, 128, 128, 182);
  vgr.addColorStop(0, 'rgba(14,12,20,0)');
  vgr.addColorStop(1, `rgba(14,12,20,${lowPower ? 0.4 : 0.48})`);
  vg.ctx.fillStyle = vgr;
  vg.ctx.fillRect(0, 0, 256, 256);
  const vignette = T(toTexture(vg, { label: 'front-vignette' }));
  return { race, glow, ember, smoke, shadow, dot, streak, paper, vignette, all, grounds: [] };
}

/** The ground of a planet for a viewport shape (painted now if it is not kept). */
export function groundTex(t: FrontTextures, spec: Omit<TerrainSpec, 'w' | 'h'> & { w: number; h: number; L: FrontLayout }, idx: number): Texture {
  const key = `${idx}:${spec.biome}:${spec.w}x${spec.h}`;
  const hit = t.grounds.find((g) => g.key === key);
  if (hit) return hit.tex;
  const pc = paintTerrain(spec);
  const tex = toTexture(pc, { label: `front-ground-${key}`, mipmaps: true });
  t.grounds.push({ key, tex });
  while (t.grounds.length > 3) releaseTexture(t.grounds.shift()!.tex);
  return tex;
}

export function releaseFrontTextures(t: FrontTextures) {
  for (const x of t.all) releaseTexture(x);
  for (const g of t.grounds) releaseTexture(g.tex);
  t.all.length = 0;
  t.grounds.length = 0;
}

export type { BiomeId };
