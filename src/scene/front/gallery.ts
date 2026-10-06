/**
 * Dev only: every painted piece of a people's art laid out on one page (buildings, units in both
 * poses, ships), for checking the art without playing the war. `__moa.gallery(race)` in DEV.
 */

import type { RaceId } from '../../core/session';
import { ARMY_KINDS, SHIP_KINDS, BUILDING_NAME, UNIT_NAME, type BuildingKind, type UnitKind } from '../../sim/frontPlan';
import type { Art } from './paint/kit';
import { UNION_BUILDINGS, UNION_UNITS } from './paint/union';
import { MYCEL_BUILDINGS, MYCEL_UNITS } from './paint/mycel';
import { CHOIR_BUILDINGS, CHOIR_UNITS } from './paint/choir';

const BUILDINGS: BuildingKind[] = ['hq', 'outpost', 'supply', 'barracks', 'gas', 'wall', 'tech2', 'factory', 'airfield', 'tech3', 'shipyard', 'defense', 'spread'];
const UNITS: UnitKind[] = ['worker', 'scout', ...ARMY_KINDS, ...SHIP_KINDS];
const P = {
  0: { b: UNION_BUILDINGS, u: UNION_UNITS },
  1: { b: MYCEL_BUILDINGS, u: MYCEL_UNITS },
  2: { b: CHOIR_BUILDINGS, u: CHOIR_UNITS },
} as const;

/** Shows the gallery over the page (scale: on-screen size factor); call again to close. */
export function showGallery(race: RaceId, scale = 1.5): string {
  const id = 'front-gallery';
  const old = document.getElementById(id);
  if (old) {
    old.remove();
    return 'closed';
  }
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:auto;background:#c9a77f;padding:16px;display:flex;flex-wrap:wrap;gap:14px;align-content:flex-start;font:12px sans-serif;color:#222';
  const add = (art: Art, label: string) => {
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(255,255,255,0.18);padding:6px;border-radius:8px';
    const c = art.pc.canvas;
    const img = document.createElement('canvas');
    img.width = c.width;
    img.height = c.height;
    img.getContext('2d')!.drawImage(c, 0, 0);
    // the art is painted at 2 px per unit; show it at `scale` units → px
    img.style.width = `${(c.width / 2) * scale}px`;
    img.style.height = `${(c.height / 2) * scale}px`;
    // the anchor (ground contact point)
    const mark = document.createElement('div');
    mark.style.cssText = 'position:relative';
    mark.appendChild(img);
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;left:${(art.ax / 2) * scale - 2}px;top:${(art.ay / 2) * scale - 2}px;width:4px;height:4px;background:#e33;border-radius:2px`;
    mark.appendChild(dot);
    box.appendChild(mark);
    const t = document.createElement('div');
    t.textContent = label;
    box.appendChild(t);
    wrap.appendChild(box);
  };
  const p = P[race];
  for (const k of BUILDINGS) add(p.b[k](), `${k} · ${BUILDING_NAME[race][k]}`);
  for (const k of UNITS) {
    add(p.u[k](0), `${k} · ${UNIT_NAME[race][k]}`);
    add(p.u[k](1), `${k} (2)`);
  }
  document.body.appendChild(wrap);
  return 'open';
}
