import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { detailRows } from '../sim/describe';
import { worldStats } from '../core/describe';
import { formatDurationKo, spokenDuration } from '../core/duration';
import { statusOf } from '../core/session';
import { sound } from '../audio/sound';
import { useAudioOwner } from '../audio/owner';
import { engine, useEngine, usePrefersReducedMotion, useTicker } from './runtime';
import { simAt } from './sim';
import { dayAt } from '../world/clock';
import { envRows } from '../world/describe';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SceneCanvas } from './components/SceneCanvas';
import { Summary } from './components/Summary';
import { TimerPanel } from './components/TimerPanel';
import { TopBar } from './components/TopBar';

const DevPanel = import.meta.env.DEV ? lazy(() => import('./components/DevPanel')) : null;

export function App() {
  const state = useEngine();
  const status = statusOf(state);
  const theme = state.settings.theme;
  const systemReduced = usePrefersReducedMotion();
  const reduced = state.settings.motion === 'reduce' || (state.settings.motion === 'system' && systemReduced);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmUniverse, setConfirmUniverse] = useState(false);
  const [announce, setAnnounce] = useState('');
  const firstVisit = state.world.bankedMs === 0 && !state.session;

  useEffect(() => {
    // a theme switch changes the UI colours at once; only the forest's night fades slowly
    const root = document.documentElement;
    root.dataset.instant = '1';
    root.dataset.theme = theme;
    const id = window.setTimeout(() => delete root.dataset.instant, 120);
    return () => window.clearTimeout(id);
  }, [theme]);

  // Forest at night: light text over a darker veil (with a margin so it never flickers).
  const nightUi = useRef(false);
  const light = useTicker(
    () => {
      if (theme !== 'forest') return 'day';
      const n = dayAt('forest', engine.worldTime()).sky[0];
      if (nightUi.current ? n < 0.35 : n > 0.55) nightUi.current = !nightUi.current;
      return nightUi.current ? 'night' : 'day';
    },
    status === 'running',
    [theme, status, state.world.bankedMs, state.world.id],
  );
  useEffect(() => {
    document.documentElement.dataset.light = light;
  }, [light]);

  // Ambient sound follows the setting and theme, plays only in the tab that owns audio,
  // and is quieter while paused.
  const audioOwner = useAudioOwner();
  useEffect(() => {
    sound.setAmbient(theme, state.settings.ambientSound && audioOwner, status === 'paused' ? 0.4 : 1);
  }, [theme, state.settings.ambientSound, status, audioOwner]);

  // Announce state changes only (never every second).
  const prevStatus = useRef(status);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (prev === status) return;
    const sess = state.session;
    if (status === 'running') setAnnounce(prev === 'paused' ? '다시 시작했어요.' : '타이머를 시작했어요.');
    // the universe's first moment, heard softly (only with the ambient sound on)
    if (status === 'running' && theme === 'cosmos' && state.settings.ambientSound && audioOwner && engine.worldTime() - engine.cosmosOrigin() < 1500) sound.swell();
    else if (status === 'paused') setAnnounce('일시정지했어요.');
    else if (status === 'completed' && sess) setAnnounce(`세션이 끝났어요. 이번 세션 ${spokenDuration(sess.accruedMs)}. 자란 풍경은 그대로 남아요.`);
    else if (status === 'idle' && (prev === 'running' || prev === 'paused')) setAnnounce('타이머를 초기화했어요. 풍경은 그대로예요.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, state.session]);

  // Keyboard: Space starts / pauses / resumes when focus is not in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.defaultPrevented) return;
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const el = e.target as HTMLElement;
      // only on the landscape itself; never steal Space from controls, links, FAQ or scrolling
      if (el.closest('input, textarea, select, button, a, summary, details, [contenteditable], [role], dialog, .below')) return;
      if (window.scrollY > window.innerHeight * 0.5) return;
      e.preventDefault();
      const st = engine.status();
      if (st === 'idle') {
        sound.unlock();
        void engine.start();
      } else if (st === 'running') void engine.pause();
      else if (st === 'paused') void engine.resume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [details, setDetails] = useState(false);
  // exact numbers only on request: a small panel above the footer, refreshed once a second
  const rows = useTicker(
    () => {
      if (!details) return '';
      const W = engine.worldTime();
      return JSON.stringify([...envRows(theme, engine.getState().world.seed, W), ...detailRows(theme, simAt(theme, W), W)]);
    },
    details && status === 'running',
    [details, theme, status, state.world.bankedMs, state.world.id],
  );
  const stats = useTicker(
    () => {
      const W = engine.worldTime();
      return worldStats(theme, W, simAt(theme, W));
    },
    status === 'running',
    [theme, state.world.bankedMs, state.world.id],
  );

  return (
    <div className={`stage theme-${theme} ${reduced ? 'reduced' : ''}`}>
      <h1 className="sr-only">모아 — 집중한 시간이 자라는 풍경 타이머</h1>
      <SceneCanvas theme={theme} reducedMotion={reduced} cameraLock={state.settings.cameraLock} lowPower={state.settings.lowPower} effects={state.settings.effects} />
      <div className="veil" aria-hidden="true" />
      <TopBar state={state} onNewWorld={() => setConfirmNew(true)} onNewUniverse={() => setConfirmUniverse(true)} />
      <main className="center" id="timer">
        {status === 'completed' ? <Summary state={state} /> : <TimerPanel state={state} firstVisit={firstVisit} />}
      </main>
      <footer className="world-info">
        {details && rows && (
          <dl className="details" id="work-details">
            {(JSON.parse(rows) as { label: string; value: string }[]).map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <span className="stats-row">
          <span>{stats}</span>
          <button type="button" className={`detail-btn ${details ? 'on' : ''}`} aria-expanded={details} aria-controls="work-details" onClick={() => setDetails((d) => !d)}>
            {details ? '닫기' : '자세히'}
          </button>
        </span>
        {engine.warning && <span className="warn">{engine.warning}</span>}
      </footer>
      <a className="scroll-hint" href="#about">
        모아 소개 · 사용 방법
      </a>
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
      {confirmNew && (
        <ConfirmDialog
          title="새 풍경을 만들까요?"
          body={
            <>
              <p>
                지금 풍경({formatDurationKo(state.world.bankedMs)} 동안 자란 {theme === 'forest' ? '숲' : theme === 'space' ? '기지' : '숲과 기지, 우주'})은 보관함에 기록되고, 처음부터 새로 시작해요.
              </p>
              <p>진행 중인 세션이 있다면 지금까지의 시간을 남기고 끝나요. 타이머만 처음으로 돌리려면 ‘초기화’를 쓰세요.</p>
            </>
          }
          confirm="새 풍경 만들기"
          onConfirm={() => void engine.newWorld()}
          onClose={() => setConfirmNew(false)}
        />
      )}
      {confirmUniverse && (
        <ConfirmDialog
          title="새 우주를 시작할까요?"
          body={
            <>
              <p>지금의 우주(우주의 나이 {formatDurationKo(Math.max(0, engine.worldTime() - engine.cosmosOrigin()))})는 사라지고, 빛 한 점에서 다시 시작해요.</p>
              <p>숲과 우주(기지), 쌓인 집중 시간은 그대로예요. 지난 세션의 별자리 기록도 남아요.</p>
            </>
          }
          confirm="새 우주 시작"
          onConfirm={() => void engine.newUniverse()}
          onClose={() => setConfirmUniverse(false)}
        />
      )}
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </div>
  );
}
