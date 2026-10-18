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
/** A valid RGBA PNG of one colour — test fixtures and template placeholders. */
export function solidPng(w, h, rgba = [79, 179, 255, 255]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from(rgba)))]);
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
    chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
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

/**
 * Minimal .NET metadata (no PE wrapper) defining `types`: [{ ns, name, base, methods }].
 * `base` = 'UnityEngine.MonoBehaviour' | 'System.Object' | 'System.ValueType' | name of another type here.
 */
export function fakeAssembly(types, extraRefs = []) {
  const strings = [0];
  const strIndex = new Map();
  const s = (v) => {
    if (!v) return 0;
    if (!strIndex.has(v)) {
      strIndex.set(v, strings.length);
      strings.push(...Buffer.from(v + '\0', 'utf8'));
    }
    return strIndex.get(v);
  };
  const local = new Map(types.map((t, i) => [t.name, i + 2])); // TypeDef rows: 1 = <Module>
  const refs = [...new Set([...types.map((t) => t.base).filter((b) => b && !local.has(b)), ...extraRefs])];
  const u16 = (v) => Buffer.from([v & 255, v >> 8]);
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  const totalMethods = types.reduce((n, t) => n + (t.methods ?? 0), 0);
  const parts = [u32(0), Buffer.from([2, 0, 0, 1])];
  const valid = Buffer.alloc(8);
  valid.writeBigUInt64LE((1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 6n));
  parts.push(valid, Buffer.alloc(8), u32(1), u32(refs.length), u32(types.length + 1), u32(totalMethods));
  parts.push(u16(0), u16(s('Fake.dll')), u16(0), u16(0), u16(0)); // Module
  for (const r of refs) {
    const dot = r.lastIndexOf('.');
    parts.push(u16(0), u16(s(r.slice(dot + 1))), u16(s(r.slice(0, dot))));
  }
  let method = 1;
  parts.push(u32(0), u16(s('<Module>')), u16(0), u16(0), u16(1), u16(method)); // <Module>
  for (const t of types) {
    const ext = !t.base ? 0 : local.has(t.base) ? (local.get(t.base) << 2) | 0 : ((refs.indexOf(t.base) + 1) << 2) | 1;
    parts.push(u32(1), u16(s(t.name)), u16(s(t.ns ?? '')), u16(ext), u16(1), u16(method));
    method += t.methods ?? 0;
  }
  const tables = Buffer.concat(parts);
  const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const tbl = pad4(tables);
  const str = pad4(Buffer.from(strings));
  const version = Buffer.from('v4.0.30319\0\0');
  const headerLen = 16 + version.length + 4 + (8 + 4) + (8 + 12);
  const root = Buffer.concat([
    Buffer.from('BSJB'), u16(1), u16(1), u32(0), u32(version.length), version, u16(0), u16(2),
    u32(headerLen), u32(tbl.length), Buffer.from('#~\0\0'),
    u32(headerLen + tbl.length), u32(str.length), Buffer.from('#Strings\0\0\0\0'),
  ]);
  return Buffer.concat([Buffer.from('MZ-not-a-real-pe-header-padding'), root, tbl, str]);
}
