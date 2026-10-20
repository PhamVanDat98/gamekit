// Measurable side of an art style: palette, outline, flat vs. painted, value and saturation.
// Eyes judge shape language and mood; these numbers are what eyes (and image models) get wrong.

const MAX_SIDE = 1024; // analyse at most this many px on the long side (nearest sampling keeps exact colours)
const FLAT_DE = 5; // a pixel this close (ΔE) to a palette colour counts as flat fill
const MERGE_DE = 8; // palette colours closer than this are one colour
const OUTLINE_DROP = 20; // a rim this much darker (L*) than the inside is an outline

// ---------- colour ----------
const LIN = Array.from({ length: 256 }, (_, c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
const lin = (c) => LIN[Math.round(Math.min(255, Math.max(0, c)))];
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB 0..255 → CIE L*a*b* (D65). */
export function srgbToLab(r, g, b) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const hex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export const fromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const chroma = (lab) => Math.hypot(lab[1], lab[2]);
const hue = (lab) => ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

// ---------- image prep ----------
function downscale(img) {
  const k = Math.max(img.width, img.height) / MAX_SIDE;
  if (k <= 1) return img;
  const width = Math.round(img.width / k);
  const height = Math.round(img.height / k);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const s = (Math.min(img.height - 1, Math.floor(y * k)) * img.width + Math.min(img.width - 1, Math.floor(x * k))) * 4;
      data.set(img.data.subarray(s, s + 4), (y * width + x) * 4);
    }
  return { width, height, data };
}

/**
 * Which pixels are the subject: alpha when the image has transparency, otherwise everything
 * except a flat background flood-filled from the border; a full illustration keeps every pixel.
 */
function subjectMask(img, lab, whole) {
  const n = img.width * img.height;
  const mask = new Uint8Array(n);
  if (whole) {
    // Backgrounds and tiles are the picture itself: nothing to cut away.
    mask.fill(1);
    return { mask, background: 'none' };
  }
  let clear = 0;
  for (let i = 0; i < n; i++) if (img.data[i * 4 + 3] < 128) clear++;
  if (clear / n > 0.02) {
    for (let i = 0; i < n; i++) mask[i] = img.data[i * 4 + 3] >= 128 ? 1 : 0;
    return { mask, background: 'transparent' };
  }
  const border = [];
  for (let x = 0; x < img.width; x++) border.push(x, (img.height - 1) * img.width + x);
  for (let y = 0; y < img.height; y++) border.push(y * img.width, y * img.width + img.width - 1);
  const buckets = new Map();
  for (const i of border) {
    const key = ((img.data[i * 4] >> 4) << 8) | ((img.data[i * 4 + 1] >> 4) << 4) | (img.data[i * 4 + 2] >> 4);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const [topKey, topCount] = [...buckets].reduce((a, b) => (b[1] > a[1] ? b : a));
  if (topCount / border.length < 0.6) {
    mask.fill(1);
    return { mask, background: 'none' };
  }
  const seeds = border.filter((i) => (((img.data[i * 4] >> 4) << 8) | ((img.data[i * 4 + 1] >> 4) << 4) | (img.data[i * 4 + 2] >> 4)) === topKey);
  const bgRgb = [0, 1, 2].map((c) => seeds.reduce((s, i) => s + img.data[i * 4 + c], 0) / seeds.length);
  const bgLab = srgbToLab(...bgRgb);
  mask.fill(1);
  const queue = seeds.filter((i) => deltaE(lab(i), bgLab) < 6);
  for (const i of queue) mask[i] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % img.width;
    for (const j of [x > 0 ? i - 1 : -1, x < img.width - 1 ? i + 1 : -1, i - img.width, i + img.width]) {
      if (j < 0 || j >= n || !mask[j]) continue;
      if (deltaE(lab(j), bgLab) < 6) {
        mask[j] = 0;
        queue.push(j);
      }
    }
  }
  return { mask, background: hex(bgRgb) };
}

// ---------- palette: k-means in Lab, deterministic ----------
function kmeans(points, rgbs, k = 16, iterations = 12) {
  const n = points.length;
  if (!n) return [];
  // Start from the most common colour, then keep adding the colour farthest from all chosen.
  const counts = new Map();
  points.forEach((p, i) => {
    const key = rgbs[i].map((v) => v >> 3).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const topKey = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const first = rgbs.findIndex((r) => r.map((v) => v >> 3).join(',') === topKey);
  const centers = [points[first]];
  const probe = points.filter((_, i) => i % Math.max(1, Math.floor(n / 4000)) === 0);
  while (centers.length < k) {
    let best = null;
    let bestD = -1;
    for (const p of probe) {
      const d = Math.min(...centers.map((c) => deltaE(p, c)));
      if (d > bestD) [best, bestD] = [p, d];
    }
    if (bestD < MERGE_DE / 2) break;
    centers.push(best);
  }
  let groups = [];
  for (let it = 0; it < iterations; it++) {
    groups = centers.map(() => ({ lab: [0, 0, 0], rgb: [0, 0, 0], n: 0 }));
    for (let i = 0; i < n; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = deltaE(points[i], centers[c]);
        if (d < bd) [bi, bd] = [c, d];
      }
      const g = groups[bi];
      for (let c = 0; c < 3; c++) {
        g.lab[c] += points[i][c];
        g.rgb[c] += rgbs[i][c];
      }
      g.n++;
    }
    groups = groups.filter((g) => g.n).map((g) => ({ lab: g.lab.map((v) => v / g.n), rgb: g.rgb.map((v) => v / g.n), n: g.n }));
    centers.splice(0, centers.length, ...groups.map((g) => g.lab));
  }
  // Merge near-duplicates (weighted), then keep the colours that actually cover the image.
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let a = 0; a < groups.length; a++)
      for (let b = a + 1; b < groups.length; b++)
        if (deltaE(groups[a].lab, groups[b].lab) < MERGE_DE) {
          const [A, B] = [groups[a], groups[b]];
          const t = A.n + B.n;
          groups[a] = { lab: A.lab.map((v, c) => (v * A.n + B.lab[c] * B.n) / t), rgb: A.rgb.map((v, c) => (v * A.n + B.rgb[c] * B.n) / t), n: t };
          groups.splice(b, 1);
          merged = true;
          break outer;
        }
  }
  const sorted = groups.sort((a, b) => b.n - a.n);
  return sorted
    .filter((g) => !isBlend(g, sorted))
    .map((g) => ({ hex: hex(g.rgb), share: g.n / n, lab: g.lab }))
    .filter((g) => g.share >= 0.005)
    .sort((a, b) => b.share - a.share);
}

/**
 * A small colour that sits on the mix between two bigger ones is the anti-aliased edge between
 * them (line against fill), not a colour of the style: keep it out of the palette.
 */
function isBlend(g, groups) {
  if (g.n / groups.reduce((s, x) => s + x.n, 0) >= 0.03) return false;
  const bigger = groups.filter((x) => x.n > g.n * 2);
  for (let i = 0; i < bigger.length; i++)
    for (let j = i + 1; j < bigger.length; j++) {
      const [A, B] = [bigger[i].rgb, bigger[j].rgb];
      const ab = A.map((v, c) => B[c] - v);
      const len2 = ab.reduce((s, v) => s + v * v, 0) || 1;
      const t = ab.reduce((s, v, c) => s + v * (g.rgb[c] - A[c]), 0) / len2;
      if (t < 0.1 || t > 0.9) continue;
      if (deltaE(srgbToLab(...A.map((v, c) => v + ab[c] * t)), g.lab) < 5) return true;
    }
  return false;
}

/** Pixels of the subject as Lab + RGB, at most ~60k of them (evenly spread). */
function subjectSamples(img, mask, lab) {
  const idx = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
  const step = Math.max(1, Math.floor(idx.length / 60000));
  const points = [];
  const rgbs = [];
  for (let s = 0; s < idx.length; s += step) {
    points.push(lab(idx[s]));
    rgbs.push([img.data[idx[s] * 4], img.data[idx[s] * 4 + 1], img.data[idx[s] * 4 + 2]]);
  }
  return { points, rgbs };
}

// ---------- outline: dark rim measured inward from the silhouette ----------
function measureOutline(img, mask, lab, background) {
  if (background === 'none') return { present: null, note: 'ảnh có nền, không tách được chủ thể — đo nét viền trên ảnh nhân vật/vật thể nền trong suốt hoặc nền phẳng' };
  const { width, height } = img;
  const dist = new Int32Array(width * height).fill(-1);
  const queue = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = (i / width) | 0;
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width];
    if (edge) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % width;
    for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
      if (j < 0 || j >= mask.length || !mask[j] || dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  const layers = [];
  const inside = [];
  for (let i = 0; i < mask.length; i++) {
    if (dist[i] < 0) continue;
    const L = lab(i)[0];
    if (dist[i] < 40) (layers[dist[i]] ??= []).push(i);
    if (dist[i] >= 8) inside.push(L);
  }
  const insideL = median(inside.length ? inside : layers.flat().map((i) => lab(i)[0]));
  const dark = (d) => layers[d] && median(layers[d].map((i) => lab(i)[0])) < insideL - OUTLINE_DROP;
  // The first one or two rings can be a blend of line and background (anti-aliasing, resizing, JPG).
  const start = [0, 1, 2].find(dark);
  if (start == null) return { present: false, thicknessPx: 0 };
  let end = start;
  while (dark(end)) end++;
  const thickness = end - start + start * 0.5; // a blended ring is about half line
  // Median, not mean: anti-aliased pixels on both sides of the line would pull the colour lighter.
  const ink = layers.slice(start, end).flat();
  const rgb = [0, 1, 2].map((c) => median(ink.map((i) => img.data[i * 4 + c])));
  // Line work inside the shape (not only around it): dark pixels well inside the silhouette.
  const inkL = srgbToLab(...rgb)[0];
  let deep = 0;
  let lines = 0;
  for (let i = 0; i < mask.length; i++)
    if (dist[i] > thickness + 2) {
      deep++;
      if (lab(i)[0] < inkL + 12) lines++;
    }
  return { present: true, thicknessPx: thickness, hex: hex(rgb), innerLines: deep ? lines / deep : 0 };
}

/**
 * Everything measurable about one image (8-bit RGBA, any size). `samples` is for pooling, not for
 * output. `whole`: the image is a background/tile — measure all of it, do not look for a subject.
 */
export function analyzeImage(source, { whole = false } = {}) {
  const img = downscale(source);
  const labs = new Float32Array(img.width * img.height * 3);
  for (let i = 0; i < img.width * img.height; i++) labs.set(srgbToLab(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]), i * 3);
  const lab = (i) => labs.subarray(i * 3, i * 3 + 3);
  const { mask, background } = subjectMask(img, lab, whole);
  let [x0, y0, x1, y1, area] = [img.width, img.height, -1, -1, 0];
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      const x = i % img.width;
      const y = (i / img.width) | 0;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      area++;
    }
  if (!area) throw new Error('không tìm thấy chủ thể (ảnh trống hoặc toàn trong suốt)');
  const subjectH = y1 - y0 + 1;
  const subjectW = x1 - x0 + 1;
  const samples = subjectSamples(img, mask, lab);
  const palette = kmeans(samples.points, samples.rgbs);
  const near = samples.points.map((p) => Math.min(...palette.map((c) => deltaE(p, c.lab))));
  const flatness = near.filter((d) => d < FLAT_DE).length / near.length;
  const Ls = samples.points.map((p) => p[0]);
  const meanL = Ls.reduce((a, b) => a + b, 0) / Ls.length;
  const chromas = samples.points.map(chroma);
  const colourful = samples.points.filter((p) => chroma(p) > 15);
  const outline = measureOutline(img, mask, lab, background);
  return {
    size: [source.width, source.height],
    background,
    subject: { width: subjectW, height: subjectH, aspect: round(subjectW / subjectH, 2), fill: round(area / (subjectW * subjectH), 2) },
    palette: palette.slice(0, 16).map((c) => ({ hex: c.hex, share: round(c.share * 100) })),
    coverage90: palette.reduce((acc, c) => (acc.sum < 0.9 ? { n: acc.n + 1, sum: acc.sum + c.share } : acc), { n: 0, sum: 0 }).n,
    flatness: round(flatness * 100),
    outline:
      outline.present == null
        ? { present: null, note: outline.note }
        : outline.present
          ? { present: true, hex: outline.hex, thicknessPct: round((outline.thicknessPx / subjectH) * 100, 2), innerLines: round(outline.innerLines * 100) }
          : { present: false },
    value: { meanL: round(meanL), contrast: round(Math.sqrt(Ls.reduce((s, L) => s + (L - meanL) ** 2, 0) / Ls.length)) },
    colour: {
      meanChroma: round(chromas.reduce((a, b) => a + b, 0) / chromas.length),
      saturated: round((chromas.filter((c) => c > 40).length / chromas.length) * 100),
      warm: colourful.length ? round((colourful.filter((p) => hue(p) < 100 || hue(p) > 330).length / colourful.length) * 100) : null,
    },
    samples,
  };
}

/** Rendering class from flatness: how the style fills its shapes. */
export const renderingOf = (flatness) => (flatness >= 85 ? 'phẳng (flat)' : flatness >= 60 ? 'cel / ít chuyển màu' : 'chuyển màu / vẽ tay');

/** One style from several references: palette pooled over all of them, everything else the median. */
export function combineAnalyses(list) {
  // Pool an equal share from every image (≤ 120k points in all), so one big image does not drown the rest.
  const per = Math.max(1000, Math.floor(120000 / list.length));
  const take = (xs) => xs.filter((_, i) => i % Math.max(1, Math.ceil(xs.length / per)) === 0);
  const points = list.flatMap((a) => take(a.samples.points));
  const rgbs = list.flatMap((a) => take(a.samples.rgbs));
  const palette = kmeans(points, rgbs, 20);
  const near = points.map((p) => Math.min(...palette.map((c) => deltaE(p, c.lab))));
  const flatness = round((near.filter((d) => d < FLAT_DE).length / near.length) * 100);
  const outlined = list.filter((a) => a.outline.present === true);
  const judged = list.filter((a) => a.outline.present != null);
  const present = judged.length ? outlined.length * 2 >= judged.length : null;
  const inks = outlined.map((a) => fromHex(a.outline.hex));
  const med = (fn) => median(list.map(fn).filter((v) => v != null));
  return {
    palette: palette.slice(0, 16).map((c) => ({ hex: c.hex, share: round(c.share * 100) })),
    coverage90: palette.reduce((acc, c) => (acc.sum < 0.9 ? { n: acc.n + 1, sum: acc.sum + c.share } : acc), { n: 0, sum: 0 }).n,
    flatness,
    rendering: renderingOf(flatness),
    outline:
      present == null
        ? { present: null }
        : present
          ? {
              present: true,
              hex: hex([0, 1, 2].map((c) => inks.reduce((s, v) => s + v[c], 0) / inks.length)),
              thicknessPct: med((a) => a.outline.thicknessPct),
              innerLines: med((a) => a.outline.innerLines),
            }
          : { present: false },
    value: { meanL: med((a) => a.value.meanL), contrast: med((a) => a.value.contrast) },
    colour: { meanChroma: med((a) => a.colour.meanChroma), saturated: med((a) => a.colour.saturated), warm: med((a) => a.colour.warm) },
    subject: { aspect: med((a) => a.subject.aspect), fill: med((a) => a.subject.fill) },
  };
}

/** Limits for `style check`: what drifting off the style looks like in numbers. */
export const TOLERANCE = { paletteDE: 12, paletteFit: 80, paletteWarn: 90, outlineRatio: [0.6, 1.6], inkDE: 15, flatness: 20, chroma: 15, lightness: 15, warm: 30 };

/** Compare a new asset with the style: { errors, warnings, metrics }. */
export function checkAgainst(style, a) {
  const errors = [];
  const warnings = [];
  // extraPalette: colours added on purpose for new subjects (with a reason), see the skill.
  const pal = [...style.palette, ...(style.extraPalette ?? [])].map((c) => srgbToLab(...fromHex(c.hex)));
  const inStyle = (p) => pal.some((c) => deltaE(p, c) <= TOLERANCE.paletteDE) || onMix(p, pal);
  const fit = round((a.samples.points.filter(inStyle).length / a.samples.points.length) * 100);
  if (fit < TOLERANCE.paletteFit) errors.push(`bảng màu: ${fit}% pixel gần màu của style (cần ≥ ${TOLERANCE.paletteFit}%) — màu lạ: ${offPalette(a, pal).join(', ')}`);
  else if (fit < TOLERANCE.paletteWarn) warnings.push(`bảng màu: ${fit}% pixel gần màu của style — màu lạ: ${offPalette(a, pal).join(', ')}`);
  const so = style.outline;
  const ao = a.outline;
  if (so.present != null && ao.present != null) {
    if (so.present !== ao.present) errors.push(so.present ? 'thiếu nét viền (style có viền)' : 'có nét viền (style không viền)');
    else if (so.present) {
      const ratio = ao.thicknessPct / so.thicknessPct;
      if (ratio < TOLERANCE.outlineRatio[0] || ratio > TOLERANCE.outlineRatio[1])
        errors.push(`nét viền dày ${ao.thicknessPct}% chiều cao, style ${so.thicknessPct}% (×${round(ratio, 2)}) — ${ratio > 1 ? 'mảnh lại' : 'dày lên'}`);
      const dInk = deltaE(srgbToLab(...fromHex(ao.hex)), srgbToLab(...fromHex(so.hex)));
      if (dInk > TOLERANCE.inkDE) warnings.push(`màu nét ${ao.hex}, style ${so.hex}`);
    }
  }
  if (Math.abs(a.flatness - style.flatness) > TOLERANCE.flatness)
    warnings.push(`cách tô: ${renderingOf(a.flatness)} (${a.flatness}% phẳng), style ${style.rendering} (${style.flatness}%)`);
  if (Math.abs(a.colour.meanChroma - style.colour.meanChroma) > TOLERANCE.chroma)
    warnings.push(`độ bão hoà ${a.colour.meanChroma}, style ${style.colour.meanChroma} — ${a.colour.meanChroma > style.colour.meanChroma ? 'rực hơn' : 'nhạt hơn'}`);
  if (Math.abs(a.value.meanL - style.value.meanL) > TOLERANCE.lightness)
    warnings.push(`độ sáng ${a.value.meanL}, style ${style.value.meanL} — ${a.value.meanL > style.value.meanL ? 'sáng hơn' : 'tối hơn'}`);
  if (a.colour.warm != null && style.colour.warm != null && Math.abs(a.colour.warm - style.colour.warm) > TOLERANCE.warm)
    warnings.push(`tông ${a.colour.warm}% màu nóng, style ${style.colour.warm}%`);
  return { errors, warnings, metrics: { paletteFit: fit, flatness: a.flatness, outline: a.outline, meanChroma: a.colour.meanChroma, meanL: a.value.meanL } };
}

/** On the anti-aliased mix between two colours of the style (an edge), within a tight ΔE. */
function onMix(p, pal) {
  const MIX_DE = 6;
  for (let i = 0; i < pal.length; i++)
    for (let j = i + 1; j < pal.length; j++) {
      const [A, B] = [pal[i], pal[j]];
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
      const t = Math.min(1, Math.max(0, ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / len2));
      if (deltaE(p, [A[0] + ab[0] * t, A[1] + ab[1] * t, A[2] + ab[2] * t]) <= MIX_DE) return true;
    }
  return false;
}

function offPalette(a, pal) {
  const off = a.palette.filter((c) => {
    const lab = srgbToLab(...fromHex(c.hex));
    return !pal.some((p) => deltaE(lab, p) <= TOLERANCE.paletteDE) && !onMix(lab, pal);
  });
  return off.length ? off.slice(0, 4).map((c) => `${c.hex} (${c.share}%)`) : ['(rải rác)'];
}
