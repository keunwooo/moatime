/**
 * One-line status text generated from the simulated work (never from session percentages),
 * plus numbers for the small detail view and the session summary.
 */

import type { ThemeId } from '../core/session';
import { FOREST, RES, SPACE, type Amt, type Res, type SpaceKind } from './config';
import { barrelAt, compostAt, elderAge, forestStage, forestUnitProgress, FOREST_STAGE_NAMES, groundAt, pondAt, pondFill, type ForestSim } from './forest';
import { seasonAt, SEASON_NAMES } from '../world/season';
import { amtTotal, colonyName, depotCapacity, gridLevel, rareAt, spaceStage, SPACE_STAGE_NAMES, type SpaceSim } from './space';
import type { Step } from './types';
import { FACTION_NAME } from './raid';
import { EVENT_TEXT, eventShown } from '../world/events';
import { headlineAt } from '../world/pace';
import { kindOf } from './spacePlan';
import type { CosmosSim } from './cosmos';
import { cosmosDetailRows, cosmosLine, cosmosShownEvent } from './cosmosDescribe';

export type AnySim = ForestSim | SpaceSim | CosmosSim;

export const KIND_NAME: Record<SpaceKind, string> = {
  generator: '발전기',
  extractor: '채굴기',
  habitat: '거주 모듈',
  storage: '저장고',
  command: '사령부',
  research: '연구소',
  turret: '방어 포탑',
  barracks: '병영',
  factory: '공장',
  relay: '중계탑',
  dish: '위성 접시',
  greenhouse: '온실',
  dome: '돔 거주지',
};

export const RES_NAME: Record<Res, string> = { m: '금속', c: '결정', r: '희귀 광물' };

const resOfC = (c: string): Res | null => {
  const t = c.slice(c.indexOf('-') + 1);
  return t === 'm' || t === 'c' || t === 'r' ? t : null;
};

function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

const eul = (w: string) => w + (hasBatchim(w) ? '을' : '를');
const ui = (w: string) => `${w}의`;
const ga = (w: string) => w + (hasBatchim(w) ? '이' : '가');
const ege = (w: string) => `${w}에`;

const ORD = ['첫', '두 번째', '세 번째', '네 번째', '다섯 번째', '여섯 번째', '일곱 번째', '여덟 번째', '아홉 번째', '열 번째'];

/** "첫 나무", "두 번째 나무", … "37번째 나무". */
export function ordinalTree(unit: number): string {
  return unit < ORD.length ? `${ORD[unit]} 나무` : `${unit + 1}번째 나무`;
}

function stepAt(w: { step: Step | null }, W: number): Step | null {
  const s = w.step;
  return s && W >= s.t0 ? s : null;
}

// ---- space ------------------------------------------------------------------

function partsLine(kind: SpaceKind): string {
  switch (kind) {
    case 'generator':
      return '발전기에 발전판과 전력 장치를 달고 있어요.';
    case 'extractor':
      return '채굴기에 드릴 팔을 달고 있어요.';
    case 'habitat':
    case 'dome':
      return `${KIND_NAME[kind]}에 출입구와 창을 달고 있어요.`;
    case 'storage':
      return '저장고에 적재 선반을 넣고 있어요.';
    case 'command':
      return '사령부에 통제 장비를 들이고 있어요.';
    case 'research':
      return '연구소에 관측 장비를 설치하고 있어요.';
    case 'turret':
      return '방어 포탑에 포신과 센서를 달고 있어요.';
    case 'barracks':
      return '병영에 장비 보관대를 들이고 있어요.';
    case 'factory':
      return '공장에 조립 라인을 설치하고 있어요.';
    case 'relay':
    case 'dish':
      return `${KIND_NAME[kind]}에 안테나를 세우고 있어요.`;
    case 'greenhouse':
      return '온실에 유리판을 끼우고 있어요.';
  }
}

export function spaceLine(s: SpaceSim, W: number): string {
  const p = s.proj;
  const name = KIND_NAME[p.kind];
  // a raid is the story while it lasts, then the guards being fetched and the repairs
  const rd = s.raid;
  if (rd && W >= rd.t0 && W < rd.t1) {
    const who = FACTION_NAME[rd.faction];
    if (!rd.full) {
      if (W < rd.tFight) return `${who} 정찰대가 다가와요 — 방어 드론이 막으러 나가요.`;
      if (W < rd.tBack) return `${who} 정찰대와 작은 교전을 벌이고 있어요.`;
      return `${who} 정찰대가 물러가요.`;
    }
    const def = rd.turrets.length > 0 ? '포탑과 경비대가' : rd.tanks > 0 ? '탱크와 경비대가' : rd.inf > 0 ? '경비대가' : '방어 드론이';
    if (W < rd.tFight) return `${who}가 대거 몰려와요 — 주둔군이 막으러 나가요.`;
    if (W < rd.tBack) return `${who}와 맞서고 있어요 — ${def} 막고 있어요.`;
    return `${who}가 물러가요.`;
  }
  if (rd && rd.infShield.length > 0 && W >= rd.t1 && W < rd.t1 + 3000 + rd.infShield.length * 2500 + 4000) return '구급 드론이 보호막 속 경비대원을 병영으로 데려가요.';
  const fixing = s.crew.find((r) => r.step && W >= r.step.t0 && W < r.step.t1 && (r.step.k === 'repair' || r.step.k === 'clear' || r.step.k === 'rebuild'));
  if (fixing && fixing.step) {
    const k = KIND_NAME[kindOf(s.seed, fixing.step.ref, s.legacyUnits, s.v1Units)];
    if (fixing.step.k === 'repair') return `정비 드론이 ${k}의 손상을 고치고 있어요.`;
    if (fixing.step.k === 'clear') return `정비 드론이 무너진 ${k} 잔해를 치우고 있어요.`;
    return `정비 드론이 ${eul(k)} 다시 짓고 있어요.`;
  }
  const flying = s.crew.find((r) => r.step && r.step.k === 'drive' && r.step.ref >= 0 && W >= r.step.t0 && W < r.step.t1);
  if (flying && flying.step) return `정비 드론이 ${KIND_NAME[kindOf(s.seed, flying.step.ref, s.legacyUnits, s.v1Units)]} 쪽으로 날아가고 있어요.`;
  // expansion is the story while the camera shows it: the scout's flight, then the power line
  const sc = s.scout;
  if (sc && W >= sc.t0 && W < sc.t1 + 6000) {
    const { flyMs, scanMs } = SPACE.scout;
    if (W < sc.t0 + flyMs) return '정찰 드론이 새 자원 지대를 찾아 날아가고 있어요.';
    if (W < sc.t0 + flyMs + scanMs) return '정찰 드론이 새 전초기지 자리를 돌며 광맥을 살피고 있어요.';
    return '정찰 드론이 새 전초기지 자리에 표지를 내려놓았어요.';
  }
  const layer = s.rovers.find((r) => r.step && r.step.k === 'link' && W >= r.step.t0 && W < r.step.t1);
  if (layer) return '작업 드론이 앞 전초기지에서 새 전초기지까지 전력선을 깔고 있어요.';
  // the assembly in progress is the main story
  if (p.building && p.st1 > p.st0 && W >= p.st0 && W < p.st1) {
    switch (SPACE.stages[p.stage]?.id) {
      case 'marking':
        return `작업 드론이 ${name} 자리를 재고 윤곽을 표시하고 있어요.`;
      case 'foundation':
        return `${ui(name)} 기초를 다지고 있어요.`;
      case 'floor':
        return `${ui(name)} 바닥 프레임을 놓고 있어요.`;
      case 'frame':
        return `${ui(name)} 골조를 세우고 있어요.`;
      case 'walls':
        return `${ui(name)} 외벽 패널을 붙이고 있어요.`;
      case 'parts':
        return partsLine(p.kind);
      case 'power':
        return `${ege(name)} 전력을 잇고 불을 켜고 있어요.`;
      case 'inspect':
        return `작업 드론이 새 ${eul(name)} 점검하고 있어요.`;
    }
  }
  const r = s.rovers[0];
  const st = r ? stepAt(r, W) : null;
  if (!st) return '작업 드론이 일을 시작하려 해요.';
  const t = resOfC(st.c);
  const rn = t ? RES_NAME[t] : '광물';
  switch (st.k) {
    case 'drive':
      if (st.c.startsWith('ore')) return `캐낸 ${eul(rn)} 저장소로 나르고 있어요.`;
      if (st.c.startsWith('crate')) return `${rn} 자재를 ${name} 공사 현장으로 옮기고 있어요.`;
      if (r.job === 'mine') return '작업 드론이 자원 지대로 가고 있어요.';
      if (r.job === 'charge') return '작업 드론이 충전하러 가고 있어요.';
      if (r.job === 'haul') return '저장소에서 자재를 가지러 가고 있어요.';
      if (r.job === 'build' || r.job === 'inspect') return `${name} 공사 현장으로 가고 있어요.`;
      if (r.job === 'setup') return '새 전초기지 자리로 가고 있어요.';
      if (r.job === 'care') return '온실을 돌보러 가고 있어요.';
      if (r.job === 'assist') return `${name} 조립을 도우러 가고 있어요.`;
      if (r.job === 'patrol') return '완성된 건물을 점검하러 가고 있어요.';
      return '작업 드론이 다음 작업 자리로 가고 있어요.';
    case 'survey':
      return '새 자원 지대를 살펴보고 있어요.';
    case 'drill':
      return t === 'c' ? '결정 군락을 캐고 있어요.' : t === 'r' ? '희귀 광물 맥을 캐고 있어요.' : '금속 광맥을 캐고 있어요.';
    case 'loadOre':
      return `캐낸 ${eul(rn)} 적재함에 싣고 있어요.`;
    case 'unload':
      return `저장소에 ${eul(rn)} 내려놓고 있어요.`;
    case 'pick':
      return `${name}에 쓸 ${rn} 자재를 챙기고 있어요.`;
    case 'drop':
      return '공사 현장에 자재를 내려놓고 있어요.';
    case 'charge':
      return s.counts.generator > 0 ? '발전기 전력으로 작업 드론을 충전하고 있어요.' : '착륙선 배터리로 작업 드론을 충전하고 있어요.';
    case 'setup':
      return '새 전초기지의 저장소 자리를 표시하고 있어요.';
    case 'care':
      return '온실 식물을 돌보고 있어요.';
    case 'build':
      return `${ga(name)} 조립되고 있어요.`;
    case 'assist':
      return `작업 드론 둘이 함께 ${eul(name)} 조립하고 있어요.`;
    case 'patrol':
      return '작업 드론이 완성된 건물을 둘러보며 점검하고 있어요.';
    default:
      if (p.reservedAt < 0) return `${name}에 필요한 자원이 모이길 기다려요.`;
      return '작업 드론이 다음 작업을 고르고 있어요.';
  }
}

// ---- forest -----------------------------------------------------------------

export function forestLine(s: ForestSim, W: number): string {
  const tr = s.tree;
  const tree = ordinalTree(tr.unit);
  const k = s.keeper;
  const st = stepAt(k, W);
  const g = forestUnitProgress(s, tr.unit, W);
  const growthLine = (): string | null => {
    if (g === null) return null;
    if (tr.phase === 2) return `${ga(tree)} 물을 기다리고 있어요.`;
    if (g < 0.036) return '새싹이 흙을 밀고 올라오고 있어요.';
    if (g < 0.07) return '접혀 있던 첫 잎이 펼쳐지고 있어요.';
    if (g < 0.22) return '어린 줄기에 잎이 하나씩 돋고 있어요.';
    if (g < 0.5) return '줄기가 단단해지고 가지가 뻗고 있어요.';
    return `${tree}의 수관이 풍성해지고 있어요.`;
  };
  // the very first moments of a sprout are the story, unless the keeper is caring for it
  const keyMoment = g !== null && g > 0.008 && g < 0.065 && tr.phase === 1;
  if (keyMoment && !(st && (st.k === 'water' || st.k === 'protect') && st.ref === tr.unit)) return growthLine()!;
  if (!st) return growthLine() ?? '숲지기가 일을 시작하려 해요.';
  switch (st.k) {
    case 'takeSeed':
      return k.job === 'bed' ? '꽃밭에 뿌릴 씨앗을 꺼내고 있어요.' : '바구니에서 씨앗을 하나 꺼내고 있어요.';
    case 'fill':
      return st.a.startsWith('r') ? '빗물받이 통에서 물을 받고 있어요.' : st.a.startsWith('a') ? '물길 끝 웅덩이에서 물을 긷고 있어요.' : '샘에서 물을 긷고 있어요.';
    case 'clear':
      if (k.job === 'elder') return '오래 자랄 나무를 심을 자리의 흙을 고르고 있어요.';
      return k.job === 'prep' ? '다음 공터의 흙을 고르고 있어요.' : '공터의 흙을 고르고 있어요.';
    case 'mulch':
      return k.job === 'care' ? `${tree} 둘레에 부엽토를 덮고 있어요.` : '흙에 부엽토를 섞고 있어요.';
    case 'plant':
      if (k.job === 'elder') return '이 숲의 고목이 될 나무를 심고 있어요.';
      return s.stash && s.stash.u === tr.unit ? '다람쥐가 묻어 둔 씨앗 자리에 흙을 덮고 있어요.' : '씨앗을 심고 있어요.';
    case 'water':
      if (k.job === 'elder') return '오래된 나무에 물을 주고 있어요.';
      return `${ege(tree)} 물을 주고 있어요.`;
    case 'pondDig':
      return s.pond.dug === 0 ? '공터 옆에 연못 자리를 파기 시작했어요.' : '연못을 조금 더 깊게 파고 있어요.';
    case 'pondLine':
      return '연못 가장자리에 돌을 두르고 있어요.';
    case 'protect':
      return `추위에 대비해 ${eul(tree)} 짚으로 감싸고 있어요.`;
    case 'pickSeed':
      return '나무 아래 떨어진 씨앗을 줍고 있어요.';
    case 'storeSeed':
      return '주운 씨앗을 바구니에 모으고 있어요.';
    case 'rake':
      return '낙엽을 긁어모으고 있어요.';
    case 'dump':
      return '모은 낙엽을 퇴비 더미에 붓고 있어요.';
    case 'scoop':
      return '잘 삭은 부엽토를 퍼 담고 있어요.';
    case 'spread':
      return '모은 낙엽으로 만든 부엽토로 다음 공터를 가꾸고 있어요.';
    case 'bed':
      return '부엽토와 씨앗으로 작은 꽃밭을 만들고 있어요.';
    case 'build':
      return '빗물받이 통을 세우고 있어요.';
    case 'dig':
      return '샘물을 끌어올 작은 물길을 파고 있어요.';
    case 'liftBasket':
    case 'setBench':
      return '씨앗 바구니를 새 공터로 옮기고 있어요.';
    case 'walk':
      if (st.c === 'leaf') return '모은 낙엽을 퇴비 더미로 옮기고 있어요.';
      if (st.c === 'mould') return k.job === 'bed' ? '꽃밭 자리로 부엽토를 옮기고 있어요.' : '부엽토를 다음 공터로 옮기고 있어요.';
      if (st.c === 'seedbox') return '씨앗 바구니를 새 공터로 옮기고 있어요.';
      if (st.c === 'seed' && k.job === 'seeds') return '주운 씨앗을 바구니로 가져가고 있어요.';
      if (st.b.startsWith('w') || st.b.startsWith('r') || st.b.startsWith('a')) return '물을 길으러 가고 있어요.';
      if (k.job === 'plant') return `${tree}를 심을 자리로 가고 있어요.`;
      if (k.job === 'care') return `${ege(tree)} 물을 주러 가고 있어요.`;
      if (k.job === 'leaves') return '낙엽이 쌓인 나무 아래로 가고 있어요.';
      if (k.job === 'seeds') return '떨어진 씨앗을 주우러 가고 있어요.';
      if (k.job === 'pond') return '연못 자리로 가고 있어요.';
      if (k.job === 'elder') return st.c === 'seed' ? '오래 자랄 나무를 심으러 가고 있어요.' : '오래된 나무에 물을 주러 가고 있어요.';
      return growthLine() ?? '숲지기가 공터를 둘러보고 있어요.';
    default:
      if (tr.phase === 0 && s.seeds + s.hand <= 0 && !(s.stash && s.stash.u === tr.unit)) return '나무에서 씨앗이 떨어지길 기다리고 있어요.';
      if (s.pond.linedAt >= 0 && pondFill(s.seed, s.pond.linedAt, W) < 1 && W - s.pond.linedAt < 12 * 60_000) return '새 연못에 물이 조금씩 차오르고 있어요.';
      return growthLine() ?? '숲지기가 잠시 쉬고 있어요.';
  }
}

/** The headline event shown now (rare sights and planet weather), if any. */
export function shownEvent(theme: ThemeId, sim: AnySim, W: number): string | null {
  if (theme === 'cosmos') return cosmosShownEvent(sim as CosmosSim, W);
  const e = headlineAt(theme, sim.seed, W);
  if (!e || !EVENT_TEXT[e.kind]) return null;
  const stage = theme === 'forest' ? forestStage(sim as ForestSim, W) : spaceStage(sim as SpaceSim);
  return eventShown(e.kind, stage) ? e.kind : null;
}

export function workLine(theme: ThemeId, sim: AnySim, W: number): string {
  if (theme === 'cosmos') return cosmosLine(sim as CosmosSim, W);
  // a rare sight or the planet's weather is the news while it lasts (a raid is told first)
  const ev = shownEvent(theme, sim, W);
  if (ev && !(theme === 'space' && (sim as SpaceSim).raid)) return EVENT_TEXT[ev].line;
  return theme === 'forest' ? forestLine(sim as ForestSim, W) : spaceLine(sim as SpaceSim, W);
}


// ---- numbers ----------------------------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  marking: '자리 표시',
  foundation: '기초',
  floor: '바닥 프레임',
  frame: '골조',
  walls: '외벽',
  parts: '장비',
  power: '전력 연결',
  inspect: '점등·점검',
};

export interface DetailRow {
  label: string;
  value: string;
}

export function detailRows(theme: ThemeId, sim: AnySim, W: number): DetailRow[] {
  if (theme === 'cosmos') return cosmosDetailRows(sim as CosmosSim, W);
  const ev = shownEvent(theme, sim, W);
  const now: DetailRow[] = ev ? [{ label: '지금', value: EVENT_TEXT[ev].name }] : [];
  return [...now, ...detailRowsOf(theme, sim as ForestSim | SpaceSim, W)];
}

function detailRowsOf(theme: ThemeId, sim: ForestSim | SpaceSim, W: number): DetailRow[] {
  if (theme === 'space') {
    const s = sim as SpaceSim;
    const p = s.proj;
    const amt = (a: Amt) => RES.filter((t) => t !== 'r' || rareAt(s, s.cluster) || a.r > 0).map((t) => `${RES_NAME[t]} ${a[t]}`).join(' · ');
    const reserved = amtTotal(p.atDepot);
    const rows: DetailRow[] = [
      { label: '저장소', value: `${amt(s.depot)} (${amtTotal(s.depot)}/${depotCapacity(s)}칸)${reserved > 0 ? ` · 예약 ${reserved}` : ''}` },
      { label: '운반 중', value: `${s.rovers.reduce((a, r) => a + (r.step && (r.step.c.startsWith('ore') || r.step.c.startsWith('crate')) && W >= r.step.t0 ? r.step.n : 0), 0)}개` },
      { label: '현장 자재', value: amtTotal(p.onSite) > 0 ? amt(p.onSite) : '없음' },
      { label: '에너지', value: `기지 배터리 ${Math.round(gridLevel(s, W) * 100)}% · 발전기 ${s.counts.generator}기` },
      { label: '작업 드론', value: `${s.rovers.length}대 · 정비 드론 ${s.crew.length}대` },
      { label: '공사 중', value: p.reservedAt >= 0 ? `${KIND_NAME[p.kind]} · ${STAGE_LABEL[SPACE.stages[p.stage]?.id ?? 'inspect']}` : `${KIND_NAME[p.kind]} (필요 ${amt(p.cost)})` },
      { label: '완성 건물', value: `${s.done}개` },
      { label: '콜로니 단계', value: `${spaceStage(s)}단계 · ${SPACE_STAGE_NAMES[spaceStage(s)]}` },
      ...(s.army.inf + s.army.tanks > 0
        ? [{ label: '주둔군', value: `경비대 ${s.army.inf - s.army.out}명${s.army.out > 0 ? `(치료 중 ${s.army.out}명)` : ''} · 탱크 ${s.army.tanks}대` }]
        : []),
      ...(s.raids.n > 0 ? [{ label: '습격', value: `${s.raids.n}번 막아냈어요` }] : []),
      ...(s.counts.command > 0 ? [{ label: '콜로니', value: colonyName(s.seed) }] : []),
    ];
    return rows;
  }
  const s = sim as ForestSim;
  let fresh = 0;
  let mould = 0;
  for (const c of s.composts) {
    const a = compostAt(c, W);
    fresh += a.fresh;
    mould += a.mould;
  }
  let groundSeeds = 0;
  let groundLeaves = 0;
  for (const g of s.ground) {
    const a = groundAt(s, g, W);
    groundSeeds += a.seeds;
    groundLeaves += a.leaves;
  }
  return [
    { label: '씨앗 바구니', value: `${s.seeds + s.hand}알` },
    { label: '물뿌리개', value: `${s.can}/${FOREST.canCap}` },
    { label: '떨어진 씨앗·낙엽', value: `${groundSeeds}알 · ${groundLeaves}더미` },
    { label: '퇴비 더미', value: `낙엽 ${fresh + s.basket}장 삭는 중` },
    { label: '부엽토', value: `${mould + s.mould}줌` },
    ...(s.barrel && s.barrel.built ? [{ label: '빗물받이', value: `${barrelAt(s, W)}/${FOREST.barrel.cap}` }] : []),
    { label: '계절', value: SEASON_NAMES[seasonAt(W)] },
    { label: '자란 나무', value: `${s.done}그루` },
    { label: '숲의 모습', value: `${forestStage(s, W)}단계 · ${FOREST_STAGE_NAMES[forestStage(s, W)]}` },
    ...pondRow(s, W),
    ...elderRow(s, W),
  ];
}

function pondRow(s: ForestSim, W: number): { label: string; value: string }[] {
  const p = pondAt(s, s.zone, W);
  if (p.dug === 0 && p.water === 0) return [];
  if (p.water <= 0) return [{ label: '연못', value: `파는 중 ${p.dug}/${FOREST.pond.digs}` }];
  return [{ label: '연못', value: p.water >= 1 ? '물이 가득' : `물 ${Math.round(p.water * 100)}%` }];
}

function elderRow(s: ForestSim, W: number): { label: string; value: string }[] {
  const age = elderAge(s, s.zone, W);
  if (age === null) return [];
  const h = (ms: number) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)}시간` : `${Math.round(ms / 60_000)}분`);
  const left = FOREST.elder.giantMs - age;
  return [{ label: '고목', value: left > 0 ? `${h(age)}째 · 거목까지 ${h(left)}` : '거목' }];
}
