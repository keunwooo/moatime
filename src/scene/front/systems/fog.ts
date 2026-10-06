/**
 * The fog of war: unexplored ground under a dense ink-and-paper fog, ground seen before under a dim
 * haze (its land and buildings show, its units do not), and what my bases and army see in the
 * clear. The scout's sweep in the opening lifts it across the map; every base and every site taken
 * keeps its ground seen. Drawn into a small canvas when what is seen changes, blurred, and laid
 * over the map.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import { HOME, OPEN, RELAND, NAT } from '../../../sim/front';
import { makeCanvas, type PaintCanvas } from '../../paint/brush';
import { css } from '../../paint/color';
import type { FrontFrame } from '../frame';
import { sitePos, type FrontLayout, type P } from '../layout';
import { FOG } from '../palette';

const FW = 240;
const FH = 135;
const SCOUT_MS = 90_000;

/** The scout's way across the map (home → left side → the rivals → right side → home). */
function scoutPath(L: FrontLayout, natSide: 0 | 1): P[] {
  const n = L.nat[natSide];
  const left = [L.sites[0], L.sites[2], L.sites[4], L.rivalHome[0]];
  const right = [L.rivalHome[1], L.sites[10], L.sites[8], L.sites[6]];
  const top = { x: 0.5, y: L.lake.c.y - L.lake.r.y - 0.06 };
  const path = [L.home, n, ...left, top, ...right, L.home];
  return natSide === 0 ? path : [L.home, n, ...[...right].reverse(), top, ...[...left].reverse(), L.home];
}

function along(path: P[], t: number): { p: P; seg: number } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    lens.push(l);
    total += l;
  }
  let d = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]) {
      const k = lens[i] > 0 ? d / lens[i] : 0;
      return { p: { x: path[i].x + (path[i + 1].x - path[i].x) * k, y: path[i].y + (path[i + 1].y - path[i].y) * k }, seg: i };
    }
    d -= lens[i];
  }
  return { p: path[path.length - 1], seg: lens.length - 1 };
}

export class FogSystem {
  readonly root = new Container();
  private pc: PaintCanvas;
  private tex: Texture;
  private sprite: Sprite;
  /** The fog canvas (the minimap shows it too). */
  get texture(): Texture {
    return this.tex;
  }
  private key = '';
  /** Is a screen point in the clear (units shown), in the haze (seen before) or unexplored? 0..2 */
  private vis = new Uint8Array(FW * FH);
  /** The scout's position this frame (map point), or null. */
  scout: P | null = null;

  constructor() {
    this.pc = makeCanvas(FW, FH);
    this.tex = Texture.from(this.pc.canvas);
    this.sprite = new Sprite(this.tex);
    this.root.addChild(this.sprite);
  }

  /** 0 clear, 1 seen before, 2 unexplored — at a screen point. */
  at(f: FrontFrame, x: number, y: number): number {
    const fx = Math.floor((x / f.w) * FW);
    const fy = Math.floor((y / f.h) * FH);
    if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return 0;
    return this.vis[fy * FW + fx];
  }

  update(f: FrontFrame) {
    const { v, L, w, h } = f;
    const p = v.planet;
    const A = v.A;
    const scoutStart = p.idx === 0 ? OPEN.scout : p.landAt + RELAND.scout;
    const sp = (A - scoutStart) / SCOUT_MS;
    const path = scoutPath(L, p.natSide);
    this.scout = sp > 0 && sp < 1 ? along(path, sp).p : null;
    // redraw only when what is seen changes (the scout moves in steps of 1%)
    const owned = v.owners.map((o) => (o === 0 ? 1 : 0)).join('');
    const rk = f.rally ? `${Math.round(f.rally.x * 60)},${Math.round(f.rally.y * 60)}` : "-";
    const key = `${p.idx}:${f.aspect}:${Math.round(Math.min(1, Math.max(0, sp)) * 100)}:${owned}:${v.bases.length}:${rk}:${(f.sight ?? []).length}`;
    this.sprite.width = w;
    this.sprite.height = h;
    const fullKey = f.allSeen ? `all:${p.idx}` : key;
    if (fullKey === this.key) return;
    this.key = fullKey;
    const ctx = this.pc.ctx;
    if (f.allSeen) {
      // a planet held for long: all of it is seen
      ctx.clearRect(0, 0, FW, FH);
      this.tex.source.update();
      this.vis.fill(0);
      return;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, FW, FH);
    // unexplored: dense fog everywhere
    ctx.fillStyle = css(FOG, 0.84);
    ctx.fillRect(0, 0, FW, FH);
    // a soft elliptical hole: r is a share of the map's width, squashed by the quarter view
    const hole = (c: P, r: number, keep: number) => {
      const x = c.x * FW;
      const y = c.y * FH;
      const R = r * FW;
      const ry = ((r * w * 0.62) / h) * FH;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / R);
      const g = ctx.createRadialGradient(0, 0, R * 0.35, 0, 0, R);
      g.addColorStop(0, `rgba(0,0,0,${keep})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    // seen before: thin the fog to a haze
    ctx.globalCompositeOperation = 'destination-out';
    hole(L.lake.c, L.lake.r.x * 1.25, 0.7);
    const seen = (c: P, r: number) => hole(c, r, 0.7);
    // the scout's sweep: a wide band along its way (the map opens as it goes)
    if (sp > 0) {
      const steps = Math.ceil(Math.min(1, sp) * 90);
      for (let i = 0; i <= steps; i++) seen(along(path, (i / 90) * Math.min(1, sp)).p, 0.2);
      // the middle of the map between the lake and home, once the scout is out (on a tall
      // screen the sweep's holes are flat and would leave this band in the fog)
      if (sp > 0.08) seen({ x: 0.5, y: (L.lake.c.y + L.lake.r.y + L.home.y) / 2 }, f.aspect === 'wide' ? 0.12 : 0.46);
    }
    for (let s = 0; s < 12; s++) if (v.since[s] >= 0 && v.owners[s] === 0) seen(sitePos(L, p.seed, s, p.natSide), 0.14);
    // in the clear: what my bases and my army see now
    const clear = (c: P, r: number) => hole(c, r, 1);
    for (const b of v.bases) {
      if (b.lost) continue;
      const at = b.site === HOME ? L.home : sitePos(L, p.seed, b.site, p.natSide);
      clear(at, b.site === HOME ? 0.2 : b.site === NAT ? 0.15 : 0.13);
    }
    if (f.rally) clear(f.rally, 0.13);
    if (this.scout) clear(this.scout, 0.1);
    for (const extra of f.sight ?? []) clear(extra, 0.12);
    ctx.globalCompositeOperation = 'source-over';
    this.tex.source.update();
    // read back the coverage for the units (0 clear, 1 seen, 2 unexplored)
    const data = ctx.getImageData(0, 0, FW, FH).data;
    for (let i = 0; i < FW * FH; i++) {
      const a = data[i * 4 + 3];
      this.vis[i] = a < 40 ? 0 : a < 150 ? 1 : 2;
    }
  }

  destroy() {
    this.tex.destroy(true);
  }
}
