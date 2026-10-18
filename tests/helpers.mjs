import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

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

export function newGame(name = 'demo', ...extra) {
  const parent = tmpDir();
  const { code, out } = gk(parent, 'init', name, '--title', 'Demo', '--engine', 'unity', '--no-install', ...extra);
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

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** A valid RGBA PNG; `pixel(x, y)` returns [r, g, b, a]. */
export function pixelPng(w, h, pixel) {
  const rows = Array.from({ length: h }, (_, y) => Buffer.concat([Buffer.from([0]), ...Array.from({ length: w }, (_, x) => Buffer.from(pixel(x, y)))]));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
/** A valid RGBA PNG of one colour — test fixtures and template placeholders. */
export const solidPng = (w, h, rgba = [79, 179, 255, 255]) => pixelPng(w, h, () => rgba);
/** Looks like a picture to `art check`: varied colours, optionally on a see-through margin. */
export const picturePng = (w, h, { alpha = false } = {}) =>
  pixelPng(w, h, (x, y) => {
    const m = Math.round(Math.min(w, h) / 8);
    if (alpha && (x < m || y < m || x >= w - m || y >= h - m)) return [0, 0, 0, 0];
    return [(x * 7) & 255, (y * 5) & 255, ((x + y) * 3) & 255, 255];
  });
/** Smallest valid lossless WebP (1×1). */
export const tinyWebp = () => Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
/** A GMSOFT_SIGNED-shaped token. */
export const token = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
export const editYaml = (dir, fn) => {
  const f = path.join(dir, 'game.yaml');
  const data = YAML.parse(fs.readFileSync(f, 'utf8'));
  fn(data);
  fs.writeFileSync(f, YAML.stringify(data));
};
