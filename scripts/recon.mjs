// gamekit recon [path] — identify the original game's engine from its files and inventory them into notes/inventory.json.
import fs from 'node:fs';
import path from 'node:path';
import { exists, toPosix, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame, nowIso } from './lib/game.mjs';
import { check } from './lib/schema.mjs';
import { detectEngine, scanSource, unityVersion } from './lib/recon.mjs';

export const INVENTORY = 'notes/inventory.json';
const unset = (v) => v == null || v === '' || v === 'unknown';
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const given = args._[0];
  if (!given && !game.source?.path) throw new GkError('Dùng: gamekit recon <đường dẫn game gốc> (thư mục build, APK/IPA/ZIP) — hoặc điền source.path trong game.yaml');
  // An argument is relative to where the command runs; source.path in game.yaml is relative to the game.
  const src = given ? path.resolve(args.cwd ?? process.cwd(), given) : path.resolve(root, game.source.path);
  if (!exists(src)) throw new GkError(`Không có ${src}`);
  // The original lives outside the game repo, or in its gitignored reference/ or decompiled/ — never the repo itself.
  const rel = toPosix(path.relative(root, src));
  const inside = rel === '' || (rel !== '..' && !rel.startsWith('../') && !path.isAbsolute(rel));
  if (inside && !/^(reference|decompiled)(\/|$)/.test(rel)) throw new GkError('Game gốc phải nằm ngoài repo game, hoặc trong reference/ (gitignored) — không quét chính repo này');

  const { files, archives } = scanSource(src, { hash: !args['no-hash'] });
  const candidates = detectEngine(files.map((f) => f.path));
  const best = candidates[0] ?? null;
  const version = best?.engine === 'unity' && fs.statSync(src).isDirectory() ? unityVersion(src, files) : null;
  const byKind = {};
  for (const f of files) {
    const k = (byKind[f.kind] ??= { files: 0, bytes: 0 });
    k.files++;
    k.bytes += f.size;
  }
  const inventory = {
    source: given ?? game.source.path,
    scannedAt: nowIso(),
    engine: best?.engine ?? 'unknown',
    flavor: best?.flavor ?? null,
    engineVersion: version?.version ?? null,
    candidates,
    totals: { files: files.length, bytes: files.reduce((n, f) => n + f.size, 0), byKind },
    archives,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  const errs = check('inventory', inventory);
  if (errs.length) throw new GkError(`inventory không hợp lệ: ${errs.join('; ')}`);

  if (args.json) log.info(JSON.stringify({ ...inventory, files: undefined }, null, 2));
  else {
    log.head(`Recon: ${src}`);
    if (best) log.ok(`Engine: ${best.engine}${best.flavor ? ` (${best.flavor})` : ''}${version ? ` ${version.version}` : ''} — bằng chứng: ${best.evidence.join(', ')}`);
    else log.warn('Không nhận ra engine từ tên file — xem bảng trong skill re-notes, ghi source.engine bằng tay');
    for (const c of candidates.slice(1)) log.dim(`  cũng khớp: ${c.engine}${c.flavor ? ` (${c.flavor})` : ''} — ${c.evidence.join(', ')}`);
    log.info(`${files.length} file, ${mb(inventory.totals.bytes)}: ${Object.entries(byKind).map(([k, v]) => `${k} ${v.files}`).join(', ')}`);
    for (const a of archives) (a.error ? log.warn : log.dim)(`  gói ${a.path}: ${a.error ?? `${a.entries} mục`}`);
  }
  if (args['no-write']) return 0;
  writeJson(path.join(root, INVENTORY), inventory);
  // Fill only what is still empty: an engine the user chose at init is theirs to change.
  const edits = [];
  if (unset(game.source?.path)) edits.push([['source', 'path'], given ?? game.source.path]);
  if (best && unset(game.source?.engine)) edits.push([['source', 'engine'], best.engine]);
  if (version && unset(game.source?.engineVersion)) edits.push([['source', 'engineVersion'], version.version]);
  if (edits.length) updateGame(root, edits);
  if (best && !unset(game.source?.engine) && game.source.engine !== best.engine)
    log.warn(`game.yaml ghi engine ${game.source.engine} nhưng file trông như ${best.engine} — kiểm tra lại và sửa source.engine nếu cần`);
  log.ok(`Đã ghi ${INVENTORY}${edits.length ? ` và ${edits.map(([p]) => p.join('.')).join(', ')} trong game.yaml` : ''}`);
  return 0;
}
