import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gk, newGame, token, sh, read, editYaml } from './helpers.mjs';
import { parseArgs } from '../scripts/gamekit.mjs';
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

test('init: titles with YAML/HTML special characters stay valid', () => {
  const parent = (() => fs.mkdtempSync(path.join(os.tmpdir(), 'gk-')))();
  const { code, out } = gk(parent, 'init', 'zr', '--title', 'Zombie: Run #2 <A & B>', '--no-install', '--no-git');
  assert.equal(code, 0, out);
  const dir = path.join(parent, 'zr');
  assert.match(read(dir, 'game.yaml'), /title: "Zombie: Run #2 <A & B>"/);
  assert.match(read(dir, 'index.html'), /<title>Zombie: Run #2 &lt;A &amp; B&gt;<\/title>/);
  assert.equal(gk(dir, 'validate').code, 0);
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
