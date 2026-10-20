/**
 * Mesh deform for cut-out parts: the part's image is laid on a strip of triangles running from
 * its pivot to its tip, and the strip curves (bend) and swells (bulge). Limbs, tails and ears
 * then bend like rubber instead of turning like cardboard — the soft look of Live2D/Spine
 * meshes, drawn with plain canvas 2D. Pure math here is unit-tested; drawing needs a canvas.
 */
export type Vec = [number, number];

export interface MeshSpec {
  /** Direction from the pivot to the tip, in the part's image space (normalised here). */
  axis: Vec;
  /** Quads along the axis (default 8): more = smoother curve, more draw calls. */
  segments?: number;
}

/** Box of the part's drawing in part space: [x, y, width, height]. */
export type Box = [number, number, number, number];

const DEG = Math.PI / 180;
const unit = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
/** Rotate by `a` radians, clockwise on screen (y down) like Pose.rot. */
const turn = (v: Vec, a: number): Vec => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];

export interface Strip {
  /** Vertices per cross-section minus one: columns across the axis, so the cells stay near square. */
  cols: number;
  /** Rest positions (= texture coordinates in part space), cols + 1 per cross-section. */
  rest: Vec[];
  /** Distance of each cross-section along the axis from the pivot. */
  along: number[];
  /** Offset of each vertex across the axis. */
  across: number[];
  /** Length used for bend and bulge: pivot → farthest point of the drawing along the axis. */
  length: number;
}

/** Cut the drawing's box into a strip of cross-sections along the axis. */
export function buildStrip(box: Box, pivot: Vec, spec: MeshSpec): Strip {
  const d = unit(spec.axis);
  const n: Vec = [-d[1], d[0]];
  const corners: Vec[] = [
    [box[0], box[1]],
    [box[0] + box[2], box[1]],
    [box[0], box[1] + box[3]],
    [box[0] + box[2], box[1] + box[3]],
  ];
  const us = corners.map((c) => (c[0] - pivot[0]) * d[0] + (c[1] - pivot[1]) * d[1]);
  const vs = corners.map((c) => (c[0] - pivot[0]) * n[0] + (c[1] - pivot[1]) * n[1]);
  const [u0, u1] = [Math.min(...us), Math.max(...us)];
  const [v0, v1] = [Math.min(...vs), Math.max(...vs)];
  const segs = spec.segments ?? 8;
  // Long thin triangles leave seams (their long edge cannot be pushed out far enough): keep cells square.
  const cols = Math.max(1, Math.min(8, Math.round((v1 - v0) / ((u1 - u0) / segs))));
  const strip: Strip = { cols, rest: [], along: [], across: [], length: stripLength(box, pivot, spec) };
  for (let i = 0; i <= segs; i++) {
    const u = u0 + ((u1 - u0) * i) / segs;
    for (let j = 0; j <= cols; j++) {
      const v = v0 + ((v1 - v0) * j) / cols;
      strip.rest.push([pivot[0] + d[0] * u + n[0] * v, pivot[1] + d[1] * u + n[1] * v]);
      strip.along.push(u);
      strip.across.push(v);
    }
  }
  return strip;
}

/** Pivot → farthest point of the drawing along the axis: the length bend and bulge spread over. */
export function stripLength(box: Box, pivot: Vec, spec: MeshSpec): number {
  const d = unit(spec.axis);
  const xs = [box[0], box[0] + box[2]];
  const ys = [box[1], box[1] + box[3]];
  return Math.max(1e-6, ...xs.flatMap((x) => ys.map((y) => (x - pivot[0]) * d[0] + (y - pivot[1]) * d[1])));
}

/**
 * Where a point of the part goes for a bend (degrees over the whole length, spread evenly: the
 * axis becomes a circular arc) and a bulge (width × (1 + bulge·sin(π·t)): fat in the middle, the
 * joint and the tip keep their size), and how much it turned. Behind the pivot stays rigid.
 * Also used for where children attach, so a head rides the curve of a bending body.
 */
export function bendPoint(p: Vec, pivot: Vec, spec: MeshSpec, length: number, bend: number, bulge: number): { at: Vec; angle: number } {
  const d = unit(spec.axis);
  const n: Vec = [-d[1], d[0]];
  const u = (p[0] - pivot[0]) * d[0] + (p[1] - pivot[1]) * d[1];
  const t = Math.min(1, Math.max(0, u / length));
  const v = ((p[0] - pivot[0]) * n[0] + (p[1] - pivot[1]) * n[1]) * (1 + bulge * Math.sin(Math.PI * t));
  const k = (bend * DEG) / length; // curvature
  if (u <= 0 || Math.abs(k) < 1e-9) return { at: [pivot[0] + d[0] * u + n[0] * v, pivot[1] + d[1] * u + n[1] * v], angle: 0 };
  // Centre line of an arc: integral of turn(d, k·s) ds = d·sin(ku)/k + n·(1 − cos(ku))/k
  const a = k * u;
  const c: Vec = [pivot[0] + d[0] * (Math.sin(a) / k) + n[0] * ((1 - Math.cos(a)) / k), pivot[1] + d[1] * (Math.sin(a) / k) + n[1] * ((1 - Math.cos(a)) / k)];
  const nn = turn(n, a);
  return { at: [c[0] + nn[0] * v, c[1] + nn[1] * v], angle: a / DEG };
}

/** Every vertex of the strip, deformed. */
export function deformStrip(strip: Strip, pivot: Vec, spec: MeshSpec, bend: number, bulge: number): Vec[] {
  return strip.rest.map((p) => bendPoint(p, pivot, spec, strip.length, bend, bulge).at);
}

/** Affine [a, b, c, d, e, f] taking triangle s0 s1 s2 onto d0 d1 d2 (canvas transform order). */
export function triangleMap(s0: Vec, s1: Vec, s2: Vec, d0: Vec, d1: Vec, d2: Vec): [number, number, number, number, number, number] {
  const [sx1, sy1, sx2, sy2] = [s1[0] - s0[0], s1[1] - s0[1], s2[0] - s0[0], s2[1] - s0[1]];
  const [dx1, dy1, dx2, dy2] = [d1[0] - d0[0], d1[1] - d0[1], d2[0] - d0[0], d2[1] - d0[1]];
  const det = sx1 * sy2 - sx2 * sy1 || 1e-9;
  const a = (dx1 * sy2 - dx2 * sy1) / det;
  const c = (dx2 * sx1 - dx1 * sx2) / det;
  const b = (dy1 * sy2 - dy2 * sy1) / det;
  const dd = (dy2 * sx1 - dy1 * sx2) / det;
  return [a, b, c, dd, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - dd * s0[1]];
}

/**
 * The triangle with every edge moved `g` outwards (mitred corners, capped for sharp angles).
 * Pushing corners away from the centre is not enough: a long, flat triangle barely grows across
 * its long edge, and the seam shows.
 */
export function grow(t: [Vec, Vec, Vec], g: number): Vec[] {
  const area = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1]);
  const side = area >= 0 ? 1 : -1;
  const normal = (a: Vec, b: Vec): Vec => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [((b[1] - a[1]) / l) * side, (-(b[0] - a[0]) / l) * side];
  };
  return t.map((p, i) => {
    const n1 = normal(t[(i + 2) % 3]!, p);
    const n2 = normal(p, t[(i + 1) % 3]!);
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    const m = Math.min(8, 1 / Math.max(1 / 64, (1 + dot) / 2)); // miter (exact down to ~40°), capped
    return [p[0] + ((n1[0] + n2[0]) / 2) * g * m, p[1] + ((n1[1] + n2[1]) / 2) * g * m] as Vec;
  });
}

/**
 * Draw `texture` (the part rendered at `scale` px per part unit, its top-left at box[0], box[1])
 * through the deformed strip. Each triangle is clipped slightly larger than itself so the
 * seams between triangles do not show.
 */
export function drawStrip(ctx: CanvasRenderingContext2D, texture: CanvasImageSource, box: Box, scale: number, strip: Strip, out: Vec[]): void {
  const tex = (p: Vec): Vec => [(p[0] - box[0]) * scale, (p[1] - box[1]) * scale];
  const GROW = 0.75; // how far each edge is pushed out, so neighbours overlap instead of leaving a hairline
  const row = strip.cols + 1;
  const cells: [number, number, number][] = [];
  for (let r = 0; (r + 1) * row < strip.rest.length; r++)
    for (let c = 0; c < strip.cols; c++) {
      const i = r * row + c;
      cells.push([i, i + 1, i + row], [i + 1, i + row + 1, i + row]);
    }
  for (const tri of cells) {
    const d = tri.map((j) => out[j]!) as [Vec, Vec, Vec];
    const s = tri.map((j) => tex(strip.rest[j]!)) as [Vec, Vec, Vec];
    ctx.save();
    ctx.beginPath();
    grow(d, GROW).forEach(([x, y], j) => (j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.clip();
    ctx.transform(...triangleMap(s[0], s[1], s[2], d[0], d[1], d[2]));
    ctx.drawImage(texture, 0, 0);
    ctx.restore();
  }
}
