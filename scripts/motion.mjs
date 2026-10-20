// gamekit motion — check motion/*.json against the animation principles and print a timing chart.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson } from './lib/io.mjs';
import { check } from './lib/schema.mjs';
import { log } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { analyzeMotion, chartMotion } from './lib/motion.mjs';

export const MOTION_DIR = 'motion';

export function motionFiles(root) {
  const dir = path.join(root, MOTION_DIR);
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(MOTION_DIR, f));
}

/** One file → { rel, motion?, errors[], warnings[], waived[] } (errors include schema errors). */
export function checkMotionFile(root, rel) {
  const out = { rel, errors: [], warnings: [], waived: [] };
  let m;
  try {
    m = readJson(path.join(root, rel));
  } catch (e) {
    out.errors.push({ check: 'json', msg: e.message });
    return out;
  }
  const schema = check('motion', m);
  if (schema.length) {
    out.errors.push(...schema.map((msg) => ({ check: 'schema', msg })));
    return out;
  }
  if (path.basename(rel, '.json') !== m.name) out.errors.push({ check: 'schema', msg: `name "${m.name}" phải trùng tên file` });
  const r = analyzeMotion(m);
  return { ...out, motion: m, errors: [...out.errors, ...r.errors], warnings: r.warnings, waived: r.waived };
}

export function checkMotions(root, files = motionFiles(root)) {
  const results = files.map((rel) => checkMotionFile(root, rel));
  return { results, ok: results.every((r) => !r.errors.length) };
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const files = args._.length ? args._.map((f) => path.relative(root, path.resolve(args.cwd ?? process.cwd(), f))) : motionFiles(root);
  if (!files.length) {
    log.ok('Chưa có motion/*.json — không có gì để chấm.');
    return 0;
  }
  const { results, ok } = checkMotions(root, files);
  if (args.json) {
    log.info(JSON.stringify(results.map(({ motion, ...r }) => ({ ...r, name: motion?.name })), null, 2));
    return ok ? 0 : 1;
  }
  for (const r of results) {
    log.head(`\n${r.rel}`);
    if (r.motion && !args.quiet) log.info(chartMotion(r.motion));
    for (const w of r.waived) log.dim(`  bỏ qua ${w.check}: ${w.msg}`);
    for (const w of r.warnings) log.warn(`[${w.check}] ${w.msg}`);
    for (const e of r.errors) log.fail(`[${e.check}] ${e.msg}`);
    if (!r.errors.length) log.ok(`đạt${r.warnings.length ? ` (${r.warnings.length} cảnh báo)` : ''}`);
  }
  const bad = results.filter((r) => r.errors.length).length;
  log.info('');
  if (ok) log.ok(`motion: ${results.length} chuyển động đạt`);
  else log.fail(`motion: ${bad}/${results.length} chuyển động chưa đạt. Sửa key, hoặc bỏ một kiểm tra bằng "skip": { "<kiểm tra>": "lý do" }`);
  return ok ? 0 : 1;
}
