// gamekit pack — one build number per run, one package per portal: builds/<v>/<portal>/ (layout az-v1).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { exists, walk, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { git } from './lib/git.mjs';
import { checkVersion, latestVersion, nextVersion } from './lib/version.mjs';
import { PORTAL_ID_RE, checkSetting, loadPortal, missingSettings, portalList } from './lib/portals.mjs';
import { loadLanguages } from './lib/languages.mjs';
import { assemblePortal } from './lib/assemble.mjs';
import { initialLoadBytes } from './lib/budget.mjs';
import { zipDir } from './lib/zip.mjs';

export function hashDir(dir) {
  const h = crypto.createHash('sha256');
  for (const rel of walk(dir)) {
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
/** game.yaml fields the package is built from; phase, timings, gates… change on every `gate --advance` and don't count. */
const BUILD_FIELDS = ['name', 'title', 'version', 'language', 'languages', 'portalSettings'];
const buildFields = (game) => JSON.stringify(BUILD_FIELDS.map((k) => game?.[k] ?? null));

/** HEAD commit and whether the working copy differs from it in anything the build reads. */
export function sourceState(root, game = loadGame(root)) {
  const commit = git(root, ['rev-parse', '--short', 'HEAD'], { allowFail: true }) ?? 'nogit';
  if (commit === 'nogit') return { commit, dirty: false };
  if ((git(root, ['status', '--porcelain', '--', '.', ...DOC_PATHS], { allowFail: true }) ?? '') !== '') return { commit, dirty: true };
  const committed = git(root, ['show', 'HEAD:./game.yaml'], { allowFail: true, raw: true });
  let head = null;
  try {
    head = committed == null ? null : YAML.parse(committed);
  } catch {
    /* an unreadable committed game.yaml counts as changed */
  }
  return { commit, dirty: buildFields(head) !== buildFields(game) };
}

/** Latest build when it was packed from this exact source for these portals and is untouched since; else null. */
export function reusableBuild(root, portals, game = loadGame(root)) {
  const buildsDir = path.join(root, 'builds');
  const version = latestVersion(exists(buildsDir) ? fs.readdirSync(buildsDir) : []);
  if (!version) return null;
  let man;
  try {
    man = JSON.parse(fs.readFileSync(path.join(buildsDir, version, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
  const { commit, dirty } = sourceState(root, game);
  if (!man || man.dirty || dirty || commit === 'nogit' || man.commit !== commit) return null;
  const built = Object.keys(man.portals ?? {}).sort();
  if (built.join() !== [...new Set(portals)].sort().join()) return null;
  const same = built.every((p) => exists(path.join(buildsDir, version, p)) && hashDir(path.join(buildsDir, version, p)) === man.portals[p]?.hash);
  return same ? version : null;
}

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

/** game.yaml problems that stop every portal. */
function gameProblems(game) {
  const out = [];
  const languages = game.languages ?? ['en'];
  if (!languages.includes('en')) out.push('game.yaml: languages phải có en (bản gốc của mọi bản dịch)');
  if (game.language && !languages.includes(game.language)) out.push(`game.yaml: language ${game.language} không có trong languages (${languages.join(', ')})`);
  return out;
}

/** Every setting one portal needs, checked before spending time on a build. */
function settingProblems(game, kit) {
  const out = [];
  const values = game.portalSettings?.[kit.id] ?? {};
  for (const k of missingSettings(kit, values)) out.push(`${kit.id}: thiếu ${k} (${kit.config.settings[k].label})`);
  for (const [k, v] of Object.entries(values)) {
    const err = checkSetting(kit, k, v);
    if (err) out.push(`${kit.id}.${k}: ${err}`);
  }
  return out;
}

/**
 * Which portals can be built now. `common` (game.yaml problems) stops every portal; a portal with missing or
 * wrong settings is skipped (pack then exits 1) so the others can still be built and tried.
 */
export function packPlan(game, portals) {
  const kits = [];
  const skipped = [];
  for (const kit of portals.map((p) => loadPortal(p))) {
    const problems = settingProblems(game, kit);
    if (problems.length) skipped.push({ kit, problems });
    else kits.push(kit);
  }
  const common = gameProblems(game);
  if (!portals.length) common.push('game.yaml: portals trống — thêm bằng gamekit config --portal <id>');
  return { common, kits, skipped };
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const portals = args.all || !args.portal ? [...new Set(game.portals ?? [])] : portalList(args.portal);
  for (const p of portals) {
    if (!PORTAL_ID_RE.test(p)) throw new GkError(`Tên portal không hợp lệ: "${p}"`);
    if (!game.portals.includes(p)) throw new GkError(`Portal ${p} chưa khai báo trong game.yaml (portals) — gamekit config --portal ${p}`);
  }
  const { common, kits, skipped } = packPlan(game, portals);
  if (common.length) throw new GkError(`Chưa đóng gói được:\n  ${common.join('\n  ')}`);
  const skipText = skipped.map(({ kit, problems }) => `  ${problems.join('\n  ')}\n  → gamekit config --portal ${kit.id}`).join('\n');
  if (!kits.length) throw new GkError(`Chưa đóng gói được:\n${skipText}`);
  if (skipped.length) log.warn(`Bỏ qua ${skipped.map((s) => s.kit.id).join(', ')} (còn thiếu thông tin portal) — đóng gói ${kits.map((k) => k.id).join(', ')}`);

  const buildsDir = path.join(root, 'builds');
  const existing = exists(buildsDir) ? fs.readdirSync(buildsDir) : [];
  const version = args.version ? checkVersion(args.version, existing) : nextVersion(existing);
  const tools = gameTools(root);
  // Run vite's own bin with this node — no npx, no shell, so paths with spaces stay one argument.
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!exists(viteBin)) throw new GkError('Game chưa cài vite — chạy npm install');
  const languages = loadLanguages(root);
  const { commit, dirty } = sourceState(root, game);
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
  if (skipped.length) {
    log.fail(`Chưa đóng gói ${skipped.map((s) => s.kit.id).join(', ')} — còn thiếu thông tin portal:\n${skipText}`);
    return 1;
  }
  return 0;
}
