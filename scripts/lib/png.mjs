import zlib from 'node:zlib';
import fs from 'node:fs';

/** Read width/height/alpha from a PNG header without dependencies. Returns null if not a PNG. */
export function pngInfo(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(33);
    fs.readSync(fd, buf, 0, 33, 0);
    return pngHeader(buf);
  } finally {
    fs.closeSync(fd);
  }
}

/** Same as pngInfo, from the first 33 bytes already in memory. */
export function pngHeader(buf) {
  if (!buf || buf.length < 26 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  // 4 = gray+alpha, 6 = RGBA. Palette (3) may carry tRNS; treat as "maybe".
  const alpha = colorType === 4 || colorType === 6 ? true : colorType === 3 ? null : false;
  return { width, height, alpha };
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

/**
 * Decode an 8-bit, non-interlaced PNG (gray, RGB, palette, gray+alpha, RGBA) to RGBA pixels.
 * Enough for browser screenshots and sprite sheets; anything else returns null.
 */
export function decodePng(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = 0;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (depth !== 8 || interlace !== 0 || !channels || !width || !height) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride);
    const up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= channels ? up[i - channels] : 0;
      let v = src[i];
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
      row[i] = v & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let r, g, b, al;
    if (color === 0) [r, g, b, al] = [px[s], px[s], px[s], 255];
    else if (color === 2) [r, g, b, al] = [px[s], px[s + 1], px[s + 2], 255];
    else if (color === 3) {
      const k = px[s];
      [r, g, b] = palette ? [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2]] : [0, 0, 0];
      al = trns && k < trns.length ? trns[k] : 255;
    } else if (color === 4) [r, g, b, al] = [px[s], px[s], px[s], px[s + 1]];
    else [r, g, b, al] = [px[s], px[s + 1], px[s + 2], px[s + 3]];
    rgba.set([r, g, b, al], i * 4);
  }
  return { width, height, data: rgba };
}

/**
 * How "empty" an image looks: share of pixels in the most common colour (colours bucketed so
 * anti-aliasing and gradients of one colour count together). 1 = a single flat colour.
 */
export function dominantShare(img) {
  const counts = new Map();
  let top = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const k = ((img.data[i * 4] >> 4) << 8) | ((img.data[i * 4 + 1] >> 4) << 4) | (img.data[i * 4 + 2] >> 4);
    const c = (counts.get(k) ?? 0) + 1;
    counts.set(k, c);
    if (c > top) top = c;
  }
  return n ? top / n : 1;
}
