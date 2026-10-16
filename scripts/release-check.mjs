// gamekit release-check — last gate before a package leaves: layout az-v1, provenance clean, no foreign links,
// no original names, copyright footer wired, within budget, built from the current commit.
import fs from 'node:fs';
import path from 'node:path';
import { exists, walk } from './lib/io.mjs';
import { Problems, log } from './lib/log.mjs';
import { git } from './lib/git.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { PHASES } from './lib/phases.mjs';
import { latestVersion } from './lib/version.mjs';
import { loadPortal } from './lib/portals.mjs';
import { ASSET_KINDS } from './lib/assemble.mjs';
import { validateGame, loadProvenance } from './validate.mjs';

const ALWAYS_ALLOWED_HOSTS = ['www.w3.org', 'w3.org'];
const TEXT = /\.(html|js|mjs|css|json|svg|txt|xml)$/i;
const SHIP_OK = new Set(['own', 'generated', 'licensed']);
const INNER_TOP = new Set(['index.html', 'loader.js', 'framework.js', 'css', 'Icons', 'Language', 'assets', 'StreamingAssets']);
const REQUIRED = ['index.html', 'loader.js', 'framework.js', 'css/style.css', 'Icons/web.png', 'Icons/loading.webp', 'Icons/domain.webp', 'Language/en.json'];
const hostAllowed = (host, allowed) => allowed.some((a) => host === a || host.endsWith('.' + a));
const URL_RE = /(?:https?|wss?):\/\/((?:[a-z0-9-]+\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})/gi;
const BINARY_SCAN_LIMIT = 64 * 1024 * 1024;
const COMPRESSED = /\.(gz|br)$/;

function checkLayout(dir, version, kit, where, pr) {
  const shell = ['index.html', 'preview.html', 'version.txt', version];
  for (const f of fs.readdirSync(dir)) if (!shell.includes(f)) pr.error(where, `${f}: file lạ ở vỏ gói (chỉ được có ${shell.join(', ')})`);
  for (const f of shell) if (!exists(path.join(dir, f))) pr.error(where, `thiếu ${f}`);
  if (exists(path.join(dir, 'version.txt')) && fs.readFileSync(path.join(dir, 'version.txt'), 'latin1') !== version)
    pr.error(where, `version.txt phải đúng "${version}" (8 byte, không xuống dòng)`);
  const outer = exists(path.join(dir, 'index.html')) ? fs.readFileSync(path.join(dir, 'index.html')) : Buffer.alloc(0);
  if (exists(path.join(dir, 'preview.html')) && !fs.readFileSync(path.join(dir, 'preview.html')).equals(outer))
    pr.error(where, 'preview.html phải giống index.html từng byte');
  const outerText = outer.toString('utf8');
  if (!outerText.includes(`<base href="${version}/">`)) pr.error(where, `index.html thiếu <base href="${version}/">`);
  const inner = path.join(dir, version);
  if (exists(path.join(inner, 'index.html')) && /<base\b/i.test(fs.readFileSync(path.join(inner, 'index.html'), 'utf8')))
    pr.error(where, `${version}/index.html không được có <base> (mở trực tiếp để test)`);
  for (const f of REQUIRED) if (!exists(path.join(inner, f))) pr.error(where, `thiếu ${version}/${f}`);
  for (const rel of walk(inner)) {
    const [top, kind] = rel.replace(COMPRESSED, '').split('/');
    if (!INNER_TOP.has(top)) pr.error(where, `${version}/${rel}: không thuộc bố cục gói`);
    if (top === 'assets' && !ASSET_KINDS.has(kind)) pr.error(where, `${version}/${rel}: asset phải nằm trong assets/{${[...ASSET_KINDS].join(',')}}`);
    if (top === 'StreamingAssets' && /\.(m?js|wasm|html?)$/i.test(rel)) pr.error(where, `${version}/${rel}: StreamingAssets chỉ chứa dữ liệu, không chứa code`);
  }
  let loaders = 0;
  for (const m of outerText.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = m[1];
    if (src === 'loader.js') loaders++;
    else if (/^https:\/\//i.test(src)) {
      const host = new URL(src).hostname;
      if (!hostAllowed(host, kit.config.allowedHosts ?? [])) pr.error(where, `index.html nạp script từ ${host} — không thuộc allowedHosts của portal ${kit.id}`);
    } else pr.error(where, `index.html nạp script "${src}" — trang chỉ được nạp loader.js và SDK của portal`);
  }
  if (loaders !== 1) pr.error(where, `index.html phải nạp loader.js đúng một lần (đang ${loaders})`);
  for (const f of kit.config.placeholders ?? []) pr.warn(where, `${f} của bộ vỏ ${kit.id} còn là placeholder — thay bằng file thật trong plugin`);
}

function checkContent(root, dir, version, kit, game, prov, where, pr) {
  const labels = new Map((prov.entries ?? []).map((e) => [e.path, e.label]));
  const terms = (game.release?.forbiddenTerms ?? []).filter(Boolean).map((t) => t.toLowerCase());
  const allowed = [...ALWAYS_ALLOWED_HOSTS, ...(game.release?.allowedHosts ?? []), ...(kit.config.allowedHosts ?? [])];
  const inner = `${version}/`;
  let initialBytes = 0;
  let biggestLanguage = 0;
  for (const rel of walk(dir)) {
    if (COMPRESSED.test(rel)) continue;
    const abs = path.join(dir, rel);
    const size = fs.statSync(abs).size;
    const sub = rel.startsWith(inner) ? rel.slice(inner.length) : null;
    const lower = rel.toLowerCase();
    for (const t of terms) if (lower.includes(t)) pr.error(where, `${rel}: tên file còn tên game gốc "${t}"`);
    if (rel.endsWith('.map')) pr.warn(where, `${rel}: source map lộ mã nguồn`);

    if (rel === 'index.html' || ['loader.js', 'framework.js', 'css/style.css'].includes(sub) || sub?.startsWith('Icons/')) initialBytes += size;
    if (sub?.startsWith('Language/')) biggestLanguage = Math.max(biggestLanguage, size);

    // Files copied from public/ keep their path and must carry a shippable label.
    const fromPublic = sub && (sub === 'Icons/web.png' || sub === 'Icons/loading.webp' || sub.startsWith('StreamingAssets/')) ? `public/${sub}` : null;
    if (fromPublic) {
      const label = labels.get(fromPublic);
      if (!label) pr.error(where, `${rel}: không có nhãn provenance (${fromPublic})`);
      else if (!SHIP_OK.has(label)) pr.error(where, `${rel}: nhãn ${label} không được phát hành (${fromPublic})`);
    }

    if (TEXT.test(rel)) {
      const text = fs.readFileSync(abs, 'utf8');
      const low = text.toLowerCase();
      for (const t of terms) if (low.includes(t)) pr.error(where, `${rel}: còn tên/thương hiệu game gốc "${t}"`);
      if (sub !== 'loader.js') {
        // loader.js is generated by the plugin's portal kit (obfuscated); its hosts come from portal.yaml.
        for (const m of text.matchAll(URL_RE))
          if (!hostAllowed(m[1].toLowerCase(), allowed)) pr.error(where, `${rel}: link ngoài tới ${m[1]} (thêm vào release.allowedHosts nếu là SDK portal)`);
      }
      if (rel.endsWith('index.html')) {
        for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["'](\/\/?[^"']*)["']/gi)) {
          if (m[1].startsWith('//')) pr.error(where, `${rel}: link ngoài dạng ${m[1]}`);
          else pr.error(where, `${rel}: đường dẫn tuyệt đối ${m[1]} — phải là đường dẫn tương đối`);
        }
      }
      if (sub === 'framework.js' && !/\.copyright\b/.test(text))
        pr.error(where, 'framework.js không đọc platform.info.copyright — popup Settings phải có footer bản quyền của portal');
    } else if (terms.length && size <= BINARY_SCAN_LIMIT) {
      const bin = fs.readFileSync(abs).toString('latin1').toLowerCase();
      for (const t of terms) if (/^[\x20-\x7e]+$/.test(t) && bin.includes(t)) pr.error(where, `${rel}: file nhị phân còn chuỗi "${t}"`);
    }
  }
  const mb = (initialBytes + biggestLanguage) / 1024 / 1024;
  const budget = game.budget?.initialLoadMB;
  if (budget && mb > budget) pr.error(where, `tải đầu ${mb.toFixed(2)}MB vượt ngân sách ${budget}MB`);
  else log.dim(`${where}: tải đầu ${mb.toFixed(2)}MB${budget ? ` / ${budget}MB` : ''}`);
}

/** The package must come from the current commit with no pending code/asset changes. */
function checkFreshness(root, version, where, pr) {
  const f = path.join(root, 'builds', version, 'manifest.json');
  if (!exists(f)) {
    pr.error(where, `thiếu builds/${version}/manifest.json — đóng gói bằng \`gamekit pack\``);
    return;
  }
  const man = JSON.parse(fs.readFileSync(f, 'utf8'));
  const head = git(root, ['rev-parse', '--short', 'HEAD'], { allowFail: true });
  if (man.dirty) pr.error(where, `đóng gói từ bản chưa commit — commit rồi pack lại`);
  else if (head && man.commit && man.commit !== head) pr.error(where, `gói build từ commit ${man.commit}, HEAD là ${head} — pack lại`);
}

export function checkBuild(root, version, portal, game, prov) {
  const pr = new Problems();
  const where = `builds/${version}/${portal}`;
  const dir = path.join(root, 'builds', version, portal);
  if (!exists(path.join(dir, 'index.html'))) {
    pr.error(where, 'chưa có gói — chạy `gamekit pack`');
    return pr;
  }
  let kit;
  try {
    kit = loadPortal(portal);
  } catch (e) {
    pr.error(where, e.message);
    return pr;
  }
  checkLayout(dir, version, kit, where, pr);
  checkFreshness(root, version, where, pr);
  checkContent(root, dir, version, kit, game, prov, where, pr);
  return pr;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const { problems, game } = validateGame(root, { stage: PHASES.indexOf('P5') });
  const all = new Problems().merge(problems);
  const buildsDir = path.join(root, 'builds');
  const version = args.version ? String(args.version) : latestVersion(exists(buildsDir) ? fs.readdirSync(buildsDir) : []);
  if (!version) all.error('builds', 'chưa có bản build — chạy `gamekit pack`');
  else {
    const prov = loadProvenance(root);
    const portals = args.portal ? String(args.portal).split(',') : game.portals ?? [];
    log.info(`Kiểm builds/${version}`);
    for (const p of portals) all.merge(checkBuild(root, version, p, game, prov));
  }
  return all.report('release-check') ? 0 : 1;
}
