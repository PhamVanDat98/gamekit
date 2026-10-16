#!/usr/bin/env node
// SessionStart. Inside a game folder (has game.yaml): load using-gamekit + current status.
// Elsewhere: one line, so other projects aren't flooded. Never fails the session.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findGameRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'game.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

let context;
try {
  // Plugins are installed without node_modules; install the plugin's deps on the first session anywhere,
  // so `gamekit init` works before any game exists.
  if (!fs.existsSync(path.join(root, 'node_modules', 'yaml'))) {
    spawnSync('npm', ['install', '--omit=dev', '--prefer-offline', '--no-audit', '--no-fund', '--silent'], { cwd: root, stdio: 'ignore', timeout: 90000, shell: process.platform === 'win32' });
  }
  const gameRoot = findGameRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!gameRoot) {
    context = '<gamekit>GameKit đã cài. Khi người dùng muốn port/reskin game cho web hoặc làm việc trong thư mục có game.yaml, dùng skill using-gamekit.</gamekit>';
  } else {
    const skill = fs.readFileSync(path.join(root, 'skills', 'using-gamekit', 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\n/, '');
    context = `<gamekit>\nThư mục này là một game GameKit. Hướng dẫn using-gamekit:\n\n${skill}\n`;
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'gamekit.mjs'), 'status'], { cwd: gameRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 15000 });
    if (r.stdout) context += `\nTrạng thái game hiện tại (gamekit status):\n${r.stdout}`;
    context += '</gamekit>';
  }
} catch (e) {
  context = `<gamekit>GameKit: không nạp được hướng dẫn (${e.message}). Dùng skill using-gamekit.</gamekit>`;
}
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
