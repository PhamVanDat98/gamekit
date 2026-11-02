import { describe, expect, it } from 'vitest';
import { roundToInt, sign } from '../../src/core/mathf';

describe('mathf', () => {
  it.each([
    [0.5, 0],
    [1.5, 2],
    [2.5, 2],
    [3.5, 4],
    [-0.5, 0],
    [-1.5, -2],
    [-2.5, -2],
    [2.4, 2],
    [2.6, 3],
    [-2.4, -2],
    [-2.6, -3],
    [0, 0],
    [-0, 0],
    [-0.2, 0],
  ])('roundToInt(%d) = %d (half to even, never -0)', (x, want) => {
    expect(Object.is(roundToInt(x), want)).toBe(true);
  });

  it.each([
    [0, 1],
    [-0, 1],
    [5, 1],
    [0.001, 1],
    [-3, -1],
    [-0.001, -1],
  ])('sign(%d) = %d (zero is positive)', (x, want) => {
    expect(Object.is(sign(x), want)).toBe(true);
  });
});
