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

export function crc32js(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Native zlib.crc32 (Node ≥ 20.15 / 22.2), JS table otherwise. */
export const crc32 = typeof zlib.crc32 === 'function' ? (buf) => zlib.crc32(buf) >>> 0 : crc32js;

/** Already-compressed formats: deflate only burns time on them, so they are stored. */
export const STORED = /\.(png|webp|jpe?g|gif|avif|mp3|ogg|m4a|aac|mp4|webm|woff2?|gz|br|zip)$/i;

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (1 << 5) | 1; // 1980-01-01
const LIMIT = 0xffffffff;

/** Zip every file under dir (sorted, paths relative to dir) into outFile. `limit` exists for tests. */
export function zipDir(dir, outFile, { limit = LIMIT } = {}) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const fd = fs.openSync(outFile, 'w');
  let done = false;
  try {
    writeZip(fd, dir, limit);
    done = true;
  } finally {
    fs.closeSync(fd);
    if (!done) fs.rmSync(outFile, { force: true }); // never leave a truncated zip behind
  }
}

function writeZip(fd, dir, limit) {
  const tooBig = (what) => new GkError(`Gói quá lớn cho zip (${what} vượt giới hạn 4 GB, không hỗ trợ zip64) — chia nhỏ StreamingAssets hoặc bỏ --zip`);
  const put = (b) => {
    for (let o = 0; o < b.length; ) o += fs.writeSync(fd, b, o);
  };
  const central = [];
  let offset = 0;
  for (const rel of walk(dir)) {
    const abs = path.join(dir, rel);
    if (fs.statSync(abs).size > limit) throw tooBig(rel);
    const data = fs.readFileSync(abs);
    const deflated = STORED.test(rel) ? null : zlib.deflateRawSync(data, { level: 9 });
    const stored = !deflated || deflated.length >= data.length;
    const body = stored ? data : deflated;
    const name = Buffer.from(rel, 'utf8');
    const utf8 = /[^\x20-\x7e]/.test(rel);
    if (offset + 30 + name.length + body.length > limit) throw tooBig(rel);
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
    for (const b of [local, name, body]) put(b);

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
  if (offset + centralSize > limit) throw tooBig('mục lục zip');
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  put(Buffer.concat([...central, eocd]));
}
