/**
 * Landscape systems shared by both themes:
 *  - GroundSystem: world-fixed painted ground bands at regular depths. Farther bands are
 *    sparser (levels), so the number of bands stays bounded at any camera distance.
 *  - HazeSystem: translucent fog cards between depths → aerial perspective.
 *  - Backdrop: sky, sun glow, clouds and distant hills at camera-relative depths.
 *  - Overlay: light shafts, floating motes and a fixed paper texture over everything.
 */

import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { CardLayer, Projector, type Card, type Viewport } from './diorama';

export interface GroundTextures {
  /** Ridge edges (every third band). */
  edgeNear: Texture[];
  edgeFar: Texture[];
  /** Soft edges for the in-between bands. */
  softNear: Texture[];
  softFar: Texture[];
  bodyNear: Texture;
  bodyFar: Texture;
  /** World units covered by one horizontal period of the edge texture. */
  periodWU: number;
  /** World height of the edge texture. */
  edgeHeightWU: number;
  /** Ground line as a fraction of the edge texture height. */
  groundFrac: number;
  bodyPeriodWU: number;
  /** Optional snow-covered versions (faded in by `snow`). */
  snowEdge?: Texture[];
  snowSoft?: Texture[];
  snowBody?: Texture;
}

interface Band {
  n: number;
  card: Card;
  baseTint: number;
  appliedTint: number;
  edgeFar: TilingSprite;
  edgeNear: TilingSprite;
  bodyFar: TilingSprite;
  bodyNear: TilingSprite;
  phase: number;
  opaque: boolean;
  snowEdge: TilingSprite | null;
  snowBody: TilingSprite | null;
}

const BAND_SPACING = 110;
const LEVEL_MAX_DEPTH = [2300, 6800, 19000, 60000];

function levelOf(n: number): number {
  if (n % 27 === 0) return 3;
  if (n % 9 === 0) return 2;
  if (n % 3 === 0) return 1;
  return 0;
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class GroundSystem {
  private bands = new Map<number, Band>();
  private layer: CardLayer;
  private tex: GroundTextures;
  /** Depth range over which the near palette crossfades into the far palette. */
  nearFade: [number, number] = [500, 2600];

  constructor(layer: CardLayer, tex: GroundTextures) {
    this.layer = layer;
    this.tex = tex;
  }

  private make(n: number): Band {
    const t = this.tex;
    const ridge = levelOf(n) > 0;
    const nearSet = ridge ? t.edgeNear : t.softNear;
    const farSet = ridge ? t.edgeFar : t.softFar;
    const v = Math.floor(hash(n) * nearSet.length) % nearSet.length;
    const obj = new Container();
    const mk = (tex: Texture) => {
      const s = new TilingSprite({ texture: tex, width: 100, height: 100 });
      obj.addChild(s);
      return s;
    };
    const bodyFar = mk(t.bodyFar);
    const bodyNear = mk(t.bodyNear);
    const snowBody = t.snowBody ? mk(t.snowBody) : null;
    const edgeFar = mk(farSet[v]);
    const edgeNear = mk(nearSet[v]);
    const snowSet = ridge ? t.snowEdge : t.snowSoft;
    const snowEdge = snowSet && snowSet.length ? mk(snowSet[v % snowSet.length]) : null;
    // slight per-band value variation keeps neighbouring bands from repeating
    const tv = hash(n * 13 + 5);
    const tint = (Math.round(255 - tv * 8) << 16) | (Math.round(255 - tv * 6) << 8) | Math.round(255 - tv * 9);
    for (const s of [bodyFar, bodyNear, edgeFar, edgeNear]) s.tint = mulTint(tint, this.tint);
    for (const s of [snowBody, snowEdge]) if (s) s.visible = false;
    for (const e of [edgeFar, edgeNear, snowEdge]) {
      if (!e) continue;
      // Slightly less than one tile tall: the tiling shader wraps at exactly 1.0, which
      // would sample the transparent top row along the bottom edge (a thin bright seam).
      e.height = t.edgeHeightWU * 0.985;
      e.y = -t.edgeHeightWU * t.groundFrac;
      e.tileScale.set(t.periodWU / e.texture.width, t.edgeHeightWU / e.texture.height);
    }
    for (const b of [bodyFar, bodyNear, snowBody]) {
      if (!b) continue;
      b.y = t.edgeHeightWU * (1 - t.groundFrac) - 3;
      b.tileScale.set(t.bodyPeriodWU / b.texture.width);
    }
    const card: Card = {
      obj,
      X: 0,
      Y: 0,
      Z: n * BAND_SPACING,
      radius: 1e9,
      height: t.edgeHeightWU * t.groundFrac,
      order: -10,
      // Drawn as if 420 wu farther: a low, almost straight band edge in front of a tuft or
      // seedling would otherwise slice its base with a hard line.
      sortBias: 420,
    };
    this.layer.add(card);
    return { n, card, baseTint: tint, appliedTint: this.tint, edgeFar, edgeNear, bodyFar, bodyNear, phase: hash(n * 7 + 3) * t.periodWU, opaque: true, snowEdge, snowBody };
  }

  /** Overall colour of the ground (multiplied; e.g. a warmer autumn, a paler winter). */
  tint = 0xffffff;
  /** Snow on the ground (0..1): the snow-covered bands fade in over the grass. */
  snow = 0;

  update(p: Projector) {
    const t = this.tex;
    const minZ = p.camZ + p.near + 2;
    const maxZ = p.camZ + LEVEL_MAX_DEPTH[3];
    const n0 = Math.ceil(minZ / BAND_SPACING);
    const n1 = Math.floor(maxZ / BAND_SPACING);
    // remove out-of-range bands
    for (const [n, b] of this.bands) {
      const d = n * BAND_SPACING - p.camZ;
      if (n < n0 || n > n1 || d > LEVEL_MAX_DEPTH[levelOf(n)]) {
        this.layer.remove(b.card);
        this.bands.delete(n);
      }
    }
    for (let n = n0; n <= n1; n++) {
      const d = n * BAND_SPACING - p.camZ;
      if (d > LEVEL_MAX_DEPTH[levelOf(n)]) continue;
      if (!this.bands.has(n)) this.bands.set(n, this.make(n));
    }
    // geometry per band, near to far so each body knows the next nearer opaque band
    const sorted = [...this.bands.values()].sort((a, b) => a.n - b.n);
    let nearerGroundY = p.h + 4; // screen y of the next nearer opaque ground line
    for (const b of sorted) {
      if (b.appliedTint !== this.tint) {
        b.appliedTint = this.tint;
        const c = mulTint(b.baseTint, this.tint);
        for (const sp of [b.bodyFar, b.bodyNear, b.edgeFar, b.edgeNear]) sp.tint = c;
      }
      const Z = b.n * BAND_SPACING;
      const d = Z - p.camZ;
      const s = p.scale(Z);
      if (s <= 0) continue;
      const max = LEVEL_MAX_DEPTH[levelOf(b.n)];
      const fade = d > max * 0.72 ? Math.max(0, 1 - (d - max * 0.72) / (max * 0.28)) : 1;
      const nearIn = Math.min(1, Math.max(0, (d - p.near) / 40));
      const alpha = fade * nearIn;
      b.card.alpha = alpha;
      b.opaque = alpha >= 0.999;
      const [x0, x1] = p.visibleX(Z, 1.3);
      const width = x1 - x0;
      b.card.X = (x0 + x1) / 2;
      const tileX = -((x0 + b.phase) % t.periodWU);
      for (const e of [b.edgeFar, b.edgeNear, b.snowEdge]) {
        if (!e) continue;
        e.width = width;
        e.x = -width / 2;
        e.tilePosition.x = tileX;
      }
      const groundY = p.sy(0, Z);
      const bottomY = Math.max(groundY + 8, nearerGroundY + 14);
      const bodyH = Math.max(4, (bottomY - groundY) / s - t.edgeHeightWU * (1 - t.groundFrac) + 6);
      for (const body of [b.bodyFar, b.bodyNear, b.snowBody]) {
        if (!body) continue;
        body.width = width;
        body.x = -width / 2;
        body.height = bodyH;
        body.tilePosition.x = -((x0 + b.phase) % t.bodyPeriodWU);
      }
      const w = 1 - smooth(this.nearFade[0], this.nearFade[1], d);
      // Near and far palettes cross-fade with complementary opacity. (An opaque far strip under
      // a translucent near one doubles the soft top edge, which reads as a thin light seam.)
      b.edgeNear.alpha = w;
      b.bodyNear.alpha = w;
      b.edgeFar.alpha = 1 - w;
      b.bodyFar.alpha = 1 - w;
      b.edgeNear.visible = w > 0.002;
      b.bodyNear.visible = w > 0.002;
      b.edgeFar.visible = w < 0.998;
      b.bodyFar.visible = w < 0.998;
      // snow lies over both palettes; it takes the band's light like the grass under it
      const sn = this.snow;
      for (const sp of [b.snowEdge, b.snowBody]) {
        if (!sp) continue;
        sp.visible = sn > 0.005;
        sp.alpha = sn;
        if (sp.visible && sp.tint !== b.appliedTint) sp.tint = b.appliedTint;
      }
      if (b.opaque) nearerGroundY = Math.min(nearerGroundY, groundY);
    }
  }

  get count() {
    return this.bands.size;
  }

  destroy() {
    for (const b of this.bands.values()) this.layer.remove(b.card);
    this.bands.clear();
  }
}

function mulTint(a: number, b: number): number {
  const r = Math.round((((a >> 16) & 255) * ((b >> 16) & 255)) / 255);
  const g = Math.round((((a >> 8) & 255) * ((b >> 8) & 255)) / 255);
  const bl = Math.round(((a & 255) * (b & 255)) / 255);
  return (r << 16) | (g << 8) | bl;
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------

interface HazeCard {
  m: number;
  card: Card;
  sprite: TilingSprite;
  drift: number;
}

const HAZE_SPACING = 520;
const HAZE_MAX = [3200, 10000, 40000];

export class HazeSystem {
  private cards = new Map<number, HazeCard>();
  private layer: CardLayer;
  private tex: Texture;
  color: number;
  alpha: number;
  height: number;
  minDepth = 380;

  constructor(layer: CardLayer, tex: Texture, color: number, alpha: number, height = 300) {
    this.layer = layer;
    this.tex = tex;
    this.color = color;
    this.alpha = alpha;
    this.height = height;
  }

  private level(m: number) {
    return m % 9 === 0 ? 2 : m % 3 === 0 ? 1 : 0;
  }

  update(p: Projector, t: number) {
    const m0 = Math.ceil((p.camZ + this.minDepth) / HAZE_SPACING);
    const m1 = Math.floor((p.camZ + HAZE_MAX[2]) / HAZE_SPACING);
    for (const [m, h] of this.cards) {
      const d = m * HAZE_SPACING - p.camZ;
      if (m < m0 || m > m1 || d > HAZE_MAX[this.level(m)]) {
        this.layer.remove(h.card);
        this.cards.delete(m);
      }
    }
    for (let m = m0; m <= m1; m++) {
      const d = m * HAZE_SPACING - p.camZ;
      if (d > HAZE_MAX[this.level(m)]) continue;
      if (this.cards.has(m)) continue;
      const sprite = new TilingSprite({ texture: this.tex, width: 100, height: this.height * 0.99 });
      sprite.tint = this.color;
      const obj = new Container();
      obj.addChild(sprite);
      // the strip's fade-out bottom sits just under the ground line
      sprite.y = -this.height * 0.92;
      sprite.tileScale.set(1800 / this.tex.width, this.height / this.tex.height);
      const card: Card = { obj, X: 0, Y: 0, Z: m * HAZE_SPACING - 1, radius: 1e9, height: this.height, order: 5 };
      this.layer.add(card);
      this.cards.set(m, { m, card, sprite, drift: 6 + hash(m) * 10 });
    }
    for (const h of this.cards.values()) {
      const Z = h.card.Z;
      const d = Z - p.camZ;
      const max = HAZE_MAX[this.level(h.m)];
      const fadeIn = smooth(this.minDepth, this.minDepth + 500, d);
      const fadeOut = d > max * 0.7 ? Math.max(0, 1 - (d - max * 0.7) / (max * 0.3)) : 1;
      h.card.alpha = this.alpha * fadeIn * fadeOut;
      if (h.sprite.tint !== this.color) h.sprite.tint = this.color;
      const [x0, x1] = p.visibleX(Z, 1.3);
      h.sprite.width = x1 - x0;
      h.sprite.x = -(x1 - x0) / 2;
      h.card.X = (x0 + x1) / 2;
      h.sprite.tilePosition.x = -((x0 - t * h.drift + h.m * 377) % 1800);
    }
  }

  destroy() {
    for (const h of this.cards.values()) this.layer.remove(h.card);
    this.cards.clear();
  }
}

// ---------------------------------------------------------------------------

export interface HillLayerSpec {
  texture: Texture;
  /** Camera-relative depth. */
  depth: number;
  periodWU: number;
  heightWU: number;
  tint?: number;
  alpha?: number;
  /** Optional dressing drawn on the same ridge (memory forests, settlement lights). */
  dressing?: Texture;
  dressingAlpha?: number;
}

interface HillLayer {
  spec: HillLayerSpec;
  root: Container;
  body: TilingSprite;
  dressing: TilingSprite | null;
  phase: number;
}

/** Sky, glow and distant hills: everything at (near) infinity. */
export class Backdrop {
  readonly root = new Container();
  sky: Sprite;
  /** Fraction of the sky texture height that sits on the horizon. */
  skyHorizonFrac = 0.72;
  private hills: HillLayer[] = [];
  readonly glowLayer = new Container();

  constructor(skyTex: Texture) {
    this.sky = new Sprite(skyTex);
    this.root.addChild(this.sky);
    this.root.addChild(this.glowLayer);
  }

  addHill(spec: HillLayerSpec) {
    const root = new Container();
    const body = new TilingSprite({ texture: spec.texture, width: 100, height: spec.heightWU });
    body.tileScale.set(spec.periodWU / spec.texture.width, spec.heightWU / spec.texture.height);
    if (spec.tint !== undefined) body.tint = spec.tint;
    root.addChild(body);
    let dressing: TilingSprite | null = null;
    if (spec.dressing) {
      dressing = new TilingSprite({ texture: spec.dressing, width: 100, height: spec.heightWU });
      dressing.tileScale.copyFrom(body.tileScale);
      dressing.alpha = spec.dressingAlpha ?? 0;
      root.addChild(dressing);
    }
    root.alpha = spec.alpha ?? 1;
    this.root.addChild(root);
    const layer = { spec, root, body, dressing, phase: hash(this.hills.length + 17) * spec.periodWU };
    this.hills.push(layer);
    return layer;
  }

  /** Tint of every distant ridge (time of day, weather). */
  /** Tints the hills (and their dressing, unless it keeps its own colour, e.g. lights). */
  tintHills(color: number, dressing = color) {
    for (const h of this.hills) {
      const c = h.spec.tint !== undefined ? mulTint(h.spec.tint, color) : color;
      if (h.body.tint !== c) h.body.tint = c;
      if (h.dressing && h.dressing.tint !== dressing) h.dressing.tint = dressing;
    }
  }

  setDressingAlpha(i: number, a: number) {
    const h = this.hills[i];
    if (h?.dressing) h.dressing.alpha = a;
  }

  update(p: Projector, vp: Viewport) {
    const tex = this.sky.texture;
    const skyH = vp.h * 1.35;
    this.sky.width = vp.w;
    this.sky.height = skyH;
    this.sky.x = 0;
    this.sky.y = p.horizon - skyH * this.skyHorizonFrac;
    void tex;
    for (const h of this.hills) {
      const s = p.f / h.spec.depth;
      const halfW = vp.w / 2 / s;
      const x0 = p.camX - halfW * 1.1;
      const width = halfW * 2.2;
      h.root.scale.set(s);
      h.root.position.set(vp.w / 2 + (x0 - p.camX) * s, p.horizon + p.camH * s);
      for (const t of [h.body, h.dressing]) {
        if (!t) continue;
        t.width = width;
        t.height = h.spec.heightWU * 0.99;
        t.y = -h.spec.heightWU;
        t.tilePosition.x = -((x0 + h.phase) % h.spec.periodWU);
      }
    }
  }
}

// ---------------------------------------------------------------------------

export interface Mote {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  life: number;
}

/** Screen-space light: shafts and slow motes. The paper texture sits above all. */
export class Overlay {
  readonly root = new Container();
  readonly rays = new Container();
  readonly motes = new Container();
  paper: TilingSprite;
  private rayList: { s: Sprite; base: number; phase: number; speed: number; w: number }[] = [];
  private moteList: Mote[] = [];
  private moteTex: Texture | null = null;

  constructor(paperTex: Texture, paperAlpha: number) {
    this.paper = new TilingSprite({ texture: paperTex, width: 100, height: 100 });
    this.paper.blendMode = 'multiply';
    this.paper.alpha = paperAlpha;
    this.root.addChild(this.rays, this.motes, this.paper);
  }

  addRays(tex: Texture, count: number, alpha: number, tint: number) {
    for (let i = 0; i < count; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 0);
      s.blendMode = 'add';
      s.tint = tint;
      this.rays.addChild(s);
      this.rayList.push({ s, base: alpha * (0.6 + hash(i + 5) * 0.6), phase: hash(i + 9) * 6.28, speed: 0.05 + hash(i) * 0.06, w: 0.6 + hash(i + 2) * 1.2 });
    }
  }

  setMotes(tex: Texture, count: number) {
    this.moteTex = tex;
    for (const m of this.moteList) m.sprite.destroy();
    this.moteList = [];
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      this.motes.addChild(sprite);
      this.moteList.push({
        sprite,
        x: hash(i * 3 + 1),
        y: hash(i * 3 + 2),
        vx: (hash(i * 5) - 0.3) * 0.004,
        vy: -(0.002 + hash(i * 7) * 0.004),
        phase: hash(i * 11) * 6.28,
        size: 0.5 + hash(i * 13) * 0.9,
        life: hash(i * 17),
      });
    }
  }

  /** Sun position in screen fractions relative to the viewport; rays fan from it. */
  update(vp: Viewport, horizon: number, t: number, sun: { x: number; y: number }, rayAngle: number, moteRegion: { x0: number; x1: number; y0: number; y1: number }, dim = 1) {
    this.paper.width = vp.w;
    this.paper.height = vp.h;
    const sx = sun.x * vp.w;
    const sy = horizon * 0 + sun.y * vp.h;
    const len = Math.hypot(vp.w, vp.h) * 1.1;
    this.rayList.forEach((r, i) => {
      r.s.position.set(sx + (i - this.rayList.length / 2) * vp.w * 0.05, sy);
      r.s.height = len;
      r.s.width = vp.w * 0.07 * r.w;
      r.s.rotation = rayAngle + (i - (this.rayList.length - 1) / 2) * 0.11;
      const breath = 0.65 + 0.35 * Math.sin(t * r.speed + r.phase) * Math.sin(t * r.speed * 0.37 + r.phase * 2);
      r.s.alpha = r.base * breath * dim;
    });
    if (!this.moteTex) return;
    const w = moteRegion.x1 - moteRegion.x0;
    const h = moteRegion.y1 - moteRegion.y0;
    for (const m of this.moteList) {
      const px = (m.x + m.vx * t + 0.012 * Math.sin(t * 0.31 + m.phase)) % 1;
      const py = (((m.y + m.vy * t) % 1) + 1) % 1;
      m.sprite.position.set((moteRegion.x0 + ((px + 1) % 1) * w) * vp.w, (moteRegion.y0 + py * h) * vp.h);
      const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + m.life) + m.phase);
      // fade near the region edges so wrap-around never pops
      const edge = Math.min(py, 1 - py) * 6;
      m.sprite.alpha = Math.min(1, edge) * tw * 0.55 * dim;
      m.sprite.scale.set(m.size * Math.max(0.6, vp.h / 1080));
    }
  }
}
