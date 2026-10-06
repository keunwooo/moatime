/**
 * The headline events of both worlds (see timeline.ts for how they are placed). Kinds were
 * added phase by phase: forest wildlife (Phase 4), planet weather, sky sights and rare sights
 * (Phase 9). Raids are not here: they come from the colony simulation (sim/raid.ts), which
 * keeps them clear of these events.
 *
 * Eligibility reads only world time (time of day, season, weather): the same seed and W give
 * the same events whatever happened in the sessions. Progress conditions (a sight that needs
 * a colony of stage 8, an elder tree) are applied where the event is shown.
 */

import { hash32 } from '../core/rng';
import { dayAt } from './clock';
import { SEASON } from '../sim/config';
import { seasonAt } from './season';
import { BLOCK_MS, eventOfBlock, PRIORITY, type EventDef } from './timeline';
import { weatherAt } from './weather';

const MIN = 60_000;
const night = (W: number, theme: 'forest' | 'space') => dayAt(theme, W).phase === 'night';
const daytime = (W: number, theme: 'forest' | 'space') => {
  const d = dayAt(theme, W);
  return d.phase === 'day' && d.sun.elev > 0.15;
};

/** The single spring block of each year in which the old tree blossoms. */
function blossomBlock(seed: number, W: number): number {
  const year = Math.floor(Math.max(0, W) / SEASON.yearMs);
  // spring is the first quarter of the year; pick one block in its middle part
  const first = Math.ceil((year * SEASON.yearMs + SEASON.yearMs * 0.03) / BLOCK_MS);
  const last = Math.floor((year * SEASON.yearMs + SEASON.yearMs * 0.2) / BLOCK_MS);
  return first + ((hash32(seed, year, 0xb10) >>> 0) % Math.max(1, last - first + 1));
}

const firstSnowMemo = new Map<string, number>();

/** When the first snow of W's year begins (−1 if that year has none); 3-minute resolution. */
export function firstSnowTime(seed: number, W: number): number {
  const year = Math.floor(Math.max(0, W) / SEASON.yearMs);
  const key = `${seed}:${year}`;
  const hit = firstSnowMemo.get(key);
  if (hit !== undefined) return hit;
  let at = -1;
  for (let t = year * SEASON.yearMs; t < (year + 1) * SEASON.yearMs; t += 3 * MIN) {
    if (weatherAt('forest', seed, t).snow >= 0.3) {
      at = t;
      break;
    }
  }
  if (firstSnowMemo.size > 200) firstSnowMemo.clear();
  firstSnowMemo.set(key, at);
  return at;
}

const FLARE: EventDef[] = [
  {
    kind: 'solarFlare',
    theme: 'space',
    prio: PRIORITY.WEATHER,
    grid: 5,
    chance: 0.5,
    durMs: [90_000, 120_000],
    eligible: (c) => daytime(c.W, 'space'),
  },
];

export const EVENT_DEFS: EventDef[] = [
  // ---------------------------------------------------------------- forest
  {
    // a deer crosses far behind the clearing at dawn or dusk (the forest must have wildlife:
    // the scene shows it only from stage 8)
    kind: 'deer',
    theme: 'forest',
    prio: PRIORITY.RARE,
    grid: 2,
    chance: 0.8,
    durMs: [90_000, 120_000],
    eligible: (c) => {
      const d = dayAt('forest', c.W);
      return d.phase === 'dawn' || d.phase === 'dusk' || (d.phase === 'day' && d.sun.elev < 0.4);
    },
  },
  {
    // a rainbow right after a shower in spring or summer, with the sun out
    kind: 'rainbow',
    theme: 'forest',
    prio: PRIORITY.RARE,
    grid: 1,
    chance: 0.9,
    durMs: [3 * MIN, 5 * MIN],
    eligible: (c) => {
      if (!daytime(c.W, 'forest') || seasonAt(c.W) > 1) return false;
      const now = weatherAt('forest', c.seed, c.W);
      if (now.rain > 0.1 || now.cloud > 0.6) return false;
      // it rained in the last quarter of an hour
      for (const back of [3, 6, 9, 12, 15]) if (weatherAt('forest', c.seed, c.W - back * MIN).rain > 0.3) return true;
      return false;
    },
  },
  {
    // fireflies gather in a swarm over the clearing on a summer night (stage 4 and up)
    kind: 'fireflies',
    theme: 'forest',
    prio: PRIORITY.RARE,
    grid: 2,
    chance: 0.6,
    durMs: [5 * MIN, 7 * MIN],
    eligible: (c) => seasonAt(c.W) === 1 && night(c.W, 'forest'),
  },
  {
    // the first snow of the year (the snow itself is weather; this marks the moment)
    kind: 'firstSnow',
    theme: 'forest',
    prio: PRIORITY.RARE,
    grid: 1,
    chance: 1,
    durMs: [4 * MIN, 6 * MIN],
    // the event starts a little after the first flakes of the year, inside the same block
    eligible: (c) => {
      const f = firstSnowTime(c.seed, c.W);
      return f >= 0 && f >= c.block * BLOCK_MS && f <= c.W && c.W - f < 12 * MIN;
    },
  },
  {
    // the old tree blossoms once each spring (stage 9 and up)
    kind: 'blossom',
    theme: 'forest',
    prio: PRIORITY.RARE,
    grid: 1,
    chance: 1,
    durMs: [6 * MIN, 8 * MIN],
    eligible: (c) => c.block === blossomBlock(c.seed, c.W) && daytime(c.W, 'forest'),
  },
  // ---------------------------------------------------------------- space: planet weather
  {
    kind: 'dustStorm',
    theme: 'space',
    prio: PRIORITY.WEATHER,
    grid: 3,
    chance: 0.5,
    durMs: [4 * MIN, 6 * MIN],
  },
  {
    kind: 'elecStorm',
    theme: 'space',
    prio: PRIORITY.WEATHER,
    grid: 4,
    chance: 0.45,
    durMs: [3 * MIN, 5 * MIN],
  },
  // the sky reddens; shields go up over the outpost and the drones take shelter
  ...FLARE,
  {
    kind: 'aurora',
    theme: 'space',
    prio: PRIORITY.AMBIENT,
    grid: 2,
    chance: 0.7,
    durMs: [5 * MIN, 8 * MIN],
    eligible: (c) => {
      if (!night(c.W, 'space')) return false;
      // likelier on a night after a solar flare
      for (let b = c.block - 3; b < c.block; b++) if (eventOfBlock(FLARE, 'space', c.seed, b)) return true;
      return (hash32(c.seed, c.block, 0xa0) >>> 0) / 4294967296 < 0.7;
    },
  },
  // ---------------------------------------------------------------- space: sky sights
  {
    kind: 'meteorShower',
    theme: 'space',
    prio: PRIORITY.RARE,
    grid: 6,
    chance: 0.5,
    durMs: [110_000, 130_000],
    eligible: (c) => dayAt('space', c.W).phase !== 'day',
  },
  {
    kind: 'comet',
    theme: 'space',
    prio: PRIORITY.RARE,
    grid: 8,
    chance: 0.5,
    durMs: [150_000, 180_000],
  },
  {
    kind: 'bigShip',
    theme: 'space',
    prio: PRIORITY.RARE,
    grid: 6,
    chance: 0.45,
    durMs: [70_000, 90_000],
  },
  {
    // a far fleet of strange craft passes high and quietly (they never come near)
    kind: 'fleet',
    theme: 'space',
    prio: PRIORITY.RARE,
    grid: 10,
    chance: 0.45,
    durMs: [80_000, 100_000],
  },
  {
    // a colony ship comes down near the newest outpost (stage 8 and up)
    kind: 'colonyShip',
    theme: 'space',
    prio: PRIORITY.RARE,
    grid: 6,
    chance: 0.5,
    durMs: [120_000, 150_000],
  },
  {
    // a new satellite goes up from the colony (stage 9 and up)
    kind: 'satellite',
    theme: 'space',
    prio: PRIORITY.RARE,
    grid: 8,
    chance: 0.5,
    durMs: [80_000, 100_000],
  },
];

/** Progress a sight needs before it is shown (the timeline itself does not know progress). */
const NEEDS: Record<string, number> = { deer: 8, fireflies: 4, blossom: 9, colonyShip: 8, satellite: 9 };

/** Is this event shown in a world at this stage (forest stage or colony stage)? */
export function eventShown(kind: string, stage: number): boolean {
  return stage >= (NEEDS[kind] ?? 0);
}

/** Words for the status line and the details panel. */
export const EVENT_TEXT: Record<string, { name: string; line: string }> = {
  deer: { name: '사슴', line: '사슴 한 마리가 공터 뒤를 천천히 지나가요.' },
  rainbow: { name: '무지개', line: '비가 그친 하늘에 무지개가 떴어요.' },
  fireflies: { name: '반딧불 무리', line: '여름밤 공터에 반딧불이 무리 지어 날아요.' },
  firstSnow: { name: '첫눈', line: '올해 첫눈이 내려요.' },
  blossom: { name: '고목 개화', line: '오래된 나무에 꽃이 활짝 피었어요.' },
  dustStorm: { name: '먼지 폭풍', line: '먼지 폭풍이 지나가요 — 작업 드론은 계속 일해요.' },
  elecStorm: { name: '전기 폭풍', line: '먼 구름 사이로 희미한 방전이 일어요.' },
  solarFlare: { name: '태양 플레어', line: '태양 플레어가 와요 — 방어막을 펴고 드론이 잠시 대피해요.' },
  aurora: { name: '오로라', line: '밤하늘에 오로라가 천천히 흔들려요.' },
  meteorShower: { name: '유성우', line: '먼 하늘에 유성우가 쏟아져요.' },
  comet: { name: '혜성', line: '혜성 하나가 먼 하늘을 천천히 건너가요.' },
  bigShip: { name: '대형 우주선', line: '커다란 우주선이 높은 하늘을 지나가요.' },
  fleet: { name: '먼 함대', line: '낯선 함대가 아주 멀리서 조용히 지나가요.' },
  colonyShip: { name: '이주선', line: '이주선이 새 전초기지 근처에 내려앉아요.' },
  satellite: { name: '위성 발사', line: '콜로니가 새 위성을 쏘아 올려요.' },
};
