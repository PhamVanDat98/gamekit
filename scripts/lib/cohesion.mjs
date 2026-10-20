// Does a set of art look like one game? Set-level measures (sharpness, on-screen line width, palette,
// light direction, edge treatment, value hierarchy, tile edges) and an overview image that puts every
// asset next to the others at its display size. See skills/art-review.
import { analyzeArt, checkArt, seamless } from './art.mjs';
import { analyzeImage, checkAgainst, combineAnalyses, deltaE, srgbToLab } from './style.mjs';

// ---------- small raster toolkit (8-bit straight-alpha RGBA) ----------
export const blank = (width, height, rgba = [0, 0, 0, 0]) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
};

/** Resize: box average when shrinking, bilinear (or nearest for pixel art) when growing. */
export function resize(img, width, height, { nearest = false } = {}) {
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const out = blank(width, height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (nearest) {
        const p = (Math.min(img.height - 1, Math.floor(y * sy)) * img.width + Math.min(img.width - 1, Math.floor(x * sx))) * 4;
        out.data.set(img.data.subarray(p, p + 4), o);
      } else if (sx > 1 || sy > 1) {
        // Box filter over the source area, alpha-weighted so transparent pixels do not darken edges.
        const [x0, x1] = [Math.floor(x * sx), Math.max(Math.floor(x * sx) + 1, Math.floor((x + 1) * sx))];
        const [y0, y1] = [Math.floor(y * sy), Math.max(Math.floor(y * sy) + 1, Math.floor((y + 1) * sy))];
        let [r, g, b, a, n] = [0, 0, 0, 0, 0];
        for (let yy = y0; yy < Math.min(y1, img.height); yy++)
          for (let xx = x0; xx < Math.min(x1, img.width); xx++) {
            const p = (yy * img.width + xx) * 4;
            const w = img.data[p + 3];
            r += img.data[p] * w;
            g += img.data[p + 1] * w;
            b += img.data[p + 2] * w;
            a += w;
            n++;
          }
        if (a) out.data.set([r / a, g / a, b / a, a / n].map(Math.round), o);
      } else {
        const fx = Math.max(0, (x + 0.5) * sx - 0.5);
        const fy = Math.max(0, (y + 0.5) * sy - 0.5);
        const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
        const [x1, y1] = [Math.min(img.width - 1, x0 + 1), Math.min(img.height - 1, y0 + 1)];
        const [tx, ty] = [fx - x0, fy - y0];
        const px = (xx, yy) => (yy * img.width + xx) * 4;
        const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
        const ps = [px(x0, y0), px(x1, y0), px(x0, y1), px(x1, y1)];
        const a = ps.reduce((s, p, i) => s + img.data[p + 3] * w[i], 0);
        const ch = (c) => (a ? ps.reduce((s, p, i) => s + img.data[p + c] * img.data[p + 3] * w[i], 0) / a : 0);
        out.data.set([ch(0), ch(1), ch(2), a].map(Math.round), o); // Uint8Array truncates: round first
      }
    }
  return out;
}

/** Draw `src` over `dst` at (x, y), straight alpha. */
export function over(dst, src, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  for (let j = 0; j < src.height; j++) {
    const dy = y + j;
    if (dy < 0 || dy >= dst.height) continue;
    for (let i = 0; i < src.width; i++) {
      const dx = x + i;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (j * src.width + i) * 4;
      const d = (dy * dst.width + dx) * 4;
      const sa = src.data[s + 3] / 255;
      if (!sa) continue;
      const da = dst.data[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round((src.data[s + c] * sa + dst.data[d + c] * da * (1 - sa)) / oa);
      dst.data[d + 3] = Math.round(oa * 255);
    }
  }
}

const crop = (img, x, y, w, h) => {
  const out = blank(Math.max(1, w), Math.max(1, h));
  for (let j = 0; j < h; j++) out.data.set(img.data.subarray(((y + j) * img.width + x) * 4, ((y + j) * img.width + x + w) * 4), j * w * 4);
  return out;
};

/** 9-slice: corners keep their size, edges and centre stretch. Insets in source px [l, t, r, b]. */
export function nineSlice(img, [l, t, r, b], width, height, scale = 1) {
  const out = blank(width, height);
  const [L, T, R, B] = [l, t, r, b].map((v) => Math.round(v * scale));
  const sx = [0, l, img.width - r, img.width];
  const sy = [0, t, img.height - b, img.height];
  const dx = [0, L, width - R, width];
  const dy = [0, T, height - B, height];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const [sw, sh, dw, dh] = [sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]];
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
      over(out, resize(crop(img, sx[i], sy[j], sw, sh), dw, dh), dx[i], dy[j]);
    }
  return out;
}

/** Repeat a tile cols × rows times. */
export function tile(img, cols, rows) {
  const out = blank(img.width * cols, img.height * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) over(out, img, i * img.width, j * img.height);
  return out;
}

// 3×5 digits for numbering assets in the overview (no font needed).
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function label(dst, n, x, y, scale = 3) {
  const s = String(n);
  const w = s.length * 4 * scale + scale;
  over(dst, blank(w, 7 * scale, [20, 22, 28, 220]), x, y);
  [...s].forEach((d, k) => {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) if (DIGITS[+d][r * 3 + c] === '1') over(dst, blank(scale, scale, [255, 255, 255, 255]), x + scale + k * 4 * scale + c * scale, y + scale + r * scale);
  });
}

// ---------- per-asset measures used for cohesion ----------
const lum = (data, p) => 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];

/**
 * How blurred the image is, as a factor: 1 = edges switch colour within a pixel or two (sharp), 2 or
 * 4 = edges spread over that many pixels (the art was enlarged or blurred). Measured on strong edges
 * only, so flat-coloured art with little texture is not mistaken for blurry art.
 */
export function detailFactor(img) {
  const { width, height, data } = img;
  const L = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) L[i] = data[i * 4 + 3] < 200 ? NaN : lum(data, i * 4);
  const ratios = [];
  const WIN = 6;
  const scan = (len, count, idx) => {
    for (let line = 0; line < count; line += 2)
      for (let s = 0; s + WIN < len; s += 3) {
        let lo = Infinity;
        let hi = -Infinity;
        let step = 0;
        let ok = true;
        for (let k = 0; k <= WIN; k++) {
          const v = L[idx(line, s + k)];
          if (Number.isNaN(v)) {
            ok = false;
            break;
          }
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
          if (k) step = Math.max(step, Math.abs(v - L[idx(line, s + k - 1)]));
        }
        if (ok && hi - lo > 60) ratios.push(step / (hi - lo));
      }
  };
  scan(width, height, (y, x) => y * width + x);
  scan(height, width, (x, y) => y * width + x);
  if (ratios.length < 20) return 1;
  const r = median(ratios);
  return r >= 0.4 ? 1 : r >= 0.22 ? 2 : 4;
}

/** Share of the silhouette's edge drawn with partial alpha: smooth (anti-aliased) or hard (pixel) edges. */
export function edgeSoftness(img) {
  let edge = 0;
  let soft = 0;
  const { width, height, data } = img;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const p = (y * width + x) * 4;
      const a = data[p + 3];
      if (!a) continue;
      const touchesClear = [p - 4, p + 4, p - width * 4, p + width * 4].some((q) => data[q + 3] === 0);
      if (!touchesClear) continue;
      edge++;
      if (a < 250) soft++;
    }
  return edge ? soft / edge : null;
}

/**
 * Where the light comes from: the brightness-weighted direction inside the shape (outline
 * excluded). Returns { angle (deg, 0 = from the right, 90 = from below… screen y down), strength }.
 */
export function lightDirection(img) {
  const { width, height, data } = img;
  const pts = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (data[p + 3] < 200) continue;
      const L = lum(data, p);
      if (L < 60) continue; // outline / ink
      pts.push([x, y, L]);
    }
  if (pts.length < 100) return null;
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const mL = pts.reduce((s, p) => s + p[2], 0) / n;
  const sd = Math.sqrt(pts.reduce((s, p) => s + (p[2] - mL) ** 2, 0) / n) || 1;
  const size = Math.max(width, height);
  let vx = 0;
  let vy = 0;
  for (const [x, y, L] of pts) {
    vx += ((x - cx) / size) * ((L - mL) / sd);
    vy += ((y - cy) / size) * ((L - mL) / sd);
  }
  const strength = Math.hypot(vx, vy) / n;
  return { angle: Math.round((Math.atan2(vy, vx) * 180) / Math.PI), strength: Math.round(strength * 1000) / 1000 };
}

const angleGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const median = (xs) => {
  const s = xs.filter((v) => v != null).sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : null;
};
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const SPRITE_KINDS = new Set(['sprite', 'anim', 'icon']);
const WORLD_KINDS = new Set(['background', 'tile', 'texture']);

/** Mean colour of each edge strip of a tile, in Lab. */
function edgeColours(img) {
  const avg = (pick) => {
    const acc = [0, 0, 0];
    let n = 0;
    for (const [x, y] of pick) {
      const p = (y * img.width + x) * 4;
      acc[0] += img.data[p];
      acc[1] += img.data[p + 1];
      acc[2] += img.data[p + 2];
      n++;
    }
    return srgbToLab(...acc.map((v) => v / n));
  };
  const xs = [...Array(img.width).keys()];
  const ys = [...Array(img.height).keys()];
  return { top: avg(xs.map((x) => [x, 0])), bottom: avg(xs.map((x) => [x, img.height - 1])), left: avg(ys.map((y) => [0, y])), right: avg(ys.map((y) => [img.width - 1, y])) };
}

/**
 * Review a set of assets: [{ id, kind, img, display: [w, h], entry }].
 * Returns { assets: per-asset rows, issues: [{ level, id?, msg }], summary }.
 */
export function reviewSet(items, { style = null } = {}) {
  const issues = [];
  const rows = items.map((it) => {
    const art = analyzeArt(it.img);
    const look = (() => {
      try {
        return analyzeImage(it.img, { whole: WORLD_KINDS.has(it.kind) });
      } catch {
        return null;
      }
    })();
    const scale = it.display[1] / it.img.height; // display px per file px
    const k = detailFactor(it.img);
    const density = round(1 / (scale * k)); // real detail pixels per display pixel (≥ 1 = sharp at @1x)
    // Outline width as the player sees it: % of the subject's height × the subject's height on screen.
    // (The style analysis measures large images shrunk to 1024 px on the long side.)
    const measured = look ? Math.max(1, Math.max(...look.size) / 1024) : 1;
    const subjectOnScreen = look?.subject ? look.subject.height * measured * scale : null;
    const line = look?.outline?.present === true && subjectOnScreen ? round((look.outline.thicknessPct / 100) * subjectOnScreen, 1) : null;
    return { ...it, art, look, density, detail: k, line, edge: edgeSoftness(it.img), light: lightDirection(it.img), declared: it.entry ? checkArt(it.entry, it.img) : null };
  });

  // Declared techniques that do not work are errors; everything else is about the set.
  for (const r of rows) {
    for (const e of r.declared?.errors ?? []) issues.push({ level: 'error', id: r.id, msg: e });
    for (const w of r.declared?.warnings ?? []) issues.push({ level: 'warn', id: r.id, msg: w });
  }

  // Sharpness: everything on screen should carry about the same detail per display pixel.
  const dens = median(rows.map((r) => r.density));
  for (const r of rows) {
    if (r.density < 0.75) issues.push({ level: 'warn', id: r.id, msg: `mờ: ${r.density} px chi tiết / px hiển thị${r.detail > 1 ? ` (ảnh thật ra chỉ nét bằng 1/${r.detail} cỡ file — đã bị phóng to)` : ''}; cả bộ ~${dens}. Cần ảnh lớn hơn hoặc vẽ lại` });
    else if (dens && r.density < dens * 0.6) issues.push({ level: 'warn', id: r.id, msg: `kém nét hơn phần còn lại (${r.density} so với ~${dens} px/px) — đặt cạnh nhau sẽ thấy một cái mờ` });
    if (r.density > 3) issues.push({ level: 'info', id: r.id, msg: `ảnh lớn gấp ${r.density} lần cỡ hiển thị — thu về @2x (${Math.round(r.display[0] * 2)}×${Math.round(r.display[1] * 2)}) cho nhẹ` });
  }

  // On-screen line width: outlines of things shown together should look equally thick.
  const lined = rows.filter((r) => r.line != null && (SPRITE_KINDS.has(r.kind) || r.kind === 'ui'));
  const lineMed = median(lined.map((r) => r.line));
  for (const r of lined)
    if (lineMed && (r.line > lineMed * 1.6 || r.line < lineMed * 0.6))
      issues.push({ level: 'warn', id: r.id, msg: `nét viền trên màn hình ${r.line} px, cả bộ ~${lineMed} px — ${r.line > lineMed ? 'dày' : 'mảnh'} hơn hẳn` });
  const outlinedShare = rows.filter((r) => r.look?.outline?.present === true && SPRITE_KINDS.has(r.kind)).length;
  const spriteCount = rows.filter((r) => r.look?.outline?.present != null && SPRITE_KINDS.has(r.kind)).length;
  if (spriteCount >= 3 && outlinedShare && outlinedShare < spriteCount) {
    const odd = outlinedShare * 2 >= spriteCount ? rows.filter((r) => r.look?.outline?.present === false && SPRITE_KINDS.has(r.kind)) : rows.filter((r) => r.look?.outline?.present === true && SPRITE_KINDS.has(r.kind));
    for (const r of odd) issues.push({ level: 'warn', id: r.id, msg: outlinedShare * 2 >= spriteCount ? 'không có nét viền trong khi phần lớn sprite có' : 'có nét viền trong khi phần lớn sprite không có' });
  }

  // Edges: smooth and pixel-hard edges side by side read as two different games.
  const edges = rows.filter((r) => r.edge != null && SPRITE_KINDS.has(r.kind));
  const softMed = median(edges.map((r) => r.edge));
  if (softMed != null)
    for (const r of edges)
      if ((softMed > 0.3 && r.edge < 0.05) || (softMed < 0.05 && r.edge > 0.3))
        issues.push({ level: 'warn', id: r.id, msg: r.edge < 0.05 ? 'mép răng cưa (pixel) giữa bộ mép mượt' : 'mép mượt (khử răng cưa) giữa bộ pixel art' });

  // Light: shaded sprites should agree on where the light comes from.
  const lit = rows.filter((r) => r.light && r.light.strength > 0.02 && SPRITE_KINDS.has(r.kind));
  if (lit.length >= 3) {
    const sx = lit.reduce((s, r) => s + Math.cos((r.light.angle * Math.PI) / 180), 0);
    const sy = lit.reduce((s, r) => s + Math.sin((r.light.angle * Math.PI) / 180), 0);
    const mainAngle = Math.round((Math.atan2(sy, sx) * 180) / Math.PI);
    for (const r of lit) if (angleGap(r.light.angle, mainAngle) > 100) issues.push({ level: 'warn', id: r.id, msg: `ánh sáng từ hướng khác (${r.light.angle}°, cả bộ ~${mainAngle}°) — trông như dán từ cảnh khác` });
  }

  // Palette: one colour family for the set (or the approved style).
  const looks = rows.filter((r) => r.look);
  const setStyle = style ?? (looks.length >= 2 ? combineAnalyses(looks.map((r) => r.look)) : null);
  if (setStyle)
    for (const r of looks) {
      const c = checkAgainst(setStyle, r.look);
      if (c.metrics.paletteFit < 70) issues.push({ level: 'warn', id: r.id, msg: `màu lạc khỏi bộ: ${c.metrics.paletteFit}% pixel gần bảng màu chung${style ? ' (art/style)' : ''}` });
      r.paletteFit = c.metrics.paletteFit;
    }

  // Hierarchy: the playfield sits back, the things you play with come forward.
  const world = looks.filter((r) => WORLD_KINDS.has(r.kind));
  const actors = looks.filter((r) => SPRITE_KINDS.has(r.kind));
  if (world.length && actors.length) {
    const w = { chroma: median(world.map((r) => r.look.colour.meanChroma)), contrast: median(world.map((r) => r.look.value.contrast)) };
    const a = { chroma: median(actors.map((r) => r.look.colour.meanChroma)), contrast: median(actors.map((r) => r.look.value.contrast)) };
    if (w.contrast >= a.contrast || w.chroma > a.chroma + 5)
      issues.push({ level: 'warn', msg: `nền nổi ngang/ hơn vật chơi (nền: tương phản ${w.contrast}, bão hoà ${w.chroma}; nhân vật/vật phẩm: ${a.contrast}, ${a.chroma}) — giảm tương phản/bão hoà của nền để người chơi đọc được` });
  }

  // Tiles of one set must meet without a visible border.
  const tiles = rows.filter((r) => r.kind === 'tile');
  if (tiles.length >= 2) {
    const eds = tiles.map((r) => ({ id: r.id, e: edgeColours(r.img) }));
    for (let i = 0; i < eds.length; i++)
      for (let j = i + 1; j < eds.length; j++) {
        const d = Math.min(deltaE(eds[i].e.right, eds[j].e.left), deltaE(eds[j].e.right, eds[i].e.left), deltaE(eds[i].e.bottom, eds[j].e.top), deltaE(eds[j].e.bottom, eds[i].e.top));
        if (d > 12) issues.push({ level: 'warn', id: `${eds[i].id} + ${eds[j].id}`, msg: `đặt cạnh nhau lộ ranh giới (màu mép lệch ΔE ${Math.round(d)}) — cần tile chuyển tiếp hoặc chỉnh màu mép` });
      }
  }

  const summary = {
    count: rows.length,
    density: dens,
    lineWidth: lineMed,
    edges: softMed == null ? null : softMed > 0.3 ? 'mượt' : softMed < 0.05 ? 'răng cưa (pixel)' : 'trộn',
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warn').length,
  };
  return { rows, issues, summary, style: setStyle };
}

/**
 * One picture of the whole set at display sizes: backgrounds (repeated where they loop), tiles 3×3,
 * a line-up of sprites on the main background (true relative scale), UI panels stretched to two
 * sizes. Each asset carries its number from the review.
 */
export function overview(rows, { width = 1600 } = {}) {
  const GAP = 24;
  const BG = [46, 49, 56, 255];
  const parts = [];
  const zoomFor = (r, maxH) => Math.min(2, maxH / r.display[1]);
  const fit = (r, h) => resize(r.img, (r.display[0] * h) / r.display[1], h, { nearest: !!r.entry?.pixelArt });

  // Backgrounds: each on its own row, twice side by side when it loops horizontally.
  for (const [n, r] of rows.entries()) {
    if (r.kind !== 'background') continue;
    const h = Math.min(260, r.display[1]);
    const img = fit(r, h);
    const loops = seamless(r.img).x.ok;
    parts.push({ n, img: loops ? tile(img, 2, 1) : img, row: 'bg' });
  }
  // Tiles 3×3 at display size (zoomed when tiny).
  for (const [n, r] of rows.entries()) {
    if (r.kind !== 'tile' && r.kind !== 'texture') continue;
    const z = zoomFor(r, 96);
    parts.push({ n, img: tile(fit(r, r.display[1] * z), 3, 3), row: 'tile' });
  }
  // Line-up: sprites at one common zoom so their relative sizes are true, standing on a ground line.
  const actors = [...rows.entries()].filter(([, r]) => SPRITE_KINDS.has(r.kind));
  if (actors.length) {
    const tallest = Math.max(...actors.map(([, r]) => r.display[1]));
    const z = Math.min(2, 220 / tallest);
    const imgs = actors.map(([n, r]) => {
      // A sheet stands in with its first frame.
      const one = r.entry?.frames ? { ...r, img: cropFrame(r), display: [r.entry.frames.width * (r.display[1] / r.img.height), r.display[1]] } : r;
      return { n, img: fit(one, one.display[1] * z) };
    });
    const stageW = Math.min(width - GAP * 2, imgs.reduce((s, i) => s + i.img.width + GAP, GAP));
    const stageH = Math.max(...imgs.map((i) => i.img.height)) + GAP * 2;
    const stage = blank(stageW, stageH, [92, 104, 120, 255]);
    // The stage uses the scrolling background if there is one (that is what sprites stand on in play).
    const bgs = rows.filter((r) => r.kind === 'background');
    const mainBg = bgs.find((r) => seamless(r.img).x.ok) ?? bgs[0] ?? rows.find((r) => r.kind === 'tile');
    if (mainBg) over(stage, mainBg.kind === 'tile' ? tile(fit(mainBg, mainBg.display[1]), Math.ceil(stageW / mainBg.display[0]) + 1, Math.ceil(stageH / mainBg.display[1]) + 1) : resize(mainBg.img, stageW, stageH), 0, 0);
    let x = GAP;
    const labels = [];
    for (const i of imgs) {
      if (x + i.img.width > stageW) break;
      over(stage, i.img, x, stageH - GAP - i.img.height);
      labels.push([i.n, x, stageH - GAP - i.img.height]);
      x += i.img.width + GAP;
    }
    parts.push({ img: stage, row: 'stage', labels });
  }
  // UI: 9-slice panels at their size and stretched; other UI as is.
  for (const [n, r] of rows.entries()) {
    if (r.kind !== 'ui') continue;
    const s = r.display[1] / r.img.height;
    if (r.entry?.nineSlice) {
      const a = nineSlice(r.img, r.entry.nineSlice, r.display[0], r.display[1], s);
      const b = nineSlice(r.img, r.entry.nineSlice, Math.round(r.display[0] * 2.2), Math.round(r.display[1] * 1.6), s);
      const both = blank(a.width + b.width + GAP, Math.max(a.height, b.height));
      over(both, a, 0, 0);
      over(both, b, a.width + GAP, 0);
      parts.push({ n, img: both, row: 'ui' });
    } else parts.push({ n, img: fit(r, r.display[1]), row: 'ui' });
  }

  // Flow the parts into rows.
  const placed = [];
  let [x, y, rowH, row] = [GAP, GAP, 0, null];
  for (const p of parts) {
    const w = Math.min(p.img.width, width - GAP * 2);
    if (row !== p.row || x + w > width - GAP) {
      if (rowH) y += rowH + GAP;
      [x, rowH, row] = [GAP, 0, p.row];
    }
    placed.push({ ...p, x, y });
    x += w + GAP;
    rowH = Math.max(rowH, p.img.height);
  }
  const height = y + rowH + GAP;
  const out = blank(width, Math.max(height, 64), BG);
  for (const p of placed) {
    over(out, p.img.width > width - GAP * 2 ? crop(p.img, 0, 0, width - GAP * 2, p.img.height) : p.img, p.x, p.y);
    if (p.n != null) label(out, p.n + 1, p.x, p.y);
    for (const [n, lx, ly] of p.labels ?? []) label(out, n + 1, p.x + lx, p.y + ly);
  }
  return out;
}

function cropFrame(r) {
  const { width } = r.entry.frames;
  return crop(r.img, 0, 0, Math.min(width, r.img.width), r.img.height);
}
