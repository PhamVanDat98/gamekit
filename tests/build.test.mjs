import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion, checkVersion, latestVersion, copyrightYear } from '../scripts/lib/version.mjs';
import { escapeHtml, jsString, fillTemplate, withBase } from '../scripts/lib/html.mjs';
import { listPortals, loadPortal, checkSetting, missingSettings, copyrightFor } from '../scripts/lib/portals.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { assemblePortal } from '../scripts/lib/assemble.mjs';
import { tmpDir, write, read, solidPng, tinyWebp, token } from './helpers.mjs';
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

function fakeVite(dir) {
  const vite = path.join(dir, 'vite');
  write(vite, 'framework.js', 'console.log("game");const c=platform.info.copyright;');
  write(vite, 'css/style.css', 'body{}');
  write(vite, 'assets/img/hero-abc.png', 'x');
  write(vite, 'assets/audio/hit-abc.mp3', 'x');
  write(vite, 'StreamingAssets/data/level1.json', '{}');
  write(vite, 'StreamingAssets/data/.gitkeep', '');
  fs.mkdirSync(path.join(vite, 'Icons'), { recursive: true });
  fs.writeFileSync(path.join(vite, 'Icons/web.png'), solidPng(8, 8));
  fs.writeFileSync(path.join(vite, 'Icons/loading.webp'), tinyWebp());
  return vite;
}
const GAME = { name: 'demo', title: 'Zombie <Run> & "Co"', language: 'es', languages: ['en', 'es'] };
const SETTINGS = { gameCode: 'g205', gameId: 'demo-az', portalGid: 'demo', signed: token({ signed: 'x', domain: 'azgame.io' }) };
const LANGS = { en: { _meta: { name: 'English' }, a: 'A', b: 'B {x}' }, es: { _meta: { name: 'Español' }, a: 'A-es' } };
const TOOLS = { buildLoader: async ({ define }) => `var cfg=${define.__GK_LOADER__};`, obfuscate: async (code) => code };
const assembleTo = (dir, portal = 'azgames', vite = fakeVite(dir)) =>
  assemblePortal({ game: GAME, kit: loadPortal(portal), settings: portal === 'azgames' ? SETTINGS : {}, version: '26101601', viteOut: vite, languages: LANGS, outDir: path.join(dir, 'out'), ...TOOLS });

test('assemble: az-v1 layout, <base>, byte-identical preview, 8-byte version.txt', async () => {
  const dir = tmpDir();
  const { cfg } = await assembleTo(dir);
  const out = path.join(dir, 'out');
  assert.deepEqual(fs.readdirSync(out).sort(), ['26101601', 'index.html', 'preview.html', 'version.txt']);
  assert.equal(fs.readFileSync(path.join(out, 'version.txt'), 'latin1'), '26101601');
  assert.ok(fs.readFileSync(path.join(out, 'index.html')).equals(fs.readFileSync(path.join(out, 'preview.html'))));
  const outer = read(out, 'index.html');
  const inner = read(out, '26101601/index.html');
  assert.match(outer, /<base href="26101601\/">/);
  assert.doesNotMatch(inner, /<base/);
  assert.equal(outer.replace(/\n\s*<base href="26101601\/">/, ''), inner);
  for (const f of ['loader.js', 'framework.js', 'css/style.css', 'Icons/web.png', 'Icons/loading.webp', 'Icons/domain.webp', 'Language/en.json', 'Language/es.json', 'assets/img/hero-abc.png', 'assets/audio/hit-abc.mp3', 'StreamingAssets/data/level1.json'])
    assert.ok(fs.existsSync(path.join(out, '26101601', f)), f);
  assert.ok(!fs.existsSync(path.join(out, '26101601/StreamingAssets/data/.gitkeep')));
  assert.equal(cfg.version, '26101601');
});

test('assemble: settings escaped, AZ_SETTINGS has exactly the portal keys, loader config baked in', async () => {
  const dir = tmpDir();
  const { cfg } = await assembleTo(dir);
  const inner = read(path.join(dir, 'out'), '26101601/index.html');
  assert.match(inner, /<title>Zombie &lt;Run&gt; &amp; &quot;Co&quot;<\/title>/);
  const az = inner.match(/window\.AZ_SETTINGS = \{([\s\S]*?)\};/)[1];
  assert.deepEqual([...az.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]), ['gameCode', 'language', 'gameId', 'portalGid']);
  assert.match(inner, /window\["GMSOFT_SIGNED"\] = "/);
  assert.match(inner, /<!--PRODUCT_VERSION:26101601END-->/);
  assert.match(inner, /canonical" href="https:\/\/azgames\.io\/demo"/);
  assert.deepEqual(cfg.languages, [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }]);
  assert.equal(cfg.defaultLanguage, 'es');
  assert.equal(cfg.sizes.framework, fs.statSync(path.join(dir, 'out/26101601/framework.js')).size);
  assert.equal(cfg.sizes.lang.es, fs.statSync(path.join(dir, 'out/26101601/Language/es.json')).size);
  assert.equal(cfg.copyright, '© 2026 Azgames.io');
  assert.equal(cfg.storageKey, 'azgames.g205.lang');
  assert.deepEqual(cfg.sitelock, ['azgames.io', 'azgame.io']);
  assert.match(read(path.join(dir, 'out'), '26101601/loader.js'), /"storageKey":"azgames\.g205\.lang"/);
});

test('assemble: translations get every key from en, minified, _meta.name moved to the loader', async () => {
  const dir = tmpDir();
  await assembleTo(dir);
  const out = path.join(dir, 'out/26101601/Language');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'es.json'), 'utf8')), { a: 'A-es', b: 'B {x}' });
  assert.equal(fs.readFileSync(path.join(out, 'en.json'), 'utf8'), '{"a":"A","b":"B {x}"}');
});

test('assemble: a missing required file rejects and leaves the previous package intact', async () => {
  const dir = tmpDir();
  await assembleTo(dir);
  const vite = path.join(dir, 'vite');
  fs.rmSync(path.join(vite, 'css/style.css'));
  await assert.rejects(() => assembleTo(dir, 'azgames', vite), /css\/style\.css/);
  assert.ok(fs.existsSync(path.join(dir, 'out/26101601/framework.js')));
  assert.ok(fs.existsSync(path.join(dir, 'out/26101601/loader.js')));
  assert.ok(fs.existsSync(path.join(dir, 'out/version.txt')));
});

test('assemble: extra files in css/ and Icons/ and a bad version are rejected', async () => {
  const dir = tmpDir();
  const vite = fakeVite(dir);
  write(vite, 'css/other.css', 'x');
  await assert.rejects(() => assembleTo(dir, 'azgames', vite), /css\/other\.css/);
  const dir2 = tmpDir();
  const vite2 = fakeVite(dir2);
  write(vite2, 'Icons/foo.png', 'x');
  await assert.rejects(() => assembleTo(dir2, 'azgames', vite2), /Icons\/foo\.png/);
  const dir3 = tmpDir();
  await assert.rejects(() => assemblePortal({ game: GAME, kit: loadPortal('azgames'), settings: SETTINGS, version: '2610160', viteOut: fakeVite(dir3), languages: LANGS, outDir: path.join(dir3, 'out'), ...TOOLS }), /version|8/);
});

test('assemble: dev-mock has no sitelock and no SDK; stray files outside the layout are rejected', async () => {
  const dir = tmpDir();
  const { cfg } = await assembleTo(dir, 'dev-mock');
  const inner = read(path.join(dir, 'out'), '26101601/index.html');
  assert.doesNotMatch(inner, /azgame\.io/);
  assert.equal(cfg.sitelock, null);
  assert.equal(cfg.storageKey, 'gamekit.demo.lang');
  assert.equal(cfg.copyright, '© 2026 GameKit (dev)');
  const dir2 = tmpDir();
  const vite = fakeVite(dir2);
  write(vite, 'TemplateData/old.css', 'x');
  await assert.rejects(() => assembleTo(dir2, 'azgames', vite), /TemplateData/);
  const dir3 = tmpDir();
  const vite3 = fakeVite(dir3);
  write(vite3, 'assets/misc/a.bin', 'x');
  await assert.rejects(() => assembleTo(dir3, 'azgames', vite3), /assets\/misc/);
});
