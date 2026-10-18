// gamekit provenance add|list — label where every asset came from.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, writeJson, walk, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, nowIso } from './lib/game.mjs';
import { check } from './lib/schema.mjs';

const LABELS = ['reference', 'generated', 'own', 'licensed', 'placeholder'];
// Never assets: git internals, dependencies, GameKit's own files.
const SKIP = ['.git', 'node_modules', '.gamekit'];

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const file = path.join(root, 'provenance.json');
  const prov = exists(file) ? readJson(file) : { entries: [] };
  const [sub, ...rest] = args._;

  if (sub === 'list') {
    if (args.label !== undefined && !LABELS.includes(args.label)) throw new GkError(`--label phải là một trong: ${LABELS.join(', ')}`);
    for (const e of prov.entries) if (!args.label || e.label === args.label) log.info(`${e.label.padEnd(11)} ${e.path}${e.source ? `  ← ${e.source}` : ''}`);
    return 0;
  }

  if (sub === 'add') {
    if (!LABELS.includes(args.label)) throw new GkError(`--label phải là một trong: ${LABELS.join(', ')}`);
    if (!rest.length) throw new GkError('Cần ít nhất một đường dẫn file hoặc thư mục');
    if (args.label === 'licensed' && typeof args.license !== 'string') throw new GkError('Nhãn licensed cần --license "<tên giấy phép>" (vd. CC-BY-4.0)');
    const files = [];
    for (const p of rest) {
      const abs = path.resolve(args.cwd ?? process.cwd(), p);
      if (!exists(abs)) throw new GkError(`Không có ${p}`);
      const rel = toPosix(path.relative(root, abs));
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new GkError(`${p} nằm ngoài thư mục game`);
      if (SKIP.some((d) => rel === d || rel.startsWith(`${d}/`))) throw new GkError(`${p}: không gắn nhãn cho ${rel.split('/')[0]}/`);
      const list = walk(abs, { ignore: SKIP });
      if (list.length) files.push(...list.map((f) => (rel ? `${rel}/${f}` : f)));
      else if (rel && !fs.statSync(abs).isDirectory()) files.push(rel);
    }
    const byPath = new Map(prov.entries.map((e) => [e.path, e]));
    for (const f of files) {
      const entry = { path: f, label: args.label, source: args.source ?? null, license: args.license ?? null, note: args.note ?? null, at: nowIso() };
      byPath.set(f, entry);
    }
    prov.entries = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
    const errs = check('provenance', prov);
    if (errs.length) throw new GkError(`provenance không hợp lệ: ${errs.join('; ')}`);
    writeJson(file, prov);
    log.ok(`Đã gắn nhãn ${args.label} cho ${files.length} file`);
    return 0;
  }

  throw new GkError('Dùng: gamekit provenance add <đường dẫn…> --label <nhãn> [--source …] [--license …] | gamekit provenance list [--label …]');
}
