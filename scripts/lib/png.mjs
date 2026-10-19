import fs from 'node:fs';
import zlib from 'node:zlib';
import { crc32 } from './zip.mjs';

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

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Decode a non-interlaced PNG (8/16-bit, or 1/2/4/8-bit palette) into 8-bit RGBA.
 * Returns { width, height, data: Uint8Array(width*height*4) }.
 */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('không phải file PNG');
  let width, height, depth, type, interlace, palette, trns;
  const idat = [];
  for (let p = 8; p + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      [depth, type] = [data[8], data[9]];
      interlace = data[12];
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (!width) throw new Error('PNG thiếu IHDR');
  if (interlace) throw new Error('PNG interlaced chưa hỗ trợ — lưu lại ảnh ở chế độ non-interlaced');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels || (type === 3 ? ![1, 2, 4, 8].includes(depth) : ![8, 16].includes(depth))) {
    throw new Error(`PNG kiểu màu ${type}, ${depth}-bit chưa hỗ trợ — lưu lại ảnh RGB/RGBA 8-bit`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (channels * depth) >> 3); // bytes per pixel for filtering
  const stride = Math.ceil((width * channels * depth) / 8);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[out + x - bpp] : 0;
      const b = y ? pixels[out + x - stride] : 0;
      const c = x >= bpp && y ? pixels[out + x - stride - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[out + x] = v & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  const step = depth === 16 ? 2 : 1; // 16-bit: keep the high byte
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (type === 3) {
        const bit = x * depth;
        const i = (pixels[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        data[o] = palette[i * 3];
        data[o + 1] = palette[i * 3 + 1];
        data[o + 2] = palette[i * 3 + 2];
        data[o + 3] = trns && i < trns.length ? trns[i] : 255;
        continue;
      }
      const s = row + x * channels * step;
      const ch = (k) => pixels[s + k * step];
      if (type === 0 || type === 4) {
        data[o] = data[o + 1] = data[o + 2] = ch(0);
        data[o + 3] = type === 4 ? ch(1) : 255;
      } else {
        data[o] = ch(0);
        data[o + 1] = ch(1);
        data[o + 2] = ch(2);
        data[o + 3] = type === 6 ? ch(3) : 255;
      }
    }
  }
  return { width, height, data };
}

/** Encode 8-bit RGBA pixels as PNG; drops the alpha channel when every pixel is opaque. */
export function encodePng({ width, height, data }) {
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break; }
  const ch = opaque ? 3 : 4;
  const stride = width * ch;
  const rows = Buffer.alloc(stride * height);
  for (let i = 0, o = 0; i < data.length; i += 4) {
    rows[o++] = data[i];
    rows[o++] = data[i + 1];
    rows[o++] = data[i + 2];
    if (!opaque) rows[o++] = data[i + 3];
  }
  // Per row, keep the filter (none/sub/up/paeth) with the smallest sum of residuals.
  const out = Buffer.alloc((stride + 1) * height);
  const cand = [0, 1, 2, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const r = y * stride;
    let best = 0, bestSum = Infinity;
    [0, 1, 2, 4].forEach((f, k) => {
      const buf = cand[k];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? rows[r + x - ch] : 0;
        const b = y ? rows[r + x - stride] : 0;
        const c = x >= ch && y ? rows[r + x - stride - ch] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 4) {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (rows[r + x] - pred) & 255;
        buf[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) [best, bestSum] = [k, sum];
    });
    out[y * (stride + 1)] = [0, 1, 2, 4][best];
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}
