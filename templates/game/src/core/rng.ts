/* eslint-disable no-magic-numbers -- PRNG constants */
/**
 * Where random numbers come from. Default: mulberry32. When the original game generates content
 * from a seed (levels, drops, spawns), plug in its own algorithm instead so the same seed gives the
 * same content — e.g. DotNetRandom (rng-dotnet.ts) for System.Random — and prove it with an oracle.
 */
export interface RandomSource {
  /** Float in [0, 1). */
  nextFloat(): number;
  /** A number that changes with the internal state (replay hash, save). */
  snapshot(): number;
}

/** mulberry32: small, fast, good enough when the sequence does not have to match the original. */
export class Mulberry32 implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextFloat(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  snapshot(): number {
    return this.state;
  }
}

/**
 * Seeded randomness for core/. Every random choice goes through this, so the same seed + the same
 * inputs always replay to the same result.
 */
export class Rng {
  private readonly source: RandomSource;

  constructor(seedOrSource: number | RandomSource) {
    this.source = typeof seedOrSource === 'number' ? new Mulberry32(seedOrSource) : seedOrSource;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.source.nextFloat();
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Snapshot for save/replay. */
  get seedState(): number {
    return this.source.snapshot();
  }
}
