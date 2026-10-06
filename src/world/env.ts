/**
 * World environment at W: everything about the world that is not work — the time of day, the
 * season, the weather and the headline event — computed once per frame for the scene and once
 * a second for the UI. Pure function of (theme, seed, W) and the session pacing (a quiet session
 * gets a sight of its own, see pace.ts).
 */

import type { ThemeId } from '../core/session';
import { dayAt, type DayState } from './clock';
import { seasonMix, type SeasonMix } from './season';
import { currentPace, headlineAt } from './pace';
import { cosmosHeadlineAt } from './cosmos';
import { frontHeadlineAt } from './front';
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

/** The cosmos has no weather of this kind (its space weather lives in world/cosmos.ts). */
const CALM: WeatherState = { id: 'CLEAR', next: 'CLEAR', k: 0, cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0, dark: 0, wet: 0, snowCover: 0, flash: 0, flashX: 0 };

/** `origin`: where the cosmos universe or the front's war began (their events run on their own time). */
export function worldEnv(theme: ThemeId, seed: number, W: number, origin = 0): WorldEnv {
  if (theme === 'cosmos') {
    return { theme, W, day: dayAt(theme, W), season: seasonMix(W), weather: CALM, event: cosmosHeadlineAt(seed, origin, W, currentPace()) };
  }
  if (theme === 'front') {
    // the front's weather is its war tide's storm (world/front.ts), drawn by the scene
    return { theme, W, day: dayAt(theme, W), season: seasonMix(W), weather: CALM, event: frontHeadlineAt(seed, origin, W, currentPace()) };
  }
  return {
    theme,
    W,
    day: dayAt(theme, W),
    season: seasonMix(W),
    weather: weatherAt(theme, seed, W),
    event: headlineAt(theme, seed, W),
  };
}
