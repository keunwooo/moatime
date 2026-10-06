/** Words for the status line, the session summary and the footer (from the simulation). */

import { formatDurationKo, timeStats } from './duration';
import { sessionRate, type Persisted, type Session, type Status, type ThemeId } from './session';
import type { ForestSim } from '../sim/forest';
import type { SpaceSim } from '../sim/space';
import type { CosmosSim } from '../sim/cosmos';
import { workLine, type AnySim } from '../sim/describe';
import { cosmosIdleLine, cosmosStats, cosmosSummary } from '../sim/cosmosDescribe';
import { RULES_UNITS_PER_CLUSTER, RULES_UNITS_PER_ZONE } from '../sim/units';

function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** Korean particle after a word: josa('나무', '이', '가') → '나무가'. */
export function josa(word: string, withBatchim: string, without: string): string {
  return word + (hasBatchim(word) ? withBatchim : without);
}

export const NOUN: Record<ThemeId, { unit: string; counter: string; cluster: string; zone: string; place: string }> = {
  forest: { unit: '나무', counter: '그루', cluster: '군락', zone: '숲 구역', place: '숲' },
  space: { unit: '건물', counter: '개', cluster: '전초기지', zone: '정착 구역', place: '기지' },
  cosmos: { unit: '항성계', counter: '곳', cluster: '성단', zone: '은하 구역', place: '우주' },
};

export function statusLine(theme: ThemeId, status: Status, sim: AnySim, W: number, firstVisit: boolean): string {
  switch (status) {
    case 'running':
      return workLine(theme, sim, W);
    case 'paused':
      if (theme === 'cosmos') return '잠시 멈춤 · 우주도 함께 숨을 고르고 있어요';
      return theme === 'forest' ? '잠시 멈춤 · 숲지기도 함께 쉬고 있어요' : '잠시 멈춤 · 작업 드론도 함께 쉬고 있어요';
    case 'completed':
      if (theme === 'cosmos') return '집중한 시간만큼 별이 태어났어요.';
      return theme === 'forest' ? '오늘의 시간이 숲에 남았어요.' : '오늘의 시간이 기지에 남았어요.';
    default:
      if (theme === 'cosmos') return cosmosIdleLine(sim as CosmosSim, W);
      if (firstVisit) {
        return theme === 'forest' ? '샘가의 작은 공터에서 숲지기가 기다려요' : '착륙선 옆에서 작업 드론이 기다려요';
      }
      return theme === 'forest' ? '시작하면 숲지기가 하던 일을 이어가요' : '시작하면 작업 드론이 하던 일을 이어가요';
  }
}

export interface SessionSummary {
  title: string;
  added: string;
  world: string;
  lines: string[];
}

/** The line a faster session adds to its summary (none at ×1). */
export function rateLine(sess: Session): string | null {
  const rate = sessionRate(sess);
  if (rate === 1) return null;
  // the growth of the time as shown (whole seconds, or whole minutes past an hour), so the sum adds up
  const short = sess.accruedMs < 3600_000;
  const unit = short ? 1000 : 60_000;
  const shown = Math.floor(sess.accruedMs / unit) * unit;
  const grown = shown * rate;
  return `${formatDurationKo(shown, { seconds: short })} 집중했고, 풍경은 ${rateWord(rate)} ${formatDurationKo(grown, { seconds: grown < 3600_000 })}만큼 자랐어요.`;
}

/** "×5로", "×10으로" (the number as it is read). */
export function rateWord(rate: number): string {
  return `×${rate}${rate === 10 ? '으로' : '로'}`;
}

export function summarize(theme: ThemeId, s: Persisted, sess: Session, before: AnySim, after: AnySim): SessionSummary {
  const rl = rateLine(sess);
  if (theme === 'cosmos') {
    const c = cosmosSummary(before as CosmosSim, after as CosmosSim, sess.worldMsAtStart, sess.worldMsAtStart + sess.accruedMs * sessionRate(sess));
    return {
      title: c.title,
      added: formatDurationKo(sess.accruedMs, { seconds: sess.accruedMs < 3600_000 }),
      world: formatDurationKo(s.world.bankedMs),
      lines: rl ? [rl, ...c.lines] : c.lines,
    };
  }
  const n = NOUN[theme];
  const lines: string[] = [];
  const grown = after.done - before.done;
  const clusters = Math.floor(after.done / RULES_UNITS_PER_CLUSTER) - Math.floor(before.done / RULES_UNITS_PER_CLUSTER);
  const zones = Math.floor(after.done / RULES_UNITS_PER_ZONE) - Math.floor(before.done / RULES_UNITS_PER_ZONE);
  if (theme === 'space') {
    const a = after as SpaceSim;
    const b = before as SpaceSim;
    const mined = (t: 'm' | 'c' | 'r') => a.mined[t] - b.mined[t];
    const parts = [mined('m') > 0 ? `금속 ${mined('m')}` : '', mined('c') > 0 ? `결정 ${mined('c')}` : '', mined('r') > 0 ? `희귀 광물 ${mined('r')}` : ''].filter(Boolean);
    if (parts.length) lines.push(`작업 드론이 ${parts.join(', ')}상자를 캐서 저장소로 옮겼어요.`);
    if (grown > 0) lines.push(`건물 ${grown}개가 완성됐어요.`);
    if (a.rovers.length > b.rovers.length) lines.push(`작업 드론 ${a.rovers.length - b.rovers.length}대가 새로 합류했어요.`);
    const guards = a.army.inf - b.army.inf;
    const tanks = a.army.tanks - b.army.tanks;
    if (guards > 0 || tanks > 0) {
      const what = [guards > 0 ? `경비대원 ${guards}명` : '', tanks > 0 ? `탱크 ${tanks}대` : ''].filter(Boolean).join('과 ');
      lines.push(`주둔군에 ${josa(what, '이', '가')} 더해졌어요.`);
    }
    const raids = a.raids.n - b.raids.n;
    if (raids > 0) lines.push(`습격을 ${raids}번 막아냈어요.`);
  } else {
    const a = after as ForestSim;
    const b = before as ForestSim;
    const leaves = a.totals.leaves - b.totals.leaves;
    const mould = a.totals.mould - b.totals.mould;
    const seeds = a.totals.seeds - b.totals.seeds;
    if (grown > 0) lines.push(`나무 ${grown}그루가 다 자랐어요.`);
    if (seeds > 0) lines.push(`떨어진 씨앗 ${seeds}알을 바구니에 모았어요.`);
    if (leaves > 0) lines.push(mould > 0 ? `낙엽 ${leaves}장을 모았고, 부엽토 ${mould}줌을 다음 생명에 썼어요.` : `낙엽 ${leaves}장을 모아 퇴비 더미에 쌓았어요.`);
  }
  if (zones > 0) lines.push(`새 ${n.zone} ${zones}곳이 이어졌어요.`);
  else if (clusters > 0) lines.push(`${n.cluster} ${clusters}곳이 모습을 갖췄어요.`);
  if (!lines.length) lines.push(theme === 'forest' ? '숲지기가 공터를 가꾸며 다음 성장을 준비했어요.' : '작업 드론이 다음 공사를 준비했어요.');
  if (rl) lines.unshift(rl);
  return {
    title: theme === 'forest' ? '오늘의 시간이 숲에 남았어요.' : '오늘의 시간이 기지에 남았어요.',
    added: formatDurationKo(sess.accruedMs, { seconds: sess.accruedMs < 3600_000 }),
    world: formatDurationKo(s.world.bankedMs),
    lines,
  };
}

export function worldStats(theme: ThemeId, W: number, sim: AnySim, focus: number = W): string {
  if (theme === 'cosmos') return cosmosStats(sim as CosmosSim, W, focus);
  const n = NOUN[theme];
  const parts = [timeStats(W, focus)];
  const units = sim.done;
  const zones = Math.floor(units / RULES_UNITS_PER_ZONE);
  const clusters = Math.floor(units / RULES_UNITS_PER_CLUSTER);
  if (units > 0) parts.push(`${n.unit} ${units.toLocaleString('ko-KR')}${n.counter}`);
  if (zones > 0) parts.push(`${n.zone} ${zones.toLocaleString('ko-KR')}곳`);
  else if (clusters > 0) parts.push(`${n.cluster} ${clusters}곳`);
  return parts.join(' · ');
}
