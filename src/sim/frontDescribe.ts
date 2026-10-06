/**
 * Words of the front theme: the status line (the opening's beats, the tide, the headline on view),
 * the detail rows, the session summary and the footer numbers with the resource bar.
 */

import { formatDurationKo, timeStats } from '../core/duration';
import type { RaceId } from '../core/session';
import {
  FRONT_STAGE_NAMES,
  frontAt,
  frontPlanet,
  frontStage,
  milestones,
  OPEN,
  planetsTo,
  RELAND,
  siteRank,
  siteSide,
  SITE_COUNT,
  NAT,
  type FrontMilestoneId,
  type FrontSim,
  type FrontView,
} from './front';
import {
  ARMY_KINDS,
  BIOME_LANDING,
  BIOME_NAME,
  BIOME_STORM,
  BUILDING_NAME,
  DEV_LEVEL_NAME,
  RACE_ENDING,
  RACE_NAME,
  RACE_SHORT,
  TIDE_NAME,
  UNIT_NAME,
  type ArmyKind,
} from './frontPlan';
import { frontHeadlineAt, GRADE_NAME, isBattle, operationName, operations, tideAt, type Battle } from '../world/front';
import { currentPace } from '../world/pace';
import type { WorldEvent } from '../world/timeline';
import type { DetailRow } from './describe';

function batchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}
/** Korean particle after a word: j('병영', '이', '가') → '병영이'. */
const j = (word: string, withB: string, without: string) => word + (batchim(word) ? withB : without);

const ago = (ms: number) => formatDurationKo(ms, { seconds: ms < 3600_000 });
const pct = (x: number) => `${Math.round(x * 100)}%`;

// ---- records set by the app ----------------------------------------------------------------------

let records: { started: boolean; past: readonly { origin: number; race: RaceId }[]; dates: readonly [number, number][] } = { started: false, past: [], dates: [] };

/** Whether a war is on, earlier wars and session dates (set by the app with the world on view). */
export function setFrontRecords(started: boolean, past: readonly { origin: number; race: RaceId }[] | undefined, dates: readonly [number, number][] | undefined) {
  records = { started, past: past ?? [], dates: dates ?? [] };
}

// ---- names ---------------------------------------------------------------------------------------

export const MILESTONE_TEXT: Record<FrontMilestoneId, string> = {
  land: '착륙',
  worker: '첫 일꾼',
  supply: '첫 보급',
  firstUnit: '첫 병력',
  contact: '적 발견',
  firstFight: '첫 교전',
  natural: '앞마당',
  tier2: '2티어',
  firstCapture: '첫 점령',
  thirdBase: '세 번째 기지',
  tier3: '3티어',
  crystal: '첫 시결정',
  t3unit: '첫 3티어 유닛',
  break: '전선 돌파',
  shipyard: '궤도 조선소',
  decisive: '결전',
  conquest: '행성 장악',
  escort: '첫 호위함',
  orbit: '궤도전',
  landing: '강하',
  capital: '첫 주력함',
  flagship: '기함 출격',
  city: '개발 행성의 도시',
  station: '궤도 정거장',
  fortress: '행성 요새',
  sector: '성계 장악',
};

export const RARE_TEXT: Record<string, { name: string; line: string }> = {
  supplyPod: { name: '보급 캡슐', line: '하늘에서 보급 캡슐이 내려와 본진 옆에 앉아요.' },
  eclipse: { name: '일식', line: '위성이 해를 가렸어요. 낮에 탐조등이 켜져요.' },
  meteor: { name: '운석 낙하', line: '먼 지대에 운석이 떨어졌어요. 흙먼지 사이로 시결정이 빛나요.' },
  whale: { name: '거대 토착 생물', line: '고래가 지나갈 때까지 총성이 멎었어요.' },
  parade: { name: '궤도 함대 행진', line: '우리 함대가 하늘을 대열로 가로질러요.' },
  gate: { name: '고대 관문 각성', line: '호수 한가운데의 고대 고리가 깨어났어요. 잠시 모두 사격을 멈춰요.' },
  grandFleet: { name: '성계 대함대', line: '세 종족의 함대가 한 행성 둘레에 모였어요.' },
};

const BATTLE_NAME: Record<string, string> = {
  scout: '정찰 조우',
  harass: '견제',
  drop: '드랍',
  skirmish: '국지전',
  air: '공중전',
  siege: '공성',
  clash: '대규모 교전',
  support: '궤도 지원 사격',
  pods: '강하',
  orbit: '궤도전',
  fleet: '함대 결전',
  descend: '기함 강림',
  defend: '다른 행성 방어전',
  raid: '적 함대 습격',
  rivals: '두 경쟁 세력의 충돌',
  stormRaid: '폭풍 속 기습',
  supplyDrop: '보급 캡슐 낙하',
  shadow: '폭풍 속 그림자',
};

function siteName(site: number, natSide: 0 | 1): string {
  if (site === NAT) return '앞마당';
  if (site >= SITE_COUNT) return '적 본진';
  const side = siteSide(site) === 0 ? '왼쪽' : '오른쪽';
  void natSide;
  return `${side} ${siteRank(site) + 1}번 지대`;
}

function names(race: RaceId) {
  const U = UNIT_NAME[race];
  const B = BUILDING_NAME[race];
  return { U, B };
}

// ---- the headline on view ------------------------------------------------------------------------

export function frontShownEvent(s: FrontSim, W: number): WorldEvent | null {
  return frontHeadlineAt(s.seed, s.origin, W, currentPace());
}

/** Name of a headline for "자세히" (an away battle names its planet). */
export function headlineName(e: WorldEvent, seed: number, A: number): string {
  if (e.kind.startsWith('ms:')) return MILESTONE_TEXT[e.kind.slice(3) as FrontMilestoneId] ?? e.kind;
  if (e.kind.startsWith('cap:')) return e.kind === 'cap:lose' ? '지대를 빼앗김' : e.kind === 'cap:break' ? '전선 돌파' : '점령전';
  if (RARE_TEXT[e.kind]) return RARE_TEXT[e.kind].name;
  if (isBattle(e)) {
    const pl = planetsTo(seed, A)[e.planet];
    return `${BATTLE_NAME[e.kind] ?? '교전'} · ${GRADE_NAME[e.grade]}${e.away && pl ? ` · ${BIOME_NAME[pl.biome]}` : ''}`;
  }
  return e.kind;
}

function milestoneLine(id: FrontMilestoneId, v: FrontView): string {
  const { U, B } = names(v.race);
  const [l, r] = v.rivalRaces;
  const planet = BIOME_NAME[v.planet.biome];
  switch (id) {
    case 'land':
      return '기지 하나에서 전쟁이 시작됐어요.';
    case 'worker':
      return `${j(U.worker, '이', '가')} 하나 더 일을 시작했어요.`;
    case 'supply':
      return `첫 ${j(B.supply, '이', '가')} 섰어요. 보급이 늘었어요.`;
    case 'firstUnit':
      return `첫 ${j(U.t1, '이', '가')} 나왔어요.`;
    case 'contact':
      return `두 세력을 발견했어요: ${j(RACE_NAME[l], '과', '와')} ${RACE_NAME[r]}.`;
    case 'firstFight':
      return '적 정찰대를 막아 냈어요.';
    case 'natural':
      return '앞마당에 두 번째 기지가 섰어요.';
    case 'tier2':
      return `2티어 기술이 열렸어요. ${j(U.t1b, '과', '와')} ${j(U.t2, '이', '가')} 합류해요.`;
    case 'firstCapture':
      return '첫 확장 지대를 차지했어요.';
    case 'thirdBase':
      return '기지가 셋이 됐어요. 전선이 생겼어요.';
    case 'tier3':
      return `3티어 기술이 열렸어요. ${j(U.t3, '과', '와')} ${U.t3a}의 시대예요.`;
    case 'crystal':
      return '시결정 지대를 손에 넣었어요. 호박빛 결정이 기지로 실려 와요.';
    case 't3unit':
      return `첫 ${j(U.t3, '이', '가')} 전선에 나섰어요.`;
    case 'break':
      return '적의 확장 기지를 무너뜨렸어요. 전선 돌파예요.';
    case 'shipyard':
      return `${j(B.shipyard, '을', '를')} 짓기 시작했어요. 하늘 너머로 갈 준비예요.`;
    case 'decisive':
      return `${planet}의 결전이에요. 주력 부대가 마지막 적 본진으로 나아가요.`;
    case 'conquest':
      return `${j(planet, '을', '를')} 장악했어요. 남은 적은 하늘로 물러나요.`;
    case 'escort':
      return `첫 ${j(U.s1, '이', '가')} 하늘로 떠올랐어요.`;
    case 'orbit':
      return `다음 행성 ${planet}의 궤도에서 함대가 맞붙어요.`;
    case 'landing':
      return `${planet}에 내려앉았어요. ${BIOME_LANDING[v.planet.biome]}`;
    case 'capital':
      return `첫 ${j(U.s2, '이', '가')} 함대에 합류했어요.`;
    case 'flagship':
      return `기함 ${j(U.s3, '이', '가')} 출격했어요.`;
    case 'city':
      return '개발 행성의 밤면에 도시 불빛이 켜졌어요.';
    case 'station':
      return '개발 행성 둘레에 궤도 정거장이 생겼어요.';
    case 'fortress':
      return '개발 행성이 방어 고리를 두른 요새가 됐어요.';
    case 'sector':
      return RACE_ENDING[v.race];
  }
}

function captureLine(kind: string, v: FrontView, flipped: boolean): string {
  const e = v.capture;
  const enemy = e ? RACE_NAME[v.rivalRaces[e.enemy - 1]] : '적';
  const where = e && e.sites.length ? siteName(e.sites[0], v.planet.natSide) : '지대';
  switch (kind) {
    case 'cap:lose':
      return flipped ? `${j(where, '이', '가')} ${enemy}에게 넘어갔어요. 다음 공세에 되찾아요.` : `${enemy}의 대군이 ${where}로 몰려와요.`;
    case 'cap:break':
      return flipped ? '적의 확장 기지를 무너뜨렸어요. 전선 돌파예요.' : `${enemy}의 확장 기지로 진격해요.`;
    case 'cap:retake':
      return flipped ? `${j(where, '을', '를')} 되찾았어요.` : `빼앗겼던 ${j(where, '을', '를')} 되찾으러 가요.`;
    case 'cap:push':
      return flipped ? '공세로 지대 두 곳을 차지했어요. 전선이 밀렸어요.' : '공세예요. 지대 두 곳을 향해 밀고 나가요.';
    default:
      return flipped ? `${j(where, '을', '를')} 차지했어요.` : `${j(where, '을', '를')} 두고 ${j(enemy, '과', '와')} 맞붙었어요.`;
  }
}

function battleLine(b: Battle, v: FrontView): string {
  const { U } = names(v.race);
  const enemy = RACE_NAME[v.rivalRaces[b.enemy - 1]];
  const pl = planetsTo(v.seed, v.A)[b.planet];
  const where = pl ? BIOME_NAME[pl.biome] : '다른 행성';
  switch (b.kind) {
    case 'scout':
      return `${enemy} 정찰대가 영토 가장자리에 왔어요 — ${j(U.t1, '이', '가')} 쫓아내요.`;
    case 'harass':
      return `${enemy} 소수가 일꾼 줄을 노려요 — 방어가 나서요.`;
    case 'drop':
      return `${enemy} 수송체가 지대 뒤에 병력을 내려요 — 막으러 가요.`;
    case 'skirmish':
      return `전선에서 ${j(enemy, '과', '와')} 맞붙었어요.`;
    case 'air':
      return `측면 하늘에서 ${j(U.t3a, '이', '가')} 적 비행 부대와 싸워요.`;
    case 'siege':
      return '공성 부대가 적 전초 앞에 자리를 잡고 포격해요.';
    case 'clash':
      return `주력 부대가 ${enemy}의 대군과 맞붙어요.`;
    case 'support':
      return `하늘의 ${j(U.s1, '이', '가')} 지상 전투를 지원해요.`;
    case 'pods':
      return `${U.s1}에서 강하 캡슐이 내려와 전선에 합류해요.`;
    case 'orbit':
      return `궤도에서 함대가 ${enemy} 함대와 맞붙어요.`;
    case 'fleet':
      return `${j(U.s3, '이', '가')} 나섰어요. 함대 결전이에요.`;
    case 'descend':
      return `${j(U.s3, '이', '가')} 전선의 하늘까지 내려와요. 적 방어선이 물러나요.`;
    case 'defend':
      return `${where}의 기지가 공격받고 있어요 — 수비대가 막아요.`;
    case 'raid':
      return `${where} 궤도에 ${enemy} 함대가 나타났어요 — 함대가 맞서요.`;
    case 'rivals':
      return `${where}에서 두 경쟁 세력이 서로 싸워요.`;
    case 'stormRaid':
      return `${BIOME_STORM[v.planet.biome]} 속에서 작은 기습이 있었어요.`;
    case 'supplyDrop':
      return `${j(BIOME_STORM[v.planet.biome], '을', '를')} 뚫고 보급 캡슐이 내려왔어요.`;
    case 'shadow':
      return `${BIOME_STORM[v.planet.biome]} 속으로 거대한 그림자가 지나가요.`;
  }
  return '전선에서 교전이 벌어졌어요.';
}

// ---- the status line -------------------------------------------------------------------------------

function openingLine(v: FrontView): string {
  const { U, B } = names(v.race);
  const [l, r] = v.rivalRaces;
  switch (v.beat) {
    case 'mine':
      return `${U.worker}들이 광석을 캐기 시작했어요.`;
    case 'workers':
      return `${j(U.worker, '이', '가')} 늘고 있어요.`;
    case 'supply':
      return `${j(B.supply, '을', '를')} 세우고 있어요.`;
    case 'prod':
      return `${j(B.barracks, '을', '를')} 세워요. 병력을 만들 곳이에요.`;
    case 'firstUnit':
      return `첫 ${j(U.t1, '이', '가')} 나왔어요.`;
    case 'gas':
      return `열샘 위에 ${j(B.gas, '이', '가')} 서요.`;
    case 'scout':
      return v.A < OPEN.scout + 70_000 ? `${j(U.scout, '이', '가')} 안개를 가르며 나아가요.` : `두 세력을 발견했어요: ${j(RACE_NAME[l], '과', '와')} ${RACE_NAME[r]}.`;
    case 'wall':
      return `${j(B.wall, '으로', '로')} 본진 입구를 막아요.`;
    case 'firstFight':
      return v.A < OPEN.firstFight + 40_000 ? `${RACE_SHORT[l]} 정찰대가 경사로로 올라와요 — ${j(U.t1, '이', '가')} 막아요.` : '적 정찰대를 막아 냈어요.';
    case 'natural':
      return '앞마당에 두 번째 기지를 세워요.';
    case 'tech2':
      return `${j(B.tech2, '이', '가')} 서고 있어요. 다음 기술이 열려요.`;
    case 'mix':
      return v.race === 1 ? `${U.t1} 몇이 고치를 틀어 ${j(U.t1b, '으로', '로')} 나와요.` : `새 병종 ${j(U.t1b, '이', '가')} 합류했어요.`;
    case 'capture':
      return v.A < OPEN.capture + 90_000 ? '앞마당 너머의 지대를 두고 맞붙어요.' : '첫 확장 지대를 차지했어요.';
    case 'third':
      return '세 번째 기지를 세워요.';
    case 'front':
      return '기지가 셋이 됐어요. 전선이 생겼어요.';
  }
  return '전쟁이 이어지고 있어요.';
}

function relandLine(v: FrontView): string {
  const { U, B } = names(v.race);
  const planet = BIOME_NAME[v.planet.biome];
  switch (v.reland) {
    case 'mine':
      return `${planet}에 내려앉았어요. ${U.worker}들이 광석을 캐요.`;
    case 'supply':
      return `${j(B.supply, '을', '를')} 세우고 있어요.`;
    case 'prod':
      return `${j(B.barracks, '이', '가')} 다시 문을 열어요.`;
    case 'scout':
      return `${j(U.scout, '이', '가')} 새 행성의 안개를 걷어요.`;
    case 'natural':
      return '앞마당에 기지를 세워요.';
  }
  return '';
}

function workLineOf(v: FrontView, A: number): string {
  const { B } = names(v.race);
  const tide = tideAt(v.seed, A);
  const building = v.builds.filter((b) => b.u < 1).sort((a, b) => b.t0 - a.t0)[0];
  if (v.orbit) return `${BIOME_NAME[v.orbit.biome]}의 궤도를 확보하고 있어요. 곧 강하해요.`;
  switch (tide.phase) {
    case 'refit':
      return building ? `${j(B[building.kind], '을', '를')} 짓고 있어요. 전선은 조용해요.` : '전선이 조용해요. 기지를 넓히는 중이에요.';
    case 'muster':
      return '병력이 집결지에 모이고 있어요.';
    case 'offensive':
      return '공세가 시작됐어요. 전선이 움직여요.';
    case 'storm':
      return `${j(BIOME_STORM[v.planet.biome], '이', '가')} 불어와요. 모두 기지로 돌아왔어요.`;
  }
  return '전쟁이 이어지고 있어요.';
}

export function frontLine(s: FrontSim, W: number): string {
  const A = Math.max(0, W - s.origin);
  const v = frontAt(s.seed, s.race, A);
  const e = frontShownEvent(s, W);
  if (e) {
    if (e.kind.startsWith('ms:')) return milestoneLine(e.kind.slice(3) as FrontMilestoneId, v);
    if (e.kind.startsWith('cap:')) return captureLine(e.kind, v, v.capture ? A >= v.capture.t : false);
    if (RARE_TEXT[e.kind]) return RARE_TEXT[e.kind].line;
    if (isBattle(e)) return battleLine(e, v);
  }
  if (v.beat) return openingLine(v);
  if (v.reland) return relandLine(v);
  return workLineOf(v, A);
}

const PROLOGUE = ['아스테르 변경. 시간이 결정으로 굳는 일곱 행성이에요.', '세 종족이 같은 날 같은 행성에 내려앉았어요.', '사령관이 집중하는 동안에만 이 전쟁의 시간이 흘러요.'];

export function frontIdleLine(s: FrontSim, W: number): string {
  if (!records.started) return PROLOGUE[Math.floor(Date.now() / 8000) % PROLOGUE.length];
  const A = Math.max(0, W - s.origin);
  if (A <= 0) return '기지 하나뿐이에요. 시작하면 일꾼들이 움직여요.';
  return '시작하면 일꾼들이 하던 일을 이어가요.';
}

// ---- detail rows ------------------------------------------------------------------------------------

const dateText = (at: number | null | undefined) => {
  if (at === undefined || at === null) return '';
  const d = new Date(at);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 `;
};

function armyText(race: RaceId, mix: Record<ArmyKind, number>): string {
  return ARMY_KINDS.filter((k) => mix[k] > 0)
    .map((k) => `${UNIT_NAME[race][k]} ${mix[k]}`)
    .join(' · ');
}

export function frontDetailRows(s: FrontSim, W: number): DetailRow[] {
  const A = Math.max(0, W - s.origin);
  const v = frontAt(s.seed, s.race, A);
  const rows: DetailRow[] = [];
  const e = frontShownEvent(s, W);
  if (e) rows.push({ label: '지금', value: headlineName(e, s.seed, A) });
  rows.push({ label: '종족', value: `${RACE_NAME[s.race]}${records.started ? '' : ' (아직 고르지 않음)'}` });
  rows.push({ label: '전쟁 시간', value: A > 0 ? ago(A) : '아직 시작하지 않았어요' });
  rows.push({ label: '단계', value: `${v.stage}단계 · ${FRONT_STAGE_NAMES[v.stage]} · ${v.tier >= 4 ? '우주 함대' : `${v.tier}티어`}${v.upgrades ? ` · 업그레이드 ${v.upgrades}` : ''}` });
  if (A >= OPEN.end) rows.push({ label: '전황', value: `${TIDE_NAME[v.tide]} 국면` });
  rows.push({ label: '전선 행성', value: `${BIOME_NAME[v.planet.biome]} · 점령률 ${pct(v.share)}${v.planet.idx > 0 && A < v.planet.landAt + RELAND.end ? ' · 막 강하함' : ''}` });
  rows.push({ label: '자원', value: `광석 ${v.stock.ore.toLocaleString('ko-KR')} · 열샘 ${v.stock.heat.toLocaleString('ko-KR')} · 시결정 ${v.stock.crystal} · 보급 ${v.stock.supply}/${v.stock.cap}` });
  if (v.armyN > 0) rows.push({ label: '병력', value: `${v.armyN} · ${armyText(s.race, v.army)}` });
  if (v.ships.s1 + v.ships.s2 + v.ships.s3 > 0) {
    const U = UNIT_NAME[s.race];
    rows.push({ label: '함대', value: [v.ships.s1 ? `${U.s1} ${v.ships.s1}` : '', v.ships.s2 ? `${U.s2} ${v.ships.s2}` : '', v.ships.s3 ? U.s3 : ''].filter(Boolean).join(' · ') });
  }
  if (v.held > 0) {
    const recent = v.developed.slice(-4).reverse().map((p) => `${BIOME_NAME[p.biome]}(${DEV_LEVEL_NAME[p.level]})`);
    rows.push({ label: '개발 행성', value: `${v.held}곳 · ${recent.join(' · ')}${v.held > 4 ? ' …' : ''}` });
  }
  const next = milestones(s.seed, A + 12 * 3600_000).find((m) => m.A > A);
  if (next) rows.push({ label: '다음 이정표', value: `${MILESTONE_TEXT[next.id]} · ${ago(next.A - A)} 뒤` });
  const passed = milestones(s.seed, A + 3600_000).filter((m) => m.A <= A && m.id !== 'land');
  if (passed.length) rows.push({ label: '전쟁 연표', value: passed.slice(-3).map((m) => `${MILESTONE_TEXT[m.id]} ${ago(m.A)}`).join(' · ') });
  const ops = operations(s.seed, s.origin, currentPace(), records.dates);
  if (ops.length) {
    const list = ops
      .slice(-3)
      .reverse()
      .map((o) => `${o.name} (${dateText(o.wall)}${ago(o.focusMs)})`)
      .join(' · ');
    rows.push({ label: '작전 기록', value: `${list}${ops.length > 3 ? ` 외 ${ops.length - 3}개` : ''}` });
  }
  if (records.past.length) rows.push({ label: '지난 전쟁', value: `${records.past.length}번 · ${records.past.slice(-3).map((p) => RACE_SHORT[p.race]).join(', ')}` });
  return rows;
}

// ---- summary and footer -------------------------------------------------------------------------

export interface FrontSummary {
  title: string;
  lines: string[];
}

export function frontSummary(_before: FrontSim, after: FrontSim, w0: number, w1: number): FrontSummary {
  const seed = after.seed;
  const a0 = Math.max(0, w0 - after.origin);
  const a1 = Math.max(0, w1 - after.origin);
  const v0 = frontAt(seed, after.race, a0);
  const v1 = frontAt(seed, after.race, a1);
  const lines: string[] = [];
  const army = v1.armyN - v0.armyN;
  if (army > 0) lines.push(`병력이 ${army} 늘었어요.`);
  const sites = v1.bases.filter((b) => !b.lost).length - v0.bases.filter((b) => !b.lost).length;
  if (v1.planet.idx === v0.planet.idx && sites > 0) lines.push(`기지가 ${sites}곳 늘었어요.`);
  if (v1.planet.idx === v0.planet.idx) {
    if (v1.share > v0.share) lines.push(`점령률 ${pct(v0.share)} → ${pct(v1.share)}`);
  } else lines.push(`${BIOME_NAME[v0.planet.biome]}에서 ${BIOME_NAME[v1.planet.biome]}까지 전선이 넓어졌어요.`);
  if (v1.held > v0.held) lines.push(`행성 ${v1.held - v0.held}곳을 장악했어요.`);
  const ships = v1.ships.s1 + v1.ships.s2 + v1.ships.s3 - (v0.ships.s1 + v0.ships.s2 + v0.ships.s3);
  if (ships > 0) lines.push(`함선 ${ships}척이 함대에 합류했어요.`);
  const s0 = frontStage(seed, a0);
  const s1 = frontStage(seed, a1);
  if (s1 > s0) lines.push(`단계 ${s0} → ${s1}(${FRONT_STAGE_NAMES[s1]})`);
  const passed = milestones(seed, a1 + 3600_000).filter((m) => m.A > a0 && m.A <= a1 && m.id !== 'land');
  if (passed.length) lines.push(`지나온 이정표: ${passed.map((m) => MILESTONE_TEXT[m.id]).join(', ')}`);
  if (w1 - w0 >= 120_000) lines.push(`오늘의 작전: ${operationName(seed, w0)}`);
  if (!lines.length) lines.push('전선이 다음 공세를 준비했어요.');
  return { title: '집중한 시간만큼 전선이 밀렸어요.', lines };
}

export function frontStats(s: FrontSim, W: number, focus: number = W): string {
  const A = Math.max(0, W - s.origin);
  const v = frontAt(s.seed, s.race, A);
  const parts = [timeStats(W, focus)];
  if (A > 0) parts.push(`전쟁 ${formatDurationKo(A)}`);
  parts.push(`${v.stage}단계`);
  if (A > 0) parts.push(`점령률 ${pct(v.share)}`);
  parts.push(`광석 ${v.stock.ore.toLocaleString('ko-KR')}`, `열샘 ${v.stock.heat.toLocaleString('ko-KR')}`);
  if (v.stock.crystal > 0) parts.push(`시결정 ${v.stock.crystal}`);
  parts.push(`보급 ${v.stock.supply}/${v.stock.cap}`);
  return parts.join(' · ');
}

/** Grade names for the dev panel. */
export const FRONT_GRADE_NAME = GRADE_NAME;
export { frontPlanet };
