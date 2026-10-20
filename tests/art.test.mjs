import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeArt, bleed, checkArt, halo, seamless } from '../scripts/lib/art.mjs';
import { detailFactor, nineSlice, overview, resize, reviewSet } from '../scripts/lib/cohesion.mjs';
import { blob } from './helpers.mjs';

// ---------- test art, every answer known ----------
const img = (w, h, fn) => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
};
const INK = [59, 42, 32, 255];
/** Periodic pattern: wraps perfectly. */
const tileImg = (size = 64, a = [124, 170, 96, 255], b = [96, 140, 70, 255]) =>
  img(size, size, (x, y) => ((Math.sin((2 * Math.PI * x) / size * 2) + Math.cos((2 * Math.PI * y) / size * 3)) > 0.8 ? b : a));
/** Rounded panel: 4 px outline, header band, plain body. */
function panel(w = 96, h = 96, r = 14) {
  return img(w, h, (x, y) => {
    const cx = Math.min(Math.max(x + 0.5, r), w - r);
    const cy = Math.min(Math.max(y + 0.5, r), h - r);
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r) return [0, 0, 0, 0];
    const fromEdge = Math.min(x, y, w - 1 - x, h - 1 - y, r - d);
    if (fromEdge < 4) return INK;
    return y < 20 ? [245, 162, 93, 255] : [255, 241, 214, 255];
  });
}
/** Three frames of a blob with transparent gutters. */
function sheet() {
  const f = blob({ size: 40 });
  return img(120, 40, (x, y) => [...f.data.subarray((y * 40 + (x % 40)) * 4, (y * 40 + (x % 40)) * 4 + 4)]);
}
const enlarge = (src, k) => img(src.width * k, src.height * k, (x, y) => [...src.data.subarray((Math.floor(y / k) * src.width + Math.floor(x / k)) * 4, (Math.floor(y / k) * src.width + Math.floor(x / k)) * 4 + 4)]);

test('art: tells a tile, a looping background, a 9-slice panel, a 3-slice bar, a sheet and pixel art apart', () => {
  const t = analyzeArt(tileImg());
  assert.equal(t.suggest.kind, 'tile');
  assert.equal(t.suggest.seamless, true);

  const hills = img(256, 96, (x, y) => (y > 60 + 12 * Math.sin((2 * Math.PI * x) / 256 * 2) ? [170, 200, 160, 255] : [196, 222, 236, 255]));
  assert.equal(analyzeArt(hills).suggest.seamless, 'x');
  const broken = img(256, 96, (x, y) => (x > 230 ? [120, 90, 140, 255] : y > 60 ? [170, 200, 160, 255] : [196, 222, 236, 255]));
  assert.equal(analyzeArt(broken).suggest.seamless, undefined);

  const p = analyzeArt(panel());
  assert.equal(p.suggest.kind, 'ui');
  // From column 11 the rounded corner already reaches the edge: the smallest safe insets.
  assert.deepEqual(p.suggest.nineSlice, [11, 20, 11, 11]);
  assert.match(p.techniques[0], /9-slice/);

  const bar = img(120, 24, (x, y) => {
    const r = 12;
    const cx = Math.min(Math.max(x + 0.5, r), 120 - r);
    return Math.hypot(x + 0.5 - cx, y + 0.5 - 12) > r ? [0, 0, 0, 0] : Math.hypot(x + 0.5 - cx, y + 0.5 - 12) > r - 3 ? INK : [245, 162, 93, 255];
  });
  assert.match(analyzeArt(bar).techniques[0], /3-slice ngang/);

  const s = analyzeArt(sheet());
  assert.deepEqual(s.suggest.frames, { count: 3, width: 40, height: 40, fps: 12 });

  // A round sprite is not a 9-slice even though the top of a circle has a short flat run.
  assert.equal(analyzeArt(blob({ size: 48 })).suggest.kind, 'sprite');

  const px = analyzeArt(enlarge(blob({ size: 16, line: 2 }), 4));
  assert.equal(px.suggest.pixelArt, true);
  assert.equal(px.suggest.kind, 'sprite');
  assert.ok(px.notes.some((n) => /lưu ở ×1 \(16×16\)/.test(n.msg)));
});

test('art check: declared techniques must work — seams, patterned 9-slice centres, touching frames, size limits', () => {
  const broken = img(64, 64, (x) => (x > 56 ? [200, 60, 60, 255] : [124, 170, 96, 255]));
  assert.match(checkArt({ seamless: true }, broken).errors.join(), /lặp ngang .*đường nối/);
  assert.deepEqual(checkArt({ seamless: true }, tileImg()).errors, []);

  assert.deepEqual(checkArt({ nineSlice: [14, 20, 14, 14] }, panel()), { errors: [], warnings: [] });
  // Insets that cut into the header band put pattern in the stretch zone.
  assert.match(checkArt({ nineSlice: [14, 10, 14, 14] }, panel()).warnings.join(), /vùng kéo dọc .*hoạ tiết/);
  assert.match(checkArt({ nineSlice: [60, 10, 60, 10] }, panel()).errors.join(), /lớn hơn ảnh/);

  const touching = img(80, 20, (x) => (x >= 30 && x < 50 ? [10, 10, 10, 255] : [0, 0, 0, 0]));
  assert.match(checkArt({ frames: { count: 2, width: 40, height: 20, fps: 12 } }, touching).warnings.join(), /khung 1 và 2 chạm nhau/);

  const huge = { width: 5000, height: 10, data: new Uint8Array(5000 * 10 * 4) };
  assert.match(checkArt({}, huge).errors.join(), /> 4096/);
});

test('art bleed: transparent pixels take the nearest visible colour, nothing visible changes', () => {
  const b = blob({ size: 40, line: 0 }); // light shape on transparent black: the case that darkens
  assert.ok(halo(b) > 0.9);
  const fixed = bleed(b);
  assert.equal(halo(fixed), 0);
  for (let i = 0; i < b.data.length; i += 4) {
    assert.equal(fixed.data[i + 3], b.data[i + 3]);
    if (b.data[i + 3]) assert.deepEqual([...fixed.data.subarray(i, i + 3)], [...b.data.subarray(i, i + 3)]);
  }
});

test('cohesion: blur is measured on edges, so flat art is sharp and enlarged art is not', () => {
  assert.equal(detailFactor(blob({ size: 160 })), 1);
  assert.equal(detailFactor(tileImg(128)), 1);
  const soft = resize(resize(blob({ size: 160 }), 40, 40), 160, 160);
  assert.ok(detailFactor(soft) >= 2);
});

test('cohesion review: finds the asset that does not belong — blurry, thick outline, pixel edges, tile borders', () => {
  const sprite = (id, im, display = [im.width, im.height]) => ({ id, kind: 'sprite', img: im, display, entry: null });
  const items = [
    sprite('hero', blob({ size: 160, line: 5 })),
    sprite('friend', blob({ size: 120, line: 4, shape: 'box' })),
    sprite('coin', blob({ size: 60, line: 2 })),
    sprite('blurry', resize(resize(blob({ size: 160, line: 5 }), 40, 40), 160, 160)),
    sprite('fat-line', blob({ size: 120, line: 18 })),
    { id: 'grass', kind: 'tile', img: tileImg(64), display: [64, 64], entry: { seamless: true } },
    { id: 'cave', kind: 'tile', img: tileImg(64, [70, 50, 90, 255], [60, 40, 80, 255]), display: [64, 64], entry: { seamless: true } },
  ];
  const { issues, summary, rows } = reviewSet(items);
  const about = (id) => issues.filter((i) => i.id === id).map((i) => i.msg).join(' | ');
  assert.match(about('blurry'), /mờ|kém nét/);
  assert.match(about('fat-line'), /nét viền trên màn hình .* dày hơn hẳn/);
  assert.equal(about('hero'), '');
  assert.match(about('cave + grass') || about('grass + cave'), /lộ ranh giới/);
  assert.equal(summary.errors, 0);
  // The overview holds every asset at display size and stays a sane size.
  const pic = overview(rows);
  assert.equal(pic.width, 1600);
  assert.ok(pic.height > 200 && pic.height < 3000);
});

test('cohesion: 9-slice rendering keeps corners and stretches the middle', () => {
  const big = nineSlice(panel(), [14, 20, 14, 14], 200, 120);
  assert.deepEqual([big.width, big.height], [200, 120]);
  // Corner pixel (transparent, outside the rounding) and header colour survive the stretch.
  assert.equal(big.data[3], 0);
  const at = (x, y) => [...big.data.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 3)];
  assert.deepEqual(at(100, 10), [245, 162, 93]);
  assert.deepEqual(at(100, 80), [255, 241, 214]);
});
