import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gk, newGame, token, sh, write, read, editJson, editYaml } from './helpers.mjs';
import { parseGate } from '../scripts/gate.mjs';
import { checkModulePlan, physicsImpact } from '../scripts/validate.mjs';
import { ownershipProblems, topo } from '../scripts/parallel.mjs';
import { parseArgs } from '../scripts/gamekit.mjs';
import { evaluateParity, fidelitySummary, testsFromVitestReport } from '../scripts/parity.mjs';
import { zipDir } from '../scripts/lib/zip.mjs';
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

const trajectory = (over = {}) => ({
  source: 'Unity Editor, cảnh Calib',
  kind: 'trajectory',
  stepHz: 60,
  toleranceAbs: 0.05,
  cases: [{ in: { scene: 'a', tick: 10 }, out: { x: 1, y: 0 } }],
  ...over,
});

test('validate: trajectory oracles need stepHz, { scene, tick }, numeric samples and an absolute tolerance', () => {
  const dir = newGame('traj');
  const put = (o) => write(dir, 'spec/oracles/t.json', JSON.stringify(o));
  put(trajectory());
  assert.equal(gk(dir, 'validate').code, 0);
  put(trajectory({ stepHz: undefined }));
  assert.match(gk(dir, 'validate').out, /stepHz/);
  put(trajectory({ toleranceAbs: undefined }));
  assert.match(gk(dir, 'validate').out, /toleranceAbs/);
  put(trajectory({ cases: [{ in: { tick: 10 }, out: { x: 1 } }] }));
  assert.match(gk(dir, 'validate').out, /scene, tick/);
  put(trajectory({ cases: [{ in: { scene: 'a', tick: 1 }, out: { x: 'xa' } }] }));
  assert.equal(gk(dir, 'validate').code, 1);
  put(trajectory({ stepHz: 50 }));
  const r = gk(dir, 'validate');
  assert.equal(r.code, 0, 'khác tần số chỉ là cảnh báo');
  assert.match(r.out, /50 Hz/);
});

test('validate: calibrated and emergent obligations need an oracle, a reasoned threshold and, when tuned, a holdout set', () => {
  const dir = newGame('fid');
  const put = (extra) => write(dir, 'spec/obligations.yaml', `obligations:\n  - { id: ball, title: B, cases: [oracle], ${extra} }\n`);
  put('fidelity: calibrated');
  assert.equal(gk(dir, 'validate').code, 0, 'trước P2 chỉ cảnh báo');
  assert.match(gk(dir, 'validate', '--stage', 'P2').out, /cần file oracle/);
  write(dir, 'spec/oracles/ball.json', JSON.stringify(trajectory()));
  put('fidelity: calibrated, oracle: spec/oracles/ball.json');
  let r = gk(dir, 'validate', '--stage', 'P2');
  assert.match(r.out, /toleranceDecision/);
  assert.match(r.out, /holdout/);
  const c = { in: { scene: 'a', tick: 1 }, out: { x: 1 } };
  write(dir, 'spec/oracles/ball.json', JSON.stringify(trajectory({ toleranceDecision: 'D-7', cases: [{ ...c, role: 'calibrate' }, { ...c, role: 'holdout' }] })));
  assert.match(gk(dir, 'validate', '--stage', 'P2').out, /D-7/);
  fs.appendFileSync(path.join(dir, 'DECISIONS.md'), '\n## D-7 Ngưỡng bóng\n');
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 0, r.out);
  put('fidelity: emergent, oracle: spec/oracles/ball.json');
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0, 'emergent không cần holdout');
  write(dir, 'spec/obligations.yaml', 'obligations:\n  - { id: ball, title: B, cases: [normal], fidelity: emergent, oracle: spec/oracles/ball.json }\n');
  assert.match(gk(dir, 'validate', '--stage', 'P2').out, /cần case oracle/);
  write(dir, 'spec/obligations.yaml', 'obligations:\n  - { id: ball, title: B, cases: [normal], fidelity: nearly }\n');
  assert.equal(gk(dir, 'validate').code, 1);
});

test('parity: closed obligations are reported by fidelity, without implying identical results', () => {
  const items = [
    { required: true, state: 'closed', fidelity: 'exact' },
    { required: true, state: 'closed', fidelity: 'calibrated' },
    { required: true, state: 'closed' },
    { required: true, state: 'open', fidelity: 'emergent' },
    { required: false, state: 'closed', fidelity: 'exact' },
  ];
  const line = fidelitySummary(items);
  assert.match(line, /exact 1 · calibrated 1 · emergent 0 · chưa khai 1/);
  assert.match(line, /không phải trùng khớp/);
  assert.equal(fidelitySummary([{ required: true, state: 'closed' }]), null);
  const r = evaluateParity({ obligations: [{ id: 'a', title: 'A', cases: ['normal'], fidelity: 'exact' }], tests: [{ name: '[a:normal] x', status: 'passed' }] });
  assert.equal(r.items[0].fidelity, 'exact');
});

test('fixed step: the rate in params is what runs, and game.yaml must agree with it', () => {
  const dir = newGame('hz');
  assert.match(read(dir, 'src/main.ts'), /createFixedStep\(PARAMS\.sim\.fixedStepHz\)/);
  editJson(dir, 'params/game.json', (p) => {
    p.sim.fixedStepHz.value = 50;
  });
  const r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /sim\.fixedStepHz = 50/);
  editYaml(dir, (g) => {
    g.runtime.fixedStepHz = 50;
  });
  assert.equal(gk(dir, 'validate').code, 0);
});

// ---------- physics assessment (spec/physics-assessment.yaml) ----------
const mechanic = (over = {}) => ({
  id: 'ball.bounce',
  title: 'Bóng bật khỏi tường',
  usage: ['AddForce'],
  solver: true,
  outcome: 'decisive',
  sensitivity: 'high',
  impact: 'high',
  fidelity: 'calibrated',
  ...over,
});
const candidate = (over = {}) => ({ library: 'planck', passed: true, deviation: '0.04 m', gzipKB: 60, stepMs: 0.8, device: 'Android', ...over });
const physicsFile = (rec = {}, mechanics = [mechanic()], original = {}) =>
  YAML.stringify({
    original: { kind: '2d', fixedStepHz: 60, source: 'TimeManager.asset', ...original },
    scope: 'Assembly-CSharp, toàn bộ scene',
    mechanics,
    recommendation: {
      library: 'planck',
      rationale: '2D có bóng dynamic',
      decision: 'D-3',
      spike: { mechanics: ['ball.bounce'], result: 'spec/spikes/physics.md', confidence: 'observed', candidates: [candidate()] },
      ...rec,
    },
  });
/** A game whose assessment is complete; tests break one thing at a time. */
function physicsGame(name) {
  const dir = newGame(name);
  write(dir, 'spec/physics-assessment.yaml', physicsFile());
  write(dir, 'spec/spikes/physics.md', '# Kết quả chạy thử\n');
  fs.appendFileSync(path.join(dir, 'DECISIONS.md'), '\n## D-3 Dùng planck\n');
  editYaml(dir, (g) => {
    g.runtime.physics = 'planck';
  });
  return dir;
}
const gateP1 = (dir) => {
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^phase: P0/m, 'phase: P1'));
  return gk(dir, 'gate');
};
const physicsLine = (out) => out.split('\n').find((l) => l.includes('[auto: physics]'));

test('physics: impact follows outcome and sensitivity', () => {
  assert.equal(physicsImpact('decisive', 'high'), 'high');
  assert.equal(physicsImpact('decisive', 'low'), 'medium');
  assert.equal(physicsImpact('feel', 'high'), 'medium');
  assert.equal(physicsImpact('feel', 'low'), 'low');
  assert.equal(physicsImpact('cosmetic', 'high'), 'low');
});

test('physics gate: blocked until the assessment exists and the user approves', () => {
  const dir = newGame('phy0');
  assert.match(read(dir, 'gates/P1.md'), /\{auto: physics\}/);
  let r = gateP1(dir);
  assert.equal(r.code, 1);
  assert.match(physicsLine(r.out), /chưa có spec\/physics-assessment\.yaml/);
  assert.match(r.out, /Đã duyệt kết quả đánh giá vật lý.*\[bạn quyết\]/);
  const done = physicsGame('phy1');
  r = gateP1(done);
  assert.doesNotMatch(physicsLine(r.out), /—/, r.out);
});

test('physics: a game without physics declares none with its inventory and needs no spike', () => {
  const dir = newGame('phy2');
  const none = { library: 'none', rationale: 'Không tìm thấy', decision: undefined, spike: undefined };
  write(dir, 'spec/physics-assessment.yaml', physicsFile(none, [], { fixedStepHz: null }));
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0);
  assert.doesNotMatch(physicsLine(gateP1(dir).out), /—/);
  const noScope = YAML.parse(physicsFile(none, [], { fixedStepHz: null }));
  delete noScope.scope;
  write(dir, 'spec/physics-assessment.yaml', YAML.stringify(noScope));
  assert.match(gk(dir, 'validate').out, /scope/);
  const kinematic = mechanic({ solver: false, fidelity: 'exact' });
  write(dir, 'spec/physics-assessment.yaml', physicsFile(none, [kinematic], { fixedStepHz: null }));
  write(dir, 'spec/obligations.yaml', 'obligations:\n  - { id: ball.bounce, title: B, cases: [normal], fidelity: exact }\n');
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0, 'mức high không phụ thuộc solver thì không cần chạy thử');
  write(dir, 'spec/physics-assessment.yaml', physicsFile(none, [mechanic()], { fixedStepHz: null }));
  const r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /phụ thuộc solver nhưng library là none/);
  write(dir, 'spec/physics-assessment.yaml', physicsFile(none, [mechanic({ outcome: 'cosmetic', sensitivity: 'low', impact: 'low' })], { fixedStepHz: null }));
  assert.equal(gk(dir, 'validate').code, 0, 'vật lý trang trí không cần thư viện');
});

test('physics: contradictions are errors at any phase', () => {
  const dir = physicsGame('phy3');
  const put = (...a) => write(dir, 'spec/physics-assessment.yaml', physicsFile(...a));
  put({}, [mechanic({ impact: 'low' })]);
  let r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /là mức high, không phải low/);
  put({}, [mechanic(), mechanic()]);
  assert.match(gk(dir, 'validate').out, /trùng id ball\.bounce/);
  put({ spike: { mechanics: ['gone'], result: 'spec/spikes/physics.md', confidence: 'observed', candidates: [candidate()] } });
  assert.match(gk(dir, 'validate').out, /cơ chế không có: gone/);
  put({ spike: { mechanics: ['ball.bounce'], result: 'spec/spikes/physics.md', confidence: 'observed', candidates: [candidate({ gzipKB: 20480 })] } });
  assert.match(gk(dir, 'validate').out, /vượt budget\.initialLoadMB/);
  write(dir, 'spec/physics-assessment.yaml', 'original: [\n');
  assert.equal(gk(dir, 'validate').code, 1);
});

test('physics: an unfinished assessment warns before P2, then blocks the gate and validate', () => {
  const dir = physicsGame('phy4');
  const spike = (over = {}) => ({ mechanics: ['ball.bounce'], result: 'spec/spikes/physics.md', confidence: 'observed', candidates: [candidate()], ...over });
  const cases = [
    [{ spike: undefined }, /cần chạy thử/],
    [{ decision: undefined }, /cần decision/],
    [{ decision: 'D-9' }, /D-9/],
    [{ spike: spike({ result: 'spec/spikes/none.md' }) }, /không có file kết quả/],
    [{ spike: spike({ candidates: [candidate({ library: 'other' })] }) }, /spike chưa thử planck/],
    [{ spike: spike({ candidates: [candidate({ passed: false })] }) }, /chưa đạt khi chạy thử/],
    [{ library: 'matter-js', spike: spike({ candidates: [candidate({ library: 'matter-js' })] }) }, /khác runtime\.physics/],
  ];
  for (const [rec, msg] of cases) {
    write(dir, 'spec/physics-assessment.yaml', physicsFile(rec));
    const soft = gk(dir, 'validate');
    assert.equal(soft.code, 0, soft.out);
    assert.match(soft.out, msg);
    const hard = gk(dir, 'validate', '--stage', 'P2');
    assert.equal(hard.code, 1);
    assert.match(hard.out, msg);
  }
  write(dir, 'spec/physics-assessment.yaml', physicsFile({ spike: spike({ candidates: [candidate({ passed: false })] }) }));
  assert.match(physicsLine(gateP1(dir).out), /chưa đạt khi chạy thử/);
});

test('physics: running at another rate than the original needs a decision', () => {
  const dir = physicsGame('phy5');
  write(dir, 'spec/physics-assessment.yaml', physicsFile({}, [mechanic()], { fixedStepHz: 50 }));
  assert.match(physicsLine(gateP1(dir).out), /game gốc chạy 50 Hz, bản web 60 Hz/);
  write(dir, 'spec/physics-assessment.yaml', physicsFile({}, [mechanic()], { fixedStepHz: 50, fixedStepDecision: 'D-3' }));
  assert.doesNotMatch(physicsLine(gk(dir, 'gate').out), /—/);
});

test('physics: from P2 each mechanic that affects play has an obligation of the same id and fidelity', () => {
  const dir = physicsGame('phy6');
  let r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 1);
  assert.match(r.out, /ball\.bounce: spec\/obligations\.yaml chưa có nghĩa vụ/);
  assert.equal(gk(dir, 'validate').code, 0, 'P1 chưa cần nghĩa vụ');
  write(dir, 'spec/obligations.yaml', 'obligations:\n  - { id: ball.bounce, title: B, cases: [normal], fidelity: exact }\n');
  assert.match(gk(dir, 'validate', '--stage', 'P2').out, /fidelity calibrated khác nghĩa vụ \(exact\)/);
  write(dir, 'spec/physics-assessment.yaml', physicsFile({}, [mechanic({ fidelity: 'exact' })]));
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 0, r.out);
});

test('physics: a game without the assessment still validates from P2, with a warning', () => {
  const dir = newGame('phy7');
  const r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /physics-assess/);
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

// ---------- unpack ----------
const UNITY_HEAD = Buffer.concat([Buffer.from('UnityFS\0', 'latin1'), Buffer.from([0, 0, 0, 8]), Buffer.from('5.x.x\x002022.3.20f1\0', 'latin1'), Buffer.alloc(64)]);
const METADATA = Buffer.concat([Buffer.from([0xaf, 0x1b, 0xb1, 0xfa]), Buffer.from([31, 0, 0, 0]), Buffer.alloc(32)]);

/** Zip a { relPath: content } tree into `file`. */
function zipTree(file, tree) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-zip-'));
  for (const [rel, content] of Object.entries(tree)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  zipDir(dir, file);
  return file;
}

/** An XAPK shaped like Play's split delivery: logic and data in separate APKs. */
function splitXapk(parent, { metadata = METADATA, withSplit = true } = {}) {
  const apks = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-apks-'));
  const tree = {
    'manifest.json': JSON.stringify({ package_name: 'com.example.game', name: 'Example', version_name: '1.2', version_code: '12' }),
    'base.apk': fs.readFileSync(zipTree(path.join(apks, 'base.apk'), { 'AndroidManifest.xml': 'x', 'assets/bin/Data/Managed/Metadata/global-metadata.dat': metadata, 'assets/bin/Data/data.unity3d': UNITY_HEAD })),
    'UnityDataAssetPack.apk': fs.readFileSync(zipTree(path.join(apks, 'pack.apk'), { 'AndroidManifest.xml': 'x', 'assets/bin/Data/datapack.unity3d': UNITY_HEAD })),
  };
  if (withSplit) tree['config.arm64_v8a.apk'] = fs.readFileSync(zipTree(path.join(apks, 'split.apk'), { 'AndroidManifest.xml': 'x', 'lib/arm64-v8a/libil2cpp.so': 'il2cpp', 'lib/arm64-v8a/libunity.so': 'unity' }));
  return zipTree(path.join(parent, 'game.xapk'), tree);
}

test('unpack: split XAPK finds Unity IL2CPP across APKs and records it in the game', () => {
  const dir = newGame();
  const parent = path.dirname(dir);
  const out = path.join(parent, 'src');
  const { code, out: text } = gk(dir, 'unpack', splitXapk(parent), '--out', out);
  assert.equal(code, 0, text);
  assert.match(text, /Engine: unity 2022\.3\.20f1, il2cpp, arm64-v8a/);
  const report = JSON.parse(read(out, 'unpack-report.json'));
  assert.equal(report.kind, 'bundle');
  assert.equal(report.package.packageName, 'com.example.game');
  assert.equal(report.unity.libil2cpp, 'apk/config.arm64_v8a/lib/arm64-v8a/libil2cpp.so');
  assert.equal(report.unity.metadata.path, 'apk/base/assets/bin/Data/Managed/Metadata/global-metadata.dat');
  assert.deepEqual([report.unity.metadata.state, report.unity.metadata.version], ['plain', 31]);
  assert.deepEqual(report.warnings, []);
  assert.ok(!fs.existsSync(path.join(out, 'bundle', 'base.apk')), 'bản sao APK con đã giải nén được bỏ');
  const yaml = YAML.parse(read(dir, 'game.yaml'));
  assert.equal(yaml.source.path, out);
  assert.equal(yaml.source.engineVersion, '2022.3.20f1');
  assert.match(read(dir, 'notes/source-unpack.md'), /libil2cpp\.so/);
  assert.equal(gk(dir, 'validate').code, 0);
});

test('unpack: warns when a split is missing or the metadata is protected', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-'));
  const missing = gk(parent, 'unpack', splitXapk(parent, { withSplit: false }), '--out', path.join(parent, 'a'));
  assert.equal(missing.code, 0);
  assert.match(missing.out, /thiếu libil2cpp\.so/);
  const locked = gk(parent, 'unpack', splitXapk(parent, { metadata: Buffer.alloc(40, 7) }), '--out', path.join(parent, 'b'));
  assert.match(locked.out, /không có magic chuẩn/);
});

test('unpack: OBB holds Mono logic; plain APK and other engines are recognised', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-'));
  const apks = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-apks-'));
  const xapk = zipTree(path.join(parent, 'mono.xapk'), {
    'base.apk': fs.readFileSync(zipTree(path.join(apks, 'b.apk'), { 'AndroidManifest.xml': 'x', 'lib/armeabi-v7a/libunity.so': 'u', 'lib/armeabi-v7a/libmonobdwgc-2.0.so': 'm' })),
    'Android/obb/com.x/main.1.com.x.obb': fs.readFileSync(zipTree(path.join(apks, 'o.zip'), { 'assets/bin/Data/Managed/Assembly-CSharp.dll': 'il', 'assets/bin/Data/sharedassets0.assets': 'd' })),
  });
  const mono = gk(parent, 'unpack', xapk, '--out', path.join(parent, 'm'));
  assert.equal(mono.code, 0, mono.out);
  const report = JSON.parse(read(path.join(parent, 'm'), 'unpack-report.json'));
  assert.equal(report.unity.backend, 'mono');
  assert.equal(report.unity.assemblyCSharp, 'obb/main.1.com.x/assets/bin/Data/Managed/Assembly-CSharp.dll');

  const godot = zipTree(path.join(parent, 'g.apk'), { 'AndroidManifest.xml': 'x', 'lib/arm64-v8a/libgodot_android.so': 'g' });
  const r = gk(parent, 'unpack', godot, '--out', path.join(parent, 'g'));
  assert.match(r.out, /Engine: godot/);
  assert.equal(JSON.parse(read(path.join(parent, 'g'), 'unpack-report.json')).kind, 'apk');
});

test('unpack: hostile names stay inside the output folder; case-only duplicates are not overwritten', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-'));
  const file = zipTree(path.join(parent, 'x.apk'), { 'AndroidManifest.xml': 'x', 'zz/evil.txt': 'pwn', 'res/a.txt': 'first', 'res/b.txt': 'second' });
  const buf = fs.readFileSync(file);
  const swap = (from, to) => {
    for (let i = buf.indexOf(from); i >= 0; i = buf.indexOf(from, i + 1)) buf.write(to, i, 'latin1');
  };
  swap('zz/evil', '../evil');
  swap('res/b.txt', 'RES/A.txt');
  fs.writeFileSync(file, buf);
  const out = path.join(parent, 'sub', 'out');
  const r = gk(parent, 'unpack', file, '--out', out);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ra ngoài thư mục giải nén/);
  assert.match(r.out, /trùng tên/);
  assert.ok(!fs.existsSync(path.join(out, 'apk', 'evil.txt')));
  assert.equal(read(path.join(out, 'apk', 'x'), 'res/a.txt'), 'first');
});

test('unpack: corrupted entry is reported and not left on disk', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-'));
  const file = zipTree(path.join(parent, 'x.apk'), { 'AndroidManifest.xml': 'x', 'data.bin': 'abcdefgh'.repeat(200) });
  const buf = fs.readFileSync(file);
  buf[buf.indexOf('data.bin') + 'data.bin'.length + 4] ^= 0xff;
  fs.writeFileSync(file, buf);
  const out = path.join(parent, 'o');
  const r = gk(parent, 'unpack', file, '--out', out);
  assert.match(r.out, /data\.bin: không giải nén được/);
  assert.ok(!fs.existsSync(path.join(out, 'apk', 'x', 'data.bin')));
});

test('unpack: reads a zip64 directory', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekit-'));
  const plain = fs.readFileSync(zipTree(path.join(parent, 'p.zip'), { 'AndroidManifest.xml': 'manifest' }));
  const at = plain.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const [count, size, offset] = [plain.readUInt16LE(at + 10), plain.readUInt32LE(at + 12), plain.readUInt32LE(at + 16)];
  const rec = Buffer.alloc(56);
  rec.writeUInt32LE(0x06064b50, 0);
  rec.writeBigUInt64LE(44n, 4);
  rec.writeBigUInt64LE(BigInt(count), 24);
  rec.writeBigUInt64LE(BigInt(count), 32);
  rec.writeBigUInt64LE(BigInt(size), 40);
  rec.writeBigUInt64LE(BigInt(offset), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(at), 8);
  locator.writeUInt32LE(1, 16);
  const eocd = Buffer.alloc(22, 0xff);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 20);
  const file = path.join(parent, 'z64.apk');
  fs.writeFileSync(file, Buffer.concat([plain.subarray(0, at), rec, locator, eocd]));
  const out = path.join(parent, 'o');
  const r = gk(parent, 'unpack', file, '--out', out);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(path.join(out, 'apk', 'z64'), 'AndroidManifest.xml'), 'manifest');
});

test('unpack: refuses bad input, a used output folder, a folder inside the game repo and an oversized package', () => {
  const dir = newGame();
  const parent = path.dirname(dir);
  write(parent, 'not.apk', 'hello');
  assert.match(gk(parent, 'unpack', path.join(parent, 'not.apk')).out, /không phải file ZIP/);
  assert.match(gk(parent, 'unpack', path.join(parent, 'none.apk')).out, /Không thấy file/);
  const notAndroid = zipTree(path.join(parent, 'plain.zip'), { 'readme.txt': 'x' });
  assert.match(gk(parent, 'unpack', notAndroid).out, /không phải gói Android/);
  const apk = zipTree(path.join(parent, 'g.apk'), { 'AndroidManifest.xml': 'x'.repeat(4096) });
  write(parent, 'used/keep.txt', 'giữ');
  const used = gk(parent, 'unpack', apk, '--out', path.join(parent, 'used'));
  assert.notEqual(used.code, 0);
  assert.match(used.out, /không rỗng/);
  const inside = gk(dir, 'unpack', apk, '--out', path.join(dir, 'src-goc'));
  assert.notEqual(inside.code, 0);
  assert.match(inside.out, /nằm trong repo game/);
  assert.equal(gk(dir, 'unpack', apk, '--out', path.join(dir, 'reference', 'goc')).code, 0);
  assert.match(gk(parent, 'unpack', apk, '--out', path.join(parent, 'big'), '--max-gb', '0.000001').out, /vượt giới hạn/);
});
