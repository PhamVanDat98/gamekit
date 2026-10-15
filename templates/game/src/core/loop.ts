/**
 * Fixed-timestep accumulator. Simulation always advances in equal steps,
 * whatever the display frame rate, so physics and replays are deterministic.
 */
export interface FixedStep {
  readonly stepSec: number;
  readonly maxStepsPerFrame: number;
  accumulator: number;
}

export function createFixedStep(hz: number, maxStepsPerFrame = 5): FixedStep {
  if (hz <= 0) throw new Error('hz must be > 0');
  return { stepSec: 1 / hz, maxStepsPerFrame, accumulator: 0 };
}

/**
 * Feed real elapsed seconds; returns how many fixed steps to run now and the
 * interpolation factor (0..1) for rendering between the last two states.
 * Large gaps (tab was hidden) are clamped so the game never fast-forwards.
 */
export function advance(fs: FixedStep, elapsedSec: number): { steps: number; alpha: number } {
  fs.accumulator += Math.max(0, elapsedSec);
  let steps = Math.floor(fs.accumulator / fs.stepSec);
  if (steps > fs.maxStepsPerFrame) {
    steps = fs.maxStepsPerFrame;
    fs.accumulator = 0;
  } else {
    fs.accumulator -= steps * fs.stepSec;
  }
  return { steps, alpha: fs.accumulator / fs.stepSec };
}
