// gamekit parity — close each obligation in spec/obligations.yaml with passing tests tagged [id:case].
// Fail-closed: a failed, skipped or todo test, a missing case, or a tag nobody owns never counts as pass.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists, readJson, walk } from './lib/io.mjs';
import { loadPlan, pathUnder, PLAN_FILES, unitsOf } from './lib/plan.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { runAsync, tail } from './lib/proc.mjs';
import { decisionIds, loadObligationFiles, loadObligations, obligationFileErrors, OBLIGATIONS_WHERE } from './validate.mjs';

export const CASE_KINDS = ['normal', 'edge', 'invalid', 'oracle', 'replay'];
const TAG = /\[([a-z0-9][a-z0-9._-]*):([a-z-]+)\]/g;

/** Vitest `--reporter=json` → [{ name, file, status }]; status is passed | failed | skipped | pending | todo. */
export function testsFromVitestReport(report) {
  return (report.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? []).map((a) => ({
      name: a.fullName ?? [...(a.ancestorTitles ?? []), a.title].join(' '),
      file: file.name,
      status: a.status,
    })),
  );
}

/**
 * Each obligation ends in one state:
 *   closed  — every required case has a passing tagged test, and no tagged test is red or unrun
 *   open    — some case has no passing test        failed — a tagged test is red
 *   unknown — a tagged test was skipped/todo       waived — blocked/out-of-scope via an approved D-n
 * Only closed counts as verified; waived is recorded but never counts as closed.
 */
export function evaluateParity({ obligations, tests, decisions = new Set(), only = null }) {
  const errors = [];
  const byId = new Map(obligations.map((o) => [o.id, { o, tagged: [] }]));
  for (const t of tests) {
    for (const [, id, kind] of t.name.matchAll(TAG)) {
      if (!CASE_KINDS.includes(kind)) {
        errors.push(`test "${t.name}": loại case lạ "${kind}" (dùng: ${CASE_KINDS.join(', ')})`);
        continue;
      }
      const entry = byId.get(id);
      if (!entry) errors.push(`test "${t.name}" gắn thẻ ${id} nhưng ${OBLIGATIONS_WHERE} không có nghĩa vụ này`);
      else entry.tagged.push({ ...t, kind });
    }
  }

  const items = [];
  for (const { o, tagged } of byId.values()) {
    // A scope (--area/--module/--obligation) judges its obligations only; the rest of the ledger still names valid tags.
    if (only && !only.has(o.id)) continue;
    const status = o.status ?? 'active';
    const failing = tagged.filter((t) => t.status === 'failed').map((t) => t.name);
    const unverified = tagged.filter((t) => t.status !== 'passed' && t.status !== 'failed').map((t) => t.name);
    const covered = new Set(tagged.filter((t) => t.status === 'passed').map((t) => t.kind));
    const missing = o.cases.filter((c) => !covered.has(c));
    let state;
    if (status !== 'active') {
      state = 'waived';
      if (!o.decision || !decisions.has(o.decision)) errors.push(`${o.id}: ${status} cần mục ${o.decision ?? 'D-n'} trong DECISIONS.md hoặc notes/<mảng>/decisions.md`);
      else if (!o.approved) errors.push(`${o.id}: ${status} (${o.decision}) chưa được người dùng duyệt`);
    } else if (failing.length) state = 'failed';
    else if (unverified.length) state = 'unknown';
    else if (missing.length) state = 'open';
    else state = 'closed';
    items.push({ id: o.id, title: o.title, required: o.required !== false, status, decision: o.decision, state, missing, failing, unverified });
  }

  const mustClose = items.filter((i) => i.required && i.state !== 'waived');
  if (!mustClose.length) errors.push(`chưa có nghĩa vụ bắt buộc nào cần kiểm chứng${only ? ' trong phạm vi đã chọn' : ''} — parity không chứng minh được gì`);
  const ok = errors.length === 0 && mustClose.length > 0 && mustClose.every((i) => i.state === 'closed');
  return { ok, items, errors };
}

const REPORT = '.gamekit/local/parity-report.json';

/** vitest's own bin with this node — no npx, no shell, so paths with spaces stay one argument. */
function vitestCommand(root, only = null) {
  fs.rmSync(path.join(root, REPORT), { force: true });
  const bin = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
  if (!exists(bin)) throw new GkError('Game chưa cài vitest — chạy npm install');
  // A scope runs only the tests tagged with its obligations (vitest matches the full name, describe blocks included).
  const filter = only ? ['-t', `\\[(?:${[...only].map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):`] : [];
  return [process.execPath, [bin, 'run', '--reporter=json', `--outputFile=${REPORT}`, ...filter]];
}

function readReport(root, status, out) {
  if (!exists(path.join(root, REPORT))) throw new GkError(`vitest không tạo được báo cáo (exit ${status}): ${tail(out)}`);
  return readJson(path.join(root, REPORT));
}

function runVitest(root, only = null) {
  const [cmd, args] = vitestCommand(root, only);
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  return readReport(root, r.status, `${r.stdout ?? ''}${r.stderr ?? ''}`);
}

/**
 * One vitest run for the gate: its exit status answers {auto: test} (when `npm test` is plain vitest)
 * and its JSON report answers {auto: parity}. Resolves { status, out, report } — report is null with `error` when vitest gave none.
 */
export async function vitestRun(root) {
  const [cmd, args] = vitestCommand(root);
  const r = await runAsync(cmd, args, { cwd: root, shell: false });
  try {
    return { ...r, report: readReport(root, r.status, r.out) };
  } catch (e) {
    return { ...r, report: null, error: e.message };
  }
}

/** Evaluate a game: its ledger against a vitest JSON report (a file, an already parsed report, or produced by running vitest). */
export function parityForGame(root, { report, json, cwd = root, only = null } = {}) {
  const errs = obligationFileErrors(loadObligationFiles(root));
  if (errs.length) throw new GkError(errs.map(([rel, e]) => `${rel}: ${e}`).join('; '));
  const data = loadObligations(root);
  if (!data) throw new GkError(`Chưa có ${OBLIGATIONS_WHERE}: liệt kê cơ chế của game gốc thành nghĩa vụ (skill parity-check)`);
  if (only) for (const id of only) if (!data.obligations.some((o) => o.id === id)) throw new GkError(`${OBLIGATIONS_WHERE} không có nghĩa vụ ${id}`);
  const results = json ?? (report ? readJson(path.resolve(cwd, report)) : runVitest(root, only));
  return evaluateParity({ obligations: data.obligations, tests: testsFromVitestReport(results), decisions: decisionIds(root), only });
}

/** One line for gate output: what still blocks parity. */
export function parityDetail(result) {
  const open = result.items.filter((i) => i.required && !['closed', 'waived'].includes(i.state)).map((i) => `${i.id} (${i.state})`);
  return [...open, ...result.errors].slice(0, 5).join('; ');
}

/**
 * Which obligations a scope covers. --area: the ledger files the area owns. --module: the module's `obligations`
 * in module-plan.yaml, else those of the area whose buildModule is this module. --obligation: ids (comma or repeated).
 * Returns { only: Set|null, label }.
 */
export function parityScope(root, { area, module, obligation } = {}) {
  if (obligation) {
    const ids = [].concat(obligation).flatMap((o) => String(o).split(',')).map((s) => s.trim()).filter(Boolean);
    return { only: new Set(ids), label: ids.join(', ') };
  }
  const rePlan = loadPlan(root, 're');
  const areaIds = (a) => new Set(loadObligationFiles(root).filter((f) => a.owns.some((o) => pathUnder(f.rel, o))).flatMap((f) => (f.data?.obligations ?? []).map((o) => o.id)));
  if (area) {
    const a = unitsOf(rePlan, 're').find((x) => x.id === area);
    if (!a) throw new GkError(`${PLAN_FILES.re} không có mảng ${area}`);
    return { only: areaIds(a), label: `mảng ${area}` };
  }
  if (module) {
    const m = unitsOf(loadPlan(root, 'build'), 'build').find((x) => x.id === module);
    if (!m) throw new GkError(`${PLAN_FILES.build} không có module ${module}`);
    if (m.obligations?.length) return { only: new Set(m.obligations), label: `module ${module}` };
    const a = unitsOf(rePlan, 're').find((x) => x.buildModule === module);
    if (!a) throw new GkError(`module ${module} chưa gắn nghĩa vụ nào — ghi obligations trong ${PLAN_FILES.build}, hoặc buildModule: ${module} cho một mảng trong ${PLAN_FILES.re}`);
    return { only: areaIds(a), label: `module ${module} (mảng ${a.id})` };
  }
  return { only: null, label: '' };
}

/** params key as the game reads it (player.speed, or game.player.speed) → { file, path } inside params/. */
function paramLocation(root, key) {
  for (const rel of walk(path.join(root, 'params')).filter((f) => f.endsWith('.json'))) {
    const prefix = rel === 'game.json' ? [] : rel.replace(/\.json$/, '').split('/');
    for (const pre of rel === 'game.json' ? [[], ['game']] : [prefix]) {
      const parts = key.split('.');
      if (pre.some((p, i) => parts[i] !== p)) continue;
      const file = path.join(root, 'params', rel);
      const node = parts.slice(pre.length).reduce((o, k) => (o == null ? o : o[k]), readJson(file));
      if (node && typeof node === 'object' && 'value' in node) return { file, path: parts.slice(pre.length) };
    }
  }
  return null;
}

const bump = (n) => (n === 0 ? 1 : n * 1.5);
/** Scale every number inside an oracle case's `out`. Returns how many numbers changed. */
function bumpNumbers(node) {
  let n = 0;
  const walkNode = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number') {
        o[k] = bump(v);
        n++;
      } else if (v && typeof v === 'object') walkNode(v);
    }
  };
  for (const c of node.cases ?? []) {
    if (typeof c.out === 'number') {
      c.out = bump(c.out);
      n++;
    } else if (c.out && typeof c.out === 'object') walkNode(c.out);
  }
  return n;
}

/**
 * Do green tests really check what they claim? Change one input file, run only that obligation's tests, restore it.
 *   oracle — scale every `out` of the obligation's oracle table: the oracle tests must go red, else they never
 *            compare against the table (result `survived`, an error).
 *   params — scale each param the obligation names (×1.5, 0 → 1). Tests whose expected value is read from
 *            params move with it, so staying green (`self`) only means the number itself is pinned by nothing
 *            but params: a warning, to back with an oracle from the original game.
 * Returns [{ id, target, kind: 'oracle' | 'param', result: 'caught' | 'survived' | 'self' | 'skipped', note }].
 */
export function mutateParity(root, only) {
  const data = loadObligations(root);
  if (!data) throw new GkError(`Chưa có ${OBLIGATIONS_WHERE}`);
  const out = [];
  const tryWith = (o, file, change) => {
    const original = fs.readFileSync(file, 'utf8');
    try {
      fs.writeFileSync(file, change(original));
      const r = evaluateParity({ obligations: data.obligations, tests: testsFromVitestReport(runVitest(root, new Set([o.id]))), only: new Set([o.id]) });
      return r.items[0]?.state;
    } finally {
      fs.writeFileSync(file, original);
    }
  };
  for (const o of data.obligations.filter((x) => (!only || only.has(x.id)) && (x.status ?? 'active') === 'active')) {
    if (o.oracle && o.cases.includes('oracle')) {
      const file = path.join(root, o.oracle);
      const json = readJson(file);
      if (!bumpNumbers(json)) out.push({ id: o.id, target: o.oracle, kind: 'oracle', result: 'skipped', note: 'bảng không có số trong out' });
      else {
        const state = tryWith(o, file, () => JSON.stringify(json, null, 2));
        out.push({ id: o.id, target: o.oracle, kind: 'oracle', result: state === 'failed' ? 'caught' : 'survived', note: state === 'failed' ? '' : `vẫn ${state} khi đổi bảng oracle` });
      }
    }
    if (!o.params?.length && !o.oracle) out.push({ id: o.id, target: null, kind: 'param', result: 'skipped', note: 'nghĩa vụ không ghi params hay oracle' });
    for (const key of o.params ?? []) {
      const loc = paramLocation(root, key);
      if (!loc) {
        out.push({ id: o.id, target: key, kind: 'param', result: 'skipped', note: 'không tìm thấy trong params/' });
        continue;
      }
      const json = readJson(loc.file);
      const node = loc.path.reduce((x, k) => x[k], json);
      if (typeof node.value !== 'number') {
        out.push({ id: o.id, target: key, kind: 'param', result: 'skipped', note: 'giá trị không phải số' });
        continue;
      }
      node.value = bump(node.value);
      const state = tryWith(o, loc.file, () => JSON.stringify(json, null, 2));
      out.push({ id: o.id, target: key, kind: 'param', result: state === 'failed' ? 'caught' : 'self', note: state === 'failed' ? '' : `vẫn ${state} khi đổi số` });
    }
  }
  return out;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const scope = parityScope(root, args);
  if (args.mutate) {
    const rows = mutateParity(root, scope.only);
    if (args.json) log.info(JSON.stringify(rows, null, 2));
    else
      for (const r of rows) {
        const head = `${r.id}${r.target ? ` × ${r.target}` : ''}`;
        if (r.result === 'caught') log.ok(`${head}: đổi ${r.kind === 'oracle' ? 'bảng' : 'số'} thì test đỏ`);
        else if (r.result === 'skipped') log.dim(`${head}: bỏ qua — ${r.note}`);
        else if (r.result === 'self') log.warn(`${head}: ${r.note} — test lấy kỳ vọng từ chính params, con số chưa được kiểm độc lập (thêm oracle từ game gốc)`);
        else log.fail(`${head}: ${r.note} — test oracle không thật sự so với bảng, viết lại test (skill parity-check, mục 5)`);
      }
    const count = (k) => rows.filter((r) => r.result === k).length;
    (count('survived') ? log.fail : log.ok)(`mutate: ${count('caught')} bắt được, ${count('survived')} lọt (oracle), ${count('self')} chỉ dựa vào params, ${count('skipped')} bỏ qua`);
    return count('survived') ? 1 : 0;
  }
  const result = parityForGame(root, { report: args.report, cwd: args.cwd ?? process.cwd(), only: scope.only });
  if (args.json) {
    log.info(JSON.stringify({ scope: scope.label || 'tất cả', ...result }, null, 2));
    return result.ok ? 0 : 1;
  }
  if (scope.label) log.head(`Parity: ${scope.label}`);
  for (const i of result.items) {
    const head = `${i.id} — ${i.title}${i.required ? '' : ' (tuỳ chọn)'}`;
    if (i.state === 'closed') log.ok(head);
    else if (i.state === 'waived') log.warn(`${head}: ${i.status} theo ${i.decision}, không tính là đã kiểm chứng`);
    else {
      const why = {
        open: `thiếu test xanh cho case: ${i.missing.join(', ')} (gắn thẻ [${i.id}:<case>] vào tên test)`,
        failed: `test đỏ: ${i.failing.join(' | ')}`,
        unknown: `test chưa chạy (skip/todo): ${i.unverified.join(' | ')}`,
      }[i.state];
      (i.required ? log.fail : log.warn)(`${head}: ${why}`);
    }
  }
  for (const e of result.errors) log.fail(e);
  const must = result.items.filter((i) => i.required && i.state !== 'waived');
  const closed = must.filter((i) => i.state === 'closed').length;
  (result.ok ? log.ok : log.fail)(`parity: ${closed}/${must.length} nghĩa vụ bắt buộc đã đóng`);
  return result.ok ? 0 : 1;
}
