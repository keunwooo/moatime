/**
 * Procedural sound with WebAudio (no audio files). Both sounds are off by default and only
 * start after the user turns them on (a user gesture unlocks the AudioContext).
 *
 *  - Forest ambience: soft filtered wind with slow swells, rare distant bird notes.
 *  - Space ambience: a low, slowly breathing drone with faint air.
 *  - Completion chime: two soft bell notes.
 *
 * Background completion: a chime is pre-scheduled on the audio clock shortly before the end
 * so it can sound on time even when timers are throttled, but this is best effort and is
 * never promised in the UI.
 */

import type { ThemeId } from '../core/session';
import { claimAudio } from './owner';

type Ctx = AudioContext;

export class SoundEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private ambient: { theme: ThemeId; gain: GainNode; stop: () => void } | null = null;
  private scheduled: { at: number; nodes: AudioScheduledSourceNode[] } | null = null;
  private birdTimer = 0;

  private ensure(): Ctx | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Call from a user gesture: unlocks audio and makes this tab the one that sounds. */
  unlock() {
    claimAudio();
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  /** True when this tab's audio is unlocked and running. */
  canPlay(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private noiseBuffer(ctx: Ctx, seconds: number, pink = true): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.997 * b0 + w * 0.029591;
        b1 = 0.985 * b1 + w * 0.032534;
        b2 = 0.95 * b2 + w * 0.048056;
        d[i] = (b0 + b1 + b2 + w * 0.05) * 0.6;
      } else d[i] = w * 0.3;
    }
    // crossfade the loop seam
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
    }
    return buf;
  }

  setAmbient(theme: ThemeId, on: boolean, level = 1) {
    if (!on) {
      this.stopAmbient();
      return;
    }
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (this.ambient && this.ambient.theme === theme) {
      this.ambient.gain.gain.setTargetAtTime(0.5 * level, ctx.currentTime, 0.6);
      return;
    }
    this.stopAmbient();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const nodes: AudioScheduledSourceNode[] = [];
    if (theme === 'forest') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx, 6);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 0.45;
      const swell = ctx.createGain();
      swell.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.28;
      lfo.connect(lfoGain).connect(swell.gain);
      src.connect(bp).connect(swell).connect(gain);
      const leaves = ctx.createBufferSource();
      leaves.buffer = this.noiseBuffer(ctx, 4, false);
      leaves.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3200;
      const lg = ctx.createGain();
      lg.gain.value = 0.035;
      leaves.connect(hp).connect(lg).connect(gain);
      src.start();
      leaves.start();
      lfo.start();
      nodes.push(src, leaves, lfo);
      const chirp = () => {
        if (!this.ambient || this.ambient.theme !== 'forest' || !this.ctx) return;
        this.bird(this.ctx, gain);
        this.birdTimer = window.setTimeout(chirp, 18000 + Math.random() * 30000);
      };
      this.birdTimer = window.setTimeout(chirp, 9000);
    } else if (theme === 'cosmos') {
      // "우주의 숨": an open-fifth pad whose filter breathes very slowly, and a soft airy hush
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      lp.Q.value = 0.6;
      const sweep = ctx.createOscillator();
      sweep.frequency.value = 0.025;
      const sweepGain = ctx.createGain();
      sweepGain.gain.value = 260;
      sweep.connect(sweepGain).connect(lp.frequency);
      lp.connect(gain);
      for (const [fq, g] of [
        [110, 0.13],
        [164.8, 0.09],
        [246.9, 0.045],
        [329.6, 0.02],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = fq;
        o.detune.value = (Math.random() - 0.5) * 6;
        const og = ctx.createGain();
        og.gain.value = g;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.02 + Math.random() * 0.05;
        const lg = ctx.createGain();
        lg.gain.value = g * 0.45;
        lfo.connect(lg).connect(og.gain);
        o.connect(og).connect(lp);
        o.start();
        lfo.start();
        nodes.push(o, lfo);
      }
      const air = ctx.createBufferSource();
      air.buffer = this.noiseBuffer(ctx, 6);
      air.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.4;
      const ag = ctx.createGain();
      ag.gain.value = 0.02;
      const breath = ctx.createOscillator();
      breath.frequency.value = 0.1;
      const bg = ctx.createGain();
      bg.gain.value = 0.015;
      breath.connect(bg).connect(ag.gain);
      air.connect(bp).connect(ag).connect(gain);
      air.start();
      breath.start();
      sweep.start();
      nodes.push(air, breath, sweep);
    } else {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      lp.connect(gain);
      for (const [f, g] of [
        [55, 0.18],
        [82.4, 0.11],
        [110.3, 0.05],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = g;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.03 + Math.random() * 0.04;
        const lg = ctx.createGain();
        lg.gain.value = g * 0.5;
        lfo.connect(lg).connect(og.gain);
        o.connect(og).connect(lp);
        o.start();
        lfo.start();
        nodes.push(o, lfo);
      }
      const air = ctx.createBufferSource();
      air.buffer = this.noiseBuffer(ctx, 6);
      air.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.3;
      const ag = ctx.createGain();
      ag.gain.value = 0.05;
      air.connect(bp).connect(ag).connect(gain);
      air.start();
      nodes.push(air);
    }
    gain.gain.setTargetAtTime(0.5 * level, ctx.currentTime, 1.2);
    this.ambient = {
      theme,
      gain,
      stop: () => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, 0.5);
        window.setTimeout(() => {
          for (const n of nodes) {
            try {
              n.stop();
            } catch {
              /* already stopped */
            }
          }
          gain.disconnect();
        }, 2500);
      },
    };
  }

  private stopAmbient() {
    window.clearTimeout(this.birdTimer);
    this.ambient?.stop();
    this.ambient = null;
  }

  private bird(ctx: Ctx, out: AudioNode) {
    const t0 = ctx.currentTime + 0.05;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const t = t0 + i * 0.16;
      const f = 2600 + Math.random() * 900;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.07);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.14);
    }
  }

  private bell(ctx: Ctx, at: number): AudioScheduledSourceNode[] {
    const out: AudioScheduledSourceNode[] = [];
    const notes = [
      [659.25, 0],
      [880, 0.42],
    ];
    for (const [f, dt] of notes) {
      for (const [mul, amp, dec] of [
        [1, 0.16, 2.6],
        [2.76, 0.05, 1.2],
        [5.4, 0.02, 0.6],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const g = ctx.createGain();
        const t = at + dt;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(g).connect(this.master!);
        o.start(t);
        o.stop(t + dec + 0.05);
        out.push(o);
      }
    }
    return out;
  }

  /** The Big Bang: a soft chord rising over four seconds (never a boom). */
  swell() {
    const ctx = this.ensure();
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.05;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 4);
    g.gain.setTargetAtTime(0, t0 + 4.2, 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(220, t0);
    lp.frequency.exponentialRampToValueAtTime(1600, t0 + 4);
    lp.connect(g).connect(this.master);
    for (const f of [110, 165, 220, 330]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t0);
      o.stop(t0 + 14);
    }
  }

  playChime() {
    const ctx = this.ensure();
    if (!ctx || !this.master || ctx.state !== 'running') return;
    this.bell(ctx, ctx.currentTime + 0.02);
  }

  /** Pre-schedules a chime at a wall-clock time (best effort). */
  scheduleChime(atWallMs: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master || ctx.state !== 'running') return;
    if (this.scheduled && Math.abs(this.scheduled.at - atWallMs) < 50) return;
    this.cancelChime();
    const delay = (atWallMs - Date.now()) / 1000;
    if (delay < 0 || delay > 180) return;
    this.scheduled = { at: atWallMs, nodes: this.bell(ctx, ctx.currentTime + delay) };
  }

  hasScheduled(atWallMs: number): boolean {
    return !!this.scheduled && Math.abs(this.scheduled.at - atWallMs) < 50;
  }

  cancelChime() {
    if (!this.scheduled) return;
    for (const n of this.scheduled.nodes) {
      try {
        n.stop();
      } catch {
        /* ignore */
      }
    }
    this.scheduled = null;
  }

  clearScheduledMarker() {
    this.scheduled = null;
  }
}

export const sound = new SoundEngine();
