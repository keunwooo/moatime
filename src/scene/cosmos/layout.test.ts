import { describe, expect, it } from 'vitest';
import { LAYOUT, pathAround, pathAt, systemPos } from './layout';

describe('cosmos paths', () => {
  it('routes and voyages keep clear of the timer, from end to end', () => {
    for (const aspect of ['wide', 'tall'] as const) {
      const L = LAYOUT[aspect];
      const [tx0, ty0, tx1, ty1] = L.timer;
      const near = (q: { x: number; y: number }, m: number) => q.x > tx0 - m && q.x < tx1 + m && q.y > ty0 - m && q.y < ty1 + m;
      let x = 12345;
      const rnd = () => {
        x = (x * 1103515245 + 12345) % 2147483648;
        return x / 2147483648;
      };
      let n = 0;
      while (n < 400) {
        const a = { x: 0.02 + 0.96 * rnd(), y: 0.02 + 0.96 * rnd() };
        const b = { x: 0.02 + 0.96 * rnd(), y: 0.02 + 0.96 * rnd() };
        if (near(a, 0.03) || near(b, 0.03)) continue;
        n++;
        const p = pathAround(L, a, b);
        expect(pathAt(p, 0).x).toBeCloseTo(a.x, 6);
        expect(pathAt(p, 1).y).toBeCloseTo(b.y, 6);
        for (let i = 0; i <= 200; i++) expect(near(pathAt(p, i / 200), 0.005), `${aspect} ${JSON.stringify([a, b])} at ${i}`).toBe(false);
      }
      // the home star to every early system (one may sit at the timer's very edge: its short step out is exempt)
      for (const seed of [7, 424242]) {
        for (let k = 1; k < 120; k++) {
          const s = systemPos(L, seed, k);
          const p = pathAround(L, L.home, s);
          for (let i = 0; i <= 100; i++) {
            const q = pathAt(p, i / 100);
            if (Math.hypot(q.x - s.x, q.y - s.y) < 0.06) continue;
            expect(near(q, 0.005), `${aspect} k=${k} at ${i}`).toBe(false);
          }
        }
      }
    }
  });

  it('star systems never sit in the timer’s space', () => {
    for (const aspect of ['wide', 'tall'] as const) {
      const L = LAYOUT[aspect];
      const [tx0, ty0, tx1, ty1] = L.timer;
      for (const seed of [1, 7, 99, 424242]) {
        for (let k = 1; k <= 600; k++) {
          const q = systemPos(L, seed, k);
          expect(q.x > tx0 && q.x < tx1 && q.y > ty0 && q.y < ty1, `${aspect} ${seed} ${k}`).toBe(false);
        }
      }
    }
  });
});
