// How an image is meant to be used in a game: seamless tile, 9-slice / 3-slice panel, sprite sheet,
// pixel art, plain sprite — and the technical faults that break it (seams, halos, oversize).
// Pure functions on 8-bit RGBA ({ width, height, data }); see skills/asset-spec.

export const LIMITS = { maxSide: 4096, safeSide: 2048 }; // largest texture any device takes / every device takes
const SAME = 3; // mean channel difference below which a band counts as plain (used on declared slices)
const PIXEL_DIFF = 8; // a pixel differs from its neighbour above this channel difference (JPEG noise stays below)
const ALPHA_ON = 128;

const at = (img, x, y) => (y * img.width + x) * 4;

/** Mean max-channel difference between two columns (or rows), alpha included. */
function lineDiff(img, a, b, vertical) {
  const n = vertical ? img.height : img.width;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p = vertical ? at(img, a, i) : at(img, i, a);
    const q = vertical ? at(img, b, i) : at(img, i, b);
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(img.data[p + c] - img.data[q + c]));
    sum += d;
  }
  return sum / n;
}

/**
 * Are two columns (rows) the same for stretching? Almost no pixel may differ: a single hill crest
 * or dot in the band would smear when stretched, even though the column average barely moves.
 */
function lineSame(img, a, b, vertical) {
  const n = vertical ? img.height : img.width;
  let off = 0;
  for (let i = 0; i < n; i++) {
    const p = vertical ? at(img, a, i) : at(img, i, a);
    const q = vertical ? at(img, b, i) : at(img, i, b);
    for (let c = 0; c < 4; c++)
      if (Math.abs(img.data[p + c] - img.data[q + c]) > PIXEL_DIFF) {
        off++;
        break;
      }
  }
  return off <= n * 0.005;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

/** Opaque share and the bounding box of visible pixels (padding = empty margin on each side). */
export function coverage(img) {
  let opaque = 0;
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const a = img.data[at(img, x, y) + 3];
      if (a >= ALPHA_ON) opaque++;
      if (a > 0) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  const empty = x1 < 0;
  return {
    opaque: opaque / (img.width * img.height),
    bounds: empty ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1],
    padding: empty ? null : [x0, y0, img.width - 1 - x1, img.height - 1 - y1],
  };
}

/**
 * Does it wrap without a visible seam? Compares the last column with the first (and row) against
 * how much neighbouring columns differ inside the image: a seam is a jump bigger than the texture's own.
 */
export function seamless(img) {
  const opaqueEdge = (vertical) => {
    const n = vertical ? img.height : img.width;
    const last = (vertical ? img.width : img.height) - 1;
    for (let i = 0; i < n; i++)
      for (const e of [0, last]) if (img.data[(vertical ? at(img, e, i) : at(img, i, e)) + 3] < 250) return false;
    return true;
  };
  const check = (vertical) => {
    const n = vertical ? img.width : img.height;
    // A tile is solid up to its edges; a panel or a capsule with mirrored ends is not a tile.
    if (n < 4 || !opaqueEdge(vertical)) return { ok: false, edge: 0, inside: 0 };
    const step = Math.max(1, Math.floor(n / 64));
    const inside = [];
    for (let i = 0; i + 1 < n; i += step) inside.push(lineDiff(img, i, i + 1, vertical));
    const base = median(inside);
    const edge = lineDiff(img, n - 1, 0, vertical);
    return { ok: edge <= Math.max(6, base * 2.5), edge: Math.round(edge), inside: Math.round(base) };
  };
  return { x: check(true), y: check(false) };
}

/**
 * The stretchable band: the longest run of identical neighbouring columns (rows). Stretching or
 * repeating inside it changes nothing; outside it are the corners/caps that must keep their size.
 */
export function stretchBand(img, vertical) {
  const n = vertical ? img.width : img.height;
  let best = null;
  let start = null;
  for (let i = 0; i + 1 < n; i++) {
    if (lineSame(img, i, i + 1, vertical)) {
      if (start == null) start = i;
      const len = i + 2 - start;
      if (!best || len > best.len) best = { from: start, to: i + 1, len };
    } else start = null;
  }
  if (!best || best.len < Math.max(8, n * 0.3)) return null; // a real stretch zone, not the flat top of a circle
  const whole = best.len >= n - 1;
  const inset = [best.from, n - 1 - best.to];
  // A slice has a cap on both sides; a plain band running off one edge (sky over hills) is not one.
  if (!whole && (inset[0] < 2 || inset[1] < 2)) return null;
  return { from: best.from, to: best.to, inset, whole };
}

/**
 * Frames separated by fully transparent gutters, evenly spaced. Returns { count, width } per
 * axis, or null. (Sheets packed edge to edge have no gutters: declare their frames by hand.)
 */
export function sheetGrid(img) {
  const runs = (vertical) => {
    const n = vertical ? img.width : img.height;
    const m = vertical ? img.height : img.width;
    const out = [];
    let start = null;
    for (let i = 0; i < n; i++) {
      let empty = true;
      for (let j = 0; j < m && empty; j++) if (img.data[(vertical ? at(img, i, j) : at(img, j, i)) + 3] > 8) empty = false;
      if (!empty && start == null) start = i;
      if (empty && start != null) {
        out.push([start, i - 1]);
        start = null;
      }
    }
    if (start != null) out.push([start, n - 1]);
    return out;
  };
  const axis = (vertical) => {
    const r = runs(vertical);
    if (r.length < 2) return null;
    const n = vertical ? img.width : img.height;
    const cell = n / r.length;
    // Each run must sit inside its own equal cell.
    const fits = r.every(([a, b], i) => a >= Math.floor(i * cell) && b < Math.ceil((i + 1) * cell));
    return fits && Number.isInteger(cell) ? { count: r.length, size: cell } : fits ? { count: r.length, size: cell, uneven: true } : null;
  };
  const cols = axis(true);
  const rows = axis(false);
  if (!cols && !rows) return null;
  return { cols: cols?.count ?? 1, rows: rows?.count ?? 1, width: cols ? cols.size : img.width, height: rows ? rows.size : img.height, uneven: !!(cols?.uneven || rows?.uneven) };
}

/** Pixel art saved enlarged: every k×k block one colour. Returns k (1 = not enlarged). */
export function pixelScale(img) {
  for (const k of [8, 6, 5, 4, 3, 2]) {
    if (img.width % k || img.height % k) continue;
    let ok = true;
    const step = Math.max(1, Math.floor(img.width / k / 48));
    for (let by = 0; by < img.height / k && ok; by += step)
      for (let bx = 0; bx < img.width / k && ok; bx += step) {
        const o = at(img, bx * k, by * k);
        for (let y = 0; y < k && ok; y++)
          for (let x = 0; x < k && ok; x++) {
            const p = at(img, bx * k + x, by * k + y);
            for (let c = 0; c < 4; c++) if (img.data[p + c] !== img.data[o + c]) ok = false;
          }
      }
    if (ok) return k;
  }
  return 1;
}

/**
 * Halo risk: fully transparent pixels next to the shape whose hidden colour is far from the
 * shape's (usually black). Scaling/filtering blends that colour in → dark (or white) fringes.
 */
export function halo(img) {
  let edge = 0;
  let dirty = 0;
  const { width, height, data } = img;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = at(img, x, y);
      if (data[p + 3] !== 0) continue;
      let nb = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = at(img, nx, ny);
        if (data[q + 3] >= ALPHA_ON) nb = q;
      }
      if (nb == null) continue;
      edge++;
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(data[p + c] - data[nb + c]));
      if (d > 96) dirty++;
    }
  return edge ? dirty / edge : 0;
}

/** Size rules: texture limits, odd sizes (blurry at half scale), power of two (atlases, mipmaps). */
export function sizeNotes({ width, height }) {
  const notes = [];
  const side = Math.max(width, height);
  if (side > LIMITS.maxSide) notes.push({ level: 'error', msg: `${width}×${height}: cạnh > ${LIMITS.maxSide} px — nhiều máy không nạp được texture này; chia nhỏ hoặc giảm` });
  else if (side > LIMITS.safeSide) notes.push({ level: 'warn', msg: `${width}×${height}: cạnh > ${LIMITS.safeSide} px — máy yếu có thể không nạp được; ≤ ${LIMITS.safeSide} là an toàn mọi nơi` });
  if (width % 2 || height % 2) notes.push({ level: 'info', msg: `${width}×${height} lẻ — nếu là ảnh @2x, hiện ở @1x thì mép rơi vào nửa pixel (hơi nhoè): ảnh @2x nên có kích thước chẵn` });
  return notes;
}

const isPot = (n) => n > 0 && (n & (n - 1)) === 0;

/** Everything we can tell about how this image is used, plus a suggested asset-manifest entry. */
export function analyzeArt(source) {
  let img = source;
  const cov = coverage(img);
  const notes = sizeNotes(img);
  const techniques = [];
  const suggest = { width: img.width, height: img.height, alpha: cov.opaque < 0.999 };
  const k = pixelScale(img);
  if (k > 1) {
    techniques.push(`pixel art phóng ×${k}`);
    notes.push({ level: 'warn', msg: `pixel art lưu ở ×${k}: lưu ở ×1 (${img.width / k}×${img.height / k}) và phóng số nguyên lúc vẽ (imageSmoothingEnabled = false) — nhẹ hơn ${k * k} lần` });
    suggest.pixelArt = true;
  }
  // Pixel art saved enlarged: find its techniques on the 1× image (k identical columns are not a slice).
  if (k > 1) {
    const small = { width: img.width / k, height: img.height / k, data: new Uint8Array((img.width / k) * (img.height / k) * 4) };
    for (let y = 0; y < small.height; y++)
      for (let x = 0; x < small.width; x++) small.data.set(img.data.subarray(at(img, x * k, y * k), at(img, x * k, y * k) + 4), (y * small.width + x) * 4);
    img = small;
  }
  const seam = seamless(img);
  const opaque = cov.opaque > 0.95;
  const sheet = cov.opaque < 0.95 ? sheetGrid(img) : null;
  const bandX = stretchBand(img, true);
  const bandY = stretchBand(img, false);
  if (opaque && (seam.x.ok || seam.y.ok) && !(bandX?.whole && bandY?.whole)) {
    const dir = seam.x.ok && seam.y.ok ? 'xy' : seam.x.ok ? 'x' : 'y';
    techniques.push(dir === 'xy' ? 'tile lặp hai chiều' : dir === 'x' ? 'lặp ngang (nền cuộn / parallax)' : 'lặp dọc');
    suggest.kind = dir === 'xy' ? 'tile' : 'background';
    suggest.seamless = dir === 'xy' ? true : dir;
  } else if (sheet) {
    techniques.push(`sprite sheet ${sheet.cols}×${sheet.rows} khung ${sheet.width}×${sheet.height}`);
    suggest.kind = 'anim';
    if (sheet.rows === 1) suggest.frames = { count: sheet.cols, width: sheet.width, height: sheet.height, fps: 12 };
    if (sheet.uneven) notes.push({ level: 'warn', msg: 'các khung không chia đều được kích thước ảnh — khung lệch nhau khi phát' });
  } else if (bandX && bandY && !bandX.whole && !bandY.whole) {
    techniques.push(`9-slice (viền trái ${bandX.inset[0]}, trên ${bandY.inset[0]}, phải ${bandX.inset[1]}, dưới ${bandY.inset[1]})`);
    suggest.kind = 'ui';
    suggest.nineSlice = [bandX.inset[0], bandY.inset[0], bandX.inset[1], bandY.inset[1]];
  } else if (bandX && !bandX.whole && !bandY) {
    techniques.push(`3-slice ngang (đầu ${bandX.inset[0]}, đuôi ${bandX.inset[1]})`);
    suggest.kind = 'ui';
    suggest.nineSlice = [bandX.inset[0], 0, bandX.inset[1], 0];
  } else if (bandY && !bandY.whole && !bandX) {
    techniques.push(`3-slice dọc (trên ${bandY.inset[0]}, dưới ${bandY.inset[1]})`);
    suggest.kind = 'ui';
    suggest.nineSlice = [0, bandY.inset[0], 0, bandY.inset[1]];
  } else if (bandX?.whole || bandY?.whole) {
    techniques.push(bandX?.whole && bandY?.whole ? 'màu đặc (vẽ bằng code thay ảnh)' : bandX?.whole ? 'dải gradient dọc — kéo ngang tự do' : 'dải gradient ngang — kéo dọc tự do');
    suggest.kind = 'ui';
  } else {
    techniques.push(cov.opaque < 0.95 ? 'sprite (cỡ cố định)' : 'ảnh nền / minh hoạ (cỡ cố định)');
    suggest.kind = cov.opaque < 0.95 ? 'sprite' : 'background';
  }
  if (cov.padding && cov.opaque < 0.95) {
    suggest.padding = Math.min(...cov.padding);
    const [l, t, r, b] = cov.padding;
    const waste = 1 - (cov.bounds[2] * cov.bounds[3]) / (img.width * img.height);
    if (waste > 0.4 && !sheet) notes.push({ level: 'warn', msg: `${Math.round(waste * 100)}% ảnh trong suốt thừa (lề ${l}/${t}/${r}/${b}) — cắt bớt và ghi pivot, hoặc để atlas tự trim` });
    if (Math.min(l, t, r, b) === 0 && !opaque && !sheet) notes.push({ level: 'warn', msg: 'hình chạm mép ảnh — trong atlas sẽ dính màu ảnh bên cạnh khi co giãn; chừa ≥ 2 px trong suốt' });
  }
  const dirty = halo(img);
  // Canvas 2D and Pixi premultiply alpha before filtering, so this only bites in hand-written WebGL or
  // resizing tools that do not: worth knowing, not worth a warning on every exported sprite.
  if (dirty > 0.3) notes.push({ level: 'info', msg: `${Math.round(dirty * 100)}% pixel trong suốt quanh hình mang màu khác hẳn (thường là đen): canvas 2D/Pixi không sao; WebGL tự viết hoặc resize không nhân alpha sẽ có viền tối → gamekit assets bleed` });
  if (suggest.kind === 'tile' && !(isPot(img.width) && isPot(img.height))) notes.push({ level: 'info', msg: `tile ${img.width}×${img.height} không phải luỹ thừa của 2 — vẫn chạy (WebGL2), nhưng 64/128/256 dễ ghép atlas và mipmap hơn` });
  return { techniques, suggest, notes, seam, coverage: cov };
}

/**
 * Check a manifest entry against its image: the declared technique must actually work.
 * Returns { errors, warnings } (strings).
 */
export function checkArt(entry, img) {
  const errors = [];
  const warnings = [];
  for (const n of sizeNotes(img)) if (n.level !== 'info') (n.level === 'error' ? errors : warnings).push(n.msg);
  if (entry.seamless) {
    const s = seamless(img);
    const want = entry.seamless === true ? 'xy' : entry.seamless;
    if (want.includes('x') && !s.x.ok) errors.push(`khai báo lặp ngang nhưng mép trái/phải lệch (${s.x.edge} so với ${s.x.inside} bên trong) — sẽ lộ đường nối`);
    if (want.includes('y') && !s.y.ok) errors.push(`khai báo lặp dọc nhưng mép trên/dưới lệch (${s.y.edge} so với ${s.y.inside} bên trong) — sẽ lộ đường nối`);
  }
  if (entry.nineSlice) {
    const [l, t, r, b] = entry.nineSlice;
    if (l + r >= img.width || t + b >= img.height) errors.push(`nineSlice ${entry.nineSlice.join('/')} lớn hơn ảnh ${img.width}×${img.height} — không còn vùng giữa để kéo`);
    else {
      // The middle band must be plain: whatever is in it gets smeared when stretched.
      const midX = l + r > 0 ? bandDetail(img, l, img.width - 1 - r, true) : 0;
      const midY = t + b > 0 ? bandDetail(img, t, img.height - 1 - b, false) : 0;
      if (midX >= SAME) warnings.push(`vùng kéo ngang (cột ${l}…${img.width - 1 - r}) có hoạ tiết — kéo giãn sẽ méo; nới viền trái/phải hoặc dùng chế độ lặp (tile)`);
      if (midY >= SAME) warnings.push(`vùng kéo dọc (hàng ${t}…${img.height - 1 - b}) có hoạ tiết — kéo giãn sẽ méo; nới viền trên/dưới hoặc dùng chế độ lặp (tile)`);
    }
  }
  if (entry.frames) {
    const { count, width } = entry.frames;
    for (let i = 1; i < count; i++) {
      const x = i * width;
      if (x >= img.width) break;
      let touching = false;
      for (let y = 0; y < img.height && !touching; y++) if (img.data[at(img, x - 1, y) + 3] > 8 && img.data[at(img, x, y) + 3] > 8) touching = true;
      if (touching) {
        warnings.push(`khung ${i} và ${i + 1} chạm nhau ở cột ${x} — khi co giãn sẽ dính viền khung bên cạnh; chừa ≥ 2 px trống mỗi khung`);
        break;
      }
    }
  }
  if (entry.pixelArt && pixelScale(img) > 1) warnings.push('pixel art đang lưu ở cỡ phóng to — lưu ×1, phóng lúc vẽ');
  return { errors, warnings };
}

function bandDetail(img, from, to, vertical) {
  let worst = 0;
  for (let i = from; i < to; i++) worst = Math.max(worst, lineDiff(img, i, i + 1, vertical));
  return worst;
}

/**
 * Alpha bleed: give every fully transparent pixel the colour of the nearest visible one (alpha
 * stays 0). Nothing visible changes; scaled and filtered edges stop picking up black.
 */
export function bleed(img) {
  const { width, height } = img;
  const data = new Uint8Array(img.data);
  const done = new Uint8Array(width * height);
  let frontier = [];
  for (let i = 0; i < width * height; i++)
    if (data[i * 4 + 3] > 0) {
      done[i] = 1;
      frontier.push(i);
    }
  while (frontier.length) {
    const next = [];
    for (const i of frontier) {
      const x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j < 0 || j >= width * height || done[j]) continue;
        done[j] = 1;
        data[j * 4] = data[i * 4];
        data[j * 4 + 1] = data[i * 4 + 1];
        data[j * 4 + 2] = data[i * 4 + 2];
        next.push(j);
      }
    }
    frontier = next;
  }
  return { width, height, data };
}
