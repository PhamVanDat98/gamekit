// gamekit provenance add|list — label where every asset came from.
import path from 'node:path';
import { exists, readJson, writeJson, walk, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, nowIso } from './lib/game.mjs';
import { check } from './lib/schema.mjs';

export const LABELS = ['reference', 'generated', 'own', 'licensed', 'placeholder'];

/** Label game-relative paths in provenance.json (replaces an existing entry for the same path). */
export function addProvenance(root, files, { label, source = null, license = null, note = null }) {
  if (!LABELS.includes(label)) throw new GkError(`--label phải là một trong: ${LABELS.join(', ')}`);
  const file = path.join(root, 'provenance.json');
  const prov = exists(file) ? readJson(file) : { entries: [] };
  const byPath = new Map(prov.entries.map((e) => [e.path, e]));
  for (const f of files) byPath.set(f, { path: f, label, source, license, note, at: nowIso() });
  prov.entries = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  const errs = check('provenance', prov);
  if (errs.length) throw new GkError(`provenance không hợp lệ: ${errs.join('; ')}`);
  writeJson(file, prov);
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const file = path.join(root, 'provenance.json');
  const prov = exists(file) ? readJson(file) : { entries: [] };
  const [sub, ...rest] = args._;

  if (sub === 'list') {
    for (const e of prov.entries) if (!args.label || e.label === args.label) log.info(`${e.label.padEnd(11)} ${e.path}${e.source ? `  ← ${e.source}` : ''}`);
    return 0;
  }

  if (sub === 'add') {
    if (!LABELS.includes(args.label)) throw new GkError(`--label phải là một trong: ${LABELS.join(', ')}`);
    if (!rest.length) throw new GkError('Cần ít nhất một đường dẫn file hoặc thư mục');
    const files = [];
    for (const p of rest) {
      const abs = path.resolve(args.cwd ?? process.cwd(), p);
      if (!exists(abs)) throw new GkError(`Không có ${p}`);
      const rel = toPosix(path.relative(root, abs));
      const list = walk(abs);
      if (list.length) files.push(...list.map((f) => `${rel}/${f}`));
      else files.push(rel);
    }
    addProvenance(root, files, args);
    log.ok(`Đã gắn nhãn ${args.label} cho ${files.length} file`);
    return 0;
  }

  throw new GkError('Dùng: gamekit provenance add <đường dẫn…> --label <nhãn> [--source …] [--license …] | gamekit provenance list [--label …]');
}
