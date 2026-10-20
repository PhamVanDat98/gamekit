/**
 * Frame-by-frame animation: one image per frame, no rig at runtime. Frames come from
 * `/lab.html` → "Xuất frame" (baked from a motion), optionally redrawn one by one by an image
 * model (`gamekit frames <name> --codex`), then shipped from assets/img/anim/<name>/.
 */
export interface FrameMeta {
  name: string;
  fps: number;
  loop: boolean;
  width: number;
  height: number;
  /** The ground point under the feet inside each frame (px): drawn at the character's position. */
  anchor: [number, number];
  /** `at` = frame of the source motion it was baked from; `hold` = ticks it stays (limited animation). */
  frames: { file: string; at?: number; hold?: number }[];
  motion?: string;
}

export const metaTicks = (meta: FrameMeta): number => meta.frames.reduce((n, f) => n + (f.hold ?? 1), 0);
export const metaSeconds = (meta: FrameMeta): number => metaTicks(meta) / meta.fps;

/** Which frame shows `sec` seconds in. Loops wrap; one-shots hold the last frame. */
export function frameIndex(meta: FrameMeta, sec: number): number {
  const total = metaTicks(meta);
  let tick = Math.floor(Math.max(0, sec) * meta.fps + 1e-9);
  tick = meta.loop ? tick % total : Math.min(tick, total - 1);
  for (let i = 0; i < meta.frames.length; i++) {
    tick -= meta.frames[i]!.hold ?? 1;
    if (tick < 0) return i;
  }
  return meta.frames.length - 1;
}

export class FrameAnim {
  constructor(
    readonly meta: FrameMeta,
    private images: readonly CanvasImageSource[],
  ) {}

  get seconds(): number {
    return metaSeconds(this.meta);
  }

  /** Draw the frame for `sec` with its anchor at (x, y); dir -1 faces left. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, sec: number, dir = 1): void {
    this.drawFrame(ctx, frameIndex(this.meta, sec), x, y, dir);
  }

  drawFrame(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, dir = 1): void {
    const img = this.images[index];
    if (!img) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.drawImage(img, -this.meta.anchor[0], -this.meta.anchor[1], this.meta.width, this.meta.height);
    ctx.restore();
  }
}

/** Load the images of a FrameMeta; `urlOf(file)` maps meta file names to URLs (import.meta.glob '?url'). */
export async function loadFrameAnim(meta: FrameMeta, urlOf: (file: string) => string | undefined): Promise<FrameAnim> {
  const images = await Promise.all(
    meta.frames.map(
      (f) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const url = urlOf(f.file);
          if (!url) return reject(new Error(`${meta.name}: thiếu ảnh ${f.file}`));
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`${meta.name}: không tải được ${f.file}`));
          img.src = url;
        }),
    ),
  );
  return new FrameAnim(meta, images);
}
