import { describe, expect, it } from 'vitest';
import { advance, createFixedStep } from '../../src/core/loop';

describe('fixed step', () => {
  it('runs equal steps whatever the frame time', () => {
    const fs = createFixedStep(60);
    let total = 0;
    for (const dt of [0.016, 0.017, 0.033, 0.001, 0.05]) total += advance(fs, dt);
    expect(total).toBe(Math.floor((0.016 + 0.017 + 0.033 + 0.001 + 0.05) * 60));
  });

  it('clamps long gaps instead of fast-forwarding', () => {
    const fs = createFixedStep(60, 5);
    expect(advance(fs, 10)).toBe(5);
    expect(fs.accumulator).toBeLessThanOrEqual(5 * fs.stepSec + 1e-9);
    // The 10 s gap costs at most one more frame of catch-up, then back to normal.
    expect(advance(fs, 0)).toBe(5);
    expect(advance(fs, 0)).toBe(0);
  });

  it('keeps the remainder of a slow frame instead of dropping it', () => {
    const fs = createFixedStep(60, 5);
    // 7.5 steps in one frame: 5 now, the other 2.5 carried into the next frames.
    expect(advance(fs, 7.5 / 60)).toBe(5);
    expect(advance(fs, 0)).toBe(2);
    expect(fs.accumulator).toBeCloseTo(0.5 / 60);
  });
});
