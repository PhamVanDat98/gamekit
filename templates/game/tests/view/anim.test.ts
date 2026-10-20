import { describe, expect, it } from 'vitest';
import {
  Animator,
  Drag,
  EASES,
  MOTIONS,
  Spring,
  bendPoint,
  buildStrip,
  deformStrip,
  frameIndex,
  grow,
  poseAt,
  posesWithDrag,
  rest,
  sampleKeys,
  triangleMap,
  worldMatrices,
  type FrameMeta,
  type Motion,
  type RigPart,
  type Vec,
} from '../../src/view/anim';
import { SAMPLE_RIG } from '../../src/view/anim/sample-rig';

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
    expect(Object.keys(MOTIONS).sort()).toEqual(['attack', 'celebrate', 'hit', 'hop', 'idle', 'pop-in', 'surprise', 'walk']);
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
    const rot90 = { x: 0, y: 0, rot: 90, sx: 1, sy: 1, alpha: 1, bend: 0, bulge: 0 };
    const m = worldMatrices(parts, { body: rot90 });
    // Body pivot (10,20) stays at the origin; the arm at body (10,0) is 20px above the pivot → rotated to (20, 0).
    const arm = m.arm!;
    expect(arm[4]).toBeCloseTo(20, 6);
    expect(arm[5]).toBeCloseTo(0, 6);
  });
});

describe('anim: frame-by-frame', () => {
  const meta: FrameMeta = { name: 'f', fps: 12, loop: false, width: 10, height: 10, anchor: [5, 10], frames: [{ file: 'a.png' }, { file: 'b.png', hold: 3 }, { file: 'c.png' }] };
  it('holds frames for their ticks and stops on the last one', () => {
    const at = (tick: number) => frameIndex(meta, tick / 12);
    expect([0, 1, 2, 3, 4, 5, 99].map(at)).toEqual([0, 1, 1, 1, 2, 2, 2]);
  });
  it('loops wrap', () => {
    expect(frameIndex({ ...meta, loop: true }, 5 / 12)).toBe(0);
  });
});

describe('anim: sample rig', () => {
  it('every part a motion keys exists in the rig, parents first', () => {
    const parts = new Set(SAMPLE_RIG.map((p) => p.name));
    for (const m of Object.values(MOTIONS)) for (const track of Object.keys(m.tracks)) expect(parts, `${m.name}: ${track}`).toContain(track.split('.')[0]);
    expect(() => worldMatrices(SAMPLE_RIG, {})).not.toThrow();
  });
});

describe('anim: mesh deform', () => {
  const pivot: Vec = [5, 0];
  const spec = { axis: [0, 1] as Vec, segments: 4 };
  const strip = buildStrip([0, 0, 10, 40], pivot, spec);
  it('no bend, no bulge leaves the strip where it was', () => {
    const out = deformStrip(strip, pivot, spec, 0, 0);
    out.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(strip.rest[i]![0], 9);
      expect(p[1]).toBeCloseTo(strip.rest[i]![1], 9);
    });
  });
  it('a bend turns the axis into an arc: 90° over 40px puts the tip on a quarter circle, turned 90°', () => {
    const r = 40 / (Math.PI / 2);
    const tip = bendPoint([5, 40], pivot, spec, 40, 90, 0);
    // Axis points down; clockwise on screen turns it towards -x.
    expect(tip.at[0]).toBeCloseTo(5 - r, 6);
    expect(tip.at[1]).toBeCloseTo(r, 6);
    expect(tip.angle).toBeCloseTo(90, 6);
    // The arc keeps its length: the pivot end does not move.
    expect(bendPoint([5, 0], pivot, spec, 40, 90, 0).at).toEqual([5, 0]);
  });
  it('bulge widens the middle, not the joint or the tip', () => {
    const w = (u: number) => bendPoint([10, u], pivot, spec, 40, 0, 0.5).at[0] - 5;
    expect(w(0)).toBeCloseTo(5, 9);
    expect(w(20)).toBeCloseTo(7.5, 9);
    expect(w(40)).toBeCloseTo(5, 9);
  });
  it('maps a texture triangle onto its deformed place exactly', () => {
    const s: [Vec, Vec, Vec] = [[0, 0], [10, 0], [0, 20]];
    const d: [Vec, Vec, Vec] = [[3, 4], [11, 9], [-6, 21]];
    const [a, b, c, dd, e, f] = triangleMap(...s, ...d);
    s.forEach((p, i) => {
      expect(a * p[0] + c * p[1] + e).toBeCloseTo(d[i]![0], 9);
      expect(b * p[0] + dd * p[1] + f).toBeCloseTo(d[i]![1], 9);
    });
  });
  it('grows every edge outwards by the same distance so neighbours overlap', () => {
    const g = grow([[0, 0], [10, 0], [0, 10]], 1);
    // Right-angle corner goes to (-1, -1); the edges y = 0 and x = 0 both move out by 1.
    expect(g[0]![0]).toBeCloseTo(-1, 9);
    expect(g[0]![1]).toBeCloseTo(-1, 9);
    expect(g[1]![1]).toBeCloseTo(-1, 9);
    expect(g[2]![0]).toBeCloseTo(-1, 9);
  });
  it('keeps mesh cells near square, so there are no sliver triangles', () => {
    const wide = buildStrip([0, 0, 66, 56], [33, 66], { axis: [0, -1], segments: 6 });
    expect(wide.cols).toBeGreaterThanOrEqual(5);
    expect(wide.rest.length).toBe((6 + 1) * (wide.cols + 1));
  });
  it('children of a bending part ride the curve (a head stays on its neck)', () => {
    const parts: RigPart[] = [
      { name: 'body', at: [0, 0], pivot: [10, 40], mesh: { axis: [0, -1] }, box: [0, 0, 20, 40] },
      { name: 'head', parent: 'body', at: [10, 0], pivot: [0, 0] },
    ];
    const bent = worldMatrices(parts, { body: { ...rest(), bend: 60 } });
    const tip = bendPoint([10, 0], [10, 40], { axis: [0, -1] }, 40, 60, 0);
    expect(bent.head![4]).toBeCloseTo(tip.at[0] - 10, 6);
    expect(bent.head![5]).toBeCloseTo(tip.at[1] - 40, 6);
  });
});

describe('anim: drag (automatic follow-through)', () => {
  const parts: RigPart[] = [
    { name: 'root', at: [0, 0], pivot: [0, 0] },
    { name: 'tail', parent: 'root', at: [0, 0], pivot: [0, 0], mesh: { axis: [0, 1] }, box: [0, 0, 4, 30], drag: { vel: 0.1, frequency: 3, damping: 0.4 } },
  ];
  it('a tail moved sideways bends behind the move, then settles straight', () => {
    const drag = new Drag(parts);
    let x = 0;
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      x += 5; // 300 px/s to the right
      drag.step(1 / 60, { root: { ...rest(), x } });
      peak = Math.max(peak, drag.apply({}).tail!.bend);
    }
    expect(peak).toBeGreaterThan(5); // trails behind: the tip swings towards -x (clockwise for a down axis)
    for (let i = 0; i < 300; i++) drag.step(1 / 60, { root: { ...rest(), x } });
    expect(Math.abs(drag.apply({}).tail!.bend)).toBeLessThan(0.5);
  });
  it('posesWithDrag gives the same pose however it is scrubbed', () => {
    const m: Motion = { name: 'm', role: 'action', tracks: { 'root.x': [{ f: 0, v: 0 }, { f: 30, v: 120, ease: 'out' }] } };
    const at = (s: number) => posesWithDrag(parts, (t) => poseAt(m, t), s).tail!.bend;
    expect(at(0.3)).toBeCloseTo(at(0.3), 12);
    expect(at(0.3)).not.toBe(0);
  });
});
