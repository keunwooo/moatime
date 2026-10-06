import { useEffect, useId, useState } from 'react';
import { fieldsFromMs, formatDurationKo, parseDuration, type DurationFields } from '../../core/duration';
import { engine } from '../runtime';

const PRESETS: [string, number][] = [
  ['5분', 5 * 60e3],
  ['15분', 15 * 60e3],
  ['25분', 25 * 60e3],
  ['50분', 50 * 60e3],
  ['2시간', 2 * 3600e3],
  ['8시간', 8 * 3600e3],
  ['24시간', 24 * 3600e3],
];

/** Presets are conveniences; the custom fields accept any positive duration. */
export function TimeSetter({ valueMs, showDays }: { valueMs: number; showDays: boolean }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<DurationFields>(() => fieldsFromMs(valueMs));
  const [error, setError] = useState<string | null>(null);
  const [daysWanted, setDays] = useState(showDays);
  const id = useId();
  // the day field is shown whenever it carries a value, so a day count is never dropped
  const days = daysWanted || valueMs >= 86400e3 || fields.days.trim() !== '';

  useEffect(() => {
    if (!open) setFields(fieldsFromMs(valueMs));
  }, [valueMs, open]);

  const apply = () => {
    const r = parseDuration(days ? fields : { ...fields, days: '' }, Date.now());
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    void engine.updateSettings({ countdownMs: r.ms, showDays: days });
    setOpen(false);
  };

  const set = (k: keyof DurationFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };

  return (
    <div className="setter">
      <div className="chips" role="group" aria-label="빠른 시간 설정">
        {PRESETS.map(([label, ms]) => (
          <button
            key={label}
            type="button"
            className={`chip ${valueMs === ms ? 'on' : ''}`}
            aria-pressed={valueMs === ms}
            onClick={() => {
              void engine.updateSettings({ countdownMs: ms });
              setOpen(false);
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
        <button type="button" className={`chip ${open ? 'on' : ''}`} aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen((o) => !o)}>
          직접 입력
        </button>
      </div>
      {open && (
        <form
          id={`${id}-form`}
          className="fields"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          noValidate
        >
          {days && (
            <label>
              <input inputMode="numeric" autoComplete="off" value={fields.days} onChange={set('days')} aria-invalid={!!error} placeholder="0" />
              <span>일</span>
            </label>
          )}
          <label>
            <input inputMode="numeric" autoComplete="off" value={fields.hours} onChange={set('hours')} aria-invalid={!!error} placeholder="0" />
            <span>시간</span>
          </label>
          <label>
            <input inputMode="numeric" autoComplete="off" value={fields.minutes} onChange={set('minutes')} aria-invalid={!!error} placeholder="0" />
            <span>분</span>
          </label>
          <label>
            <input inputMode="numeric" autoComplete="off" value={fields.seconds} onChange={set('seconds')} aria-invalid={!!error} placeholder="0" />
            <span>초</span>
          </label>
          {!days && (
            <button type="button" className="chip ghost" onClick={() => setDays(true)}>
              + 일 단위
            </button>
          )}
          <button type="submit" className="chip apply">
            적용
          </button>
          <p className="field-msg" role={error ? 'alert' : undefined}>
            {error ?? `현재 ${formatDurationKo(valueMs, { seconds: true })} · 최소·최대 제한 없이 원하는 만큼 정할 수 있어요`}
          </p>
        </form>
      )}
    </div>
  );
}
