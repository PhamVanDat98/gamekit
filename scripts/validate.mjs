// gamekit validate — check every data file of a game against its schema and the GameKit rules.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, readYaml, walk } from './lib/io.mjs';
import { check } from './lib/schema.mjs';
import { Problems, GkError } from './lib/log.mjs';
import { git } from './lib/git.mjs';
import { requireGameRoot, loadGame } from './lib/game.mjs';
import { PHASES } from './lib/phases.mjs';
import { pngInfo, isWebp } from './lib/png.mjs';
import { loadLanguages, placeholders } from './lib/languages.mjs';
import { checkSetting, loadPortal, missingSettings } from './lib/portals.mjs';

/** Folders whose files end up in a build and therefore need provenance. */
export const SHIPPED_DIRS = ['assets', 'public'];
/** Folders that must never be committed or packaged. */
export const FORBIDDEN_DIRS = ['reference', 'decompiled', 'builds', '.gamekit/ghidra', '.gamekit/local'];

const phaseIndex = (p) => (p === 'released' ? PHASES.length : PHASES.indexOf(p));

/**
 * Stage decides strictness: rules that only bind from a gate on are errors from that
 * gate's phase onward, warnings before. `stage` = index of the phase being checked.
 */
export function validateGame(root, { stage } = {}) {
  const pr = new Problems();
  const gameFile = path.join(root, 'game.yaml');
  let game = {};
  try {
    game = readYaml(gameFile);
    for (const e of check('game', game)) pr.error('game.yaml', e);
  } catch (e) {
    pr.error('game.yaml', e.message);
    return { problems: pr, game };
  }
  const st = stage ?? Math.max(0, phaseIndex(game.phase));

  const paramKeys = validateParams(root, st, pr);
  validateObligations(root, st, pr, paramKeys);
  validateOracles(root, pr);
  validatePortalSettings(game, st, pr);
  validateLanguages(root, game, pr);
  validateLocalizedAssets(root, game, pr);
  validateIcons(root, pr);
  validateProvenance(root, st, pr);
  validateModulePlan(root, pr);
  validateAssetManifest(root, pr);
  return { problems: pr, game };
}

// ---------- params: every gameplay number has a source in the original game ----------
export function collectParams(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (k === '$schema') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) out.push([key, v]);
    else if (v && typeof v === 'object' && !Array.isArray(v)) collectParams(v, key, out);
  }
  return out;
}

export function decisionIds(root) {
  const f = path.join(root, 'DECISIONS.md');
  if (!exists(f)) return new Set();
  const text = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, ''); // ignore the template example
  const ids = text.match(/^#{2,3}\s+(D-\d+)\b/gm) ?? [];
  return new Set(ids.map((h) => h.replace(/^#+\s+/, '')));
}

function validateParams(root, st, pr) {
  const dir = path.join(root, 'params');
  const files = walk(dir).filter((f) => f.endsWith('.json'));
  const strict = st >= PHASES.indexOf('P2'); // from P2 on, no TODO sources and no unapproved deviations
  const decisions = decisionIds(root);
  const keys = new Set();
  for (const rel of files) {
    const where = `params/${rel}`;
    let data;
    try {
      data = readJson(path.join(dir, rel));
    } catch (e) {
      pr.error(where, e.message);
      continue;
    }
    for (const e of check('params', data)) pr.error(where, e);
    const stem = rel.replace(/\.json$/, '').replaceAll('/', '.');
    for (const [key, p] of collectParams(data)) {
      keys.add(key).add(`${stem}.${key}`);
      const src = String(p.source ?? '').trim();
      if (!src) pr.error(where, `${key}: thiếu source (luật cứng: số liệu phải có nguồn từ game gốc)`);
      else if (/^todo\b/i.test(src)) (strict ? pr.error : pr.warn).call(pr, where, `${key}: source còn TODO`);
      if (p.confidence === 'inferred' && p.tolerance == null)
        (strict ? pr.error : pr.warn).call(pr, where, `${key}: giá trị ước lượng (inferred) cần tolerance để parity test so được`);
      if (p.deviation) {
        const d = p.deviation;
        if (!decisions.has(d.decision)) pr.error(where, `${key}: deviation trỏ tới ${d.decision} nhưng DECISIONS.md không có mục này`);
        if (!d.approved) (strict ? pr.error : pr.warn).call(pr, where, `${key}: sai khác game gốc chưa được duyệt (${d.decision})`);
      }
    }
  }
  return keys;
}

// ---------- spec/obligations.yaml: parity obligations ----------
export const OBLIGATIONS_FILE = 'spec/obligations.yaml';

export function loadObligations(root) {
  const f = path.join(root, OBLIGATIONS_FILE);
  return exists(f) ? readYaml(f) : null;
}

function validateObligations(root, st, pr, paramKeys) {
  const where = OBLIGATIONS_FILE;
  let data;
  try {
    data = loadObligations(root);
  } catch (e) {
    pr.error(where, e.message);
    return;
  }
  if (!data) return;
  const errs = check('obligations', data);
  for (const e of errs) pr.error(where, e);
  if (errs.length) return;
  const strict = st >= PHASES.indexOf('P2');
  const decisions = decisionIds(root);
  const seen = new Set();
  for (const o of data.obligations) {
    if (seen.has(o.id)) pr.error(where, `trùng id ${o.id}`);
    seen.add(o.id);
    for (const k of o.params ?? []) if (!paramKeys.has(k)) pr.error(where, `${o.id}: params ${k} không có trong params/`);
    if (o.oracle && !exists(path.join(root, o.oracle))) pr.error(where, `${o.id}: không có file oracle ${o.oracle}`);
    if ((o.status ?? 'active') !== 'active') {
      if (!o.decision) pr.error(where, `${o.id}: ${o.status} cần decision D-n trong DECISIONS.md`);
      else if (!decisions.has(o.decision)) pr.error(where, `${o.id}: trỏ tới ${o.decision} nhưng DECISIONS.md không có mục này`);
      if (!o.approved) (strict ? pr.error : pr.warn).call(pr, where, `${o.id}: ${o.status} chưa được người dùng duyệt (${o.decision ?? 'thiếu D-n'})`);
    }
  }
}

// ---------- spec/oracles/*.json: input → output tables from the original game ----------
function validateOracles(root, pr) {
  const dir = path.join(root, 'spec', 'oracles');
  for (const rel of walk(dir).filter((f) => f.endsWith('.json'))) {
    const where = `spec/oracles/${rel}`;
    try {
      for (const e of check('oracle', readJson(path.join(dir, rel)))) pr.error(where, e);
    } catch (e) {
      pr.error(where, e.message);
    }
  }
}

// ---------- portalSettings: answers to each portal kit's questions ----------
function validatePortalSettings(game, st, pr) {
  const strict = st >= PHASES.indexOf('P4'); // needed to package for the portal
  for (const p of game.portals ?? []) {
    let kit;
    try {
      kit = loadPortal(p);
    } catch (e) {
      pr.error('game.yaml', e.message);
      continue;
    }
    const values = game.portalSettings?.[p] ?? {};
    for (const [k, v] of Object.entries(values)) {
      const err = checkSetting(kit, k, v);
      if (err) pr.error('game.yaml', `portalSettings.${p}.${k}: ${err}`);
    }
    for (const k of missingSettings(kit, values))
      (strict ? pr.error : pr.warn).call(pr, 'game.yaml', `portalSettings.${p}.${k} chưa điền (${kit.config.settings[k].label}) — gamekit config --portal ${p}`);
  }
}

// ---------- Language/: en is the source of every translation ----------
const PLURAL_FORMS = /^(.+)\.(zero|one|two|few|many|other)$/;
/** "coins.few" → "coins" (CLDR plural form suffix), otherwise null. */
const pluralBase = (k) => PLURAL_FORMS.exec(k)?.[1] ?? null;

function validateLanguages(root, game, pr) {
  let langs;
  try {
    langs = loadLanguages(root);
  } catch (e) {
    pr.error('Language', e.message);
    return;
  }
  const en = langs.en;
  if (!en) {
    pr.error('Language', 'thiếu Language/en.json (bản gốc của mọi bản dịch)');
    return;
  }
  const codes = game.languages ?? ['en'];
  if (!codes.includes('en')) pr.error('game.yaml', 'languages phải có en (bản gốc của mọi bản dịch)');
  if (game.language && !codes.includes(game.language)) pr.error('game.yaml', `language ${game.language} không có trong languages`);
  for (const c of codes) if (!langs[c]) pr.error('Language', `languages có ${c} nhưng thiếu Language/${c}.json`);
  // Plural bases in en: "coins" → union of {param} names over coins.one/coins.other/…, without count.
  // Languages need different forms (ru: one/few/many/other), so any form of a base en has is valid.
  const pluralParams = new Map();
  for (const [k, v] of Object.entries(en)) {
    const base = pluralBase(k);
    if (!base) continue;
    const set = pluralParams.get(base) ?? new Set();
    for (const p of placeholders(v).split(',')) if (p && p !== 'count') set.add(p);
    pluralParams.set(base, set);
  }
  const withoutCount = (s) => placeholders(s).split(',').filter((p) => p && p !== 'count').join(',');
  for (const [c, dict] of Object.entries(langs)) {
    const where = `Language/${c}.json`;
    for (const [k, v] of Object.entries(dict)) {
      if (k === '_meta') continue;
      if (typeof v !== 'string') {
        pr.error(where, `${k}: phải là chuỗi`);
        continue;
      }
      if (c === 'en') continue;
      const base = pluralBase(k);
      if (base && pluralParams.has(base)) {
        if (withoutCount(v) !== [...pluralParams.get(base)].sort().join(',')) pr.error(where, `${k}: tham số {…} khác en.json`);
      } else if (!Object.hasOwn(en, k)) pr.error(where, `${k}: không có trong en.json`);
      else if (placeholders(v) !== placeholders(en[k])) pr.error(where, `${k}: tham số {…} khác en.json`);
    }
    if (c === 'en') continue;
    const hasBase = new Set(Object.keys(dict).map(pluralBase).filter(Boolean));
    const miss = Object.keys(en).filter((k) => k !== '_meta' && !Object.hasOwn(dict, k) && !(pluralParams.has(pluralBase(k)) && hasBase.has(pluralBase(k))));
    if (miss.length) pr.warn(where, `thiếu ${miss.length} key, pack sẽ lấy từ en: ${miss.slice(0, 20).join(', ')}${miss.length > 20 ? '…' : ''}`);
  }
  for (const rel of walk(path.join(root, 'src')).filter((f) => /\.tsx?$/.test(f))) {
    const text = fs.readFileSync(path.join(root, 'src', rel), 'utf8');
    for (const m of text.matchAll(/\bt\(\s*['"]([\w.-]+)['"]/g))
      if (!Object.hasOwn(en, m[1]) && !pluralParams.has(m[1])) pr.error(`src/${rel}`, `t('${m[1]}') không có trong Language/en.json`);
  }
}

// ---------- assets/i18n/<code>/: images with words in them, en is the source of every version ----------
function validateLocalizedAssets(root, game, pr) {
  const base = path.join(root, 'assets', 'i18n');
  const codes = game.languages ?? ['en'];
  const byCode = new Map();
  if (exists(base)) {
    for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
      if (ent.isDirectory()) byCode.set(ent.name, new Set(walk(path.join(base, ent.name)).filter((f) => path.basename(f) !== '.gitkeep')));
      else if (ent.name !== '.gitkeep') pr.error(`assets/i18n/${ent.name}`, 'phải nằm trong assets/i18n/<mã ngôn ngữ>/');
    }
  }
  const en = byCode.get('en') ?? new Set();
  for (const [c, files] of byCode) {
    if (!codes.includes(c)) pr.warn(`assets/i18n/${c}`, `${c} không có trong languages của game.yaml — vẫn bị đóng gói nhưng không ai dùng`);
    if (c === 'en') continue;
    for (const f of files) if (!en.has(f)) pr.error(`assets/i18n/${c}/${f}`, `không có bản gốc assets/i18n/en/${f}`);
  }
  for (const c of codes) {
    if (c === 'en' || !en.size) continue;
    const miss = [...en].filter((f) => !byCode.get(c)?.has(f));
    if (miss.length) pr.warn(`assets/i18n/${c}`, `thiếu ${miss.length} file, game dùng bản en: ${miss.slice(0, 20).join(', ')}${miss.length > 20 ? '…' : ''}`);
  }
  for (const rel of walk(path.join(root, 'src')).filter((f) => /\.tsx?$/.test(f))) {
    const text = fs.readFileSync(path.join(root, 'src', rel), 'utf8');
    for (const m of text.matchAll(/\btAsset\(\s*['"]([^'"]+)['"]/g))
      if (!en.has(m[1])) pr.error(`src/${rel}`, `tAsset('${m[1]}'): thiếu assets/i18n/en/${m[1]}`);
  }
}

// ---------- public/Icons: what the portal page shows before any JS runs ----------
function validateIcons(root, pr) {
  const dir = path.join(root, 'public', 'Icons');
  const web = path.join(dir, 'web.png');
  const loading = path.join(dir, 'loading.webp');
  if (!exists(web)) pr.error('public/Icons', 'thiếu web.png (favicon)');
  else if (!pngInfo(web)) pr.error('public/Icons/web.png', 'không phải PNG');
  if (!exists(loading)) pr.error('public/Icons', 'thiếu loading.webp (ảnh màn loading)');
  else if (!isWebp(loading)) pr.error('public/Icons/loading.webp', 'không phải WebP');
}

// ---------- provenance: every shipped file has a label ----------
export function loadProvenance(root) {
  const f = path.join(root, 'provenance.json');
  return exists(f) ? readJson(f) : { entries: [] };
}

function validateProvenance(root, st, pr) {
  const f = path.join(root, 'provenance.json');
  if (!exists(f)) {
    pr.error('provenance.json', 'không có file');
    return;
  }
  let prov;
  try {
    prov = readJson(f);
  } catch (e) {
    pr.error('provenance.json', e.message);
    return;
  }
  for (const e of check('provenance', prov)) pr.error('provenance.json', e);
  const byPath = new Map();
  for (const e of prov.entries ?? []) {
    if (byPath.has(e.path)) pr.error('provenance.json', `trùng mục ${e.path}`);
    byPath.set(e.path, e);
    if (!exists(path.join(root, e.path))) pr.warn('provenance.json', `${e.path} không còn tồn tại`);
  }
  const reskinDone = st >= PHASES.indexOf('P3'); // gate into P4: no reference assets left
  const releasing = st >= PHASES.indexOf('P5');
  for (const dir of SHIPPED_DIRS) {
    for (const rel of walk(path.join(root, dir))) {
      const p = `${dir}/${rel}`;
      if (path.basename(p) === '.gitkeep') continue;
      const e = byPath.get(p);
      if (!e) {
        pr.error('provenance', `${p} chưa có nhãn (gamekit provenance add ${p} --label …)`);
        continue;
      }
      if (e.label === 'reference') (reskinDone ? pr.error : pr.warn).call(pr, 'provenance', `${p} là asset reference của game gốc, không được nằm trong bản build`);
      if (e.label === 'placeholder' && releasing) pr.error('provenance', `${p} vẫn là placeholder`);
    }
  }
  for (const dir of FORBIDDEN_DIRS) {
    // These may exist locally but must be gitignored; check .gitignore covers them.
    if (exists(path.join(root, dir)) && !isIgnored(root, dir)) pr.error('.gitignore', `${dir}/ phải được gitignore`);
  }
}

function isIgnored(root, dir) {
  const viaGit = git(root, ['check-ignore', '-q', dir + '/'], { allowFail: true });
  if (viaGit !== null) return true; // exit 0 = ignored
  if (git(root, ['rev-parse', '--git-dir'], { allowFail: true }) !== null) return false;
  const gi = path.join(root, '.gitignore');
  if (!exists(gi)) return false;
  const lines = fs.readFileSync(gi, 'utf8').split('\n').map((l) => l.trim().replace(/^\//, '').replace(/\/$/, ''));
  return lines.includes(dir) || lines.includes(dir.split('/')[0]);
}

// ---------- module-plan.yaml ----------
export function loadModulePlan(root) {
  const f = path.join(root, 'module-plan.yaml');
  return exists(f) ? readYaml(f) : null;
}

const norm = (p) => p.replace(/^\.\//, '');
export const pathUnder = (file, prefix) => {
  const f = norm(file);
  const pre = norm(prefix);
  return pre.endsWith('/') ? f.startsWith(pre) : f === pre || f.startsWith(pre + '/');
};
const overlaps = (a, b) => pathUnder(a, b) || pathUnder(b, a) || norm(a) === norm(b);

export function checkModulePlan(plan) {
  const pr = new Problems();
  const where = 'module-plan.yaml';
  for (const e of check('module-plan', plan)) pr.error(where, e);
  if (!pr.ok) return pr;
  const ids = new Map();
  for (const m of plan.modules) {
    if (ids.has(m.id)) pr.error(where, `module trùng id ${m.id}`);
    ids.set(m.id, m);
  }
  for (const m of plan.modules) {
    for (const d of m.dependsOn ?? []) {
      const dep = ids.get(d);
      if (!dep) pr.error(where, `${m.id} phụ thuộc ${d} không tồn tại`);
      else if (dep.wave >= m.wave) pr.error(where, `${m.id} (đợt ${m.wave}) phụ thuộc ${d} (đợt ${dep.wave}): phụ thuộc phải ở đợt trước`);
    }
    for (const o of m.owns) {
      for (const s of plan.shared) if (overlaps(o, s)) pr.error(where, `${m.id} sở hữu ${o} nhưng đây là vùng dùng chung (${s})`);
    }
  }
  const all = plan.modules.flatMap((m) => m.owns.map((o) => [m.id, o]));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      if (all[i][0] !== all[j][0] && overlaps(all[i][1], all[j][1]))
        pr.error(where, `${all[i][0]} và ${all[j][0]} cùng sở hữu ${all[i][1]} / ${all[j][1]}: mỗi file chỉ một chủ`);
  return pr;
}

function validateModulePlan(root, pr) {
  const plan = loadModulePlan(root);
  if (plan) pr.merge(checkModulePlan(plan));
}

// ---------- asset-manifest.json ----------
function validateAssetManifest(root, pr) {
  const f = path.join(root, 'asset-manifest.json');
  if (!exists(f)) return;
  const where = 'asset-manifest.json';
  let man;
  try {
    man = readJson(f);
  } catch (e) {
    pr.error(where, e.message);
    return;
  }
  for (const e of check('asset-manifest', man)) pr.error(where, e);
  for (const a of man.assets ?? []) {
    // Words in an image are text too: they need one version per language, like Language/*.json.
    const localized = a.path.startsWith('assets/i18n/');
    if (a.text && a.noText) pr.error(where, `${a.id}: text và noText không thể cùng true`);
    if (a.text && !a.path.startsWith('assets/i18n/en/')) pr.error(where, `${a.id}: ảnh có chữ phải nằm trong assets/i18n/en/ (bản gốc), mỗi ngôn ngữ một bản trong assets/i18n/<mã>/ — hiện là ${a.path}`);
    if (localized && !a.text) pr.error(where, `${a.id}: ${a.path} nằm trong assets/i18n/ nên phải có text: true`);
    const file = path.join(root, a.path);
    if (!exists(file)) continue; // not generated yet
    if (!a.path.toLowerCase().endsWith('.png')) continue;
    const info = pngInfo(file);
    if (!info) {
      pr.error(where, `${a.path} không phải PNG hợp lệ`);
      continue;
    }
    const w = a.frames ? a.frames.width * a.frames.count : a.width;
    if (info.width !== w || info.height !== a.height)
      pr.error(where, `${a.id}: ${a.path} là ${info.width}×${info.height}, spec cần ${w}×${a.height}`);
    if (a.alpha === true && info.alpha === false) pr.error(where, `${a.id}: cần nền trong suốt nhưng PNG không có kênh alpha`);
  }
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  let stage;
  if (args.stage) {
    stage = args.stage === 'released' ? PHASES.length : PHASES.indexOf(args.stage);
    if (stage < 0) throw new GkError(`--stage phải là một trong: ${PHASES.join(', ')}, released`);
  }
  const { problems } = validateGame(root, { stage });
  return problems.report('validate') ? 0 : 1;
}
