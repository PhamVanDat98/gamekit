#!/usr/bin/env node
// Shim: forwards to the GameKit plugin's CLI so npm scripts, IDE tasks, git hooks and agents all call the same thing.
// Plugin lookup order: $GAMEKIT_ROOT → .gamekit/local/config.json → $CLAUDE_PLUGIN_ROOT → Claude Code plugin cache → `gamekit` on PATH.
// Exit code 3 = plugin not found (the pre-commit hook warns instead of blocking).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isGamekit = (dir) => {
  try {
    return Boolean(dir) && existsSync(join(dir, 'scripts', 'gamekit.mjs')) && JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).name === 'gamekit';
  } catch {
    return false;
  }
};

function fromConfig() {
  const f = join(here, '.gamekit', 'local', 'config.json');
  try {
    return JSON.parse(readFileSync(f, 'utf8')).gamekitRoot;
  } catch {
    return null;
  }
}

/** Newest gamekit folder under ~/.claude/plugins (plugin cache keeps one folder per version). */
function fromPluginCache() {
  const base = join(homedir(), '.claude', 'plugins');
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 5 || !existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (!st.isDirectory() || name === 'node_modules' || name.startsWith('.git')) continue;
      if (isGamekit(p)) found.push({ p, t: st.mtimeMs });
      else walk(p, depth + 1);
    }
  };
  walk(base, 0);
  return found.sort((a, b) => b.t - a.t)[0]?.p ?? null;
}

let root = [process.env.GAMEKIT_ROOT, fromConfig(), process.env.CLAUDE_PLUGIN_ROOT].find(isGamekit) ?? fromPluginCache();
let cmd = root ? [process.execPath, join(root, 'scripts', 'gamekit.mjs')] : null;
if (!cmd && spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gamekit']).status === 0) cmd = ['gamekit'];
if (!cmd) {
  console.error('Không tìm thấy plugin GameKit. Đặt biến GAMEKIT_ROOT tới thư mục plugin, hoặc ghi .gamekit/local/config.json: {"gamekitRoot": "<đường dẫn>"}');
  process.exit(3);
}
if (root && !existsSync(join(root, 'node_modules'))) {
  spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--silent'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
}
const r = spawnSync(cmd[0], [...cmd.slice(1), ...process.argv.slice(2)], { cwd: process.cwd(), stdio: 'inherit', shell: cmd[0] === 'gamekit' && process.platform === 'win32' });
process.exit(r.status ?? 1);
