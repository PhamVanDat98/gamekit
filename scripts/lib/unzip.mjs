// Minimal zip reader (no dependencies): list entries and read one, without loading the whole archive —
// APK/IPA/OBB files can be gigabytes. Store and deflate; zip64 sizes and offsets.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GkError } from './log.mjs';

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const LOC64 = 0x07064b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;
const MAX = 0xffffffff;

function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  // One readSync returns at most ~2 GB on Linux: loop until done or end of file.
  let n = 0;
  while (n < len) {
    const got = fs.readSync(fd, buf, n, Math.min(len - n, 1 << 30), pos + n);
    if (!got) break;
    n += got;
  }
  return buf.subarray(0, n);
}

/** [{ name, size, compressedSize, method, offset }] in archive order. */
export function listZip(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const total = fs.fstatSync(fd).size;
    const tailLen = Math.min(total, 65557);
    const tail = readAt(fd, total - tailLen, tailLen);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === EOCD) {
      e = i;
      break;
    }
    if (e < 0) throw new GkError(`${file}: không phải file zip/apk`);
    let count = tail.readUInt16LE(e + 10);
    let size = tail.readUInt32LE(e + 12);
    let start = tail.readUInt32LE(e + 16);
    if ((count === 0xffff || size === MAX || start === MAX) && e >= 20 && tail.readUInt32LE(e - 20) === LOC64) {
      const rec = readAt(fd, Number(tail.readBigUInt64LE(e - 20 + 8)), 56);
      if (rec.readUInt32LE(0) !== EOCD64) throw new GkError(`${file}: zip64 hỏng`);
      count = Number(rec.readBigUInt64LE(32));
      size = Number(rec.readBigUInt64LE(40));
      start = Number(rec.readBigUInt64LE(48));
    }
    const cd = readAt(fd, start, size);
    const out = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== CEN) throw new GkError(`${file}: central directory hỏng`);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const entry = {
        name: cd.toString('utf8', p + 46, p + 46 + nameLen),
        method: cd.readUInt16LE(p + 10),
        compressedSize: cd.readUInt32LE(p + 20),
        size: cd.readUInt32LE(p + 24),
        offset: cd.readUInt32LE(p + 42),
      };
      // zip64 extra field (0x0001) holds the values that overflowed, in this order.
      const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
      for (let x = 0; x + 4 <= extra.length; ) {
        const id = extra.readUInt16LE(x);
        const len = extra.readUInt16LE(x + 2);
        if (id === 1) {
          let q = x + 4;
          for (const k of ['size', 'compressedSize', 'offset'])
            if (entry[k] === MAX) {
              entry[k] = Number(extra.readBigUInt64LE(q));
              q += 8;
            }
        }
        x += 4 + len;
      }
      out.push(entry);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** Bytes of one entry (from listZip). Refuses entries above `limit` bytes so a scan stays cheap. */
export function readZipEntry(file, entry, { limit = 64 * 1024 * 1024 } = {}) {
  if (entry.size > limit) throw new GkError(`${entry.name}: ${entry.size} byte, vượt giới hạn đọc ${limit}`);
  const fd = fs.openSync(file, 'r');
  try {
    const head = readAt(fd, entry.offset, 30);
    if (head.readUInt32LE(0) !== LOC) throw new GkError(`${entry.name}: local header hỏng`);
    const data = readAt(fd, entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28), entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, entry.size) });
    throw new GkError(`${entry.name}: kiểu nén ${entry.method} chưa hỗ trợ`);
  } finally {
    fs.closeSync(fd);
  }
}
