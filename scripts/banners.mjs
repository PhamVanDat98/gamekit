// gamekit banners — the store banner set in standard sizes, from key art + logo (store/art → store/banners).
import fs from 'node:fs';
import path from 'node:path';
import { exists, readYaml } from './lib/io.mjs';
import { log, GkError, Problems } from './lib/log.mjs';
import { findGameRoot } from './lib/game.mjs';
import { check } from './lib/schema.mjs';
import { decodePng, encodePng, pngInfo } from './lib/png.mjs';
import { SOURCES, BANNERS, bannerSpecs, coverCrop, renderBanner, trim } from './lib/banners.mjs';

const ART_DIR = 'store/art';
const OUT_DIR = 'store/banners';
const CONFIG = 'store/banners.yaml';
// Below this share of the source kept on one axis, the banner loses too much of the composition.
const MIN_KEPT = 0.6;

export async function run(args) {
  const cwd = args.cwd ?? process.cwd();
  const root = findGameRoot(cwd) ?? cwd;
  const out = path.resolve(cwd, args.out ?? path.join(root, OUT_DIR));
  const specs = loadSpecs(root, args);

  if (args.list) {
    for (const s of specs) {
      const logo = s.logo ? `logo ${s.logo.at === 'bottom' ? 'dưới' : 'trên'}` : 'không logo';
      log.info(`${`${s.name}.png`.padEnd(18)} ${`${s.width}×${s.height}`.padEnd(10)} ${logo.padEnd(11)} nguồn: ${s.from.join(' > ')}`);
    }
    log.info(`${'Logo.png'.padEnd(18)} logo nền trong suốt, đã cắt sát`);
    return 0;
  }
  if (args.check) return checkBanners(out, specs) ? 0 : 1;
  return generate(root, cwd, out, specs, args);
}

function loadSpecs(root, args) {
  const file = path.join(root, CONFIG);
  const config = exists(file) ? readYaml(file) : {};
  const errs = check('banners', config);
  if (errs.length) throw new GkError(`${CONFIG} không hợp lệ: ${errs.join('; ')}`);
  const known = new Set(BANNERS.map((b) => b.name));
  for (const s of config.sizes ?? []) {
    if (!known.has(s.name) && !(s.width && s.height)) throw new GkError(`${CONFIG}: kích thước mới "${s.name}" cần width và height`);
  }
  let specs = bannerSpecs(config);
  if (args.only) {
    const want = String(args.only).split(',').map((s) => s.trim().replace(/\.png$/i, ''));
    const unknown = want.filter((n) => n !== 'Logo' && !specs.some((s) => s.name === n));
    if (unknown.length) throw new GkError(`Không có kích thước: ${unknown.join(', ')} (xem \`gamekit banners --list\`)`);
    specs = specs.filter((s) => want.includes(s.name));
    specs.withLogo = want.includes('Logo');
    specs.filtered = true;
  } else specs.withLogo = true;
  specs.focus = config.focus ?? {};
  return specs;
}

function readArt(file, label) {
  try {
    return decodePng(fs.readFileSync(file));
  } catch (e) {
    throw new GkError(`${label}: ${e.message}. Ảnh nguồn phải là PNG (đổi JPG/WebP sang PNG trước).`);
  }
}

function generate(root, cwd, out, specs, args) {
  const pr = new Problems();
  const rel = (f) => path.relative(cwd, f) || '.';
  // Source art: --wide/--square/--tall/--icon/--logo, else store/art/<name>.png.
  const art = {};
  for (const s of SOURCES) {
    const f = args[s] ? path.resolve(cwd, args[s]) : path.join(root, ART_DIR, `${s}.png`);
    if (args[s] && !exists(f)) throw new GkError(`Không có ${args[s]}`);
    if (exists(f)) art[s] = Object.assign(readArt(f, rel(f)), { file: rel(f) });
  }
  const logoFile = args.logo ? path.resolve(cwd, args.logo) : path.join(root, ART_DIR, 'logo.png');
  if (args.logo && !exists(logoFile)) throw new GkError(`Không có ${args.logo}`);
  let logo = null;
  if (exists(logoFile)) {
    const raw = readArt(logoFile, rel(logoFile));
    if (raw.data.every((v, i) => i % 4 !== 3 || v === 255)) pr.warn(rel(logoFile), 'logo không có nền trong suốt — banner sẽ dán cả khung nền; xuất lại logo PNG nền trong suốt');
    logo = trim(raw);
  }
  if (!Object.keys(art).length) {
    throw new GkError(`Chưa có ảnh nguồn. Đặt key art vào ${ART_DIR}/wide.png (ngang, ≥ 1920×1080, không chữ) — tuỳ chọn square.png, tall.png, icon.png, logo.png — hoặc dùng --wide <file>.`);
  }
  if (!logo && specs.some((s) => s.logo)) pr.warn(rel(logoFile), `chưa có logo — banner cần logo sẽ ra không có logo. Đặt logo PNG nền trong suốt vào ${ART_DIR}/logo.png hoặc dùng --logo <file>`);

  fs.mkdirSync(out, { recursive: true });
  const small = new Map(); // source → { scale, banners } when it has to be enlarged
  const made = [];
  const cropped = new Map(); // better-suited source that is missing ('' = none) → banners cut hard
  for (const spec of specs) {
    const r = renderBanner(spec, art, logo, specs.focus);
    if (!r) {
      pr.error(`${spec.name}.png`, `cần một trong các ảnh nguồn: ${spec.from.map((f) => `${ART_DIR}/${f}.png`).join(', ')}`);
      continue;
    }
    const file = path.join(out, `${spec.name}.png`);
    fs.writeFileSync(file, encodePng(r.image));
    made.push(`${spec.name}.png ← ${r.source}`);
    const src = art[r.source];
    if (r.crop.scale > 1.02) {
      const s = small.get(r.source) ?? { scale: 1, banners: [] };
      s.scale = Math.max(s.scale, r.crop.scale);
      s.banners.push(spec.name);
      small.set(r.source, s);
    }
    const kept = Math.min(r.crop.w / src.width, r.crop.h / src.height);
    if (kept < MIN_KEPT) {
      const better = spec.width < spec.height ? 'tall' : spec.width === spec.height ? 'square' : 'wide';
      const key = better !== r.source && !art[better] ? better : '';
      cropped.set(key, [...(cropped.get(key) ?? []), `${spec.name} (giữ ${Math.round(kept * 100)}% ảnh ${r.source})`]);
    }
  }
  for (const [better, list] of cropped) {
    if (better) pr.warn(`${ART_DIR}/${better}.png`, `chưa có — ${list.join(', ')} phải cắt nhiều; thêm ảnh ${better === 'tall' ? 'dọc' : 'vuông'} để bố cục đẹp hơn`);
    else pr.warn(list.join(', '), 'phải cắt nhiều ảnh nguồn — xem lại bằng mắt');
  }
  for (const [source, s] of small) {
    const a = art[source];
    pr.warn(a.file, `nhỏ (${a.width}×${a.height}), phải phóng to cho ${s.banners.join(', ')} — sẽ mờ. Cần ảnh ≥ ${Math.ceil(a.width * s.scale)}×${Math.ceil(a.height * s.scale)}`);
  }
  if (logo && specs.withLogo) {
    fs.writeFileSync(path.join(out, 'Logo.png'), encodePng(logo));
    made.push('Logo.png ← logo');
  }
  if (made.length) log.ok(`Đã tạo ${made.length} file trong ${rel(out)}:\n  ${made.join('\n  ')}`);
  const ok = pr.report('banners');
  if (ok) log.info('Mở từng ảnh xem lại: logo không che nhân vật, không mất chi tiết quan trọng khi cắt. Chỉnh `focus` trong store/banners.yaml nếu cần.');
  return ok ? 0 : 1;
}

/** Every banner present as PNG of the exact size; Logo.png transparent. */
export function checkBanners(out, specs) {
  const pr = new Problems();
  const where = (n) => `${path.basename(out)}/${n}`;
  if (!exists(out)) {
    pr.error(where(''), 'chưa có banner — chạy `gamekit banners`');
    return pr.report('banners --check');
  }
  for (const s of specs) {
    const f = path.join(out, `${s.name}.png`);
    if (!exists(f)) {
      pr.error(where(`${s.name}.png`), 'thiếu');
      continue;
    }
    const info = pngInfo(f);
    if (!info) pr.error(where(`${s.name}.png`), 'không phải PNG');
    else if (info.width !== s.width || info.height !== s.height) pr.error(where(`${s.name}.png`), `kích thước ${info.width}×${info.height}, cần ${s.width}×${s.height}`);
  }
  if (specs.withLogo) {
    const f = path.join(out, 'Logo.png');
    const info = exists(f) && pngInfo(f);
    if (!exists(f)) pr.error(where('Logo.png'), 'thiếu');
    else if (!info) pr.error(where('Logo.png'), 'không phải PNG');
    else if (info.alpha === false) pr.warn(where('Logo.png'), 'không có kênh trong suốt');
  }
  if (specs.filtered) return pr.report('banners --check');
  const expected = new Set([...specs.map((s) => `${s.name}.png`), 'Logo.png']);
  for (const f of fs.readdirSync(out)) if (!expected.has(f)) pr.warn(where(f), 'không thuộc bộ banner chuẩn');
  return pr.report('banners --check');
}
