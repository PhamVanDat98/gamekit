import fs from 'node:fs';

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
