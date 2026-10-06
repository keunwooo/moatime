/**
 * The front theme's tables: the three peoples' buildings, units and ships, what they cost, when
 * each tier opens and how the army's mix shifts from cheap units to dear ones (docs/FRONT.md 3절,
 * FRONT_PROMPT.md 4절). Names are this theme's own; nothing here is read by another theme.
 */

import type { RaceId } from '../core/session';

export type { RaceId };

const MIN = 60_000;
const H = 3_600_000;

export const RACES: readonly RaceId[] = [0, 1, 2];
export const RACE_NAME: Record<RaceId, string> = { 0: '개척 연합', 1: '균사 군체', 2: '공명단' };
export const RACE_SHORT: Record<RaceId, string> = { 0: '연합', 1: '군체', 2: '공명단' };
export const RACE_MOTTO: Record<RaceId, string> = {
  0: '버티고, 고치고, 쌓아요.',
  1: '넓게 퍼지고, 빠르게 바뀌어요.',
  2: '적게 만들지만, 하나하나가 강해요.',
};

// ---- buildings ----------------------------------------------------------------------------------

export type BuildingKind =
  | 'hq'
  | 'outpost'
  | 'supply'
  | 'barracks'
  | 'gas'
  | 'wall'
  | 'tech2'
  | 'factory'
  | 'airfield'
  | 'tech3'
  | 'shipyard'
  | 'defense'
  | 'spread';

export const BUILDING_NAME: Record<RaceId, Record<BuildingKind, string>> = {
  0: {
    hq: '방주 사령부',
    outpost: '거점 모듈',
    supply: '컨테이너 보급고',
    barracks: '병영',
    gas: '정제탑',
    wall: '보급고 벽',
    tech2: '공학 연구소',
    factory: '차량 공장',
    airfield: '비행장',
    tech3: '첨단 연구소',
    shipyard: '궤도 조선소',
    defense: '벙커',
    spread: '조명탑',
  },
  1: {
    hq: '모체 둥지',
    outpost: '새 둥지',
    supply: '양분 저장낭',
    barracks: '부화 정원',
    gas: '흡수 꽃',
    wall: '가시 촉수',
    tech2: '진화 고치 둥지',
    factory: '깊은 굴',
    airfield: '포자 첨탑',
    tech3: '고대 균사핵',
    shipyard: '포자 발사 꽃',
    defense: '포자 탑',
    spread: '융단 촉',
  },
  2: {
    hq: '공명 첨탑',
    outpost: '새 첨탑',
    supply: '소리굽쇠 오벨리스크',
    barracks: '소환문',
    gas: '증류 결정',
    wall: '공명 결정포',
    tech2: '공명 서고',
    factory: '하늘 정원',
    airfield: '노래 회랑',
    tech3: '성가 제단',
    shipyard: '천공의 닻',
    defense: '방어막 첨탑',
    spread: '오벨리스크',
  },
};

/** Ore / heat / time-crystal cost of each building. */
export const BUILDING_COST: Record<BuildingKind, [number, number, number]> = {
  hq: [400, 0, 0],
  outpost: [300, 0, 0],
  supply: [100, 0, 0],
  barracks: [150, 0, 0],
  gas: [75, 0, 0],
  wall: [100, 0, 0],
  tech2: [150, 100, 0],
  factory: [200, 100, 0],
  airfield: [150, 150, 0],
  tech3: [250, 200, 0],
  shipyard: [400, 300, 0],
  defense: [125, 0, 0],
  spread: [50, 0, 0],
};

/** Construction time of a building (its stages are drawn over this time). */
export const BUILD_MS: Record<BuildingKind, number> = {
  hq: 150_000,
  outpost: 150_000,
  supply: 60_000,
  barracks: 70_000,
  gas: 50_000,
  wall: 50_000,
  tech2: 90_000,
  factory: 90_000,
  airfield: 90_000,
  tech3: 120_000,
  shipyard: 25 * MIN,
  defense: 60_000,
  spread: 40_000,
};

// ---- units and ships ----------------------------------------------------------------------------

/** Ground and air units of the army (the worker and scout are not part of the army mix). */
export type ArmyKind = 't1' | 't1b' | 't2' | 't2s' | 't3' | 't3a';
export type ShipKind = 's1' | 's2' | 's3';
export type UnitKind = 'worker' | 'scout' | ArmyKind | ShipKind;

export const ARMY_KINDS: readonly ArmyKind[] = ['t1', 't1b', 't2', 't2s', 't3', 't3a'];
export const SHIP_KINDS: readonly ShipKind[] = ['s1', 's2', 's3'];

export const UNIT_NAME: Record<RaceId, Record<UnitKind, string>> = {
  0: {
    worker: '엑소 정비공',
    scout: '정찰차',
    t1: '소총병',
    t1b: '방패병',
    t2: '황새',
    t2s: '견인포',
    t3: '거북',
    t3a: '매',
    s1: '바다제비',
    s2: '물마루',
    s3: '새 방주',
  },
  1: {
    worker: '채집충',
    scout: '정찰 포자',
    t1: '질주충',
    t1b: '가시 투척충',
    t2: '굴착충',
    t2s: '포자 해파리',
    t3: '갑각 거수',
    t3a: '포자 폭격체',
    s1: '별 해파리 떼',
    s2: '포자 고래',
    s3: '떠도는 모체',
  },
  2: {
    worker: '조율 구체',
    scout: '떠도는 눈',
    t1: '결정 검사',
    t1b: '화음 궁수',
    t2: '공명 수호자',
    t2s: '떠도는 프리즘',
    t3: '백자 수문장',
    t3a: '청자 날개',
    s1: '물방울',
    s2: '달항아리',
    s3: '천공의 성가대',
  },
};

/** Units that fly (drawn above the ground, not sorted with it). */
export function flies(race: RaceId, k: UnitKind): boolean {
  if (k === 't3a' || k === 's1' || k === 's2' || k === 's3') return true;
  if (k === 't2s') return race !== 0; // the union's tier-2 special is towed artillery
  if (k === 'scout') return race !== 0;
  return race === 2 && k === 'worker';
}

/** Supply each unit takes. */
export const SUPPLY: Record<ArmyKind, number> = { t1: 1, t1b: 2, t2: 3, t2s: 3, t3: 4, t3a: 4 };

/** Ore / heat / crystal cost of each unit or ship. */
export const UNIT_COST: Record<UnitKind, [number, number, number]> = {
  worker: [50, 0, 0],
  scout: [50, 0, 0],
  t1: [50, 0, 0],
  t1b: [75, 25, 0],
  t2: [125, 50, 0],
  t2s: [150, 75, 0],
  t3: [300, 200, 0],
  t3a: [250, 200, 0],
  s1: [400, 300, 0],
  s2: [800, 600, 4],
  s3: [2000, 1500, 20],
};

// ---- tiers ----------------------------------------------------------------------------------------

/**
 * When each army kind opens (war time A). Ships open with the planets (front.ts): escorts at the
 * first planet's conquest, capital ships at 3 h, the flagship near 4 h 48 min.
 */
export const OPENS: Record<ArmyKind, number> = {
  t1: 230_000,
  t1b: 870_000,
  t2: 870_000,
  t2s: 30 * MIN,
  t3: 45 * MIN,
  t3a: 45 * MIN,
};

/** Share of tier-1 (cheap) units in the army over time; the rest is split by WEIGHT. */
const T1_SHARE: [number, number][] = [
  [0, 1],
  [870_000, 1],
  [25 * MIN, 0.58],
  [30 * MIN, 0.5],
  [45 * MIN, 0.4],
  [90 * MIN, 0.32],
  [3 * H, 0.25],
  [5 * H, 0.2],
];

const WEIGHT: Record<Exclude<ArmyKind, 't1'>, number> = { t1b: 1, t2: 1, t2s: 0.8, t3: 0.75, t3a: 0.6 };

function piecewise(pts: readonly [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (x <= x1) {
      const [x0, y0] = pts[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / Math.max(1, x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/** Share of each army kind at A (0 for kinds not open yet, `lag` delays a rival's tiers). */
export function armyShares(A: number, lag = 0): Record<ArmyKind, number> {
  const a = A - lag;
  const out: Record<ArmyKind, number> = { t1: 0, t1b: 0, t2: 0, t2s: 0, t3: 0, t3a: 0 };
  if (a < OPENS.t1) return out;
  const t1 = piecewise(T1_SHARE, a);
  out.t1 = t1;
  let wsum = 0;
  for (const k of ARMY_KINDS) if (k !== 't1' && a >= OPENS[k]) wsum += WEIGHT[k];
  if (wsum <= 0) {
    out.t1 = 1;
    return out;
  }
  for (const k of ARMY_KINDS) if (k !== 't1' && a >= OPENS[k]) out[k] = ((1 - t1) * WEIGHT[k]) / wsum;
  return out;
}

/** Size of the army (units of any kind) at A: grows fast at first, then slowly. */
export const ARMY_CURVE: [number, number][] = [
  [0, 0],
  [230_000, 1],
  [10 * MIN, 6],
  [25 * MIN, 15],
  [50 * MIN, 30],
  [90 * MIN, 45],
  [3 * H, 55],
  [5 * H, 60],
];

/**
 * The front's army stops growing here (about 17 h): past it the war's growth shows as developed
 * planets, ships and tiers, not as an ever larger number in the footer.
 */
export const ARMY_MAX = 120;

export function armySize(A: number): number {
  if (A < 230_000) return 0;
  if (A <= 5 * H) return Math.floor(piecewise(ARMY_CURVE, A) + 1e-9);
  return Math.min(ARMY_MAX, 60 + Math.floor((A - 5 * H) / (12 * MIN)));
}

/** The world time the i-th unit (0-based) of the army arrives. */
export function armyArrival(i: number): number {
  const n = i + 1;
  if (n <= 60) {
    for (let k = 1; k < ARMY_CURVE.length; k++) {
      const [x0, y0] = ARMY_CURVE[k - 1];
      const [x1, y1] = ARMY_CURVE[k];
      if (n <= y1) return Math.ceil(x0 + ((n - y0) * (x1 - x0)) / Math.max(1e-9, y1 - y0));
    }
  }
  return 5 * H + (n - 60) * 12 * MIN;
}

/** Army counts by kind at A (rounded so the counts add up to the size). */
export function armyMix(A: number, lag = 0, scale = 1): Record<ArmyKind, number> {
  const n = Math.floor(armySize(A - lag) * scale);
  const sh = armyShares(A, lag);
  const out: Record<ArmyKind, number> = { t1: 0, t1b: 0, t2: 0, t2s: 0, t3: 0, t3a: 0 };
  let left = n;
  const order = [...ARMY_KINDS].sort((a, b) => sh[b] - sh[a]);
  for (const k of order) {
    const c = Math.min(left, Math.round(sh[k] * n));
    out[k] = c;
    left -= c;
  }
  if (left > 0) out[order[0]] += left;
  return out;
}

/** Upgrade insignia (0..3). */
export const UPGRADES_AT = [12.5 * MIN, 40 * MIN, 70 * MIN];
export const upgradesAt = (A: number) => UPGRADES_AT.filter((t) => A >= t).length;

// ---- war tide -------------------------------------------------------------------------------------

export type TidePhase = 'open' | 'refit' | 'muster' | 'offensive' | 'storm';
export const TIDE_PHASES: readonly Exclude<TidePhase, 'open'>[] = ['refit', 'muster', 'offensive', 'storm'];
export const TIDE_NAME: Record<TidePhase, string> = { open: '오프닝', refit: '정비', muster: '증강', offensive: '공세', storm: '폭풍' };
/** A phase lasts 12 minutes; the cycle 48. */
export const TIDE_PHASE_MS = 12 * MIN;

// ---- planets -------------------------------------------------------------------------------------

export type BiomeId = 'karna' | 'hwiel' | 'onyx' | 'verda' | 'solen' | 'arche' | 'heart';
export const BIOMES: readonly BiomeId[] = ['karna', 'hwiel', 'onyx', 'verda', 'solen', 'arche', 'heart'];
export const BIOME_NAME: Record<BiomeId, string> = {
  karna: '카르나',
  hwiel: '휘엘',
  onyx: '오닉스',
  verda: '베르다',
  solen: '솔렌',
  arche: '아르케',
  heart: '아스테르의 심장',
};
export const BIOME_STORM: Record<BiomeId, string> = {
  karna: '모래 폭풍',
  hwiel: '눈보라',
  onyx: '화산재',
  verda: '폭우',
  solen: '결정 폭풍',
  arche: '이온 폭풍',
  heart: '시간 폭풍',
};
export const BIOME_LANDING: Record<BiomeId, string> = {
  karna: '붉은 모래 아래에서 첫 시결정이 빛나요.',
  hwiel: '얼음 밑에 잠든 고대의 문이 있어요.',
  onyx: '불의 땅이에요. 열샘이 어디에나 있어요.',
  verda: '숲이 너무 빨리 자라요. 시결정이 가까워요.',
  solen: '결정 숲이 바람에 노래해요.',
  arche: '옛 종족의 도시가 남아 있어요.',
  heart: '모든 시결정이 시작된 곳이에요.',
};

/** A developed planet grows: 0 개척, 1 도시, 2 궤도 정거장, 3 행성 요새. */
export const DEV_LEVEL_AT = [0, 2 * H, 5 * H, 10 * H];
export const DEV_LEVEL_NAME = ['개척', '도시', '궤도 정거장', '행성 요새'];
export const devLevel = (sinceConquest: number) => DEV_LEVEL_AT.filter((t) => sinceConquest >= t).length - 1;

export const SECTOR_NAME = (k: number) => (k === 0 ? '아스테르 변경' : `변경 너머 ${k}`);

export const RACE_ENDING: Record<RaceId, string> = {
  0: '방주가 마지막으로 내려앉았어요. 이제 여기가 고향이에요.',
  1: '변경 전체가 하나의 숲처럼 숨을 쉬어요.',
  2: '일곱 행성의 결정이 다시 한 화음으로 울려요.',
};
