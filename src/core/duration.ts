/** Duration parsing, validation and formatting. No product-level min/max: only real-number and representation limits. */

import { maxTargetMs } from './session';

export interface DurationFields {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

export type ParseResult =
  | { ok: true; ms: number }
  | { ok: false; error: string; field?: keyof DurationFields };

const FULLWIDTH = /[０-９]/g;

function parseField(raw: string): number | 'invalid' | 'overflow' {
  const t = raw.replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
  if (t === '') return 0;
  if (!/^\d+$/.test(t)) return 'invalid';
  if (t.replace(/^0+/, '').length > 16) return 'overflow';
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return 'overflow';
  return n;
}

export function parseDuration(fields: DurationFields, now: number): ParseResult {
  const order: (keyof DurationFields)[] = ['days', 'hours', 'minutes', 'seconds'];
  const vals: number[] = [];
  for (const key of order) {
    const v = parseField(fields[key]);
    if (v === 'invalid') return { ok: false, error: '0 이상의 정수만 입력할 수 있어요.', field: key };
    if (v === 'overflow') return { ok: false, error: '표현할 수 있는 시간 범위를 넘었어요.', field: key };
    vals.push(v);
  }
  const [d, h, m, s] = vals;
  // Accumulate in seconds, checking every step stays an exact integer.
  let total = d;
  for (const [mul, add] of [
    [24, h],
    [60, m],
    [60, s],
  ] as const) {
    total = total * mul + add;
    if (!Number.isSafeInteger(total)) return { ok: false, error: '표현할 수 있는 시간 범위를 넘었어요.' };
  }
  const ms = total * 1000;
  if (!Number.isSafeInteger(ms) || ms > maxTargetMs(now)) {
    return { ok: false, error: `표현할 수 있는 시간 범위를 넘었어요. (최대 약 ${maxYears(now)}년)` };
  }
  if (ms <= 0) return { ok: false, error: '0초보다 긴 시간을 입력해 주세요.' };
  return { ok: true, ms };
}

function maxYears(now: number): string {
  return Math.floor(maxTargetMs(now) / (365.25 * 86400000)).toLocaleString('ko-KR');
}

export interface Split {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitSeconds(totalSeconds: number): Split {
  const t = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(t / 86400);
  const rem = t - days * 86400;
  const hours = Math.floor(rem / 3600);
  const minutes = Math.floor((rem - hours * 3600) / 60);
  const seconds = rem - hours * 3600 - minutes * 60;
  return { days, hours, minutes, seconds };
}

export function fieldsFromMs(ms: number): DurationFields {
  const s = splitSeconds(ms / 1000);
  return {
    days: s.days ? String(s.days) : '',
    hours: String(s.hours),
    minutes: String(s.minutes),
    seconds: String(s.seconds),
  };
}

const pad = (n: number) => (n < 10 ? '0' + n : String(n));

export interface ClockParts {
  /** Day count, or null when under one day. */
  days: number | null;
  /** "H:MM:SS", "HH:MM:SS" or "MM:SS". */
  clock: string;
}

/**
 * Clock text for the big display. Countdowns round up (25:00 shows until a full second
 * has passed); elapsed time rounds down.
 */
export function clockParts(ms: number, rounding: 'ceil' | 'floor'): ClockParts {
  const sec = rounding === 'ceil' ? Math.ceil(Math.max(0, ms) / 1000 - 1e-9) : Math.floor(Math.max(0, ms) / 1000);
  const s = splitSeconds(sec);
  if (s.days > 0) return { days: s.days, clock: `${pad(s.hours)}:${pad(s.minutes)}:${pad(s.seconds)}` };
  if (s.hours > 0) return { days: null, clock: `${s.hours}:${pad(s.minutes)}:${pad(s.seconds)}` };
  return { days: null, clock: `${pad(s.minutes)}:${pad(s.seconds)}` };
}

/** Human readable Korean duration: "2시간 5분", "45초", "3일 4시간". */
export function formatDurationKo(ms: number, opts: { seconds?: boolean } = {}): string {
  const s = splitSeconds(Math.floor(Math.max(0, ms) / 1000));
  const parts: string[] = [];
  if (s.days) parts.push(`${s.days.toLocaleString('ko-KR')}일`);
  if (s.hours) parts.push(`${s.hours}시간`);
  if (s.minutes) parts.push(`${s.minutes}분`);
  const showSeconds = opts.seconds ?? (s.days === 0 && s.hours === 0);
  if (showSeconds && (s.seconds || parts.length === 0)) parts.push(`${s.seconds}초`);
  if (parts.length === 0) return '0초';
  return parts.slice(0, 3).join(' ');
}

/** Spoken-friendly version for screen readers. */
export function spokenDuration(ms: number): string {
  return formatDurationKo(ms, { seconds: true });
}
