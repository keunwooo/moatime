/**
 * The front theme's choice of people: three cards in place of the time presets, shown until a
 * people is chosen (choosing begins the war; starting without a choice takes the highlighted one).
 */

import { defaultRace, type Persisted, type RaceId } from '../../core/session';
import { RACE_MOTTO, RACE_NAME } from '../../sim/frontPlan';
import { engine } from '../runtime';

const RACES: RaceId[] = [0, 1, 2];

/** Small silhouettes in each people's colours: angular plate, round growth, tall crystal. */
function Mark({ race }: { race: RaceId }) {
  if (race === 0)
    return (
      <svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true">
        <path d="M9 22h30l-3-9H26l-2-4h-8l-2 4h-2z" fill="#5B6670" />
        <path d="M14 13h20" stroke="#E9C46A" strokeWidth="1.6" strokeDasharray="2.4 1.6" />
        <path d="M12 22l-3 7M36 22l3 7M18 22l-1 7M30 22l1 7" stroke="#3E474F" strokeWidth="2" strokeLinecap="round" />
        <circle cx="31" cy="17" r="1.6" fill="#F4D29C" />
        <circle cx="17" cy="17" r="1.6" fill="#F4D29C" />
        <path d="M22 9h4v-3h-4z" fill="#D9603B" />
      </svg>
    );
  if (race === 1)
    return (
      <svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true">
        <ellipse cx="24" cy="27" rx="19" ry="3.5" fill="#21423D" opacity="0.9" />
        <path d="M13 26c-2-9 4-16 11-16s13 7 11 16z" fill="#3FA796" />
        <path d="M17 24c0-6 3-10 7-10" stroke="#B8E06A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M33 20c3-3 6-3 8-1M33 23c3-1 5 0 6 2" stroke="#E9DFC7" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="9" cy="21" r="2.6" fill="#E9DFC7" />
        <circle cx="24" cy="18" r="1.8" fill="#B8E06A" />
      </svg>
    );
  return (
    <svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true">
      <ellipse cx="24" cy="18" rx="14" ry="4" fill="none" stroke="#E07A8F" strokeWidth="1.4" />
      <path d="M24 2l4 9-1.6 18h-4.8L20 11z" fill="#EEE8DE" />
      <path d="M24 2l4 9-1.6 18H24z" fill="#8FB3A8" opacity="0.7" />
      <path d="M15 29l2-10 2 10zM29 29l2-10 2 10z" fill="#EEE8DE" opacity="0.85" />
      <circle cx="24" cy="12" r="1.5" fill="#E07A8F" />
    </svg>
  );
}

export function RaceCards({ state }: { state: Persisted }) {
  const suggested = defaultRace(state.world.seed);
  return (
    <div className="race-cards" role="group" aria-label="지휘할 종족 고르기">
      <p className="race-hint">지휘할 종족을 골라요. 고르지 않고 시작하면 강조된 종족으로 시작해요.</p>
      <div className="race-row">
        {RACES.map((r) => (
          <button
            key={r}
            type="button"
            className={`race-card race-${r} ${r === suggested ? 'suggested' : ''}`}
            onClick={() => void engine.chooseRace(r)}
            aria-describedby={`race-motto-${r}`}
          >
            <Mark race={r} />
            <span className="race-name">{RACE_NAME[r]}</span>
            <small id={`race-motto-${r}`}>{RACE_MOTTO[r]}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
