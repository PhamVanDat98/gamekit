import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { decodePng, encodePng } from '../scripts/lib/png.mjs';
import { analyzeImage, checkAgainst, combineAnalyses, deltaE, fromHex, srgbToLab } from '../scripts/lib/style.mjs';
import { blob } from './helpers.mjs';

const close = (a, b, de = 3) => deltaE(srgbToLab(...fromHex(a)), srgbToLab(...fromHex(b))) < de;

test('png: encode → decode round trip; interlaced files are refused with a fix', () => {
  const img = blob({ size: 17 });
  const back = decodePng(encodePng(img.width, img.height, img.data));
  assert.deepEqual([back.width, back.height], [17, 17]);
  assert.ok(Buffer.from(back.data).equals(Buffer.from(img.data)));
  const png = Buffer.from(encodePng(2, 2, new Uint8Array(16)));
  png[8 + 8 + 12] = 1; // IHDR interlace byte
  assert.throws(() => decodePng(png), /interlace/);
  assert.throws(() => decodePng(zlib.deflateSync(Buffer.from('x'))), /không phải PNG/);
});

test('style: finds the exact palette, the outline colour and its thickness relative to the object', () => {
  const a = analyzeImage(blob());
  assert.equal(a.background, 'transparent');
  const hexes = a.palette.map((c) => c.hex);
  for (const want of ['#fff1d6', '#3b2a20', '#f5a25d']) assert.ok(hexes.some((h) => close(h, want)), `${want} trong ${hexes}`);
  assert.ok(a.flatness > 95);
  assert.equal(a.outline.present, true);
  assert.ok(close(a.outline.hex, '#3b2a20'));
  // 6 px ring on a 160 px tall blob = 3.75%
  assert.ok(Math.abs(a.outline.thicknessPct - 3.75) < 0.8, String(a.outline.thicknessPct));
  assert.ok(a.colour.warm > 90);
});

test('style: a flat background is removed (concept on white); no outline is reported as such', () => {
  const onWhite = analyzeImage(blob({ bg: '#ffffff' }));
  assert.equal(onWhite.background, '#ffffff');
  assert.equal(onWhite.outline.present, true);
  assert.ok(!onWhite.palette.some((c) => close(c.hex, '#ffffff', 2)), 'nền trắng không vào bảng màu');
  assert.equal(analyzeImage(blob({ line: 0 })).outline.present, false);
});

test('style check: a new shape in the same style passes; other colours, a thick or missing outline fail', () => {
  const style = combineAnalyses([analyzeImage(blob()), analyzeImage(blob({ size: 260 }))]);
  const ok = checkAgainst(style, analyzeImage(blob({ shape: 'box', size: 180 })));
  assert.deepEqual(ok.errors, [], JSON.stringify(ok));
  assert.ok(ok.metrics.paletteFit > 95);

  const recoloured = checkAgainst(style, analyzeImage(blob({ fill: '#3ad1c0', patch: '#1b4fd8', ink: '#0b2c6e' })));
  assert.match(recoloured.errors.join(), /bảng màu: .*màu lạ: #3ad1c0/);
  assert.ok(recoloured.warnings.some((w) => /tông/.test(w)));

  const thick = checkAgainst(style, analyzeImage(blob({ line: 16 })));
  assert.match(thick.errors.join(), /nét viền dày .*mảnh lại/);
  const bare = checkAgainst(style, analyzeImage(blob({ line: 0 })));
  assert.match(bare.errors.join(), /thiếu nét viền/);
});

test('style check: extraPalette lets an approved new colour in', () => {
  const style = combineAnalyses([analyzeImage(blob())]);
  const frog = analyzeImage(blob({ fill: '#7cc46a' }));
  assert.match(checkAgainst(style, frog).errors.join(), /màu lạ: #7cc46a/);
  style.extraPalette = [{ hex: '#7cc46a', why: 'da ếch' }];
  assert.deepEqual(checkAgainst(style, frog).errors, []);
});
