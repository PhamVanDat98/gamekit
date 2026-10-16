// gamekit pack — one build number per run, one package per portal: builds/<v>/<portal>/ (layout az-v1).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { exists, walk, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { git } from './lib/git.mjs';
import { checkVersion, nextVersion } from './lib/version.mjs';
import { checkSetting, loadPortal, missingSettings } from './lib/portals.mjs';
import { loadLanguages } from './lib/languages.mjs';
import { assemblePortal } from './lib/assemble.mjs';
import { initialLoadBytes } from './lib/budget.mjs';
import { zipDir } from './lib/zip.mjs';

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
  for (const rel of walk(dir)) {
    if (!/\.(js|wasm|css|json)$/.test(rel)) continue;
    const f = path.join(dir, rel);
    const buf = fs.readFileSync(f);
    fs.writeFileSync(f + '.gz', zlib.gzipSync(buf, { level: 9 }));
    fs.writeFileSync(f + '.br', zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
  }
}

/** Pull the meaningful line out of a failed build log instead of the stack tail. */
function buildError(text = '') {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const pick = lines.find((l) => l.includes('GameKit:')) ?? lines.find((l) => /error/i.test(l)) ?? lines.at(-1) ?? '';
  return pick.slice(0, 400);
}

/** Paths whose edits don't change the build (checklists, notes) — not counted as "dirty". */
const DOC_PATHS = [':!gates', ':!notes', ':!spec', ':!DECISIONS.md', ':!game.yaml', ':!provenance.json'];

/** esbuild + javascript-obfuscator from the game's node_modules — the plugin itself depends only on yaml and ajv. */
export function gameTools(root) {
  const req = createRequire(path.join(root, 'package.json'));
  let esbuild;
  let obfuscator;
  try {
    esbuild = req('esbuild');
    obfuscator = req('javascript-obfuscator');
  } catch (e) {
    throw new GkError(`Game thiếu esbuild hoặc javascript-obfuscator — chạy npm install trong thư mục game (${String(e.message).split('\n')[0]})`);
  }
  return {
    buildLoader: async ({ entry, define }) =>
      (await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', target: 'es2017', minify: true, write: false, legalComments: 'none', define })).outputFiles[0].text,
    obfuscate: async (code, seed) =>
      obfuscator.obfuscate(code, { compact: true, seed, target: 'browser', stringArray: true, stringArrayEncoding: ['base64'], identifierNamesGenerator: 'hexadecimal' }).getObfuscatedCode(),
  };
}

/** Every setting a portal needs, checked before spending time on a build. */
function settingProblems(game, kits) {
  const out = [];
  const languages = game.languages ?? ['en'];
  if (!languages.includes('en')) out.push('game.yaml: languages phải có en (bản gốc của mọi bản dịch)');
  if (game.language && !languages.includes(game.language)) out.push(`game.yaml: language ${game.language} không có trong languages (${languages.join(', ')})`);
  for (const kit of kits) {
    const values = game.portalSettings?.[kit.id] ?? {};
    for (const k of missingSettings(kit, values)) out.push(`${kit.id}: thiếu ${k} (${kit.config.settings[k].label}) — gamekit config --portal ${kit.id}`);
    for (const [k, v] of Object.entries(values)) {
      const err = checkSetting(kit, k, v);
      if (err) out.push(`${kit.id}.${k}: ${err}`);
    }
  }
  return out;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const portals = [...new Set(args.all || !args.portal ? game.portals : String(args.portal).split(',').map((p) => p.trim()))];
  for (const p of portals) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p)) throw new GkError(`Tên portal không hợp lệ: "${p}"`);
    if (!game.portals.includes(p)) throw new GkError(`Portal ${p} chưa khai báo trong game.yaml (portals) — gamekit config --portal ${p}`);
  }
  const kits = portals.map((p) => loadPortal(p));
  const problems = settingProblems(game, kits);
  if (problems.length) throw new GkError(`Chưa đóng gói được:\n  ${problems.join('\n  ')}`);

  const buildsDir = path.join(root, 'builds');
  const existing = exists(buildsDir) ? fs.readdirSync(buildsDir) : [];
  const version = args.version ? checkVersion(args.version, existing) : nextVersion(existing);
  const tools = gameTools(root);
  // Run vite's own bin with this node — no npx, no shell, so paths with spaces stay one argument.
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!exists(viteBin)) throw new GkError('Game chưa cài vite — chạy npm install');
  const languages = loadLanguages(root);
  const commit = git(root, ['rev-parse', '--short', 'HEAD'], { allowFail: true }) ?? 'nogit';
  const dirty = (git(root, ['status', '--porcelain', '--', '.', ...DOC_PATHS], { allowFail: true }) ?? '') !== '';
  const base = path.join(buildsDir, version);
  const manifest = { name: game.name, title: game.title, semver: game.version, version, commit, dirty, builtAt: nowIso(), portals: {} };

  try {
    for (const kit of kits) {
      log.head(`Đóng gói ${game.name} ${version} cho ${kit.id}`);
      const tmp = path.join(base, `.vite-${kit.id}`);
      const r = spawnSync(process.execPath, [viteBin, 'build', '--outDir', tmp, '--emptyOutDir'], {
        cwd: root,
        stdio: args.quiet ? 'pipe' : 'inherit',
        encoding: 'utf8',
        env: { ...process.env, GK_PORTAL: kit.id, GK_BUILD: `${version}+${commit}${dirty ? '.dirty' : ''}`, GK_PACK: '1' },
      });
      if (r.status !== 0) throw new GkError(`vite build lỗi cho ${kit.id}${args.quiet ? `: ${buildError(`${r.stdout}\n${r.stderr}`)}` : ''}`);
      const outDir = path.join(base, kit.id);
      await assemblePortal({ game, kit, settings: game.portalSettings?.[kit.id] ?? {}, version, viteOut: tmp, languages, outDir, ...tools });
      fs.rmSync(tmp, { recursive: true, force: true });
      if (args.compress) compress(path.join(outDir, version));
      manifest.portals[kit.id] = { hash: hashDir(outDir), initialBytes: initialLoadBytes(outDir, version) };
      log.ok(`builds/${version}/${kit.id}`);
      if (args.zip) {
        const z = path.join(base, `${game.name}-${kit.id}-${version}.zip`);
        zipDir(outDir, z);
        log.ok(`zip: ${path.relative(root, z)}`);
      }
    }
  } catch (e) {
    fs.rmSync(base, { recursive: true, force: true }); // a failed build never leaves a half package behind
    throw e;
  }
  writeJson(path.join(base, 'manifest.json'), manifest);
  if (dirty) log.warn('Đóng gói từ bản chưa commit — release-check sẽ chặn. Commit rồi pack lại để phát hành.');
  return 0;
}
