import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion, checkVersion, latestVersion, copyrightYear } from '../scripts/lib/version.mjs';
import { escapeHtml, jsString, fillTemplate, withBase } from '../scripts/lib/html.mjs';
import { listPortals, loadPortal, checkSetting, missingSettings, copyrightFor } from '../scripts/lib/portals.mjs';
import { token } from './helpers.mjs';
import { PassThrough } from 'node:stream';
import { allQuestions, parseAnswer, checkAnswer, parseSets, withDefaults, settingsFor, ask } from '../scripts/lib/questions.mjs';

test('version: YYMMDDNN from the build date, next number of the day, capped at 99', () => {
  const d = new Date(2026, 9, 16); // 16/10/2026, giờ máy
  assert.equal(nextVersion([], d), '26101601');
  assert.equal(nextVersion(['26101601', '26101602', '26101501', '.vite-x', 'manifest.json'], d), '26101603');
  assert.equal(nextVersion(['26101599'], d), '26101601');
  assert.throws(() => nextVersion(['26101699'], d), /99/);
  assert.equal(checkVersion('26101605', ['26101601']), '26101605');
  assert.throws(() => checkVersion('2610160', []), /8 chữ số/);
  assert.throws(() => checkVersion('26101601', ['26101601']), /đã có/);
  assert.equal(latestVersion(['26101601', '26101702', 'x']), '26101702');
  assert.equal(latestVersion([]), null);
  assert.equal(copyrightYear('26101601'), '2026');
});

test('html: values are escaped for where they land; unknown placeholders fail', () => {
  assert.equal(escapeHtml(`Zombie <Run> & "Co" 'x'`), 'Zombie &lt;Run&gt; &amp; &quot;Co&quot; &#39;x&#39;');
  const js = jsString('a</script><script>alert(1)\u2028"');
  assert.doesNotMatch(js, /<\/script>/i);
  assert.doesNotMatch(js, /\u2028/);
  assert.equal(JSON.parse(js.replace(/\u003c/g, '<')), 'a</script><script>alert(1)\u2028"');
  assert.equal(fillTemplate('<b>{{A}}</b>{{B_C}}', { A: '1', B_C: '{{A}}' }), '<b>1</b>{{A}}', 'một lượt, không thay lại giá trị đã chèn');
  assert.throws(() => fillTemplate('{{MISSING}}', {}), /MISSING/);
  assert.equal(withBase('<html><head>\n<title>x</title>', '26101601'), '<html><head>\n    <base href="26101601/">\n<title>x</title>');
  assert.throws(() => withBase('<html>', '26101601'), /<head>/);
});

test('portal kits: azgames settings, patterns and the GMSOFT_SIGNED token', () => {
  assert.deepEqual(listPortals(), ['azgames', 'dev-mock']);
  const az = loadPortal('azgames');
  assert.deepEqual(missingSettings(az, { gameCode: 'g205' }), ['gameId', 'portalGid', 'signed']);
  assert.equal(checkSetting(az, 'gameId', 'ten-game-az'), null);
  assert.match(checkSetting(az, 'gameId', 'ten-game'), /sai định dạng/);
  assert.equal(checkSetting(az, 'portalGid', 'ten-game'), null);
  assert.match(checkSetting(az, 'portalGid', 'ten-game-az'), /sai định dạng/);
  assert.equal(checkSetting(az, 'signed', token({ signed: 'x', domain: 'azgame.io' })), null);
  assert.match(checkSetting(az, 'signed', '@@ không phải base64 @@'), /giải mã/);
  assert.match(checkSetting(az, 'signed', token({ signed: 'x' })), /domain/);
  assert.match(checkSetting(az, 'signed', token({ signed: 'x', domain: 'evil.com' })), /evil\.com/);
  assert.match(checkSetting(az, 'nope', 'x'), /khoá lạ/);
  assert.equal(checkSetting(az, 'gameCode', null), null, 'thiếu giá trị do missingSettings xử lý');
  assert.equal(copyrightFor(az, '26101601'), '© 2026 Azgames.io');
  const dev = loadPortal('dev-mock');
  assert.deepEqual(missingSettings(dev, {}), []);
  assert.equal(copyrightFor(dev, '27010101'), '© 2027 GameKit (dev)');
  assert.throws(() => loadPortal('../x'), /Không có bộ vỏ/);
});

test('questions: core + portal questions with defaults filled from the game name', () => {
  const qs = allQuestions({ name: 'ten-game', title: 'Ten Game' });
  const by = Object.fromEntries(qs.map((q) => [q.key, q]));
  assert.equal(by.title.default, 'Ten Game');
  assert.equal(by['azgames.gameId'].default, 'ten-game-az');
  assert.equal(by['azgames.portalGid'].default, 'ten-game');
  assert.equal(by['azgames.gameCode'].portal, 'azgames');
  assert.ok(by['azgames.signed'].description.includes('GMSOFT_SIGNED') || by['azgames.signed'].label.includes('GMSOFT_SIGNED'));
  assert.ok(!qs.some((q) => q.portal === 'dev-mock'), 'dev-mock không có câu hỏi');
});

test('questions: answers are parsed and checked; --set rejects unknown keys and bad values', () => {
  const qs = allQuestions({ name: 'g', title: 'G' });
  const q = (k) => qs.find((x) => x.key === k);
  assert.deepEqual(parseAnswer(q('languages'), ' EN, es ,es'), ['en', 'es']);
  assert.match(checkAnswer(q('languages'), ['en', 'Tiếng Việt']), /sai định dạng/);
  assert.match(checkAnswer(q('engine'), 'gamemaker'), /một trong/);
  assert.match(checkAnswer(q('portals'), ['azgames', 'nope']), /nope/);
  assert.equal(checkAnswer(q('azgames.gameCode'), ''), null, 'câu portal được để trống');
  assert.match(checkAnswer(q('title'), ''), /bắt buộc/);
  assert.deepEqual(parseSets(['azgames.gameCode=g205', 'languages=en,es'], qs), { 'azgames.gameCode': 'g205', languages: ['en', 'es'] });
  assert.throws(() => parseSets(['azgames.nope=1'], qs), /không có câu hỏi/);
  assert.throws(() => parseSets(['azgames.gameId=sai'], qs), /azgames\.gameId/);
  assert.throws(() => parseSets(['khongcodau'], qs), /khoá=giá-trị/);
  assert.deepEqual(withDefaults(qs.filter((x) => !x.portal), { title: 'X' }), { title: 'X', engine: 'unknown', sourcePath: null, portals: ['azgames'], language: 'en', languages: ['en'] });
  assert.deepEqual(settingsFor(['dev-mock', 'azgames'], { 'azgames.gameCode': 'g205' }, qs), { azgames: { gameCode: 'g205', gameId: 'g-az', portalGid: 'g', signed: null } });
  assert.deepEqual(settingsFor(['azgames'], {}, qs, { azgames: { gameCode: 'old', signed: 's' } }).azgames.gameCode, 'old');
});

test('questions: terminal asks one by one, explains, re-asks a wrong answer, Enter takes the default', async () => {
  const qs = allQuestions({ name: 'g', title: 'G' });
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = '';
  output.on('data', (d) => (shown += d));
  // title=Enter, engine=sai→unity, sourcePath=Enter, portals=azgames, language=Enter, languages=en,es,
  // azgames: gameCode=g205, gameId=Enter, portalGid=Enter, signed=Enter (để trống)
  input.end(['', 'gamemaker', 'unity', '', 'azgames', '', 'en,es', 'g205', '', '', ''].join('\n') + '\n');
  const a = await ask(qs, { input, output });
  assert.equal(a.title, 'G');
  assert.equal(a.engine, 'unity');
  assert.deepEqual(a.languages, ['en', 'es']);
  assert.equal(a['azgames.gameCode'], 'g205');
  assert.equal(a['azgames.gameId'], 'g-az');
  assert.equal(a['azgames.signed'], null);
  assert.match(shown, /một trong/, 'giải thích vì sao sai rồi hỏi lại');
  assert.match(shown, /GMGameSDK\.init/, 'có mô tả từng câu');
  assert.match(shown, /\[g-az\]/, 'hiện giá trị mặc định');
});

test('questions: portal questions are skipped for portals not chosen', async () => {
  const qs = allQuestions({ name: 'g', title: 'G' });
  const input = new PassThrough();
  input.end(['', '', '', 'dev-mock', '', ''].join('\n') + '\n');
  const a = await ask(qs, { input, output: new PassThrough() });
  assert.deepEqual(a.portals, ['dev-mock']);
  assert.ok(!('azgames.gameCode' in a));
});
