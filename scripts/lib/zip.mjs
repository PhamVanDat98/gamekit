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
