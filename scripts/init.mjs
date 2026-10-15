// gamekit init <name> — create a new game project from the template.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copyDir, exists, readYaml, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { git } from './lib/git.mjs';
import { nowIso } from './lib/game.mjs';
import { SCHEMA_DIR, check } from './lib/schema.mjs';

export const GAMEKIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(GAMEKIT_ROOT, 'templates', 'game');
const ENGINES = ['unknown', 'unity', 'cocos', 'godot', 'unreal', 'flash', 'construct', 'laya', 'html5', 'other'];

export async function run(args) {
  const name = args._[0];
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new GkError('Dùng: gamekit init <ten-game> [--title "Tên"] [--engine unity] [--dir <thư mục cha>]. Tên: chữ thường, số, gạch ngang.');
  const engine = args.engine ?? 'unknown';
  if (!ENGINES.includes(engine)) throw new GkError(`--engine phải là một trong: ${ENGINES.join(', ')}`);
  const title = args.title ?? name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const dest = path.resolve(args.dir ?? args.cwd ?? process.cwd(), name);
  if (exists(dest) && fs.readdirSync(dest).length) throw new GkError(`${dest} đã có và không rỗng`);

  const vars = { NAME: name, TITLE: title, ENGINE: engine, CREATED: nowIso() };
  // Escape per file type so titles like "Zombie: Run #2" or "A & B" stay valid.
  const esc = (k, rel) => {
    const v = vars[k];
    if (k !== 'TITLE') return v;
    if (/\.ya?ml$/.test(rel)) return JSON.stringify(v);
    if (/\.html$/.test(rel)) return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (/\.json$/.test(rel)) return JSON.stringify(v).slice(1, -1);
    return v;
  };
  copyDir(TEMPLATE, dest, { transform: (s, rel) => s.replace(/\{\{(NAME|TITLE|ENGINE|CREATED)\}\}/g, (_, k) => esc(k, rel)) });
  const gameErrors = check('game', readYaml(path.join(dest, 'game.yaml')));
  if (gameErrors.length) throw new GkError(`game.yaml sinh ra không hợp lệ: ${gameErrors.join('; ')}`);

  // Schemas travel with the game so editors validate offline and versions stay pinned.
  fs.mkdirSync(path.join(dest, '.gamekit', 'schemas'), { recursive: true });
  for (const f of fs.readdirSync(SCHEMA_DIR)) fs.copyFileSync(path.join(SCHEMA_DIR, f), path.join(dest, '.gamekit', 'schemas', f));
  // Machine-local pointer to this plugin (gitignored). scripts/gk.mjs reads it.
  writeJson(path.join(dest, '.gamekit', 'local', 'config.json'), { gamekitRoot: GAMEKIT_ROOT });
  fs.chmodSync(path.join(dest, '.githooks', 'pre-commit'), 0o755);

  if (!args['no-install']) {
    log.info('Cài dependency (npm install)…');
    const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dest, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) log.warn('npm install lỗi — chạy lại thủ công trong thư mục game.');
  }
  if (!args['no-git']) {
    git(dest, ['init', '-q', '-b', 'main']);
    git(dest, ['config', 'core.hooksPath', '.githooks']);
    git(dest, ['add', '-A']);
    const hasIdentity = git(dest, ['config', 'user.email'], { allowFail: true });
    const id = hasIdentity ? [] : ['-c', 'user.name=GameKit', '-c', 'user.email=gamekit@localhost'];
    git(dest, [...id, 'commit', '-q', '--no-verify', '-m', `chore: khởi tạo ${name} từ template GameKit`]);
  }
  log.ok(`Đã tạo ${dest}`);
  log.info('Tiếp theo: mở thư mục trong IDE, chạy `npm run gk -- status` hoặc /gamekit:status trong Claude Code.');
  return 0;
}
