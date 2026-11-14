/** Mixes any number of numbers and strings into one 32-bit seed (FNV-1a, then a murmur finish). */
export function hashSeed(...parts: Array<number | string>): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? `#${part >>> 0}` : `$${part}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A fresh seed for a new run. Not deterministic on purpose. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

/** Seeded random numbers (mulberry32). The same seed always gives the same sequence. */
export class Rng {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** 0 <= n < 1. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  float(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Integer in [lo, hi], both ends included. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick from an empty list');
    return items[Math.floor(this.next() * items.length)]!;
  }

  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
    if (entries.length === 0 || total <= 0) throw new Error('Rng.weighted needs a positive weight');
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= Math.max(0, w);
      if (r < 0) return item;
    }
    return entries[entries.length - 1]![0];
  }

  /** Shuffles in place and returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }

  /**
   * An independent stream derived from this seed and a label. It doesn't depend on how many
   * numbers this one has drawn, so one generation step can change without reshuffling the rest.
   */
  fork(...label: Array<number | string>): Rng {
    return new Rng(hashSeed(this.seed, ...label));
  }
}
