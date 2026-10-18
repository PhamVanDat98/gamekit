// gamekit assets [thư mục…] [--write] [--json] — inventory of assets: by kind and size, formats a
// browser cannot use (and what to convert them to), files too big for the web, provenance labels.
// Without folders: the game's assets/ and public/. With folders: e.g. an export of the original game.
import fs from 'node:fs';
import path from 'node:path';
import { exists, walk, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { pngInfo } from './lib/png.mjs';
import { loadProvenance, SHIPPED_DIRS } from './validate.mjs';

const ASSETS_FILE = 'notes/assets.md';
const MB = 1048576;

/** ext → [kind, web-ready?, convert to]. */
const FORMATS = {
  png: ['hình', true], jpg: ['hình', true], jpeg: ['hình', true], webp: ['hình', true], gif: ['hình', true], svg: ['hình', true], avif: ['hình', true],
  psd: ['hình', false, 'png/webp'], tga: ['hình', false, 'png/webp'], dds: ['hình', false, 'png/webp'], bmp: ['hình', false, 'png/webp'],
  tif: ['hình', false, 'png/webp'], tiff: ['hình', false, 'png/webp'], exr: ['hình', false, 'png/webp (HDR → tone map)'], hdr: ['hình', false, 'png/webp'],
  ktx: ['hình', false, 'png/webp (hoặc KTX2/Basis cho 3D)'], pvr: ['hình', false, 'png/webp'], astc: ['hình', false, 'png/webp'],
  mp3: ['âm thanh', true], ogg: ['âm thanh', true], m4a: ['âm thanh', true], aac: ['âm thanh', true], opus: ['âm thanh', true], webm: ['âm thanh/video', true],
  wav: ['âm thanh', true, 'ogg/m4a (wav quá nặng cho web)'], aif: ['âm thanh', false, 'ogg/m4a'], aiff: ['âm thanh', false, 'ogg/m4a'], flac: ['âm thanh', false, 'ogg/m4a'],
  caf: ['âm thanh', false, 'ogg/m4a'], wma: ['âm thanh', false, 'ogg/m4a'], mid: ['âm thanh', false, 'render ra ogg/m4a'], midi: ['âm thanh', false, 'render ra ogg/m4a'],
  ttf: ['font', true, 'woff2 (nhẹ hơn)'], otf: ['font', true, 'woff2 (nhẹ hơn)'], woff: ['font', true], woff2: ['font', true], fnt: ['font', true],
  mp4: ['video', true], mov: ['video', false, 'mp4/webm'], avi: ['video', false, 'mp4/webm'], wmv: ['video', false, 'mp4/webm'],
  glb: ['3D', true], gltf: ['3D', true], fbx: ['3D', false, 'glb'], obj: ['3D', false, 'glb'], blend: ['3D', false, 'glb'], dae: ['3D', false, 'glb'],
  json: ['data', true], xml: ['data', true], txt: ['data', true], csv: ['data', true], atlas: ['data', true], plist: ['data', true], skel: ['data', true],
};
const LIMITS = { hình: 1 * MB, 'âm thanh': 1.5 * MB, other: 5 * MB };
const MAX_SIDE = 4096;

export function scanAssets(root, dirs) {
  const prov = root ? new Map((loadProvenance(root).entries ?? []).map((e) => [e.path, e.label])) : new Map();
  const files = [];
  for (const d of dirs) {
    const abs = path.resolve(root ?? process.cwd(), d);
    if (!exists(abs)) throw new GkError(`không có thư mục ${d}`);
    for (const rel of walk(abs)) {
      if (path.basename(rel) === '.gitkeep') continue;
      const full = path.join(abs, rel);
      const relToRoot = root ? toPosix(path.relative(root, full)) : toPosix(path.join(d, rel));
      const ext = path.extname(rel).slice(1).toLowerCase();
      const [kind, web, convert] = FORMATS[ext] ?? ['khác', null];
      const size = fs.statSync(full).size;
      const f = { path: relToRoot, ext, kind, size, web, convert: convert ?? null };
      if (ext === 'png') {
        try {
          const info = pngInfo(full);
          if (info) Object.assign(f, { width: info.width, height: info.height });
        } catch {
          /* unreadable PNG: validate reports it for icons */
        }
      }
      const shipped = root && SHIPPED_DIRS.some((s) => relToRoot.startsWith(`${s}/`));
      if (shipped) f.label = prov.get(relToRoot) ?? null;
      files.push(f);
    }
  }
  const byKind = {};
  for (const f of files) {
    const k = (byKind[f.kind] ??= { files: 0, bytes: 0 });
    k.files++;
    k.bytes += f.size;
  }
  const convert = files.filter((f) => f.web === false || (f.web && f.convert));
  const large = files.filter((f) => f.size > (LIMITS[f.kind] ?? LIMITS.other) || (f.width ?? 0) > MAX_SIDE || (f.height ?? 0) > MAX_SIDE);
  const shipped = files.filter((f) => 'label' in f);
  const labels = {};
  for (const f of shipped) labels[f.label ?? 'chưa có nhãn'] = (labels[f.label ?? 'chưa có nhãn'] ?? 0) + 1;
  return { dirs, files: files.length, bytes: files.reduce((s, f) => s + f.size, 0), byKind, convert, large, labels, unknown: files.filter((f) => f.kind === 'khác') };
}

const mb = (b) => `${(b / MB).toFixed(2)} MB`;
const sample = (list, n = 8) => list.slice(0, n).map((f) => f.path).join(', ') + (list.length > n ? ` … (+${list.length - n})` : '');

function lines(r, budgetMB) {
  const out = [['head', `Asset trong ${r.dirs.join(', ')}: ${r.files} file, ${mb(r.bytes)}`]];
  out.push(['info', 'Theo loại:']);
  for (const [k, v] of Object.entries(r.byKind).sort((a, b) => b[1].bytes - a[1].bytes)) out.push(['info', `  ${k}: ${v.files} file, ${mb(v.bytes)}`]);
  if (budgetMB && r.bytes > budgetMB * MB) out.push(['warn', `Tổng ${mb(r.bytes)} lớn hơn ngân sách tải đầu ${budgetMB} MB — chỉ nạp trước thứ cần cho màn đầu, phần còn lại tải sau`]);
  if (r.convert.length) {
    out.push(['info', '\nCần chuyển định dạng cho web:']);
    const groups = new Map();
    for (const f of r.convert) groups.set(`${f.ext} → ${f.convert}`, [...(groups.get(`${f.ext} → ${f.convert}`) ?? []), f]);
    for (const [g, list] of groups) out.push(['info', `  ${list[0].web === false ? '⚠ ' : ''}${g}: ${list.length} file (${sample(list, 4)})`]);
  }
  if (r.large.length) out.push(['warn', `File quá lớn cho web (hình > 1 MB hoặc > ${MAX_SIDE}px, âm thanh > 1.5 MB, khác > 5 MB): ${sample(r.large)}`]);
  if (r.unknown.length) out.push(['info', `Định dạng không nhận ra (${r.unknown.length}): ${sample(r.unknown, 5)}`]);
  if (Object.keys(r.labels).length)
    out.push([r.labels['chưa có nhãn'] ? 'warn' : 'ok', `Provenance: ${Object.entries(r.labels).map(([l, n]) => `${l} ${n}`).join(' · ')}${r.labels['chưa có nhãn'] ? ' — `gamekit provenance add <file…> --label <nhãn>`' : ''}`]);
  return out;
}

function markdown(r, budgetMB) {
  const body = lines(r, budgetMB)
    .slice(1)
    .map(([kind, text]) => (text.startsWith('\n') ? `\n### ${text.trim()}\n` : `${/^ {2}/.test(text) ? '  ' : ''}- ${kind === 'warn' ? '⚠ ' : ''}${text.trim()}`))
    .join('\n');
  const table = r.convert.length
    ? `\n\n## Danh sách cần chuyển\n\n| File | Dung lượng | Chuyển sang |\n| --- | --- | --- |\n${r.convert.map((f) => `| ${f.path} | ${mb(f.size)} | ${f.convert} |`).join('\n')}\n`
    : '';
  return `# Kiểm kê asset\n\n_Sinh bởi \`gamekit assets\` lúc ${nowIso()} — ${r.dirs.join(', ')}: ${r.files} file, ${mb(r.bytes)}._\n\n${body}${table}`;
}

export async function run(args) {
  const root = findGameRoot(args.cwd);
  const dirs = args._.length ? args._.map(String) : SHIPPED_DIRS.filter((d) => root && exists(path.join(root, d)));
  if (!dirs.length) throw new GkError('Dùng: gamekit assets [thư mục…] [--write] [--json] — trong thư mục game mặc định quét assets/ và public/');
  const r = scanAssets(root, dirs);
  const budgetMB = root ? loadGame(root).budget?.initialLoadMB : null;
  if (args.json) log.info(JSON.stringify(r, null, 2));
  else for (const [kind, text] of lines(r, budgetMB)) log[kind](text);
  if (args.write) {
    if (!root) throw new GkError('--write cần chạy trong thư mục game (có game.yaml)');
    const f = path.join(root, ASSETS_FILE);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, markdown(r, budgetMB));
    if (!args.json) log.ok(`Đã ghi ${ASSETS_FILE}`);
  }
  return 0;
}
