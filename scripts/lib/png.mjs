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

// ---------- full decode / encode (style analysis needs the pixels) ----------

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Decode a PNG into 8-bit RGBA: { width, height, data }. Every colour type and bit depth of the
 * spec; interlaced (Adam7) files are refused with a clear message (re-save them non-interlaced).
 */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('không phải PNG');
  let pos = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('PNG thiếu IHDR');
  const { width, height, depth, color, interlace } = ihdr;
  if (interlace) throw new Error('PNG interlaced (Adam7) chưa hỗ trợ — lưu lại ảnh dạng không interlace');
  const channels = CHANNELS[color];
  if (!channels) throw new Error(`PNG color type ${color} lạ`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const lines = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = lines.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
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
      out[i] = v & 255;
    }
    prev = out;
  }
  const sample = (y, i) => {
    // i-th sample of row y, scaled to 0..255
    if (depth === 8) return lines[y * stride + i];
    if (depth === 16) return lines[y * stride + i * 2];
    const bit = i * depth;
    const v = (lines[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return color === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      if (color === 3) {
        const idx = sample(y, s);
        data.set([palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255], o);
      } else if (color === 0 || color === 4) {
        const g = sample(y, s);
        data.set([g, g, g, color === 4 ? sample(y, s + 1) : 255], o);
      } else {
        data.set([sample(y, s), sample(y, s + 1), sample(y, s + 2), color === 6 ? sample(y, s + 3) : 255], o);
      }
    }
  return { width, height, data };
}

/** 8-bit RGBA → PNG buffer. */
export function encodePng(width, height, data) {
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
