/**
 * Raids on the colony (pure, deterministic). Most are skirmishes: a small party that probes the
 * line for about a minute and leaves light damage at most. Every third is a full raid: a larger
 * force (the light wardens among them once there are turrets), a longer fight, heavier damage
 * and, very rarely, a lost building. When a raid starts, one plan is made from the
 * seed, the raid's number and what defends the targeted outpost at that moment: who comes
 * (a sand swarm or a few light wardens), when each raider is driven off, which buildings take
 * how much damage and when, which tanks are knocked out and which guards shelter in their
 * shield capsules. The simulation applies the outcome when the raid ends; the scene replays
 * the plan by W (individual shots are derived from it, not stored).
 *
 * Nothing here is gory: swarm critters curl up and roll away or crumble into sand, wardens
 * flicker and fold away, guards sit down inside a shield and are flown back to the barracks.
 */

import { rngFor } from '../core/rng';
import { SPACE, type SpaceKind } from './config';

export type Faction = 'swarm' | 'warden';

export interface RaidPlan {
  /** Raid number (0 = first). */
  n: number;
  /** A full raid (otherwise a skirmish). */
  full: boolean;
  faction: Faction;
  /** Targeted outpost (cluster) and the side the raiders come from (+1 / −1 in x). */
  c: number;
  side: number;
  /** Approach starts, fighting starts, the raiders fall back, all gone. */
  t0: number;
  tFight: number;
  tBack: number;
  t1: number;
  /** Each raider: its lane across the front (0..1) and when it is driven off (−1: it falls back with the rest). */
  raiders: { lane: number; down: number }[];
  /** Defenders on the line when it started. */
  tanks: number;
  inf: number;
  turrets: number[];
  /** Damage steps: building `u` reaches `level` at `t`. */
  hits: { t: number; u: number; level: number }[];
  /** Tanks knocked out (index in the line) and guards who shelter, with when. */
  tankKo: { i: number; t: number }[];
  infShield: { i: number; t: number }[];
  /** A building left as a wreck at the end (−1 none). */
  wreck: number;
}

export interface RaidInput {
  seed: number;
  n: number;
  T: number;
  zone: number;
  /** Colony stage (1..10): before the first turret only small scouting swarms come. */
  stage: number;
  c: number;
  side: number;
  /** Finished buildings of the targeted outpost (unit and kind). */
  buildings: { u: number; kind: SpaceKind }[];
  turrets: number[];
  tanks: number;
  inf: number;
}

/** Fisher–Yates with the plan's own generator (the same order in every engine). */
function shuffled<T>(xs: T[], r: { int(a: number, b: number): number }): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** When a raid of this number may leave a wreck: one raid in each run of six (or none). */
function wreckSlot(seed: number, block: number): number {
  return rngFor(seed, block, 917).int(0, 7);
}

export function makeRaid(x: RaidInput): RaidPlan {
  const R = SPACE.raid;
  const r = rngFor(x.seed, x.n, 913);
  const early = x.stage < 6;
  const full = x.n % R.fullEvery === R.fullEvery - 1;
  const faction: Faction = full && !early && (Math.floor(x.n / R.fullEvery) % 2 === 1 || r.chance(0.3)) ? 'warden' : 'swarm';
  let count: number;
  if (!full) count = early ? 2 + r.int(0, 2) : 3 + Math.min(5, x.zone + r.int(0, 2));
  else if (early) count = 4 + r.int(0, 2) + Math.min(3, x.stage - 1);
  else count = faction === 'swarm' ? 8 + Math.min(10, x.zone * 2 + r.int(0, 2)) : 2 + Math.min(3, Math.floor(x.zone / 2) + r.int(0, 1));
  const T = full ? R : R.skirmish;
  const fightMs = Math.round(r.range(T.fightMin, T.fightMax));
  const t0 = x.T;
  const tFight = t0 + T.approachMs;
  const tBack = tFight + fightMs;
  const t1 = tBack + T.retreatMs;
  // strength on both sides decides how many raiders are driven off and how much is damaged;
  // raids grow with the colony (not with how many came before, which depends on the sessions),
  // so a full garrison keeps the damage light rather than nil. The landing pod and later the
  // command centre have point defence of their own.
  const defence = x.turrets.length * 3 + x.tanks * 2 + x.inf * 0.5 + 2;
  const attack = (faction === 'swarm' ? count : count * 3) * (1 + 0.25 * Math.min(12, x.zone) + 0.15 * Math.max(0, x.stage - 5));
  const ratio = attack / (attack + defence);
  const held = Math.min(1, Math.max(0.3, 1 - ratio * 0.8));
  // a skirmish leaves light damage at most
  const severity = Math.min(1, Math.max(0, ratio * 1.4 - 0.3 + r.range(-0.1, 0.2))) * (full ? 1 : 0.55);
  const downN = Math.round(held * count);
  const raiders: RaidPlan['raiders'] = [];
  for (let i = 0; i < count; i++) {
    const lane = (i + r.range(0.15, 0.85)) / count;
    raiders.push({ lane, down: -1 });
  }
  // the ones driven off go down one by one over the fight, the first after a few seconds
  const order = shuffled(raiders.map((_, i) => i), r);
  for (let k = 0; k < downN; k++) {
    const q = (k + 1) / (downN + 1);
    raiders[order[k]].down = Math.round(tFight + 4000 + q * (fightMs - 6000) * (0.6 + 0.4 * (1 - held)));
  }
  // buildings: the nearest finished ones on the raiders' side take the hits
  const hits: RaidPlan['hits'] = [];
  let wreck = -1;
  const targets = shuffled(x.buildings, r).slice(0, full ? 2 : 1);
  if (targets.length > 0 && severity > 0) {
    const main = targets[0];
    const top = Math.min(full ? 4 : 2, 1 + Math.round(severity * 3));
    for (let lv = 1; lv <= top; lv++) hits.push({ t: Math.round(tFight + (lv / (top + 1)) * fightMs), u: main.u, level: lv });
    if (targets[1]) {
      const second = Math.min(3, Math.floor(severity * 2.5));
      for (let lv = 1; lv <= second; lv++) hits.push({ t: Math.round(tFight + ((lv + 0.5) / (second + 2)) * fightMs), u: targets[1].u, level: lv });
    }
    // very rarely the worst-hit building is lost (one raid in six at most; never the command centre)
    if (full && top >= 4 && main.kind !== 'command' && Math.floor(x.n / R.fullEvery) % 6 === wreckSlot(x.seed, Math.floor(x.n / (R.fullEvery * 6)))) wreck = main.u;
  }
  hits.sort((a, b) => a.t - b.t);
  const tankKo: RaidPlan['tankKo'] = [];
  const ko = Math.min(x.tanks, full ? Math.round(severity * 2.5) : 0);
  for (let k = 0; k < ko; k++) tankKo.push({ i: x.tanks - 1 - k, t: Math.round(tFight + r.range(0.35, 0.9) * fightMs) });
  const infShield: RaidPlan['infShield'] = [];
  const shelter = Math.min(x.inf, Math.round(attack * 0.25 * severity + (severity > 0 ? r.int(0, 1) : 0)));
  for (let k = 0; k < shelter; k++) infShield.push({ i: (k * 5 + r.int(0, 4)) % Math.max(1, x.inf), t: Math.round(tFight + r.range(0.25, 0.95) * fightMs) });
  return { n: x.n, full, faction, c: x.c, side: x.side, t0, tFight, tBack, t1, raiders, tanks: x.tanks, inf: x.inf, turrets: x.turrets, hits, tankKo, infShield, wreck };
}

/** Damage level of building u at time W in a plan (0 if untouched yet). */
export function raidLevel(p: RaidPlan, u: number, W: number): number {
  let lv = 0;
  for (const h of p.hits) if (h.u === u && h.t <= W) lv = Math.max(lv, h.level);
  return lv;
}

export const FACTION_NAME: Record<Faction, string> = { swarm: '모래 떼', warden: '빛 수호체' };
