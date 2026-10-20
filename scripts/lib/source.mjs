// The original game as a flat list of files, whether it is a folder (project, desktop/WebGL build) or an
// archive (APK, IPA, XAPK, zip). Used by recon and assets scan. Reads only — never runs anything.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GkError } from './log.mjs';
import { ARCHIVE_RE, listZip, readZipEntry } from './unzip.mjs';

/** Folders that are caches or tooling, not the game (Unity Library/ alone can be tens of GB). */
const SKIP_DIRS = new Set(['.git', '.svn', 'node_modules', 'Library', 'Temp', 'Logs', 'obj', 'UserSettings', '.gradle', '.idea', '.vs', '.vscode', 'temp', 'local']);

function walkDir(root) {
  const out = [];
  const rec = (abs, rel) => {
    let ents;
    try {
      ents = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) rec(path.join(abs, e.name), r);
      } else if (e.isFile()) out.push({ path: r, bytes: fs.statSync(path.join(abs, e.name)).size });
    }
  };
  rec(root, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * { label, kind: 'dir'|'archive', entries: [{ path, bytes }], read(path, limit?) → Buffer|null, close() }.
 * Split APKs inside an XAPK/APKS are opened too; their files appear as "<inner.apk>!/<path>".
 */
export function openSource(p) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) throw new GkError(`Không có ${p}`);
  if (fs.statSync(abs).isDirectory()) {
    const entries = walkDir(abs);
    return {
      label: abs,
      kind: 'dir',
      entries,
      read(rel, limit = Infinity) {
        const f = path.join(abs, rel);
        if (!fs.existsSync(f)) return null;
        if (limit === Infinity) return fs.readFileSync(f);
        const fd = fs.openSync(f, 'r');
        try {
          const buf = Buffer.alloc(Math.min(limit, fs.fstatSync(fd).size));
          fs.readSync(fd, buf, 0, buf.length, 0);
          return buf;
        } finally {
          fs.closeSync(fd);
        }
      },
      close() {},
    };
  }
  if (!ARCHIVE_RE.test(abs)) throw new GkError(`${p}: đưa thư mục game, hoặc file .apk/.aab/.xapk/.apks/.ipa/.zip`);
  const archives = [{ prefix: '', file: abs, list: listZip(abs) }];
  const tmp = [];
  for (const e of archives[0].list.filter((x) => /\.apk$/i.test(x.name))) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-recon-'));
    const f = path.join(dir, path.basename(e.name));
    fs.writeFileSync(f, readZipEntry(abs, e));
    tmp.push(dir);
    archives.push({ prefix: `${e.name}!/`, file: f, list: listZip(f) });
  }
  const index = new Map();
  const entries = [];
  for (const a of archives) {
    for (const e of a.list) {
      const rel = a.prefix + e.name;
      index.set(rel, { a, e });
      entries.push({ path: rel, bytes: e.size });
    }
  }
  entries.sort((x, y) => x.path.localeCompare(y.path));
  return {
    label: abs,
    kind: 'archive',
    entries,
    read(rel, limit = Infinity) {
      const hit = index.get(rel);
      return hit ? readZipEntry(hit.a.file, hit.e, { limit }) : null;
    },
    close() {
      for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
    },
  };
}

const KINDS = [
  ['image', /\.(png|jpe?g|webp|gif|bmp|tga|psd|tiff?|dds|ktx2?|pvr|astc|exr|hdr|svg)$/i],
  ['audio', /\.(wav|mp3|ogg|m4a|aac|flac|aiff?|wma|opus)$/i],
  ['video', /\.(mp4|webm|mov|avi|m4v|ogv)$/i],
  ['font', /\.(ttf|otf|woff2?|fnt|fontsettings)$/i],
  ['model', /\.(fbx|obj|gltf|glb|dae|blend|3ds|max)$/i],
  ['spine', /\.(skel|spine)$|_ske\.json$|_tex\.json$|\.atlas(\.txt)?$/i],
  ['anim', /\.(anim|controller|overrideController|playable|mask)$/i],
  ['tilemap', /\.(tmx|tsx|ldtk)$/i],
  ['scene', /\.(unity|prefab|tscn|scn|fire|scene|umap)$/i],
  ['shader', /\.(shader|shadergraph|hlsl|glsl|cginc|compute|frag|vert|effect)$/i],
  ['code', /\.(cs|js|mjs|ts|lua|gd|py|as|cpp|h|java|kt|dll|so|wasm|dylib|dex)$/i],
  ['data', /\.(json|xml|csv|tsv|txt|ya?ml|bytes|asset|plist|ini|cfg|tres|db)$/i],
];

export const ASSET_KINDS = ['image', 'audio', 'video', 'font', 'model', 'spine', 'anim', 'tilemap'];

export function kindOf(file) {
  if (/\.meta$/i.test(file)) return 'meta';
  return KINDS.find(([, re]) => re.test(file))?.[0] ?? 'other';
}
