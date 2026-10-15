#!/usr/bin/env node
// Shim: forwards to the GameKit plugin's CLI so npm scripts, IDE tasks and agents all call the same thing.
// Plugin location: $GAMEKIT_ROOT, else .gamekit/local/config.json (written by `gamekit init`).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfgFile = join(here, '.gamekit', 'local', 'config.json');
let root = process.env.GAMEKIT_ROOT;
if (!root && existsSync(cfgFile)) root = JSON.parse(readFileSync(cfgFile, 'utf8')).gamekitRoot;
const cli = root && join(root, 'scripts', 'gamekit.mjs');
if (!cli || !existsSync(cli)) {
  console.error('Không tìm thấy plugin GameKit. Đặt biến GAMEKIT_ROOT tới thư mục plugin, hoặc tạo .gamekit/local/config.json: {"gamekitRoot": "<đường dẫn>"}');
  process.exit(2);
}
if (!existsSync(join(root, 'node_modules'))) {
  spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--silent'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
}
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { cwd: process.cwd(), stdio: 'inherit' });
process.exit(r.status ?? 1);
