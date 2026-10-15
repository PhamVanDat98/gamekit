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
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['zip']);
  if (which.status !== 0) return false;
  if (exists(out)) fs.rmSync(out);
  const r = spawnSync('zip', ['-qr', '-X', out, '.'], { cwd: dir });
  return r.status === 0;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const portals = args.all || !args.portal ? game.portals : String(args.portal).split(',');
  for (const p of portals) if (!game.portals.includes(p)) throw new GkError(`Portal ${p} chưa khai báo trong game.yaml (portals)`);
  const commit = git(root, ['rev-parse', '--short', 'HEAD'], { allowFail: true }) ?? 'nogit';
  const dirty = (git(root, ['status', '--porcelain'], { allowFail: true }) ?? '') !== '';
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
    if (r.status !== 0) throw new GkError(`vite build lỗi cho ${portal}${r.stderr ? `: ${r.stderr.slice(-500)}` : ''}`);
    for (const d of ['Build', 'StreamingAssets', 'TemplateData']) fs.mkdirSync(path.join(out, d), { recursive: true });
    if (args.compress) compress(out);
    const manifestRel = 'StreamingAssets/build-manifest.json';
    const buildHash = hashDir(out, { exclude: [manifestRel] });
    writeJson(path.join(out, manifestRel), { name: game.name, title: game.title, version: game.version, portal, buildId, buildHash, builtAt: nowIso() });
    log.ok(`dist/${portal}  build ${buildId}  hash ${buildHash}`);
    if (args.zip) {
      const z = path.join(root, 'dist', `${game.name}-${portal}-v${game.version}.zip`);
      if (zipDir(out, z)) log.ok(`zip: ${path.relative(root, z)}`);
      else log.warn('Không tìm thấy lệnh zip — bỏ qua bước nén zip.');
    }
  }
  return 0;
}
