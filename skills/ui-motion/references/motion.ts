// src/view/motion.ts — copied from the GameKit ui-motion skill. View only: core/ never imports this.
// Tweens run on real frame time (dt from requestAnimationFrame), never on the fixed step,
// so UI motion can't change gameplay or replays.

export type Ease = (t: number) => number;

const BACK = 1.70158;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  /** Overshoots then settles: popups, rewards. */
  outBack: (t: number) => 1 + (BACK + 1) * (t - 1) ** 3 + BACK * (t - 1) ** 2,
} satisfies Record<string, Ease>;

/**
 * Durations in seconds. Own game: replace with the original's timings and note the source
 * (e.g. `popupIn: 0.25, // UIPopup.anim, 15 frames @60`).
 */
export const DUR = {
  press: 0.08,
  popupIn: 0.22,
  popupOut: 0.15,
  screen: 0.3,
  countUp: 0.6,
  stagger: 0.04,
};

/** Longest step one update may take: coming back to a hidden tab must not jump to the end. */
const MAX_DT = 0.1;

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface TweenOptions {
  ease?: Ease;
  /** Seconds before it starts. */
  delay?: number;
  done?: () => void;
  /**
   * Under prefers-reduced-motion: 'skip' (default) jumps straight to the end — use for slides,
   * scales, shakes. 'keep' still plays — use for short fades.
   */
  reduce?: 'skip' | 'keep';
}

interface Tween {
  set: (v: number) => void;
  from: number;
  to: number;
  dur: number;
  delay: number;
  t: number;
  ease: Ease;
  done?: () => void;
  key?: object;
  dead: boolean;
}

export class Tweens {
  private list: Tween[] = [];

  constructor(private reduced: () => boolean = reducedMotion) {}

  /**
   * Animates from `from` to `to` over `dur` seconds; `set` gets every value, the last one is exactly `to`.
   * `key`: a new tween with the same key cancels the old one (no two tweens fighting over one value).
   * Returns a cancel function (cancelling never calls `done`).
   */
  to(set: (v: number) => void, from: number, to: number, dur: number, opts: TweenOptions & { key?: object } = {}): () => void {
    if (opts.key) for (const tw of this.list) if (tw.key === opts.key) tw.dead = true;
    const skip = dur <= 0 || ((opts.reduce ?? 'skip') === 'skip' && this.reduced());
    const tw: Tween = {
      set,
      from,
      to,
      dur,
      delay: skip ? 0 : (opts.delay ?? 0),
      t: 0,
      ease: opts.ease ?? ease.outCubic,
      done: opts.done,
      key: opts.key,
      dead: false,
    };
    if (skip) {
      set(to);
      opts.done?.();
      return () => {};
    }
    set(from);
    this.list.push(tw);
    return () => {
      tw.dead = true;
    };
  }

  update(dt: number): void {
    const step = Math.min(Math.max(dt, 0), MAX_DT);
    const list = this.list;
    const started = list.length; // tweens a `done` starts during this update begin next frame
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const tw = list[i]!;
      if (i < started && !tw.dead) this.advance(tw, step);
      if (!tw.dead) list[n++] = tw;
    }
    list.length = n;
  }

  /** True while anything is still moving (e.g. ignore taps on a popup that is still opening). */
  get busy(): boolean {
    return this.list.some((tw) => !tw.dead);
  }

  /** Stops everything; `finish` snaps each tween to its end value and calls `done`. */
  clear(finish = false): void {
    const live = this.list.filter((tw) => !tw.dead);
    for (const tw of live) tw.dead = true;
    if (finish)
      for (const tw of live) {
        tw.set(tw.to);
        tw.done?.();
      }
  }

  private advance(tw: Tween, step: number): void {
    let left = step;
    if (tw.delay > 0) {
      const used = Math.min(tw.delay, left);
      tw.delay -= used;
      left -= used;
    }
    if (left <= 0) return;
    tw.t = Math.min(tw.t + left / tw.dur, 1);
    tw.set(lerp(tw.from, tw.to, tw.ease(tw.t)));
    if (tw.t >= 1) {
      tw.dead = true;
      tw.done?.();
    }
  }
}
