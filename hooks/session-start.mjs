#!/usr/bin/env node
// SessionStart. Inside a game folder (game.yaml + .gamekit/): load using-gamekit + current status.
// Elsewhere: one line, so other projects aren't flooded. Never fails the session.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPS = ['yaml', 'ajv'];
const RETRY_MS = 24 * 60 * 60 * 1000;
// using-gamekit sections not needed inside a game: its AGENTS.md (loaded via CLAUDE.md) covers ownership and layout.
const IN_AGENTS_MD = new Set(['Tạo game mới (agent)', 'Game của ai: `source.ownership`', 'Cấu trúc một game']);

/** A game = game.yaml with .gamekit/ beside it (init creates both); a stray game.yaml higher up is not one. */
function findGameRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'game.yaml')) && fs.existsSync(path.join(dir, '.gamekit'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * Plugins are installed without node_modules; install the plugin's deps on the first session anywhere, so
 * `gamekit init` works before any game exists. After a failure wait a day, not 90 s on every session.
 * Returns a note for the context ('' when the deps are there).
 */
function ensureDeps() {
  const missing = () => DEPS.filter((d) => !fs.existsSync(path.join(root, 'node_modules', d, 'package.json')));
  const need = missing();
  if (!need.length) return '';
  let version = '0';
  try {
    version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  } catch {
    /* keep '0' */
  }
  const marker = path.join(os.tmpdir(), `gamekit-npm-failed-${version}-${crypto.createHash('sha1').update(root).digest('hex').slice(0, 10)}`);
  const manual = `cd "${root}" && npm install --omit=dev`;
  let failedAt = 0;
  try {
    failedAt = fs.statSync(marker).mtimeMs;
  } catch {
    /* never failed */
  }
  if (Date.now() - failedAt < RETRY_MS)
    return `GameKit chưa có thư viện ${need.join(', ')}: lần cài trước lỗi, hook thử lại sau 1 ngày. Lệnh gamekit sẽ lỗi; báo người dùng chạy: ${manual}`;
  const r = spawnSync('npm', ['install', '--omit=dev', '--prefer-offline', '--no-audit', '--no-fund', '--silent'], { cwd: root, stdio: 'ignore', timeout: 90000, shell: process.platform === 'win32' });
  if (!missing().length) {
    fs.rmSync(marker, { force: true });
    return '';
  }
  try {
    fs.writeFileSync(marker, `${new Date().toISOString()} ${r.error?.message ?? `exit ${r.status}`}\n`);
  } catch {
    /* tmpdir not writable: retry next session */
  }
  return `GameKit không cài được thư viện ${need.join(', ')} (npm install ${r.error ? r.error.message : `thoát mã ${r.status}`}); hook thử lại sau 1 ngày. Lệnh gamekit sẽ lỗi; báo người dùng chạy: ${manual}`;
}

let context;
try {
  const depsNote = ensureDeps();
  const gameRoot = findGameRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!gameRoot) {
    context = `<gamekit>GameKit đã cài. Khi người dùng muốn port/reskin game cho web hoặc làm việc trong thư mục có game.yaml, dùng skill using-gamekit.${depsNote ? `\n${depsNote}` : ''}</gamekit>`;
  } else {
    const refs = path.join(root, 'skills', 'using-gamekit', 'references') + path.sep;
    let skill = fs
      .readFileSync(path.join(root, 'skills', 'using-gamekit', 'SKILL.md'), 'utf8')
      .replace(/^---[\s\S]*?---\r?\n/, '')
      .replaceAll('`references/', `\`${refs}`)
      .trim();
    const hasAgentsMd = fs.existsSync(path.join(gameRoot, 'AGENTS.md'));
    if (hasAgentsMd)
      skill = skill
        .split(/^(?=## )/m)
        .filter((s) => !IN_AGENTS_MD.has(s.match(/^## (.*)/)?.[1].trim()))
        .join('');
    context = `<gamekit>\n${depsNote ? `${depsNote}\n\n` : ''}Thư mục này là một game GameKit. Hướng dẫn using-gamekit${hasAgentsMd ? ' (bỏ phần đã có trong AGENTS.md của game)' : ''}:\n\n${skill}\n\n`;
    const r = depsNote ? {} : spawnSync(process.execPath, [path.join(root, 'scripts', 'gamekit.mjs'), 'status'], { cwd: gameRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 15000 });
    if (r.stdout) context += `\nTrạng thái game hiện tại (gamekit status):\n${r.stdout}`;
    context += '</gamekit>';
  }
} catch (e) {
  context = `<gamekit>GameKit: không nạp được hướng dẫn (${e.message}). Dùng skill using-gamekit.</gamekit>`;
}
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
