import { useEffect, useState } from 'react';
import { useTicker } from '../runtime';
import { Digits } from './TimerPanel';

const TIME = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
const DATE = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });

/** The current time as `period|h:mm|ss|date|dx|dy` (dx, dy: the slow drift that spares the screen). */
function read(): string {
  const d = new Date();
  const p = TIME.formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? '';
  // a few pixels over minutes, so the digits never sit on the same spot for long
  const m = d.getTime() / 60_000;
  const dx = Math.round(Math.sin((m * Math.PI * 2) / 7) * 14);
  const dy = Math.round(Math.cos((m * Math.PI * 2) / 11) * 8);
  return [get('dayPeriod'), `${get('hour')}:${get('minute')}`, String(d.getSeconds()).padStart(2, '0'), DATE.format(d), dx, dy].join('|');
}

/** "시계": the current time and date over the landscape. No session, no growth. */
export function ClockPanel() {
  const [period, hm, sec, date, dx, dy] = useTicker(read, true, []).split('|');
  const [full, setFull] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const canFull = typeof document !== 'undefined' && document.fullscreenEnabled;
  const toggleFull = () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    p?.catch(() => undefined);
  };

  return (
    <section className="panel clock-panel" aria-label="현재 시각">
      <div className="clock-face" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        <time className="clock now" dateTime={new Date().toISOString()}>
          <span className="sr-only">
            {period} {hm}
          </span>
          <span className="period" aria-hidden="true">
            {period}
          </span>
          <Digits text={hm} />
          <span className="sec" aria-hidden="true">
            {sec}
          </span>
        </time>
        <p className="clock-date">{date}</p>
      </div>
      {canFull && (
        <div className="clock-tools">
          <button type="button" className="btn ghost" onClick={toggleFull}>
            {full ? '전체 화면 끄기' : '전체 화면'}
          </button>
        </div>
      )}
    </section>
  );
}
