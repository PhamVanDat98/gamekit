import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT, gk, newGame, token, sh, write, read, editJson, editYaml, tmpDir, fakeAssembly } from './helpers.mjs';
import { zipDir } from '../scripts/lib/zip.mjs';
import { parseGate } from '../scripts/gate.mjs';
import { checkModulePlan } from '../scripts/validate.mjs';
import { ownershipProblems, topo } from '../scripts/parallel.mjs';
import { parseArgs } from '../scripts/gamekit.mjs';
import { evaluateParity, testsFromVitestReport } from '../scripts/parity.mjs';
import YAML from 'yaml';

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

test('params: deviation needs a DECISIONS entry and approval from P2', () => {
  const dir = newGame();
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
  assert.match(gk(dir, 'gate').out, /✘ Đã chạy `gamekit recon/, 'P0 needs notes/recon.md');
  write(dir, 'notes/recon.md', '# Recon\n');
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

test('ownership and topo order', () => {
  const plan = { base: 'main', shared: ['params/'], modules: [] };
  const mod = { id: 'a', owns: ['src/core/a/'] };
  assert.ok(ownershipProblems(plan, mod, ['src/core/a/x.ts']).ok);
  assert.equal(ownershipProblems(plan, mod, ['src/core/ab.ts', 'params/g.json']).errors.length, 2);
  const order = topo([
    { id: 'c', dependsOn: ['b'] },
    { id: 'b', dependsOn: ['a'] },
    { id: 'a' },
  ]).map((m) => m.id);
  assert.deepEqual(order, ['a', 'b', 'c']);
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

  const green = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 0', '--cleanup');
  assert.equal(green.code, 0, green.out);
  assert.ok(fs.existsSync(path.join(dir, 'src/core/a/x.ts')));
  assert.ok(fs.existsSync(path.join(dir, 'src/core/b/x.ts')));
  assert.ok(!fs.existsSync(wt('a')), 'worktree removed');
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

test('pack: stops before building when a portal setting is missing, naming the fix; bad --version rejected', () => {
  const dir = newGame('pk');
  let r = gk(dir, 'pack', '--portal', 'azgames');
  assert.equal(r.code, 1);
  assert.match(r.out, /gameCode/);
  assert.match(r.out, /gamekit config --portal azgames/);
  assert.ok(!fs.existsSync(path.join(dir, 'builds')));
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
  write(dir, 'notes/recon.md', '# Recon\n');
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
  write(dir, 'notes/recon.md', '# Recon\n');
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

// ---------- re: RE journal and live monitoring ----------
const HOOK = path.join(ROOT, 'hooks', 're-monitor.mjs');
const runHook = (input) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' }).stdout;
const EV = (c) => `ev_${c.repeat(64)}`;
const addQuestions = (dir, rows) => fs.appendFileSync(path.join(dir, 'notes/QUESTIONS.md'), rows.map((r) => `| ${r.join(' | ')} |\n`).join(''));
const reJson = (dir) => JSON.parse(gk(dir, 're', '--json').out);
const journal = (dir) => read(dir, 'notes/re-log.jsonl').trim().split('\n').map((l) => JSON.parse(l));

test('re: questions by state; focus tags later steps; log checks its input', () => {
  const dir = newGame('re1');
  addQuestions(dir, [['Q2', 'Bóng tăng tốc theo level?', 'hằng số', 'một phần', ''], ['Q3', 'RNG?', 'hàm Random', 'đã trả lời', 'notes/rng.md']]);
  let r = reJson(dir);
  assert.deepEqual([r.totals.questions, r.totals.open, r.totals.partial, r.totals.answered], [3, 1, 1, 1]);
  assert.equal(r.focus, null);
  assert.equal(gk(dir, 're', 'focus', 'Q9').code, 1, 'unknown question');
  assert.equal(gk(dir, 're', 'focus', 'q2').code, 0);
  assert.equal(gk(dir, 're', 'log', 'x', '--evidence', 'ev_123').code, 1, 'evidence must be a REA id');
  assert.equal(gk(dir, 're', 'log', 'x', '--kind', 'guess').code, 1);
  assert.equal(gk(dir, 're', 'log', 'ILSpy: BallController.LevelUp nhân 1.15', '--kind', 'inspect', '--evidence', EV('a')).code, 0);
  assert.equal(gk(dir, 're', 'log', 'đo video', '--q', 'Q3').code, 0);
  const j = journal(dir);
  assert.deepEqual(j.map((e) => [e.kind, e.q]), [['focus', 'Q2'], ['inspect', 'Q2'], ['note', 'Q3']]);
  assert.equal(j[0].phase, 'P0');
  r = reJson(dir);
  assert.equal(r.focus, 'Q2');
  const q2 = r.questions.find((q) => q.id === 'Q2');
  assert.deepEqual([q2.steps, q2.evidence], [1, 1]);
  const out = gk(dir, 're').out;
  assert.match(out, /Q2\s+một phần.*1 bước · 1 evidence.*← đang làm/);
  assert.match(out, /Gần đây:/);
  assert.equal(gk(dir, 're', 'focus', '--clear').code, 0);
  assert.equal(reJson(dir).focus, null);
});

test('re: the hook records REA and RE command-line calls only, inside a game, and nudges the agent', () => {
  const dir = newGame('re2');
  const rea = { cwd: dir, tool_name: 'mcp__rea__analyze_function', tool_input: { path: '/g/Game_Data/Managed/Assembly-CSharp.dll', function: 'Ball.Update' } };
  let out = runHook({ ...rea, tool_response: { structuredContent: { evidence_id: EV('b'), normalized_result: { truncated: true } } } });
  assert.match(out, /chưa gắn câu hỏi/);
  assert.match(out, /chưa đầy đủ \(truncated\)/);
  // same analysis, keys in another order → flagged as a repeat
  out = runHook({ ...rea, tool_input: { function: 'Ball.Update', path: '/g/Game_Data/Managed/Assembly-CSharp.dll' }, tool_response: 'ok' });
  assert.match(out, /y hệt đã chạy 1 lần/);
  runHook({ cwd: dir, tool_name: 'Bash', tool_input: { command: 'ilspycmd -t Ball Assembly-CSharp.dll' }, tool_response: { stdout: '' } });
  runHook({ cwd: dir, tool_name: 'Bash', tool_input: { command: 'ls -la && npm test' }, tool_response: { stdout: '' } });
  runHook({ cwd: dir, tool_name: 'Read', tool_input: { file_path: 'x' } });
  runHook({ cwd: path.dirname(dir), tool_name: 'mcp__rea__open_binary', tool_input: {} });
  const j = journal(dir);
  assert.deepEqual(j.map((e) => [e.via, e.tool]), [['rea', 'analyze_function'], ['rea', 'analyze_function'], ['cli', 'ilspy']]);
  assert.equal(j[0].target, 'Assembly-CSharp.dll Ball.Update');
  assert.deepEqual(j[0].evidence, [EV('b')]);
  assert.deepEqual(j[0].limits, ['truncated']);
  assert.ok(!JSON.stringify(j).includes('normalized_result'), 'tool output is never stored');
  const r = reJson(dir);
  assert.equal(r.totals.steps, 3);
  assert.ok(r.warnings.some((w) => /3 bước phân tích chưa gắn câu hỏi/.test(w)));
  assert.ok(r.warnings.some((w) => /y hệt chạy 2 lần/.test(w)));
  assert.ok(r.warnings.some((w) => /chưa đầy đủ/.test(w)));
  gk(dir, 're', 'focus', 'Q1');
  out = runHook({ cwd: dir, tool_name: 'mcp__plugin_rea_rea__open_binary', tool_input: { path: '/g/x.exe' }, tool_response: 'ok' });
  assert.equal(out, '', 'nothing to say for a fresh, tagged, complete step');
  assert.equal(journal(dir).at(-1).q, 'Q1');
});

test('re: bad question states, answers without conclusion and unlogged evidence fail validate and the P1 gate', () => {
  const dir = newGame('re3');
  addQuestions(dir, [['Q2', 'a', 'b', 'xong', ''], ['Q3', 'c', 'd', 'da tra loi', '']]);
  editJson(dir, 'params/game.json', (p) => {
    p.player.speed.evidence = [EV('c')];
  });
  let r = gk(dir, 're');
  assert.equal(r.code, 1);
  assert.match(r.out, /Q2 có trạng thái "xong"/);
  assert.match(r.out, /Q3 đã trả lời nhưng cột kết luận trống/, 'states without diacritics are understood');
  assert.match(r.out, /player\.speed: evidence ev_cccccccc… không có trong notes\/re-log\.jsonl/);
  assert.equal(gk(dir, 'validate').code, 1, 'validate also rejects unlogged evidence');
  editJson(dir, 'params/game.json', (p) => {
    p.player.speed.evidence = ['ev_short'];
  });
  assert.equal(gk(dir, 'validate').code, 1, 'schema: evidence must be a REA id');
  editJson(dir, 'params/game.json', (p) => {
    p.player.speed.evidence = [EV('c')];
  });
  gk(dir, 're', 'log', 'speed', '--evidence', EV('c'));
  assert.equal(gk(dir, 'validate').code, 0);
  write(dir, 'notes/QUESTIONS.md', read(dir, 'notes/QUESTIONS.md').replace('| xong |', '| mở |').replace('| da tra loi |  |', '| đã trả lời | notes/x.md |'));
  assert.equal(gk(dir, 're').code, 0);
  // P1 gate runs {auto: re}
  editYaml(dir, (g) => {
    g.phase = 'P1';
  });
  write(dir, 'notes/QUESTIONS.md', read(dir, 'notes/QUESTIONS.md').replace('| mở |', '| ? |'));
  const gate = gk(dir, 'gate');
  assert.match(gate.out, /✘ Phân tích đủ để dựng lại.*\[auto: re\].*Q1 có trạng thái "\?"/);
});

test('re: a third-party game is warned when a runtime REA tool touched the original', () => {
  const dir = newGame('re4', '--third-party');
  const out = runHook({ cwd: dir, tool_name: 'mcp__rea__capture_process_scenario', tool_input: {}, tool_response: 'ok' });
  assert.match(out, /chỉ được phân tích file tĩnh/);
  assert.ok(reJson(dir).warnings.some((w) => /1 lần chạy\/gắn vào game: capture_process_scenario/.test(w)));
  const own = newGame('re5');
  assert.doesNotMatch(runHook({ cwd: own, tool_name: 'mcp__rea__capture_process_scenario', tool_input: {}, tool_response: 'ok' }), /file tĩnh/);
});

// ---------- recon: what the original game is made of ----------
const GAME_TYPES = [
  { name: 'Unit', base: 'UnityEngine.MonoBehaviour', methods: 3 },
  { ns: 'Game', name: 'Player', base: 'Unit', methods: 5 },
  { name: 'LevelData', base: 'UnityEngine.ScriptableObject', methods: 1 },
  { name: 'Score', base: 'System.Object', methods: 2 },
  { ns: 'DG.Tweening', name: 'Tween', base: 'System.Object', methods: 9 },
];
function unityMonoBuild() {
  const d = tmpDir();
  write(d, 'Game.exe', 'MZ');
  fs.mkdirSync(path.join(d, 'Game_Data', 'Managed'), { recursive: true });
  fs.writeFileSync(path.join(d, 'Game_Data', 'Managed', 'Assembly-CSharp.dll'), fakeAssembly(GAME_TYPES));
  write(d, 'Game_Data/Managed/Photon3Unity3D.dll', 'x');
  write(d, 'Game_Data/Managed/DOTween.dll', 'x');
  write(d, 'Game_Data/globalgamemanagers', 'UnityFS\0\0\0\0\x065.x.x\x002021.3.5f1\0');
  return d;
}

test('recon: Unity Mono build — engine, version, SDKs, inventory through base classes, triage', () => {
  const src = unityMonoBuild();
  const r = JSON.parse(gk(src, 'recon', src, '--json').out);
  assert.deepEqual([r.engine, r.variant, r.engineVersion, r.platform], ['unity', 'mono', '2021.3.5f1', 'windows']);
  assert.deepEqual(r.inventory.items.map((i) => [i.id, i.kind]), [['Unit', 'MonoBehaviour'], ['Game.Player', 'MonoBehaviour'], ['LevelData', 'ScriptableObject'], ['Score', 'class']], 'library namespaces are left out');
  assert.equal(r.inventory.items[1].methods, 5);
  assert.deepEqual(r.sdks.map((s) => s.cat), ['server', 'lib']);
  assert.ok(r.signals.some((s) => s.level === 'risk' && /Photon3Unity3D/.test(s.text)));
  assert.equal(r.obfuscated, false);
  assert.equal(r.triage.factors.find((f) => f.name === 'Phụ thuộc server').value, 1.5);
  assert.equal(r.triage.verdict.level, 'go');
  assert.match(gk(src, 'recon', src).out, /Engine: unity 2021\.3\.5f1 · mono · windows/);
});

test('recon --write: notes/recon.md (keeps own notes), game.yaml, inventory merge keeps covers/skip', () => {
  const src = unityMonoBuild();
  const dir = newGame('rc1');
  editYaml(dir, (g) => {
    g.source.engine = 'unknown';
  });
  let r = gk(dir, 'recon', src, '--write');
  assert.equal(r.code, 0, r.out);
  const g = YAML.parse(read(dir, 'game.yaml'));
  assert.deepEqual([g.source.engine, g.source.engineVersion, g.source.variant], ['unity', '2021.3.5f1', 'mono']);
  assert.equal(path.resolve(dir, g.source.path), src);
  assert.equal(g.budget.plannedDays.P0, 0.5);
  assert.match(gk(dir, 're').out, /gamekit recon .* → unity mono/, 'recon is logged as an analysis step');
  assert.match(read(dir, 'notes/recon.md'), /## Đánh giá khả thi/);
  fs.appendFileSync(path.join(dir, 'notes/recon.md'), 'GHI-CHU-CUA-TOI\n');
  const inv = YAML.parse(read(dir, 'spec/inventory.yaml'));
  inv.items[0].covers = ['Q1'];
  inv.items[3].skip = 'không phải gameplay';
  write(dir, 'spec/inventory.yaml', YAML.stringify(inv));
  editYaml(dir, (g2) => {
    g2.budget.plannedDays.P1 = 9;
  });
  fs.writeFileSync(path.join(src, 'Game_Data', 'Managed', 'Assembly-CSharp.dll'), fakeAssembly([...GAME_TYPES, { name: 'Boss', base: 'Unit', methods: 4 }]));
  r = gk(dir, 'recon', '--write'); // path from game.yaml
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\+1 mục mới/);
  assert.match(read(dir, 'notes/recon.md'), /GHI-CHU-CUA-TOI/);
  const inv2 = YAML.parse(read(dir, 'spec/inventory.yaml'));
  assert.deepEqual(inv2.items[0].covers, ['Q1']);
  assert.equal(inv2.items[3].skip, 'không phải gameplay');
  assert.equal(inv2.items.at(-1).id, 'Boss');
  assert.equal(YAML.parse(read(dir, 'game.yaml')).budget.plannedDays.P1, 9, 'planned days set by hand are kept');
  assert.equal(gk(dir, 'validate').code, 0);
  write(dir, 'spec/inventory.yaml', 'items:\n  - id: X\n    covers: []\n');
  assert.equal(gk(dir, 'validate').code, 1, 'schema: covers needs at least one ref');
});

test('recon: IL2CPP APK, encrypted metadata, dump.cs inventory, Godot .pck, Cocos bundle, unknown', () => {
  // IL2CPP inside an APK (zip)
  const apkDir = tmpDir();
  write(apkDir, 'lib/arm64-v8a/libil2cpp.so', 'x');
  write(apkDir, 'lib/arm64-v8a/libunity.so', 'x');
  const meta = Buffer.concat([Buffer.from([0xaf, 0x1b, 0xb1, 0xfa, 29, 0, 0, 0]), Buffer.from('Assembly-CSharp.dll\0GoogleMobileAds.dll\0')]);
  fs.mkdirSync(path.join(apkDir, 'assets/bin/Data/Managed/Metadata'), { recursive: true });
  fs.writeFileSync(path.join(apkDir, 'assets/bin/Data/Managed/Metadata/global-metadata.dat'), meta);
  write(apkDir, 'assets/bin/Data/globalgamemanagers', 'xx 2022.3.10f1 yy');
  const apk = path.join(tmpDir(), 'game.apk');
  zipDir(apkDir, apk);
  let r = JSON.parse(gk(tmpDir(), 'recon', apk, '--json').out);
  assert.deepEqual([r.engine, r.variant, r.engineVersion, r.platform, r.obfuscated], ['unity', 'il2cpp', '2022.3.10f1', 'android', null]);
  assert.deepEqual(r.sdks.map((s) => s.cat), ['ads']);
  assert.ok(r.unknowns.some((u) => /Il2CppDumper/.test(u)));
  meta[0] = 0;
  fs.writeFileSync(path.join(apkDir, 'assets/bin/Data/Managed/Metadata/global-metadata.dat'), meta);
  zipDir(apkDir, apk);
  r = JSON.parse(gk(tmpDir(), 'recon', apk, '--json').out);
  assert.equal(r.obfuscated, true);
  assert.ok(r.signals.some((s) => /FAB11BAF/.test(s.text)));
  assert.ok(r.triage.factors.find((f) => f.name === 'Làm rối code').value > 1);

  // Il2CppDumper dump.cs → only Assembly-CSharp types
  const d = tmpDir();
  write(d, 'dump.cs', [
    '// Image 0: mscorlib.dll - 0', '// Image 1: Assembly-CSharp.dll - 10',
    '// Namespace: System', 'public class Object // TypeDefIndex: 1',
    '// Namespace: ', 'public class Enemy : MonoBehaviour // TypeDefIndex: 11',
    '// Namespace: Game', 'public sealed class Boss : Enemy // TypeDefIndex: 12',
    '// Namespace: ', 'internal struct Hit // TypeDefIndex: 13',
  ].join('\n'));
  r = JSON.parse(gk(d, 'recon', 'dump.cs', '--json').out);
  assert.equal(r.inventoryOnly, true);
  assert.deepEqual(r.inventory.items.map((i) => [i.id, i.kind]), [['Enemy', 'MonoBehaviour'], ['Game.Boss', 'MonoBehaviour'], ['Hit', 'struct']]);

  // Godot 3 .pck
  const entry = (p) => Buffer.concat([Buffer.from([p.length, 0, 0, 0]), Buffer.from(p), Buffer.alloc(32)]);
  const head = Buffer.alloc(20 + 64 + 4);
  head.write('GDPC');
  [1, 3, 5, 1].forEach((v, i) => head.writeUInt32LE(v, 4 + i * 4));
  head.writeUInt32LE(3, 84);
  write(d, 'game.pck', '');
  fs.writeFileSync(path.join(d, 'game.pck'), Buffer.concat([head, entry('res://player.gdc'), entry('res://player.gd.remap'), entry('res://icon.png')]));
  r = JSON.parse(gk(d, 'recon', 'game.pck', '--json').out);
  assert.deepEqual([r.engine, r.engineVersion], ['godot', '3.5.1']);
  assert.deepEqual(r.inventory.items.map((i) => i.id), ['player']);

  // Cocos Creator 2 web build
  const c = tmpDir();
  write(c, 'index.html', '<html>');
  write(c, 'cocos2d-js-min.js', 'cc.ENGINE_VERSION = "2.4.11";');
  write(c, 'src/settings.js', 'window._CCSettings={}');
  write(c, 'src/project.js', 'cc._RF.push(t, "a1b2", "PlayerCtrl"); cc._RF.push(t, "c3d4", "EnemySpawner");');
  r = JSON.parse(gk(c, 'recon', c, '--json').out);
  assert.deepEqual([r.engine, r.variant, r.engineVersion], ['cocos', 'creator-2', '2.4.11']);
  assert.deepEqual(r.inventory.items.map((i) => i.id), ['PlayerCtrl', 'EnemySpawner']);

  // nothing recognisable
  const u = tmpDir();
  write(u, 'readme.txt', 'hi');
  r = JSON.parse(gk(u, 'recon', u, '--json').out);
  assert.equal(r.engine, 'unknown');
  assert.ok(r.unknowns.includes('engine'));
  assert.equal(gk(u, 'recon', path.join(u, 'missing')).code, 1);
  assert.equal(gk(u, 'recon').code, 1, 'no path and no game');
});

test('re: inventory coverage, gameplay spec, obligations from RE and question impact gate P1; open questions gate P2', () => {
  const dir = newGame('cov');
  write(dir, 'spec/inventory.yaml', YAML.stringify({ source: 'x', ignore: [{ pattern: 'UI*', reason: 'giao diện' }], items: [{ id: 'Player', covers: ['Q1', 'player.move'] }, { id: 'UIMenu' }, { id: 'Ads', skip: 'SDK' }, { id: 'Enemy' }] }));
  let r = reJson(dir);
  assert.deepEqual(r.coverage, { total: 4, covered: 1, skipped: 2, open: 1 });
  assert.ok(r.pending.some((p) => /1\/4 cơ chế .* chưa xử lý.*Enemy/.test(p)));
  assert.ok(r.pending.some((p) => /gameplay-spec\.md còn \d+ mục TODO/.test(p)));
  assert.ok(r.pending.some((p) => /6 nghĩa vụ chưa trỏ tới ghi chú RE/.test(p)));
  assert.match(gk(dir, 're').out, /Danh mục cơ chế: 75% đã xử lý/);
  assert.match(gk(dir, 're').out, /Còn phải xong trước cổng P1:/);
  assert.equal(gk(dir, 're').code, 0, 'pending work is not an error');

  // bad refs are errors
  write(dir, 'spec/inventory.yaml', YAML.stringify({ items: [{ id: 'Player', covers: ['Q9', 'nope.x'] }] }));
  r = reJson(dir);
  assert.equal(r.errors.filter((e) => /covers (Q9|nope\.x)/.test(e)).length, 2);

  // finish everything P1 asks for
  write(dir, 'spec/inventory.yaml', YAML.stringify({ items: [{ id: 'Player', covers: ['player.move'] }, { id: 'Enemy', skip: 'không có trong bản này' }] }));
  write(dir, 'spec/gameplay-spec.md', '# Spec\n\n## Core loop\nNé vật rơi.\n');
  write(dir, 'notes/player.md', '# Player\n');
  const ob = YAML.parse(read(dir, 'spec/obligations.yaml'));
  for (const o of ob.obligations) o.source = 'notes/player.md#move';
  write(dir, 'spec/obligations.yaml', YAML.stringify(ob));
  r = reJson(dir);
  assert.deepEqual(r.pending, []);
  write(dir, 'notes/QUESTIONS.md', read(dir, 'notes/QUESTIONS.md').replace('| điều khiển nhanh/chậm hơn bản gốc |', '| |'));
  assert.ok(reJson(dir).pending.some((p) => /Q1 chưa xong nhưng chưa ghi ảnh hưởng/.test(p)));
  write(dir, 'notes/QUESTIONS.md', read(dir, 'notes/QUESTIONS.md').replace('| mở | | |', '| mở | | chậm hơn |'));
  assert.deepEqual(reJson(dir).pending, []);

  // from P2 an open question blocks the gate
  editYaml(dir, (g) => {
    g.phase = 'P2';
  });
  r = reJson(dir);
  assert.equal(r.gatePhase, 'P2');
  assert.ok(r.pending.some((p) => /từ P2 không còn câu "mở": Q1/.test(p)));
  assert.match(gk(dir, 'gate').out, /✘ Không còn câu hỏi RE "mở".*\[auto: re\]/);
});

test('assets: kinds and sizes, formats to convert, oversize files, provenance; --write', () => {
  const dir = newGame('ast');
  write(dir, 'reference/export/hero.psd', 'x');
  write(dir, 'reference/export/bgm.wav', 'x'.repeat(1600000));
  write(dir, 'reference/export/hit.ogg', 'x');
  write(dir, 'reference/export/boss.fbx', 'x');
  write(dir, 'reference/export/data.bin', 'x');
  const r = JSON.parse(gk(dir, 'assets', 'reference/export', '--json').out);
  assert.equal(r.files, 5);
  assert.deepEqual(r.convert.map((f) => [f.ext, f.convert]).sort(), [['fbx', 'glb'], ['psd', 'png/webp'], ['wav', 'ogg/m4a (wav quá nặng cho web)']]);
  assert.deepEqual(r.large.map((f) => f.path), ['reference/export/bgm.wav']);
  assert.deepEqual(r.unknown.map((f) => f.path), ['reference/export/data.bin']);
  // default: the game's assets/ + public/, with provenance labels
  write(dir, 'assets/new.png', 'x');
  const out = gk(dir, 'assets', '--write');
  assert.equal(out.code, 0, out.out);
  assert.match(out.out, /Provenance: .*chưa có nhãn 1/);
  assert.match(read(dir, 'notes/assets.md'), /# Kiểm kê asset/);
  assert.equal(gk(dir, 'assets', 'nope').code, 1);
});

test('smoke: needs a build; judges readiness, start, FPS, errors and Settings against the budget', async () => {
  const dir = newGame('smk');
  const r = gk(dir, 'smoke');
  assert.equal(r.code, 1);
  assert.match(r.out, /Chưa có bản build/);
  assert.match(gk(dir, 'smoke', '--version', '26010101').out, /Không có builds\/26010101/);
  const { judgeSmoke } = await import('../scripts/smoke.mjs');
  const budget = { timeToPlaySec: 5, minFpsDesktop: 60, minFpsMobile: 30 };
  const good = { profile: 'desktop', label: 'd', readyMs: 1200, playable: true, fps: 58, errors: [], failed: [], settings: 'ok' };
  assert.ok(judgeSmoke(budget, [good])[0].checks.every((c) => c.ok), 'FPS within 10% passes');
  const bad = { profile: 'mobile-portrait', label: 'm', readyMs: 7000, playable: false, fps: 20, errors: ['boom'], failed: ['/a.png (404)'], settings: null };
  const failed = judgeSmoke(budget, [bad])[0].checks.filter((c) => !c.ok).map((c) => c.name);
  assert.deepEqual(failed, ['thời gian vào game', 'bắt đầu chơi bằng phím/chạm', 'FPS', 'không lỗi console', 'không request hỏng']);
  const never = judgeSmoke(budget, [{ ...bad, readyMs: null, fps: null }])[0].checks.find((c) => c.name === 'vào được game');
  assert.equal(never.ok, false);
});

test('asset-manifest: audio needs no size; collider must be a param; brief without original names; make matches provenance', () => {
  const dir = newGame('man', '--third-party');
  editYaml(dir, (g) => {
    g.release.forbiddenTerms = ['OldName'];
  });
  const man = (assets) => write(dir, 'asset-manifest.json', JSON.stringify({ assets }));
  man([{ id: 'bgm', path: 'assets/audio/bgm.ogg', kind: 'audio', loop: true, duration: 42 }]);
  assert.equal(gk(dir, 'validate').code, 0, gk(dir, 'validate').out);
  man([{ id: 'p', path: 'assets/p.png', kind: 'sprite' }]);
  assert.match(gk(dir, 'validate').out, /width/);
  man([{ id: 'p', path: 'assets/p.png', kind: 'sprite', width: 36, height: 36, collider: 'player.nope', brief: 'giống nhân vật của oldname' }]);
  const out = gk(dir, 'validate').out;
  assert.match(out, /collider player\.nope không có trong params/);
  assert.match(out, /brief nhắc "oldname"/);
  write(dir, 'assets/p.png', 'x');
  gk(dir, 'provenance', 'add', 'assets/p.png', '--label', 'placeholder');
  man([{ id: 'p', path: 'assets/p.svg', kind: 'sprite', width: 36, height: 36, collider: 'player.size', make: 'image-gen' }]);
  write(dir, 'assets/p.svg', '<svg/>');
  gk(dir, 'provenance', 'add', 'assets/p.svg', '--label', 'own');
  assert.match(gk(dir, 'validate').out, /make image-gen nhưng assets\/p\.svg có nhãn own/);
});
