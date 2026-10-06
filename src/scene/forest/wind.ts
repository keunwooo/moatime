/** Shared wind field: slow swells plus gusts; neighbours share it with phase offsets. */
export function forestWind(t: number, x: number): number {
  const gust = 0.72 + 0.28 * Math.sin(t * 0.071 + 1.3) * Math.sin(t * 0.033);
  return (0.55 * Math.sin(t * 0.43 + x * 0.0011) + 0.3 * Math.sin(t * 0.97 + 1.3 + x * 0.0023) + 0.15 * Math.sin(t * 2.1 + x * 0.006)) * gust;
}
