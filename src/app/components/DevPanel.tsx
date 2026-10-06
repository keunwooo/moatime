/**
 * Development-only inspection tools (never bundled in production builds): world time, the
 * simulation's stock and work, season, zone, checkpoints and time acceleration.
 * World time is manipulated separately from the session clock.
 */

import { useEffect, useRef, useState } from 'react';
import { formatDurationKo } from '../../core/duration';
import { SIM_KEY_PREFIX } from '../../core/persist';
import { SEASON } from '../../sim/config';
import { detailRows } from '../../sim/describe';
import { forestStage, type ForestSim } from '../../sim/forest';
import { seasonMix, SEASON_NAMES } from '../../world/season';
import { clockText, nextPhaseAt, PHASE_NAMES } from '../../world/clock';
import { worldEnv } from '../../world/env';
import { EVENT_DEFS } from '../../world/events';
import { eventsIn } from '../../world/timeline';
import { WEATHER_NAMES } from '../../world/weather';
import { WORLD } from '../../sim/config';
import { spaceStage, type SpaceSim } from '../../sim/space';
import { nextRaidAt, pacedRaids } from '../../world/pace';
import type { Worker } from '../../sim/types';
import { RULES_UNITS_PER_CLUSTER as UPC, RULES_UNITS_PER_ZONE as UPZ } from '../../sim/units';
import { engine, useEngine } from '../runtime';
import { saveSimCheckpoints, simRunner } from '../sim';
import { hostRef } from '../hostRef';

function workerLine(w: Worker, W: number): string {
  const st = w.step;
  if (!st) return `${w.job} · -`;
  const p = st.t1 > st.t0 ? Math.round(((W - st.t0) / (st.t1 - st.t0)) * 100) : 100;
  const move = st.a === st.b ? st.a : `${st.a}→${st.b}`;
  return `${w.job} · ${st.k} ${move}${st.n ? ` (${st.c}×${st.n})` : ''} · ${p}% · ${Math.round((st.t1 - W) / 1000)}s 남음`;
}

export default function DevPanel() {
  const state = useEngine();
  const theme = state.settings.theme;
  const [open, setOpen] = useState(() => localStorage.getItem('moa:dev:open') !== '0');
  const [speed, setSpeed] = useState(1);
  const [hours, setHours] = useState('');
  const [, force] = useState(0);
  const last = useRef(performance.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last.current;
      last.current = now;
      if (speed > 1 && engine.status() === 'running') void engine.devAddWorldTime(dt * (speed - 1));
      force((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [speed]);

  useEffect(() => {
    try {
      localStorage.setItem('moa:dev:open', open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  if (!open) {
    return (
      <button type="button" className="dev-toggle" onClick={() => setOpen(true)}>
        DEV
      </button>
    );
  }

  const W = engine.worldTime();
  const runner = simRunner(theme);
  const sim = runner.at(W);
  const info = hostRef.current?.devInfo();
  const setW = (w: number) => void engine.devSetWorldTime(Math.max(0, w));
  const season = seasonMix(W);
  const env = worldEnv(theme, state.world.seed, W);
  const upcoming = eventsIn(EVENT_DEFS, theme, state.world.seed, W, W + 24 * 3600e3)[0];
  const slots = hostRef.current?.devDirector.active() ?? [];
  const q = SEASON.yearMs / 4;
  const nextSeason = (Math.floor(W / q) + 1) * q;
  const workers: Worker[] = theme === 'space' ? (sim as SpaceSim).rovers : [(sim as ForestSim).keeper, ...((sim as ForestSim).squirrel ? [(sim as ForestSim).squirrel!] : [])];
  let stored = '-';
  try {
    const t = localStorage.getItem(`${SIM_KEY_PREFIX}${theme}`);
    if (t) stored = formatDurationKo(JSON.parse(t).W ?? 0, { seconds: true });
  } catch {
    stored = '읽기 실패';
  }

  /** Jump to just before the next unit completes (searched on a copy, never on the live state). */
  const toNextCompletion = (lead: number) => {
    let w = W;
    const target = sim.done + 1;
    for (let i = 0; i < 2000; i++) {
      w += 10_000;
      if (runner.stateAt(w).done >= target) break;
    }
    setW(Math.max(W, w - lead));
  };

  return (
    <aside className="dev" aria-label="개발용 검수 도구">
      <header>
        <strong>검수 도구 (DEV)</strong>
        <button type="button" onClick={() => setOpen(false)}>
          접기
        </button>
      </header>
      <dl>
        <dt>세계 W</dt>
        <dd>
          {formatDurationKo(W, { seconds: true })} ({Math.round(W / 1000)}s) · 세션 E {formatDurationKo(engine.sessionElapsed(), { seconds: true })}
        </dd>
        <dt>구역</dt>
        <dd>
          완성 {sim.done} · 구역 {Math.floor(sim.done / UPZ)} · 군락 {sim.cluster} ({sim.done - sim.cluster * UPC}/4)
          {theme === 'forest' ? ` · 숲 ${forestStage(sim as ForestSim, W)}단계` : ` · 콜로니 ${spaceStage(sim as SpaceSim)}단계`}
        </dd>
        <dt>계절</dt>
        <dd>
          {SEASON_NAMES[season.id]} {Math.round(season.p * 100)}% · {season.year + 1}년째
        </dd>
        <dt>시간대</dt>
        <dd>
          {env.day.day + 1}일째 {clockText(theme, W)} · {PHASE_NAMES[env.day.phase]} · 해 {env.day.sun.elev.toFixed(2)} · 빛 {env.day.light.toFixed(2)} · 달 {Math.round(env.day.moon.illum * 100)}%
        </dd>
        <dt>날씨·사건</dt>
        <dd>
          {WEATHER_NAMES[env.weather.id]} (구름 {env.weather.cloud.toFixed(2)} · 비 {env.weather.rain.toFixed(2)} · 눈 {env.weather.snow.toFixed(2)} · 안개 {env.weather.fog.toFixed(2)}) · 사건{' '}
          {env.event ? `${env.event.kind} ${Math.round((env.event.t1 - W) / 1000)}s 남음` : '-'} · 다음 {upcoming ? `${upcoming.kind} ${formatDurationKo(upcoming.t0 - W)} 뒤` : '-'} · 슬롯 {slots.map((x) => `${x.id}(${x.channel})`).join(', ') || '-'}
        </dd>
        {theme === 'space' && (
          <>
            <dt>습격</dt>
            <dd>
              {(() => {
                const sp = sim as SpaceSim;
                const r = sp.raid;
                const planned = nextRaidAt(pacedRaids(sp.seed, engine.getState().world.pace ?? []), W);
                const next = Number.isFinite(planned) ? `다음 ${formatDurationKo(Math.max(0, planned - W))} 뒤` : '이번 세션에 계획 없음';
                const now = r ? ` · 지금 ${r.faction} ${r.raiders.length} (전선 탱크 ${r.tanks} · 경비대 ${r.inf} · 포탑 ${r.turrets.length}) 피해 ${r.hits.length} 무력화 ${r.tankKo.length} 보호막 ${r.infShield.length}${r.wreck >= 0 ? ` 잔해 u${r.wreck}` : ''}` : '';
                return `${sp.raids.n}번 · ${next}${now} · 주둔군 ${sp.army.inf}/${sp.army.tanks} (치료 ${sp.army.out}) · 수리 대기 ${sp.damage.length}${sp.wreck ? ` · 재건 u${sp.wreck.u} ${sp.wreck.cleared ? `${sp.wreck.stage}/3` : '잔해'}` : ''} · 정비 드론 ${sp.crew.length} (${sp.crew.map((w) => w.job).join(', ')})`;
              })()}
            </dd>
          </>
        )}
        <dt>재고</dt>
        <dd>
          {detailRows(theme, sim, W)
            .map((r) => `${r.label} ${r.value}`)
            .join(' · ')}
        </dd>
        {workers.map((w, i) => (
          <div key={i} className="dev-worker">
            <dt>{theme === 'space' ? `드론 ${i + 1}` : i === 0 ? '숲지기' : '다람쥐'}</dt>
            <dd>{workerLine(w, W)}</dd>
          </div>
        ))}
        <dt>시뮬레이션</dt>
        <dd>
          v{sim.v} · 사건 {runner.events.toLocaleString()} · 계산 {runner.lastCatchUpMs.toFixed(1)}ms · 체크포인트 {runner.checkpointCount()} · 저장된 지점 {stored}
        </dd>
        <dt>렌더</dt>
        <dd>
          {info?.fps ?? '-'}fps · {info?.frameMs ?? '-'}ms · {info?.framing} · 카드 {info?.stats?.cards ?? '-'} / 보임 {info?.stats?.visible ?? '-'} · 텍스처 {info?.stats?.textures ?? '-'}
        </dd>
      </dl>
      <div className="row">
        <span>시간</span>
        {[
          ['+10초', 10_000],
          ['+1분', 60_000],
          ['+10분', 600_000],
          ['+1시간', 3_600_000],
          ['+8시간', 8 * 3_600_000],
          ['+100시간', 100 * 3_600_000],
        ].map(([label, d]) => (
          <button key={label} type="button" onClick={() => setW(W + (d as number))}>
            {label}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" onClick={() => toNextCompletion(20_000)}>
          다음 완성 −20초
        </button>
        <button type="button" onClick={() => setW(nextSeason - 60_000)}>
          다음 계절 −1분
        </button>
        <button type="button" onClick={() => setW(nextPhaseAt(theme, W, WORLD.sunrise) - 30_000)}>
          일출 −30초
        </button>
        <button type="button" onClick={() => setW(nextPhaseAt(theme, W, 0.5))}>
          정오
        </button>
        <button type="button" onClick={() => setW(nextPhaseAt(theme, W, WORLD.sunset) - 60_000)}>
          일몰 −1분
        </button>
        <button type="button" onClick={() => setW(nextPhaseAt(theme, W, 0))}>
          자정
        </button>
        {upcoming && (
          <button type="button" onClick={() => setW(upcoming.t0 - 10_000)}>
            다음 사건 −10초
          </button>
        )}
        {theme === 'space' && !(sim as SpaceSim).raid && (
          <button type="button" onClick={() => void engine.devCallRaid(W + 10_000)}>
            습격 부르기(10초 뒤)
          </button>
        )}
        <button type="button" onClick={() => setW(0)}>
          W=0
        </button>
        <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="시간" aria-label="세계 시간(시간 단위)" />
        <button type="button" onClick={() => Number.isFinite(Number(hours)) && setW(Number(hours) * 3600e3)}>
          설정
        </button>
      </div>
      <div className="row">
        <span>빠른 재생</span>
        {[1, 10, 60, 300].map((k) => (
          <button key={k} type="button" className={speed === k ? 'on' : ''} onClick={() => setSpeed(k)}>
            ×{k}
          </button>
        ))}
        <button type="button" onClick={() => saveSimCheckpoints(true)}>
          체크포인트 저장
        </button>
        <button type="button" onClick={() => void engine.finish()}>
          세션 임의 종료
        </button>
      </div>
      <p className="note">빠른 재생과 시간 이동은 세계 시간에만 더해져요 (세션 E는 실제 시간). 시뮬레이션은 같은 W에서 항상 같은 결과예요.</p>
      <p className="note">
        rev {state.rev} · 리더 탭 {engine.isLeader() ? '예' : '아니오'} · {state.world.id}
        {state.world.migratedFrom ? ` · 이관됨(v${state.world.migratedFrom.v}, 기준 ${formatDurationKo(state.world.base.W)})` : ''}
      </p>
    </aside>
  );
}
