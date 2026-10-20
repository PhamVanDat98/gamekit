/**
 * Drawing art the way it was made to be used (skill art-review): 9-slice / 3-slice panels that
 * stretch without distorting their corners, tiles and looping backgrounds (parallax), pixel art
 * at whole-number scales. Specs (nineSlice, seamless, pixelArt) come from asset-manifest.json.
 */
export type Insets = [left: number, top: number, right: number, bottom: number];
/** [sx, sy, sw, sh, dx, dy, dw, dh] — the arguments of drawImage. */
export type Piece = [number, number, number, number, number, number, number, number];

/**
 * The pieces of a 9-slice draw. Corners keep their size (× `scale`, e.g. 0.5 for an @2x image),
 * edges stretch along one axis, the centre along both. A box smaller than its corners shrinks
 * the corners proportionally instead of overlapping them. Insets of 0 give a 3-slice.
 */
export function nineSlicePieces(srcW: number, srcH: number, insets: Insets, w: number, h: number, scale = 1): Piece[] {
  const [l, t, r, b] = insets;
  let [L, T, R, B] = [l * scale, t * scale, r * scale, b * scale];
  if (L + R > w) [L, R] = [(w * L) / (L + R), (w * R) / (L + R)];
  if (T + B > h) [T, B] = [(h * T) / (T + B), (h * B) / (T + B)];
  const sx = [0, l, srcW - r, srcW];
  const sy = [0, t, srcH - b, srcH];
  const dx = [0, L, w - R, w];
  const dy = [0, T, h - B, h];
  const out: Piece[] = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const sw = sx[i + 1]! - sx[i]!;
      const sh = sy[j + 1]! - sy[j]!;
      const dw = dx[i + 1]! - dx[i]!;
      const dh = dy[j + 1]! - dy[j]!;
      if (sw > 0 && sh > 0 && dw > 0 && dh > 0) out.push([sx[i]!, sy[j]!, sw, sh, dx[i]!, dy[j]!, dw, dh]);
    }
  return out;
}

export function drawNineSlice(ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement, insets: Insets, x: number, y: number, w: number, h: number, scale = 1): void {
  for (const [sx, sy, sw, sh, dx, dy, dw, dh] of nineSlicePieces(img.width, img.height, insets, w, h, scale)) {
    // Whole-pixel edges so neighbouring pieces meet without a hairline.
    const x0 = Math.round(x + dx);
    const y0 = Math.round(y + dy);
    ctx.drawImage(img, sx, sy, sw, sh, x0, y0, Math.round(x + dx + dw) - x0, Math.round(y + dy + dh) - y0);
  }
}

/**
 * Fill an area with a repeating tile or looping background. `offsetX/Y` scroll it (for parallax:
 * camera position × the layer's factor, e.g. 0.2 far hills, 0.6 near trees, 1 the ground).
 */
export function drawTiled(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  { offsetX = 0, offsetY = 0, scale = 1 } = {},
): void {
  const pattern = ctx.createPattern(img, 'repeat');
  if (!pattern) return;
  const tw = img.width * scale;
  const th = img.height * scale;
  // Wrap the offset into one tile and round it, so the pattern never shifts by half a pixel (a visible seam).
  const ox = Math.round(((((x - offsetX) % tw) + tw) % tw));
  const oy = Math.round(((((y - offsetY) % th) + th) % th));
  pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, ox, oy]));
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** Largest whole-number scale at which a `baseW × baseH` pixel-art screen fits the view (at least 1). */
export function integerScale(viewW: number, viewH: number, baseW: number, baseH: number): number {
  return Math.max(1, Math.floor(Math.min(viewW / baseW, viewH / baseH)));
}

/** Pixel art: no smoothing when scaling (call after every canvas resize — resizing resets it). */
export function crispPixels(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
}
