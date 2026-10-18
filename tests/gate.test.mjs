import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gk, newGame, sh, write, read, editJson } from './helpers.mjs';
import { parseGate } from '../scripts/gate.mjs';
import { evaluateParity, testsFromVitestReport } from '../scripts/parity.mjs';
import { buildInputs, reusableBuild } from '../scripts/pack.mjs';
import { loadGame } from '../scripts/lib/game.mjs';
import { loadPortal } from '../scripts/lib/portals.mjs';
import YAML from 'yaml';

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

/** Stand-in for the game's vitest: counts runs and writes a JSON report (red when the file `red` exists). */
const FAKE_VITEST = `import fs from 'node:fs';
import path from 'node:path';
fs.mkdirSync('.gamekit/local', { recursive: true });
fs.appendFileSync('.gamekit/local/vitest-runs', 'x');
const out = process.argv.find((a) => a.startsWith('--outputFile=')).slice('--outputFile='.length);
const red = fs.existsSync('red');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ success: !red, numFailedTests: red ? 1 : 0, numFailedTestSuites: 0,
  testResults: [{ name: 'a.test.ts', assertionResults: [{ fullName: 'x', status: red ? 'failed' : 'passed' }] }] }));
`;

test('gate: parity and test share one vitest run; a custom npm test still runs on its own', () => {
  const dir = newGame();
  write(dir, 'node_modules/vitest/vitest.mjs', FAKE_VITEST);
  write(dir, 'gates/P0.md', '- [ ] Parity {auto: parity}\n- [ ] Test xanh {auto: test}\n');
  const runs = () => read(dir, '.gamekit/local/vitest-runs').length;
  let r = gk(dir, 'gate');
  assert.match(r.out, /✔ Test xanh/);
  assert.equal(runs(), 1, 'one vitest run for both items');
  write(dir, 'red', '');
  r = gk(dir, 'gate');
  assert.match(r.out, /✘ Test xanh \[auto: test\] — 1 test đỏ/);
  assert.equal(runs(), 2);
  editJson(dir, 'package.json', (p) => {
    p.scripts.test = 'node -e "process.exit(3)"';
  });
  fs.rmSync(path.join(dir, 'red'));
  r = gk(dir, 'gate');
  assert.match(r.out, /✘ Test xanh/, 'npm test is not plain vitest, so it runs itself');
  assert.equal(runs(), 3, 'only parity ran vitest');
});

test('gate: pack reuses the latest build of this commit and inputs, never burning a build number', () => {
  const dir = newGame();
  const game = loadGame(dir);
  const v = '26101801';
  const manifest = (extra = {}) => {
    write(dir, `builds/${v}/manifest.json`, JSON.stringify({
      version: v, commit: sh(dir, 'git', 'rev-parse', '--short', 'HEAD').trim(), dirty: false,
      inputs: buildInputs(game, game.portals.map((p) => loadPortal(p))),
      portals: Object.fromEntries(game.portals.map((p) => [p, { hash: 'x' }])), ...extra,
    }));
    for (const p of game.portals) fs.mkdirSync(path.join(dir, 'builds', v, p), { recursive: true });
  };
  manifest();
  assert.equal(reusableBuild(dir, game), v);
  write(dir, 'gates/P0.md', '- [ ] Đóng gói {auto: pack}\n');
  assert.match(gk(dir, 'gate').out, /dùng lại builds\/26101801/);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'builds')), [v], 'no new build');

  assert.equal(reusableBuild(dir, { ...game, title: 'Khác' }), null, 'game.yaml inputs changed');
  assert.equal(reusableBuild(dir, { ...game, phase: 'P4', gates: { P3: { passed: true } } }), v, 'progress fields are not inputs');
  write(dir, 'src/core/new.ts', 'export const x = 1;\n');
  assert.equal(reusableBuild(dir, game), null, 'uncommitted code');
  fs.rmSync(path.join(dir, 'src/core/new.ts'));
  manifest({ dirty: true });
  assert.equal(reusableBuild(dir, game), null, 'built from a dirty tree');
  manifest({ commit: 'abc1234' });
  assert.equal(reusableBuild(dir, game), null, 'another commit');
  manifest({ inputs: undefined });
  assert.equal(reusableBuild(dir, game), null, 'manifest from before inputs were recorded');
});
