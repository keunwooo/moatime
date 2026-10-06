/**
 * SceneHost: owns the PixiJS application, the render loop and the camera rig.
 * It reads world time straight from the TimerEngine every frame; React never sees
 * per-frame data.
 */

// Register the renderer extensions this app uses explicitly. Production tree-shaking can
// otherwise drop the side-effect registrations and leave a render pipe undefined.
import 'pixi.js/app';
import 'pixi.js/graphics';
import 'pixi.js/mesh';
import 'pixi.js/particle-container';
import 'pixi.js/sprite-tiling';
import { Application } from 'pixi.js';
import type { TimerEngine } from '../core/engine';
import { rulesFor } from '../core/rules';
import type { ThemeId } from '../core/session';
import { aspectFor, type AspectClass } from '../core/world';
import { EFFECTS, type EffectLevel } from '../sim/config';
import { worldEnv } from '../world/env';
import { weatherSeverity } from '../world/weather';
import { CameraRig, minUnitPx, solveFraming, type Framing } from './camera';
import { EventDirector } from './director';
import { focalFor, Projector, type Viewport } from './diorama';
import type { FrameInfo, SceneStats, ThemeScene, WorldSpec } from './types';
import { liveTextureCount } from './paint/brush';

export interface HostOptions {
  reducedMotion: boolean;
  cameraLock: boolean;
  lowPower: boolean;
  effects: EffectLevel;
}

/** The simulation state of a theme at world time W (owned by the app). */
export type SimProvider = (theme: ThemeId, W: number) => unknown;

export type HostState = 'init' | 'loading' | 'ready' | 'failed';

const themeLoaders: Record<ThemeId, () => Promise<ThemeScene>> = {
  forest: () => import('./forest/ForestScene').then((m) => new m.ForestScene()),
  space: () => import('./space/SpaceScene').then((m) => new m.SpaceScene()),
  cosmos: () => import('./cosmos/CosmosScene').then((m) => new m.CosmosScene()),
};

export interface DevSceneInfo {
  fps: number;
  /** Average CPU time spent per frame (scene update + render submit), ms. */
  frameMs: number;
  framing: string;
  stats: SceneStats | null;
}

export class SceneHost {
  private app: Application | null = null;
  private el: HTMLElement;
  private engine: TimerEngine;
  private theme: ThemeScene | null = null;
  private themeId: ThemeId | null = null;
  private pendingTheme: ThemeId | null = null;
  private building: Promise<void> = Promise.resolve();
  private rig = new CameraRig();
  private proj = new Projector();
  private vp: Viewport = { w: 1, h: 1, f: 1 };
  private aspect: AspectClass = 'wide';
  private framing: Framing | null = null;
  private lockedFraming: Framing | null = null;
  private opts: HostOptions;
  private raf = 0;
  private lastFrame = 0;
  private ambientT = 0;
  private prevW = -1;
  private forceSnap = true;
  private destroyed = false;
  private ro: ResizeObserver | null = null;
  private onState: (s: HostState) => void;
  private fpsAcc = { frames: 0, t: 0, fps: 0 };
  private frameMs = 0;
  private lastRenderAt = 0;
  private dirty = true;
  private worldKey = '';
  private celebratePending = false;
  private sim: SimProvider;
  private cameraMoving = false;
  private director = new EventDirector();

  constructor(el: HTMLElement, engine: TimerEngine, opts: HostOptions, onState: (s: HostState) => void, sim: SimProvider) {
    this.el = el;
    this.engine = engine;
    this.opts = { ...opts };
    this.onState = onState;
    this.sim = sim;
  }

  async init(theme: ThemeId): Promise<boolean> {
    this.onState('init');
    try {
      if (import.meta.env.DEV && new URLSearchParams(location.search).has('nogl')) throw new Error('renderer disabled (?nogl)');
      const app = new Application();
      await app.init({
        antialias: true,
        backgroundAlpha: 1,
        background: 0xf1ead9,
        resolution: Math.min(window.devicePixelRatio || 1, this.opts.lowPower ? 1 : 2),
        autoDensity: true,
        autoStart: false,
        preference: 'webgl',
        width: Math.max(1, this.el.clientWidth),
        height: Math.max(1, this.el.clientHeight),
      });
      if (this.destroyed) {
        app.destroy(true, { children: true });
        return false;
      }
      app.ticker.stop();
      this.app = app;
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      this.el.appendChild(canvas);
      // A lost context is usually restored by the browser (GPU reset); show the poster
      // meanwhile and only give up if it does not come back.
      let lostTimer = 0;
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.onState('loading');
        lostTimer = window.setTimeout(() => this.onState('failed'), 6000);
      });
      canvas.addEventListener('webglcontextrestored', () => {
        window.clearTimeout(lostTimer);
        this.forceSnap = true;
        this.dirty = true;
        if (this.theme) this.onState('ready');
      });
      this.measure();
      this.ro = new ResizeObserver(() => {
        this.measure();
        this.dirty = true;
      });
      this.ro.observe(this.el);
      document.addEventListener('visibilitychange', this.onVisibility);
      // a theme change during app.init only recorded its wish; honour it now
      await this.setTheme(this.pendingTheme ?? theme);
      this.loop(performance.now());
      return true;
    } catch (err) {
      console.warn('[moa] renderer unavailable, showing static landscape', err);
      this.onState('failed');
      return false;
    }
  }

  private worldSpec(): WorldSpec {
    const s = this.engine.getState();
    return { seed: s.world.seed, rules: rulesFor(s.world.rulesVersion), aspect: this.aspect };
  }

  /**
   * Switches theme. The latest request always wins (A → B → A ends on A); a failed load or
   * build keeps the current theme and releases whatever was partially built.
   */
  setTheme(id: ThemeId): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.pendingTheme = id;
    if (!this.app) return Promise.resolve(); // recorded; init() builds it
    // one build at a time; a request superseded while waiting is skipped
    this.building = this.building.then(() => this.applyTheme(id));
    return this.building;
  }

  private async applyTheme(id: ThemeId) {
    if (this.destroyed || !this.app || this.pendingTheme !== id) return;
    if (this.themeId === id && this.theme) {
      this.onState('ready');
      return;
    }
    this.onState('loading');
    let next: ThemeScene | null = null;
    try {
      next = await themeLoaders[id]();
      if (this.destroyed || this.pendingTheme !== id) return;
      const spec = this.worldSpec();
      const builtKey = this.currentWorldKey();
      await next.build(this.app.renderer, spec, this.opts.lowPower);
      if (this.destroyed || this.pendingTheme !== id) return;
      // the world or aspect may have changed while textures were painted
      if (this.currentWorldKey() !== builtKey) next.setWorld(this.worldSpec());
      const old = this.theme;
      this.theme = next;
      this.themeId = id;
      next = null;
      this.worldKey = this.currentWorldKey();
      this.app.renderer.background.color = this.theme.background;
      this.app.stage.addChild(this.theme.root);
      if (old) {
        this.app.stage.removeChild(old.root);
        old.destroy();
      }
      this.framing = null;
      this.lockedFraming = null;
      this.forceSnap = true;
      this.dirty = true;
      this.onState('ready');
    } catch (err) {
      console.warn('[moa] theme failed to load', err);
      if (this.pendingTheme === id) this.pendingTheme = this.themeId;
      this.onState(this.theme ? 'ready' : 'failed');
    } finally {
      // anything built but not adopted (superseded or failed) is released
      if (next) next.destroy();
    }
  }

  setOptions(o: Partial<HostOptions>) {
    const prev = this.opts;
    this.opts = { ...this.opts, ...o };
    if (o.cameraLock !== undefined && o.cameraLock !== prev.cameraLock) {
      this.lockedFraming = o.cameraLock ? this.framing : null;
    }
    if (o.reducedMotion !== undefined && o.reducedMotion !== prev.reducedMotion) {
      this.framing = null;
      this.forceSnap = true;
    }
    this.dirty = true;
  }

  /** Completion flourish; only called for live completions. */
  celebrate() {
    if (this.theme) this.theme.celebrate();
    else this.celebratePending = true;
    this.dirty = true;
  }

  /** Force the camera and scene to the current state without transitions (dev jumps). */
  snap() {
    this.forceSnap = true;
    this.dirty = true;
  }

  /** Dev-only access for inspection. */
  get devTheme(): ThemeScene | null {
    return this.theme;
  }

  /** Dev-only: render one frame now, even in a hidden tab (screenshots, inspection). */
  devRenderNow(dt = 1 / 60) {
    this.frame(dt, this.engine.status(), this.opts.reducedMotion);
  }

  /** Dev-only: the environment and the director's slots of the last frame. */
  get devDirector(): EventDirector {
    return this.director;
  }

  devInfo(): DevSceneInfo {
    return {
      fps: this.fpsAcc.fps,
      frameMs: Math.round(this.frameMs * 100) / 100,
      framing: this.framing?.key ?? '-',
      stats: this.theme ? { ...this.theme.stats(), textures: liveTextureCount() } : null,
    };
  }

  private currentWorldKey(): string {
    const s = this.engine.getState();
    return `${s.world.id}:${s.world.seed}:${this.aspect}`;
  }

  private measure() {
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    if (this.app) this.app.renderer.resize(w, h);
    this.vp = { w, h, f: focalFor(w, h) };
    const aspect = aspectFor(w, h);
    if (aspect !== this.aspect) {
      this.aspect = aspect;
      this.framing = null;
    }
    this.forceSnap = true;
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Time kept flowing while hidden: restore the current state directly.
      this.forceSnap = true;
      this.dirty = true;
      this.lastFrame = performance.now();
      cancelAnimationFrame(this.raf);
      this.loop(this.lastFrame);
    }
  };

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.visibilityState === 'hidden') return;
    const realDt = this.lastFrame ? Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000)) : 0;
    const status = this.engine.status();
    const reduced = this.opts.reducedMotion;
    // Frame pacing: paused/reduced scenes barely change, low power caps at ~30 fps.
    const minInterval = status === 'paused' ? 1000 : reduced ? 1000 : this.opts.lowPower ? 33 : 0;
    if (!this.dirty && now - this.lastRenderAt < minInterval) return;
    const sinceLast = this.lastRenderAt ? (now - this.lastRenderAt) / 1000 : 0;
    this.lastFrame = now;
    this.lastRenderAt = now;
    this.dirty = false;
    const t0 = performance.now();
    this.frame(realDt, status, reduced);
    this.frameMs = this.frameMs * 0.95 + (performance.now() - t0) * 0.05;
    this.fpsAcc.frames++;
    this.fpsAcc.t += sinceLast;
    if (this.fpsAcc.t >= 1) {
      this.fpsAcc.fps = Math.round(this.fpsAcc.frames / this.fpsAcc.t);
      this.fpsAcc.frames = 0;
      this.fpsAcc.t = 0;
    }
  };

  private frame(realDt: number, status: ReturnType<TimerEngine['status']>, reduced: boolean) {
    const app = this.app;
    const theme = this.theme;
    if (!app || !theme) return;
    const key = this.currentWorldKey();
    if (key !== this.worldKey) {
      this.worldKey = key;
      theme.setWorld(this.worldSpec());
      this.framing = null;
      this.forceSnap = true;
    }
    const W = this.engine.worldTime();
    const paused = status === 'paused';
    const motion = !reduced && !paused;
    const dt = motion ? realDt : 0;
    if (motion) this.ambientT += dt;

    const expected = status === 'running' ? realDt * 1000 : 0;
    const jumped = this.prevW < 0 || this.forceSnap || Math.abs(W - this.prevW - expected) > 2500;
    const live = status === 'running' && !jumped;
    const prevW = this.prevW < 0 ? W : this.prevW;
    this.prevW = W;
    const sim = this.sim(theme.id, W);
    const env = worldEnv(theme.id, this.engine.getState().world.seed, W, this.engine.cosmosOrigin());

    // Camera framing from the simulated work area. Key moments hold the current view.
    const choice = theme.framing({ sim, W, aspect: this.aspect, reduced });
    const snap = this.forceSnap || jumped || reduced;
    let wanted: Framing = this.opts.cameraLock && this.lockedFraming ? this.lockedFraming : choice.framing;
    if (!snap && choice.hold && this.framing && !(this.opts.cameraLock && this.lockedFraming)) wanted = this.framing;
    if (!this.framing || wanted.key !== this.framing.key || snap) {
      const target = solveFraming(wanted, this.vp, {
        minUnitPx: minUnitPx(this.vp),
        unitHeight: theme.extents.mature.h,
      });
      this.rig.setTarget(target, wanted.tau, snap);
      this.framing = wanted;
      if (this.opts.cameraLock && !this.lockedFraming) this.lockedFraming = wanted;
    }
    this.forceSnap = false;
    const moving = this.rig.update(paused ? 0 : realDt);
    this.cameraMoving = moving;
    this.proj.set(this.rig.current!, this.vp);

    if (this.celebratePending) {
      this.celebratePending = false;
      theme.celebrate();
    }

    const effects = EFFECTS.density[this.opts.effects] * (this.opts.lowPower ? 0.7 : 1);
    this.director.begin({
      t: this.ambientT,
      motion,
      quiet: this.cameraMoving,
      effects,
      headline: env.event ? env.event.prio : -1,
      weather: weatherSeverity(env.weather),
    });
    const info: FrameInfo = {
      t: this.ambientT,
      dt,
      realDt,
      W,
      prevW,
      live,
      jumped,
      sim,
      status,
      motion,
      proj: this.proj,
      vp: this.vp,
      lowPower: this.opts.lowPower,
      effects,
      cameraMoving: this.cameraMoving,
      cameraLock: this.opts.cameraLock,
      env,
      director: this.director,
    };
    theme.update(info);
    app.render();
    if (moving) this.dirty = true;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ro?.disconnect();
    this.theme?.destroy();
    this.theme = null;
    if (this.app) {
      const canvas = this.app.canvas as HTMLCanvasElement;
      this.app.destroy(true, { children: true });
      canvas.remove();
      this.app = null;
    }
  }
}
