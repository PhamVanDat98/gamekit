import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { tmpDir, write, solidPng } from './helpers.mjs';
import { decodePng, encodePng, resize, fit, colourCount } from '../scripts/lib/png.mjs';
import { zipDir } from '../scripts/lib/zip.mjs';
import { listZip, readZipEntry } from '../scripts/lib/unzip.mjs';

const img = (w, h, f) => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
};

test('png: encode → decode round-trips RGBA exactly', () => {
  const a = img(13, 7, (x, y) => [x * 19, y * 33, (x * y) & 255, (x + y) * 10]);
  const b = decodePng(encodePng(a));
  assert.equal(b.width, 13);
  assert.equal(b.height, 7);
  assert.deepEqual(Buffer.from(b.data), Buffer.from(a.data));
  assert.deepEqual([...decodePng(solidPng(3, 2, [1, 2, 3, 4])).data.subarray(0, 4)], [1, 2, 3, 4]);
});

test('png: decodes palette with tRNS and 1-bit gray', () => {
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]); // CRC is not checked
  };
  const png = (depth, color, rows, extra = []) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(4, 0);
    ihdr.writeUInt32BE(rows.length, 4);
    ihdr[8] = depth;
    ihdr[9] = color;
    const raw = Buffer.concat(rows.map((r) => Buffer.from([0, ...r])));
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...extra, chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  };
  const pal = decodePng(png(2, 3, [[0b00011011]], [chunk('PLTE', Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9])), chunk('tRNS', Buffer.from([0, 128]))]));
  assert.deepEqual([...pal.data], [255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255, 9, 9, 9, 255]);
  const bw = decodePng(png(1, 0, [[0b10100000]]));
  assert.deepEqual([...bw.data].filter((_, i) => i % 4 === 0), [255, 0, 255, 0]);
});

test('png: resize averages areas with premultiplied alpha; fit covers or pads', () => {
  const checker = img(4, 4, (x, y) => ((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  assert.deepEqual([...resize(checker, 2, 2).data.subarray(0, 4)], [128, 128, 128, 255]);
  // A transparent black pixel next to an opaque red one must not darken the red.
  const edge = img(2, 1, (x) => (x ? [255, 0, 0, 255] : [0, 0, 0, 0]));
  assert.deepEqual([...resize(edge, 1, 1).data], [255, 0, 0, 128]);
  const wide = img(20, 10, () => [10, 20, 30, 255]);
  const cover = fit(wide, 10, 10, 'cover');
  assert.equal(cover.data[3], 255);
  const contain = fit(wide, 10, 10, 'contain');
  assert.equal(contain.data[3], 0, 'contain pads with transparency');
  assert.equal(contain.data[(5 * 10 + 5) * 4 + 3], 255);
  assert.equal(colourCount(wide), 1);
  assert.equal(colourCount(checker), 2);
});

test('unzip: lists and reads entries written by zipDir', () => {
  const dir = tmpDir();
  write(dir, 'src/lib/arm64-v8a/libil2cpp.so', 'x'.repeat(5000));
  write(dir, 'src/assets/bin/Data/Managed/Metadata/global-metadata.dat', 'meta');
  zipDir(path.join(dir, 'src'), path.join(dir, 'a.apk'));
  const entries = listZip(path.join(dir, 'a.apk'));
  assert.deepEqual(entries.map((e) => e.name), ['assets/bin/Data/Managed/Metadata/global-metadata.dat', 'lib/arm64-v8a/libil2cpp.so']);
  assert.equal(readZipEntry(path.join(dir, 'a.apk'), entries[1]).toString(), 'x'.repeat(5000));
  assert.throws(() => readZipEntry(path.join(dir, 'a.apk'), entries[1], { limit: 10 }), /giới hạn/);
  fs.writeFileSync(path.join(dir, 'no.zip'), 'nope');
  assert.throws(() => listZip(path.join(dir, 'no.zip')), /không phải file zip/);
});
