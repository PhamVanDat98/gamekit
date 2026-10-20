import { rest, type Pose, type Poses } from './motion';
import { bendPoint, buildStrip, deformStrip, drawStrip, stripLength, type Box, type MeshSpec, type Strip } from './mesh';
import type { DragSpec } from './drag';

/**
 * Cut-out rig: a character made of separate parts (body, head, arm…) instead of one image per
 * frame. Parts rotate around their pivot and inherit their parent's transform — that is what
 * lets an AI-made character move without redrawing (and changing) it every frame.
 */
export interface RigPart {
  name: string;
  parent?: string;
  /** Where this part's pivot sits on the parent, in the parent's image px (from its top-left). Root parts: from the rig origin. */
  at: [number, number];
  /** Pivot inside the part's own image/drawing (px from its top-left): the joint it bends at. */
  pivot: [number, number];
  z?: number;
  image?: CanvasImageSource;
  /** Draw in part space (0,0 = image top-left) when there is no image (placeholder, vector art). */
  draw?: (ctx: CanvasRenderingContext2D) => void;
  /** Soft part: drawn through a bendable mesh from the pivot along this axis (pose.bend, pose.bulge). */
  mesh?: MeshSpec;
  /** Area `draw` paints, in part space [x, y, w, h] — needed to rasterise a drawn part for its mesh. Images: their size. */
  box?: Box;
  /** Automatic follow-through: the part bends against how its frame moves and turns (see drag.ts). */
  drag?: DragSpec;
}

/** 2D affine matrix [a, b, c, d, e, f] as in CanvasRenderingContext2D.transform. */
export type Mat = [number, number, number, number, number, number];
const DEG = Math.PI / 180;

export const multiply = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Part space → parent space: move to `at` + pose offset, rotate, scale, then put the pivot at 0,0. */
export function localMatrix(p: RigPart, pose: Pose): Mat {
  const r = pose.rot * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const tx = p.at[0] + pose.x;
  const ty = p.at[1] + pose.y;
  const [a, b, c, d] = [cos * pose.sx, sin * pose.sx, -sin * pose.sy, cos * pose.sy];
  return [a, b, c, d, tx - a * p.pivot[0] - c * p.pivot[1], ty - b * p.pivot[0] - d * p.pivot[1]];
}

/** World (rig-space) matrix of every part; parents must be listed before children. */
export function worldMatrices(parts: readonly RigPart[], poses: Poses): Record<string, Mat> {
  const out: Record<string, Mat> = {};
  const none: Pose = rest();
  const byName = new Map(parts.map((p) => [p.name, p]));
  for (const p of parts) {
    let part = p;
    let pose = poses[p.name] ?? none;
    // A child of a soft part rides its curve: its joint moves along the bend and turns with it.
    const host = p.parent ? byName.get(p.parent) : undefined;
    const hostPose = host ? poses[host.name] : undefined;
    const hostBox = host?.box ?? (host?.image ? [0, 0, (host.image as { width: number }).width, (host.image as { height: number }).height] : undefined);
    if (host?.mesh && hostBox && hostPose && (hostPose.bend || hostPose.bulge)) {
      const length = stripLength(hostBox as Box, host.pivot, host.mesh);
      const moved = bendPoint(p.at, host.pivot, host.mesh, length, hostPose.bend, hostPose.bulge);
      part = { ...p, at: moved.at };
      pose = { ...pose, rot: pose.rot + moved.angle };
    }
    const local = localMatrix(part, pose);
    const parent = p.parent ? out[p.parent] : undefined;
    if (p.parent && !parent) throw new Error(`rig: ${p.name} khai báo trước parent ${p.parent}`);
    out[p.name] = parent ? multiply(parent, local) : local;
  }
  return out;
}

const TEXTURE_SCALE = 2; // rasterise drawn parts at 2x so the mesh stays sharp when scaled
type SoftPart = { texture: CanvasImageSource; box: Box; scale: number; strip: Strip };
const softParts = new WeakMap<RigPart, SoftPart>();

function softPart(p: RigPart, mesh: MeshSpec): SoftPart {
  const cached = softParts.get(p);
  if (cached) return cached;
  let texture: CanvasImageSource;
  let box: Box;
  let scale = 1;
  if (p.image) {
    const { width, height } = p.image as { width: number; height: number };
    box = p.box ?? [0, 0, width, height];
    texture = p.image;
  } else {
    box = p.box ?? [0, 0, 64, 64];
    scale = TEXTURE_SCALE;
    const c = document.createElement('canvas');
    c.width = Math.ceil(box[2] * scale);
    c.height = Math.ceil(box[3] * scale);
    const cctx = c.getContext('2d')!;
    cctx.scale(scale, scale);
    cctx.translate(-box[0], -box[1]);
    p.draw?.(cctx);
    texture = c;
  }
  const s: SoftPart = { texture, box, scale, strip: buildStrip(box, p.pivot, mesh) };
  softParts.set(p, s);
  return s;
}

/**
 * Draw the rig at the context's current transform (translate there first). Alpha multiplies down
 * the hierarchy. Parts with a mesh bend and bulge; `{ soft: false }` draws them rigid (to compare).
 */
export function drawRig(ctx: CanvasRenderingContext2D, parts: readonly RigPart[], poses: Poses, { soft = true } = {}): void {
  const mats = worldMatrices(parts, poses);
  const alpha: Record<string, number> = {};
  for (const p of parts) alpha[p.name] = (p.parent ? (alpha[p.parent] ?? 1) : 1) * (poses[p.name]?.alpha ?? 1);
  const order = parts.map((p, i) => ({ p, i })).sort((a, b) => (a.p.z ?? 0) - (b.p.z ?? 0) || a.i - b.i);
  for (const { p } of order) {
    const m = mats[p.name]!;
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.globalAlpha *= alpha[p.name] ?? 1;
    if (p.mesh && soft) {
      const s = softPart(p, p.mesh);
      const pose = poses[p.name];
      drawStrip(ctx, s.texture, s.box, s.scale, s.strip, deformStrip(s.strip, p.pivot, p.mesh, pose?.bend ?? 0, pose?.bulge ?? 0));
    } else if (p.image) ctx.drawImage(p.image, 0, 0);
    else p.draw?.(ctx);
    ctx.restore();
  }
}

/**
 * Onion skin: ghost earlier frames behind the current one so spacing and arcs are visible on a
 * screenshot (the review step of the animate skill). `drawAt(sec, alpha)` draws one ghost.
 */
export function onionSkin(sec: number, drawAt: (sec: number, alpha: number) => void, { ghosts = 6, every = 2 / 60, fade = 0.5 } = {}): void {
  for (let i = ghosts; i >= 1; i--) {
    const t = sec - i * every;
    if (t >= 0) drawAt(t, fade * (1 - i / (ghosts + 1)));
  }
  drawAt(sec, 1);
}
