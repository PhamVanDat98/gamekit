import { motionFrames, poseAt, type Motion } from './motion';
import { drawRig, type RigPart } from './rig';
import type { FrameMeta } from './frames';

/**
 * Render a motion on a rig into one image per frame (browser only). Every frame uses the same
 * box, so the anchor (ground point under the feet) is the same pixel in all of them.
 */
export function bakeMotion(rig: readonly RigPart[], m: Motion, { fps = 24, scale = 1, pad = 4 } = {}): { meta: FrameMeta; frames: HTMLCanvasElement[] } {
  const SIZE = 1024;
  const origin: [number, number] = [SIZE / 2, SIZE * 0.75];
  const mfps = m.fps ?? 60;
  const total = motionFrames(m);
  // A loop's last frame is its first; a one-shot keeps its end pose.
  const count = m.loop ? Math.round((total / mfps) * fps) : Math.floor((total / mfps) * fps + 1e-9) + 1;
  const times = Array.from({ length: count }, (_, i) => i / fps);

  const work = document.createElement('canvas');
  work.width = work.height = SIZE;
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  const box = { x0: SIZE, y0: SIZE, x1: 0, y1: 0 };
  const renders = times.map((sec) => {
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.clearRect(0, 0, SIZE, SIZE);
    wctx.translate(origin[0], origin[1]);
    wctx.scale(scale, scale);
    drawRig(wctx, rig, poseAt(m, sec));
    const data = wctx.getImageData(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        if (data.data[(y * SIZE + x) * 4 + 3]! > 8) {
          if (x < box.x0) box.x0 = x;
          if (x > box.x1) box.x1 = x;
          if (y < box.y0) box.y0 = y;
          if (y > box.y1) box.y1 = y;
        }
    return data;
  });
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const width = Math.min(SIZE, box.x1 + pad + 1) - x0;
  const height = Math.min(SIZE, box.y1 + pad + 1) - y0;
  const frames = renders.map((data) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d')!.putImageData(data, -x0, -y0, x0, y0, width, height);
    return c;
  });
  const meta: FrameMeta = {
    name: m.name,
    fps,
    loop: !!m.loop,
    width,
    height,
    anchor: [origin[0] - x0, origin[1] - y0],
    frames: times.map((sec, i) => ({ file: `pose-${String(i).padStart(2, '0')}.png`, at: Math.round(sec * mfps * 100) / 100 })),
    motion: `motion/${m.name}.json`,
  };
  return { meta, frames };
}
