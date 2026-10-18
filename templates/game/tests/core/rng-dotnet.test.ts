import { describe, expect, it } from 'vitest';
import { DotNetRandom } from '../../src/core/rng-dotnet';
import { Rng } from '../../src/core/rng';

// Published outputs of `new System.Random(seed).Next()` in .NET (Framework and Core, seeded).
const DOTNET_FIRST_NEXT: Array<[number, number]> = [
  [0, 1559595546],
  [1, 534011718],
  [42, 1434747710],
];

describe('DotNetRandom (System.Random)', () => {
  it.each(DOTNET_FIRST_NEXT)('seed %i → first Next() = %i', (seed, first) => {
    expect(new DotNetRandom(seed).nextInt()).toBe(first);
  });

  it('negative seeds behave like their absolute value, as in .NET', () => {
    expect(new DotNetRandom(-42).nextInt()).toBe(new DotNetRandom(42).nextInt());
  });

  it('plugs into Rng: rng.int(a, b) is Next(a, b + 1), and the state reaches the replay hash', () => {
    const a = new Rng(new DotNetRandom(7));
    const b = new DotNetRandom(7);
    for (let i = 0; i < 100; i++) expect(a.int(3, 9)).toBe(b.nextRange(3, 10));
    const c = new Rng(new DotNetRandom(7));
    const before = c.seedState;
    c.next();
    expect(c.seedState).not.toBe(before);
  });
});
