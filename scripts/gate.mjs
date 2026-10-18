// gamekit gate — check the current phase's gate checklist; --advance moves to the next phase when it passes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readJson } from './lib/io.mjs';
import { runAsync } from './lib/run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame, nowIso, ownershipOf } from './lib/game.mjs';
import { PHASES, nextPhase, phaseInfo } from './lib/phases.mjs';
import { validateGame } from './validate.mjs';
import { parityDetail, parityForGame, runVitestAsync } from './parity.mjs';
import { reusableBuild } from './pack.mjs';

/**
 * Gate file syntax (gates/P2.md):
 *   - [ ] Item an agent may tick once it verified it
 *   - [ ] Item only the user decides (bạn)
 *   - [ ] Item checked by a script {auto: validate}
 *   - [ ] Item for one kind of game only {only: third-party}   (own | third-party, see source.ownership)
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

/** Gate items that apply to this game (drops `{only: …}` items for the other kind of game). */
export function gateItemsFor(game, text) {
  const ownership = ownershipOf(game);
  return parseGate(text).filter((it) => !it.only || it.only === ownership);
}

/** `npm test` is plain vitest (the template's) — its result can come from the run parity already makes. */
function testIsVitest(root) {
  try {
    return readJson(path.join(root, 'package.json')).scripts?.test === 'vitest run';
  } catch {
    return false;
  }
}

const vitestSummary = (rep) => (rep.success ? '' : `${rep.numFailedTests ?? '?'} test đỏ, ${rep.numFailedTestSuites ?? '?'} file test lỗi`);

/** One auto check. `ctx.get(name)` starts or reuses another check, so each runs once even when items share it. */
async function runAuto(ctx, name) {
  const { root, phase, autos } = ctx;
  if (name === 'validate') {
    const { problems } = validateGame(root, { stage: PHASES.indexOf(phase) });
    return { ok: problems.ok, detail: problems.errors.slice(0, 5).join('; ') };
  }
  if (name === 'parity' || (name === 'test' && autos.has('parity') && testIsVitest(root))) {
    try {
      const json = await (ctx.vitest ??= runVitestAsync(root));
      if (name === 'test') return { ok: json.success === true, detail: vitestSummary(json) };
      const r = parityForGame(root, { json });
      return { ok: r.ok, detail: r.ok ? '' : parityDetail(r) };
    } catch (e) {
      return { ok: false, detail: e.message };
    }
  }
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
  if (name === 'pack') {
    // A build of this exact commit and inputs already exists: checking the gate again must not burn a build number.
    const v = reusableBuild(root, loadGame(root));
    if (v) return { ok: true, detail: `dùng lại builds/${v} (đúng commit hiện tại; \`gamekit pack\` để đóng gói mới)` };
  }
  // release-check reads the latest build, so it waits for this gate's pack.
  if (name === 'release-check' && autos.has('pack')) await ctx.get('pack');
  const cmds = {
    test: ['npm', ['test', '--silent']],
    typecheck: ['npm', ['run', 'typecheck', '--silent']],
    lint: ['npm', ['run', 'lint', '--silent']],
    pack: [process.execPath, [path.join(HERE, 'gamekit.mjs'), 'pack', '--all']],
    'release-check': [process.execPath, [path.join(HERE, 'gamekit.mjs'), 'release-check']],
  };
  const cmd = cmds[name];
  if (!cmd) return { ok: false, detail: `không biết kiểm tra tự động "${name}"` };
  const r = await runAsync(cmd[0], cmd[1], { cwd: root, shell: process.platform === 'win32' });
  const tail = `${r.stdout}${r.stderr}`.trim().split('\n').slice(-3).join(' | ');
  return { ok: r.status === 0, detail: r.status === 0 ? '' : tail };
}

/** Score every item; auto checks start together and run side by side. */
export async function evaluateGate(root, phase) {
  const file = path.join(root, 'gates', `${phase}.md`);
  if (!exists(file)) throw new GkError(`Không có checklist cổng gates/${phase}.md`);
  const items = gateItemsFor(loadGame(root), fs.readFileSync(file, 'utf8'));
  // An empty checklist would pass vacuously; treat it as a broken gate file instead.
  if (!items.length) throw new GkError(`gates/${phase}.md không có mục nào dạng "- [ ] …" — cổng không thể rỗng`);
  const checks = new Map();
  const ctx = { root, phase, autos: new Set(items.map((it) => it.auto).filter(Boolean)) };
  ctx.get = (name) => {
    if (!checks.has(name)) checks.set(name, runAuto(ctx, name));
    return checks.get(name);
  };
  return Promise.all(items.map(async (it) => (it.auto ? { ...it, ...(await ctx.get(it.auto)) } : { ...it, ok: it.checked, detail: '' })));
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const phase = game.phase;
  if (phase === 'released') {
    log.ok('Game đã phát hành. Bản mới: tăng version rồi đặt phase về P5.');
    return 0;
  }
  log.head(`Cổng ra khỏi ${phase} ${phaseInfo(phase, ownershipOf(game)).name}`);
  const results = await evaluateGate(root, phase);
  for (const r of results) {
    const tag = r.auto ? ` [auto: ${r.auto}]` : r.human ? ' [bạn quyết]' : '';
    (r.ok ? log.ok : log.fail)(`${r.text}${tag}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const passed = results.every((r) => r.ok);
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
