// gamekit parity — close each obligation in spec/obligations.yaml with passing tests tagged [id:case].
// Fail-closed: a failed, skipped or todo test, a missing case, or a tag nobody owns never counts as pass.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists, readJson } from './lib/io.mjs';
import { runAsync } from './lib/run.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { check } from './lib/schema.mjs';
import { decisionIds, loadObligations, OBLIGATIONS_FILE } from './validate.mjs';

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
export function evaluateParity({ obligations, tests, decisions = new Set() }) {
  const errors = [];
  const byId = new Map(obligations.map((o) => [o.id, { o, tagged: [] }]));
  for (const t of tests) {
    for (const [, id, kind] of t.name.matchAll(TAG)) {
      if (!CASE_KINDS.includes(kind)) {
        errors.push(`test "${t.name}": loại case lạ "${kind}" (dùng: ${CASE_KINDS.join(', ')})`);
        continue;
      }
      const entry = byId.get(id);
      if (!entry) errors.push(`test "${t.name}" gắn thẻ ${id} nhưng ${OBLIGATIONS_FILE} không có nghĩa vụ này`);
      else entry.tagged.push({ ...t, kind });
    }
  }

  const items = [];
  for (const { o, tagged } of byId.values()) {
    const status = o.status ?? 'active';
    const failing = tagged.filter((t) => t.status === 'failed').map((t) => t.name);
    const unverified = tagged.filter((t) => t.status !== 'passed' && t.status !== 'failed').map((t) => t.name);
    const covered = new Set(tagged.filter((t) => t.status === 'passed').map((t) => t.kind));
    const missing = o.cases.filter((c) => !covered.has(c));
    let state;
    if (status !== 'active') {
      state = 'waived';
      if (!o.decision || !decisions.has(o.decision)) errors.push(`${o.id}: ${status} cần mục ${o.decision ?? 'D-n'} trong DECISIONS.md`);
      else if (!o.approved) errors.push(`${o.id}: ${status} (${o.decision}) chưa được người dùng duyệt`);
    } else if (failing.length) state = 'failed';
    else if (unverified.length) state = 'unknown';
    else if (missing.length) state = 'open';
    else state = 'closed';
    items.push({ id: o.id, title: o.title, required: o.required !== false, status, decision: o.decision, state, missing, failing, unverified });
  }

  const mustClose = items.filter((i) => i.required && i.state !== 'waived');
  if (!mustClose.length) errors.push('chưa có nghĩa vụ bắt buộc nào cần kiểm chứng — parity không chứng minh được gì');
  const ok = errors.length === 0 && mustClose.length > 0 && mustClose.every((i) => i.state === 'closed');
  return { ok, items, errors };
}

const REPORT = '.gamekit/local/parity-report.json';

function vitestArgs(root) {
  fs.rmSync(path.join(root, REPORT), { force: true });
  // vitest's own bin with this node — no npx, no shell, so paths with spaces stay one argument.
  const bin = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
  if (!exists(bin)) throw new GkError('Game chưa cài vitest — chạy npm install');
  return [bin, 'run', '--reporter=json', `--outputFile=${REPORT}`];
}

function readReport(root, r) {
  if (!exists(path.join(root, REPORT))) {
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ');
    throw new GkError(`vitest không tạo được báo cáo (exit ${r.status}): ${tail}`);
  }
  return readJson(path.join(root, REPORT));
}

const runVitest = (root) => readReport(root, spawnSync(process.execPath, vitestArgs(root), { cwd: root, encoding: 'utf8' }));

/** One vitest run as a JSON report — gate shares it between parity and test. */
export const runVitestAsync = async (root) => readReport(root, await runAsync(process.execPath, vitestArgs(root), { cwd: root }));

/** Evaluate a game: its ledger against a vitest JSON report (`json` already loaded, a `report` file, or a fresh vitest run). */
export function parityForGame(root, { report, json, cwd = root } = {}) {
  const data = loadObligations(root);
  if (!data) throw new GkError(`Chưa có ${OBLIGATIONS_FILE}: liệt kê cơ chế của game gốc thành nghĩa vụ (skill parity-check)`);
  const errs = check('obligations', data);
  if (errs.length) throw new GkError(`${OBLIGATIONS_FILE}: ${errs.join('; ')}`);
  json ??= report ? readJson(path.resolve(cwd, report)) : runVitest(root);
  return evaluateParity({ obligations: data.obligations, tests: testsFromVitestReport(json), decisions: decisionIds(root) });
}

/** One line for gate output: what still blocks parity. */
export function parityDetail(result) {
  const open = result.items.filter((i) => i.required && !['closed', 'waived'].includes(i.state)).map((i) => `${i.id} (${i.state})`);
  return [...open, ...result.errors].slice(0, 5).join('; ');
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const result = parityForGame(root, { report: args.report, cwd: args.cwd ?? process.cwd() });
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
