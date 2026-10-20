// Minimal zip reader (no dependencies) for APK / IPA / XAPK / zip builds: list entries, read one entry.
// Stored and deflate only; no zip64 (game archives above 4 GB are out of scope for recon).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GkError } from './log.mjs';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/** [{ name, size, csize, method, offset }] — directories left out. */
export function listZip(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const tailLen = Math.min(size, 0xffff + 22);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new GkError(`${file}: không phải file zip/apk hợp lệ`);
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff) throw new GkError(`${file}: zip64 chưa hỗ trợ — giải nén ra thư mục rồi chạy lại`);
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const out = [];
    for (let i = 0, off = 0; i < count && off + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(off) !== CEN_SIG) break;
      const method = cd.readUInt16LE(off + 10);
      const csize = cd.readUInt32LE(off + 20);
      const usize = cd.readUInt32LE(off + 24);
      const nameLen = cd.readUInt16LE(off + 28);
      const extraLen = cd.readUInt16LE(off + 30);
      const commentLen = cd.readUInt16LE(off + 32);
      const offset = cd.readUInt32LE(off + 42);
      const name = cd.toString('utf8', off + 46, off + 46 + nameLen);
      if (!name.endsWith('/')) out.push({ name, size: usize, csize, method, offset });
      off += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** Bytes of one entry (from listZip). `limit` reads only the first bytes of a stored entry. */
export function readZipEntry(file, entry, { limit = Infinity } = {}) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(30);
    fs.readSync(fd, head, 0, 30, entry.offset);
    if (head.readUInt32LE(0) !== LOC_SIG) throw new GkError(`${file}: hỏng ở ${entry.name}`);
    const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const n = entry.method === 0 ? Math.min(entry.csize, limit) : entry.csize;
    const data = Buffer.alloc(n);
    fs.readSync(fd, data, 0, n, start);
    if (entry.method === 0) return data;
    if (entry.method === 8) {
      const out = zlib.inflateRawSync(data);
      return limit < out.length ? out.subarray(0, limit) : out;
    }
    throw new GkError(`${entry.name}: kiểu nén ${entry.method} chưa hỗ trợ`);
  } finally {
    fs.closeSync(fd);
  }
}

export const ARCHIVE_RE = /\.(apk|aab|xapk|apks|ipa|zip|jar)$/i;
