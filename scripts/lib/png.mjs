import fs from 'node:fs';
import zlib from 'node:zlib';
import { crc32 } from './zip.mjs';
import { GkError } from './log.mjs';

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

// ---------- decode / encode / resize: enough for generated art, store images and screenshots ----------
// An image is { width, height, data } with data = RGBA, 8 bits per channel, row after row.

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** PNG bytes → RGBA. Every colour type and bit depth; interlaced (Adam7) PNGs are refused. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new GkError('Không phải file PNG');
  let pos = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') ihdr = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  if (!ihdr || !(ihdr.color in CHANNELS)) throw new GkError('PNG hỏng: thiếu hoặc sai IHDR');
  if (ihdr.interlace) throw new GkError('PNG interlaced (Adam7) chưa hỗ trợ — xuất lại không interlace');
  const { width, height, depth, color } = ihdr;
  const bpp = Math.max(1, (CHANNELS[color] * depth) >> 3); // bytes per pixel for filtering
  const stride = Math.ceil((width * CHANNELS[color] * depth) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[out + x - bpp] : 0;
      const b = y ? px[out - stride + x] : 0;
      const c = x >= bpp && y ? px[out - stride + x - bpp] : 0;
      const v = raw[src + x];
      px[out + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  const max = (1 << depth) - 1;
  const sample = (row, i) => {
    // i-th sample of the row, scaled to 0..255
    if (depth === 8) return px[row + i];
    if (depth === 16) return px[row + i * 2];
    const bit = i * depth;
    return ((px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & max) * (255 / max);
  };
  const rawSample = (row, i) => (depth === 16 ? px.readUInt16BE(row + i * 2) : depth === 8 ? px[row + i] : (px[row + ((i * depth) >> 3)] >> (8 - depth - ((i * depth) & 7))) & max);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (color === 3) {
        const idx = rawSample(row, x);
        data[o] = palette[idx * 3];
        data[o + 1] = palette[idx * 3 + 1];
        data[o + 2] = palette[idx * 3 + 2];
        data[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (color === 0 || color === 4) {
        const g = sample(row, x * CHANNELS[color]);
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = color === 4 ? sample(row, x * 2 + 1) : trns && rawSample(row, x) === trns.readUInt16BE(0) ? 0 : 255;
      } else {
        const n = CHANNELS[color];
        for (let k = 0; k < 3; k++) data[o + k] = sample(row, x * n + k);
        data[o + 3] = color === 6 ? sample(row, x * 4 + 3) : trns && [0, 1, 2].every((k) => rawSample(row, x * 3 + k) === trns.readUInt16BE(k * 2)) ? 0 : 255;
      }
    }
  }
  return { width, height, data };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** RGBA → PNG bytes (RGBA 8-bit; each row picks the filter with the smallest output). */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const out = Buffer.alloc((stride + 1) * height);
  const cand = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? data[row + x - 4] : 0;
        const b = y ? data[row - stride + x] : 0;
        const c = x >= 4 && y ? data[row - stride + x - 4] : 0;
        const v = data[row + x];
        const r = (f === 0 ? v : f === 1 ? v - a : f === 2 ? v - b : f === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, c)) & 255;
        cand[f][x] = r;
        sum += r < 128 ? r : 256 - r;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])));
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Resample to w×h. Each output pixel averages the source area it covers (sharp downscale, no
 * aliasing), with premultiplied alpha so transparent edges don't turn dark.
 */
export function resize(img, w, h) {
  const { width: sw, height: sh, data: src } = img;
  if (w === sw && h === sh) return { width: w, height: h, data: new Uint8Array(src) };
  const sx = sw / w;
  const sy = sh / h;
  const data = new Uint8Array(w * h * 4);
  // Weights of the source columns/rows each output column/row covers.
  const spans = (n, scale, max) =>
    Array.from({ length: n }, (_, i) => {
      // Upscaling: cover at least one source pixel around the centre (bilinear-like blocks).
      const c = (i + 0.5) * scale;
      const half = Math.max(scale, 1) / 2;
      const lo = Math.max(0, c - half);
      const hi = Math.min(max, c + half);
      const out = [];
      for (let s = Math.floor(lo); s < Math.ceil(hi); s++) {
        const wgt = Math.min(hi, s + 1) - Math.max(lo, s);
        if (wgt > 0) out.push([s, wgt]);
      }
      return out;
    });
  const cols = spans(w, sx, sw);
  const rows = spans(h, sy, sh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, total = 0;
      for (const [yy, wy] of rows[y]) {
        for (const [xx, wx] of cols[x]) {
          const k = wx * wy;
          const o = (yy * sw + xx) * 4;
          const al = src[o + 3] * k;
          r += src[o] * al;
          g += src[o + 1] * al;
          b += src[o + 2] * al;
          a += al;
          total += k;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        data[o] = Math.round(r / a);
        data[o + 1] = Math.round(g / a);
        data[o + 2] = Math.round(b / a);
      }
      data[o + 3] = Math.round(a / total);
    }
  }
  return { width: w, height: h, data };
}

/**
 * Fit into w×h keeping the aspect ratio: 'cover' fills and crops the overflow (centred),
 * 'contain' fits inside and pads with transparency.
 */
export function fit(img, w, h, mode = 'cover') {
  const scale = mode === 'cover' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const rw = Math.max(1, Math.round(img.width * scale));
  const rh = Math.max(1, Math.round(img.height * scale));
  const r = resize(img, rw, rh);
  const data = new Uint8Array(w * h * 4);
  const ox = Math.round((w - rw) / 2);
  const oy = Math.round((h - rh) / 2);
  for (let y = 0; y < h; y++) {
    const ry = y - oy;
    if (ry < 0 || ry >= rh) continue;
    for (let x = 0; x < w; x++) {
      const rx = x - ox;
      if (rx < 0 || rx >= rw) continue;
      const o = (y * w + x) * 4;
      const s = (ry * rw + rx) * 4;
      data[o] = r.data[s];
      data[o + 1] = r.data[s + 1];
      data[o + 2] = r.data[s + 2];
      data[o + 3] = r.data[s + 3];
    }
  }
  return { width: w, height: h, data };
}

/** How many distinct colours (capped) — a blank or single-colour screenshot has 1. */
export function colourCount(img, cap = 64) {
  const seen = new Set();
  const { data } = img;
  const step = Math.max(1, Math.floor(data.length / 4 / 20000)) * 4;
  for (let i = 0; i < data.length && seen.size < cap; i += step) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return seen.size;
}
