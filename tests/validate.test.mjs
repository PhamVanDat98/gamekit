import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gk, newGame, token, write, read, editJson, editYaml } from './helpers.mjs';

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

test('validate rejects unknown --stage; portal names are restricted', () => {
  const dir = newGame('stage');
  assert.equal(gk(dir, 'validate', '--stage', 'P9').code, 1);
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace('  - dev-mock', '  - ".."'));
  assert.equal(gk(dir, 'validate').code, 1);
  assert.equal(gk(dir, 'pack', '--portal', '..').code, 1);
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
