// Recon of an original game build: which engine made it (from file signatures) and what files it has.
// Static only — reads names, sizes and hashes; never runs anything. Allowed for own and third-party games alike.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { walk, toPosix } from './io.mjs';
import { listZip } from './unzip.mjs';

/** Zip-format packages whose entries are listed as if they were files (<package>!/<entry>). */
export const ARCHIVES = /\.(apk|xapk|aab|ipa|zip|obb)$/i;

/**
 * File signatures (matched against lower-case posix paths, archive entries included). `engine` is the game.yaml
 * source.engine value; `flavor` the build kind inside that engine. A strong signature (weight 3) alone is enough.
 */
export const SIGNATURES = [
  { engine: 'unity', re: /(^|\/)libunity\.so$/, weight: 3 },
  { engine: 'unity', re: /(^|\/)unityplayer\.dll$/, weight: 3 },
  { engine: 'unity', re: /_data\/(globalgamemanagers|data\.unity3d|resources\.assets|level0)$/, weight: 3 },
  { engine: 'unity', re: /(^|\/)assets\/bin\/data\//, weight: 2 },
  { engine: 'unity', flavor: 'il2cpp', re: /(^|\/)(gameassembly\.dll|libil2cpp\.so)$/, weight: 3 },
  { engine: 'unity', flavor: 'il2cpp', re: /(^|\/)global-metadata\.dat$/, weight: 3 },
  { engine: 'unity', flavor: 'mono', re: /(^|\/)managed\/assembly-csharp\.dll$/, weight: 3 },
  { engine: 'unity', flavor: 'webgl', re: /(^|\/)unityloader\.js$/, weight: 3 },
  { engine: 'unity', flavor: 'webgl', re: /(^|\/)build\/[^/]+\.(framework|loader)\.js(\.gz|\.br|\.unityweb)?$/, weight: 3 },
  { engine: 'unity', flavor: 'webgl', re: /\.unityweb$/, weight: 2 },
  { engine: 'godot', re: /(^|\/)libgodot_android\.so$/, weight: 3 },
  { engine: 'godot', re: /(^|\/)project\.godot$/, weight: 3 },
  { engine: 'godot', re: /\.pck$/, weight: 2 },
  { engine: 'unreal', re: /(^|\/)lib(ue4|unreal)\.so$/, weight: 3 },
  { engine: 'unreal', re: /\.uasset$/, weight: 3 },
  { engine: 'unreal', re: /(^|\/)engine\/binaries\//, weight: 3 },
  { engine: 'unreal', re: /\.pak$/, weight: 1 },
  { engine: 'flash', re: /\.swf$/, weight: 3 },
  { engine: 'cocos', re: /(^|\/)libcocos2d[a-z]*\.so$/, weight: 3 },
  { engine: 'cocos', re: /(^|\/)cocos2d-js[^/]*\.js$/, weight: 3 },
  { engine: 'cocos', re: /(^|\/)cocos-js\//, weight: 3 },
  { engine: 'cocos', re: /(^|\/)src\/settings(\.[0-9a-f]+)?\.js$/, weight: 1 },
  { engine: 'construct', re: /(^|\/)c[23]runtime\.js$/, weight: 3 },
  { engine: 'construct', re: /(^|\/)scripts\/c3main\.js$/, weight: 3 },
  { engine: 'laya', re: /(^|\/)laya\.[a-z0-9]+\.js$/, weight: 3 },
  { engine: 'html5', flavor: 'phaser', re: /(^|\/)phaser(\.min)?\.js$/, weight: 2 },
  { engine: 'html5', flavor: 'pixi', re: /(^|\/)pixi(\.min)?\.js$/, weight: 2 },
  { engine: 'html5', flavor: 'rpgmaker', re: /(^|\/)(rpg_core|rmmz_core)\.js$/, weight: 3 },
  { engine: 'html5', re: /(^|\/)index\.html$/, weight: 1 },
  { engine: 'other', flavor: 'gamemaker', re: /(^|\/)(data\.win|game\.droid|game\.ios)$/, weight: 3 },
];

const KINDS = [
  ['code', /\.(dll|so|dylib|exe|wasm|js|mjs|html?|swf|dex|jar|class|gd|gdc|lua|luac|py|pyc)(\.(gz|br|unityweb))?$/],
  ['data', /\.(json|xml|yaml|yml|txt|csv|bytes|dat|data|assets|resource|ress|unity3d|bundle|pak|pck|win|droid|tres|tscn|plist|bin|db|sqlite|ini|cfg)(\.(gz|br|unityweb))?$/],
  ['asset', /\.(png|jpe?g|webp|gif|bmp|tga|psd|ktx2?|astc|dds|pvr|svg|ogg|mp3|wav|m4a|aac|flac|opus|ttf|otf|woff2?|fnt|atlas|skel|mp4|webm|mov)$/],
];
export const kindOf = (p) => KINDS.find(([, re]) => re.test(p.toLowerCase()))?.[0] ?? 'other';

function sha256(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

/**
 * Every file of the build: { path, size, kind, sha256? | crc32? }. A folder is walked; a zip-format package
 * (given directly or found inside the folder) has its entries listed as <package>!/<entry>, with the zip's crc32.
 */
export function scanSource(src, { hash = true } = {}) {
  const files = [];
  const archives = [];
  const addArchive = (abs, rel) => {
    let entries;
    try {
      entries = listZip(abs);
    } catch (e) {
      archives.push({ path: rel, error: e.message });
      return;
    }
    archives.push({ path: rel, entries: entries.length });
    for (const e of entries) files.push({ path: `${rel}!/${e.name}`, size: e.size, kind: kindOf(e.name), crc32: e.crc32.toString(16).padStart(8, '0') });
  };
  const st = fs.statSync(src);
  const list = st.isDirectory() ? walk(src).map((rel) => [path.join(src, rel), rel]) : [[src, path.basename(src)]];
  for (const [abs, rel] of list) {
    const size = fs.statSync(abs).size;
    files.push({ path: toPosix(rel), size, kind: ARCHIVES.test(rel) ? 'package' : kindOf(rel), ...(hash ? { sha256: sha256(abs) } : {}) });
    if (ARCHIVES.test(rel)) addArchive(abs, toPosix(rel));
  }
  return { files, archives };
}

/** Engine candidates, best first: [{ engine, flavor, score, evidence: [paths] }]. html5 only when nothing else matched. */
export function detectEngine(paths) {
  const by = new Map();
  for (const sig of SIGNATURES) {
    const hits = paths.filter((p) => sig.re.test(p.toLowerCase()));
    if (!hits.length) continue;
    const c = by.get(sig.engine) ?? { engine: sig.engine, score: 0, flavors: new Map(), evidence: [] };
    c.score += sig.weight;
    if (sig.flavor) c.flavors.set(sig.flavor, (c.flavors.get(sig.flavor) ?? 0) + sig.weight);
    c.evidence.push(...hits.slice(0, 3));
    by.set(sig.engine, c);
  }
  const all = [...by.values()].map((c) => ({
    engine: c.engine,
    flavor: [...c.flavors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    score: c.score,
    evidence: [...new Set(c.evidence)].slice(0, 6),
  }));
  const real = all.filter((c) => c.engine !== 'html5').sort((a, b) => b.score - a.score);
  return real.length ? real : all;
}

const UNITY_VERSION = /\b(20\d\d\.\d+\.\d+[abfpx]\d+|[45]\.\d+\.\d+[abfpx]\d+)\b/;
/** Unity writes its version near the start of these files; read the first MB of the first one found. */
export function unityVersion(src, files) {
  const candidates = files
    .map((f) => f.path)
    .filter((p) => !p.includes('!/') && /(_data\/(globalgamemanagers|data\.unity3d|level0|mainData)|build\/[^/]+\.(data|framework\.js))$/i.test(p));
  for (const rel of candidates) {
    const fd = fs.openSync(path.join(src, rel), 'r');
    try {
      const buf = Buffer.alloc(1 << 20);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      const m = UNITY_VERSION.exec(buf.subarray(0, n).toString('latin1'));
      if (m) return { version: m[1], from: rel };
    } finally {
      fs.closeSync(fd);
    }
  }
  return null;
}
