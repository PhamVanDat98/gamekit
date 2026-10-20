import type { Poses } from './motion';
import { worldMatrices, type RigPart } from './rig';
import { Spring } from './spring';

/**
 * Automatic follow-through and drag: a tail, ear or arm with a mesh bends against how the part
 * it hangs from moves and turns, then springs back and wobbles out. Works on top of any motion,
 * so even a stiff, hand-keyed (or AI-keyed) motion gets overlapping action for free.
 */
export interface DragSpec {
  /** Degrees of bend per px/s the pivot moves across the part's axis (default 0.06). */
  vel?: number;
  /** Degrees of bend per deg/s the part turns (default 0.05). */
  rot?: number;
  /** Spring frequency (Hz, default 3.5) and damping ratio (default 0.35): lower = floppier. */
  frequency?: number;
  damping?: number;
  /** Largest bend it may add, degrees (default 35). */
  max?: number;
}

interface Track {
  part: RigPart;
  spring: Spring;
  last: { x: number; y: number; angle: number } | null;
}

export class Drag {
  private tracks: Track[];

  constructor(private rig: readonly RigPart[]) {
    this.tracks = rig.filter((p) => p.drag && p.mesh).map((part) => ({ part, spring: new Spring(0, 0, part.drag!.frequency ?? 3.5, part.drag!.damping ?? 0.35), last: null }));
  }

  reset(): void {
    for (const t of this.tracks) {
      t.spring.value = t.spring.velocity = t.spring.target = 0;
      t.last = null;
    }
  }

  /**
   * Advance by `dt` seconds with the rig in `poses`. `carry` = how the whole rig moves in rig space
   * (px/s) when the game moves it rather than a motion (walking: [speed, 0]).
   */
  step(dt: number, poses: Poses, carry: [number, number] = [0, 0]): void {
    if (dt <= 0) return;
    const mats = worldMatrices(this.rig, poses);
    for (const t of this.tracks) {
      const m = mats[t.part.name];
      if (!m) continue;
      const [px, py] = t.part.pivot;
      const x = m[0] * px + m[2] * py + m[4];
      const y = m[1] * px + m[3] * py + m[5];
      const axis = t.part.mesh!.axis;
      const ax = m[0] * axis[0] + m[2] * axis[1];
      const ay = m[1] * axis[0] + m[3] * axis[1];
      const angle = (Math.atan2(ay, ax) * 180) / Math.PI;
      if (t.last) {
        const vx = (x - t.last.x) / dt + carry[0];
        const vy = (y - t.last.y) / dt + carry[1];
        let da = angle - t.last.angle;
        da -= Math.round(da / 360) * 360;
        const l = Math.hypot(ax, ay) || 1;
        // Moving sideways to the axis leaves the tip behind; turning leaves it behind the turn.
        const across = (ax * vy - ay * vx) / l;
        const spec = t.part.drag!;
        const max = spec.max ?? 35;
        const target = -across * (spec.vel ?? 0.06) - (da / dt) * (spec.rot ?? 0.05);
        t.spring.target = Math.max(-max, Math.min(max, target));
        t.spring.update(dt);
      }
      t.last = { x, y, angle };
    }
  }

  /** `poses` with the drag bend added (the input is not changed). */
  apply(poses: Poses): Poses {
    const out: Poses = { ...poses };
    for (const t of this.tracks) {
      const p = out[t.part.name];
      const bend = t.spring.value;
      out[t.part.name] = p ? { ...p, bend: p.bend + bend } : { x: 0, y: 0, rot: 0, sx: 1, sy: 1, alpha: 1, bend, bulge: 0 };
    }
    return out;
  }
}

/**
 * Poses at `sec` with drag, simulated from the start at 60 Hz so the result is the same however
 * it is scrubbed (lab, onion skin, baking frames). Loops pre-roll one cycle so the seam matches.
 */
export function posesWithDrag(rig: readonly RigPart[], posesAt: (sec: number) => Poses, sec: number, { preroll = 0 } = {}): Poses {
  const drag = new Drag(rig);
  const STEP = 1 / 60;
  for (let t = -preroll; t < sec - 1e-9; t += STEP) drag.step(Math.min(STEP, sec - t), posesAt(t));
  return drag.apply(posesAt(sec));
}
