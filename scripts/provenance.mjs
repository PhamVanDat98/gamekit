// gamekit provenance add|list — label where every asset came from.
import path from 'node:path';
import { exists, readJson, walk, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { LABELS, labelFiles } from './lib/provenance.mjs';

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
    labelFiles(root, files, { label: args.label, source: args.source ?? null, license: args.license ?? null, note: args.note ?? null });
    log.ok(`Đã gắn nhãn ${args.label} cho ${files.length} file`);
    return 0;
  }

  throw new GkError('Dùng: gamekit provenance add <đường dẫn…> --label <nhãn> [--source …] [--license …] | gamekit provenance list [--label …]');
}
