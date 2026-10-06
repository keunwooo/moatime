/**
 * World environment at W: everything about the world that is not work — the time of day, the
 * season, the weather and the headline event — computed once per frame for the scene and once
 * a second for the UI. Pure function of (theme, seed, W) and the session pacing (a quiet session
 * gets a sight of its own, see pace.ts).
 */

import type { ThemeId } from '../core/session';
import { dayAt, type DayState } from './clock';
import { seasonMix, type SeasonMix } from './season';
import { headlineAt } from './pace';
import type { WorldEvent } from './timeline';
import { weatherAt, type WeatherState } from './weather';

export interface WorldEnv {
  theme: ThemeId;
  W: number;
  day: DayState;
  season: SeasonMix;
  weather: WeatherState;
  /** The headline event running now (rare sight, planet event, raid), if any. */
  event: WorldEvent | null;
}

export function worldEnv(theme: ThemeId, seed: number, W: number): WorldEnv {
  return {
    theme,
    W,
    day: dayAt(theme, W),
    season: seasonMix(W),
    weather: weatherAt(theme, seed, W),
    event: headlineAt(theme, seed, W),
  };
}
