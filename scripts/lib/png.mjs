import fs from 'node:fs';
import zlib from 'node:zlib';

/** Read width/height/alpha from a PNG header without dependencies. Returns null if not a PNG. */
export function pngInfo(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(33);
    fs.readSync(fd, buf, 0, 33, 0);
    const sig = '89504e470d0a1a0a';
    if (buf.subarray(0, 8).toString('hex') !== sig) return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const colorType = buf[25];
    // 4 = gray+alpha, 6 = RGBA. Palette (3) may carry tRNS; treat as "maybe".
    const alpha = colorType === 4 || colorType === 6 ? true : colorType === 3 ? null : false;
    return { width, height, alpha };
  } finally {
    fs.closeSync(fd);
  }
}

/** RIFF....WEBP header. */
export function isWebp(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    return n === 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  } finally {
    fs.closeSync(fd);
  }
}

/** Width/height/alpha of a PNG or WebP (lossy, lossless, extended). Returns null for anything else. */
export function imageInfo(file) {
  const png = pngInfo(file);
  if (png) return { format: 'png', ...png };
  const buf = fs.readFileSync(file);
  if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('latin1', 12, 16);
  const u24 = (o) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
  if (chunk === 'VP8X') return { format: 'webp', width: u24(24) + 1, height: u24(27) + 1, alpha: Boolean(buf[20] & 0x10) };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { format: 'webp', width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1, alpha: Boolean((b >>> 28) & 1) };
  }
  if (chunk === 'VP8 ') return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, alpha: false };
  return null;
}

/**
 * Decode an 8-bit, non-interlaced PNG (gray, RGB, gray+alpha, RGBA) to raw pixels.
 * Returns null for formats it does not handle (palette, 16-bit, interlaced) — callers skip pixel checks then.
 */
export function pngPixels(file) {
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  let o = 8;
  let ihdr;
  const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr?.color];
  if (!ihdr || !channels || ihdr.depth !== 8 || ihdr.interlace !== 0) return null;
  const { width, height } = ihdr;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[row + x - channels] : 0;
      const b = y > 0 ? out[row - stride + x] : 0;
      const c = x >= channels && y > 0 ? out[row - stride + x - channels] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[row + x] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

/**
 * Cheap signals that a generated image is broken: share of see-through border pixels (a sprite drawn
 * on a fake checkerboard has none), share of visible pixels, and how much of the visible part is one
 * flat colour (a fill or a code-drawn stand-in instead of a picture).
 */
export function pixelStats(px) {
  const { width: w, height: h, channels: ch, data } = px;
  const alphaAt = (i) => (ch === 4 ? data[i + 3] : ch === 2 ? data[i + 1] : 255);
  let border = 0;
  let clear = 0;
  const step = Math.max(1, Math.floor(Math.max(w, h) / 256));
  const edge = (x, y) => {
    border++;
    if (alphaAt((y * w + x) * ch) < 16) clear++;
  };
  for (let x = 0; x < w; x += step) edge(x, 0), edge(x, h - 1);
  for (let y = 0; y < h; y += step) edge(0, y), edge(w - 1, y);
  const buckets = new Map();
  let seen = 0;
  let visible = 0;
  const sample = Math.max(1, Math.floor((w * h) / 40000));
  for (let p = 0; p < w * h; p += sample) {
    const i = p * ch;
    seen++;
    if (alphaAt(i) < 16) continue;
    visible++;
    const key = ch >= 3 ? `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}` : `${data[i] >> 4}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return {
    clearBorder: clear / border,
    visible: visible / seen,
    flat: visible ? Math.max(...buckets.values()) / visible : 1,
  };
}
