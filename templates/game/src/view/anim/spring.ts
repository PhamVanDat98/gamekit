/**
 * Damped spring for procedural follow-through and drag: a part that chases a target (the body's
 * velocity, the cursor, a lean angle) and overshoots, then settles. frequency = oscillations per
 * second, damping = ratio (1 = no overshoot, 0.3–0.5 = cartoon wobble). Frame-rate independent.
 */
export class Spring {
  velocity = 0;

  constructor(
    public value = 0,
    public target = 0,
    public frequency = 4,
    public damping = 0.4,
  ) {}

  update(dt: number): number {
    const MAX_STEP = 1 / 120; // stable at any display rate
    const w = 2 * Math.PI * this.frequency;
    for (let left = Math.max(0, dt); left > 0; left -= MAX_STEP) {
      const h = Math.min(MAX_STEP, left);
      const accel = w * w * (this.target - this.value) - 2 * this.damping * w * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  /** Kick it (an impact): adds velocity, the spring does the wobble. */
  impulse(v: number): void {
    this.velocity += v;
  }
}

/**
 * Stretch along the direction of travel from speed (px/s): 1 at rest, up to `max` when fast.
 * Use for falling, dashing, flying objects; squash on impact comes from a motion (hit, hop) or a Spring.
 */
export function stretchFromSpeed(speed: number, pxPerSecForFull: number, max = 1.3): number {
  const t = Math.min(1, Math.abs(speed) / pxPerSecForFull);
  return 1 + (max - 1) * t;
}
