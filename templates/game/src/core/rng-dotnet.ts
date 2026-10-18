/* eslint-disable no-magic-numbers, no-restricted-syntax -- algorithm constants of System.Random */
import type { RandomSource } from './rng';

const MBIG = 2147483647;
const MSEED = 161803398;
const SIZE = 56;
const LAG = 21;
const MIX = 30;
const ROUNDS = 5;
const INT_MIN = -2147483648;

/**
 * .NET System.Random with a seed (Knuth subtractive generator), the sequence Unity C# code gets from
 * `new System.Random(seed)`. Not UnityEngine.Random — that one is Xorshift128 and needs its own source.
 *
 *   C#                         here
 *   rnd.Next()                 nextInt()
 *   rnd.Next(max)              nextBelow(max)
 *   rnd.Next(min, max)         nextRange(min, max)      (max exclusive, like C#)
 *   rnd.NextDouble()           nextFloat()
 *   via Rng: rng.int(a, b)     == rnd.Next(a, b + 1);   rng.next() == rnd.NextDouble()
 */
export class DotNetRandom implements RandomSource {
  private readonly seeds = new Array<number>(SIZE).fill(0);
  private inext = 0;
  private inextp = LAG;

  constructor(seed: number) {
    const s = this.seeds;
    const subtraction = seed === INT_MIN ? MBIG : Math.abs(seed | 0);
    let mj = MSEED - subtraction;
    s[SIZE - 1] = mj;
    let mk = 1;
    for (let i = 1; i < SIZE - 1; i++) {
      const ii = (LAG * i) % (SIZE - 1);
      s[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = s[ii] as number;
    }
    for (let k = 1; k < ROUNDS; k++) {
      for (let i = 1; i < SIZE; i++) {
        s[i] = (s[i] as number) - (s[1 + ((i + MIX) % (SIZE - 1))] as number);
        if ((s[i] as number) < 0) s[i] = (s[i] as number) + MBIG;
      }
    }
  }

  /** Next() — integer in [0, 2147483647). */
  nextInt(): number {
    const s = this.seeds;
    if (++this.inext >= SIZE) this.inext = 1;
    if (++this.inextp >= SIZE) this.inextp = 1;
    let r = (s[this.inext] as number) - (s[this.inextp] as number);
    if (r === MBIG) r--;
    if (r < 0) r += MBIG;
    s[this.inext] = r;
    return r;
  }

  /** NextDouble() — float in [0, 1). */
  nextFloat(): number {
    return this.nextInt() * (1 / MBIG);
  }

  /** Next(max) — integer in [0, max). */
  nextBelow(max: number): number {
    return Math.floor(this.nextFloat() * max);
  }

  /** Next(min, max) — integer in [min, max). Ranges wider than 2^31 use another path in .NET; not supported. */
  nextRange(min: number, max: number): number {
    if (max - min > MBIG) throw new Error('DotNetRandom.nextRange: khoảng quá lớn');
    return Math.floor(this.nextFloat() * (max - min)) + min;
  }

  snapshot(): number {
    let h = this.inext * SIZE + this.inextp;
    for (const v of this.seeds) h = (Math.imul(h, 31) + v) | 0;
    return h >>> 0;
  }
}
