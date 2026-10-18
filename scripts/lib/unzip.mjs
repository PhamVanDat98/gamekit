// List the entries of a zip-format archive (APK, IPA, AAB, XAPK, ZIP) from its central directory, without extracting.
// Reads only the tail of the file and the directory itself, so multi-GB builds are cheap. Zip64 supported.
import fs from 'node:fs';
import { GkError } from './log.mjs';

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const MAX = 0xffffffff;

function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, pos);
  return buf.subarray(0, n);
}

/** [{ name, size, compressedSize, crc32, method }] — directories (names ending in "/") left out. */
export function listZip(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const total = fs.fstatSync(fd).size;
    const tailLen = Math.min(total, 22 + 0xffff);
    const tail = readAt(fd, total - tailLen, tailLen);
    let at = -1;
    for (let i = tail.length - 22; i >= 0 && at < 0; i--) if (tail.readUInt32LE(i) === EOCD) at = i;
    if (at < 0) throw new GkError(`${file}: không phải file zip (APK/IPA/ZIP) hợp lệ`);
    let count = tail.readUInt16LE(at + 10);
    let cdSize = tail.readUInt32LE(at + 12);
    let cdOffset = tail.readUInt32LE(at + 16);
    if (cdOffset === MAX || cdSize === MAX || count === 0xffff) {
      const loc = at - 20;
      if (loc < 0 || tail.readUInt32LE(loc) !== ZIP64_LOCATOR) throw new GkError(`${file}: zip64 thiếu locator`);
      const rec = readAt(fd, Number(tail.readBigUInt64LE(loc + 8)), 56);
      if (rec.readUInt32LE(0) !== ZIP64_EOCD) throw new GkError(`${file}: zip64 hỏng`);
      count = Number(rec.readBigUInt64LE(32));
      cdSize = Number(rec.readBigUInt64LE(40));
      cdOffset = Number(rec.readBigUInt64LE(48));
    }
    const cd = readAt(fd, cdOffset, cdSize);
    const out = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== CENTRAL) throw new GkError(`${file}: mục lục zip hỏng`);
      const method = cd.readUInt16LE(p + 10);
      const crc = cd.readUInt32LE(p + 16);
      let compressedSize = cd.readUInt32LE(p + 20);
      let size = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
      // Zip64 extra field (0x0001) carries the sizes that did not fit, in this order.
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = cd.readUInt16LE(e);
        const len = cd.readUInt16LE(e + 2);
        if (id === 1) {
          let q = e + 4;
          if (size === MAX) {
            size = Number(cd.readBigUInt64LE(q));
            q += 8;
          }
          if (compressedSize === MAX) compressedSize = Number(cd.readBigUInt64LE(q));
        }
        e += 4 + len;
      }
      if (!name.endsWith('/')) out.push({ name, size, compressedSize, crc32: crc, method });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}
