import { combine, motionSeconds, poseAt, rest, type Motion, type Pose, type Poses } from './motion';

/**
 * Plays motions for one character or widget: a base loop (idle) underneath and at most one
 * one-shot (hop, hit, pop-in) on top. View-only: feed it real frame time, never use it in core/.
 */
export class Animator {
  private base: { m: Motion; t: number } | null = null;
  private shot: { m: Motion; t: number; speed: number; onEnd?: () => void } | null = null;
  private poses: Poses = {};

  /** Loop under everything (usually idle). */
  loop(m: Motion | null): this {
    this.base = m ? { m, t: 0 } : null;
    return this;
  }

  /** Play once on top of the loop. Replaces a one-shot still playing. */
  play(m: Motion, opts: { speed?: number; onEnd?: () => void } = {}): this {
    this.shot = { m, t: 0, speed: opts.speed ?? 1, onEnd: opts.onEnd };
    return this;
  }

  get playing(): string | null {
    return this.shot?.m.name ?? null;
  }

  /** Frame (in the motion's fps) the one-shot is at, for timing effects to it (flash, shake, dust). */
  get frame(): number {
    return this.shot ? this.shot.t * (this.shot.m.fps ?? 60) : 0;
  }

  /** Advance by real seconds (0 while paused). */
  update(dt: number): void {
    if (this.base) this.base.t += dt;
    const shot = this.shot;
    if (shot) {
      shot.t += dt * shot.speed;
      if (shot.t >= motionSeconds(shot.m)) {
        this.shot = null;
        shot.onEnd?.();
      }
    }
    const base = this.base ? poseAt(this.base.m, this.base.t) : {};
    const top = shot && this.shot === shot ? poseAt(shot.m, shot.t) : {};
    this.poses = {};
    for (const part of new Set([...Object.keys(base), ...Object.keys(top)])) this.poses[part] = combine(base[part] ?? rest(), top[part]);
  }

  pose(part: string): Pose {
    return this.poses[part] ?? rest();
  }

  get all(): Poses {
    return this.poses;
  }
}
