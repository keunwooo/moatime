/**
 * The colony's drones on screen.
 *
 * - `Drone`, the work drone: it hovers on two thruster pods, tilts into its flights, carries
 *   ore and crates in a clamp under its belly and works with a two-jointed arm: a cutting beam
 *   at the deposits, a welding tool at the structure, a scan fan from its sensor eye.
 * - `Fixer`, the maintenance drone: a small quad-rotor that flies to damaged buildings, welds
 *   them back together, clears rubble and rebuilds.
 *
 * Everything follows the simulated step (the scene passes the step's mode and progress). All
 * shapes are drawn once; poses only move, rotate and fade them, so a moving drone never makes
 * the renderer rebuild anything.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { ownGroup } from '../gfx';
import { num } from '../paint/color';
import { S } from './palette';
import { FIXER, HAULER } from './paintDrones';
import type { SpaceTextures } from './textures';

export type RoverMode = 'drive' | 'idle' | 'drill' | 'loadOre' | 'unload' | 'pick' | 'drop' | 'build' | 'scan' | 'charge' | 'care' | 'setup';

export interface RoverPose {
  /** Distance travelled (only phases the hover bob). */
  dist: number;
  facing: number;
  mode: RoverMode;
  /** Progress through the current step (0..1). */
  p: number;
  /** Animation clock that freezes with world time (s). */
  wt: number;
  /** What the clamp holds right now. */
  cargo: '' | 'ore' | 'crate';
  n: number;
  /** Tint of the cargo (by resource). */
  tint?: number;
  /** Battery level 0..1 (status light colour). */
  bat: number;
  /** Helpers carry a small stripe so the eye can tell them apart. */
  helper: boolean;
  /** The scan sweeps the ground in front (surveying a deposit, marking out a plot). */
  scanLow?: boolean;
}

/** Local positions (card space, facing applied) the scene uses for effects. */
export interface RoverPoints {
  tipX: number;
  tipY: number;
  bedX: number;
  bedY: number;
}

/** Height of the cargo clamp above the ground while loading and unloading (wu). */
export const CARGO_H = 6;

const L1 = 15;
const L2 = 17;

/** Two-joint reach from the shoulder to a target (elbow below the line); returns both angles and the tip. */
function reach(sx: number, sy: number, tx: number, ty: number) {
  const dx = tx - sx;
  const dy = ty - sy;
  const d = Math.min(L1 + L2 - 0.5, Math.max(Math.abs(L1 - L2) + 0.5, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const a1 = base + Math.acos(Math.min(1, Math.max(-1, cosA)));
  const ex = sx + Math.cos(a1) * L1;
  const ey = sy + Math.sin(a1) * L1;
  const a2 = Math.atan2(ty - ey, tx - ex);
  return { a1, a2, ex, ey, x: ex + Math.cos(a2) * L2, y: ey + Math.sin(a2) * L2 };
}

/** An arm segment drawn once along +x (rotated into place). */
function segment(len: number, w: number): Graphics {
  const g = new Graphics();
  g.moveTo(0, 0).lineTo(len, 0).stroke({ color: num(S.armor), width: w, cap: 'round' });
  g.moveTo(1, -0.4).lineTo(len - 1, -0.4).stroke({ color: num(S.hullShadow), width: w * 0.42, cap: 'round', alpha: 0.9 });
  g.circle(0, 0, w * 0.55).fill({ color: num(S.hullShadow) });
  return g;
}

function glow(tex: SpaceTextures, tint: number, scale: number): Sprite {
  const s = new Sprite(tex.windowGlow);
  s.anchor.set(0.5);
  s.blendMode = 'add';
  s.tint = tint;
  s.scale.set(scale);
  return s;
}

export class Drone {
  /** Its own render group: posing never touches the rest of the scene. */
  readonly root = ownGroup(new Container());
  private shadow: Sprite;
  private lift = new Container();
  private flip = new Container();
  private body: Sprite;
  private plumes: Sprite[] = [];
  private jets: Sprite[] = [];
  private clamp = new Graphics();
  private cargo: Sprite[] = [];
  private arm1: Graphics;
  private arm2: Graphics;
  private tool: Sprite;
  private beam: Sprite;
  private scan = new Graphics();
  private status: Sprite;
  private stripe = new Graphics();
  private chunkTex: SpaceTextures['oreChunk'];
  private crateTex: SpaceTextures['crate'];

  constructor(tex: SpaceTextures) {
    this.chunkTex = tex.oreChunk;
    this.crateTex = tex.crate;
    this.shadow = new Sprite(tex.shadow);
    this.shadow.anchor.set(0.5);
    this.body = new Sprite(tex.hauler);
    this.body.anchor.set(HAULER.ox / HAULER.W, HAULER.oy / HAULER.H);
    this.body.scale.set(0.5);
    for (const x of [-27, 25]) {
      const plume = new Sprite(tex.beam);
      plume.anchor.set(0, 0.5);
      plume.rotation = Math.PI / 2;
      plume.blendMode = 'add';
      plume.tint = num(S.energy);
      plume.position.set(x, 17);
      this.plumes.push(plume);
      const jet = glow(tex, num(S.energy), 0.32);
      jet.position.set(x, 18);
      this.jets.push(jet);
    }
    // the clamp: two hooks under the belly
    for (const x of [-18, 10]) {
      this.clamp.moveTo(x, 7).lineTo(x, 13).lineTo(x + 3, 15).stroke({ color: num(S.armor), width: 2, cap: 'round', join: 'round' });
    }
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(tex.oreChunk);
      s.visible = false;
      this.cargo.push(s);
    }
    this.arm1 = segment(L1, 3);
    this.arm2 = segment(L2, 2.6);
    this.tool = glow(tex, num(S.energy), 0.16);
    this.beam = new Sprite(tex.beam);
    this.beam.anchor.set(0, 0.5);
    this.beam.blendMode = 'add';
    this.beam.visible = false;
    // the scan fan, drawn once pointing along +x
    this.scan.moveTo(0, 0).lineTo(120, -40).lineTo(120, 40).closePath().fill({ color: num(S.energy), alpha: 0.16 });
    this.scan.visible = false;
    this.status = glow(tex, num(S.team), 0.14);
    this.status.position.set(-6, -18);
    this.stripe.rect(-30, -17.5, 22, 2.4).fill({ color: num(S.window), alpha: 0.95 });
    this.stripe.visible = false;
    this.flip.addChild(...this.plumes, ...this.jets, this.clamp, ...this.cargo, this.body, this.stripe, this.arm1, this.arm2, this.tool, this.beam, this.scan, this.status);
    this.lift.addChild(this.flip);
    this.root.addChild(this.shadow, this.lift);
  }

  pose(o: RoverPose): RoverPoints {
    const f = o.facing >= 0 ? 1 : -1;
    const wt = o.wt;
    const moving = o.mode === 'drive';
    const settled = o.mode === 'charge';
    const working = !moving && !settled && o.mode !== 'idle';
    // hover height: cruising on flights, lower at work, settled on the charger
    const base = moving ? 26 : settled ? 11 : working ? 19 : 22;
    const H = base + Math.sin(wt * 2.1 + o.dist * 0.02) * (settled ? 0.4 : 1.3);
    this.lift.y = -H;
    this.flip.scale.x = f;
    // nose down into a flight, a slow sway otherwise
    this.flip.rotation = f * (moving ? 0.08 : Math.sin(wt * 0.9) * 0.015);
    this.shadow.scale.set((64 / 256) * (1 - H / 90), (12 / 256) * (1 - H / 90));
    this.shadow.alpha = 0.55 - H / 120;
    const thrust = moving ? 1 : settled ? 0.25 : working ? 0.7 : 0.55;
    const flick = 0.85 + 0.15 * Math.sin(wt * 23);
    this.plumes.forEach((pl, i) => {
      pl.alpha = 0.55 * thrust * flick;
      pl.scale.set((8 + 10 * thrust) / 64, (5 + (i ? 1 : 0)) / 16);
    });
    for (const j of this.jets) j.alpha = 0.6 * thrust * flick;

    // cargo hangs in the clamp
    const n = Math.max(0, Math.min(4, Math.round(o.n)));
    const crate = o.cargo === 'crate';
    this.cargo.forEach((s, i) => {
      const show = i < n && !!o.cargo;
      s.visible = show;
      if (!show) return;
      s.texture = crate ? this.crateTex : this.chunkTex;
      s.anchor.set(0.5, 0);
      s.scale.set(crate ? 0.16 : 0.22);
      const slots = crate ? [-11, 3, -11, 3] : [-12, -4, 4, -8];
      s.position.set(slots[i], crate ? 9 + Math.floor(i / 2) * 8 : 9 + (i === 3 ? 4 : 0));
      s.rotation = crate ? 0 : ((i * 1.7) % 1) - 0.5;
      s.tint = o.tint ?? 0xffffff;
    });
    // the clamp opens while unloading, picking or dropping
    const open = o.mode === 'unload' || o.mode === 'drop' || o.mode === 'pick' ? Math.sin(Math.min(1, o.p * 1.2) * Math.PI) : 0;
    this.clamp.skew.x = -open * 0.35;

    // the arm
    const sx = 30;
    const sy = 6;
    let tx = 24;
    let ty = 12;
    let toolOn = 0;
    let beamTo: { x: number; y: number } | null = null;
    switch (o.mode) {
      case 'drill': {
        // a cutting beam onto the rock in front; the arm holds steady, the beam flickers
        tx = 44;
        ty = 16;
        beamTo = { x: 58 + Math.sin(wt * 3.1) * 3, y: H - 1 };
        toolOn = 0.8 + 0.2 * Math.sin(wt * 37);
        break;
      }
      case 'loadOre': {
        // reaching down to the cut chunks and swinging them back to the clamp
        const k = (Math.sin(o.p * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        tx = 46 - k * 40;
        ty = H - 4 - k * (H - 14);
        break;
      }
      case 'build':
      case 'care': {
        const wob = Math.sin(wt * 1.3) * 0.25;
        tx = 50 + wob * 4;
        ty = -2 + wob * 6;
        toolOn = o.mode === 'build' ? (Math.sin(wt * 23) > 0.2 ? 1 : 0.35) : 0.45;
        break;
      }
      case 'setup': {
        tx = 44;
        ty = H - 6;
        toolOn = 0.5;
        break;
      }
      default:
        // folded under the nose
        tx = 26;
        ty = 12;
    }
    const arm = reach(sx, sy, tx, ty);
    this.arm1.position.set(sx, sy);
    this.arm1.rotation = arm.a1;
    this.arm2.position.set(arm.ex, arm.ey);
    this.arm2.rotation = arm.a2;
    this.tool.position.set(arm.x, arm.y);
    this.tool.alpha = toolOn;
    this.tool.tint = o.mode === 'care' ? num(S.plant) : num(S.energy);
    this.beam.visible = !!beamTo;
    if (beamTo) {
      const bx = beamTo.x - arm.x;
      const by = beamTo.y - arm.y;
      this.beam.position.set(arm.x, arm.y);
      this.beam.rotation = Math.atan2(by, bx);
      this.beam.scale.set(Math.hypot(bx, by) / 64, (0.55 + 0.2 * Math.sin(wt * 41)) * 0.5);
      this.beam.tint = num(S.energy);
      this.beam.alpha = 0.9;
    }

    // scan fan from the sensor eye
    this.scan.visible = o.mode === 'scan';
    if (this.scan.visible) {
      const k = Math.sin(Math.min(1, o.p) * Math.PI);
      const dir = o.scanLow ? 0.55 + Math.sin(wt * 1.1) * 0.15 : -0.1 + Math.sin(wt * 1.1) * 0.25;
      this.scan.position.set(34, -4);
      this.scan.rotation = dir;
      this.scan.scale.set(o.scanLow ? 0.55 : 0.9, o.scanLow ? 0.35 : 0.45);
      this.scan.alpha = (o.scanLow ? 1.3 : 0.9) * k;
    }
    // status light: warm when low, teal when full; pulsing on the charger
    const b = Math.max(0, Math.min(1, o.bat));
    this.status.tint = b < 0.3 ? num(S.coral) : b < 0.6 ? num(S.window) : num(S.team);
    this.status.alpha = settled ? 0.5 + 0.4 * Math.sin(wt * 2.4) : 0.8;
    this.stripe.visible = o.helper;
    return { tipX: arm.x * f, tipY: arm.y - H, bedX: -4 * f, bedY: 13 - H };
  }
}

export type FixerMode = 'fly' | 'weld' | 'clear' | 'park';

export class Fixer {
  readonly root = ownGroup(new Container());
  private shadow: Sprite;
  private body = new Container();
  private sprite: Sprite;
  private rotors: Sprite[] = [];
  private arm1: Graphics;
  private arm2: Graphics;
  private torch: Sprite;
  private beam: Sprite;

  constructor(tex: SpaceTextures) {
    this.shadow = new Sprite(tex.shadow);
    this.shadow.anchor.set(0.5);
    this.sprite = new Sprite(tex.fixer);
    this.sprite.anchor.set(FIXER.ox / FIXER.W, FIXER.oy / FIXER.H);
    this.sprite.scale.set(0.5);
    for (const x of [-30, 30]) {
      const r = new Sprite(tex.rotor);
      r.anchor.set(0.5);
      r.position.set(x, -19);
      r.scale.set(0.5);
      this.rotors.push(r);
    }
    this.arm1 = segment(11, 2.4);
    this.arm2 = segment(12, 2);
    this.torch = glow(tex, num(S.window), 0.2);
    this.beam = new Sprite(tex.beam);
    this.beam.anchor.set(0, 0.5);
    this.beam.blendMode = 'add';
    this.beam.visible = false;
    this.body.addChild(this.arm1, this.arm2, this.sprite, ...this.rotors, this.torch, this.beam);
    this.root.addChild(this.shadow, this.body);
  }

  /**
   * `height`: how high above the ground it flies (the card stands at that height, so the shadow
   * is drawn that far below). `reachTo`: where the tool works, relative to the body (facing right).
   */
  pose(o: { mode: FixerMode; facing: number; wt: number; height: number; reachTo?: { x: number; y: number } }) {
    const f = o.facing >= 0 ? 1 : -1;
    const wt = o.wt;
    const bob = Math.sin(wt * 2.6) * (o.mode === 'park' ? 0.4 : 1.6);
    this.body.y = bob;
    this.body.scale.x = f;
    this.body.rotation = f * (o.mode === 'fly' ? 0.12 : Math.sin(wt * 1.3) * 0.03);
    const spin = o.mode === 'park' ? 0.35 : 1;
    this.rotors.forEach((r, i) => {
      r.scale.x = 0.5 * (0.75 + 0.25 * Math.sin(wt * 33 * spin + i * 1.7));
      r.alpha = 0.55 + 0.25 * spin;
    });
    this.shadow.position.set(0, o.height);
    const sh = Math.max(0.15, 1 - o.height / 160);
    this.shadow.scale.set((44 / 256) * sh, (9 / 256) * sh);
    this.shadow.alpha = 0.45 * sh;
    // the tool arm
    const target = o.reachTo ?? { x: 14, y: 14 };
    const r = (() => {
      const sx = 6;
      const sy = 8;
      const dx = target.x - sx;
      const dy = target.y - sy;
      const d = Math.min(22.5, Math.max(1.5, Math.hypot(dx, dy)));
      const base = Math.atan2(dy, dx);
      const cosA = (11 * 11 + d * d - 12 * 12) / (2 * 11 * d);
      const a1 = base + Math.acos(Math.min(1, Math.max(-1, cosA)));
      const ex = sx + Math.cos(a1) * 11;
      const ey = sy + Math.sin(a1) * 11;
      const a2 = Math.atan2(target.y - ey, target.x - ex);
      return { sx, sy, a1, a2, ex, ey, x: ex + Math.cos(a2) * 12, y: ey + Math.sin(a2) * 12 };
    })();
    this.arm1.position.set(r.sx, r.sy);
    this.arm1.rotation = r.a1;
    this.arm2.position.set(r.ex, r.ey);
    this.arm2.rotation = r.a2;
    this.torch.position.set(r.x, r.y);
    const welding = o.mode === 'weld';
    this.torch.alpha = welding ? (Math.sin(wt * 29 + Math.sin(wt * 7)) > 0.1 ? 1 : 0.4) : o.mode === 'clear' ? 0.6 : 0;
    this.torch.tint = o.mode === 'clear' ? num(S.energy) : num(S.window);
    // clearing rubble: a tractor beam down onto the pile
    this.beam.visible = o.mode === 'clear';
    if (this.beam.visible) {
      const bx = target.x + 6 - r.x;
      const by = o.height - r.y;
      this.beam.position.set(r.x, r.y);
      this.beam.rotation = Math.atan2(by, bx);
      this.beam.scale.set(Math.hypot(bx, by) / 64, 0.9);
      this.beam.tint = num(S.energy);
      this.beam.alpha = 0.35 + 0.15 * Math.sin(wt * 9);
    }
    return { tipX: r.x * f, tipY: r.y + bob };
  }
}
