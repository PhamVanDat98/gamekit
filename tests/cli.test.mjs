import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gk, newGame, token, sh, write, read, editJson, editYaml } from './helpers.mjs';
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

test('decisions: D-<area>-n lives in notes/<area>/decisions.md; duplicates and wrong-area ids fail', () => {
  const dir = newGame('dec');
  editJson(dir, 'params/game.json', (p) => {
    p.player.speed.deviation = { original: 300, reason: 'cảm ứng', decision: 'D-player-1', approved: true };
  });
  write(dir, 'spec/obligations.yaml', 'obligations:\n  - { id: a, title: A, cases: [normal] }\n  - { id: b, title: B, cases: [normal], status: out-of-scope, decision: D-level-gen-2, approved: true }\n');
  let r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 1);
  assert.match(r.out, /D-player-1/);
  assert.match(r.out, /D-level-gen-2/);
  write(dir, 'notes/player/decisions.md', '# Quyết định mảng player\n\n## D-player-1 Tăng tốc cho cảm ứng\n');
  write(dir, 'notes/level-gen/decisions.md', '## D-level-gen-2 Bỏ chế độ online\n');
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 0, r.out);
  // An area only uses its own prefix, so two areas never pick the same number.
  write(dir, 'notes/level-gen/decisions.md', '## D-level-gen-2 Bỏ chế độ online\n\n## D-3 Số chung\n\n## D-player-4 Mảng khác\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /D-3: quyết định của mảng level-gen phải đặt mã D-level-gen-n/);
  assert.match(r.out, /D-player-4: quyết định của mảng level-gen/);
  write(dir, 'notes/level-gen/decisions.md', '## D-level-gen-2 Bỏ chế độ online\n');
  fs.appendFileSync(path.join(dir, 'DECISIONS.md'), '\n## D-player-1 Chuyển lên file chung nhưng vẫn còn trong mảng\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /trùng mã quyết định D-player-1/);
  // Schemas still reject malformed ids.
  editJson(dir, 'params/game.json', (p) => {
    p.player.speed.deviation.decision = 'D-Player-1';
  });
  assert.equal(gk(dir, 'validate').code, 1);
});

test('validate: re-plan.yaml and notes/<area>/questions.yaml (template examples are valid)', () => {
  const dir = newGame('replan');
  write(dir, 're-plan.yaml', read(dir, 're-plan.example.yaml'));
  write(dir, 'module-plan.yaml', read(dir, 'module-plan.example.yaml'));
  write(dir, 'notes/player/questions.yaml', read(dir, 'notes/questions.example.yaml'));
  let r = gk(dir, 'validate');
  assert.equal(r.code, 0, r.out);
  // buildModule must name a module of module-plan.yaml
  write(dir, 're-plan.yaml', read(dir, 're-plan.yaml').replace('buildModule: core-spawner', 'buildModule: core-nope'));
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /buildModule core-nope/);
  write(dir, 're-plan.yaml', read(dir, 're-plan.example.yaml'));
  // a linked folder must be gitignored, or every worktree would commit it
  write(dir, 're-plan.yaml', read(dir, 're-plan.yaml').replace('  - reference/', '  - reference/\n  - tools/'));
  write(dir, 'tools/x.txt', 'x');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /links: tools\/ phải được gitignore/);
  write(dir, 're-plan.yaml', read(dir, 're-plan.example.yaml'));
  // questions: schema, id prefix of the area, unique across areas, area known to the plan
  write(dir, 'notes/player/questions.yaml', 'questions:\n  - { id: player.q1, question: Q, evidence: E, status: done }\n');
  assert.equal(gk(dir, 'validate').code, 1);
  write(dir, 'notes/player/questions.yaml', 'questions:\n  - { id: score.q1, question: Q, evidence: E, status: open }\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /score\.q1: câu hỏi của mảng player phải có id player\.<tên>/);
  write(dir, 'notes/player/questions.yaml', 'questions:\n  - { id: player.q1, question: Q, evidence: E, status: open }\n  - { id: player.q1, question: Q2, evidence: E, status: answered }\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /trùng id câu hỏi player\.q1/);
  write(dir, 'notes/player/questions.yaml', 'questions: []\n');
  write(dir, 'notes/audio/questions.yaml', 'questions:\n  - { id: audio.q1, question: Q, evidence: E, status: partial }\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /re-plan\.yaml không có mảng audio/);
});

test('params per area: params/<name>.json sits under its name, must be loaded by src/core/params.ts, groups never overlap', () => {
  const dir = newGame('pfiles');
  const speed = { value: 4, unit: 'px/frame', source: 'PlayerController.Update', confidence: 'observed' };
  write(dir, 'params/hero.json', JSON.stringify({ run: { speed } }));
  let r = gk(dir, 'validate');
  assert.equal(r.code, 0, 'P1 areas write params before the game reads them: a warning');
  assert.match(r.out, /params\/hero\.json.*chưa được nạp trong src\/core\/params\.ts/);
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 1, 'from P2 the game must load it; the usage example in the comment does not count');
  write(dir, 'src/core/params.ts', read(dir, 'src/core/params.ts')
    .replace("import game from '../../params/game.json';", "import game from '../../params/game.json';\nimport hero from '../../params/hero.json';")
    .replace('const FILES = {};', 'const FILES = { hero };'));
  assert.equal(gk(dir, 'validate').code, 0);
  // obligations name the key the game reads: hero.run.speed
  write(dir, 'spec/obligations/hero.yaml', 'obligations:\n  - { id: hero.run, title: Chạy, cases: [normal], params: [hero.run.speed] }\n');
  assert.equal(gk(dir, 'validate').code, 0);
  write(dir, 'spec/obligations/hero.yaml', 'obligations:\n  - { id: hero.run, title: Chạy, cases: [normal], params: [run.speed] }\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /params run\.speed không có/);
  fs.rmSync(path.join(dir, 'spec/obligations'), { recursive: true });
  // a group defined in game.json and in its own file would shadow each other in PARAMS
  write(dir, 'params/player.json', JSON.stringify({ speed }));
  write(dir, 'src/core/params.ts', read(dir, 'src/core/params.ts').replace("import hero from", "import player from '../../params/player.json';\nimport hero from").replace('{ hero }', '{ hero, player }'));
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /nhóm player trùng với/);
});

test('obligations per area: spec/obligations/<area>.yaml joins the ledger, ids carry the area, duplicates across files fail', () => {
  const dir = newGame('ofiles');
  write(dir, 'spec/obligations/enemy.yaml', 'obligations:\n  - { id: enemy.ring, title: Vòng đạn, cases: [normal] }\n');
  assert.equal(gk(dir, 'validate').code, 0);
  write(dir, 'spec/obligations/enemy.yaml', 'obligations:\n  - { id: ring, title: Vòng đạn, cases: [normal] }\n');
  let r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /ring: nghĩa vụ của mảng enemy phải có id enemy\.<tên>/);
  write(dir, 'spec/obligations/player.yaml', 'obligations:\n  - { id: player.move, title: Trùng với file chung, cases: [normal] }\n');
  write(dir, 'spec/obligations/enemy.yaml', 'obligations: []\n');
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /trùng id player\.move \(đã có trong spec\/obligations\.yaml\)/);
  // parity reads the whole ledger: an area obligation without tests stays open
  fs.rmSync(path.join(dir, 'spec/obligations/player.yaml'));
  write(dir, 'spec/obligations/enemy.yaml', 'obligations:\n  - { id: enemy.ring, title: Vòng đạn, cases: [normal] }\n');
  const passed = (name) => ({ fullName: name, status: 'passed', title: name });
  const names = ['[player.move:normal] a', '[player.move:edge] b', '[obstacle.speed:normal] c', '[obstacle.speed:oracle] d', '[obstacle.spawn:normal] e', '[score.rate:normal] f', '[rules.collision:normal] g', '[run.replay:replay] h'];
  write(dir, 'report.json', JSON.stringify({ testResults: [{ name: 'x', assertionResults: names.map(passed) }] }));
  r = gk(dir, 'parity', '--report', 'report.json');
  assert.equal(r.code, 1);
  assert.match(r.out, /enemy\.ring — Vòng đạn: thiếu test xanh cho case: normal/);
  write(dir, 'report.json', JSON.stringify({ testResults: [{ name: 'x', assertionResults: [...names, '[enemy.ring:normal] i'].map(passed) }] }));
  r = gk(dir, 'parity', '--report', 'report.json');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /parity: 7\/7/);
});

const GOOD_NOTE = `# Di chuyển

- **Kết luận**: chạy 4 px/frame ở 30 fps = 120 px/s.
- **Vị trí**: Assembly-CSharp.dll, PlayerController.Update
- **Độ tin cậy**: observed
- **Phạm vi đã tìm**: PlayerController, PlayerInput
- **Còn chưa biết**: tốc độ khi bị làm chậm
`;

test('questions: links to notes, params and obligations must exist; completeness binds from P2', () => {
  const dir = newGame('qlink');
  const q = (extra) => write(dir, 'notes/player/questions.yaml', `questions:\n  - { id: player.q1, question: Tốc độ?, evidence: hằng số, ${extra} }\n`);
  q('status: answered, notes: [notes/player/move.md], params: [player.nope], obligations: [player.fly]');
  let r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /player\.q1: không có ghi chú notes\/player\/move\.md/);
  assert.match(r.out, /player\.q1: params player\.nope không có/);
  assert.match(r.out, /player\.q1: không có nghĩa vụ player\.fly/);
  write(dir, 'notes/player/move.md', '# Di chuyển\n\nChạy nhanh.\n');
  q('status: answered, notes: [notes/player/move.md], params: [player.speed], obligations: [player.move]');
  r = gk(dir, 'validate');
  assert.equal(r.code, 0, 'an incomplete note is a warning during P1');
  assert.match(r.out, /notes\/player\/move\.md: ghi chú thiếu: Kết luận, Vị trí, Độ tin cậy, Phạm vi đã tìm, Còn chưa biết, độ tin cậy observed/);
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 1);
  write(dir, 'notes/player/move.md', GOOD_NOTE);
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 0, r.out);
  // headings count as parts too
  write(dir, 'notes/player/move.md', '## Kết luận\nx\n## Vị trí\nx\n## Độ tin cậy\nderived\n## Phạm vi đã tìm\nx\n## Còn chưa biết\nkhông\n');
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0);
  // answered without a note; required and open without a reason
  q('status: answered');
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 1);
  assert.match(r.out, /player\.q1: đã trả lời nhưng chưa trỏ tới ghi chú nào/);
  q('status: partial');
  r = gk(dir, 'validate', '--stage', 'P2');
  assert.equal(r.code, 1);
  assert.match(r.out, /player\.q1: câu bắt buộc còn partial — trả lời, hoặc ghi openReason và impact/);
  q('status: partial, openReason: bản build không có hàm này, impact: dùng giá trị đo từ video');
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0);
  q('status: open, required: false');
  assert.equal(gk(dir, 'validate', '--stage', 'P2').code, 0, 'optional questions may stay open');
});

test('obligations: source names a note that exists', () => {
  const dir = newGame('osrc');
  write(dir, 'spec/obligations/hero.yaml', 'obligations:\n  - { id: hero.run, title: Chạy, cases: [normal], source: notes/hero/run.md }\n');
  const r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /hero\.run: không có ghi chú notes\/hero\/run\.md \(source\)/);
  write(dir, 'notes/hero/run.md', GOOD_NOTE);
  assert.equal(gk(dir, 'validate').code, 0);
});

test('questions command: progress per area and the required questions that still block', () => {
  const dir = newGame('qcmd');
  assert.match(gk(dir, 'questions').out, /Chưa có notes\/<mảng>\/questions\.yaml/);
  write(dir, 'notes/player/move.md', GOOD_NOTE);
  write(dir, 'notes/player/questions.yaml', `questions:
  - { id: player.q1, question: Tốc độ?, evidence: E, status: answered, notes: [notes/player/move.md] }
  - { id: player.q2, question: Nhảy cao bao nhiêu?, evidence: E, status: partial }
  - { id: player.q3, question: Hiệu ứng bụi?, evidence: E, status: open, required: false }
`);
  write(dir, 'notes/audio/questions.yaml', 'questions:\n  - { id: audio.q1, question: Q, evidence: E, status: open, openReason: thiếu file âm thanh, impact: dùng âm thanh tạm }\n');
  let r = gk(dir, 'questions');
  assert.equal(r.code, 0);
  assert.match(r.out, /player: 1\/3 đã trả lời, 1 một phần, 1 mở — 1 câu bắt buộc chưa xong:/);
  assert.match(r.out, /player\.q2 \(partial\): Nhảy cao bao nhiêu\?/);
  assert.doesNotMatch(r.out, /player\.q3/);
  assert.match(r.out, /✔ audio: 0\/1 đã trả lời/);
  r = gk(dir, 'questions', '--area', 'player', '--json');
  const rows = JSON.parse(r.out);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].blocking.map((b) => b.id), ['player.q2']);
});

const NOTE_OK = `- **Kết luận**: x\n- **Vị trí**: PlayerController.Update\n- **Độ tin cậy**: observed\n- **Phạm vi đã tìm**: PlayerController\n- **Còn chưa biết**: không\n`;
/** A game split into areas hero and audio, committed on main. */
function splitGame(name) {
  const dir = newGame(name);
  write(dir, 're-plan.yaml', `kind: re
base: main
shared: [DECISIONS.md, src/contracts/, re-plan.yaml]
areas:
  - { id: hero, owns: [notes/hero/, params/hero.json, spec/obligations/hero.yaml], brief: P }
  - { id: audio, owns: [notes/audio/], brief: A }
`);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  return dir;
}
const fakeMerge = (dir, branch, message, files) => {
  sh(dir, 'git', 'checkout', '-qb', branch);
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'work');
  sh(dir, 'git', 'checkout', '-q', 'main');
  sh(dir, 'git', 'merge', '-q', '--no-ff', '-m', message, branch);
};

test('gate --area: P2 rules on the files the area owns only; questions done; obligations cite a note', () => {
  const dir = splitGame('agate');
  let r = gk(dir, 'gate', '--area', 'hero');
  assert.equal(r.code, 1);
  assert.match(r.out, /chưa có câu hỏi nào/);
  write(dir, 'notes/hero/move.md', NOTE_OK);
  write(dir, 'notes/hero/questions.yaml', 'questions:\n  - { id: hero.q1, question: Q, evidence: E, status: partial }\n');
  write(dir, 'params/hero.json', JSON.stringify({ speed: { value: 4, source: 'TODO: tìm hàm' } }));
  write(dir, 'spec/obligations/hero.yaml', 'obligations:\n  - { id: hero.run, title: Chạy, cases: [normal] }\n');
  write(dir, 'notes/audio/questions.yaml', 'questions:\n  - { id: audio.q1, question: Q, evidence: E, status: open }\n');
  r = gk(dir, 'gate', '--area', 'hero');
  assert.equal(r.code, 1);
  assert.match(r.out, /source còn TODO/);
  assert.match(r.out, /hero\.q1 \(partial\)/);
  assert.match(r.out, /hero\.run: thiếu source/);
  assert.doesNotMatch(r.out, /audio\.q1/, 'another area does not block this one');
  assert.doesNotMatch(r.out, /chưa được nạp/, 'loading params into the game is the main agent\'s job');
  write(dir, 'notes/hero/questions.yaml', 'questions:\n  - { id: hero.q1, question: Q, evidence: E, status: answered, notes: [notes/hero/move.md] }\n');
  write(dir, 'params/hero.json', JSON.stringify({ speed: { value: 4, source: 'PlayerController.Update', confidence: 'observed' } }));
  write(dir, 'spec/obligations/hero.yaml', 'obligations:\n  - { id: hero.run, title: Chạy, cases: [normal], source: notes/hero/move.md }\n');
  r = gk(dir, 'gate', '--area', 'hero');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /chưa merge vào nhánh chính/);
  assert.equal(gk(dir, 'gate', '--area', 'nope').code, 1);
});

test('gate P1 of a split game: {auto: areas} needs every area merged and passing; single-game items are hidden', () => {
  const dir = splitGame('p1split');
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^phase: P0/m, 'phase: P1'));
  write(dir, 'spec/gameplay-spec.md', '# Spec\n');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'p1');
  let r = gk(dir, 'gate');
  assert.equal(r.code, 1);
  assert.match(r.out, /hero: chưa merge · audio: chưa merge/);
  assert.doesNotMatch(r.out, /notes\/QUESTIONS\.md/, '{only: single} hidden when re-plan.yaml exists');
  assert.match(r.out, /✔ Có `spec\/gameplay-spec\.md` \[auto: file:spec\/gameplay-spec\.md\]/);
  assert.doesNotMatch(gk(dir, 'status').out, /QUESTIONS\.md/);
  fakeMerge(dir, 're/audio', 'merge: re/audio (mảng)', { 'notes/audio/questions.yaml': 'questions:\n  - { id: audio.q1, question: Q, evidence: E, status: open, openReason: R, impact: I }\n' });
  fakeMerge(dir, 're/hero', 'merge: re/hero (mảng)', { 'notes/hero/questions.yaml': 'questions:\n  - { id: hero.q1, question: Q, evidence: E, status: open }\n' });
  r = gk(dir, 'gate');
  assert.match(r.out, /hero: hero\.q1 \(open\)/);
  assert.doesNotMatch(r.out, /audio:/);
  // a game that is not split keeps the QUESTIONS.md item and has no areas item
  const single = newGame('p1single');
  write(single, 'game.yaml', read(single, 'game.yaml').replace(/^phase: P0/m, 'phase: P1'));
  r = gk(single, 'gate');
  assert.match(r.out, /notes\/QUESTIONS\.md/);
  assert.doesNotMatch(r.out, /auto: areas/);
});

test('gate P2: {auto: merged} needs every module merged and its worktree removed', () => {
  const dir = newGame('p2merged');
  write(dir, 'module-plan.yaml', 'base: main\nshared: [module-plan.yaml]\nmodules:\n  - { id: a, wave: 1, owns: [src/core/a/], brief: A }\n');
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^phase: P0/m, 'phase: P2'));
  write(dir, 'gates/P2.md', '- [ ] Mọi module đã merge {auto: merged}\n');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  let r = gk(dir, 'gate');
  assert.equal(r.code, 1);
  assert.match(r.out, /a: chưa merge/);
  fakeMerge(dir, 'mod/a', 'merge: a (đợt 1)', { 'src/core/a/x.ts': 'export const x = 1;\n' });
  r = gk(dir, 'gate');
  assert.equal(r.code, 0, r.out);
});

test('gate: {auto: test} and {auto: parity} share one vitest run when npm test is plain vitest', () => {
  const dir = newGame('onevitest');
  // A stand-in vitest: counts its runs and writes a JSON report where every template obligation passes.
  const names = ['[player.move:normal] a', '[player.move:edge] b', '[obstacle.speed:normal] c', '[obstacle.speed:oracle] d', '[obstacle.spawn:normal] e', '[score.rate:normal] f', '[rules.collision:normal] g', '[run.replay:replay] h'];
  const report = JSON.stringify({ testResults: [{ name: 'x', assertionResults: names.map((n) => ({ fullName: n, status: 'passed', title: n })) }] });
  write(dir, 'node_modules/vitest/vitest.mjs', `import fs from 'node:fs';
fs.appendFileSync('runs.txt', 'x');
const out = process.argv.find((a) => a.startsWith('--outputFile=')).slice(13);
fs.mkdirSync(out.replace(/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(out, ${JSON.stringify(report)});
`);
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^phase: P0/m, 'phase: P2'));
  write(dir, 'gates/P2.md', '- [ ] Parity {auto: parity}\n- [ ] Test {auto: test}\n');
  let r = gk(dir, 'gate');
  assert.equal(r.code, 0, r.out);
  assert.equal(read(dir, 'runs.txt'), 'x', 'vitest ran once for both items');
  // a custom npm test script is run on its own
  editJson(dir, 'package.json', (p) => {
    p.scripts.test = 'node -e "process.exit(3)"';
  });
  fs.rmSync(path.join(dir, 'runs.txt'));
  r = gk(dir, 'gate');
  assert.equal(r.code, 1);
  assert.match(r.out, /✘ Test \[auto: test\]/);
  assert.match(r.out, /✔ Parity \[auto: parity\]/);
  assert.equal(read(dir, 'runs.txt'), 'x');
});

/**
 * A stand-in vitest for a game: tests come from .gamekit/local/fake-tests.json ({ name, param?: { file, path, expect, raw? } }); a test
 * passes while its param (raw: the value at path, else its .value) still holds `expect`. Honours -t like vitest, logs every run's arguments to .gamekit/local/runs.txt (both gitignored).
 */
function fakeVitest(dir, tests) {
  write(dir, '.gamekit/local/fake-tests.json', JSON.stringify(tests));
  write(dir, 'node_modules/vitest/vitest.mjs', `import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync('.gamekit/local/runs.txt', JSON.stringify(args) + '\\n');
const t = args.indexOf('-t');
const only = t >= 0 ? new RegExp(args[t + 1]) : null;
const value = (s) => { const v = s.path.split('.').reduce((o, k) => o[k], JSON.parse(fs.readFileSync(s.file, 'utf8'))); return s.raw ? v : v.value; };
const results = JSON.parse(fs.readFileSync('.gamekit/local/fake-tests.json', 'utf8')).map((s) => ({
  fullName: s.name, title: s.name,
  status: only && !only.test(s.name) ? 'skipped' : !s.param || value(s.param) === s.param.expect ? 'passed' : 'failed',
}));
const out = args.find((a) => a.startsWith('--outputFile='));
if (out) {
  const f = out.slice(13);
  fs.mkdirSync(f.replace(/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ testResults: [{ name: 'x', assertionResults: results }] }));
}
process.exit(results.some((r) => r.status === 'failed') ? 1 : 0);
`);
}
const runs = (dir) => read(dir, '.gamekit/local/runs.txt').trim().split('\n').map((l) => JSON.parse(l));

test('parity scopes: --obligation, --area, --module run and judge only those obligations; --json', () => {
  const dir = newGame('pscope');
  write(dir, 'spec/obligations/hero.yaml', 'obligations:\n  - { id: hero.jump, title: Nhảy, cases: [normal] }\n');
  write(dir, 're-plan.yaml', 'kind: re\nbase: main\nshared: [re-plan.yaml]\nareas:\n  - { id: hero, owns: [notes/hero/, spec/obligations/hero.yaml], buildModule: core-hero, brief: H }\n');
  write(dir, 'module-plan.yaml', 'base: main\nshared: [module-plan.yaml]\nmodules:\n  - { id: core-hero, wave: 1, owns: [src/core/hero/], brief: H }\n  - { id: core-move, wave: 1, owns: [src/core/move/], obligations: [player.move], brief: M }\n');
  fakeVitest(dir, [{ name: '[player.move:normal] a' }, { name: '[player.move:edge] b' }, { name: '[hero.jump:normal] c' }]);
  let r = gk(dir, 'parity');
  assert.equal(r.code, 1, 'the whole ledger still has open obligations');
  r = gk(dir, 'parity', '--obligation', 'player.move');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /obstacle\.speed/);
  assert.deepEqual(runs(dir).at(-1).slice(-2), ['-t', '\\[(?:player\\.move):'], 'only the tagged tests of the scope run');
  assert.equal(gk(dir, 'parity', '--area', 'hero').code, 0);
  r = gk(dir, 'parity', '--module', 'core-hero');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Parity: module core-hero \(mảng hero\)/);
  assert.equal(gk(dir, 'parity', '--module', 'core-move').code, 0, 'obligations listed on the module');
  assert.match(gk(dir, 'parity', '--obligation', 'nope').out, /không có nghĩa vụ nope/);
  r = gk(dir, 'parity', '--obligation', 'player.move,hero.jump', '--json');
  const json = JSON.parse(r.out);
  assert.equal(json.ok, true);
  assert.deepEqual(json.items.map((i) => i.id).sort(), ['hero.jump', 'player.move']);
  // module obligations must exist in the ledger
  write(dir, 'module-plan.yaml', read(dir, 'module-plan.yaml').replace('obligations: [player.move]', 'obligations: [player.fly]'));
  assert.match(gk(dir, 'validate').out, /core-move: không có nghĩa vụ player\.fly/);
});

test('parity --mutate: oracle tests must go red when the table changes; params-only checks are a warning; files restored', () => {
  const dir = newGame('mut');
  const speed = { file: 'params/game.json', path: 'player.speed', expect: 320 };
  const row0 = { file: 'spec/oracles/obstacle-speed.json', path: 'cases.0.out', expect: 180, raw: true };
  const tests = [
    { name: '[player.move:normal] pinned speed', param: speed },
    { name: '[player.move:edge] edge', param: speed },
    { name: '[score.rate:normal] expectation read from params' },
    { name: '[obstacle.speed:normal] n' },
    { name: '[obstacle.speed:oracle] compares the table', param: row0 },
  ];
  fakeVitest(dir, tests);
  const before = [read(dir, 'params/game.json'), read(dir, 'spec/oracles/obstacle-speed.json')];
  let r = gk(dir, 'parity', '--mutate', '--obligation', 'player.move,score.rate,obstacle.speed');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /✔ player\.move × player\.speed: đổi số thì test đỏ/);
  assert.match(r.out, /⚠ score\.rate × score\.perSecond: vẫn closed khi đổi số — test lấy kỳ vọng từ chính params/);
  assert.match(r.out, /✔ obstacle\.speed × spec\/oracles\/obstacle-speed\.json: đổi bảng thì test đỏ/);
  // an oracle test that never reads the table is an error
  fakeVitest(dir, tests.map((t) => (t.param === row0 ? { name: t.name } : t)));
  r = gk(dir, 'parity', '--mutate', '--obligation', 'obstacle.speed');
  assert.equal(r.code, 1);
  assert.match(r.out, /✘ obstacle\.speed × spec\/oracles\/obstacle-speed\.json: vẫn closed khi đổi bảng oracle — test oracle không thật sự so với bảng/);
  assert.deepEqual([read(dir, 'params/game.json'), read(dir, 'spec/oracles/obstacle-speed.json')], before, 'files restored');
});

test('integrate --scoped: each merge runs only its module tests, the full suite once; red at the end undoes the round', () => {
  const dir = newGame('scoped');
  write(dir, 'module-plan.yaml', `base: main
shared: [src/contracts/, params/, package.json, game.yaml, module-plan.yaml]
modules:
  - { id: a, wave: 1, owns: [src/core/a/], tests: [tests/core/a], obligations: [player.move], brief: A }
  - { id: b, wave: 1, owns: [src/core/b/], brief: B }
`);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  fakeVitest(dir, [{ name: '[player.move:normal] a' }, { name: '[player.move:edge] b' }]);
  assert.equal(gk(dir, 'fanout', '--wave', '1').code, 0);
  const wt = (id) => path.join(path.dirname(dir), 'scoped.worktrees', id);
  for (const id of ['a', 'b']) commitIn(wt(id), { [`src/core/${id}/x.ts`]: 'export const x = 1;\n' });
  const head = sh(dir, 'git', 'rev-parse', 'HEAD').trim();
  let r = gk(dir, 'integrate', '--wave', '1', '--scoped', '--test', 'exit 1');
  assert.equal(r.code, 1);
  assert.match(r.out, /a: merge xong, test của module xanh/);
  assert.match(r.out, /đã hoàn tác cả 2 merge/);
  assert.equal(sh(dir, 'git', 'rev-parse', 'HEAD').trim(), head);
  const calls = runs(dir);
  assert.ok(calls.some((c) => c[0] === 'run' && c[1] === 'tests/core/a'), 'module a: its own test path');
  assert.ok(calls.some((c) => c.includes('-t')), 'module a: parity of its obligations');
  r = gk(dir, 'integrate', '--wave', '1', '--scoped', '--test', 'exit 0');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Toàn bộ test xanh sau 2 merge/);
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


/** Commit `files` on the worktree's branch. */
const commitIn = (wt, files, msg = 'work') => {
  sh(wt, 'git', 'config', 'user.email', 't@e');
  for (const [rel, text] of Object.entries(files)) write(wt, rel, text);
  sh(wt, 'git', 'add', '-A');
  sh(wt, 'git', 'commit', '-qm', msg);
};

test('re-plan: fanout --ready opens areas whose dependencies are merged, links local copies, integrate --keep-going', () => {
  const dir = newGame('rep');
  write(dir, 're-plan.yaml', `kind: re
base: main
shared: [DECISIONS.md, src/contracts/, game.yaml, re-plan.yaml]
links: [decompiled/]
units: { time: s }
areas:
  - { id: player, owns: [notes/player/, params/player.json], targets: [PlayerController], brief: Nhân vật }
  - { id: audio, owns: [notes/audio/], brief: Âm thanh }
  - { id: score, owns: [notes/score/], dependsOn: [player], brief: Điểm }
`);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  write(dir, 'decompiled/PlayerController.cs', 'class PlayerController {}'); // gitignored, local only
  const wt = (id) => path.join(path.dirname(dir), 'rep.worktrees', `re-${id}`);

  assert.equal(gk(dir, 'fanout', '--plan', 're', '--wave', '1').code, 1, 'areas have no waves');
  const f = gk(dir, 'fanout', '--plan', 're', '--ready');
  assert.equal(f.code, 0, f.out);
  assert.ok(fs.existsSync(wt('player')) && fs.existsSync(wt('audio')));
  assert.ok(!fs.existsSync(wt('score')), 'score waits for player');
  assert.match(f.out, /score \(player\)/);
  assert.equal(sh(wt('player'), 'git', 'branch', '--show-current').trim(), 're/player');
  assert.ok(fs.existsSync(path.join(wt('player'), 'decompiled/PlayerController.cs')), 'local copy linked into the worktree');
  assert.equal(sh(wt('player'), 'git', 'status', '--porcelain').trim(), '', 'the symlink is not an untracked file');
  const brief = read(wt('player'), '.gamekit/local/BRIEF.md');
  for (const want of [/notes\/player\/questions\.yaml/, /PlayerController/, /D-player-n/, /time: s/, /decompiled\//, /re\/player/]) assert.match(brief, want);

  // player edits a shared file: rejected; audio is independent and still merges with --keep-going
  commitIn(wt('player'), { 'notes/player/questions.yaml': 'questions: []\n', 'DECISIONS.md': '# x\n' });
  commitIn(wt('audio'), { 'notes/audio/questions.yaml': 'questions:\n  - { id: audio.q1, question: Q, evidence: E, status: open }\n' });
  const own = gk(wt('player'), 'check-ownership');
  assert.equal(own.code, 1, 'branch re/player picks re-plan.yaml');
  assert.match(own.out, /DECISIONS\.md thuộc vùng dùng chung/);
  let r = gk(dir, 'integrate', '--plan', 're', '--ready', '--keep-going', '--cleanup');
  assert.equal(r.code, 1);
  assert.match(r.out, /audio: merge xong/);
  assert.match(r.out, /1 lỗi: player/);
  assert.match(sh(dir, 'git', 'log', '-1', '--format=%s').trim(), /^merge: re\/audio \(mảng\)$/);
  assert.ok(!fs.existsSync(wt('audio')), 'merged worktree removed');
  assert.ok(fs.existsSync(path.join(dir, 'decompiled/PlayerController.cs')), 'removing the worktree keeps the original files');

  // validate is the default check for areas: a broken questions file is undone
  sh(wt('player'), 'git', 'reset', '-q', '--hard', 'HEAD~1');
  commitIn(wt('player'), { 'notes/player/questions.yaml': 'questions:\n  - { id: player.q1, status: nope }\n' });
  r = gk(dir, 'integrate', '--plan', 're', '--ready');
  assert.equal(r.code, 1);
  assert.match(r.out, /player: test đỏ sau khi merge — đã hoàn tác/);
  commitIn(wt('player'), { 'notes/player/questions.yaml': 'questions:\n  - { id: player.q1, question: Q, evidence: E, status: answered }\n' });
  r = gk(dir, 'integrate', '--plan', 're', '--ready');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /fanout --plan re --ready/);
  r = gk(dir, 'fanout', '--plan', 're', '--ready');
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(wt('score')), 'score opens once player is merged');
});

test('re-plan: maxParallel caps open worktrees, counting the ones already running', () => {
  const dir = newGame('cap');
  write(dir, 're-plan.yaml', `kind: re
base: main
maxParallel: 1
shared: [re-plan.yaml]
areas:
  - { id: a, owns: [notes/a/], brief: A }
  - { id: b, owns: [notes/b/], brief: B }
`);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  const wt = (id) => path.join(path.dirname(dir), 'cap.worktrees', `re-${id}`);
  assert.equal(gk(dir, 'fanout', '--plan', 're', '--ready').code, 0);
  assert.ok(fs.existsSync(wt('a')) && !fs.existsSync(wt('b')));
  const again = gk(dir, 'fanout', '--plan', 're', '--ready');
  assert.match(again.out, /Không có mảng nào sẵn sàng \(đang chạy: a\)/);
  assert.ok(!fs.existsSync(wt('b')));
});

test('module-plan --ready: a module starts when its own dependencies merge, not the whole wave; briefs carry the area obligations', () => {
  const dir = newGame('dag');
  write(dir, 'module-plan.yaml', `base: main
maxParallel: 2
shared: [src/contracts/, params/, package.json, game.yaml, module-plan.yaml, re-plan.yaml]
modules:
  - { id: a, wave: 1, owns: [src/core/a/], brief: A }
  - { id: slow, wave: 1, owns: [src/core/slow/], brief: S }
  - { id: extra, wave: 1, owns: [src/core/extra/], brief: X }
  - { id: c, wave: 2, owns: [src/core/c/], dependsOn: [a], brief: C }
`);
  write(dir, 're-plan.yaml', 'kind: re\nbase: main\nshared: [re-plan.yaml]\nareas:\n  - { id: hero, owns: [notes/hero/, spec/obligations/hero.yaml], buildModule: c, brief: H }\n');
  write(dir, 'spec/obligations/hero.yaml', 'obligations:\n  - { id: hero.jump, title: Nhảy cao 3 ô, cases: [normal, edge] }\n');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  const wt = (id) => path.join(path.dirname(dir), 'dag.worktrees', id);
  let r = gk(dir, 'fanout', '--wave', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /maxParallel 2 — mở 2, còn extra/);
  assert.ok(fs.existsSync(wt('a')) && fs.existsSync(wt('slow')) && !fs.existsSync(wt('extra')));
  commitIn(wt('a'), { 'src/core/a/x.ts': 'export const x = 1;\n' });
  r = gk(dir, 'integrate', '--ready', '--test', 'exit 0', '--cleanup');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /slow: chưa xong/, 'a running module without commits is skipped, not an error');
  r = gk(dir, 'fanout', '--ready');
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(wt('extra')) && !fs.existsSync(wt('c')), 'one free slot (slow still runs): extra comes first in dependency order');
  commitIn(wt('extra'), { 'src/core/extra/x.ts': 'export const x = 1;\n' });
  assert.equal(gk(dir, 'integrate', '--ready', '--test', 'exit 0', '--cleanup').code, 0);
  r = gk(dir, 'fanout', '--ready');
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(wt('c')), 'c starts although slow (same wave as a) is not merged');
  const brief = read(wt('c'), '.gamekit/local/BRIEF.md');
  assert.match(brief, /Đầu vào từ phân tích \(mảng hero\)/);
  assert.match(brief, /`hero\.jump`: Nhảy cao 3 ô \(case: normal, edge\)/);
  assert.match(sh(dir, 'git', 'log', '-1', '--format=%s').trim(), /^merge: extra \(đợt 1\)$/, 'module merge commits keep their format');
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
