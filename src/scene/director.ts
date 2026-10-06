/**
 * Event Director: how much may happen on screen at once.
 *
 * The world timeline decides what happened (a raid, a comet, a storm). The director decides
 * how many decorative extras may start alongside it, so the screen never gets busy:
 *   headline  1  the timeline's event (drawn by its system; never refused)
 *   fx        1  short flourishes: a shooting star, a gust of petals
 *   ambient   2  small visitors: a bird, a butterfly, a rabbit
 * A headline event of rare or combat priority pauses new flourishes and thins visitors;
 * heavy weather sends visitors to shelter. Nothing new starts while the camera travels or
 * during a key moment of work, and nothing at all without motion.
 *
 * It also hands out particle budgets (rain, snow, petals, dust, sparks) from one total that
 * follows the effect intensity and low-power settings.
 */

import { PRIORITY } from '../world/timeline';

export type Channel = 'fx' | 'ambient';

export interface DirectorFrame {
  /** Ambient clock (s). */
  t: number;
  motion: boolean;
  /** Camera travelling or a key work moment. */
  quiet: boolean;
  /** Decorative density (effect intensity × low power). */
  effects: number;
  /** Priority of the headline event running now (-1 none). */
  headline: number;
  /** 0 calm .. 1 storm. */
  weather: number;
}

interface Slot {
  id: string;
  channel: Channel;
  until: number;
}

/** Particles on screen at the default intensity, across all layers. */
const PARTICLES = 420;
const SHARE = { weather: 0.7, ambient: 0.2, fx: 0.1 };

export class EventDirector {
  private slots: Slot[] = [];
  private f: DirectorFrame = { t: 0, motion: false, quiet: true, effects: 1, headline: -1, weather: 0 };

  begin(f: DirectorFrame) {
    this.f = f;
    if (this.slots.length) this.slots = this.slots.filter((s) => s.until > f.t);
  }

  /** Slots a channel has right now. */
  cap(channel: Channel): number {
    const f = this.f;
    if (!f.motion) return 0;
    let c = channel === 'fx' ? 1 : 2;
    if (f.headline >= PRIORITY.RARE) c = channel === 'fx' ? 0 : 1;
    if (channel === 'ambient') {
      if (f.weather > 0.6) c = 0;
      else if (f.weather > 0.3) c = Math.min(c, 1);
    }
    return c;
  }

  /**
   * Asks to begin something now that lasts `durS` seconds of the ambient clock. Granted
   * requests hold a slot until they end; a refused caller simply tries again later.
   */
  request(id: string, channel: Channel, durS: number, quiet = false): boolean {
    if (this.holds(id)) return true;
    if (quiet || this.f.quiet) return false;
    let used = 0;
    for (const s of this.slots) if (s.channel === channel) used++;
    if (used >= this.cap(channel)) return false;
    this.slots.push({ id, channel, until: this.f.t + durS });
    return true;
  }

  holds(id: string): boolean {
    return this.slots.some((s) => s.id === id);
  }

  release(id: string) {
    this.slots = this.slots.filter((s) => s.id !== id);
  }

  /** Particle budget of a layer this frame. */
  particles(layer: keyof typeof SHARE): number {
    if (!this.f.motion) return 0;
    return Math.round(PARTICLES * this.f.effects * SHARE[layer]);
  }

  /** What is holding a slot (dev panel). */
  active(): { id: string; channel: Channel }[] {
    return this.slots.map((s) => ({ id: s.id, channel: s.channel }));
  }
}
