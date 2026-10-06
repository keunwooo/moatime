/** Plain-language rows about the world around the work (the "자세히" panel). */

import type { ThemeId } from '../core/session';
import { clockText, PHASE_NAMES } from './clock';
import { worldEnv } from './env';
import { WEATHER_NAMES } from './weather';

export function envRows(theme: ThemeId, seed: number, W: number): { label: string; value: string }[] {
  // the cosmos has no days or weather of this kind (its rows come from sim/cosmosDescribe.ts)
  if (theme === 'cosmos') return [];
  const env = worldEnv(theme, seed, W);
  const rows = [{ label: '하루', value: `${env.day.day + 1}일째 ${PHASE_NAMES[env.day.phase]} (${clockText(theme, W)})` }];
  if (theme === 'forest') {
    const w = env.weather;
    const turning = w.next !== w.id || (w.k > 0.05 && w.k < 0.95);
    rows.push({ label: '날씨', value: turning ? `${WEATHER_NAMES[w.id]} → ${WEATHER_NAMES[w.next]}` : WEATHER_NAMES[w.id] });
    if (w.snowCover > 0.05) rows.push({ label: '쌓인 눈', value: `${Math.round(w.snowCover * 100)}%` });
  }
  return rows;
}
