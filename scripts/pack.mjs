// gamekit pack — one build per portal: dist/<portal>/{index.html, Build/, StreamingAssets/, TemplateData/}.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { exists, walk, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { git } from './lib/git.mjs';

export function hashDir(dir, { exclude = [] } = {}) {
  const h = crypto.createHash('sha256');
  for (const rel of walk(dir)) {
    if (exclude.includes(rel)) continue;
    h.update(rel + '\0');
    h.update(fs.readFileSync(path.join(dir, rel)));
  }
  return h.digest('hex').slice(0, 16);
}

function compress(dir) {
  for (const rel of walk(path.join(dir, 'Build'))) {
    if (!/\.(js|wasm|css|json)$/.test(rel)) continue;
    const f = path.join(dir, 'Build', rel);
    const buf = fs.readFileSync(f);
    fs.writeFileSync(f + '.gz', zlib.gzipSync(buf, { level: 9 }));
    fs.writeFileSync(f + '.br', zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
  }
}

function zipDir(dir, out) {
  if (exists(out)) fs.rmSync(out);
  if (process.platform === 'win32') {
    const ps = `Compress-Archive -Path '${path.join(dir, '*').replace(/'/g, "''")}' -DestinationPath '${out.replace(/'/g, "''")}' -Force`;
    return spawnSync('powershell', ['-NoProfile', '-Command', ps]).status === 0;
  }
  if (spawnSync('which', ['zip']).status !== 0) return false;
  return spawnSync('zip', ['-qr', '-X', out, '.'], { cwd: dir }).status === 0;
}

/** Pull the meaningful line out of a failed build log instead of the stack tail. */
function buildError(text = '') {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const pick = lines.find((l) => l.includes('GameKit:')) ?? lines.find((l) => /error/i.test(l)) ?? lines.at(-1) ?? '';
  return pick.slice(0, 400);
}

/** Paths whose edits don't change the build (checklists, notes) — not counted as "dirty". */
const DOC_PATHS = [':!gates', ':!notes', ':!spec', ':!DECISIONS.md', ':!game.yaml', ':!provenance.json'];

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const portals = args.all || !args.portal ? game.portals : String(args.portal).split(',');
  for (const p of portals) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p)) throw new GkError(`Tên portal không hợp lệ: "${p}"`);
    if (!game.portals.includes(p)) throw new GkError(`Portal ${p} chưa khai báo trong game.yaml (portals)`);
  }
  const commit = git(root, ['rev-parse', '--short', 'HEAD'], { allowFail: true }) ?? 'nogit';
  const dirty = (git(root, ['status', '--porcelain', '--', '.', ...DOC_PATHS], { allowFail: true }) ?? '') !== '';
  const buildId = `${game.version}+${commit}${dirty ? '.dirty' : ''}`;

  for (const portal of portals) {
    const out = path.join(root, 'dist', portal);
    log.head(`Đóng gói ${game.name} cho ${portal}`);
    fs.rmSync(out, { recursive: true, force: true });
    const r = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
      cwd: root,
      stdio: args.quiet ? 'pipe' : 'inherit',
      encoding: 'utf8',
      shell: process.platform === 'win32',
      env: { ...process.env, GK_PORTAL: portal, GK_BUILD: buildId },
    });
    if (r.status !== 0) throw new GkError(`vite build lỗi cho ${portal}${args.quiet ? `: ${buildError(`${r.stdout}\n${r.stderr}`)}` : ''}`);
    for (const d of ['Build', 'StreamingAssets', 'TemplateData']) fs.mkdirSync(path.join(out, d), { recursive: true });
    if (args.compress) compress(out);
    const manifestRel = 'StreamingAssets/build-manifest.json';
    const buildHash = hashDir(out, { exclude: [manifestRel] });
    writeJson(path.join(out, manifestRel), { name: game.name, title: game.title, version: game.version, portal, buildId, commit, dirty, buildHash, builtAt: nowIso() });
    log.ok(`dist/${portal}  build ${buildId}  hash ${buildHash}`);
    if (args.zip) {
      const z = path.join(root, 'dist', `${game.name}-${portal}-v${game.version}.zip`);
      if (zipDir(out, z)) log.ok(`zip: ${path.relative(root, z)}`);
      else log.warn('Không tìm thấy lệnh zip — bỏ qua bước nén zip.');
    }
  }
  return 0;
}
