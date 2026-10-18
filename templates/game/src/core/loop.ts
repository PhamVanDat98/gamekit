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
 * Feed real elapsed seconds; returns how many fixed steps to run now.
 * At most maxStepsPerFrame run per frame; what is left over is kept (up to one frame's worth of steps)
 * so a slow frame catches up over the next ones, while a long gap (tab was hidden) never fast-forwards.
 */
export function advance(fs: FixedStep, elapsedSec: number): number {
  fs.accumulator += Math.max(0, elapsedSec);
  const steps = Math.min(Math.floor(fs.accumulator / fs.stepSec), fs.maxStepsPerFrame);
  fs.accumulator = Math.min(fs.accumulator - steps * fs.stepSec, fs.maxStepsPerFrame * fs.stepSec);
  return steps;
}
