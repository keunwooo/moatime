/**
 * Words of the cosmos theme: the status line (from the universe's age and the headline on view),
 * the detail rows, the session summary and the footer numbers.
 */

import { formatDurationKo, timeStats } from '../core/duration';
import {
  ageOf,
  CHRON,
  CIV_LEVEL_NAMES,
  civLevel,
  homeColonies,
  rivalsAt,
  cometTimes,
  fieldStars,
  COSMOS_STAGE_NAMES,
  cosmosStage,
  firstGen,
  gasPool,
  LIFE,
  milestones,
  oceanAt,
  PER_CLUSTER,
  PER_ZONE,
  starKind,
  systemsDone,
  unitAt,
  UNIT,
  type CosmosSim,
  type MilestoneId,
} from './cosmos';
import { constellationName, constellationOf, constellationRecords, cosmosHeadlineAt, cosmosSights, SPACE_WEATHER_NAMES, spaceWeatherAt } from '../world/cosmos';
import { currentPace } from '../world/pace';
import type { DetailRow } from './describe';

export const COSMOS_TEXT: Record<string, { name: string; line: string }> = {
  'ms:bang': { name: '빅뱅', line: '첫 빛이 퍼지고 있어요.' },
  'ms:firstLight': { name: '첫 빛', line: '우주가 투명해졌어요. 빛이 처음으로 멀리 나아가요.' },
  'ms:web': { name: '우주 거미줄', line: '가스가 실처럼 모여 우주의 거미줄을 짜요.' },
  'ms:firstStar': { name: '첫 별', line: '가장 짙은 매듭에서 첫 별이 켜졌어요.' },
  'ms:firstSupernova': { name: '첫 초신성', line: '첫 별이 생을 마치며 별먼지를 흩뿌렸어요.' },
  'ms:firstNebula': { name: '첫 성운', line: '별먼지가 모여 성운이 되고 있어요.' },
  'ms:homeStar': { name: '집의 별', line: '따뜻한 별이 켜졌어요. 이 별이 우리의 집이 돼요.' },
  'ms:firstPlanets': { name: '첫 행성계', line: '먼지가 뭉쳐 첫 행성들이 생겼어요.' },
  'ms:secondNebula': { name: '두 번째 성운', line: '또 하나의 첫 별이 생을 마쳤어요. 오른쪽에 새 성운이 번져요.' },
  'ms:moon': { name: '달의 탄생', line: '작은 천체가 행성을 스치고 지나갔어요. 흩어진 조각이 모여 달이 돼요.' },
  'ms:firstCluster': { name: '첫 성단', line: '별 네 개가 모여 첫 성단이 되었어요.' },
  'ms:ocean': { name: '바다의 시작', line: '첫 혜성이 생명의 행성에 물을 실어 왔어요.' },
  'ms:rings': { name: '가스 행성의 고리', line: '가스 행성 둘레에 고리가 생겼어요.' },
  'ms:galaxyDisk': { name: '은하 원반', line: '원시 은하들이 합쳐져 도는 원반이 되었어요.' },
  'ms:life': { name: '생명', line: '바다에 처음으로 초록빛이 번졌어요.' },
  'ms:coreAwake': { name: '은하 핵 각성', line: '은하의 중심이 깨어나 가는 빛줄기를 뿜어요.' },
  'ms:firstLights': { name: '첫 불빛', line: '행성의 밤면에 작은 불빛이 켜졌어요. 누군가 하늘을 올려다봐요.' },
  'ms:station': { name: '궤도 정거장', line: '생명의 행성 둘레에 궤도 정거장이 생겼어요.' },
  'ms:moonBase': { name: '달 기지', line: '달에 불빛이 켜졌어요. 첫 달 기지예요.' },
  'ms:mining': { name: '소행성대 채굴', line: '작은 배들이 소행성대로 자원을 캐러 가요.' },
  'ms:terraform': { name: '테라포밍', line: '안쪽 행성에 대기가 생기며 조금씩 푸르게 물들어요.' },
  'ms:giantMoons': { name: '위성 도시', line: '가스 행성의 위성에 도시 불빛이 켜졌어요.' },
  'ms:interstellar': { name: '성간 항해', line: '첫 성간선이 다른 별을 향해 떠나요.' },
  'ms:firstColony': { name: '첫 식민지', line: '다른 별에 첫 식민지가 생겼어요.' },
  'ms:contact': { name: '첫 만남', line: '먼 별에서 다른 문명을 만났어요.' },
  'ms:dyson': { name: '별의 고리', line: '집의 별 둘레에 빛을 모으는 고리가 놓이기 시작해요.' },
  meteorShower: { name: '유성우', line: '유성우가 쏟아져요.' },
  battle: { name: '함대 충돌', line: '다른 문명의 함대와 우리 함대가 맞부딪쳤어요.' },
  fleet: { name: '식민 함대', line: '식민 함대가 새 별을 향해 떠나요.' },
  convoy: { name: '교역 선단', line: '교역 선단이 별과 별 사이를 오가요.' },
  bigComet: { name: '대혜성', line: '큰 혜성이 긴 꼬리를 끌며 지나가요.' },
  kilonova: { name: '킬로노바', line: '별 두 개가 합쳐지며 금이 만들어졌어요.' },
  roguePlanet: { name: '떠돌이 행성', line: '떠돌이 행성이 별빛을 가리며 지나가요.' },
  starburst: { name: '별 탄생 폭발', line: '먼 성운이 한꺼번에 밝아져요. 아기별이 잔뜩 태어나요.' },
  alignment: { name: '행성 정렬', line: '집의 행성들이 한 줄로 늘어섰어요.' },
  comet: { name: '혜성', line: '혜성이 꼬리를 늘어뜨리며 지나가요.' },
  flare: { name: '항성 홍염', line: '집의 별 가장자리에 고리 모양 불꽃이 솟았어요.' },
  farSupernova: { name: '먼 초신성', line: '먼 별 하나가 생을 마치며 빛 고리를 남겨요.' },
  meteors: { name: '유성 무리', line: '소행성대 쪽으로 작은 빛줄기가 흘러요.' },
  pulsar: { name: '펄서', line: '초신성 잔해 한가운데서 가는 빛살이 돌아요.' },
  starChain: { name: '별 탄생', line: '먼 성운에서 아기별이 하나둘 켜져요.' },
  binaryDance: { name: '쌍성의 춤', line: '두 별이 서로를 돌며 가스를 나눠요.' },
  aurora: { name: '오로라', line: '생명의 행성 극지방에 오로라가 일렁여요.' },
  moonShadow: { name: '달 그림자', line: '달 그림자가 행성의 낮면을 지나가요.' },
  nightMeteors: { name: '밤면 유성우', line: '행성의 밤하늘에 유성우가 내려요.' },
  corePulse: { name: '은하 핵 맥동', line: '은하 중심이 잠시 밝아져요.' },
  satellitePass: { name: '위성 은하', line: '작은 은하가 멀리 가로질러 가요.' },
  orbitLight: { name: '궤도의 빛', line: '생명의 행성 궤도에서 작은 빛이 떠올라요.' },
};

/** The chronicle, told step by step. */
function chronicleLine(seed: number, A: number): string {
  if (A < CHRON.bangEnd) return '첫 빛이 퍼지고 있어요.';
  if (A < CHRON.plasmaEnd) return '뜨거운 안개가 식어 가요.';
  if (A < CHRON.clearEnd) return '우주가 투명해졌어요. 빛이 처음으로 멀리 나아가요.';
  if (A < CHRON.collapse) return '가스가 실처럼 모여 우주의 거미줄을 짜요.';
  if (A < CHRON.firstStar) return '가장 짙은 매듭이 조여들어요.';
  if (A < firstGen(seed)[1].ignite) return '가장 짙은 매듭에서 첫 별이 켜졌어요.';
  if (A < CHRON.redGiant) return '첫 별들이 하나둘 켜지고 있어요.';
  if (A < CHRON.supernova) return '첫 별이 마지막 숨을 쉬어요.';
  if (A < CHRON.nebula) return '첫 별이 생을 마치며 별먼지를 흩뿌렸어요.';
  if (A < CHRON.cradle) return '별먼지가 모여 성운이 되고 있어요.';
  if (A < CHRON.homeStar) return '성운 속에서 새 별이 자라요.';
  if (A < CHRON.disk) return '따뜻한 별이 켜졌어요. 이 별이 우리의 집이 돼요.';
  if (A < CHRON.planets) return '별 둘레에 먼지 원반이 돌아요.';
  return '먼지가 뭉쳐 첫 행성들이 생겼어요.';
}

const KIND_WORD = { red: '작고 붉은 별', yellow: '노란 별', blue: '크고 푸른 별', binary: '두 별' } as const;

function unitLine(s: CosmosSim, A: number): string {
  const u = unitAt(s.seed, A);
  if (!u) return chronicleLine(s.seed, A);
  // a comet bringing water is news while it flies
  for (const t of cometTimes(s.seed)) {
    if (A >= t - LIFE.cometFlightMs && A < t) return '혜성이 생명의 행성에 물을 실어 날라요.';
    if (t > A) break;
  }
  const kind = starKind(s.seed, u.k);
  const f = u.f;
  if (f < UNIT.protostar) return '가스가 다음 매듭으로 흘러들어요.';
  if (f < UNIT.ignite) return '매듭이 붉게 달아오르며 새 별이 자라요.';
  if (f < UNIT.disk) return kind === 'binary' ? '두 별이 함께 켜졌어요.' : `${KIND_WORD[kind]}이 켜졌어요.`;
  if (kind === 'blue') return f < UNIT.settle ? '크고 푸른 별은 행성 없이 밝게 타올라요.' : '다음 매듭으로 가스가 이어져요.';
  if (f < UNIT.planets) return '새 별 둘레에 먼지 원반이 돌아요.';
  if (f < UNIT.planetsEnd) return s.n === 0 ? '새 별은 아직 행성을 만들 별먼지가 모자라요.' : '원반의 먼지가 뭉쳐 행성이 되고 있어요.';
  if (f < UNIT.settle) return '남은 먼지가 소행성대가 돼요.';
  return '다음 매듭으로 가스가 이어져요.';
}

/** The headline at W for this universe, if it has words. */
export function cosmosShownEvent(s: CosmosSim, W: number): string | null {
  const e = cosmosHeadlineAt(s.seed, s.origin, W, currentPace());
  return e && COSMOS_TEXT[e.kind] ? e.kind : null;
}

export function cosmosLine(s: CosmosSim, W: number): string {
  const A = ageOf(s, W);
  if (A < CHRON.end) return chronicleLine(s.seed, A);
  const ev = cosmosShownEvent(s, W);
  if (ev) return COSMOS_TEXT[ev].line;
  return unitLine(s, A);
}

export function cosmosIdleLine(s: CosmosSim, W: number): string {
  return ageOf(s, W) <= 0 ? '아직 아무것도 없어요. 시작하면 첫 빛이 퍼져요.' : '시작하면 우주가 다시 자라기 시작해요.';
}

const ago = (ms: number) => formatDurationKo(ms, { seconds: ms < 3600_000 });

const MILESTONE_NAME = (id: MilestoneId) => COSMOS_TEXT[`ms:${id}`]?.name ?? id;

/** Earlier universes and session dates (set by the app with the world on view). */
let records: { past: readonly number[]; dates: readonly [number, number][] } = { past: [], dates: [] };
export function setCosmosRecords(past: readonly number[] | undefined, dates: readonly [number, number][] | undefined) {
  records = { past: past ?? [], dates: dates ?? [] };
}

const dateText = (at: number | undefined) => {
  if (at === undefined) return '';
  const d = new Date(at);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 `;
};

export function cosmosDetailRows(s: CosmosSim, W: number): DetailRow[] {
  const A = ageOf(s, W);
  const stage = cosmosStage(s.seed, A);
  const done = systemsDone(s.seed, A);
  const ev = cosmosShownEvent(s, W);
  const next = milestones(s.seed).find((m) => m.A > A);
  const passed = milestones(s.seed).filter((m) => m.A <= A);
  const pace = currentPace();
  const recent = constellationRecords(s.seed, [...records.past, s.origin], pace, W, records.dates);
  const rows: DetailRow[] = [];
  if (ev) rows.push({ label: '지금', value: COSMOS_TEXT[ev].name });
  rows.push({ label: '우주의 나이', value: A > 0 ? ago(A) : '아직 태어나지 않았어요' });
  rows.push({ label: '우주의 모습', value: `${stage}단계 · ${COSMOS_STAGE_NAMES[stage]}` });
  if (A >= CHRON.webStart) {
    rows.push({ label: '자원', value: `가스 ${gasPool(s, A)} · 별먼지 ${s.dust.in - s.dust.out} · 얼음 ${s.ice.in - s.ice.out}` });
  }
  if (done > 0) {
    const clusters = Math.floor(done / PER_CLUSTER);
    const zones = Math.floor(done / PER_ZONE);
    rows.push({ label: '항성계', value: `${done}곳${clusters ? ` · 성단 ${clusters}` : ''}${zones ? ` · 구역 ${zones}` : ''}` });
  }
  if (s.totals.stars > 0) rows.push({ label: '별과 행성', value: `별 ${s.totals.stars}개 · 행성 ${s.totals.planets}개 · 초신성 ${s.totals.supernovae}번` });
  if (A >= LIFE.oceanStart - LIFE.cometFlightMs) rows.push({ label: '생명의 행성', value: `바다 ${Math.round(oceanAt(s.seed, A) * 100)}%${A >= LIFE.life ? ' · 생명' : ''}${A >= LIFE.lights ? ' · 불빛' : ''}` });
  const lvl = civLevel(s.seed, A);
  if (lvl > 0) {
    const colonies = homeColonies(s.seed, A).length;
    const rivals = rivalsAt(s.seed, A).length;
    const battles = cosmosSights(s.seed, s.origin, currentPace()).filter((e) => e.kind === 'battle' && e.t0 <= W).length;
    rows.push({
      label: '문명',
      value: `${CIV_LEVEL_NAMES[lvl]}${colonies ? ` · 식민지 ${colonies}곳` : ''}${rivals ? ` · 다른 문명 ${rivals}곳` : ''}${battles ? ` · 충돌 ${battles}번` : ''}`,
    });
  }
  if (A >= CHRON.end) rows.push({ label: '우주 날씨', value: SPACE_WEATHER_NAMES[spaceWeatherAt(s.seed, A).id] });
  if (next) rows.push({ label: '다음 이정표', value: `${MILESTONE_NAME(next.id)} · ${ago(next.A - A)} 뒤` });
  if (passed.length) rows.push({ label: '우주 연표', value: passed.slice(-3).map((m) => `${MILESTONE_NAME(m.id)} ${ago(m.A)}`).join(' · ') });
  if (recent.length) {
    const list = recent
      .slice(-3)
      .reverse()
      .map((c) => `${c.name} (${dateText(c.at)}${ago(c.focusMs)})`)
      .join(' · ');
    rows.push({ label: '별자리 기록', value: `${list}${recent.length > 3 ? ` 외 ${recent.length - 3}개` : ''}` });
  }
  return rows;
}

export interface CosmosSummary {
  title: string;
  lines: string[];
}

/** What a session added to the universe (from A at its start and end). */
export function cosmosSummary(before: CosmosSim, after: CosmosSim, w0: number, w1: number): CosmosSummary {
  const seed = after.seed;
  const a0 = ageOf(after, w0);
  const a1 = ageOf(after, w1);
  const lines: string[] = [];
  const stars = fieldStars(a1) - fieldStars(a0) + (after.totals.stars - before.totals.stars);
  const planets = after.totals.planets - before.totals.planets;
  if (stars > 0) lines.push(`새 별 ${stars}개가 켜졌어요.`);
  if (planets > 0) lines.push(`새 행성 ${planets}개가 생겼어요.`);
  const colonies = homeColonies(seed, a1).length - homeColonies(seed, a0).length;
  if (colonies > 0) lines.push(`다른 별에 식민지 ${colonies}곳이 생겼어요.`);
  const battles = cosmosSights(seed, after.origin, currentPace()).filter((e) => e.kind === 'battle' && e.t0 >= w0 && e.t0 < w1).length;
  if (battles > 0) lines.push(`다른 문명의 함대와 ${battles}번 맞부딪쳤어요.`);
  const s0 = cosmosStage(seed, a0);
  const s1 = cosmosStage(seed, a1);
  if (s1 > s0) lines.push(`우주가 ${s0}단계에서 ${s1}단계(${COSMOS_STAGE_NAMES[s1]})로 자랐어요.`);
  const passed = milestones(seed).filter((m) => m.A > a0 && m.A <= a1 && m.id !== 'bang');
  if (passed.length) lines.push(`지나온 이정표: ${passed.map((m) => MILESTONE_NAME(m.id)).join(', ')}`);
  if (constellationOf(seed, a0, a1, 'wide')) lines.push(`오늘의 별자리: ${constellationName(seed, w0)}`);
  if (!lines.length) lines.push('우주가 조용히 다음 별을 준비했어요.');
  return { title: '집중한 시간만큼 별이 태어났어요.', lines };
}

export function cosmosStats(s: CosmosSim, W: number, focus: number = W): string {
  const A = ageOf(s, W);
  const parts = [timeStats(W, focus)];
  if (A > 0) parts.push(`우주의 나이 ${formatDurationKo(A)}`);
  const done = systemsDone(s.seed, A);
  if (done > 0) parts.push(`항성계 ${done.toLocaleString('ko-KR')}곳`);
  parts.push(`${cosmosStage(s.seed, A)}단계`);
  return parts.join(' · ');
}
