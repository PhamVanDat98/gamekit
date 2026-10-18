import { describe, expect, it } from 'vitest';
import { firstDivergence, recordTrace } from '../support/trace';

describe('trace helpers (skill parity-debug)', () => {
  const run = (speed: number) =>
    recordTrace({ x: 0 }, 10, (s) => void (s.x += speed), (s) => ({ x: s.x }));

  it('records tick 0 and every step', () => {
    expect(run(1).map((r) => r.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('finds the first tick that drifts beyond the tolerance', () => {
    const expected = run(1);
    const actual = recordTrace({ x: 0 }, 10, (s, t) => void (s.x += t > 5 ? 2 : 1), (s) => ({ x: s.x }));
    const d = firstDivergence(expected, actual, 0.05);
    expect(d?.tick).toBe(6);
    expect(d?.keys).toEqual(['x']);
    expect(firstDivergence(expected, run(1.001), 0.01)).toBeNull();
  });
});
