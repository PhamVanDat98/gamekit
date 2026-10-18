// gamekit recon [đường dẫn] — what an original game build is: container, store, engine, where logic and data live.
// Default path: source.path of the game in this folder. --write: notes/recon.md + engine/engineVersion in game.yaml.
import fs from 'node:fs';
import path from 'node:path';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot, loadGame, updateGame } from './lib/game.mjs';
import { recon } from './lib/formats.mjs';

const MANUAL = '## Kiểm tra tay';
const mb = (n) => (n >= 2 ** 20 ? `${(n / 2 ** 20).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** The report as Markdown: printed by default, saved as notes/recon.md with --write. */
export function reconMarkdown(r, { at } = {}) {
  const L = [];
  L.push('# Recon game gốc', '');
  L.push(`Sinh bởi \`gamekit recon\`${at ? ` lúc ${at}` : ''} — chạy lại để cập nhật. Nhận diện theo tên file trong bản build: đây là **gợi ý có bằng chứng**, kiểm tra lại trước khi kết luận.`, '');
  L.push(`- Đầu vào: \`${r.input}\` (${r.isDir ? 'thư mục' : 'file'}, ${r.fileCount} file kể cả trong archive)`);
  L.push(`- Dạng phát hành: ${r.containers.length ? r.containers.map((c) => c.label).join(' · ') : 'chưa rõ'}`);
  if (r.stores.length) L.push(`- Cửa hàng / SDK: ${r.stores.map((s) => s.label).join(' · ')}`);
  L.push(`- Engine: **${r.engines[0]?.label ?? 'chưa nhận ra'}** (game.yaml: \`${r.engine}\`)${r.engineVersion ? ` — version ${r.engineVersion}` : ''}`, '');
  if (r.engines.length) {
    L.push('## Engine và nơi chứa logic / data', '');
    for (const e of r.engines) {
      L.push(`### ${e.label}`);
      L.push(`- Bằng chứng: ${e.evidence.map((p) => `\`${p}\``).join(', ')}`);
      L.push(`- Logic: ${e.logic}`);
      L.push(`- Data / asset: ${e.data}`);
      L.push(`- Công cụ: ${e.tools}`, '');
    }
  }
  if (r.containers.length || r.stores.length) {
    L.push('## Bằng chứng dạng phát hành', '');
    for (const c of [...r.containers, ...r.stores]) L.push(`- ${c.label}: ${c.evidence.map((p) => `\`${p}\``).join(', ')}`);
    L.push('');
  }
  if (r.notes.length) {
    L.push('## Cần biết trước P1', '');
    for (const n of r.notes) L.push(`- ${n}`);
    L.push('');
  }
  if (r.problems.length) {
    L.push('## Không đọc được', '');
    for (const p of r.problems) L.push(`- ${p}`);
    L.push('');
  }
  L.push('## File lớn nhất', '');
  for (const f of r.largest) L.push(`- ${mb(f.size)} \`${f.path}\``);
  L.push('');
  return L.join('\n');
}

export async function run(args) {
  const root = findGameRoot(args.cwd);
  const game = root ? loadGame(root) : null;
  let input = args._[0];
  if (!input) {
    if (!game?.source?.path) throw new GkError('Dùng: gamekit recon <đường dẫn game gốc> [--json] [--write]. Trong thư mục game: mặc định là source.path của game.yaml.');
    input = path.resolve(root, game.source.path);
  } else input = path.resolve(args.cwd ?? process.cwd(), input);
  if (!fs.existsSync(input)) throw new GkError(`Không có ${input}`);

  const r = recon(input);
  if (args.json) {
    log.info(JSON.stringify(r, null, 2));
  } else log.info(reconMarkdown(r));

  if (args.write) {
    if (!root) throw new GkError('--write cần chạy trong thư mục game (có game.yaml)');
    const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const file = path.join(root, 'notes', 'recon.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // The agent's own checks live under MANUAL and survive a re-run.
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const i = prev.indexOf(MANUAL);
    const manual = i >= 0 ? prev.slice(i) : `${MANUAL}\n\nĐã xác nhận gì, bằng cách nào (mở file nào, công cụ nào), còn nghi gì. \`recon --write\` giữ nguyên mục này.\n`;
    fs.writeFileSync(file, `${reconMarkdown(r, { at })}\n${manual}`);
    const edits = [];
    const cur = game.source?.engine;
    if (r.engine !== 'unknown') {
      if (!cur || cur === 'unknown') edits.push([['source', 'engine'], r.engine]);
      else if (cur !== r.engine) log.warn(`game.yaml ghi engine "${cur}", recon thấy "${r.engine}" — không tự sửa; kiểm tra rồi sửa tay nếu recon đúng.`);
    }
    if (r.engineVersion && !game.source?.engineVersion) edits.push([['source', 'engineVersion'], r.engineVersion]);
    if (edits.length) updateGame(root, edits);
    log.ok(`Đã ghi notes/recon.md${edits.length ? ` và ${edits.map(([k]) => k.join('.')).join(', ')} trong game.yaml` : ''}`);
  }
  return 0;
}
