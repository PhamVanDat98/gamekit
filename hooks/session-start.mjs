#!/usr/bin/env node
// SessionStart: load using-gamekit into context and, inside a game folder, its current status.
// Never fails the session: any error just means less context.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let context = '';
try {
  if (!fs.existsSync(path.join(root, 'node_modules'))) {
    spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--silent'], { cwd: root, stdio: 'ignore', timeout: 60000, shell: process.platform === 'win32' });
  }
  const skill = fs.readFileSync(path.join(root, 'skills', 'using-gamekit', 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\n/, '');
  context += `<gamekit>\nGameKit plugin đang bật. Hướng dẫn using-gamekit:\n\n${skill}\n`;
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const { findGameRoot } = await import('../scripts/lib/game.mjs');
  const gameRoot = findGameRoot(cwd);
  if (gameRoot) {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'gamekit.mjs'), 'status'], { cwd: gameRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 15000 });
    if (r.stdout) context += `\nTrạng thái game hiện tại (gamekit status):\n${r.stdout}`;
  }
  context += '</gamekit>';
} catch (e) {
  context = context ? context + '</gamekit>' : `<gamekit>GameKit: không nạp được hướng dẫn (${e.message}).</gamekit>`;
}
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
