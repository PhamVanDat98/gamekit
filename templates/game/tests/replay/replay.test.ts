import { describe, expect, it } from 'vitest';
import { InputRecorder, InputState, inputAt } from '../../src/core/input';
import { FIXED_HZ } from '../../src/core/loop';
import { PARAMS } from '../../src/core/params';
import { Rng } from '../../src/core/rng';
import { createWorld, stepWorld, worldHash } from '../../src/core/world';

const DT = 1 / FIXED_HZ;

/** Play a scripted session, recording input; return the recording and final hash. */
function playScripted(seed: number) {
  const w = createWorld(PARAMS, seed);
  const input = new InputState();
  const rec = new InputRecorder();
  const driver = new Rng(seed ^ 0xbeef);
  for (let tick = 0; tick < 1800 && !w.over; tick++) {
    if (tick % 20 === 0) {
      input.clear();
      const r = driver.next();
      if (r < 0.4) input.press('left');
      else if (r < 0.8) input.press('right');
    }
    const f = input.frame(w.tick);
    rec.record(f);
    stepWorld(w, PARAMS, f, DT);
  }
  return { frames: rec.frames, hash: worldHash(w), ticks: w.tick };
}

describe('replay', () => {
  it('[run.replay:replay] same seed + recorded input → identical final state', () => {
    const live = playScripted(1234);
    const w = createWorld(PARAMS, 1234);
    for (let t = 0; t < live.ticks; t++) stepWorld(w, PARAMS, { tick: w.tick, actions: inputAt(live.frames, w.tick) }, DT);
    expect(worldHash(w)).toBe(live.hash);
  });

  it('inputAt returns what was held at each tick', () => {
    const rec = [
      { tick: 3, actions: ['left'] as const },
      { tick: 7, actions: [] as const },
      { tick: 9, actions: ['action', 'right'] as const },
    ];
    expect([0, 2, 3, 6, 7, 8, 9, 100].map((t) => inputAt(rec, t).join('+'))).toEqual(['', '', 'left', 'left', '', '', 'action+right', 'action+right']);
    expect(inputAt([], 5)).toEqual([]);
  });

  it('[run.replay:replay] different seed → different run', () => {
    expect(playScripted(1).hash).not.toBe(playScripted(2).hash);
  });
});
