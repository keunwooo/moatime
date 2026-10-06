/**
 * SimRunner: computes one theme's simulation state at any world time W.
 *
 * - The state at W is a pure function of (world seed, simulation base, SIM_VERSION, W), and for
 *   space also of the raid plan (paced to the focus sessions, world/pace.ts). The plan only
 *   grows in the future, so the past never changes; if it ever does, the runner steps back.
 *   Forest and space each have their own runner and resources; neither touches the other.
 * - Moving forward processes only the events between the last W and the new one, so a frame
 *   costs almost nothing and a long return is computed once, event by event (no animation is
 *   replayed: the scene only draws the resulting state).
 * - Checkpoints (in memory, plus one persisted per theme) make backward queries and reloads
 *   cheap. They are caches: dropping them never changes a result.
 */

import { SIM_VERSION } from './config';
import { advanceForest, cloneForest, forestCtx, initForest, type ForestCtx, type ForestSim } from './forest';
import { advanceSpace, cloneSpace, initSpace, spaceCtx, type SpaceCtx, type SpaceSim } from './space';
import { advanceCosmos, cloneCosmos, COSMOS_SIM_VERSION, initCosmos, type CosmosSim } from './cosmos';
import { advanceFront, cloneFront, FRONT_SIM_VERSION, initFront, type FrontSim } from './front';
import type { SimBase } from './types';
import type { RaceId, SimTheme } from '../core/session';

export type SimState<T extends SimTheme> = T extends 'forest' ? ForestSim : T extends 'space' ? SpaceSim : T extends 'front' ? FrontSim : CosmosSim;

/** Rule version of a theme's simulation (the cosmos and the front keep their own). */
export const simVersionOf = (theme: SimTheme) => (theme === 'cosmos' ? COSMOS_SIM_VERSION : theme === 'front' ? FRONT_SIM_VERSION : SIM_VERSION);

export interface SimWorld {
  id: string;
  seed: number;
  base: SimBase;
  /** Planned raid starts (space), sorted. */
  raids?: readonly number[];
  /** The people the front commands. */
  race?: RaceId;
}

/** Which raids a state at W has seen (a stored checkpoint is only valid for the same ones). */
function raidKey(raids: readonly number[], W: number): string {
  let n = 0;
  let last = -1;
  for (const t of raids) {
    if (t > W) break;
    n++;
    last = t;
  }
  return `${n}:${last}`;
}

export interface StoredCheckpoint {
  worldId: string;
  simVersion: number;
  theme: SimTheme;
  baseW: number;
  W: number;
  state: unknown;
  /** Raids the state has seen (space). */
  raidKey?: string;
}

/** Spacing of in-memory checkpoints (world time). */
const CP_SPACING = 20 * 60_000;
const CP_KEEP = 72;

interface Impl<S> {
  init(): S;
  advance(s: S, W: number): number;
  clone(s: S): S;
}

export class SimRunner<T extends SimTheme = SimTheme> {
  readonly theme: T;
  readonly world: SimWorld;
  private impl: Impl<SimState<T>>;
  private cur: SimState<T>;
  private curW: number;
  private cps: { W: number; s: SimState<T> }[] = [];
  private sctx: SpaceCtx | null = null;
  /** Events processed in total (dev info). */
  events = 0;
  /** Time spent in the last catch-up (dev info), ms. */
  lastCatchUpMs = 0;

  /** `stored` is used only if it belongs here and does not lie ahead of `maxW`. */
  constructor(theme: T, world: SimWorld, stored?: StoredCheckpoint | null, maxW = Infinity) {
    this.theme = theme;
    this.world = world;
    if (theme === 'forest') {
      const ctx: ForestCtx = forestCtx(world.seed);
      this.impl = {
        init: () => initForest(world.seed, world.base),
        advance: (s, W) => advanceForest(s as ForestSim, ctx, W),
        clone: (s) => cloneForest(s as ForestSim),
      } as Impl<SimState<T>>;
    } else if (theme === 'cosmos') {
      // the universe's age is the world time since its origin (the base)
      const origin = world.base.W;
      this.impl = {
        init: () => initCosmos(world.seed, world.base),
        advance: (s, W) => advanceCosmos(s as CosmosSim, W - origin),
        clone: (s) => cloneCosmos(s as CosmosSim),
      } as Impl<SimState<T>>;
    } else if (theme === 'front') {
      // the war's time is the world time since its origin (the base)
      const origin = world.base.W;
      const race = world.race ?? 0;
      this.impl = {
        init: () => initFront(world.seed, race, world.base),
        advance: (s: unknown, W: number) => advanceFront(s as FrontSim, W - origin),
        clone: (s: unknown) => cloneFront(s as FrontSim),
      } as unknown as Impl<SimState<T>>;
    } else {
      const ctx: SpaceCtx = spaceCtx(world.seed, world.raids ?? []);
      this.sctx = ctx;
      this.impl = {
        init: () => initSpace(world.seed, world.base),
        advance: (s: unknown, W: number) => advanceSpace(s as SpaceSim, ctx, W),
        clone: (s: unknown) => cloneSpace(s as SpaceSim),
      } as unknown as Impl<SimState<T>>;
    }
    const base = this.impl.init();
    this.cps.push({ W: world.base.W, s: this.impl.clone(base) });
    this.cur = base;
    this.curW = world.base.W;
    if (stored && this.accepts(stored) && stored.W <= maxW) {
      this.cur = stored.state as SimState<T>;
      this.curW = stored.W;
      this.cps.push({ W: stored.W, s: this.impl.clone(this.cur) });
    }
  }

  /** A stored checkpoint belongs to this world, theme, base and rule version. */
  accepts(cp: StoredCheckpoint): boolean {
    return (
      cp.worldId === this.world.id &&
      cp.simVersion === simVersionOf(this.theme) &&
      cp.theme === this.theme &&
      cp.baseW === this.world.base.W &&
      typeof cp.W === 'number' &&
      cp.W >= this.world.base.W &&
      typeof cp.state === 'object' &&
      cp.state !== null &&
      typeof (cp.state as { v?: unknown }).v === 'number' &&
      typeof (cp.state as { done?: unknown }).done === 'number' &&
      (this.theme === 'space'
        ? Array.isArray((cp.state as { rovers?: unknown }).rovers) && cp.raidKey === raidKey(this.sctx!.raids, cp.W)
        : this.theme === 'cosmos'
          ? (cp.state as { seed?: unknown }).seed === this.world.seed && Array.isArray((cp.state as { sn?: unknown }).sn)
          : this.theme === 'front'
            ? (cp.state as { seed?: unknown }).seed === this.world.seed && (cp.state as { race?: unknown }).race === (this.world.race ?? 0)
            : typeof (cp.state as { keeper?: unknown }).keeper === 'object')
    );
  }

  /**
   * New raid plan (space). Raids are only added after the current time, so normally nothing
   * computed changes; if an earlier one differs, the runner goes back to before it.
   */
  setRaids(raids: readonly number[]) {
    const ctx = this.sctx;
    if (!ctx || ctx.raids === raids) return;
    const old = ctx.raids;
    let i = 0;
    while (i < old.length && i < raids.length && old[i] === raids[i]) i++;
    const changed = Math.min(i < old.length ? old[i] : Infinity, i < raids.length ? raids[i] : Infinity);
    (ctx as { raids: readonly number[] }).raids = raids;
    if (changed <= this.curW) {
      this.cps = this.cps.filter((cp, k) => k === 0 || cp.W < changed);
      this.rewind(changed - 1);
    }
  }

  /** State including every event up to W. The returned object must not be modified. */
  at(Wraw: number): SimState<T> {
    const W = Math.max(this.world.base.W, Number.isFinite(Wraw) ? Wraw : 0);
    if (W < this.curW) this.rewind(W);
    // >= : events due exactly now (a worker's first dispatch at the start) are processed too
    if (W >= this.curW) {
      const jump = W - this.curW;
      const t0 = performance.now();
      // long jumps are walked in checkpoint-sized pieces so later queries stay cheap
      while (W - this.curW > CP_SPACING) {
        const stop = this.curW + CP_SPACING;
        this.events += this.impl.advance(this.cur, stop);
        this.curW = stop;
        this.addCheckpoint();
      }
      this.events += this.impl.advance(this.cur, W);
      this.curW = W;
      const last = this.cps[this.cps.length - 1];
      if (W - last.W >= CP_SPACING) this.addCheckpoint();
      if (jump > 60_000) this.lastCatchUpMs = performance.now() - t0;
    }
    return this.cur;
  }

  /** World time the current state reflects. */
  get W(): number {
    return this.curW;
  }

  /** Snapshot for persistence (a copy). */
  checkpoint(): StoredCheckpoint {
    return {
      worldId: this.world.id,
      simVersion: simVersionOf(this.theme),
      theme: this.theme,
      baseW: this.world.base.W,
      W: this.curW,
      state: this.impl.clone(this.cur),
      ...(this.sctx ? { raidKey: raidKey(this.sctx.raids, this.curW) } : {}),
    };
  }

  /** An independent state at W (for summaries of the past). */
  stateAt(W: number): SimState<T> {
    const save = { cur: this.cur, curW: this.curW };
    const s = this.impl.clone(this.at(W));
    if (W < save.curW) {
      // jump back to where the live view was
      this.cur = save.cur;
      this.curW = save.curW;
    }
    return s;
  }

  checkpointCount(): number {
    return this.cps.length;
  }

  private addCheckpoint() {
    this.cps.push({ W: this.curW, s: this.impl.clone(this.cur) });
    if (this.cps.length > CP_KEEP) {
      // keep the base and thin out the oldest half
      const keep = [this.cps[0]];
      for (let i = 1; i < this.cps.length; i++) if (i > this.cps.length / 2 || i % 2 === 0) keep.push(this.cps[i]);
      this.cps = keep;
    }
  }

  private rewind(W: number) {
    let best = this.cps[0];
    for (const cp of this.cps) if (cp.W <= W && cp.W >= best.W) best = cp;
    this.cur = this.impl.clone(best.s);
    this.curW = best.W;
  }
}
