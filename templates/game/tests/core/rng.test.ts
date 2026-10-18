import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';

describe('Rng', () => {
  it('same seed → same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('int rejects a bad range instead of returning garbage', () => {
    const r = new Rng(1);
    expect(() => r.int(5, 4)).toThrow(/bad range/);
    expect(() => r.int(0, 2.5)).toThrow(/bad range/);
    expect(r.int(3, 3)).toBe(3);
  });
});
