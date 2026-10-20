// gamekit recon [path] [--write] [--json] — which engine the original game uses, where its logic and
// data live, what it contains. Reads a folder, or an APK/XAPK/IPA/AAB/zip without unpacking it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exists, walk, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot, loadGame, updateGame } from './lib/game.mjs';
import { detect } from './lib/recon.mjs';
import { listZip, readZipEntry } from './lib/unzip.mjs';

const ARCHIVE = /\.(apk|xapk|apks|aab|ipa|zip|obb)$/i;

function head(file, max) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(max);
    return buf.subarray(0, fs.readSync(fd, buf, 0, max, 0));
  } finally {
    fs.closeSync(fd);
  }
}

/** { files: [{ path, size }], read(path, max) } for a folder or an archive. */
export function openSource(src) {
  if (!exists(src)) throw new GkError(`Không có ${src}`);
  if (fs.statSync(src).isDirectory()) {
    const files = walk(src, { ignore: ['.git', 'node_modules', 'Library', 'Temp', 'obj'] }).map((p) => ({ path: p, size: fs.statSync(path.join(src, p)).size }));
    return { files, read: (p, max) => head(path.join(src, p), max), cleanup() {} };
  }
  if (!ARCHIVE.test(src)) {
    // A single file (a .swf, a .pck, an exe…): judge it by itself.
    const size = fs.statSync(src).size;
    const name = path.basename(src);
    return { files: [{ path: name, size }], read: (_, max) => head(src, max), cleanup() {} };
  }
  const tmp = [];
  const skipped = [];
  const files = [];
  const sources = new Map(); // listed path → [archive file, entry]
  const add = (archive, prefix) => {
    for (const e of listZip(archive)) {
      if (e.name.endsWith('/')) continue;
      const p = prefix + e.name;
      files.push({ path: p, size: e.size });
      sources.set(p, [archive, e]);
      if (/\.apk$/i.test(e.name) && !prefix) {
        // XAPK/APKS hold the real APKs: unpack them to a temp file and list them too, under "<name>.apk!/".
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-recon-'));
        tmp.push(dir);
        const f = path.join(dir, path.basename(e.name));
        try {
          fs.writeFileSync(f, readZipEntry(archive, e, { limit: 2 * 1024 ** 3 }));
          add(f, `${e.name}!/`);
        } catch (err) {
          skipped.push(`${e.name}: ${err.message}`); // one broken split APK must not hide the others
        }
      }
    }
  };
  const cleanup = () => tmp.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  try {
    add(src, '');
  } catch (err) {
    cleanup();
    throw err;
  }
  const read = (p, max) => {
    const s = sources.get(p);
    if (!s || s[1].size > 64 * 1024 * 1024) return null;
    return readZipEntry(s[0], s[1]).subarray(0, max);
  };
  return { files, read, skipped, cleanup };
}

export function recon(src) {
  const s = openSource(src);
  try {
    return { path: src, ...detect(s.files, s.read), skipped: s.skipped ?? [] };
  } finally {
    s.cleanup();
  }
}

const MB = (n) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;
const KIND_LABEL = { code: 'code', image: 'hình', audio: 'âm thanh', video: 'video', font: 'font', data: 'dữ liệu', other: 'khác' };

export function reportMarkdown(r) {
  const L = [];
  L.push(`# Recon: ${path.basename(r.path)}`, '');
  L.push(`- Nguồn: \`${r.path}\` (${r.source ? 'project gốc — có source' : 'bản build'})`);
  L.push(`- Engine: **${r.name}**${r.version ? ` ${r.version}` : ''} → \`source.engine: ${r.engine}\``);
  if (r.backend) L.push(`- Scripting backend: ${r.backend}`);
  if (r.evidence.length) L.push(`- Dấu hiệu: ${r.evidence.map((e) => `\`${e}\``).join(', ')}`);
  for (const s of r.skipped ?? []) L.push(`- Không đọc được ${s}`);
  if (r.alsoMatched.length) L.push(`- Cũng khớp: ${r.alsoMatched.join(', ')} (kiểm tra lại nếu engine chính có vẻ sai)`);
  L.push('', '## Logic và dữ liệu nằm ở đâu', '');
  L.push(`- Logic: ${r.logic.length ? r.logic.map((e) => `\`${e}\``).join(', ') : 'chưa xác định'}`);
  L.push(`- Dữ liệu: ${r.data.length ? r.data.map((e) => `\`${e}\``).join(', ') : 'chưa xác định'}`);
  if (r.tools.length) L.push(`- Công cụ: ${r.tools.join(' · ')}`);
  L.push('', '## Kiểm kê', '', `${r.inventory.files} file, ${MB(r.inventory.bytes)}.`, '', '| Loại | Số file | Dung lượng |', '| --- | ---: | ---: |');
  for (const [k, v] of Object.entries(r.inventory.byKind).sort((a, b) => b[1].bytes - a[1].bytes)) L.push(`| ${KIND_LABEL[k] ?? k} | ${v.count} | ${MB(v.bytes)} |`);
  L.push('', '| Đuôi | Số file | Dung lượng |', '| --- | ---: | ---: |');
  for (const e of r.inventory.topExt) L.push(`| ${e.ext} | ${e.count} | ${MB(e.bytes)} |`);
  L.push('');
  return L.join('\n');
}

export async function run(args) {
  const root = findGameRoot(args.cwd);
  const game = root ? loadGame(root) : null;
  const given = args._[0] ?? game?.source?.path;
  if (!given) throw new GkError('Dùng: gamekit recon <thư mục | file .apk/.xapk/.ipa/.zip…> [--write] [--json]');
  // source.path in game.yaml is relative to the game folder; a path typed on the command line, to the cwd.
  const src = args._[0] ? path.resolve(args.cwd ?? process.cwd(), given) : path.resolve(root, given);
  if (root && (src === root || src.startsWith(root + path.sep))) throw new GkError('Đường dẫn game gốc phải nằm ngoài thư mục game web');
  const r = recon(src);
  if (args.json) {
    log.info(JSON.stringify(r, null, 2));
  } else log.info(reportMarkdown(r));
  if (!args.write) return 0;
  if (!root) throw new GkError('--write cần chạy trong thư mục game (có game.yaml)');
  const out = path.join(root, 'notes', 'recon.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, reportMarkdown(r));
  const edits = [[['source', 'path'], toPosix(src)]];
  if (r.engine !== 'unknown') edits.push([['source', 'engine'], r.engine]);
  if (r.version) edits.push([['source', 'engineVersion'], r.version]);
  updateGame(root, edits);
  log.ok(`Đã ghi notes/recon.md; game.yaml: source.path${r.engine !== 'unknown' ? `, engine=${r.engine}` : ''}${r.version ? `, engineVersion=${r.version}` : ''}`);
  if (game?.source?.engine && game.source.engine !== 'unknown' && r.engine !== 'unknown' && game.source.engine !== r.engine)
    log.warn(`source.engine trước đây là ${game.source.engine}, recon thấy ${r.engine} — kiểm tra lại`);
  return 0;
}
