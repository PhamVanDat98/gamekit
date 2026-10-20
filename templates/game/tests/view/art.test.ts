import { describe, expect, it } from 'vitest';
import { integerScale, nineSlicePieces } from '../../src/view/art';

describe('art: 9-slice', () => {
  it('keeps corners, stretches edges and centre', () => {
    const p = nineSlicePieces(96, 96, [16, 20, 16, 16], 300, 120);
    expect(p).toHaveLength(9);
    // top-left corner: same size on screen
    expect(p[0]).toEqual([0, 0, 16, 20, 0, 0, 16, 20]);
    // centre: source 64×60 → 268×84
    expect(p[4]).toEqual([16, 20, 64, 60, 16, 20, 268, 84]);
    // bottom-right corner ends exactly at the box corner
    const br = p[8]!;
    expect(br[4] + br[6]).toBe(300);
    expect(br[5] + br[7]).toBe(120);
  });
  it('3-slice when top/bottom insets are 0; corners scale with @2x images', () => {
    expect(nineSlicePieces(120, 24, [9, 0, 9, 0], 300, 12, 0.5)).toEqual([
      [0, 0, 9, 24, 0, 0, 4.5, 12],
      [9, 0, 102, 24, 4.5, 0, 291, 12],
      [111, 0, 9, 24, 295.5, 0, 4.5, 12],
    ]);
  });
  it('a box smaller than its corners shrinks them instead of overlapping', () => {
    const p = nineSlicePieces(96, 96, [30, 30, 30, 30], 40, 40);
    expect(p).toHaveLength(4); // no room for edges or centre
    expect(p[0]![6]).toBe(20);
    expect(p[3]![4] + p[3]![6]).toBe(40);
  });
});

describe('art: pixel art', () => {
  it('scales by whole numbers that fit, never below 1', () => {
    expect(integerScale(1280, 720, 320, 180)).toBe(4);
    expect(integerScale(1000, 700, 320, 180)).toBe(3);
    expect(integerScale(200, 100, 320, 180)).toBe(1);
  });
});
