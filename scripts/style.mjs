// gamekit style analyze|check — measure an art style from reference images, then check new assets against it.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot } from './lib/game.mjs';
import { decodePng, encodePng } from './lib/png.mjs';
import { analyzeImage, checkAgainst, combineAnalyses, fromHex } from './lib/style.mjs';

export const STYLE_DIR = 'art/style';
const USAGE = 'Dùng: gamekit style analyze <ảnh|thư mục…> [--out art/style] [--name "Tên style"] · gamekit style check <ảnh|thư mục…> [--style art/style/analysis.json]';

/** PNG files from the arguments (folders: their PNGs). Other formats get the conversion hint. */
export function collectImages(base, args) {
  const files = [];
  for (const a of args) {
    const abs = path.resolve(base, a);
    if (!exists(abs)) throw new GkError(`Không có ${a}`);
    const list = fs.statSync(abs).isDirectory() ? fs.readdirSync(abs).sort().map((f) => path.join(abs, f)) : [abs];
    for (const f of list) {
      if (/\.png$/i.test(f)) files.push(f);
      else if (/\.(jpe?g|webp|gif|bmp|avif|tiff?|psd)$/i.test(f))
        throw new GkError(`${path.basename(f)}: chỉ đọc PNG. Đổi sang PNG trước — macOS: sips -s format png "${path.basename(f)}" --out x.png · ImageMagick: magick "${path.basename(f)}" x.png · hoặc mở và lưu lại dạng PNG`);
    }
  }
  if (!files.length) throw new GkError(`Không có ảnh PNG nào. ${USAGE}`);
  return files;
}

function load(file) {
  try {
    return analyzeImage(decodePng(fs.readFileSync(file)));
  } catch (e) {
    throw new GkError(`${path.basename(file)}: ${e.message}`);
  }
}

/** Palette swatches, widths by share, with the outline colour as a strip underneath. */
function paletteImage(style) {
  const W = 640;
  const H = 96;
  const INK = 24;
  const data = new Uint8Array(W * (H + INK) * 4);
  const total = style.palette.reduce((s, c) => s + c.share, 0);
  let x0 = 0;
  for (const c of style.palette) {
    const x1 = Math.min(W, Math.round(x0 + (c.share / total) * W) || x0 + 1);
    const rgb = fromHex(c.hex);
    for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) data.set([...rgb, 255], (y * W + x) * 4);
    x0 = x1;
  }
  const ink = style.outline.present ? fromHex(style.outline.hex) : [0, 0, 0];
  for (let y = H; y < H + INK; y++) for (let x = 0; x < W; x++) data.set([...ink, style.outline.present ? 255 : 0], (y * W + x) * 4);
  return encodePng(W, H + INK, data);
}

const TODO = (q) => `_(AI nhìn ảnh rồi điền: ${q})_`;

/** Draft style guide: measured sections filled, visual sections as questions for whoever looks at the images. */
export function styleDoc(name, sources, s) {
  const o = s.outline;
  const outline =
    o.present == null
      ? '- Không đo được (ảnh có nền phức tạp). Đo lại trên ảnh nhân vật/vật thể nền trong suốt hoặc nền phẳng.'
      : o.present
        ? `- Có nét viền, màu \`${o.hex}\`, dày **${o.thicknessPct}% chiều cao vật thể** (nhân vật cao 300 px → ~${Math.max(1, Math.round(o.thicknessPct * 3))} px). Nét trong (mắt, nếp, chi tiết): ${o.innerLines}% diện tích bên trong.`
        : '- Không có nét viền: hình tách nhau bằng màu và độ sáng.';
  return `# Phong cách đồ hoạ: ${name}

> Phân tích từ ${sources.length} ảnh: ${sources.map((f) => `\`${f}\``).join(', ')}. Số liệu đo: \`analysis.json\` (\`gamekit style analyze\`), bảng màu: \`palette.png\`.
> Mục **(đo)** do script viết, đừng sửa tay — chạy lại analyze. Mục **(nhìn)** do AI điền sau khi xem ảnh; người dùng duyệt cả tài liệu.
> Học **phong cách** (màu, nét, hình khối, cách tô), không chép nhân vật, logo, bố cục hay chi tiết nhận diện của ảnh tham khảo.

## 1. Tóm tắt (nhìn)
${TODO('một câu đủ để hoạ sĩ khác vẽ đúng style — vd "chibi tròn, nét nâu đậm đều, màu phẳng pastel ấm, không đổ bóng"')}

## 2. Bảng màu (đo)
| Màu | Diện tích | Vai trò (nhìn) |
| --- | --- | --- |
${s.palette.map((c) => `| \`${c.hex}\` | ${c.share}% | ${TODO('nền chính / bóng / điểm nhấn / nét…')} |`).join('\n')}

- ${s.coverage90} màu phủ 90% diện tích. Độ sáng trung bình L* ${s.value.meanL}, tương phản ${s.value.contrast}. Độ bão hoà trung bình ${s.colour.meanChroma} (${s.colour.saturated}% pixel rất rực), ${s.colour.warm ?? '—'}% màu nóng.
- Quy tắc màu (nhìn): ${TODO('bóng được tạo bằng cách nào — tối đi cùng hue, ngả tím/xanh, hay không có bóng; màu điểm nhấn dùng ở đâu')}

## 3. Nét (đo + nhìn)
${outline}
- Chất nét (nhìn): ${TODO('đều hay thay đổi độ dày, đầu nét tròn/nhọn, nét màu hay nét đen, nét có hở/chồng không')}

## 4. Cách tô (đo + nhìn)
- ${s.rendering}: ${s.flatness}% pixel là màu phẳng.
- ${TODO('có highlight không, hình gì; bóng một tầng hay nhiều tầng, cạnh bóng cứng hay mềm; có texture, grain, gradient nền không')}

## 5. Hình khối và tỉ lệ (nhìn)
- Ngôn ngữ hình khối: ${TODO('tròn mềm / vuông chắc / tam giác nhọn; tỉ lệ khối lớn–vừa–nhỏ')}
- Tỉ lệ nhân vật: ${TODO('đầu : thân (vd 1:1 chibi, 1:3 cartoon); tay chân dạng ống/giọt; bàn tay mấy ngón')}
- Khuôn mặt, mắt: ${TODO('mắt chấm/oval/to có highlight; miệng; má hồng')}
- Mức chi tiết: ${TODO('ít chi tiết đọc được ở cỡ nhỏ, hay nhiều chi tiết; chi tiết nhỏ nhất bao nhiêu px ở cỡ hiển thị')}
- Silhouette: tỉ lệ khung ${s.subject.aspect}, lấp đầy ${Math.round(s.subject.fill * 100)}% khung (đo).

## 6. Ánh sáng và không khí (nhìn)
${TODO('hướng sáng, ánh sáng ấm/lạnh, tâm trạng chung')}

## 7. Làm / Không làm (nhìn)
- Làm: ${TODO('3–5 điều bắt buộc giữ')}
- Không làm: ${TODO('3–5 lỗi dễ mắc khi bắt chước style này, gồm cả "không chép nhân vật/logo gốc"')}

## 8. Prompt style cho model ảnh (Codex)
Dán khối này vào mọi yêu cầu tạo ảnh, kèm 1–2 ảnh tham khảo (\`--image\`); phần chủ thể viết riêng cho từng asset:
\`\`\`
Art style: ${TODO('tóm tắt mục 1 bằng tiếng Anh')}.
Palette: ${s.palette.slice(0, 8).map((c) => c.hex).join(', ')}${o.present ? `; outline ${o.hex}` : ''}.
${o.present ? `Outline: solid ${o.hex}, about ${o.thicknessPct}% of the object's height, ${TODO('even/varying')}.` : 'No outline: shapes separated by colour and value.'}
Rendering: ${s.flatness >= 85 ? 'flat colours' : s.flatness >= 60 ? 'cel shading' : 'soft painted gradients'} — ${TODO('shading rule in English')}.
Shapes and proportions: ${TODO('mục 5 bằng tiếng Anh')}.
Transparent background, no text, no logo. Design a new subject; do not copy any character from the reference images.
\`\`\`

## 9. Vẽ bằng code (vector)
\`\`\`ts
export const STYLE = {
${s.palette
  .slice(0, 8)
  .map((c, i) => `  c${i + 1}: '${c.hex}', // ${c.share}% — đặt tên theo vai trò ở mục 2`)
  .join('\n')}
${o.present ? `  ink: '${o.hex}',\n  inkWidth: (height: number) => Math.max(1, height * ${o.thicknessPct / 100}),` : ''}
};
\`\`\`

## 10. Chuyển động hợp style (nhìn, cho skill animate)
${TODO('tròn mềm → squash/stretch mạnh, nảy nhiều; góc cạnh → dứt khoát, ít nảy; vẽ tay → step 12')}
`;
}

function printSummary(s) {
  log.info(`  ${s.rendering} (${s.flatness}% màu phẳng), ${s.coverage90} màu phủ 90%`);
  log.info(`  bảng màu: ${s.palette.slice(0, 10).map((c) => `${c.hex} ${c.share}%`).join(' · ')}`);
  const o = s.outline;
  log.info(`  nét viền: ${o.present == null ? 'không đo được (nền phức tạp)' : o.present ? `${o.hex}, dày ${o.thicknessPct}% chiều cao, nét trong ${o.innerLines}%` : 'không có'}`);
  log.info(`  sáng L* ${s.value.meanL} (tương phản ${s.value.contrast}) · bão hoà ${s.colour.meanChroma} · ${s.colour.warm ?? '—'}% màu nóng`);
}

async function analyze(args, base, root) {
  const files = collectImages(base, args._.slice(1));
  const out = path.resolve(root, args.out ? String(args.out) : STYLE_DIR);
  const each = files.map((f) => ({ file: path.basename(f), a: load(f) }));
  const style = combineAnalyses(each.map((e) => e.a));
  // Colours added on purpose for new subjects survive a re-analysis.
  const previous = exists(path.join(out, 'analysis.json')) ? readJson(path.join(out, 'analysis.json')).style : null;
  if (previous?.extraPalette?.length) style.extraPalette = previous.extraPalette;
  // Per-image numbers without the sampled pixels (working data).
  const sources = each.map(({ file, a: { samples: _pixels, ...rest } }) => ({ file, ...rest }));
  writeJson(path.join(out, 'analysis.json'), { version: 1, name: args.name ? String(args.name) : null, sources, style });
  fs.writeFileSync(path.join(out, 'palette.png'), paletteImage(style));
  const rel = path.relative(root, out) || '.';
  log.head(`Phong cách từ ${files.length} ảnh`);
  printSummary(style);
  for (const { file, a } of each) if (a.background === 'none') log.warn(`${file}: ảnh có nền phức tạp — bảng màu gồm cả nền; nét viền không đo được`);
  log.ok(`${rel}/analysis.json, ${rel}/palette.png`);
  const doc = path.join(out, 'style.md');
  if (exists(doc)) log.info(`${rel}/style.md đã có, giữ nguyên (bản nháp mới: ${rel}/style.draft.md)`);
  fs.writeFileSync(exists(doc) ? path.join(out, 'style.draft.md') : doc, styleDoc(args.name ? String(args.name) : path.basename(root), each.map((e) => e.file), style));
  log.info(`Tiếp: AI xem ảnh và điền các mục "(nhìn)" trong ${rel}/style.md; người dùng duyệt; asset mới chấm bằng gamekit style check <ảnh…>`);
  return 0;
}

async function checkCmd(args, base, root) {
  const files = collectImages(base, args._.slice(1));
  const styleFile = path.resolve(root, args.style ? String(args.style) : path.join(STYLE_DIR, 'analysis.json'));
  if (!exists(styleFile)) throw new GkError(`Chưa có ${path.relative(root, styleFile)} — chạy gamekit style analyze <ảnh tham khảo…> trước`);
  const { style } = readJson(styleFile);
  let bad = 0;
  for (const f of files) {
    const r = checkAgainst(style, load(f));
    const name = path.relative(base, f);
    if (r.errors.length) bad++;
    (r.errors.length ? log.fail : r.warnings.length ? log.warn : log.ok)(`${name}: khớp bảng màu ${r.metrics.paletteFit}%`);
    for (const e of r.errors) log.info(`    ✘ ${e}`);
    for (const w of r.warnings) log.info(`    ⚠ ${w}`);
  }
  log.info('');
  if (bad) log.fail(`style: ${bad}/${files.length} ảnh lệch phong cách`);
  else log.ok(`style: ${files.length} ảnh đúng phong cách`);
  return bad ? 1 : 0;
}

export async function run(args) {
  const base = args.cwd ?? process.cwd();
  const root = findGameRoot(base) ?? base;
  const sub = args._[0];
  if (sub === 'analyze') return analyze(args, base, root);
  if (sub === 'check') return checkCmd(args, base, root);
  throw new GkError(USAGE);
}
