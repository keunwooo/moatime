import { useMemo, useState } from 'react';
import { summarize } from '../../core/describe';
import type { Persisted } from '../../core/session';
import { engine } from '../runtime';
import { simRunner } from '../sim';
import { CloseIcon } from './Icons';

/** Session record after completion. Never auto-starts the next session. */
export function Summary({ state }: { state: Persisted }) {
  const sess = state.session!;
  const theme = state.settings.theme;
  const s = useMemo(() => {
    // the world before and after this session, from the simulation (checkpoints make it cheap)
    const r = simRunner(theme);
    const start = Math.max(sess.worldMsAtStart, state.world.base.W);
    const before = r.stateAt(start);
    const after = r.stateAt(Math.max(start, sess.worldMsAtStart + sess.accruedMs));
    return summarize(theme, state, sess, before, after);
  }, [theme, state, sess]);
  const [folded, setFolded] = useState(false);

  if (folded) {
    return (
      <div className="summary folded">
        <button type="button" className="btn primary" onClick={() => void engine.continueAfter()}>
          이어 집중하기
        </button>
        <button type="button" className="btn ghost" onClick={() => setFolded(false)}>
          기록 보기
        </button>
      </div>
    );
  }
  return (
    <section className="summary" aria-labelledby="summary-title">
      <button type="button" className="summary-close" onClick={() => setFolded(true)} aria-label="기록 접고 풍경 보기">
        <CloseIcon />
      </button>
      <h2 id="summary-title">{s.title}</h2>
      <dl className="summary-stats">
        <div>
          <dt>이번 세션</dt>
          <dd>+{s.added}</dd>
        </div>
        <div>
          <dt>풍경에 쌓인 시간</dt>
          <dd>{s.world}</dd>
        </div>
      </dl>
      <ul className="summary-lines">
        {s.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="controls">
        <button type="button" className="btn primary" onClick={() => void engine.continueAfter()}>
          이어 집중하기
        </button>
        <button type="button" className="btn ghost" onClick={() => setFolded(true)}>
          풍경 바라보기
        </button>
      </div>
    </section>
  );
}
