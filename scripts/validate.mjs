// gamekit validate — check every data file of a game against its schema and the GameKit rules.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, readYaml, walk } from './lib/io.mjs';
import { check } from './lib/schema.mjs';
import { Problems } from './lib/log.mjs';
import { requireGameRoot, loadGame } from './lib/game.mjs';
import { PHASES } from './lib/phases.mjs';
import { pngInfo } from './lib/png.mjs';

/** Folders whose files end up in a build and therefore need provenance. */
export const SHIPPED_DIRS = ['assets', 'public'];
/** Folders that must never be committed or packaged. */
export const FORBIDDEN_DIRS = ['reference', 'decompiled', '.gamekit/ghidra', '.gamekit/local'];

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

  validateParams(root, st, pr);
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

function decisionIds(root) {
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
    for (const [key, p] of collectParams(data)) {
      const src = String(p.source ?? '').trim();
      if (!src) pr.error(where, `${key}: thiếu source (luật cứng: số liệu phải có nguồn từ game gốc)`);
      else if (/^todo\b/i.test(src)) (strict ? pr.error : pr.warn).call(pr, where, `${key}: source còn TODO`);
      if (p.deviation) {
        const d = p.deviation;
        if (!decisions.has(d.decision)) pr.error(where, `${key}: deviation trỏ tới ${d.decision} nhưng DECISIONS.md không có mục này`);
        if (!d.approved) (strict ? pr.error : pr.warn).call(pr, where, `${key}: sai khác game gốc chưa được duyệt (${d.decision})`);
      }
    }
  }
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
  const stage = args.stage ? PHASES.indexOf(args.stage) : undefined;
  const { problems } = validateGame(root, { stage });
  return problems.report('validate') ? 0 : 1;
}
