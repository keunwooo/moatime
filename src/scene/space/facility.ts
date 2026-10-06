/**
 * One colony building, drawn as a pure function of its visual progress u ∈ [0, 1], which the
 * simulation derives from the assembly stage in progress (see SPACE.stages):
 *
 *  0.00 – 0.07  marking: a drone scans the plot; the outline and corner stakes appear
 *  0.07 – 0.20  foundation: the six plates of a hexagonal pad settle one by one
 *  0.20 – 0.27  floor frame: the ring beam and cross beams on the pad
 *  0.27 – 0.45  frame ribs rise from the joints on the floor
 *  0.45 – 0.70  wall panels attach strip by strip, bottom up
 *  0.70 – 0.85  equipment: the generator's core lights up, masts and dish, the drill rod, the
 *               defence head's emitters, the barracks flag, the command cab's beacon…
 *  0.85 – 0.92  power: the windows light up one by one
 *  0.92 – 1.00  inspection (the rover scans; nothing new appears)
 *
 * Nothing fades in as a whole: every part grows from its joint, and the ground shadow and pad
 * are there before anything stands on them.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { Rng } from '../../core/rng';
import { mix, num } from '../paint/color';
import { FAC_PX, type FacilityArt } from './paint';
import { S, type FacilityKind } from './palette';
import type { FacilityTex, SpaceTextures } from './textures';

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const easeOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
};

interface Strip {
  x0: number;
  x1: number;
  u0: number;
  u1: number;
}

export class Facility {
  readonly root = new Container();
  readonly ground = new Container();
  readonly kind: FacilityKind;
  readonly art: FacilityArt;
  private body: Sprite;
  private mask = new Graphics();
  private ribs = new Graphics();
  private stakes = new Graphics();
  private survey = new Graphics();
  private padG = new Graphics();
  private pool: Sprite;
  /** The generator's energy core glow and the field ring that rides up and down it. */
  private core: Sprite | null = null;
  private coreRing: Graphics | null = null;
  private mast = new Graphics();
  /** Equipment shapes (drill rod, flag pole, antenna), redrawn only as the build progresses. */
  private equip = new Graphics();
  /** The moving part (drill head, emitters, flag), only transformed each frame. */
  private mover = new Graphics();
  private equipBase = 0;
  /** Raid damage (0 none … 4 critical) drawn over the finished building. */
  private dmg = new Container();
  private dmgG = new Graphics();
  private smokes: Sprite[] = [];
  private fire: Sprite;
  private dmgLevel = 0;
  private dmgKey = -1;
  private equipT = 0;
  private equipMotion = false;
  private dish: Sprite | null = null;
  private beacon: Sprite | null = null;
  private windows: { s: Sprite; u0: number; phase: number; r: number }[] = [];
  private strips: Strip[] = [];
  private arrive: number;
  private padU0: number;
  private lastU = -1;
  u = 0;
  private glowBoost = 0;
  readonly width: number;

  constructor(seed: number, kind: FacilityKind, tex: SpaceTextures) {
    this.kind = kind;
    const r = new Rng(seed);
    const variants = tex.facilities[kind];
    const ft: FacilityTex = variants[Math.floor(r.next() * variants.length)];
    this.art = ft.art;
    const a = this.art;
    this.width = kind === 'relay' ? 90 : a.w;
    this.arrive = 0;
    this.padU0 = 0.07;

    this.body = new Sprite(ft.body);
    this.body.anchor.set(a.ax / ft.body.width, a.ay / ft.body.height);
    this.body.scale.set(1 / FAC_PX);
    this.body.mask = this.mask;

    // shell strips: from the center outward, each grows from its base joint upward
    const n = kind === 'comms' || kind === 'power' || kind === 'relay' || kind === 'turret' ? 4 : 7;
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => Math.abs(p - (n - 1) / 2) - Math.abs(q - (n - 1) / 2));
    const span = 0.7 - 0.45;
    const win = (span / n) * 1.6;
    order.forEach((i, k) => {
      const x0 = -a.w / 2 - 4 + ((a.w + 8) * i) / n;
      const x1 = -a.w / 2 - 4 + ((a.w + 8) * (i + 1)) / n;
      const u0 = 0.45 + (k / n) * (span - win);
      this.strips.push({ x0, x1, u0, u1: u0 + win });
    });

    this.dmg.addChild(this.dmgG);
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(tex.dust);
      s.anchor.set(0.5);
      s.tint = 0x625c70;
      s.visible = false;
      this.smokes.push(s);
      this.dmg.addChild(s);
    }
    this.fire = new Sprite(tex.windowGlow);
    this.fire.anchor.set(0.5);
    this.fire.blendMode = 'add';
    this.fire.tint = 0xff9a50;
    this.fire.visible = false;
    this.dmg.addChild(this.fire);

    this.pool = new Sprite(tex.poolGlow);
    this.pool.anchor.set(0.5);
    this.pool.blendMode = 'add';
    this.pool.scale.set((a.w * 1.9) / 256, (a.w * 1.9) / 256);
    this.pool.alpha = 0;
    this.ground.addChild(this.survey, this.padG, this.pool);

    this.root.addChild(this.stakes, this.ribs, this.mast, this.body, this.mask, this.equip, this.mover, this.dmg);

    if (kind === 'power') {
      this.core = new Sprite(tex.windowGlow);
      this.core.anchor.set(0.5);
      this.core.blendMode = 'add';
      this.core.tint = num(S.energy);
      this.core.position.set(0, -51);
      this.core.scale.set(0.95, 1.5);
      this.core.visible = false;
      this.coreRing = new Graphics();
      this.coreRing.ellipse(0, 0, 15, 3.2).stroke({ color: num(S.energy), width: 2, alpha: 0.9 });
      this.coreRing.visible = false;
      this.root.addChild(this.core, this.coreRing);
    }
    if (kind === 'comms' || kind === 'relay' || kind === 'command') {
      this.beacon = new Sprite(tex.windowGlow);
      this.beacon.anchor.set(0.5);
      this.beacon.blendMode = 'add';
      this.beacon.scale.set(0.3);
    }
    if (kind === 'comms') {
      this.dish = new Sprite(tex.dish);
      this.dish.anchor.set(0.5, 92 / 96);
      this.dish.scale.set(0.5);
      this.root.addChild(this.dish);
    }
    if (this.beacon) this.root.addChild(this.beacon);
    a.windows.forEach((w, i) => {
      const s = new Sprite(tex.windowGlow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.scale.set((w.r * 4.2) / 64);
      s.position.set(w.x, w.y);
      s.alpha = 0;
      this.root.addChild(s);
      this.windows.push({ s, u0: 0.855 + (i / Math.max(1, a.windows.length)) * 0.05, phase: r.range(0, 6.28), r: w.r });
    });
  }

  setProgress(u: number) {
    const uu = Math.min(1, Math.max(0, u));
    this.u = uu;
    if (Math.abs(uu - this.lastU) < 0.0002 && this.lastU >= 0) return;
    this.lastU = uu;
    this.layout(uu);
  }

  private layout(u: number) {
    const a = this.art;
    const R = this.width * 0.62;
    // survey ring on the ground (flat card coordinates: x right, y toward the far side)
    const sg = this.survey;
    sg.clear();
    const s0 = this.arrive;
    const sp = smooth(s0, s0 + 0.06, u);
    const fadeSurvey = 1 - smooth(0.3, 0.45, u);
    if (sp > 0 && fadeSurvey > 0) {
      // a chalk wash inside the plot, then the dashed outline painted around it
      sg.ellipse(0, 0, R, R * 0.62).fill({ color: num(S.sandLight), alpha: 0.22 * sp * fadeSurvey });
      const dashes = 28;
      const shown = Math.floor(dashes * sp);
      for (let i = 0; i < shown; i++) {
        const t0 = (i / dashes) * Math.PI * 2;
        const t1 = t0 + (Math.PI * 2) / dashes / 1.6;
        sg.moveTo(Math.cos(t0) * R, Math.sin(t0) * R * 0.62)
          .lineTo(Math.cos(t1) * R, Math.sin(t1) * R * 0.62)
          .stroke({ color: num(S.window), width: 4.2, alpha: 0.9 * fadeSurvey });
      }
    }
    // stakes with tiny lights at four corners (upright)
    const st = this.stakes;
    st.clear();
    if (sp > 0 && fadeSurvey > 0) {
      for (let i = 0; i < 4; i++) {
        const k = smooth(i * 0.22, i * 0.22 + 0.3, sp);
        if (k <= 0) continue;
        const x = (i % 2 ? 1 : -1) * R * 0.88;
        const h = 20 * k;
        st.moveTo(x, 0).lineTo(x, -h).stroke({ color: num(S.metal), width: 2, alpha: fadeSurvey });
        st.circle(x, -h, 2.6).fill({ color: num(S.window), alpha: fadeSurvey * k });
      }
    }
    // the six plates of a hexagonal pad, each lowered into place, with a light at its corner
    const pg = this.padG;
    pg.clear();
    const segs = 6;
    const padSpan = 0.2 - this.padU0;
    const hexR = a.w * 0.58;
    const corner = (j: number, rr: number) => {
      const ang = (j / segs) * Math.PI * 2;
      return [Math.cos(ang) * rr, Math.sin(ang) * rr * 0.62];
    };
    for (let i = 0; i < segs; i++) {
      const u0 = this.padU0 + (i / segs) * padSpan * 0.8;
      const k = easeOut((u - u0) / (padSpan * 0.25));
      if (k <= 0) continue;
      const rr = hexR * (0.7 + 0.3 * k);
      const [x0, y0] = corner(i, rr);
      const [x1, y1] = corner(i + 1, rr);
      pg.poly([0, 0, x0, y0, x1, y1]).fill({ color: num(i % 2 ? mix(S.hullShadow, S.sandLight, 0.45) : mix(S.hullShadow, S.sand, 0.4)), alpha: 0.95 * k });
      pg.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: num(S.armor), width: 2.4, alpha: 0.85 * k });
      pg.moveTo(0, 0).lineTo(x0, y0).stroke({ color: num(S.armor), width: 1.2, alpha: 0.5 * k });
      pg.circle(x0, y0, 3.2).fill({ color: num(S.energy), alpha: 0.9 * k });
    }
    // floor frame: the edge beam is laid around the pad, then two cross beams
    if (u > 0.2) {
      const k = Math.min(1, (u - 0.2) / 0.05);
      const rr = hexR;
      const ring: number[] = [];
      const steps = Math.max(1, Math.round(segs * k * 4));
      for (let j = 0; j <= steps; j++) {
        const t = j / 4;
        const a0 = Math.floor(t);
        const f = t - a0;
        const [ax0, ay0] = corner(a0, rr);
        const [ax1, ay1] = corner(a0 + 1, rr);
        ring.push(ax0 + (ax1 - ax0) * f, ay0 + (ay1 - ay0) * f);
      }
      pg.poly(ring, false).stroke({ color: num(S.team), width: 3, alpha: 0.8 });
      const cross = smooth(0.25, 0.27, u);
      if (cross > 0) {
        pg.moveTo(-rr * cross, 0).lineTo(rr * cross, 0).stroke({ color: num(S.metal), width: 2.2, alpha: 0.75 });
        pg.moveTo(0, -rr * 0.62 * cross).lineTo(0, rr * 0.62 * cross).stroke({ color: num(S.metal), width: 2.2, alpha: 0.75 });
      }
    }

    // ribs rising from the joints on the floor frame
    const rg = this.ribs;
    rg.clear();
    const rib = smooth(0.27, 0.45, u);
    // the scaffold steps back as the shell closes and is gone once the equipment is in
    const ribFade = 1 - smooth(0.62, 0.8, u);
    if (rib > 0) {
      const color = num(S.metal);
      if (a.shape === 'dome') {
        const rx = a.w / 2 - 6;
        const ry = a.h - a.baseH;
        const n = 6;
        for (let i = 0; i <= n; i++) {
          // meridian seen from the side: starts at its joint on the ring, ends at the apex
          const bx = -rx + (2 * rx * i) / n;
          const k = smooth(Math.abs(i - n / 2) * 0.05, 0.7 + Math.abs(i - n / 2) * 0.05, rib);
          if (k <= 0) continue;
          const pts: number[] = [];
          const m = 12;
          for (let j = 0; j <= m; j++) {
            const t = (j / m) * k;
            pts.push(bx * Math.cos((t * Math.PI) / 2), -a.baseH - ry * Math.sin((t * Math.PI) / 2));
          }
          rg.poly(pts, false).stroke({ color, width: 2.2, alpha: ribFade });
        }
        rg.moveTo(-a.w / 2, -a.baseH).lineTo(-a.w / 2 + a.w * rib, -a.baseH).stroke({ color, width: 2.4, alpha: ribFade });
      } else {
        const posts = a.shape === 'tower' ? 4 : 5;
        const top = a.shape === 'tower' ? a.baseH : a.h;
        for (let i = 0; i < posts; i++) {
          const x = -a.w / 2 + 4 + ((a.w - 8) * i) / (posts - 1);
          const k = smooth(i * 0.08, 0.55 + i * 0.08, rib);
          if (k <= 0) continue;
          rg.moveTo(x, 0).lineTo(x, -top * k).stroke({ color, width: 2.4, alpha: ribFade });
        }
        const beam = smooth(0.6, 1, rib);
        if (beam > 0) rg.moveTo(-a.w / 2 + 4, -top).lineTo(-a.w / 2 + 4 + (a.w - 8) * beam, -top).stroke({ color, width: 2.4, alpha: ribFade });
        if (a.shape === 'tower') {
          const dk = smooth(0.7, 1, rib);
          if (dk > 0) rg.arc(0, -a.baseH, 46, Math.PI, Math.PI + Math.PI * dk).stroke({ color, width: 2.2, alpha: ribFade });
        }
      }
    }

    // shell strips revealed from the base up through the mask
    const mg = this.mask;
    mg.clear();
    let any = false;
    for (const s of this.strips) {
      const k = easeOut((u - s.u0) / (s.u1 - s.u0));
      if (k <= 0) continue;
      any = true;
      const h = (a.h + 14) * k;
      mg.rect(s.x0, -h, s.x1 - s.x0 + 0.6, h + 16).fill({ color: 0xffffff });
    }
    this.body.visible = any;

    // equipment
    if (this.core && this.coreRing) {
      // the core charges up during the equipment stage; its field ring starts with the power
      const k = smooth(0.7, 0.85, u);
      this.core.visible = k > 0;
      this.core.alpha = 0.75 * k;
      this.coreRing.visible = u >= 0.85;
      this.coreRing.y = -52;
    }
    if (this.kind === 'comms') {
      const mk = smooth(0.7, 0.77, u);
      this.mast.clear();
      if (mk > 0) {
        this.mast.moveTo(10, -a.h).lineTo(10, -a.h - 70 * mk).stroke({ color: num(S.metal), width: 3 });
        for (let y = 12; y < 70 * mk; y += 12) {
          this.mast.moveTo(6, -a.h - y).lineTo(14, -a.h - y - 6).stroke({ color: num(S.metal), width: 1.2, alpha: 0.8 });
        }
      }
      const dk = easeOut((u - 0.77) / 0.04);
      if (this.dish) {
        this.dish.visible = dk > 0;
        this.dish.alpha = Math.min(1, dk * 2);
        this.dish.position.set(10, -a.h - 70 * mk);
        this.dish.scale.set(0.5 * (0.4 + 0.6 * dk));
      }
      if (this.beacon) {
        this.beacon.visible = dk > 0;
        this.beacon.position.set(10, -a.h - 70 * mk - 22);
      }
    }

    if (this.kind === 'relay') {
      // a tall lattice mast rises section by section
      const mk = smooth(0.7, 0.8, u);
      const H = 110 * mk;
      const g = this.mast;
      g.clear();
      if (mk > 0) {
        const c = num(S.metal);
        g.moveTo(-5, -a.h).lineTo(-2, -a.h - H).stroke({ color: c, width: 2.2 });
        g.moveTo(5, -a.h).lineTo(2, -a.h - H).stroke({ color: c, width: 2.2 });
        for (let y = 10; y < H - 4; y += 10) {
          const w0 = 5 - (3 * y) / 110;
          const w1 = 5 - (3 * (y + 10)) / 110;
          g.moveTo(-w0, -a.h - y).lineTo(w1, -a.h - y - 10).stroke({ color: c, width: 1, alpha: 0.8 });
        }
        // small panels halfway up
        if (mk > 0.6) g.rect(3, -a.h - 62, 9, 12).fill({ color: num(S.panel), alpha: 0.9 }).rect(-12, -a.h - 76, 9, 12).fill({ color: num(S.panel), alpha: 0.9 });
      }
      if (this.beacon) {
        this.beacon.visible = mk >= 1;
        this.beacon.position.set(0, -a.h - 112);
      }
    }
    if (this.kind === 'command' && this.beacon) {
      this.beacon.visible = u >= 0.8;
      this.beacon.position.set(0, -a.h - 12);
    }
    this.drawEquip();

    // lights
    for (const w of this.windows) {
      const k = smooth(w.u0, w.u0 + 0.012, u);
      w.s.alpha = k * 0.9;
      w.s.visible = k > 0;
    }
    this.pool.alpha = smooth(0.86, 0.92, u) * 0.28;
  }

  /**
   * Equipment of the kinds that move once installed: the extractor's drill head works up and
   * down, the defence head's emitters sweep slowly, the barracks flag waves, the command cab
   * has an antenna whip. Each part grows from its joint during the equipment stage. Shapes are
   * drawn here when the progress changes; `animateEquip` only moves them.
   */
  private drawEquip() {
    const g = this.equip;
    const m = this.mover;
    const u = this.u;
    const a = this.art;
    g.clear();
    m.clear();
    m.visible = false;
    if (this.kind === 'extractor') {
      // the rod slides down the derrick; the head rides on it
      const k = smooth(0.7, 0.8, u);
      if (k <= 0) return;
      g.moveTo(0, -104).lineTo(0, -40 - 34 * (1 - k)).stroke({ color: num(S.metal), width: 2.2 });
      m.roundRect(-7, -4, 14, 10, 3).fill({ color: num(S.hullShadow) });
      m.rect(-3, 6, 6, 4).fill({ color: num(S.apricot), alpha: 0.9 });
      m.visible = true;
      this.equipBase = -45 - 34 * (1 - k);
    } else if (this.kind === 'turret') {
      // two short emitter tubes on the head (they sweep, never point at anything)
      const k = smooth(0.7, 0.82, u);
      if (k <= 0) return;
      const L = 26 * k;
      for (const off of [-3.2, 3.2]) {
        m.moveTo(14, off).lineTo(14 + L, off).stroke({ color: num(S.hullShadow), width: 3.4, cap: 'round' });
        m.moveTo(14, off).lineTo(14 + L, off).stroke({ color: num(S.hull), width: 1.4, cap: 'round', alpha: 0.9 });
      }
      m.position.set(0, -40);
      m.visible = true;
    } else if (this.kind === 'barracks') {
      // a flag mast at the end of the hall
      const k = smooth(0.7, 0.8, u);
      if (k <= 0) return;
      const x = a.w / 2 - 12;
      const top = -a.h - 38 * k;
      g.moveTo(x, -a.h + 2).lineTo(x, top).stroke({ color: num(S.metal), width: 1.8 });
      if (k >= 1) {
        m.rect(1, 1, 22, 12).fill({ color: num(S.panel), alpha: 0.96 });
        m.rect(1, 5.5, 22, 3).fill({ color: num(S.hull), alpha: 0.96 });
        m.position.set(x, top);
        m.visible = true;
      }
    } else if (this.kind === 'command') {
      const k = smooth(0.72, 0.8, u);
      if (k <= 0) return;
      g.moveTo(16, -a.h + 2).lineTo(18, -a.h - 22 * k).stroke({ color: num(S.metal), width: 1.4 });
    }
    this.animateEquip(this.equipT, this.equipMotion);
  }

  /** Moves the live equipment (no redrawing). */
  private animateEquip(t: number, motion: boolean) {
    this.equipT = t;
    this.equipMotion = motion;
    const m = this.mover;
    if (!m.visible) return;
    const live = motion && this.u >= 0.92;
    if (this.kind === 'extractor') m.y = this.equipBase - 10 * (live ? 0.5 + 0.5 * Math.sin(t * 1.6) : 0.5);
    else if (this.kind === 'turret') m.rotation = live ? Math.sin(t * 0.21) * 0.32 : 0;
    else if (this.kind === 'barracks') {
      m.skew.y = live ? Math.sin(t * 2.2) * 0.12 : 0;
      m.scale.x = live ? 1 - 0.06 * (0.5 + 0.5 * Math.sin(t * 2.2 + 1.3)) : 1;
    }
  }

  /**
   * Raid damage: scorch marks and a knocked-loose panel (1), smoke from the roof (2), a flicker
   * of fire and windows going dark (3), most lights out with the frame showing (4). Fractional
   * levels fade it out as a repair goes on.
   */
  setDamage(level: number) {
    const lv = Math.max(0, Math.min(4, level));
    this.dmgLevel = lv;
    const key = Math.round(lv * 4);
    if (key === this.dmgKey) return;
    this.dmgKey = key;
    const g = this.dmgG;
    const a = this.art;
    g.clear();
    this.dmg.visible = lv > 0.05;
    if (!this.dmg.visible) return;
    const k1 = Math.min(1, lv);
    // soft scorch: a few nested washes rather than one hard blot
    const scorch = (x: number, y: number, rx: number, ry: number, a0: number) => {
      for (let i = 0; i < 3; i++) g.ellipse(x, y, rx * (1 - i * 0.28), ry * (1 - i * 0.28)).fill({ color: 0x3a3346, alpha: a0 * 0.4 });
    };
    scorch(-a.w * 0.2, -a.h * 0.42, a.w * 0.14, a.h * 0.13, 0.5 * k1);
    scorch(a.w * 0.24, -a.h * 0.3, a.w * 0.1, a.h * 0.1, 0.4 * k1);
    if (lv >= 0.8) {
      // a dented panel, pushed a little out of line, with a crack beside it
      const x = a.w * 0.06;
      const y = -a.h * 0.64;
      g.poly([x, y, x + 15, y + 3, x + 14, y + 12, x - 1, y + 9]).fill({ color: num(S.hullShadow), alpha: 0.75 * k1 });
      g.moveTo(x - 6, y + 13).lineTo(x + 2, y + 17).lineTo(x + 9, y + 15).stroke({ color: 0x3a3346, width: 1.2, alpha: 0.7 * k1 });
    }
    if (lv >= 2.5) {
      const k3 = Math.min(1, lv - 2.5);
      for (const [x0, y0, x1, y1] of [
        [-a.w * 0.3, -a.h * 0.6, -a.w * 0.12, -a.h * 0.38],
        [a.w * 0.15, -a.h * 0.5, a.w * 0.32, -a.h * 0.28],
      ]) {
        g.moveTo(x0, y0).lineTo((x0 + x1) / 2 + 4, (y0 + y1) / 2 - 3).lineTo(x1, y1).stroke({ color: 0x3a3346, width: 1.4, alpha: 0.75 * k3 });
      }
    }
    if (lv >= 3.5) {
      // the shell is open in a ragged patch and the frame shows through
      const k4 = Math.min(1, (lv - 3.5) * 2);
      const cx = -a.w * 0.25;
      const cy = -a.h * 0.66;
      const w = a.w * 0.12;
      const h = a.h * 0.15;
      g.poly([cx - w, cy - h * 0.6, cx - w * 0.3, cy - h, cx + w * 0.5, cy - h * 0.8, cx + w, cy - h * 0.1, cx + w * 0.7, cy + h, cx - w * 0.2, cy + h * 0.8, cx - w * 0.9, cy + h * 0.4]).fill({ color: 0x3b3450, alpha: 0.6 * k4 });
      g.moveTo(cx - w * 0.9, cy).lineTo(cx + w * 0.9, cy).stroke({ color: num(S.metal), width: 1.6, alpha: 0.9 * k4 });
      g.moveTo(cx, cy - h * 0.9).lineTo(cx, cy + h * 0.8).stroke({ color: num(S.metal), width: 1.6, alpha: 0.9 * k4 });
    }
  }

  /** Ambient life: gentle window breathing, wings tracking the sun, the dish turning. */
  ambient(t: number, motion: boolean, wt: number, observe = 0) {
    const lv = this.dmgLevel;
    if (lv > 0.05) {
      const a = this.art;
      const smoke = Math.min(1, Math.max(0, lv - 1.5));
      this.smokes.forEach((s, i) => {
        s.visible = smoke > 0;
        if (!s.visible) return;
        const q = ((motion ? t * 0.35 : 0.3) + i / 3) % 1;
        s.position.set(-a.w * 0.12 + q * 10 + i * 3, -a.h - 4 - q * 38);
        s.scale.set(0.3 + q * 0.6);
        s.alpha = Math.sin(q * Math.PI) * 0.55 * smoke;
      });
      const fire = Math.min(1, Math.max(0, lv - 2.5));
      this.fire.visible = fire > 0;
      if (this.fire.visible) {
        this.fire.position.set(a.w * 0.22, -a.h * 0.42);
        const fl = motion ? 0.6 + 0.4 * Math.sin(t * 13 + Math.sin(t * 5)) : 0.8;
        this.fire.alpha = fire * fl;
        this.fire.scale.set(0.45 + 0.15 * fl);
      }
    } else {
      for (const s of this.smokes) s.visible = false;
      this.fire.visible = false;
    }
    if (this.mover.visible && (motion || this.equipMotion)) this.animateEquip(t, motion);
    const boost = this.glowBoost;
    for (const w of this.windows) {
      if (!w.s.visible) continue;
      const base = smooth(w.u0, w.u0 + 0.012, this.u) * 0.9;
      const breath = motion ? 0.94 + 0.06 * Math.sin(t * 0.5 + w.phase) : 1;
      // windows go dark with heavy damage
      const dim = this.dmgLevel >= 2.5 ? Math.max(0.12, 1 - (this.dmgLevel - 2.5) * 0.6) : 1;
      w.s.alpha = Math.min(1, base * breath * (1 + boost * 0.6)) * dim;
      w.s.scale.set((w.r * 4.2 * (1 + boost * 0.25)) / 64);
    }
    if (this.core && this.coreRing && this.u >= 0.85) {
      // a slow pulse in the core; the field ring rides up and down the cylinder
      const pulse = motion ? 0.5 + 0.5 * Math.sin(t * 1.7) : 0.6;
      const dim = this.dmgLevel >= 2.5 ? 0.3 : 1;
      this.core.alpha = (0.55 + 0.35 * pulse + observe * 0.2) * dim;
      this.coreRing.y = -36 - 32 * (motion ? 0.5 + 0.5 * Math.sin(t * 0.9) : 0.5);
      this.coreRing.alpha = 0.6 + 0.4 * pulse;
    }
    if (this.dish && this.dish.visible && this.u >= 0.82) {
      this.dish.rotation = (motion ? Math.sin(t * 0.07) * 0.18 : 0) + observe * 0.5 * Math.sin(wt * 1.2);
    }
    if (this.beacon && this.beacon.visible) {
      const blink = motion ? (Math.sin(t * 2.2) > 0.86 ? 1 : 0.25) : 0.6;
      this.beacon.alpha = blink;
    }
  }

  /** Where assembly is happening now (facility space, y up negative), for sparks and the arm. */
  workPoint(): { x: number; y: number } {
    const u = this.u;
    const a = this.art;
    if (u < 0.2) {
      const k = Math.min(1, Math.max(0, (u - 0.07) / 0.13));
      const ang = k * Math.PI * 2;
      return { x: Math.cos(ang) * a.w * 0.45, y: -2 };
    }
    if (u < 0.27) return { x: Math.cos(Math.PI * 0.5 + ((u - 0.2) / 0.07) * Math.PI * 2) * a.w * 0.5, y: -3 };
    if (u < 0.45) {
      const k = (u - 0.27) / 0.18;
      return { x: (-0.5 + k) * a.w * 0.9, y: -a.h * (0.4 + 0.5 * k) };
    }
    if (u < 0.7) {
      const k = (u - 0.45) / 0.25;
      const i = Math.min(this.strips.length - 1, Math.floor(k * this.strips.length));
      const st = this.strips[i];
      return { x: (st.x0 + st.x1) / 2, y: -a.h * Math.min(0.95, 0.3 + 0.7 * ((k * this.strips.length) % 1)) };
    }
    if (u < 0.85) {
      if (this.kind === 'power') return { x: (u < 0.77 ? -1 : 1) * 30, y: -34 };
      if (this.kind === 'comms') return { x: 10, y: -a.h - 40 };
      if (this.kind === 'relay') return { x: 0, y: -a.h - 110 * smooth(0.7, 0.8, u) };
      if (this.kind === 'extractor') return { x: 0, y: -96 };
      if (this.kind === 'turret') return { x: 22, y: -40 };
      if (this.kind === 'barracks') return { x: a.w / 2 - 12, y: -a.h - 20 };
      return { x: a.w * 0.35, y: -a.h * 0.45 };
    }
    const w = this.windows.find((x) => x.u0 > u) ?? this.windows[this.windows.length - 1];
    return w ? { x: w.s.x, y: w.s.y } : { x: 0, y: -a.h * 0.5 };
  }

  /** Completion flourish: finished windows glow warmer for a moment (never lights unfinished ones). */
  setGlowBoost(k: number) {
    this.glowBoost = k;
  }

  /** Height of the finished building including its masts and dish (wu). */
  get topH(): number {
    const a = this.art;
    switch (this.kind) {
      case 'comms':
        return a.h + 96;
      case 'relay':
        return a.h + 116;
      case 'barracks':
        return a.h + 40;
      case 'command':
        return a.h + 24;
      default:
        return a.h + 8;
    }
  }

  get lit(): boolean {
    return this.u >= 0.92;
  }

  destroy() {
    this.root.destroy({ children: true });
    this.ground.destroy({ children: true });
  }
}
