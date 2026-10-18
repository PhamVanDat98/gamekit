import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion, checkVersion, latestVersion, copyrightYear, versionError } from '../scripts/lib/version.mjs';
import { escapeHtml, jsString, fillTemplate, withBase } from '../scripts/lib/html.mjs';
import { listPortals, loadPortal, checkSetting, missingSettings, copyrightFor } from '../scripts/lib/portals.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { assemblePortal } from '../scripts/lib/assemble.mjs';
import { initialLoadBytes } from '../scripts/lib/budget.mjs';
import { zipDir, crc32, crc32js } from '../scripts/lib/zip.mjs';
import { GkError } from '../scripts/lib/log.mjs';
import { tmpDir, write, read, solidPng, tinyWebp, token } from './helpers.mjs';
import { PassThrough } from 'node:stream';
import YAML from 'yaml';
import { newGame, gk, sh } from './helpers.mjs';
import { checkBuild } from '../scripts/release-check.mjs';
import { hashDir } from '../scripts/pack.mjs';
import { loadProvenance } from '../scripts/validate.mjs';
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
  write(vite, 'framework.js', 'console.log("game");const f=el("footer","gk-settings-footer",platform.info.copyright);');
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

async function packedGame(name) {
  const dir = newGame(name);
  // ship-ready labels for the files the package carries from public/
  write(dir, 'public/StreamingAssets/data/level1.json', '{}');
  gk(dir, 'provenance', 'add', 'public/Icons', 'public/StreamingAssets/data/level1.json', '--label', 'own');
  const out = path.join(dir, 'builds/26101601/azgames');
  await assemblePortal({ game: { ...GAME, title: 'Demo' }, kit: loadPortal('azgames'), settings: SETTINGS, version: '26101601', viteOut: fakeVite(tmpDir()), languages: LANGS, outDir: out, ...TOOLS });
  const head = sh(dir, 'git', 'rev-parse', '--short', 'HEAD').trim();
  fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), JSON.stringify({ commit: head, dirty: false, portals: { azgames: { hash: hashDir(out) } } }));
  return { dir, out, game: { ...YAML.parse(read(dir, 'game.yaml')), release: { forbiddenTerms: ['OldName'], allowedHosts: [] } } };
}

test('release-check: a correct az-v1 package passes', async () => {
  const { dir, game } = await packedGame('rc-ok');
  const pr = checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir));
  assert.ok(pr.ok, pr.errors.join('\n'));
  assert.match(pr.warnings.join('\n'), /domain\.webp/, 'logo portal còn là placeholder');
});

test('release-check: every layout fault is caught', async () => {
  const faults = [
    ['file lạ ở vỏ', (o) => write(o, 'notes.txt', 'x'), /notes\.txt/],
    ['version.txt có newline', (o) => fs.writeFileSync(path.join(o, 'version.txt'), '26101601\n'), /version\.txt/],
    ['preview khác index', (o) => fs.appendFileSync(path.join(o, 'preview.html'), ' '), /preview\.html/],
    ['thiếu <base>', (o) => {
      const inner = read(o, '26101601/index.html');
      fs.writeFileSync(path.join(o, 'index.html'), inner);
      fs.writeFileSync(path.join(o, 'preview.html'), inner);
    }, /<base/],
    ['script lạ', (o) => {
      const html = read(o, 'index.html').replace('</body>', '<script src="https://evil.example.com/x.js"></script></body>');
      fs.writeFileSync(path.join(o, 'index.html'), html);
      fs.writeFileSync(path.join(o, 'preview.html'), html);
    }, /evil\.example\.com/],
    ['thiếu bản quyền', (o) => fs.writeFileSync(path.join(o, '26101601/framework.js'), 'console.log(1) /* Copyright (c) lib */ var x=platform.info.copyright'), /gk-settings-footer/],
    ['JS trong StreamingAssets', (o) => write(o, '26101601/StreamingAssets/data/x.js', '1'), /StreamingAssets/],
    ['thiếu Language/en.json', (o) => fs.rmSync(path.join(o, '26101601/Language/en.json')), /en\.json/],
    ['asset sai thư mục', (o) => write(o, '26101601/assets/misc/a.bin', 'x'), /assets\/misc/],
    ['tên game gốc', (o) => write(o, '26101601/Language/fr.json', '{"a":"OldName"}'), /OldName/i],
    ['file lạ trong <v>/', (o) => write(o, '26101601/TemplateData/a.css', 'x'), /TemplateData/],
  ];
  for (const [what, mutate, expected] of faults) {
    const { dir, out, game } = await packedGame(`rc-${faults.findIndex((f) => f[0] === what)}`);
    mutate(out);
    const errors = checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n');
    assert.match(errors, expected, what);
  }
});

test('release-check: corrupt manifest and compressed code are reported, not thrown', async () => {
  const { dir, out, game } = await packedGame('rc-corrupt');
  fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), 'not json');
  write(out, '26101601/StreamingAssets/data/x.js.gz', '1');
  const errors = checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n');
  assert.match(errors, /manifest\.json hỏng/);
  assert.match(errors, /x\.js\.gz.*StreamingAssets|StreamingAssets.*x\.js\.gz/);
  for (const text of ['null', '5', '"x"']) {
    fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), text);
    assert.match(checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n'), /manifest\.json hỏng/, text);
  }
});

test('budget: initial load = outer page + loader + framework + css + Icons + the biggest language; compressed copies and assets excluded', async () => {
  const dir = tmpDir();
  await assembleTo(dir);
  const out = path.join(dir, 'out');
  write(out, '26101601/Language/es.json', JSON.stringify({ a: 'x'.repeat(5000) }));
  write(out, '26101601/framework.js.gz', 'y'.repeat(9000));
  write(out, '26101601/Icons/web.png.br', 'y'.repeat(9000));
  const size = (rel) => fs.statSync(path.join(out, rel)).size;
  const expected = ['index.html', '26101601/loader.js', '26101601/framework.js', '26101601/css/style.css', '26101601/Icons/web.png', '26101601/Icons/loading.webp', '26101601/Icons/domain.webp']
    .reduce((n, rel) => n + size(rel), 0) + Math.max(size('26101601/Language/en.json'), size('26101601/Language/es.json'));
  assert.equal(initialLoadBytes(out, '26101601'), expected);
  assert.ok(size('26101601/Language/es.json') > size('26101601/Language/en.json'));
});

test('assemble: a vite.config.ts from the old template (index.html + Build/) is named, with the upgrade hint', async () => {
  const dir = tmpDir();
  const vite = path.join(dir, 'vite');
  write(vite, 'index.html', '<html></html>');
  write(vite, 'Build/game.js', 'x');
  await assert.rejects(() => assembleTo(dir, 'azgames', vite), /bản cũ.*Nâng cấp game cũ/);
  const dir2 = tmpDir();
  const vite2 = path.join(dir2, 'vite');
  write(vite2, 'index.html', '<html></html>');
  write(vite2, 'assets/index-abc.js', 'x');
  await assert.rejects(() => assembleTo(dir2, 'azgames', vite2), /bản cũ/);
});

/** Read a zip with nothing but zlib: central directory → entries, each inflated from its local header. */
function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'có EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'chữ ký central directory');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const n = buf.readUInt16LE(p + 28);
    const m = buf.readUInt16LE(p + 30);
    const k = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + n).toString(flags & 0x800 ? 'utf8' : 'latin1');
    assert.equal(buf.readUInt32LE(local), 0x04034b50, 'chữ ký local header');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    assert.equal(data.length, size, name);
    entries.push({ name, flags, method, crc, data });
    p += 46 + n + m + k;
  }
  return entries;
}

test('zip: pure-Node writer — "/" separators, nested folders, UTF-8 names, deflate or store, deterministic', () => {
  const dir = tmpDir();
  const src = path.join(dir, 'pkg');
  const files = {
    'index.html': '<html></html>',
    'version.txt': '26101601',
    '26101601/css/style.css': 'body{}'.repeat(200),
    '26101601/Language/tiếng-việt.json': '{"a":"Xin chào"}',
    '26101601/Icons/web.png': solidPng(4, 4),
    '26101601/assets/art/noise.bin': crypto.randomBytes(2048),
  };
  for (const [rel, data] of Object.entries(files)) write(src, rel, data);
  const outFile = path.join(dir, 'pkg.zip');
  zipDir(src, outFile);
  const buf = fs.readFileSync(outFile);
  const entries = readZip(buf);
  assert.deepEqual(entries.map((e) => e.name).sort(), Object.keys(files).sort());
  for (const e of entries) {
    assert.ok(!e.name.includes('\\'), e.name);
    assert.ok(e.data.equals(Buffer.from(files[e.name])), e.name);
    if (zlib.crc32) assert.equal(e.crc, zlib.crc32(e.data), `CRC ${e.name}`);
  }
  assert.ok(entries.find((e) => e.name === '26101601/css/style.css').method === 8, 'nén deflate');
  assert.equal(entries.find((e) => e.name === '26101601/assets/art/noise.bin').method, 0, 'không nén được thì store');
  assert.ok(entries.find((e) => e.name.includes('tiếng')).flags & 0x800, 'cờ UTF-8');
  zipDir(src, outFile);
  assert.ok(fs.readFileSync(outFile).equals(buf), 'cùng nội dung → cùng file zip');
});

test('release-check: unbuilt, dirty or stale packages are refused', async () => {
  const { dir, game } = await packedGame('rc-fresh');
  fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), JSON.stringify({ commit: 'abc1234', dirty: true }));
  assert.match(checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n'), /chưa commit/);
  fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), JSON.stringify({ commit: 'abc1234', dirty: false }));
  assert.match(checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n'), /HEAD/);
  assert.match(checkBuild(dir, '26101601', 'dev-mock', game, loadProvenance(dir)).errors.join('\n'), /chưa có gói/);
});

test('languages: a translation with its own plural forms gets none of en\'s forms for that key', async () => {
  const { buildLanguages } = await import('../scripts/lib/languages.mjs');
  const sources = {
    en: { _meta: { name: 'English' }, 'coins.one': '{count} coin', 'coins.other': '{count} coins', 'lives.one': '{count} life', 'lives.other': '{count} lives', title: 'Title' },
    ru: { _meta: { name: 'Русский' }, 'coins.other': '{count} монет' },
  };
  const ru = JSON.parse(buildLanguages(sources, ['ru']).files.ru);
  assert.deepEqual(ru, { 'lives.one': '{count} life', 'lives.other': '{count} lives', title: 'Title', 'coins.other': '{count} монет' });
});

test('version: YYMMDD must be a real date and NN 01–99', () => {
  for (const bad of ['99999999', '26023001', '26022901', '26130101', '26100001', '26101600'])
    assert.throws(() => checkVersion(bad, []), /ngày có thật|NN/, bad);
  assert.equal(checkVersion('28022901', []), '28022901', 'năm nhuận');
  assert.equal(versionError('26101699'), null);
  assert.match(versionError('2610160x'), /8 chữ số/);
});

test('zip: already-compressed formats are stored, the rest deflated; native and JS CRC agree', () => {
  const dir = tmpDir();
  const src = path.join(dir, 'pkg');
  const same = 'a'.repeat(4000);
  for (const f of ['a.png', 'b.webp', 'c.jpg', 'd.mp3', 'e.ogg', 'f.woff2', 'g.js.gz', 'h.wasm', 'i.json']) write(src, f, same);
  const outFile = path.join(dir, 'pkg.zip');
  zipDir(src, outFile);
  const method = Object.fromEntries(readZip(fs.readFileSync(outFile)).map((e) => [e.name, e.method]));
  for (const f of ['a.png', 'b.webp', 'c.jpg', 'd.mp3', 'e.ogg', 'f.woff2', 'g.js.gz']) assert.equal(method[f], 0, `${f} store`);
  for (const f of ['h.wasm', 'i.json']) assert.equal(method[f], 8, `${f} deflate`);
  for (const buf of [Buffer.alloc(0), Buffer.from('xin chào'), crypto.randomBytes(5000)]) assert.equal(crc32(buf), crc32js(buf));
});

test('zip: past the 4 GB format limit is a GkError and no partial zip is left', () => {
  const dir = tmpDir();
  const src = path.join(dir, 'pkg');
  write(src, 'a.bin', crypto.randomBytes(300));
  write(src, 'b.bin', crypto.randomBytes(300));
  const outFile = path.join(dir, 'pkg.zip');
  assert.throws(() => zipDir(src, outFile, { limit: 200 }), (e) => e instanceof GkError && /4 GB/.test(e.message) && /a\.bin/.test(e.message));
  assert.throws(() => zipDir(src, outFile, { limit: 500 }), /b\.bin/, 'offset vượt giới hạn');
  assert.ok(!fs.existsSync(outFile));
});

const setPage = (o, fn) => {
  const html = fn(read(o, 'index.html'));
  fs.writeFileSync(path.join(o, 'index.html'), html);
  fs.writeFileSync(path.join(o, 'preview.html'), html);
};
const rehash = (dir, out) => {
  const f = path.join(dir, 'builds/26101601/manifest.json');
  const man = JSON.parse(fs.readFileSync(f, 'utf8'));
  man.portals.azgames.hash = hashDir(out);
  fs.writeFileSync(f, JSON.stringify(man));
};

test('release-check: script, link and code bypasses are caught', async () => {
  const faults = [
    ['script không có nháy', (o) => setPage(o, (h) => h.replace('</body>', '<script src=https://evil.example.com/x.js></script></body>')), /index\.html nạp script từ evil\.example\.com/],
    ['script trong <v>/index.html', (o) => write(o, '26101601/index.html', read(o, '26101601/index.html').replace('</body>', '<script src="x.js"></script></body>')), /26101601\/index\.html nạp script "x\.js"/],
    ['link //host trong JS', (o) => fs.appendFileSync(path.join(o, '26101601/framework.js'), ';fetch("//cdn.evil.example/t.js")'), /framework\.js: link ngoài dạng \/\/cdn\.evil\.example/],
    ['url(//host) trong CSS', (o) => write(o, '26101601/css/style.css', 'body{background:url(//img.evil.example/a.png)}'), /style\.css: link ngoài dạng \/\/img\.evil\.example/],
    ['src=//host không nháy', (o) => setPage(o, (h) => h.replace('</body>', '<img src=//px.evil.example/a.gif></body>')), /px\.evil\.example/],
    ['JS trong assets', (o) => write(o, '26101601/assets/art/x.js', '1'), /assets\/art\/x\.js: assets\/ không chứa code/],
    ['JS nén trong assets', (o) => write(o, '26101601/assets/img/y.js.br', '1'), /assets\/img\/y\.js\.br: assets\/ không chứa code/],
  ];
  for (const [i, [what, mutate, expected]] of faults.entries()) {
    const { dir, out, game } = await packedGame(`rcb-${i}`);
    mutate(out);
    rehash(dir, out);
    const errors = checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n');
    assert.match(errors, expected, what);
  }
});

test('release-check: comments, w3.org and "//" string joins are not external links', async () => {
  const { dir, out, game } = await packedGame('rcb-ok');
  fs.appendFileSync(path.join(out, '26101601/framework.js'), '\nvar a=1; // xem docs.example.com\nvar u=location.protocol+"//"+location.host;var n="http://www.w3.org/2000/svg";');
  rehash(dir, out);
  const pr = checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir));
  assert.ok(pr.ok, pr.errors.join('\n'));
});

test('release-check: a package edited after pack no longer matches the manifest hash', async () => {
  const { dir, out, game } = await packedGame('rc-hash');
  fs.writeFileSync(path.join(out, '26101601/Language/en.json'), '{"a":"A!","b":"B {x}"}');
  assert.match(checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n'), /bị sửa sau khi pack/);
  const head = sh(dir, 'git', 'rev-parse', '--short', 'HEAD').trim();
  fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), JSON.stringify({ commit: head, dirty: false, portals: {} }));
  assert.match(checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n'), /không có hash của azgames/);
});

test('release-check command: --portal is trimmed and deduplicated like pack', () => {
  const dir = newGame('rc-trim');
  write(dir, 'builds/26101601/.keep', '');
  const r = gk(dir, 'release-check', '--portal', 'azgames, azgames ,');
  assert.equal(r.code, 1);
  assert.equal(r.out.match(/builds\/26101601\/azgames: chưa có gói/g)?.length, 1, r.out);
  assert.doesNotMatch(r.out, /bộ vỏ portal " azgames"|bộ vỏ portal ""/);
});

test('loader: the language picked for the player sets <html lang> and dir', async () => {
  const { runLoader } = await import('../portals/shared/loader-runtime.js');
  const html = { lang: 'en', dir: '' };
  const files = { 'framework.js': 'void 0', 'Language/ar.json': '{"_meta":{"dir":"rtl"},"a":"x"}' };
  const fakes = {
    window: {},
    location: { search: '?lang=ar', reload() {} },
    navigator: { languages: ['en-US'] },
    fetch: async (url) => new Response(files[url]),
    document: {
      documentElement: html,
      getElementById: () => null,
      createElement: () => ({}),
      body: { appendChild: (s) => setTimeout(() => s.onload(), 0) },
    },
  };
  const saved = Object.fromEntries(Object.keys(fakes).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, v] of Object.entries(fakes)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  try {
    const cfg = { storageKey: 'k', defaultLanguage: 'en', languages: [{ code: 'en', name: 'English' }, { code: 'ar', name: 'العربية' }], sizes: { framework: 6, lang: { ar: 30 } }, copyright: '©', version: '26101601' };
    runLoader(cfg);
    for (let i = 0; i < 100 && !fakes.window.GM_LANG; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(fakes.window.GM_LANG?.code, 'ar');
    assert.equal(html.lang, 'ar');
    assert.equal(html.dir, 'rtl');
  } finally {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});

/** Stand-ins for vite, esbuild and javascript-obfuscator in the game's node_modules (gitignored), so pack runs offline. */
function fakeToolchain(dir) {
  write(dir, 'node_modules/vite/package.json', '{"name":"vite"}');
  write(dir, 'node_modules/vite/bin/vite.js', `const fs = require('fs');
const path = require('path');
const out = process.argv[process.argv.indexOf('--outDir') + 1];
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync('public', out, { recursive: true });
fs.mkdirSync(path.join(out, 'css'), { recursive: true });
fs.writeFileSync(path.join(out, 'framework.js'), 'var f="gk-settings-footer",b=' + JSON.stringify(process.env.GK_BUILD) + ',s=' + JSON.stringify(fs.readFileSync('src/main.ts', 'utf8').length) + ';');
fs.writeFileSync(path.join(out, 'css/style.css'), 'body{}');
`);
  write(dir, 'node_modules/esbuild/package.json', '{"name":"esbuild"}');
  write(dir, 'node_modules/esbuild/index.js', 'exports.build = async ({ define }) => ({ outputFiles: [{ text: "var cfg=" + define.__GK_LOADER__ + ";" }] });');
  write(dir, 'node_modules/javascript-obfuscator/package.json', '{"name":"javascript-obfuscator"}');
  write(dir, 'node_modules/javascript-obfuscator/index.js', 'exports.obfuscate = (code) => ({ getObfuscatedCode: () => code });');
  return dir;
}
const builds = (dir) => (fs.existsSync(path.join(dir, 'builds')) ? fs.readdirSync(path.join(dir, 'builds')).sort() : []);
const manifestOf = (dir, v) => JSON.parse(read(dir, `builds/${v}/manifest.json`));
const AZ_SETS = ['--set', 'azgames.gameCode=g205', '--set', `azgames.signed=${token({ signed: 'x', domain: 'azgame.io' })}`];

test('pack: an unconfigured portal is skipped with its fix, the configured ones still build, exit 1', () => {
  const dir = fakeToolchain(newGame('pk-part'));
  const r = gk(dir, 'pack', '--all', '--quiet');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /azgames: thiếu gameCode/);
  assert.match(r.out, /gamekit config --portal azgames/);
  const [v] = builds(dir);
  assert.ok(fs.existsSync(path.join(dir, `builds/${v}/dev-mock/${v}/framework.js`)), r.out);
  assert.ok(!fs.existsSync(path.join(dir, `builds/${v}/azgames`)));
  assert.deepEqual(Object.keys(manifestOf(dir, v).portals), ['dev-mock']);
});

test('pack: game.yaml title/settings/languages count as build input; phase and timings do not', () => {
  const dir = fakeToolchain(newGame('pk-dirty'));
  assert.equal(gk(dir, 'pack', '--portal', 'dev-mock', '--quiet').code, 0);
  assert.equal(manifestOf(dir, builds(dir).at(-1)).dirty, false);
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^phase: P0/m, 'phase: P4'));
  assert.equal(gk(dir, 'pack', '--portal', 'dev-mock', '--quiet').code, 0);
  assert.equal(manifestOf(dir, builds(dir).at(-1)).dirty, false, 'phase không vào gói');
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace(/^title: .*/m, 'title: Tên Mới'));
  const r = gk(dir, 'pack', '--portal', 'dev-mock', '--quiet');
  const man = manifestOf(dir, builds(dir).at(-1));
  assert.equal(man.title, 'Tên Mới');
  assert.equal(man.dirty, true, 'title chưa commit mà gói ghi dirty:false');
  assert.match(r.out, /chưa commit/);
});

test('gate {auto: pack}: reuses the last build of the same clean commit instead of taking a new number', () => {
  const dir = fakeToolchain(newGame('gate-pack'));
  write(dir, 'gates/P0.md', '- [ ] Đóng gói được {auto: pack}\n');
  let r = gk(dir, 'gate');
  assert.equal(r.code, 1);
  assert.match(r.out, /azgames: thiếu gameCode.*gamekit config --portal azgames/);
  assert.deepEqual(builds(dir), [], 'thiếu thông tin portal thì không tốn số build');
  assert.equal(gk(dir, 'config', ...AZ_SETS).code, 0);
  sh(dir, 'git', 'commit', '-qam', 'azgames');
  r = gk(dir, 'gate');
  assert.equal(r.code, 0, r.out);
  assert.equal(builds(dir).length, 1);
  const first = builds(dir)[0];
  r = gk(dir, 'gate');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`dùng lại builds/${first}`));
  assert.deepEqual(builds(dir), [first]);
  fs.appendFileSync(path.join(dir, `builds/${first}/dev-mock/${first}/framework.js`), ';1');
  assert.equal(gk(dir, 'gate').code, 0);
  assert.equal(builds(dir).length, 2, 'gói bị sửa tay thì pack lại');
  fs.appendFileSync(path.join(dir, 'src/main.ts'), '\n// đổi\n');
  assert.equal(gk(dir, 'gate').code, 0);
  assert.equal(builds(dir).length, 3, 'code chưa commit thì pack lại');
  sh(dir, 'git', 'commit', '-qam', 'code');
  assert.equal(gk(dir, 'gate').code, 0);
  assert.equal(builds(dir).length, 4, 'commit mới thì pack lại');
  assert.equal(gk(dir, 'gate').code, 0);
  assert.equal(builds(dir).length, 4);
});
