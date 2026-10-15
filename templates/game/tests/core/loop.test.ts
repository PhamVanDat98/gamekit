import { describe, expect, it } from 'vitest';
import { advance, createFixedStep } from '../../src/core/loop';

describe('fixed step', () => {
  it('runs equal steps whatever the frame time', () => {
    const fs = createFixedStep(60);
    let total = 0;
    for (const dt of [0.016, 0.017, 0.033, 0.001, 0.05]) total += advance(fs, dt).steps;
    expect(total).toBe(Math.floor((0.016 + 0.017 + 0.033 + 0.001 + 0.05) * 60));
  });

  it('clamps long gaps instead of fast-forwarding', () => {
    const fs = createFixedStep(60, 5);
    expect(advance(fs, 10).steps).toBe(5);
    expect(fs.accumulator).toBe(0);
  });
});
