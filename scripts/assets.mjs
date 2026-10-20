// gamekit assets analyze|check|review|bleed — how art is used (tile, 9-slice, sheet, sizes) and
// whether a whole set looks like one game. See skills/art-review.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, writeJson, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot } from './lib/game.mjs';
import { decodePng, encodePng } from './lib/png.mjs';
import { analyzeArt, bleed, checkArt } from './lib/art.mjs';
import { overview, reviewSet } from './lib/cohesion.mjs';
import { collectImages } from './style.mjs';

const USAGE = `Dùng:
  gamekit assets analyze <ảnh|thư mục…> [--manifest]      Kỹ thuật từng ảnh (tile, 9-slice, sheet…), gợi ý mục asset-manifest
  gamekit assets check                                    Asset trong asset-manifest.json có dùng được đúng như khai báo
  gamekit assets review [<ảnh|thư mục…>] [--scale 0.5] [--out art/review]   Đánh giá cả bộ + ảnh tổng quan
  gamekit assets bleed <ảnh|thư mục…> [--out thư-mục]     Sửa viền tối khi co giãn (alpha bleed)`;

const MANIFEST = 'asset-manifest.json';
const load = (file) => {
  try {
    return decodePng(fs.readFileSync(file));
  } catch (e) {
    throw new GkError(`${path.basename(file)}: ${e.message}`);
  }
};
const idOf = (file) => path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const readManifest = (root) => (exists(path.join(root, MANIFEST)) ? readJson(path.join(root, MANIFEST)) : null);

function analyze(args, base, root) {
  const files = collectImages(base, args._.slice(1));
  const suggestions = [];
  for (const f of files) {
    const img = load(f);
    const r = analyzeArt(img);
    log.head(`${path.relative(base, f)}  ${img.width}×${img.height}`);
    log.info(`  ${r.techniques.join(' · ')}`);
    for (const n of r.notes) (n.level === 'error' ? log.fail : n.level === 'warn' ? log.warn : log.dim)(`  ${n.msg}`);
    suggestions.push({ id: idOf(f), path: toPosix(path.relative(root, f)), ...r.suggest });
  }
  if (args.json) log.info(JSON.stringify(suggestions, null, 2));
  if (args.manifest) {
    const file = path.join(root, MANIFEST);
    const man = readManifest(root) ?? { $schema: './.gamekit/schemas/asset-manifest.schema.json', assets: [] };
    const known = new Set(man.assets.map((a) => a.id));
    const added = suggestions.filter((s) => !known.has(s.id));
    man.assets.push(...added);
    writeJson(file, man);
    log.ok(`${MANIFEST}: thêm ${added.length} mục (đã có ${suggestions.length - added.length}). width/height = cỡ file — nếu file là @2x, sửa thành cỡ hiển thị @1x và thêm "scales": [2]`);
  } else log.info(`\nThêm vào ${MANIFEST}: gamekit assets analyze … --manifest`);
  return 0;
}

function check(args, root) {
  const man = readManifest(root);
  if (!man) throw new GkError(`Chưa có ${MANIFEST}. Tạo: gamekit assets analyze <ảnh…> --manifest`);
  let bad = 0;
  let checked = 0;
  for (const a of man.assets) {
    const file = path.join(root, a.path);
    if (!exists(file) || !/\.png$/i.test(file)) continue;
    checked++;
    const r = checkArt(a, load(file));
    if (r.errors.length) bad++;
    (r.errors.length ? log.fail : r.warnings.length ? log.warn : log.ok)(`${a.id} (${a.path})`);
    for (const e of r.errors) log.info(`    ✘ ${e}`);
    for (const w of r.warnings) log.info(`    ⚠ ${w}`);
  }
  log.info('');
  if (!checked) log.ok('Chưa có file PNG nào của manifest trên đĩa.');
  else if (bad) log.fail(`assets: ${bad}/${checked} asset không dùng được như khai báo`);
  else log.ok(`assets: ${checked} asset dùng được như khai báo`);
  return bad ? 1 : 0;
}

/** The set to review: given files (display = file size × --scale), else the manifest's PNGs. */
function reviewItems(args, base, root) {
  const scale = args.scale ? Number(args.scale) : 1;
  if (!(scale > 0)) throw new GkError('--scale phải > 0 (0.5 = file là @2x)');
  if (args._.length > 1)
    return collectImages(base, args._.slice(1)).map((f) => {
      const img = load(f);
      return { id: idOf(f), file: f, kind: analyzeArt(img).suggest.kind, img, display: [img.width * scale, img.height * scale], entry: null };
    });
  const man = readManifest(root);
  if (!man) throw new GkError(`Chưa có ${MANIFEST} — đưa ảnh vào lệnh (gamekit assets review <thư mục>) hoặc tạo manifest`);
  return man.assets
    .filter((a) => exists(path.join(root, a.path)) && /\.png$/i.test(a.path))
    .map((a) => {
      const img = load(path.join(root, a.path));
      // A sheet's height is one frame's; width/height of the entry are the size on screen at @1x.
      return { id: a.id, file: path.join(root, a.path), kind: a.kind, img, display: [a.frames ? a.frames.width * a.frames.count : a.width, a.height], entry: a };
    });
}

function reviewDoc(result, out) {
  const { rows, issues, summary } = result;
  const fmt = (v, unit = '') => (v == null ? '—' : `${v}${unit}`);
  const lines = [
    '# Đánh giá tổng quan bộ art',
    '',
    `> \`gamekit assets review\` — ảnh tổng quan: \`${out}/overview.png\` (số trên ảnh = số trong bảng). Mục **(nhìn)** do AI điền sau khi xem ảnh tổng quan; người dùng duyệt.`,
    '',
    `**${summary.count} asset · ${summary.errors} lỗi · ${summary.warnings} cảnh báo.** Độ nét chung ~${fmt(summary.density)} px chi tiết / px hiển thị · nét viền trên màn hình ~${fmt(summary.lineWidth, ' px')} · mép ${fmt(summary.edges)}.`,
    '',
    '| # | Asset | Loại | Hiển thị @1x | Kỹ thuật | Độ nét | Nét viền | Khớp màu |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (r, i) =>
        `| ${i + 1} | ${r.id} | ${r.kind} | ${Math.round(r.display[0])}×${Math.round(r.display[1])} | ${r.art.techniques.join('; ')} | ${r.density} | ${fmt(r.line, ' px')} | ${fmt(r.paletteFit, '%')} |`,
    ),
    '',
    '## Vấn đề (đo)',
    ...(issues.length ? issues.map((i) => `- ${i.level === 'error' ? '✘' : i.level === 'warn' ? '⚠' : '·'} ${i.id ? `**${i.id}**: ` : ''}${i.msg}`) : ['- Không có.']),
    '',
    '## Nhìn tổng quan (nhìn)',
    'Mở `overview.png`, trả lời từng câu; ghi số asset lạc:',
    '- Góc nhìn/phối cảnh: mọi thứ cùng một góc (ngang, 3/4, từ trên)? Đường chân trời, độ nghiêng mặt đất có khớp?',
    '- Tỉ lệ: nhân vật, vật phẩm, cửa, bậc thang có đúng cỡ tương đối với nhau không (hàng đứng trên nền vẽ đúng tỉ lệ thật)?',
    '- Ngôn ngữ hình khối: cùng độ tròn/góc cạnh? Có asset nào chi tiết hơn hẳn (trông như ảnh chụp giữa tranh vẽ)?',
    '- Ánh sáng: cùng hướng, cùng nhiệt độ màu? Bóng đổ cùng kiểu?',
    '- Đọc được khi chơi: vật tương tác nổi khỏi nền? UI tách khỏi thế giới game mà vẫn cùng họ?',
    '- Mối nối: nền lặp đôi, tile 3×3 có lộ đường nối? Khung UI kéo dài có méo góc?',
    '',
    '## Kết luận (bạn duyệt)',
    '- [ ] Cả bộ trông như một game',
  ];
  return lines.join('\n') + '\n';
}

function review(args, base, root) {
  const items = reviewItems(args, base, root);
  if (!items.length) throw new GkError('Không có asset PNG nào để đánh giá');
  const stylePath = path.join(root, 'art/style/analysis.json');
  const style = exists(stylePath) ? readJson(stylePath).style : null;
  const result = reviewSet(items, { style });
  const out = path.resolve(root, args.out ? String(args.out) : 'art/review');
  fs.mkdirSync(out, { recursive: true });
  const pic = overview(result.rows);
  fs.writeFileSync(path.join(out, 'overview.png'), encodePng(pic.width, pic.height, pic.data));
  const rel = toPosix(path.relative(root, out)) || '.';
  fs.writeFileSync(path.join(out, 'review.md'), reviewDoc(result, rel));
  writeJson(path.join(out, 'review.json'), {
    summary: result.summary,
    assets: result.rows.map((r, i) => ({ n: i + 1, id: r.id, kind: r.kind, display: r.display.map(Math.round), techniques: r.art.techniques, density: r.density, line: r.line, paletteFit: r.paletteFit ?? null, light: r.light, edge: r.edge })),
    issues: result.issues,
  });
  log.head(`Tổng quan ${result.summary.count} asset${style ? ' (so với art/style)' : ''}`);
  for (const i of result.issues) (i.level === 'error' ? log.fail : i.level === 'warn' ? log.warn : log.dim)(`${i.id ? `${i.id}: ` : ''}${i.msg}`);
  if (!result.issues.length) log.ok('không thấy chỗ lệch nào đo được');
  log.ok(`${rel}/overview.png (${pic.width}×${pic.height}), ${rel}/review.md`);
  log.info('Tiếp: xem overview.png và điền mục "Nhìn tổng quan" trong review.md; người dùng duyệt.');
  return result.summary.errors ? 1 : 0;
}

function bleedCmd(args, base) {
  const files = collectImages(base, args._.slice(1));
  const outDir = args.out ? path.resolve(base, String(args.out)) : null;
  for (const f of files) {
    const fixed = bleed(load(f));
    const dest = outDir ? path.join(outDir, path.basename(f)) : f;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, encodePng(fixed.width, fixed.height, fixed.data));
  }
  log.ok(`Đã bleed ${files.length} ảnh${outDir ? ` → ${path.relative(base, outDir) || '.'}` : ' (ghi đè)'}: phần nhìn thấy không đổi, hết viền tối khi co giãn`);
  return 0;
}

export async function run(args) {
  const base = args.cwd ?? process.cwd();
  const root = findGameRoot(base) ?? base;
  const sub = args._[0];
  if (sub === 'analyze') return analyze(args, base, root);
  if (sub === 'check') return check(args, root);
  if (sub === 'review') return review(args, base, root);
  if (sub === 'bleed') return bleedCmd(args, base);
  throw new GkError(USAGE);
}
