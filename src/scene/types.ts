import type { Container, Renderer } from 'pixi.js';
import type { GrowthRules } from '../core/rules';
import type { Status, ThemeId } from '../core/session';
import type { AspectClass } from '../core/world';
import type { Projector, Viewport } from './diorama';
import type { Framing, RegionOverrides, UnitExtents } from './camera';
import type { EventDirector } from './director';
import type { WorldEnv } from '../world/env';

export interface FrameInfo {
  /** Ambient clock in seconds: frozen while paused or when animation is off. */
  t: number;
  dt: number;
  realDt: number;
  /** World time (ms). */
  W: number;
  prevW: number;
  /** W advanced continuously while running this frame (no reload / jump). */
  live: boolean;
  /** W changed discontinuously this frame. */
  jumped: boolean;
  /** The theme's simulation state at W (read only). */
  sim: unknown;
  status: Status;
  /** Environment motion allowed (animation on and not paused). */
  motion: boolean;
  proj: Projector;
  vp: Viewport;
  lowPower: boolean;
  /** Decorative density multiplier (effect intensity); never affects the simulation. */
  effects: number;
  /** The camera is travelling to a new framing (ambient events wait). */
  cameraMoving: boolean;
  /** "자동 카메라" is off: the view stays where it is. */
  cameraLock: boolean;
  /** Time of day, season, weather and the headline event at W. */
  env: WorldEnv;
  /** Concurrency and particle budgets for decorative extras. */
  director: EventDirector;
}

export interface WorldSpec {
  seed: number;
  rules: GrowthRules;
  aspect: AspectClass;
}

export interface SceneStats {
  cards: number;
  visible: number;
  detailedZones: number;
  textures: number;
}

export interface FramingRequest {
  sim: unknown;
  W: number;
  aspect: AspectClass;
  /** Animation off: one calm view of the current work area. */
  reduced: boolean;
}

export interface FramingChoice {
  framing: Framing;
  /** A key moment (sprouting, unfolding leaves, installing parts): keep the current view. */
  hold: boolean;
}

export interface ThemeScene {
  readonly id: ThemeId;
  readonly extents: UnitExtents;
  /** Optional screen regions per framing (e.g. low, wide regions for wide modules). */
  readonly regions?: RegionOverrides;
  /** Background color used behind the canvas while loading. */
  readonly background: number;
  readonly root: Container;
  build(renderer: Renderer, world: WorldSpec, lowPower: boolean): Promise<void>;
  /** World seed or aspect changed: rebuild content (textures stay). */
  setWorld(world: WorldSpec): void;
  /** Camera target from the simulated work: a stable work area, never a moving worker. */
  framing(req: FramingRequest): FramingChoice;
  update(f: FrameInfo): void;
  /** Session completion flourish (only for live completions). */
  celebrate(): void;
  stats(): SceneStats;
  destroy(): void;
}
