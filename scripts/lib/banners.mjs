// Store banners: standard sizes, cover-crop + resample, logo overlay. Pure JS on 8-bit RGBA images.

/**
 * Standard banner set. `from`: source art in order of preference (first one provided wins).
 * `logo`: where the logo goes — `at` top|bottom, fitted inside `w` × `h` (fractions of the banner), `margin` from that edge.
 */
export const SOURCES = ['wide', 'square', 'tall', 'icon'];

const top = (w, h) => ({ at: 'top', w, h, margin: 0.04 });
export const BANNERS = [
  { name: '64x64', width: 64, height: 64, from: ['icon', 'square', 'wide'], logo: null },
  { name: '200x120', width: 200, height: 120, from: ['wide'], logo: null },
  { name: '342x270', width: 342, height: 270, from: ['wide', 'square'], logo: top(0.5, 0.26) },
  { name: '512x384', width: 512, height: 384, from: ['wide'], logo: top(0.45, 0.27) },
  { name: '512x512', width: 512, height: 512, from: ['icon', 'square', 'wide'], logo: null },
  { name: '512x512_logo', width: 512, height: 512, from: ['icon', 'square', 'wide'], logo: { at: 'bottom', w: 0.8, h: 0.32, margin: 0.04 } },
  { name: '800x470', width: 800, height: 470, from: ['wide'], logo: top(0.42, 0.27) },
  { name: '960x1200', width: 960, height: 1200, from: ['tall', 'square', 'wide'], logo: top(0.6, 0.2) },
  { name: '1024x768', width: 1024, height: 768, from: ['wide'], logo: top(0.45, 0.27) },
  { name: '1200x628', width: 1200, height: 628, from: ['wide'], logo: top(0.42, 0.27) },
  { name: '1200x1200', width: 1200, height: 1200, from: ['square', 'wide'], logo: top(0.5, 0.22) },
  { name: '1280x550', width: 1280, height: 550, from: ['wide'], logo: top(0.38, 0.28) },
  { name: '1280x720', width: 1280, height: 720, from: ['wide'], logo: top(0.42, 0.27) },
  { name: '1280x2560', width: 1280, height: 2560, from: ['tall', 'square', 'wide'], logo: top(0.7, 0.14) },
  { name: '1920x1080', width: 1920, height: 1080, from: ['wide'], logo: top(0.42, 0.27) },
];

/** Built-in sizes, with store/banners.yaml applied: `sizes` adds or replaces by name, `skip` removes. */
export function bannerSpecs(config = {}) {
  const byName = new Map(BANNERS.map((b) => [b.name, b]));
  for (const s of config.sizes ?? []) {
    byName.set(s.name, { from: ['wide'], logo: null, ...byName.get(s.name), ...s });
  }
  for (const n of config.skip ?? []) byName.delete(String(n));
  return [...byName.values()];
}

/** Region of `src` (focus in 0..1) that covers a w×h frame without distortion. */
export function coverCrop(src, w, h, focus = { x: 0.5, y: 0.5 }) {
  const scale = Math.max(w / src.width, h / src.height);
  const cw = w / scale;
  const ch = h / scale;
  const x = Math.min(Math.max(focus.x * src.width - cw / 2, 0), src.width - cw);
  const y = Math.min(Math.max(focus.y * src.height - ch / 2, 0), src.height - ch);
  return { x, y, w: cw, h: ch, scale };
}

// Triangle filter widened when shrinking (antialiased bilinear). One entry per output pixel.
function weights(start, scale, n, size) {
  const support = Math.max(1, scale);
  const out = [];
  for (let i = 0; i < n; i++) {
    const center = start + (i + 0.5) * scale;
    const lo = Math.max(0, Math.floor(center - support));
    const hi = Math.min(size - 1, Math.ceil(center + support));
    const w = [];
    let total = 0;
    for (let j = lo; j <= hi; j++) {
      const v = Math.max(0, 1 - Math.abs(j + 0.5 - center) / support);
      w.push(v);
      total += v;
    }
    if (total === 0) out.push({ first: Math.min(size - 1, Math.max(0, Math.floor(center))), w: [1] });
    else out.push({ first: lo, w: w.map((v) => v / total) });
  }
  return out;
}

/** Resample the region `crop` of `img` to W×H (premultiplied alpha, so transparent edges stay clean). */
export function resample(img, crop, W, H) {
  const wx = weights(crop.x, crop.w / W, W, img.width);
  const wy = weights(crop.y, crop.h / H, H, img.height);
  const r0 = wy[0].first;
  const r1 = wy[H - 1].first + wy[H - 1].w.length - 1;
  const src = img.data;
  const tmp = new Float32Array((r1 - r0 + 1) * W * 4);
  for (let y = r0; y <= r1; y++) {
    for (let x = 0; x < W; x++) {
      const { first, w } = wx[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const o = (y * img.width + first + k) * 4;
        const wa = w[k] * src[o + 3];
        r += src[o] * wa;
        g += src[o + 1] * wa;
        b += src[o + 2] * wa;
        a += wa;
      }
      const t = ((y - r0) * W + x) * 4;
      tmp[t] = r;
      tmp[t + 1] = g;
      tmp[t + 2] = b;
      tmp[t + 3] = a;
    }
  }
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const { first, w } = wy[y];
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const t = ((first - r0 + k) * W + x) * 4;
        r += tmp[t] * w[k];
        g += tmp[t + 1] * w[k];
        b += tmp[t + 2] * w[k];
        a += tmp[t + 3] * w[k];
      }
      const o = (y * W + x) * 4;
      if (a > 0) {
        data[o] = Math.round(r / a);
        data[o + 1] = Math.round(g / a);
        data[o + 2] = Math.round(b / a);
      }
      data[o + 3] = Math.round(a);
    }
  }
  return { width: W, height: H, data };
}

/** Bounding box of pixels with alpha above `threshold`, or null when fully transparent. */
export function alphaBox(img, threshold = 8) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Copy of `img` cut to its non-transparent area. */
export function trim(img) {
  const box = alphaBox(img);
  if (!box || (box.w === img.width && box.h === img.height)) return img;
  return resample(img, box, box.w, box.h);
}

/** Draw `src` over `dst` at (dx, dy), source-over with straight alpha. Mutates dst. */
export function composite(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= dst.width) continue;
      const s = (y * src.width + x) * 4;
      const d = (ty * dst.width + tx) * 4;
      const sa = src.data[s + 3] / 255;
      if (sa === 0) continue;
      const da = (dst.data[d + 3] / 255) * (1 - sa);
      const oa = sa + da;
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round((src.data[s + c] * sa + dst.data[d + c] * da) / oa);
      dst.data[d + 3] = Math.round(oa * 255);
    }
  }
  return dst;
}

/** Size and position of the (trimmed) logo inside a banner. */
export function logoRect(spec, logo) {
  const { at, w, h, margin = 0.04 } = spec.logo;
  const scale = Math.min((spec.width * w) / logo.width, (spec.height * h) / logo.height);
  const lw = Math.max(1, Math.round(logo.width * scale));
  const lh = Math.max(1, Math.round(logo.height * scale));
  const m = Math.round(spec.height * margin);
  return { x: Math.round((spec.width - lw) / 2), y: at === 'bottom' ? spec.height - m - lh : m, w: lw, h: lh };
}

/**
 * One banner: cover-crop the first available source, then the logo. Returns { image, source, crop }.
 * `art` maps source name → decoded image; `focus` maps source name → {x, y}.
 */
export function renderBanner(spec, art, logo, focus = {}) {
  const source = spec.from.find((s) => art[s]);
  if (!source) return null;
  const src = art[source];
  const crop = coverCrop(src, spec.width, spec.height, focus[source]);
  const image = resample(src, crop, spec.width, spec.height);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255; // banners are opaque
  if (spec.logo && logo) {
    const r = logoRect(spec, logo);
    composite(image, resample(logo, { x: 0, y: 0, w: logo.width, h: logo.height }, r.w, r.h), r.x, r.y);
  }
  return { image, source, crop };
}
