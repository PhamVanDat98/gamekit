import { describe, expect, it } from 'vitest';
import { oracleMismatches } from './oracle';

describe('oracleMismatches', () => {
  it('without a threshold, values must be equal', () => {
    expect(oracleMismatches(1, { out: 1 })).toEqual([]);
    expect(oracleMismatches(1.0001, { out: 1 })).toHaveLength(1);
  });

  it('relative tolerance cannot pass at 0, absolute tolerance can', () => {
    expect(oracleMismatches(0.01, { out: 0 }, { tolerance: 0.5 })).toHaveLength(1);
    expect(oracleMismatches(0.01, { out: 0 }, { toleranceAbs: 0.02 })).toEqual([]);
    expect(oracleMismatches(0.03, { out: 0 }, { toleranceAbs: 0.02 })).toHaveLength(1);
  });

  it('passes inside either threshold; a case overrides the oracle', () => {
    expect(oracleMismatches(105, { out: 100 }, { tolerance: 0.1, toleranceAbs: 1 })).toEqual([]);
    expect(oracleMismatches(105, { out: 100, tolerance: 0.01 }, { tolerance: 0.1 })).toHaveLength(1);
  });

  it('names the values that differ in a sample and fails on missing or NaN values', () => {
    const sample = { out: { x: 1, y: 2 } };
    expect(oracleMismatches({ x: 1, y: 2, extra: 9 }, sample, { toleranceAbs: 0.1 })).toEqual([]);
    expect(oracleMismatches({ x: 1, y: 3 }, sample, { toleranceAbs: 0.1 })[0]).toMatch(/^y:/);
    expect(oracleMismatches({ x: 1 }, sample, { toleranceAbs: 0.1 })).toHaveLength(1);
    expect(oracleMismatches({ x: NaN, y: 2 }, sample, { toleranceAbs: 0.1 })).toHaveLength(1);
    expect(oracleMismatches(undefined, sample, { toleranceAbs: 0.1 })).toHaveLength(2);
  });
});
