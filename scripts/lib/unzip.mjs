// Minimal zip reader (no dependencies): stored or deflate, zip64, streams so large packages stay out of memory.
// Input is untrusted: names cannot leave the target folder, and size + CRC are checked against the central directory.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32 } from './zip.mjs';
import { GkError } from './log.mjs';

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX16 = 0xffff;
const MAX32 = 0xffffffff;

const read = (fd, position, length) => {
  const buf = Buffer.alloc(length);
  const n = fs.readSync(fd, buf, 0, length, position);
  return n === length ? buf : buf.subarray(0, n);
};

/** Where the central directory is, from the (zip64) end record. */
function locateCentral(fd, fileSize, file) {
  const tailLen = Math.min(fileSize, 22 + MAX16);
  const tailStart = fileSize - tailLen;
  const tail = read(fd, tailStart, tailLen);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new GkError(`${file}: không phải file ZIP/APK/XAPK`);
  const count = tail.readUInt16LE(at + 10);
  const size = tail.readUInt32LE(at + 12);
  const offset = tail.readUInt32LE(at + 16);
  if (count !== MAX16 && size !== MAX32 && offset !== MAX32) return { count, size, offset };

  const locator = read(fd, tailStart + at - 20, 20);
  if (locator.length < 20 || locator.readUInt32LE(0) !== ZIP64_LOCATOR) throw new GkError(`${file}: thiếu bản ghi zip64`);
  const rec = read(fd, Number(locator.readBigUInt64LE(8)), 56);
  if (rec.length < 56 || rec.readUInt32LE(0) !== ZIP64_EOCD) throw new GkError(`${file}: bản ghi zip64 hỏng`);
  return { count: Number(rec.readBigUInt64LE(32)), size: Number(rec.readBigUInt64LE(40)), offset: Number(rec.readBigUInt64LE(48)) };
}

/** Sizes and offset that don't fit 32 bits live in extra field 1, in this order. */
function applyZip64Extra(entry, extra) {
  for (let i = 0; i + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(i);
    const len = extra.readUInt16LE(i + 2);
    if (id === 1) {
      let p = i + 4;
      for (const k of ['size', 'compressedSize', 'localOffset']) {
        if (entry[k] === MAX32 && p + 8 <= i + 4 + len) {
          entry[k] = Number(extra.readBigUInt64LE(p));
          p += 8;
        }
      }
      return;
    }
    i += 4 + len;
  }
}

/** Every entry of the archive, from its central directory. */
export function listZip(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const fileSize = fs.fstatSync(fd).size;
    const { count, size, offset } = locateCentral(fd, fileSize, file);
    if (offset + size > fileSize) throw new GkError(`${file}: file ZIP bị cắt cụt`);
    const buf = read(fd, offset, size);
    const entries = [];
    let p = 0;
    for (let n = 0; n < count; n++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) throw new GkError(`${file}: danh mục ZIP hỏng`);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const entry = {
        name: buf.toString('utf8', p + 46, p + 46 + nameLen),
        method: buf.readUInt16LE(p + 10),
        crc: buf.readUInt32LE(p + 16),
        compressedSize: buf.readUInt32LE(p + 20),
        size: buf.readUInt32LE(p + 24),
        localOffset: buf.readUInt32LE(p + 42),
      };
      applyZip64Extra(entry, buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen));
      entries.push(entry);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

export const isZip = (file) => {
  const fd = fs.openSync(file, 'r');
  try {
    const head = read(fd, 0, 4);
    return head.length === 4 && head.readUInt32LE(0) === LOCAL;
  } finally {
    fs.closeSync(fd);
  }
};

/** Absolute target for an entry name, or null when the name would land outside dest. */
export function safeTarget(dest, name) {
  const clean = name.replace(/\\/g, '/');
  if (clean.startsWith('/') || /^[a-zA-Z]:/.test(clean) || clean.split('/').includes('..')) return null;
  const to = path.resolve(dest, clean);
  const rel = path.relative(path.resolve(dest), to);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? to : null;
}

async function extractEntry(file, entry, to) {
  const fd = fs.openSync(file, 'r');
  let start;
  try {
    const local = read(fd, entry.localOffset, 30);
    if (local.length < 30 || local.readUInt32LE(0) !== LOCAL) throw new Error('header hỏng');
    start = entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  } finally {
    fs.closeSync(fd);
  }
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`kiểu nén ${entry.method} chưa hỗ trợ`);

  let crc = 0;
  let written = 0;
  const check = new Transform({
    transform(chunk, _enc, done) {
      written += chunk.length;
      // Stop at the declared size: an entry cannot grow past what the directory promised.
      if (written > entry.size) return done(new Error('lớn hơn kích thước khai báo'));
      crc = crc32(chunk, crc);
      done(null, chunk);
    },
  });
  const source = entry.compressedSize ? fs.createReadStream(file, { start, end: start + entry.compressedSize - 1 }) : Readable.from([]);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const steps = entry.method === 8 ? [source, zlib.createInflateRaw(), check, fs.createWriteStream(to)] : [source, check, fs.createWriteStream(to)];
  try {
    await pipeline(steps);
    if (written !== entry.size) throw new Error('sai kích thước');
    if (crc !== entry.crc) throw new Error('sai CRC');
  } catch (e) {
    fs.rmSync(to, { force: true });
    throw e;
  }
}

/**
 * Extract the whole archive into dest. A bad entry is skipped and reported, so one odd file does not
 * cost the rest of the package. `maxBytes` caps what the directory declares, before anything is written.
 * Returns { files, problems } (names relative to dest).
 */
export async function extractZip(file, dest, { maxBytes = Infinity } = {}) {
  const entries = listZip(file).filter((e) => !e.name.endsWith('/'));
  const total = entries.reduce((n, e) => n + e.size, 0);
  if (total > maxBytes) throw new GkError(`${file}: giải nén cần ${(total / 2 ** 30).toFixed(1)} GB, vượt giới hạn ${(maxBytes / 2 ** 30).toFixed(1)} GB (đổi bằng --max-gb)`);
  const files = [];
  const problems = [];
  const seen = new Set();
  for (const entry of entries) {
    const to = safeTarget(dest, entry.name);
    if (!to) {
      problems.push(`${entry.name}: bỏ qua, đường dẫn ra ngoài thư mục giải nén`);
      continue;
    }
    // Windows folders ignore case; obfuscated resources may differ only by case.
    const key = to.toLowerCase();
    if (seen.has(key)) {
      problems.push(`${entry.name}: bỏ qua, trùng tên với file đã giải nén (không phân biệt hoa thường)`);
      continue;
    }
    seen.add(key);
    try {
      await extractEntry(file, entry, to);
      files.push(entry.name.replace(/\\/g, '/'));
    } catch (e) {
      problems.push(`${entry.name}: không giải nén được (${e.message})`);
    }
  }
  return { files, problems };
}
