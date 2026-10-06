/**
 * Deterministic hashing and seeded random numbers.
 * Every visual variation is chosen from hash(worldSeed, zone, unit, salt) so a reload
 * never re-rolls a tree species, facility type or placement.
 */

export function hash32(...values: number[]): number {
  let h = 0x811c9dc5 ^ values.length;
  for (const raw of values) {
    // Fold doubles into 32-bit lanes so large or fractional keys still mix.
    const v = Number.isFinite(raw) ? raw : 0;
    const lo = v | 0;
    const hi = Math.floor(v / 4294967296) | 0;
    h = Math.imul(h ^ lo, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h ^ hi, 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** mulberry32 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, bInclusive: number): number {
    return a + Math.floor(this.next() * (bInclusive - a + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Roughly gaussian in [-1, 1]. */
  soft(): number {
    return (this.next() + this.next() + this.next()) / 1.5 - 1;
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

export function rngFor(...keys: number[]): Rng {
  return new Rng(hash32(...keys));
}

export function randomSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  } catch {
    return (Math.random() * 4294967296) >>> 0;
  }
}

export function randomId(prefix: string): string {
  const s = randomSeed().toString(36) + randomSeed().toString(36);
  return `${prefix}_${Date.now().toString(36)}_${s.slice(0, 10)}`;
}
