// Minimal zip writer (no dependencies): deflate or store, "/" separators on every OS, UTF-8 names,
// fixed timestamps so the same folder always gives the same bytes. No zip64 — packages stay far below 4 GB.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { walk } from './io.mjs';
import { GkError } from './log.mjs';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (1 << 5) | 1; // 1980-01-01
const LIMIT = 0xffffffff;

/** Zip every file under dir (sorted, paths relative to dir) into outFile. */
export function zipDir(dir, outFile) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const rel of walk(dir)) {
    const data = fs.readFileSync(path.join(dir, rel));
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const name = Buffer.from(rel, 'utf8');
    const utf8 = /[^\x20-\x7e]/.test(rel);
    if (data.length > LIMIT || offset > LIMIT) throw new GkError(`${rel}: gói quá lớn cho zip (giới hạn 4 GB)`);
    const crc = crc32(data);
    const flags = utf8 ? 0x0800 : 0;
    const method = stored ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by: 2.0, MS-DOS attributes
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(flags, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    // extra, comment, disk start, internal attributes: 0
    entry.writeUInt32LE(0, 38); // external attributes
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + body.length;
  }
  const count = central.length / 2;
  if (count > 0xffff) throw new GkError(`Gói có ${count} file — vượt giới hạn zip (65535)`);
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([...locals, ...central, eocd]));
}

// ---------- Reading (gamekit recon): APK, XAPK, IPA, AAB, OBB… are zips ----------
// Reads only the central directory, so a multi-GB OBB costs a few reads. Zip64 supported.

/** Random-access source over a file on disk or a Buffer (an archive nested in another). */
export function zipSource(fileOrBuffer) {
  if (Buffer.isBuffer(fileOrBuffer)) {
    const buf = fileOrBuffer;
    return { size: buf.length, read: (pos, len) => buf.subarray(pos, pos + len), close() {} };
  }
  const fd = fs.openSync(fileOrBuffer, 'r');
  const size = fs.fstatSync(fd).size;
  return {
    size,
    read(pos, len) {
      const out = Buffer.alloc(Math.max(0, Math.min(len, size - pos)));
      fs.readSync(fd, out, 0, out.length, pos);
      return out;
    },
    close: () => fs.closeSync(fd),
  };
}

/** True when the bytes at the start look like a zip (local header or empty archive). */
export const looksLikeZip = (head) => head.length >= 4 && head.readUInt32LE(0) === 0x04034b50;

/** Entries of a zip: [{ name, size, compressedSize, method, offset }]. Throws on a broken archive. */
export function listZip(src) {
  const tailLen = Math.min(src.size, 22 + 0xffff);
  const tail = src.read(src.size - tailLen, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new GkError('không phải file zip hợp lệ (không thấy central directory)');
  let count = tail.readUInt16LE(e + 10);
  let cdSize = tail.readUInt32LE(e + 12);
  let cdOffset = tail.readUInt32LE(e + 16);
  if (count === 0xffff || cdSize === LIMIT || cdOffset === LIMIT) {
    const loc = e - 20; // zip64 end of central directory locator
    if (loc < 0 || tail.readUInt32LE(loc) !== 0x07064b50) throw new GkError('zip64 hỏng (thiếu locator)');
    const rec = src.read(Number(tail.readBigUInt64LE(loc + 8)), 56);
    if (rec.readUInt32LE(0) !== 0x06064b50) throw new GkError('zip64 hỏng (thiếu end record)');
    count = Number(rec.readBigUInt64LE(32));
    cdSize = Number(rec.readBigUInt64LE(40));
    cdOffset = Number(rec.readBigUInt64LE(48));
  }
  const cd = src.read(cdOffset, cdSize);
  const out = [];
  for (let p = 0, n = 0; n < count && p + 46 <= cd.length; n++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new GkError('central directory của zip hỏng');
    const method = cd.readUInt16LE(p + 10);
    let compressedSize = cd.readUInt32LE(p + 20);
    let size = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let offset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
    // zip64 extra field: only the values that overflowed are present, in this order.
    for (let x = p + 46 + nameLen, end = x + extraLen; x + 4 <= end; ) {
      const id = cd.readUInt16LE(x);
      const len = cd.readUInt16LE(x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        const next = () => {
          const v = Number(cd.readBigUInt64LE(q));
          q += 8;
          return v;
        };
        if (size === LIMIT) size = next();
        if (compressedSize === LIMIT) compressedSize = next();
        if (offset === LIMIT) offset = next();
      }
      x += 4 + len;
    }
    if (!name.endsWith('/')) out.push({ name, size, compressedSize, method, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Bytes of one entry (stored or deflate). `limit` caps how much is inflated (enough to sniff a header). */
export function readZipEntry(src, entry, { limit = Infinity } = {}) {
  const head = src.read(entry.offset, 30);
  if (head.readUInt32LE(0) !== 0x04034b50) throw new GkError(`${entry.name}: local header của zip hỏng`);
  const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  if (entry.method === 0) return src.read(start, Math.min(entry.size, limit));
  if (entry.method !== 8) throw new GkError(`${entry.name}: kiểu nén ${entry.method} chưa hỗ trợ`);
  if (limit >= entry.size) return zlib.inflateRawSync(src.read(start, entry.compressedSize));
  // Enough to sniff a header: deflate never shrinks below ~1 output byte per input byte, so
  // inflating the first `limit` compressed bytes (sync flush: no error on a cut stream) is plenty.
  return zlib.inflateRawSync(src.read(start, Math.min(entry.compressedSize, limit)), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).subarray(0, limit);
}
