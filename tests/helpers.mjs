import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = path.join(ROOT, 'scripts', 'gamekit.mjs');

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-test-'));
}

/** Run the CLI; returns { code, out }. */
export function gk(cwd, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

export function newGame(name = 'demo') {
  const parent = tmpDir();
  const { code, out } = gk(parent, 'init', name, '--title', 'Demo', '--engine', 'unity', '--no-install');
  if (code !== 0) throw new Error(out);
  const dir = path.join(parent, name);
  sh(dir, 'git', 'config', 'user.email', 'test@example.com');
  sh(dir, 'git', 'config', 'user.name', 'test');
  return dir;
}

export const sh = (cwd, cmd, ...args) => execFileSync(cmd, args, { cwd, encoding: 'utf8' });
export const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
export const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
export const editJson = (dir, rel, fn) => {
  const f = path.join(dir, rel);
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  fn(data);
  fs.writeFileSync(f, JSON.stringify(data, null, 2));
};
