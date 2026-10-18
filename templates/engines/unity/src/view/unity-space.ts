/**
 * Đổi toạ độ world của Unity (đơn vị, y hướng lên, góc độ ngược chiều kim đồng hồ) sang canvas
 * (pixel, y hướng xuống, radian xuôi chiều kim đồng hồ). core/ giữ nguyên toạ độ Unity để số trong
 * params/ khớp game gốc; chỉ view/ gọi file này.
 *
 * Camera orthographic của Unity thấy cao 2 × orthographicSize đơn vị; chiều ngang theo tỉ lệ màn hình.
 */
export interface UnityCamera {
  /** Camera.orthographicSize (nửa chiều cao nhìn thấy, theo đơn vị world). */
  orthographicSize: number;
  /** Vị trí camera trong world. */
  x: number;
  y: number;
}

export interface Space {
  /** Pixel canvas cho một đơn vị world. */
  readonly pxPerUnit: number;
  toScreen(x: number, y: number): { x: number; y: number };
  toWorld(px: number, py: number): { x: number; y: number };
  /** Góc z của Unity (độ) → góc quay canvas (radian). */
  rotation(zDeg: number): number;
  /** Cỡ sprite trên canvas: pixel của texture / Pixels Per Unit × pxPerUnit. */
  spriteSize(texturePx: number, pixelsPerUnit: number): number;
}

export function createSpace(cam: UnityCamera, viewWidthPx: number, viewHeightPx: number): Space {
  const pxPerUnit = viewHeightPx / (2 * cam.orthographicSize);
  const cx = viewWidthPx / 2;
  const cy = viewHeightPx / 2;
  return {
    pxPerUnit,
    toScreen: (x, y) => ({ x: cx + (x - cam.x) * pxPerUnit, y: cy - (y - cam.y) * pxPerUnit }),
    toWorld: (px, py) => ({ x: cam.x + (px - cx) / pxPerUnit, y: cam.y - (py - cy) / pxPerUnit }),
    rotation: (zDeg) => (-zDeg * Math.PI) / 180,
    spriteSize: (texturePx, pixelsPerUnit) => (texturePx / pixelsPerUnit) * pxPerUnit,
  };
}
