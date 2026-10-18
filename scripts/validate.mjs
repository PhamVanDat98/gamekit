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
import { checkRePlan, checkUnits, loadPlan, pathUnder, unitsOf } from './lib/plan.mjs';

export { pathUnder };

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

  validateDecisions(root, pr);
  const paramKeys = validateParams(root, st, pr);
  validateObligations(root, st, pr, paramKeys);
  validateOracles(root, pr);
  validatePortalSettings(game, st, pr);
  validateLanguages(root, game, pr);
  validateIcons(root, pr);
  validateProvenance(root, st, pr);
  validateModulePlan(root, pr);
  validateRePlan(root, pr);
  validateQuestions(root, pr);
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

/** Decision ids: D-n (main agent, DECISIONS.md) or D-<area>-n (one area's own file, so parallel areas never collide). */
export const DECISION_ID = /^D-(?:([a-z0-9][a-z0-9-]*)-)?\d+$/;
/** Each area records its decisions in its own file; the main agent keeps DECISIONS.md. */
const AREA_DECISIONS = /^notes\/([a-z0-9][a-z0-9-]*)\/decisions\.md$/;

/** Every decision heading (## D-… / ### D-…) with the file it is in. Code fences (the template example) are skipped. */
export function decisionEntries(root) {
  const files = ['DECISIONS.md', ...walk(path.join(root, 'notes')).map((f) => `notes/${f}`).filter((f) => AREA_DECISIONS.test(f))];
  const out = [];
  for (const rel of files) {
    const f = path.join(root, rel);
    if (!exists(f)) continue;
    const text = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/^#{2,3}\s+(D-[a-z0-9-]*\d)\b/gm)) out.push({ id: m[1], file: rel });
  }
  return out;
}

export const decisionIds = (root) => new Set(decisionEntries(root).map((e) => e.id));

function validateDecisions(root, pr) {
  const seen = new Map();
  for (const { id, file } of decisionEntries(root)) {
    const area = AREA_DECISIONS.exec(file)?.[1];
    const prefix = DECISION_ID.exec(id);
    if (!prefix) pr.error(file, `${id}: mã quyết định phải là D-n hoặc D-<mảng>-n`);
    else if (area && prefix[1] !== area) pr.error(file, `${id}: quyết định của mảng ${area} phải đặt mã D-${area}-n`);
    if (seen.has(id)) pr.error(file, `trùng mã quyết định ${id} (đã có trong ${seen.get(id)})`);
    else seen.set(id, file);
  }
}

const ROOT_PARAMS = 'game.json';
/** The game module that loads params/*.json; validate checks every file is imported there. */
export const PARAMS_LOADER = 'src/core/params.ts';

function validateParams(root, st, pr) {
  const dir = path.join(root, 'params');
  const files = walk(dir).filter((f) => f.endsWith('.json'));
  const strict = st >= PHASES.indexOf('P2'); // from P2 on, no TODO sources and no unapproved deviations
  const decisions = decisionIds(root);
  const keys = new Set();
  const owner = new Map(); // full key → file, so two files never define the same number
  const groupOwner = new Map();
  const loader = path.join(root, PARAMS_LOADER);
  // Comments are dropped so the usage example in the template's comment never counts as an import.
  const loaderText = exists(loader) ? fs.readFileSync(loader, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') : null;
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
    // params/game.json sits at the root of PARAMS; every other file under its name (params/player.json → player.*).
    const isRoot = rel === ROOT_PARAMS;
    const prefix = isRoot ? '' : `${stem}.`;
    // A top-level group of PARAMS comes from one place: a key of game.json, params/<g>.json, or files under params/<g>/.
    const nested = rel.includes('/');
    const groups = isRoot ? Object.keys(data).filter((k) => k !== '$schema') : [stem.split('.')[0]];
    for (const g of groups) {
      const prev = groupOwner.get(g);
      if (!prev) groupOwner.set(g, { where, nested });
      else if (prev.where !== where && !(prev.nested && nested)) pr.error(where, `nhóm ${g} trùng với ${prev.where} — mỗi nhóm params chỉ nằm trong một file`);
    }
    if (!isRoot && loaderText !== null && !new RegExp(`['"][./]*params/${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(loaderText))
      // P1 areas write params before any code reads them; the game must load every file from P2 on.
      (strict ? pr.error : pr.warn).call(pr, where, `chưa được nạp trong ${PARAMS_LOADER} — thêm import và một dòng vào FILES (game không đọc được số này)`);
    for (const [key, p] of collectParams(data)) {
      const full = `${prefix}${key}`;
      if (owner.has(full) && owner.get(full) !== where) pr.error(where, `${full} đã có trong ${owner.get(full)}`);
      else owner.set(full, where);
      keys.add(full);
      if (isRoot) keys.add(`${stem}.${key}`);
      const src = String(p.source ?? '').trim();
      if (!src) pr.error(where, `${key}: thiếu source (luật cứng: số liệu phải có nguồn từ game gốc)`);
      else if (/^todo\b/i.test(src)) (strict ? pr.error : pr.warn).call(pr, where, `${key}: source còn TODO`);
      if (p.confidence === 'inferred' && p.tolerance == null)
        (strict ? pr.error : pr.warn).call(pr, where, `${key}: giá trị ước lượng (inferred) cần tolerance để parity test so được`);
      if (p.deviation) {
        const d = p.deviation;
        if (!decisions.has(d.decision)) pr.error(where, `${key}: deviation trỏ tới ${d.decision} nhưng không có mục này trong DECISIONS.md hay notes/<mảng>/decisions.md`);
        if (!d.approved) (strict ? pr.error : pr.warn).call(pr, where, `${key}: sai khác game gốc chưa được duyệt (${d.decision})`);
      }
    }
  }
  return keys;
}

// ---------- spec/obligations.yaml + spec/obligations/<area>.yaml: parity obligations ----------
export const OBLIGATIONS_FILE = 'spec/obligations.yaml';
const OBLIGATIONS_DIR = 'spec/obligations';
export const OBLIGATIONS_WHERE = `${OBLIGATIONS_FILE} / ${OBLIGATIONS_DIR}/*.yaml`;

/** Every ledger file: the shared spec/obligations.yaml, then one per area (spec/obligations/<area>.yaml). Throws on bad YAML. */
export function loadObligationFiles(root) {
  const rels = [OBLIGATIONS_FILE, ...walk(path.join(root, OBLIGATIONS_DIR)).filter((f) => /^[^/]+\.ya?ml$/.test(f)).sort().map((f) => `${OBLIGATIONS_DIR}/${f}`)];
  return rels.filter((rel) => exists(path.join(root, rel))).map((rel) => ({ rel, data: readYaml(path.join(root, rel)) }));
}

/** All obligations in one ledger, or null when there is no ledger file. */
export function loadObligations(root) {
  const files = loadObligationFiles(root);
  if (!files.length) return null;
  return { obligations: files.flatMap((f) => (Array.isArray(f.data?.obligations) ? f.data.obligations : [])) };
}

/** Schema errors per file, plus the area rule: ids in spec/obligations/<area>.yaml start with "<area>.". */
export function obligationFileErrors(files) {
  const out = [];
  for (const { rel, data } of files) {
    for (const e of check('obligations', data)) out.push([rel, e]);
    const area = rel.startsWith(`${OBLIGATIONS_DIR}/`) ? path.basename(rel).replace(/\.ya?ml$/, '') : null;
    if (area && Array.isArray(data?.obligations))
      for (const o of data.obligations) if (typeof o?.id === 'string' && !o.id.startsWith(`${area}.`)) out.push([rel, `${o.id}: nghĩa vụ của mảng ${area} phải có id ${area}.<tên>`]);
  }
  return out;
}

function validateObligations(root, st, pr, paramKeys) {
  let files;
  try {
    files = loadObligationFiles(root);
  } catch (e) {
    pr.error(OBLIGATIONS_WHERE, e.message);
    return;
  }
  const errs = obligationFileErrors(files);
  for (const [rel, e] of errs) pr.error(rel, e);
  if (errs.length) return;
  const strict = st >= PHASES.indexOf('P2');
  const decisions = decisionIds(root);
  const seen = new Map();
  for (const { rel: where, data } of files) {
    for (const o of data.obligations) {
      if (seen.has(o.id)) pr.error(where, `trùng id ${o.id}${seen.get(o.id) !== where ? ` (đã có trong ${seen.get(o.id)})` : ''}`);
      else seen.set(o.id, where);
      for (const k of o.params ?? []) if (!paramKeys.has(k)) pr.error(where, `${o.id}: params ${k} không có trong params/`);
      if (o.oracle && !exists(path.join(root, o.oracle))) pr.error(where, `${o.id}: không có file oracle ${o.oracle}`);
      if ((o.status ?? 'active') !== 'active') {
        if (!o.decision) pr.error(where, `${o.id}: ${o.status} cần decision D-n (hoặc D-<mảng>-n) trong DECISIONS.md / notes/<mảng>/decisions.md`);
        else if (!decisions.has(o.decision)) pr.error(where, `${o.id}: trỏ tới ${o.decision} nhưng không có mục này trong DECISIONS.md hay notes/<mảng>/decisions.md`);
        if (!o.approved) (strict ? pr.error : pr.warn).call(pr, where, `${o.id}: ${o.status} chưa được người dùng duyệt (${o.decision ?? 'thiếu D-n'})`);
      }
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

// ---------- module-plan.yaml (P2) and re-plan.yaml (P1) ----------
export const loadModulePlan = (root) => loadPlan(root, 'build');

export function checkModulePlan(plan) {
  const pr = new Problems();
  const where = 'module-plan.yaml';
  for (const e of check('module-plan', plan)) pr.error(where, e);
  if (!pr.ok) return pr;
  checkUnits(plan, 'build', pr, where);
  const waves = new Map(plan.modules.map((m) => [m.id, m.wave]));
  for (const m of plan.modules)
    for (const d of m.dependsOn ?? [])
      if (waves.has(d) && waves.get(d) >= m.wave) pr.error(where, `${m.id} (đợt ${m.wave}) phụ thuộc ${d} (đợt ${waves.get(d)}): phụ thuộc phải ở đợt trước`);
  return pr;
}

/** Linked folders hold local copies of the original game; a link that git tracks would be committed from every worktree. */
function checkLinks(root, plan, where, pr) {
  for (const l of plan?.links ?? []) if (exists(path.join(root, l)) && !isIgnored(root, l.replace(/\/$/, ''))) pr.error(where, `links: ${l} phải được gitignore`);
}

function validateModulePlan(root, pr) {
  const plan = loadModulePlan(root);
  if (!plan) return;
  const r = checkModulePlan(plan);
  pr.merge(r);
  if (r.ok) checkLinks(root, plan, 'module-plan.yaml', pr);
}

function validateRePlan(root, pr) {
  const plan = loadPlan(root, 're');
  if (!plan) return;
  let modulePlan = null;
  try {
    modulePlan = loadModulePlan(root);
  } catch {
    // reported by validateModulePlan
  }
  const r = checkRePlan(plan, { modulePlan: modulePlan && checkModulePlan(modulePlan).ok ? modulePlan : null });
  pr.merge(r);
  if (r.ok) checkLinks(root, plan, 're-plan.yaml', pr);
}

// ---------- notes/<area>/questions.yaml: analysis questions of one area ----------
const QUESTIONS_FILE = /^([a-z0-9][a-z0-9-]*)\/questions\.yaml$/;

function validateQuestions(root, pr) {
  let areas = null;
  try {
    const plan = loadPlan(root, 're');
    if (plan) areas = new Set(unitsOf(plan, 're').map((a) => a.id));
  } catch {
    // reported by validateRePlan
  }
  const seen = new Map();
  for (const rel of walk(path.join(root, 'notes'))) {
    const area = QUESTIONS_FILE.exec(rel)?.[1];
    if (!area) continue;
    const where = `notes/${rel}`;
    let data;
    try {
      data = readYaml(path.join(root, 'notes', rel));
    } catch (e) {
      pr.error(where, e.message);
      continue;
    }
    const errs = check('questions', data);
    for (const e of errs) pr.error(where, e);
    if (errs.length) continue;
    if (areas && !areas.has(area)) pr.warn(where, `re-plan.yaml không có mảng ${area}`);
    for (const q of data.questions) {
      if (!q.id.startsWith(`${area}.`)) pr.error(where, `${q.id}: câu hỏi của mảng ${area} phải có id ${area}.<tên>`);
      if (seen.has(q.id)) pr.error(where, `trùng id câu hỏi ${q.id} (đã có trong ${seen.get(q.id)})`);
      else seen.set(q.id, where);
    }
  }
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
