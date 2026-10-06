import { clockParts } from '../../core/duration';
import { statusLine } from '../../core/describe';
import { sessionElapsed, sessionProgress, sessionRate, sessionRemaining, statusOf, type Persisted } from '../../core/session';
import { engine, useTicker } from '../runtime';
import { simAt } from '../sim';
import { sound } from '../../audio/sound';
import { PauseIcon, PlayIcon, ResetIcon, StopIcon } from './Icons';
import { TimeSetter } from './TimeSetter';
import { RaceCards } from './RaceCards';

export function Digits({ text }: { text: string }) {
  return (
    <span className="digits" aria-hidden="true">
      {[...text].map((ch, i) =>
        ch === ':' ? (
          <span key={i} className="colon">
            :
          </span>
        ) : (
          <span key={i} className="d">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

export function TimerPanel({ state, firstVisit }: { state: Persisted; firstVisit: boolean }) {
  const status = statusOf(state);
  const sess = state.session;
  const mode = sess ? sess.mode : state.settings.mode;
  const running = status === 'running';
  const theme = state.settings.theme;

  // The ticker returns a string so React re-renders only when the shown second changes.
  const key = useTicker(
    () => {
      const now = Date.now();
      const p = !sess
        ? mode === 'countdown'
          ? clockParts(state.settings.countdownMs, 'ceil')
          : clockParts(0, 'floor')
        : sess.mode === 'countdown'
          ? clockParts(sessionRemaining(sess, now) ?? 0, 'ceil')
          : clockParts(sessionElapsed(sess, now), 'floor');
      return `${p.days ?? ''}|${p.clock}`;
    },
    running,
    [sess, mode, state.settings.countdownMs],
  );
  const [daysText, clockText] = key.split('|');
  const display = { days: daysText ? Number(daysText) : null, clock: clockText };
  const progress = useTicker(() => (sess ? Math.floor((sessionProgress(sess, Date.now()) ?? 0) * 1000) / 1000 : null), running, [sess]);
  // generated from the simulated work; re-renders only when the sentence changes
  const line = useTicker(
    () => {
      const W = engine.worldTime();
      return statusLine(theme, status, simAt(theme, W), W, firstVisit);
    },
    // the front's prologue turns its lines while the people is still to be chosen
    running || (theme === 'front' && status === 'idle' && !state.world.front?.cur),
    [status, theme, state.world.bankedMs, state.world.id, firstVisit, state.world.front?.cur?.origin],
  );


  const start = () => {
    sound.unlock();
    void engine.start();
  };

  const label =
    mode === 'countdown' ? (sess ? '남은 시간' : '설정 시간') : '경과 시간';
  // growth speed: the session's own once it runs, the setting before
  const rate = sess && status !== 'completed' ? sessionRate(sess) : state.settings.growthRate;

  return (
    <section className={`panel status-${status}`} aria-label="타이머">
      <p className="status-line">{line}</p>
      <div className="clock" data-key={key}>
        <span className="sr-only">
          {label} {display.days ? `${display.days}일 ` : ''}
          {display.clock}
          {rate > 1 ? `, 성장 속도 ${rate}배` : ''}
        </span>
        {display.days !== null && (
          <span className="days" aria-hidden="true">
            {display.days.toLocaleString('ko-KR')}
            <small>일</small>
          </span>
        )}
        <Digits text={display.clock} />
      </div>
      <div className="clock-caption" aria-hidden="true">
        {label}
        {rate > 1 && <span className="rate-badge">×{rate}</span>}
      </div>
      {mode === 'countdown' && sess && progress !== null && (
        <div className="progress" role="progressbar" aria-label="세션 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)}>
          <div className="progress-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
      {/* the front's people is chosen first (in place of the presets, until a war is on) */}
      {status === 'idle' && theme === 'front' && !state.world.front?.cur ? (
        <RaceCards state={state} />
      ) : (
        status === 'idle' && mode === 'countdown' && <TimeSetter valueMs={state.settings.countdownMs} showDays={state.settings.showDays} />
      )}
      {status === 'idle' && mode === 'stopwatch' && <p className="hint">종료 시간을 정하지 않고, 마칠 때 종료를 눌러요.</p>}
      <div className="controls">
        {/* one persistent button whose role changes, so keyboard focus stays on it */}
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (status === 'idle') start();
            else if (status === 'running') void engine.pause();
            else if (status === 'paused') {
              sound.unlock();
              void engine.resume();
            }
          }}
        >
          {status === 'running' ? <PauseIcon /> : <PlayIcon />}
          {status === 'idle' ? '시작' : status === 'running' ? '일시정지' : '재개'}
        </button>
        {(status === 'running' || status === 'paused') && (
          <>
            <button type="button" className="btn" onClick={() => void engine.finish()} title="이번 세션을 마치고 기록을 봐요">
              <StopIcon />
              종료
            </button>
            <button type="button" className="btn ghost" onClick={() => void engine.reset()} title="타이머만 처음으로 돌려요. 자란 풍경은 그대로 남아요">
              <ResetIcon />
              초기화
            </button>
          </>
        )}
      </div>
    </section>
  );
}
