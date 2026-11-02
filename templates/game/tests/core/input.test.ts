import { describe, expect, it } from 'vitest';
import type { InputFrame } from '../../src/contracts/input';
import { InputRecorder, InputState, frameAt } from '../../src/core/input';

describe('input edges', () => {
  it('a tap between two steps is seen for exactly one frame', () => {
    const input = new InputState();
    input.press('action');
    input.release('action');
    const f1 = input.frame(0);
    expect(f1.actions).toEqual(['action']);
    expect(f1.pressed).toEqual(['action']);
    expect(f1.released).toEqual(['action']);
    const f2 = input.frame(1);
    expect(f2.actions).toEqual([]);
    expect(f2.pressed).toEqual([]);
    expect(f2.released).toEqual([]);
  });

  it('key auto-repeat does not re-trigger pressed', () => {
    const input = new InputState();
    input.press('left');
    expect(input.frame(0).pressed).toEqual(['left']);
    input.press('left'); // keydown repeat
    const f = input.frame(1);
    expect(f.pressed).toEqual([]);
    expect(f.actions).toEqual(['left']);
  });

  it('releasing a key that is not held records nothing', () => {
    const input = new InputState();
    input.release('left');
    expect(input.frame(0).released).toEqual([]);
  });

  it('several frames without a new press deliver the edge only to the first', () => {
    const input = new InputState();
    input.press('right');
    expect(input.frame(0).pressed).toEqual(['right']);
    expect(input.frame(1).pressed).toEqual([]);
    expect(input.frame(1).actions).toEqual(['right']);
    input.release('right');
    expect(input.frame(2).released).toEqual(['right']);
    expect(input.frame(3).released).toEqual([]);
  });

  it('clearEdges drops edges but keeps held; clear drops both', () => {
    const input = new InputState();
    input.press('left');
    input.press('action');
    input.release('action');
    input.clearEdges();
    const f = input.frame(0);
    expect(f.actions).toEqual(['left']);
    expect(f.pressed).toEqual([]);
    expect(f.released).toEqual([]);
    input.clear();
    expect(input.frame(1).actions).toEqual([]);
  });

  it('actions and edges are sorted', () => {
    const input = new InputState();
    input.press('right');
    input.press('action');
    input.press('left');
    const f = input.frame(0);
    expect(f.actions).toEqual(['action', 'left', 'right']);
    expect(f.pressed).toEqual(['action', 'left', 'right']);
  });
});

describe('recording round trip', () => {
  it('a tap on two consecutive ticks is replayed twice, though both frames look the same', () => {
    const input = new InputState();
    const rec = new InputRecorder();
    const live: InputFrame[] = [];
    for (let tick = 0; tick < 3; tick++) {
      if (tick < 2) {
        input.press('action');
        input.release('action');
      }
      const f = input.frame(tick);
      rec.record(f);
      live.push(f);
    }
    for (const [tick, f] of live.entries()) expect(frameAt(rec.frames, tick)).toEqual(f);
  });

  it('replays holds, taps and a release + re-press between ticks', () => {
    const input = new InputState();
    const rec = new InputRecorder();
    const live: InputFrame[] = [];
    const script: Array<(i: InputState) => void> = [
      (i) => i.press('left'), // tick 0: hold left
      () => undefined, // tick 1: still held
      (i) => {
        i.press('action'); // tick 2: tap
        i.release('action');
      },
      (i) => {
        i.release('left'); // tick 3: release + re-press between two ticks
        i.press('left');
      },
      () => undefined, // tick 4
      (i) => i.release('left'), // tick 5
    ];
    for (const [tick, act] of script.entries()) {
      act(input);
      const f = input.frame(tick);
      rec.record(f);
      live.push(f);
    }
    for (const [tick, f] of live.entries()) expect(frameAt(rec.frames, tick)).toEqual(f);
    // the re-press while the action list looks unchanged was recorded
    expect(rec.frames.some((f) => f.tick === 3)).toBe(true);
    expect(live[2]?.pressed).toEqual(['action']);
    expect(live[3]?.pressed).toEqual(['left']);
    expect(live[3]?.released).toEqual(['left']);
    // edges do not leak into ticks without a recorded frame
    expect(frameAt(rec.frames, 99)).toEqual({ tick: 99, actions: [], pressed: [], released: [] });
  });
});
