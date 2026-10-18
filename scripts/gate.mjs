// gamekit gate — check the current phase's gate checklist; --advance moves to the next phase when it passes.
// gamekit gate --area <id> — check one analysis area of re-plan.yaml (is it ready to be rebuilt?).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame, nowIso, ownershipOf } from './lib/game.mjs';
import { PHASES, nextPhase, phaseInfo } from './lib/phases.mjs';
import { loadPlan, pathUnder, PLAN_FILES, unitsOf } from './lib/plan.mjs';
import { BLOCKING_QUESTION, questionSummary } from './lib/notes.mjs';
import { runAsync, tail } from './lib/proc.mjs';
import { loadObligationFiles, PARAMS_LOADER, validateGame } from './validate.mjs';
import { parityDetail, parityForGame, vitestRun } from './parity.mjs';
import { isMerged, worktreeOf } from './parallel.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Gate file syntax (gates/P2.md):
 *   - [ ] Item an agent may tick once it verified it
 *   - [ ] Item only the user decides (bạn)
 *   - [ ] Item checked by a script {auto: validate}
 *   - [ ] Item for one kind of game only {only: third-party}   (own | third-party, see source.ownership;
 *         split | single: the analysis is split into areas by re-plan.yaml, or not)
 * Auto items are re-run every time; their checkbox is ignored.
 */
export function parseGate(text) {
  const items = [];
  // \r?\n: gate files edited on Windows (or checked out with autocrlf) must not parse as empty.
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (!m) continue;
    let body = m[2].trim();
    const tag = (name) => {
      const t = body.match(new RegExp(`\\{${name}:\\s*([^}]+)\\}`));
      if (!t) return null;
      body = body.replace(t[0], '').replace(/\s{2,}/g, ' ').trim();
      return t[1].trim();
    };
    const auto = tag('auto');
    const only = tag('only');
    const human = /\(bạn\)\s*$/i.test(body);
    items.push({ text: body, checked: m[1] !== ' ', auto, human, only });
  }
  return items;
}

/** Gate items that apply to this game: drops `{only: …}` items for the other kind of game or the other way of working. */
export function gateItemsFor(game, text, root = null) {
  const ownership = ownershipOf(game);
  const split = root ? exists(path.join(root, PLAN_FILES.re)) : null;
  const applies = (only) => {
    if (only === 'split' || only === 'single') return split === null || split === (only === 'split');
    return only === ownership;
  };
  return parseGate(text).filter((it) => !it.only || applies(it.only));
}

/**
 * Is one analysis area ready to rebuild? P2 rules, judged on the files the area owns only, so one area
 * closes while others are still being analysed. Returns gate-style rows { text, ok, detail }.
 */
export function areaGate(root, id) {
  const plan = loadPlan(root, 're');
  if (!plan) throw new GkError(`Chưa có ${PLAN_FILES.re}`);
  const area = unitsOf(plan, 're').find((a) => a.id === id);
  if (!area) throw new GkError(`${PLAN_FILES.re} không có mảng ${id}`);
  const rows = [];
  const row = (text, problems) => rows.push({ text, ok: problems.length === 0, detail: problems.slice(0, 5).join('; ') });
  const owned = (where) => area.owns.some((o) => pathUnder(where, o));

  const { problems } = validateGame(root, { stage: PHASES.indexOf('P2') });
  // Loading params/<area>.json in the game is the main agent's job (src/core/params.ts is shared), not the area's.
  // Required questions still open are reported by the questions row below, not twice.
  const mineErrors = problems.errors.filter((e) => owned(e.slice(0, e.indexOf(': '))) && !e.includes(PARAMS_LOADER) && !e.includes(BLOCKING_QUESTION));
  row('Dữ liệu của mảng hợp lệ theo luật P2 (params có nguồn, không TODO, ghi chú đủ năm phần…)', mineErrors);

  const q = questionSummary(root).find((r) => r.area === id);
  if (!q || !q.total) row(`Có câu hỏi trong notes/${id}/questions.yaml`, [`chưa có câu hỏi nào`]);
  else row(`Câu hỏi bắt buộc đã trả lời hoặc ghi openReason + impact (${q.answered}/${q.total} đã trả lời)`, q.blocking.map((b) => `${b.id} (${b.status})`));

  const mine = loadObligationFiles(root).filter((f) => owned(f.rel)).flatMap((f) => f.data?.obligations ?? []);
  if (mine.length) row(`Nghĩa vụ parity của mảng trỏ tới ghi chú nguồn (${mine.length} nghĩa vụ)`, mine.filter((o) => !o.source).map((o) => `${o.id}: thiếu source`));
  return rows;
}

/** {auto: areas}: every area of re-plan.yaml is merged into base and passes its area gate. No re-plan.yaml = nothing to check. */
function areasCheck(root) {
  const plan = loadPlan(root, 're');
  if (!plan) return { ok: true, detail: '' };
  const bad = [];
  for (const a of unitsOf(plan, 're')) {
    if (!isMerged(root, plan.base, a.id, 're')) bad.push(`${a.id}: chưa merge`);
    else {
      const failing = areaGate(root, a.id).filter((r) => !r.ok);
      if (failing.length) bad.push(`${a.id}: ${failing.map((r) => r.detail).join('; ')}`);
    }
  }
  return { ok: bad.length === 0, detail: bad.slice(0, 5).join(' · ') };
}

/** {auto: merged}: every module of module-plan.yaml is merged and its worktree removed. No plan = nothing to merge. */
function mergedCheck(root) {
  const plan = loadPlan(root, 'build');
  if (!plan) return { ok: true, detail: '' };
  const game = loadGame(root);
  const bad = [];
  for (const m of unitsOf(plan, 'build')) {
    if (!isMerged(root, plan.base, m.id, 'build')) bad.push(`${m.id}: chưa merge`);
    else if (exists(worktreeOf(root, game, m.id, 'build'))) bad.push(`${m.id}: còn worktree (integrate --cleanup)`);
  }
  return { ok: bad.length === 0, detail: bad.slice(0, 5).join('; ') };
}

/** {auto: questions}: no area has a required question still open without a reason. */
function questionsCheck(root) {
  const rows = questionSummary(root);
  if (!rows.length) return { ok: false, detail: 'chưa có notes/<mảng>/questions.yaml nào' };
  const blocking = rows.flatMap((r) => r.blocking.map((b) => `${b.id} (${b.status})`));
  return { ok: blocking.length === 0, detail: blocking.slice(0, 5).join('; ') };
}

const NPM = { test: ['test'], typecheck: ['run', 'typecheck'], lint: ['run', 'lint'] };
/** These write builds/ (release-check reads what pack wrote), so they run one by one, in order, after the rest. */
const SEQUENTIAL = new Set(['pack', 'release-check']);

/** `npm test` that is exactly vitest can share the parity run instead of running every test a second time. */
function testIsVitest(root) {
  try {
    return /^vitest run\s*$/.test(readJson(path.join(root, 'package.json')).scripts?.test ?? '');
  } catch {
    return false;
  }
}

async function runAuto(root, name, phase, shared) {
  if (name === 'validate') {
    const { problems } = validateGame(root, { stage: PHASES.indexOf(phase) });
    return { ok: problems.ok, detail: problems.errors.slice(0, 5).join('; ') };
  }
  if (name === 'parity' || (name === 'test' && shared.vitest)) {
    const v = await shared.vitest?.();
    if (name === 'test') return { ok: v.status === 0, detail: v.status === 0 ? '' : tail(v.out) };
    try {
      if (v && !v.report) throw new GkError(v.error);
      const r = parityForGame(root, v ? { json: v.report } : {});
      return { ok: r.ok, detail: r.ok ? '' : parityDetail(r) };
    } catch (e) {
      return { ok: false, detail: e.message };
    }
  }
  if (name === 'areas') return areasCheck(root);
  if (name === 'merged') return mergedCheck(root);
  if (name === 'questions') return questionsCheck(root);
  if (name.startsWith('field:')) {
    // field:release.forbiddenTerms → the game.yaml value must be non-empty
    const key = name.slice(6).trim();
    const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), loadGame(root));
    const ok = v != null && v !== '' && !(Array.isArray(v) && v.length === 0) && v !== 'unknown';
    return { ok, detail: ok ? '' : `game.yaml: ${key} chưa điền` };
  }
  if (name.startsWith('file:')) {
    const f = path.join(root, name.slice(5).trim());
    const ok = exists(f) && fs.statSync(f).size > 0;
    return { ok, detail: ok ? '' : `thiếu ${name.slice(5).trim()}` };
  }
  const cmd = NPM[name] ? ['npm', [...NPM[name], '--silent']] : SEQUENTIAL.has(name) ? [process.execPath, [path.join(HERE, 'gamekit.mjs'), ...(name === 'pack' ? ['pack', '--all'] : ['release-check'])]] : null;
  if (!cmd) return { ok: false, detail: `không biết kiểm tra tự động "${name}"` };
  const r = await runAsync(cmd[0], cmd[1], { cwd: root, shell: cmd[0] === 'npm' && process.platform === 'win32' });
  return { ok: r.status === 0, detail: r.status === 0 ? '' : tail(r.out) };
}

/** Auto items run side by side (pack and release-check last, in order); `test` + `parity` share one vitest run. */
export async function evaluateGate(root, phase) {
  const file = path.join(root, 'gates', `${phase}.md`);
  if (!exists(file)) throw new GkError(`Không có checklist cổng gates/${phase}.md`);
  const items = gateItemsFor(loadGame(root), fs.readFileSync(file, 'utf8'), root);
  // An empty checklist would pass vacuously; treat it as a broken gate file instead.
  if (!items.length) throw new GkError(`gates/${phase}.md không có mục nào dạng "- [ ] …" — cổng không thể rỗng`);
  const names = new Set(items.filter((i) => i.auto).map((i) => i.auto));
  let once = null;
  const shared = {};
  if (names.has('parity') && (!names.has('test') || testIsVitest(root))) shared.vitest = () => (once ??= vitestRun(root).catch((e) => ({ status: null, out: e.message, report: null, error: e.message })));
  const results = new Map();
  await Promise.all(items.filter((i) => i.auto && !SEQUENTIAL.has(i.auto)).map(async (i) => results.set(i, await runAuto(root, i.auto, phase, shared))));
  for (const i of items.filter((x) => x.auto && SEQUENTIAL.has(x.auto))) results.set(i, await runAuto(root, i.auto, phase, shared));
  return items.map((it) => (it.auto ? { ...it, ...results.get(it) } : { ...it, ok: it.checked, detail: '' }));
}

function print(results) {
  for (const r of results) {
    const tag = r.auto ? ` [auto: ${r.auto}]` : r.human ? ' [bạn quyết]' : '';
    (r.ok ? log.ok : log.fail)(`${r.text}${tag}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  return results.every((r) => r.ok);
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  if (args.area) {
    log.head(`Cổng mảng ${args.area}`);
    if (print(areaGate(root, args.area))) {
      log.info(`\nMảng ${args.area} đủ điều kiện để dựng lại${isMerged(root, loadPlan(root, 're').base, args.area, 're') ? '' : ' (chưa merge vào nhánh chính — integrate --plan re)'}.`);
      return 0;
    }
    log.info(`\nMảng ${args.area} chưa qua cổng.`);
    return 1;
  }
  const game = loadGame(root);
  const phase = game.phase;
  if (phase === 'released') {
    log.ok('Game đã phát hành. Bản mới: tăng version rồi đặt phase về P5.');
    return 0;
  }
  log.head(`Cổng ra khỏi ${phase} ${phaseInfo(phase, ownershipOf(game)).name}`);
  const passed = print(await evaluateGate(root, phase));
  if (!passed) {
    log.info(`\nChưa qua cổng ${phase}.`);
    return 1;
  }
  if (!args.advance) {
    log.info(`\nĐã đủ điều kiện. Chạy \`gamekit gate --advance\` để sang ${nextPhase(phase)}.`);
    return 0;
  }
  const to = nextPhase(phase);
  const at = nowIso();
  const edits = [
    [['gates', phase], { passed: true, at, by: args.by ?? 'gamekit' }],
    [['timings', phase, 'end'], at],
    [['phase'], to],
  ];
  if (to !== 'released') edits.push([['timings', to], { start: at, end: null }]);
  updateGame(root, edits);
  log.ok(`Qua cổng ${phase} → ${to}`);
  return 0;
}
