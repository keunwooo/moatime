/**
 * Which stage is on view (FRONT_PROMPT.md 13.5절): the ground of the planet fought for, its orbit
 * while the orbit is being won, and the switches —
 * - a battle on another planet: 10 s before it the view draws back to the system (5 s), closes on
 *   that planet (5 s), shows the battle, stays 20 s, and comes home the same way;
 * - an orbit battle over the front planet: the view lifts from the ground to the orbit and back;
 * - a planet's conquest: the system for 30 s; the start of an orbit phase: ground → system → orbit;
 *   a landing: orbit → ground.
 * With the auto camera off or animation off there is no switch: the stage on view stays put (an
 * away battle is told in words only). Weights are smooth so the stages cross-fade.
 */

import { frontPlanet, milestones, planetsTo, planetWorks, workerTimes, type BaseState, type FrontView } from '../../../sim/front';
import { armyMix, armySize } from '../../../sim/frontPlan';
import type { Battle } from '../../../world/front';
import { sm, type FrontFrame } from '../frame';

export interface StageMix {
  ground: number;
  orbit: number;
  system: number;
  /** Planet shown on the ground stage and on the orbit stage. */
  groundPlanet: number;
  orbitPlanet: number;
  /** The battle the orbit stage replays (if any). */
  orbitBattle: Battle | null;
  /** The planet ringed on the system map (an away battle), −1 none. */
  ringPlanet: number;
}

const S = 1000;

export function stageMix(f: FrontFrame, battles: readonly Battle[], allowSwitch: boolean): StageMix {
  const v = f.v;
  const A = v.A;
  const W = f.W;
  const front = v.planet.idx;
  const base: 'ground' | 'orbit' = v.orbit ? 'orbit' : 'ground';
  const basePlanet = v.orbit ? v.orbit.idx : front;
  const out: StageMix = {
    ground: base === 'ground' ? 1 : 0,
    orbit: base === 'orbit' ? 1 : 0,
    system: 0,
    groundPlanet: front,
    orbitPlanet: basePlanet,
    orbitBattle: f.battle && f.battle.stage === 'orbit' && !f.battle.away ? f.battle : null,
    ringPlanet: -1,
  };
  const setBase = (k: number) => {
    out.ground = base === 'ground' ? k : 0;
    out.orbit = base === 'orbit' ? k : 0;
  };

  // the start of an orbit phase and a landing (state changes, always shown; a cut without motion)
  const p = frontPlanet(v.seed, A);
  const next = planetsTo(v.seed, A)[p.idx + 1];
  if (next && next.orbitAt >= 0 && A >= next.orbitAt && A < next.orbitAt + 12 * S) {
    if (!allowSwitch) return out;
    const s = (A - next.orbitAt) / S;
    // ground fades into the system (0–5 s), the system into the orbit (5–12 s)
    out.ground = 1 - sm(0, 5, s);
    out.groundPlanet = front;
    out.system = sm(0, 5, s) * (1 - sm(6, 12, s));
    out.orbit = sm(6, 12, s);
    out.orbitPlanet = next.idx;
    return out;
  }
  if (p.idx > 0 && A >= p.landAt && A < p.landAt + 8 * S && allowSwitch) {
    const s = (A - p.landAt) / S;
    out.orbit = 1 - sm(0, 8, s);
    out.orbitPlanet = p.idx;
    out.ground = sm(0, 8, s);
    return out;
  }
  // a conquest: the planet turns my colour on the system map
  for (const m of milestones(v.seed, A + 3600_000)) {
    if (m.A > A) break;
    if (m.id === 'conquest' && A < m.A + 30 * S && allowSwitch) {
      const s = (A - m.A) / S;
      out.system = sm(0, 5, s) * (1 - sm(25, 30, s));
      setBase(1 - out.system);
      return out;
    }
  }
  if (!allowSwitch) return out;

  // a battle elsewhere (or over the front planet's orbit)
  for (const b of battles) {
    if (b.t0 - 10 * S > W) break;
    if (W > b.t1 + 30 * S) continue;
    const D = (b.t1 - b.t0) / S;
    if (b.away) {
      const s = (W - (b.t0 - 10 * S)) / S;
      const toSys = sm(0, 5, s);
      const toTarget = sm(5, 10, s);
      const backSys = sm(D + 30, D + 35, s);
      const backBase = sm(D + 35, D + 40, s);
      const target = toTarget * (1 - backSys);
      const sys = toSys * (1 - toTarget) + backSys * (1 - backBase);
      const home = (1 - toSys) + backBase;
      out.system = sys;
      out.ringPlanet = b.planet;
      setBase(Math.min(1, home));
      if (b.stage === 'ground') {
        // the ground shows the other planet while it is the target (its base fades out first)
        if (toSys >= 1 && backBase <= 0) {
          out.ground = target;
          out.groundPlanet = b.planet;
          out.orbit = 0;
        }
      } else {
        out.orbit = (base === 'orbit' ? Math.min(1, home) : 0) + target;
        out.orbitPlanet = target > 0 ? b.planet : basePlanet;
        out.orbitBattle = W >= b.t0 && W < b.t1 ? b : null;
      }
      return out;
    }
    if (b.stage === 'orbit' && base === 'ground') {
      // over the front planet: lift to the orbit 4 s before, back 6 s after
      const up = sm(-4, 0, (W - b.t0) / S) * (1 - sm(0, 6, (W - b.t1) / S));
      out.orbit = up;
      out.ground = 1 - up;
      out.orbitPlanet = front;
      out.orbitBattle = W >= b.t0 && W < b.t1 ? b : null;
      return out;
    }
  }
  return out;
}

/** A developed planet as it stands now: every base built, every site held, a garrison. */
export function awayView(v: FrontView, idx: number): FrontView {
  const p = planetsTo(v.seed, v.A)[idx];
  const works = planetWorks(p);
  const bases: BaseState[] = [];
  works.bases.forEach((b, i) => {
    if (b.lostAt >= 0) return;
    bases.push({ i, site: b.site, lostAt: -1, u: 1, age: 3600, lost: false });
  });
  const ok = new Set(bases.map((b) => b.i));
  return {
    ...v,
    planet: p,
    orbit: null,
    beat: null,
    reland: null,
    owners: v.owners.map(() => 0),
    since: v.since.map(() => p.landAt),
    share: 1,
    bases,
    builds: works.builds.filter((b) => ok.has(b.base)).map((b) => ({ ...b, u: 1 })),
    workers: workerTimes(p),
    army: armyMix(v.A, 0, 0.4),
    armyN: Math.floor(armySize(v.A) * 0.4),
    capture: null,
  };
}
