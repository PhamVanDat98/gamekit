import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gk, newGame, token, sh, write, read, editJson, editYaml, tmpDir, cleanEnv } from './helpers.mjs';
import { parseGate } from '../scripts/gate.mjs';
import { checkModulePlan } from '../scripts/validate.mjs';
import { ownershipProblems } from '../scripts/parallel.mjs';
import { parseArgs } from '../scripts/gamekit.mjs';
import { evaluateParity, testsFromVitestReport, brokenFilesFromVitestReport } from '../scripts/parity.mjs';
import YAML from 'yaml';

/** Stand-in for P2 work: the template's demo numbers replaced by "the original game's". */
function portDemoData(dir) {
  for (const f of ['params/game.json', 'spec/oracles/obstacle-speed.json']) write(dir, f, read(dir, f).replaceAll('template-demo:', 'đo từ game gốc:'));
}

test('init creates a valid game with git, hook and schemas', () => {
  const dir = newGame();
  assert.ok(fs.existsSync(path.join(dir, 'game.yaml')));
  assert.ok(fs.existsSync(path.join(dir, '.gitignore')));
  assert.ok(fs.existsSync(path.join(dir, '.gamekit/schemas/params.schema.json')));
  assert.equal(sh(dir, 'git', 'config', 'core.hooksPath').trim(), '.githooks');
  assert.match(read(dir, 'game.yaml'), /engine: unity/);
  assert.doesNotMatch(read(dir, 'AGENTS.md'), /\{\{/);
  assert.equal(gk(dir, 'validate').code, 0);
});

test('status reports phase and pending human decisions', () => {
  const dir = newGame();
  const { code, out } = gk(dir, 'status');
  assert.equal(code, 0);
  assert.match(out, /P0 Intake/);
  assert.match(out, /bạn quyết/);
});

test('params: every value needs a source; TODO is a warning before P2 and an error from P2', () => {
  const dir = newGame();
  editJson(dir, 'params/game.json', (p) => {
    p.player.speed.source = 'TODO: đo từ video';
  });
  let r = gk(dir, 'validate');
  assert.equal(r.code, 0);
  assert.match(r.out, /TODO/);
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 1);
  editJson(dir, 'params/game.json', (p) => {
    delete p.player.speed.source;
  });
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /source/);
});

test('validate: demo numbers are a warning before P2 and an error from P2; malformed data files are reported, not crashes', () => {
  const dir = newGame('demo');
  let r = gk(dir, 'validate');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /template-demo/);
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 1);
  assert.match(r.out, /params\/game\.json.*template-demo/);
  assert.match(r.out, /obstacle-speed\.json.*template-demo/);
  portDemoData(dir);
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0);
  write(dir, 'params/x.json', 'null');
  write(dir, 'Language/fr.json', '[]');
  write(dir, 'provenance.json', JSON.stringify({ entries: [{ label: 'own' }] }));
  write(dir, 'asset-manifest.json', JSON.stringify({ assets: [{ id: 'x' }] }));
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.out, /TypeError|Cannot|must be of type/);
  for (const f of ['params/x.json', 'Language/fr.json', 'provenance.json', 'asset-manifest.json']) assert.ok(r.out.includes(f), `${f}\n${r.out}`);
});

test('params: deviation needs a DECISIONS entry and approval from P2', () => {
  const dir = newGame();
  portDemoData(dir);
  editJson(dir, 'params/game.json', (p) => {
    p.player.speed.deviation = { original: 300, reason: 'cảm ứng', decision: 'D-1', approved: false };
  });
  let r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /D-1/);
  fs.appendFileSync(path.join(dir, 'DECISIONS.md'), '\n## D-1 Tăng tốc cho cảm ứng\n');
  assert.equal(gk(dir, 'validate').code, 0);
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 1);
  editJson(dir, 'params/game.json', (p) => {
    p.player.speed.deviation.approved = true;
  });
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0);
});

test('provenance: unlabeled assets fail; reference blocked from P3; placeholder blocked at P5', () => {
  const dir = newGame();
  portDemoData(dir);
  write(dir, 'assets/hero.png', 'x');
  assert.equal(gk(dir, 'validate').code, 1);
  assert.equal(gk(dir, 'provenance', 'add', 'assets/hero.png', '--label', 'reference').code, 0);
  assert.equal(gk(dir, 'validate').code, 0);
  assert.equal(gk(dir, 'validate', '--stage', 'P3').code, 1);
  gk(dir, 'provenance', 'add', 'assets', '--label', 'placeholder');
  assert.equal(gk(dir, 'validate', '--stage', 'P3').code, 0);
  assert.equal(gk(dir, 'validate', '--stage', 'P5').code, 1);
  assert.equal(gk(dir, 'provenance', 'add', 'assets/hero.png', '--label', 'licensed').code, 1, 'licensed requires --license');
});

test('pre-commit hook blocks reference assets, unlabeled assets and decompiled code', () => {
  const dir = newGame();
  write(dir, 'assets/a.png', 'x');
  sh(dir, 'git', 'add', '-A');
  assert.throws(() => sh(dir, 'git', 'commit', '-qm', 'x'));
  gk(dir, 'provenance', 'add', 'assets/a.png', '--label', 'own');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'ok');
  write(dir, 'notes/Assembly-CSharp.cs', 'class X {}');
  sh(dir, 'git', 'add', '-A');
  assert.throws(() => sh(dir, 'git', 'commit', '-qm', 'x'));
  sh(dir, 'git', 'reset', '-q');
  fs.rmSync(path.join(dir, 'notes/Assembly-CSharp.cs'));
  write(dir, 'reference/orig.png', 'x');
  assert.equal(sh(dir, 'git', 'status', '--porcelain').trim(), '', 'reference/ is gitignored');
});

test('gate: parses items, runs auto checks, advances and records timings', () => {
  const items = parseGate('- [ ] a\n- [x] b (bạn)\n- [ ] c {auto: validate}\ntext');
  assert.deepEqual(items.map((i) => [i.text, i.checked, i.human, i.auto]), [
    ['a', false, false, null],
    ['b (bạn)', true, true, null],
    ['c', false, false, 'validate'],
  ]);
  const dir = newGame();
  assert.equal(gk(dir, 'gate').code, 1);
  write(dir, 'gates/P0.md', read(dir, 'gates/P0.md').replaceAll('- [ ]', '- [x]'));
  const fieldFail = gk(dir, 'gate');
  assert.equal(fieldFail.code, 1, 'source.path and forbiddenTerms still empty');
  assert.match(fieldFail.out, /source\.path chưa điền/);
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace('path: null', 'path: ../orig').replace('forbiddenTerms: []', 'forbiddenTerms: [OldName]'));
  assert.equal(gk(dir, 'gate').code, 0);
  assert.equal(gk(dir, 'gate', '--advance').code, 0);
  const y = read(dir, 'game.yaml');
  assert.match(y, /^phase: P1/m);
  assert.match(y, /P0:\n\s+passed: true/);
  assert.doesNotMatch(y, /\{\s*P0/, 'block style, not flow');
});

test('module plan: overlap, shared and wave order are rejected', () => {
  const base = { base: 'main', shared: ['src/contracts/', 'params/'] };
  const ok = checkModulePlan({ ...base, modules: [
    { id: 'a', wave: 1, owns: ['src/core/a/'], brief: 'x' },
    { id: 'b', wave: 2, owns: ['src/core/b/'], dependsOn: ['a'], brief: 'x' },
  ] });
  assert.ok(ok.ok, ok.errors.join('\n'));
  const bad = checkModulePlan({ ...base, modules: [
    { id: 'a', wave: 1, owns: ['src/core/'], brief: 'x' },
    { id: 'b', wave: 1, owns: ['src/core/b/'], dependsOn: ['a'], brief: 'x' },
    { id: 'c', wave: 1, owns: ['params/x.json'], brief: 'x' },
  ] });
  const text = bad.errors.join('\n');
  assert.match(text, /cùng sở hữu/);
  assert.match(text, /đợt trước/);
  assert.match(text, /vùng dùng chung/);
});

test('ownership: prefixes match whole path segments', () => {
  const plan = { base: 'main', shared: ['params/'], modules: [] };
  const mod = { id: 'a', owns: ['src/core/a/'] };
  assert.ok(ownershipProblems(plan, mod, ['src/core/a/x.ts']).ok);
  assert.equal(ownershipProblems(plan, mod, ['src/core/ab.ts', 'params/g.json']).errors.length, 2);
});

test('module plan: glob, absolute, .. and backslash paths are rejected (they would match nothing)', () => {
  const plan = (shared, owns) => ({ base: 'main', shared, modules: [{ id: 'a', wave: 1, owns, brief: 'x' }] });
  for (const bad of ['/params/', 'src/**/contracts.ts', '../x/', 'src\\core', 'C:/x/', '']) {
    assert.equal(checkModulePlan(plan([bad], ['src/core/a/'])).ok, false, bad);
    assert.equal(checkModulePlan(plan(['params/'], [bad])).ok, false, bad);
  }
  assert.ok(checkModulePlan(plan(['./params/', 'package.json'], ['src/core/a/'])).ok);
});

test('fanout → work → check-ownership → integrate (merge + rollback on red tests)', () => {
  const dir = newGame('para');
  write(dir, 'module-plan.yaml', `base: main
shared: [src/contracts/, params/, package.json, game.yaml, module-plan.yaml]
modules:
  - { id: a, wave: 1, owns: [src/core/a/], brief: A }
  - { id: b, wave: 1, owns: [src/core/b/], brief: B }
`);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  assert.equal(gk(dir, 'fanout', '--wave', '1').code, 0);
  const wt = (id) => path.join(path.dirname(dir), 'para.worktrees', id);
  assert.match(read(wt('a'), '.gamekit/local/BRIEF.md'), /src\/core\/a\//);
  for (const id of ['a', 'b']) {
    sh(wt(id), 'git', 'config', 'user.email', 't@e');
    write(wt(id), `src/core/${id}/x.ts`, 'export const x = 1;\n');
    sh(wt(id), 'git', 'add', '-A');
    sh(wt(id), 'git', 'commit', '-qm', id);
  }
  write(wt('b'), 'params/game.json', '{}');
  const own = gk(wt('b'), 'check-ownership');
  assert.equal(own.code, 1);
  assert.match(own.out, /vùng dùng chung/);
  sh(wt('b'), 'git', 'checkout', '-q', 'params/game.json');
  assert.equal(gk(wt('b'), 'check-ownership').code, 0);

  const head = sh(dir, 'git', 'rev-parse', 'HEAD').trim();
  const red = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 1');
  assert.equal(red.code, 1);
  assert.equal(sh(dir, 'git', 'rev-parse', 'HEAD').trim(), head, 'merge rolled back');

  const junk = gk(dir, 'integrate', '--wave', '1', '--test', 'echo x > junk.txt; exit 1');
  assert.equal(junk.code, 1);
  assert.equal(sh(dir, 'git', 'status', '--porcelain').trim(), '', 'files left by red tests are removed');

  const green = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 0');
  assert.equal(green.code, 0, green.out);
  assert.ok(fs.existsSync(path.join(dir, 'src/core/a/x.ts')));
  assert.ok(fs.existsSync(path.join(dir, 'src/core/b/x.ts')));

  // a follow-up commit on an already merged module is merged too, not skipped
  write(wt('a'), 'src/core/a/fix.ts', 'export const f = 1;\n');
  sh(wt('a'), 'git', 'add', '-A');
  sh(wt('a'), 'git', 'commit', '-qm', 'fix');
  const again = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 0', '--cleanup');
  assert.equal(again.code, 0, again.out);
  assert.ok(fs.existsSync(path.join(dir, 'src/core/a/fix.ts')), again.out);
  assert.ok(!fs.existsSync(wt('a')), 'worktree removed');

  // a worktree folder deleted by hand does not block fanout
  fs.rmSync(wt('b'), { recursive: true, force: true });
  assert.equal(gk(dir, 'fanout', '--wave', '1').code, 0);
});


test('cli args: boolean flags never swallow positionals', () => {
  assert.deepEqual(parseArgs(['provenance', 'add', '--all', 'assets', '--label', 'own']), { _: ['provenance', 'add', 'assets'], all: true, label: 'own' });
  assert.deepEqual(parseArgs(['--wave=2']), { _: [], wave: '2' });
  assert.deepEqual(parseArgs(['init', 'g', '--set', 'a=1', '--set=b=2']), { _: ['init', 'g'], set: ['a=1', 'b=2'] });
  assert.deepEqual(parseArgs(['init', '--questions', '--json', 'g']), { _: ['init', 'g'], questions: true, json: true });
});

test('session-start hook emits context JSON', () => {
  const dir = newGame('hook');
  const out = sh(dir, process.execPath, path.join(import.meta.dirname, '..', 'hooks', 'session-start.mjs'));
  const json = JSON.parse(out);
  assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(json.hookSpecificOutput.additionalContext, /Luật cứng/);
  assert.match(json.hookSpecificOutput.additionalContext, /P0 Intake/);
});

test('non-ASCII (Vietnamese) paths are checked, not quoted away', () => {
  const dir = newGame('vn');
  write(dir, 'assets/nhân vật.png', 'x');
  sh(dir, 'git', 'add', '-A');
  assert.throws(() => sh(dir, 'git', 'commit', '-qm', 'x'), /chưa có nhãn/);
  gk(dir, 'provenance', 'add', 'assets/nhân vật.png', '--label', 'own');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'ok');
});

test('pre-commit judges the staged provenance.json, not the working copy', () => {
  const dir = newGame('stg');
  write(dir, 'assets/a.png', 'x');
  sh(dir, 'git', 'add', 'assets/a.png');
  gk(dir, 'provenance', 'add', 'assets/a.png', '--label', 'own'); // labelled but provenance.json not staged
  assert.throws(() => sh(dir, 'git', 'commit', '-qm', 'x'));
});

test('integrate: moving a shared file is caught; empty branches are not "merged"; deleted branches still count', () => {
  const dir = newGame('edge');
  write(dir, 'module-plan.yaml', `base: main
shared: [src/contracts/, params/, package.json, game.yaml, module-plan.yaml]
modules:
  - { id: a, wave: 1, owns: [src/core/a/], brief: A }
  - { id: e, wave: 1, owns: [src/core/e/], brief: E }
  - { id: c, wave: 2, owns: [src/core/c/], dependsOn: [a], brief: C }
`);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  assert.equal(gk(dir, 'fanout', '--wave', '1').code, 0);
  const wt = (id) => path.join(path.dirname(dir), 'edge.worktrees', id);
  sh(wt('a'), 'git', 'config', 'user.email', 't@e');
  fs.mkdirSync(path.join(wt('a'), 'src/core/a'), { recursive: true });
  sh(wt('a'), 'git', 'mv', 'src/contracts/input.ts', 'src/core/a/input.ts');
  sh(wt('a'), 'git', 'commit', '-qm', 'move');
  const moved = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 0');
  assert.equal(moved.code, 1);
  assert.match(moved.out, /src\/contracts\/input\.ts/);
  sh(wt('a'), 'git', 'reset', '-q', '--hard', 'HEAD~1');
  write(wt('a'), 'src/core/a/x.ts', 'export const x = 1;\n');
  sh(wt('a'), 'git', 'add', '-A');
  sh(wt('a'), 'git', 'commit', '-qm', 'a');
  // e has no commits but an uncommitted file: must not be treated as merged nor have its work deleted
  write(wt('e'), 'src/core/e/wip.ts', 'export const w = 1;\n');
  const r = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 0', '--cleanup');
  assert.equal(r.code, 1);
  assert.match(r.out, /chưa commit/);
  assert.ok(fs.existsSync(path.join(wt('e'), 'src/core/e/wip.ts')), 'uncommitted work kept');
  sh(dir, 'git', 'worktree', 'remove', wt('a'));
  sh(dir, 'git', 'branch', '-D', 'mod/a');
  assert.equal(gk(dir, 'fanout', '--wave', '2').code, 0, 'a counted as merged via its merge commit');
});

test('init: titles with YAML/HTML special characters stay valid', () => {
  const parent = (() => fs.mkdtempSync(path.join(os.tmpdir(), 'gk-')))();
  const { code, out } = gk(parent, 'init', 'zr', '--title', 'Zombie: Run #2 <A & B>', '--no-install', '--no-git');
  assert.equal(code, 0, out);
  const dir = path.join(parent, 'zr');
  assert.match(read(dir, 'game.yaml'), /title: "Zombie: Run #2 <A & B>"/);
  assert.match(read(dir, 'index.html'), /<title>Zombie: Run #2 &lt;A &amp; B&gt;<\/title>/);
  assert.equal(gk(dir, 'validate').code, 0);
});

test('validate rejects unknown --stage; portal names are restricted', () => {
  const dir = newGame('stage');
  assert.equal(gk(dir, 'validate', '--stage', 'P9').code, 1);
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace('  - dev-mock', '  - ".."'));
  assert.equal(gk(dir, 'validate').code, 1);
  assert.equal(gk(dir, 'pack', '--portal', '..').code, 1);
});

test('pack: stops before building when no requested portal has its settings, naming the fix; bad --version rejected', () => {
  const dir = newGame('pk');
  let r = gk(dir, 'pack', '--portal', 'azgames');
  assert.equal(r.code, 1);
  assert.match(r.out, /gameCode/);
  assert.match(r.out, /gamekit config --portal azgames/);
  assert.ok(!fs.existsSync(path.join(dir, 'builds')));
  r = gk(dir, 'pack', '--all');
  assert.equal(r.code, 1);
  assert.match(r.out, /esbuild/, 'azgames thiếu thông tin không chặn dev-mock — dừng ở bước build vì game chưa npm install');
  r = gk(dir, 'pack', '--portal', 'dev-mock', '--version', '123');
  assert.equal(r.code, 1);
  assert.match(r.out, /8 chữ số/);
  r = gk(dir, 'pack', '--portal', 'azgames,azgames');
  assert.equal(r.out.match(/azgames: thiếu gameCode/g)?.length, 1, 'portal trùng chỉ đóng gói một lần');
  editYaml(dir, (g) => {
    g.languages = ['es'];
    g.language = 'fr';
  });
  r = gk(dir, 'pack', '--portal', 'dev-mock');
  assert.equal(r.code, 1);
  assert.match(r.out, /languages phải có en/);
  assert.match(r.out, /language fr không có trong languages/);
  assert.ok(!fs.existsSync(path.join(dir, 'builds')));
});

test('CLI runs through a symlinked bin (npm link)', (t) => {
  const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gk-')), 'gamekit');
  try {
    fs.symlinkSync(path.join(import.meta.dirname, '..', 'scripts', 'gamekit.mjs'), link);
  } catch (e) {
    // Windows without Developer Mode / admin cannot create symlinks.
    if (e.code === 'EPERM') return t.skip('không tạo được symlink trên máy này (Windows cần Developer Mode)');
    throw e;
  }
  const out = sh(os.tmpdir(), process.execPath, link, 'help');
  assert.match(out, /GameKit/);
});

// ---------- parity: obligations ledger (spec/obligations.yaml) closed by tagged tests ----------
const ob = (id, extra = {}) => ({ id, title: id, cases: ['normal'], ...extra });
const t = (name, status = 'passed') => ({ name, status });

test('parity: an obligation closes only when every required case has a passing tagged test', () => {
  const two = [ob('move', { cases: ['normal', 'edge'] })];
  const open = evaluateParity({ obligations: two, tests: [t('[move:normal] moves')] });
  assert.equal(open.ok, false);
  assert.equal(open.items[0].state, 'open');
  assert.deepEqual(open.items[0].missing, ['edge']);
  const closed = evaluateParity({ obligations: two, tests: [t('[move:normal] a'), t('parity [move:edge] b')] });
  assert.equal(closed.ok, true, closed.errors.join('\n'));
  assert.equal(closed.items[0].state, 'closed');
});

test('parity: failed, skipped or todo tagged tests never count as pass', () => {
  for (const [status, state] of [['failed', 'failed'], ['skipped', 'unknown'], ['todo', 'unknown'], ['pending', 'unknown']]) {
    const r = evaluateParity({ obligations: [ob('a')], tests: [t('[a:normal] x'), t('[a:normal] y', status)] });
    assert.equal(r.ok, false, status);
    assert.equal(r.items[0].state, state, status);
  }
});

test('parity: stale tags, unknown case kinds and a ledger without required obligations fail', () => {
  const stale = evaluateParity({ obligations: [ob('a')], tests: [t('[a:normal] x'), t('[gone:normal] y')] });
  assert.equal(stale.ok, false);
  assert.match(stale.errors.join('\n'), /gone/);
  const kind = evaluateParity({ obligations: [ob('a')], tests: [t('[a:normal] x'), t('[a:weird] y')] });
  assert.equal(kind.ok, false);
  assert.match(kind.errors.join('\n'), /weird/);
  assert.equal(evaluateParity({ obligations: [], tests: [] }).ok, false);
  const optional = evaluateParity({ obligations: [ob('a', { required: false })], tests: [] });
  assert.equal(optional.ok, false, 'không có nghĩa vụ bắt buộc nào');
  const mixed = evaluateParity({ obligations: [ob('a'), ob('b', { required: false })], tests: [t('[a:normal] x')] });
  assert.equal(mixed.ok, true, 'nghĩa vụ tuỳ chọn còn mở không chặn');
  assert.equal(mixed.items[1].state, 'open');
});

test('parity: out-of-scope/blocked needs an approved decision and never counts as closed', () => {
  const decisions = new Set(['D-2']);
  const base = [ob('a')];
  const tests = [t('[a:normal] x')];
  const waived = evaluateParity({ obligations: [...base, ob('b', { status: 'out-of-scope', decision: 'D-2', approved: true })], tests, decisions });
  assert.equal(waived.ok, true, waived.errors.join('\n'));
  assert.equal(waived.items[1].state, 'waived');
  const unapproved = evaluateParity({ obligations: [...base, ob('b', { status: 'blocked', decision: 'D-2', approved: false })], tests, decisions });
  assert.equal(unapproved.ok, false);
  const noEntry = evaluateParity({ obligations: [...base, ob('b', { status: 'blocked', decision: 'D-9', approved: true })], tests, decisions });
  assert.equal(noEntry.ok, false);
  assert.match(noEntry.errors.join('\n'), /D-9/);
});

test('parity: reads vitest JSON reports', () => {
  const report = { testResults: [{ name: '/g/tests/a.test.ts', assertionResults: [
    { ancestorTitles: ['parity'], title: '[a:normal] x', fullName: 'parity [a:normal] x', status: 'passed' },
    { ancestorTitles: ['p'], title: '[a:edge] y', status: 'failed' },
  ] }] };
  assert.deepEqual(testsFromVitestReport(report), [
    { name: 'parity [a:normal] x', file: '/g/tests/a.test.ts', status: 'passed' },
    { name: 'p [a:edge] y', file: '/g/tests/a.test.ts', status: 'failed' },
  ]);
});

test('parity: test files that fail to load or whose hook throws block parity; malformed tags are named', () => {
  const report = { testResults: [
    { name: '/g/tests/ok.test.ts', status: 'passed', assertionResults: [{ title: '[a:normal] x', status: 'passed' }] },
    { name: '/g/tests/red.test.ts', status: 'failed', assertionResults: [{ title: 'y', status: 'failed' }] },
    { name: '/g/tests/broken.test.ts', status: 'failed', message: 'Cannot find module ./nope\nstack', assertionResults: [] },
  ] };
  assert.deepEqual(brokenFilesFromVitestReport(report), [{ file: '/g/tests/broken.test.ts', message: 'Cannot find module ./nope' }]);
  const r = evaluateParity({ obligations: [ob('a')], tests: [t('[a:normal] x'), t('[A:normal] y'), t('[a : edge] z')] });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 2);
});

test('parity command: template ledger, --report, exit 1 until every obligation is closed', () => {
  const dir = newGame('par');
  const { obligations } = YAML.parse(read(dir, 'spec/obligations.yaml'));
  assert.ok(obligations.length > 0, 'template có nghĩa vụ mẫu');
  write(dir, '.gamekit/local/r.json', JSON.stringify({ testResults: [] }));
  let r = gk(dir, 'parity', '--report', '.gamekit/local/r.json');
  assert.equal(r.code, 1);
  assert.ok(r.out.includes(obligations[0].id), r.out);
  const assertionResults = obligations.flatMap((o) => o.cases.map((c) => ({ ancestorTitles: [], title: `[${o.id}:${c}] ok`, status: 'passed' })));
  write(dir, '.gamekit/local/r.json', JSON.stringify({ testResults: [{ name: 'x', assertionResults }] }));
  r = gk(dir, 'parity', '--report', '.gamekit/local/r.json');
  assert.equal(r.code, 0, r.out);
  write(dir, '.gamekit/local/r.json', JSON.stringify({ testResults: [{ name: 'x', assertionResults }, { name: path.join(dir, 'tests/b.test.ts'), status: 'failed', assertionResults: [] }] }));
  r = gk(dir, 'parity', '--report', '.gamekit/local/r.json');
  assert.equal(r.code, 1);
  assert.match(r.out, /tests\/b\.test\.ts: file test lỗi/);
  fs.rmSync(path.join(dir, 'spec/obligations.yaml'));
  r = gk(dir, 'parity', '--report', '.gamekit/local/r.json');
  assert.equal(r.code, 1);
  assert.match(r.out, /obligations\.yaml/);
  assert.match(read(dir, 'gates/P2.md'), /\{auto: parity\}/);
});

test('validate: obligations reference real params, ids are unique, waivers need DECISIONS and approval from P2', () => {
  const dir = newGame('obl');
  assert.equal(gk(dir, 'validate').code, 0);
  const put = (body) => write(dir, 'spec/obligations.yaml', `obligations:\n${body}`);
  put('  - { id: a, title: A, cases: [normal], params: [player.nope] }\n');
  let r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /player\.nope/);
  put('  - { id: a, title: A, cases: [normal] }\n  - { id: a, title: B, cases: [edge] }\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /trùng/);
  put('  - { id: a, title: A, cases: [weird] }\n');
  assert.equal(gk(dir, 'validate').code, 1);
  put('  - { id: a, title: A, cases: [normal], params: [player.speed], status: out-of-scope, decision: D-4, approved: false }\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /D-4/);
  fs.appendFileSync(path.join(dir, 'DECISIONS.md'), '\n## D-4 Bỏ chế độ online\n');
  assert.equal(gk(dir, 'validate').code, 0);
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 1);
});

test('validate: oracle tables in spec/oracles need a source and cases', () => {
  const dir = newGame('orc');
  write(dir, 'spec/oracles/pan.json', JSON.stringify({ cases: [{ in: 1, out: 2 }] }));
  const r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /source/);
  write(dir, 'spec/oracles/pan.json', JSON.stringify({ source: 'Game.exe 0x406400, đọc hằng số', confidence: 'observed', cases: [] }));
  assert.equal(gk(dir, 'validate').code, 1, 'cần ít nhất một case');
  write(dir, 'spec/oracles/pan.json', JSON.stringify({ source: 'Game.exe 0x406400', confidence: 'observed', cases: [{ in: { x: 0 }, out: 0.5 }] }));
  assert.equal(gk(dir, 'validate').code, 0);
});

test('params: confidence is observed|derived|inferred; inferred needs a tolerance from P2', () => {
  const dir = newGame('conf');
  portDemoData(dir);
  editJson(dir, 'params/game.json', (p) => {
    p.player.size.confidence = 'guess';
  });
  assert.equal(gk(dir, 'validate').code, 1);
  editJson(dir, 'params/game.json', (p) => {
    p.player.size.confidence = 'inferred';
  });
  const r = gk(dir, 'validate');
  assert.equal(r.code, 0);
  assert.match(r.out, /player\.size.*tolerance/);
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 1);
  editJson(dir, 'params/game.json', (p) => {
    p.player.size.tolerance = 0.05;
  });
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0);
});

test('init: --questions --json lists every question with its explanation', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-'));
  const r = gk(parent, 'init', 'qg', '--questions', '--json');
  assert.equal(r.code, 0, r.out);
  const qs = JSON.parse(r.out);
  const gameCode = qs.find((q) => q.key === 'azgames.gameCode');
  assert.ok(gameCode.description.length > 20);
  assert.equal(qs.find((q) => q.key === 'azgames.gameId').default, 'qg-az');
  assert.ok(!fs.existsSync(path.join(parent, 'qg')), 'chỉ in câu hỏi, không tạo game');
});

test('init: --set answers go to game.yaml; missing portal settings are reported, not fatal', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-'));
  const r = gk(parent, 'init', 'sg', '--no-install', '--set', 'title=Sao Băng', '--set', 'portals=azgames', '--set', 'languages=en,es', '--set', 'language=es', '--set', 'azgames.gameCode=g205');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /signed/);
  assert.match(r.out, /gamekit config --portal azgames/);
  const dir = path.join(parent, 'sg');
  const g = YAML.parse(read(dir, 'game.yaml'));
  assert.equal(g.title, 'Sao Băng');
  assert.deepEqual(g.portals, ['dev-mock', 'azgames']);
  assert.deepEqual(g.portalSettings.azgames, { gameCode: 'g205', gameId: 'sg-az', portalGid: 'sg', signed: null });
  assert.equal(g.language, 'es');
  assert.deepEqual(g.languages, ['en', 'es']);
  assert.equal(JSON.parse(read(dir, 'Language/es.json'))._meta.name, 'Español');
  assert.match(read(dir, 'gates/P4.md'), /\[azgames\] Popup Settings có footer/);
  assert.equal(gk(dir, 'validate').code, 0, 'thiếu setting chỉ là cảnh báo trước P4');
  assert.equal(gk(parent, 'init', 'bad', '--no-install', '--set', 'azgames.gameId=sai').code, 1);
});

test('config: fills missing settings with --set, adds a portal and its checklist, lists what is still open', () => {
  const dir = newGame('cfg');
  portDemoData(dir);
  let r = gk(dir, 'config', '--questions', '--json');
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out).map((q) => q.key), ['azgames.gameCode', 'azgames.signed']);
  r = gk(dir, 'config', '--set', 'azgames.gameCode=g9', '--set', `azgames.signed=${token({ signed: 'x', domain: 'azgame.io' })}`);
  assert.equal(r.code, 0, r.out);
  assert.equal(YAML.parse(read(dir, 'game.yaml')).portalSettings.azgames.gameCode, 'g9');
  assert.doesNotMatch(r.out, /còn thiếu/i);
  assert.equal(gk(dir, 'validate', '--stage', 'P4').code, 0);
  assert.equal(gk(dir, 'config', '--set', 'azgames.gameId=sai').code, 1);
  assert.equal(gk(dir, 'config', '--portal', 'nope').code, 1);
});

test('--set for a portal that is not enabled is an error with the fix, not silently dropped', () => {
  const dir = newGame('cfgoff');
  editYaml(dir, (g) => {
    g.portals = ['dev-mock'];
    delete g.portalSettings.azgames;
  });
  let r = gk(dir, 'config', '--set', 'azgames.gameCode=g1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /--set azgames\.gameCode: portal azgames chưa bật — thêm bằng --portal azgames \(config\) hoặc --set portals=…,azgames \(init\)/);
  assert.equal(YAML.parse(read(dir, 'game.yaml')).portalSettings.azgames, undefined);
  r = gk(dir, 'config', '--portal', 'azgames', '--set', 'azgames.gameCode=g1');
  assert.equal(r.code, 0, r.out);
  assert.equal(YAML.parse(read(dir, 'game.yaml')).portalSettings.azgames.gameCode, 'g1');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-'));
  r = gk(parent, 'init', 'offg', '--no-install', '--set', 'portals=dev-mock', '--set', 'azgames.gameCode=g1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /portal azgames chưa bật/);
  assert.ok(!fs.existsSync(path.join(parent, 'offg')), 'không tạo game dở');
});

test('status lists portal settings still missing', () => {
  const dir = newGame('st2');
  assert.match(gk(dir, 'status').out, /azgames.*gameCode/);
});

test('validate: portal settings — bad format always fails, missing warns before P4 and fails from P4', () => {
  const dir = newGame('vps');
  portDemoData(dir);
  let r = gk(dir, 'validate');
  assert.equal(r.code, 0);
  assert.match(r.out, /portalSettings\.azgames\.gameCode chưa điền/);
  assert.equal(gk(dir, 'validate', '--stage', 'P4').code, 1);
  editYaml(dir, (g) => {
    g.portalSettings.azgames.gameCode = 'g205';
    g.portalSettings.azgames.signed = token({ signed: 'x', domain: 'azgame.io' });
  });
  assert.equal(gk(dir, 'validate', '--stage', 'P4').code, 0);
  editYaml(dir, (g) => {
    g.portalSettings.azgames.gameId = 'demo';
  });
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /azgames\.gameId/);
  editYaml(dir, (g) => {
    g.portals.push('nope');
  });
  assert.match(gk(dir, 'validate').out, /Không có bộ vỏ portal "nope"/);
});

test('validate: Language — en required, extra keys and {param} mismatches fail, missing keys warn, t() keys exist', () => {
  const dir = newGame('vlang');
  editJson(dir, 'Language/en.json', (d) => {
    d['hud.score'] = 'Score: {score}';
    d['menu.play'] = 'Play';
  });
  editYaml(dir, (g) => {
    g.languages = ['es'];
  });
  assert.match(gk(dir, 'validate').out, /languages phải có en/);
  editYaml(dir, (g) => {
    g.languages = ['en', 'es'];
  });
  let r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /es\.json/);
  write(dir, 'Language/es.json', JSON.stringify({ 'hud.score': 'Puntos: {score}' }));
  r = gk(dir, 'validate');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /menu\.play/, 'thiếu key chỉ cảnh báo');
  write(dir, 'Language/es.json', JSON.stringify({ 'hud.score': 'Puntos: {puntos}', extra: 'x' }));
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /tham số/);
  assert.match(r.out, /extra/);
  write(dir, 'Language/es.json', '{}');
  write(dir, 'src/view/x.ts', "export const a = (t: (k: string) => string) => t('menu.nope');\n");
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /menu\.nope/);
  fs.rmSync(path.join(dir, 'src/view/x.ts'));
  editYaml(dir, (g) => {
    g.language = 'fr';
  });
  assert.match(gk(dir, 'validate').out, /language fr/);
});

test('validate: plural forms a language needs (few/many) are valid when en has the base; {count} ignored, unknown suffix fails', () => {
  const dir = newGame('vplural');
  editJson(dir, 'Language/en.json', (d) => {
    d['coins.one'] = 'One coin';
    d['coins.other'] = '{count} coins';
    d['lives.one'] = 'One life left in {zone}';
    d['lives.other'] = '{count} lives left in {zone}';
  });
  editYaml(dir, (g) => {
    g.languages = ['en', 'ru'];
  });
  write(dir, 'Language/ru.json', JSON.stringify({
    'coins.one': '{count} монета',
    'coins.few': '{count} монеты',
    'coins.many': '{count} монет',
    'coins.other': '{count} монеты',
    'lives.few': '{count} жизни в {zone}',
    'lives.other': '{count} жизней в {zone}',
  }));
  let r = gk(dir, 'validate');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /coins\.\w+: không có trong en\.json/);
  assert.doesNotMatch(r.out, /coins\.\w+: tham số/);
  assert.doesNotMatch(r.out, /thiếu \d+ key[^\n]*(coins|lives)\./, 'đã có một dạng số nhiều thì không đòi dạng khác');
  editJson(dir, 'Language/ru.json', (d) => {
    d['coins.bogus'] = '{count} x';
    d['lives.many'] = '{count} жизней';
  });
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /coins\.bogus: không có trong en\.json/);
  assert.match(r.out, /lives\.many: tham số/);
  editJson(dir, 'Language/ru.json', (d) => {
    delete d['coins.bogus'];
    delete d['lives.many'];
    d.constructor = 'x';
  });
  assert.match(gk(dir, 'validate').out, /constructor: không có trong en\.json/);
});

test('validate: Icons/web.png must be PNG, loading.webp must be WebP; builds/ must be gitignored', () => {
  const dir = newGame('vicon');
  assert.equal(gk(dir, 'validate').code, 0);
  fs.writeFileSync(path.join(dir, 'public/Icons/loading.webp'), 'not webp');
  assert.match(gk(dir, 'validate').out, /WebP/);
  fs.rmSync(path.join(dir, 'public/Icons/web.png'));
  assert.match(gk(dir, 'validate').out, /web\.png/);
});

test('release-check command: bad --version is an error', () => {
  const dir = newGame('rcv');
  const r = gk(dir, 'release-check', '--version', '123');
  assert.equal(r.code, 1);
  assert.match(r.out, /8 chữ số/);
});

test('release-check command: no build yet is an error', () => {
  const dir = newGame('rcn');
  const r = gk(dir, 'release-check');
  assert.equal(r.code, 1);
  assert.match(r.out, /chưa có bản build/);
});

test('pre-commit blocks build output even when force-added', () => {
  const dir = newGame('pcb');
  write(dir, 'builds/26101601/dev-mock/index.html', 'x');
  sh(dir, 'git', 'add', '-f', 'builds/26101601/dev-mock/index.html');
  assert.throws(() => sh(dir, 'git', 'commit', '-qm', 'x'), /thư mục cấm/);
});

// ---------- ownership: own (default) vs third-party ----------
const tickAll = (dir, phase) => write(dir, `gates/${phase}.md`, read(dir, `gates/${phase}.md`).replaceAll('- [ ]', '- [x]'));

test('gate: {only: …} tags parse alongside auto and (bạn)', () => {
  const items = parseGate('- [ ] a {only: third-party}\n- [ ] b {auto: validate} {only: own}\n- [ ] c (bạn) {only: own}\n- [ ] d');
  assert.deepEqual(items.map((i) => [i.text, i.auto, i.human, i.only]), [
    ['a', null, false, 'third-party'],
    ['b', 'validate', false, 'own'],
    ['c (bạn)', null, true, 'own'],
    ['d', null, false, null],
  ]);
});

test('gate: CRLF gate files are read, and an empty gate is an error rather than a pass', () => {
  assert.equal(parseGate('- [ ] a\r\n- [x] b (bạn)\r\n').length, 2);
  const dir = newGame('crlf');
  write(dir, 'gates/P0.md', read(dir, 'gates/P0.md').replace(/\r?\n/g, '\r\n'));
  assert.equal(gk(dir, 'gate').code, 1, 'unticked CRLF gate must not pass');
  write(dir, 'gates/P0.md', '# Cổng\n\nchỉ có chữ\n');
  const r = gk(dir, 'gate');
  assert.equal(r.code, 1);
  assert.match(r.out, /không có mục nào/);
});

test('ownership: a new game is the user\'s own — P0 passes without forbiddenTerms, clone items hidden', () => {
  const dir = newGame('own1');
  assert.match(read(dir, 'game.yaml'), /ownership: own/);
  assert.match(gk(dir, 'status').out, /game của bạn/);
  tickAll(dir, 'P0');
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace('path: null', 'path: ../orig'));
  const r = gk(dir, 'gate');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /forbiddenTerms|clone/);
});

test('ownership: init --third-party requires forbiddenTerms, keeps reskin phase and its decisions', () => {
  const dir = newGame('tp1', '--third-party');
  assert.match(read(dir, 'game.yaml'), /ownership: third-party/);
  assert.match(gk(dir, 'status').out, /làm lại game người khác/);
  tickAll(dir, 'P0');
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace('path: null', 'path: ../orig'));
  let r = gk(dir, 'gate');
  assert.equal(r.code, 1);
  assert.match(r.out, /forbiddenTerms chưa điền/);
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace('forbiddenTerms: []', 'forbiddenTerms: [OldName]'));
  assert.equal(gk(dir, 'gate').code, 0);
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^phase: P0/m, 'phase: P3'));
  r = gk(dir, 'status');
  assert.match(r.out, /P3 Reskin/);
  assert.match(r.out, /Đã chọn style/);
});

test('ownership: own games turn P3 into moving to the web; no style or asset-manifest to pass', () => {
  const dir = newGame('own3');
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^phase: P0/m, 'phase: P3'));
  let r = gk(dir, 'status');
  assert.match(r.out, /P3 Chuyển sang web/);
  assert.doesNotMatch(r.out, /style/i);
  tickAll(dir, 'P3');
  r = gk(dir, 'gate');
  assert.doesNotMatch(r.out, /asset-manifest|style/i);
});

test('ownership: game.yaml without the field counts as own; unknown values are rejected', () => {
  const dir = newGame('own4');
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^\s*ownership:.*\n/m, ''));
  assert.match(gk(dir, 'status').out, /game của bạn/);
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^source:\n/m, 'source:\n  ownership: mine\n'));
  const r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /ownership/);
});

test('provenance add: "." labels game files only (no leading /, no .git or node_modules); outside paths and licensed without --license are refused', () => {
  const dir = newGame('prv');
  write(dir, 'assets/a.png', 'x');
  fs.mkdirSync(path.join(dir, 'node_modules/x'), { recursive: true });
  write(dir, 'node_modules/x/i.js', '');
  let r = gk(path.join(dir, 'assets'), 'provenance', 'add', '.', '--label', 'own');
  assert.equal(r.code, 0, r.out);
  r = gk(dir, 'provenance', 'add', '.', '--label', 'own');
  assert.equal(r.code, 0, r.out);
  const paths = JSON.parse(read(dir, 'provenance.json')).entries.map((e) => e.path);
  assert.ok(paths.includes('assets/a.png'));
  assert.ok(paths.every((p) => !p.startsWith('/') && !/^(\.git|node_modules|\.gamekit)\//.test(p)), paths.join('\n'));
  write(path.dirname(dir), 'outside.txt', 'x');
  assert.match(gk(dir, 'provenance', 'add', '../outside.txt', '--label', 'own').out, /ngoài thư mục game/);
  r = gk(dir, 'provenance', 'add', 'assets/a.png', '--label', 'licensed');
  assert.equal(r.code, 1);
  assert.match(r.out, /--license/);
});

test('pre-commit judges the staged game.yaml and works when the game is a subfolder of a bigger repo', () => {
  const dir = newGame('pyml');
  const good = read(dir, 'game.yaml');
  write(dir, 'game.yaml', good.replace(/^phase: P0/m, 'phase: P9'));
  sh(dir, 'git', 'add', 'game.yaml');
  write(dir, 'game.yaml', good);
  assert.throws(() => sh(dir, 'git', 'commit', '-qm', 'x'), /phase/);
  sh(dir, 'git', 'reset', '-q');

  const repo = tmpDir();
  sh(repo, 'git', 'init', '-q');
  assert.equal(gk(repo, 'init', 'sub', '--no-git', '--no-install').code, 0);
  const sub = path.join(repo, 'sub');
  write(sub, 'assets/new.png', 'x');
  sh(repo, 'git', 'add', '-A');
  const r = gk(sub, 'precommit');
  assert.equal(r.code, 1);
  assert.match(r.out, /assets\/new\.png/);
});

test('cli: an invalid phase, a bad game name and a flag without its value are clear errors, not crashes', () => {
  const dir = newGame('bad');
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^phase: P0/m, 'phase: P9'));
  for (const cmd of ['status', 'gate']) {
    const r = gk(dir, cmd);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /phase "P9" không hợp lệ/);
  }
  const parent = tmpDir();
  for (const name of ['a-', 'a--b', '-a']) assert.match(gk(parent, 'init', name, '--no-install', '--no-git').out, /Tên: chữ thường/);
  const r = gk(parent, 'init', 'x', '--title');
  assert.equal(r.code, 2);
  assert.match(r.out, /--title cần một giá trị/);
  assert.ok(!fs.existsSync(path.join(parent, 'x')));
});

// Session-start hook (imports are hoisted; kept here so the hook tests stay in one block).
import { spawnSync } from 'node:child_process';

const HOOK = path.join(import.meta.dirname, '..', 'hooks', 'session-start.mjs');
const hookContext = (hook, cwd, env = cleanEnv()) =>
  JSON.parse(spawnSync(process.execPath, [hook], { cwd, encoding: 'utf8', env }).stdout).hookSpecificOutput.additionalContext;

test('session-start hook: a game needs .gamekit/ beside game.yaml; references are absolute; AGENTS.md parts are not repeated', () => {
  const stray = tmpDir();
  write(stray, 'game.yaml', 'name: x\n');
  fs.mkdirSync(path.join(stray, 'sub'));
  assert.doesNotMatch(hookContext(HOOK, path.join(stray, 'sub')), /Luật cứng/);
  const ctx = hookContext(HOOK, newGame('hook2'));
  assert.match(ctx, /Luật cứng/);
  assert.doesNotMatch(ctx, /## Cấu trúc một game|## Tạo game mới/);
  const ref = ctx.match(/`([^`]*standards\.md)`/)[1];
  assert.ok(path.isAbsolute(ref) && fs.existsSync(ref), ref);
});

test('session-start hook: a failed npm install is retried after a day, not every session, and is reported', { skip: process.platform === 'win32' && 'npm giả là shell script' }, () => {
  const plugin = tmpDir();
  write(plugin, 'hooks/session-start.mjs', fs.readFileSync(HOOK, 'utf8'));
  write(plugin, 'package.json', '{"version":"0.0.0-hooktest"}');
  const bin = tmpDir();
  write(bin, 'npm', `#!/bin/sh\necho x >> "${path.join(bin, 'calls')}"\nexit 1\n`);
  fs.chmodSync(path.join(bin, 'npm'), 0o755);
  const env = cleanEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  const hook = path.join(plugin, 'hooks', 'session-start.mjs');
  try {
    assert.match(hookContext(hook, bin, env), /không cài được thư viện yaml, ajv/);
    assert.match(hookContext(hook, bin, env), /lần cài trước lỗi, hook thử lại sau 1 ngày/);
    assert.equal(read(bin, 'calls').trim().split('\n').length, 1, 'npm chỉ chạy một lần');
  } finally {
    for (const f of fs.readdirSync(os.tmpdir())) if (f.startsWith('gamekit-npm-failed-0.0.0-hooktest-')) fs.rmSync(path.join(os.tmpdir(), f), { force: true });
  }
});
