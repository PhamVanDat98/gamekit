import { describe, expect, it } from 'vitest';
import { InputRecorder, InputState, frameAt } from '../../src/core/input';
import { PARAMS } from '../../src/core/params';
import { Rng } from '../../src/core/rng';
import { createWorld, stepWorld, worldHash } from '../../src/core/world';

const HZ = PARAMS.sim.fixedStepHz;
const DT = 1 / HZ;
const SESSION_SECONDS = 30;
const DRIVER_EVERY_SECONDS = 1 / 3; // the scripted driver changes its mind about 3 times a second

/** Play a scripted session, recording input; return the recording and final hash. */
function playScripted(seed: number) {
  const w = createWorld(PARAMS, seed);
  const input = new InputState();
  const rec = new InputRecorder();
  const driver = new Rng(seed ^ 0xbeef);
  const driverEvery = Math.round(DRIVER_EVERY_SECONDS * HZ);
  for (let tick = 0; tick < SESSION_SECONDS * HZ && !w.over; tick++) {
    if (tick % driverEvery === 0) {
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
    for (let t = 0; t < live.ticks; t++) stepWorld(w, PARAMS, frameAt(live.frames, w.tick), DT);
    expect(worldHash(w)).toBe(live.hash);
  });

  it('[run.replay:replay] different seed → different run', () => {
    expect(playScripted(1).hash).not.toBe(playScripted(2).hash);
  });
});
