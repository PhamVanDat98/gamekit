// tests/view/motion.test.ts — copied from the GameKit ui-motion skill, with src/view/motion.ts.
import { describe, expect, it } from 'vitest';
import { Tweens, ease } from '../../src/view/motion';

describe('motion', () => {
  it('easings start at 0 and end at 1', () => {
    for (const e of Object.values(ease)) {
      expect(e(0)).toBeCloseTo(0);
      expect(e(1)).toBeCloseTo(1);
    }
  });

  it('a tween lands exactly on its end value and calls done once', () => {
    const tw = new Tweens(() => false);
    let v = -1;
    let done = 0;
    tw.to((x) => (v = x), 0, 10, 0.2, { done: () => done++ });
    expect(v).toBe(0);
    tw.update(0.1);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
    tw.update(0.1);
    tw.update(0.1);
    expect(v).toBe(10);
    expect(done).toBe(1);
    expect(tw.busy).toBe(false);
  });

  it('a long frame (tab came back) advances at most a tenth of a second', () => {
    const tw = new Tweens(() => false);
    let v = 0;
    tw.to((x) => (v = x), 0, 1, 1, { ease: ease.linear });
    tw.update(5);
    expect(v).toBeCloseTo(0.1);
  });

  it('waits for delay; a new tween with the same key replaces the old one', () => {
    const tw = new Tweens(() => false);
    const key = {};
    let v = 0;
    tw.to((x) => (v = x), 0, 1, 0.1, { delay: 0.05, key });
    tw.update(0.05);
    expect(v).toBe(0);
    tw.to((x) => (v = x), 5, 6, 0.1, { key });
    tw.update(0.1);
    tw.update(0.1);
    expect(v).toBe(6);
  });

  it('reduced motion skips moves but keeps fades', () => {
    const tw = new Tweens(() => true);
    let move = 0;
    let fade = 0;
    tw.to((x) => (move = x), 0, 100, 0.2);
    tw.to((x) => (fade = x), 0, 1, 0.2, { reduce: 'keep' });
    expect(move).toBe(100);
    expect(fade).toBe(0);
    for (let i = 0; i < 3; i++) tw.update(0.1);
    expect(fade).toBe(1);
  });

  it('clear() inside done stops the rest; tweens started in done begin next frame', () => {
    const tw = new Tweens(() => false);
    let a = 0;
    let b = 0;
    tw.to(() => {}, 0, 1, 0.05, { done: () => tw.clear() });
    tw.to((x) => (a = x), 0, 1, 1);
    tw.update(0.05);
    expect(tw.busy).toBe(false);
    tw.to(() => {}, 0, 1, 0.05, { done: () => void tw.to((x) => (b = x), 0, 1, 0.05) });
    tw.update(0.05);
    expect(b).toBe(0);
    tw.update(0.05);
    expect(b).toBe(1);
    expect(a).toBeLessThan(1);
  });
});
