import { describe, expect, it } from 'vitest';
import { Animator, EASES, MOTIONS, Spring, poseAt, sampleKeys, worldMatrices, type Motion, type RigPart } from '../../src/view/anim';

describe('anim: eases', () => {
  it('start at 0 and end at 1', () => {
    for (const [name, ease] of Object.entries(EASES)) {
      expect(ease(0), name).toBeCloseTo(0, 6);
      expect(ease(1), name).toBeCloseTo(1, 6);
    }
  });
  it('match the plugin checker (scripts/lib/motion.mjs)', () => {
    // Same numbers are asserted in the plugin's tests/motion.test.mjs.
    expect(EASES.out(0.5)).toBeCloseTo(0.875, 6);
    expect(EASES.inOut(0.25)).toBeCloseTo(0.0625, 6);
    expect(EASES.outBack(0.5)).toBeCloseTo(1.0876975, 6);
    expect(EASES.outBounce(0.5)).toBeCloseTo(0.765625, 6);
    expect(EASES.hold(0.99)).toBe(0);
  });
});

describe('anim: motions', () => {
  const m: Motion = {
    name: 't',
    role: 'action',
    tracks: {
      'body.y': [
        { f: 0, v: 0 },
        { f: 10, v: -100, ease: 'out' },
      ],
      'body.stretch': [
        { f: 0, v: 1 },
        { f: 10, v: 1.25 },
      ],
    },
  };
  it('samples keys with the ease of the key it goes to, clamped at both ends', () => {
    const keys = m.tracks['body.y']!;
    expect(sampleKeys(keys, -5)).toBe(0);
    expect(sampleKeys(keys, 5)).toBeCloseTo(-87.5, 6);
    expect(sampleKeys(keys, 99)).toBe(-100);
  });
  it('stretch keeps the area: sx · sy = 1', () => {
    const p = poseAt(m, 10 / 60).body!;
    expect(p.sy).toBeCloseTo(1.25, 6);
    expect(p.sx * p.sy).toBeCloseTo(1, 6);
  });
  it('loops wrap and step holds poses', () => {
    const loop: Motion = { name: 'l', role: 'idle', loop: true, step: 12, tracks: { 'a.x': [{ f: 0, v: 0 }, { f: 30, v: 10 }, { f: 60, v: 0 }] } };
    expect(poseAt(loop, 1 + 30 / 60).a!.x).toBeCloseTo(10, 6);
    // 12 poses a second at 60fps: frames 0–4 show the pose of frame 0.
    expect(poseAt(loop, 4 / 60).a!.x).toBe(0);
  });
  it('template motions load by name', () => {
    expect(Object.keys(MOTIONS).sort()).toEqual(['hit', 'hop', 'idle', 'pop-in']);
  });
});

describe('anim: animator', () => {
  it('layers a one-shot on the loop and drops it when done', () => {
    const idle: Motion = { name: 'idle', role: 'idle', loop: true, tracks: { 'b.y': [{ f: 0, v: 2 }, { f: 60, v: 2 }] } };
    const shot: Motion = { name: 'shot', role: 'ui', tracks: { 'b.y': [{ f: 0, v: 0 }, { f: 6, v: 10 }] } };
    let ended = 0;
    const a = new Animator().loop(idle).play(shot, { onEnd: () => ended++ });
    a.update(3 / 60);
    expect(a.pose('b').y).toBeCloseTo(2 + 5, 6);
    a.update(4 / 60);
    expect(ended).toBe(1);
    expect(a.playing).toBeNull();
    expect(a.pose('b').y).toBe(2);
  });
});

describe('anim: spring', () => {
  it('overshoots with low damping and settles on the target at any frame rate', () => {
    const run = (dt: number) => {
      const s = new Spring(0, 1, 3, 0.3);
      let peak = 0;
      for (let t = 0; t < 3; t += dt) peak = Math.max(peak, s.update(dt));
      return { peak, end: s.value };
    };
    const a = run(1 / 60);
    const b = run(1 / 144);
    expect(a.peak).toBeGreaterThan(1.2);
    expect(a.end).toBeCloseTo(1, 2);
    expect(a.peak).toBeCloseTo(b.peak, 2);
  });
});

describe('anim: rig', () => {
  it('children follow the parent around its pivot', () => {
    const parts: RigPart[] = [
      { name: 'body', at: [0, 0], pivot: [10, 20] },
      { name: 'arm', parent: 'body', at: [10, 0], pivot: [0, 0] },
    ];
    const rot90 = { x: 0, y: 0, rot: 90, sx: 1, sy: 1, alpha: 1 };
    const m = worldMatrices(parts, { body: rot90 });
    // Body pivot (10,20) stays at the origin; the arm at body (10,0) is 20px above the pivot → rotated to (20, 0).
    const arm = m.arm!;
    expect(arm[4]).toBeCloseTo(20, 6);
    expect(arm[5]).toBeCloseTo(0, 6);
  });
});
