import { DEFAULT_EASE, EASES, type EaseName } from './ease';

/** motion/*.json — schema in .gamekit/schemas/motion.schema.json; `npm run gk -- motion` checks it. */
export type Prop = 'x' | 'y' | 'rot' | 'sx' | 'sy' | 'stretch' | 'alpha';
export interface Key {
  f: number;
  v: number;
  ease?: EaseName;
  beat?: 'anticipation' | 'action' | 'overshoot' | 'settle' | 'hold';
}
export interface Motion {
  name: string;
  role: 'action' | 'player-action' | 'telegraph' | 'reaction' | 'ui' | 'idle' | 'fx';
  fps?: number;
  frames?: number;
  loop?: boolean;
  step?: number;
  brief?: string;
  tracks: Record<string, Key[]>;
  skip?: Record<string, string>;
}

/** Offset from a part's rest pose: x/y px, rot degrees, sx/sy scale, alpha. */
export interface Pose {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  alpha: number;
}
export type Poses = Record<string, Pose>;

export const rest = (): Pose => ({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, alpha: 1 });

export function sampleKeys(keys: readonly Key[], f: number): number {
  const first = keys[0];
  if (!first) return 0;
  if (f <= first.f) return first.v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (f <= b.f) return a.v + (b.v - a.v) * EASES[b.ease ?? DEFAULT_EASE]((f - a.f) / (b.f - a.f));
  }
  return keys[keys.length - 1]!.v;
}

export const motionFrames = (m: Motion): number => m.frames ?? Math.max(...Object.values(m.tracks).map((k) => k[k.length - 1]?.f ?? 0));
export const motionSeconds = (m: Motion): number => motionFrames(m) / (m.fps ?? 60);

/** Poses of every part `sec` seconds in. Loops wrap; one-shots hold their last pose. */
export function poseAt(m: Motion, sec: number): Poses {
  const fps = m.fps ?? 60;
  const total = motionFrames(m);
  let f = sec * fps;
  f = m.loop ? ((f % total) + total) % total : Math.min(Math.max(f, 0), total);
  if (m.step) {
    const hold = fps / m.step; // pose held this many frames: the hand-drawn "on twos" look
    f = Math.floor(f / hold) * hold;
  }
  const out: Poses = {};
  for (const [track, keys] of Object.entries(m.tracks)) {
    const dot = track.lastIndexOf('.');
    const part = track.slice(0, dot);
    const prop = track.slice(dot + 1) as Prop;
    const pose = (out[part] ??= rest());
    const v = sampleKeys(keys, f);
    if (prop === 'stretch') {
      // Squash & stretch keeps the area: taller is thinner.
      pose.sy *= v;
      pose.sx *= 1 / v;
    } else pose[prop] = v;
  }
  return out;
}

/** Layer b on top of a: offsets add, scales and alpha multiply. */
export function combine(a: Pose, b: Pose | undefined): Pose {
  if (!b) return a;
  return { x: a.x + b.x, y: a.y + b.y, rot: a.rot + b.rot, sx: a.sx * b.sx, sy: a.sy * b.sy, alpha: a.alpha * b.alpha };
}
