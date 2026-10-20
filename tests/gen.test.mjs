import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { CLI, newGame, write, read, editJson, editYaml, solidPng } from './helpers.mjs';
import { decodePng } from '../scripts/lib/png.mjs';

/** Run the CLI without blocking this process (the mock server answers from here). */
const gkAsync = (cwd, env, ...args) =>
  new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', ...env } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr }));
  });

/** Fake OpenAI: images are a 300×200 PNG, speech is "ID3…"; records every request body. */
async function mockOpenAI() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      if (req.url === '/v1/images/generations') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: [{ b64_json: solidPng(300, 200, [200, 30, 30, 255]).toString('base64') }] }));
      } else if (req.url === '/v1/audio/speech') res.end('ID3fake-mp3');
      else {
        res.statusCode = 404;
        res.end('{"error":{"message":"nope"}}');
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { calls, url: `http://127.0.0.1:${server.address().port}/v1`, close: () => server.close() };
}

function gameWithManifest() {
  const dir = newGame('gen', '--third-party');
  editYaml(dir, (g) => {
    g.languages = ['en', 'vi'];
    g.release.forbiddenTerms = ['OldGame'];
  });
  editJson(dir, 'Language/en.json', (d) => Object.assign(d, { 'ui.play': 'Play', 'vo.hello': 'Hello hero' }));
  write(dir, 'Language/vi.json', JSON.stringify({ _meta: { name: 'Tiếng Việt' }, 'ui.play': 'Chơi', 'vo.hello': 'Chào anh hùng' }));
  write(dir, 'style/style.json', JSON.stringify({ id: 'candy', name: 'Candy', palette: { bg: '#ffe8f3', surface: '#ffffff', primary: '#ff4f9a', secondary: '#7b5cff', text: '#3a1d4a', muted: '#9a7aa8' }, fonts: { display: { family: 'A' }, body: { family: 'B' } }, art: { prompt: 'flat vector, thick outlines', negative: 'photorealism' } }));
  write(dir, 'asset-manifest.json', JSON.stringify({
    assets: [
      { id: 'hero', path: 'assets/img/hero.png', kind: 'sprite', make: 'image-gen', width: 64, height: 64, alpha: true, brief: 'a round fox hero, front view' },
      { id: 'play', path: 'assets/i18n/en/ui/play.png', kind: 'ui', make: 'image-gen', width: 120, height: 48, alpha: true, text: true, textKey: 'ui.play', brief: 'rounded play button' },
      { id: 'bg', path: 'assets/img/bg.png', kind: 'background', make: 'image-gen', width: 90, height: 160, brief: 'soft candy hills' },
      { id: 'hello', path: 'assets/i18n/en/vo/hello.mp3', kind: 'audio', voice: true, textKey: 'vo.hello', brief: 'greeting' },
      { id: 'drawn', path: 'assets/img/drawn.png', kind: 'sprite', make: 'vector', width: 10, height: 10 },
    ],
  }));
  return dir;
}

test('gen image: style + brief prompts, one image per language with the exact words, fitted to spec, labelled', async () => {
  const dir = gameWithManifest();
  const api = await mockOpenAI();
  const env = { OPENAI_BASE_URL: api.url, OPENAI_API_KEY: 'sk-test' };
  try {
    let r = await gkAsync(dir, { OPENAI_API_KEY: '' }, 'gen', 'image');
    assert.equal(r.code, 1);
    assert.match(r.out, /OPENAI_API_KEY/);
    r = await gkAsync(dir, env, 'gen', 'image', '--dry-run');
    assert.equal(api.calls.length, 0, 'dry-run không gọi API');
    assert.match(r.out, /in Tiếng Việt: "Chơi"/);
    assert.match(read(dir, '.gamekit/local/gen/hero.txt'), /Art style: flat vector.*No text, letters/);
    assert.ok(fs.existsSync(path.join(dir, '.gamekit/local/gen/play.vi.txt')));
    r = await gkAsync(dir, env, 'gen', 'image');
    assert.equal(r.code, 0, r.out);
    assert.equal(api.calls.length, 4, 'hero + play en/vi + bg; drawn là vector nên bỏ qua');
    assert.equal(api.calls[0].auth, 'Bearer sk-test');
    const play = api.calls.find((c) => c.body.prompt.includes('"Chơi"'));
    assert.equal(play.body.background, 'transparent');
    assert.equal(play.body.size, '1536x1024');
    assert.equal(api.calls.find((c) => c.body.prompt.includes('candy hills')).body.size, '1024x1536');
    const vi = decodePng(fs.readFileSync(path.join(dir, 'assets/i18n/vi/ui/play.png')));
    assert.deepEqual([vi.width, vi.height], [120, 48]);
    assert.equal(vi.data[3], 0, 'ảnh có alpha: vừa khung, phần thừa trong suốt');
    const bg = decodePng(fs.readFileSync(path.join(dir, 'assets/img/bg.png')));
    assert.deepEqual([bg.width, bg.height, bg.data[3]], [90, 160, 255], 'nền: phủ kín');
    const prov = JSON.parse(read(dir, 'provenance.json')).entries;
    assert.equal(prov.find((e) => e.path === 'assets/i18n/vi/ui/play.png').label, 'generated');
    const man = JSON.parse(read(dir, 'asset-manifest.json'));
    assert.deepEqual(man.assets.find((a) => a.id === 'play').gen.langs, ['en', 'vi']);
    r = await gkAsync(dir, env, 'gen', 'image');
    assert.match(r.out, /Không có ảnh nào cần sinh/);
    assert.equal(api.calls.length, 4, 'đã có file thì không sinh lại');
    r = await gkAsync(dir, env, 'gen', 'image', '--id', 'play', '--lang', 'vi');
    assert.equal(api.calls.length, 5, '--id: sinh lại, chỉ vi');
    assert.equal(api.calls[4].body.model, 'gpt-image-1.5');
    r = await gkAsync(dir, env, 'gen', 'image', '--id', 'play', '--model', 'gpt-image-2');
    assert.match(r.out, /không làm được nền trong suốt/);
    assert.equal(api.calls.length, 5);

    const manifest = JSON.parse(read(dir, 'asset-manifest.json'));
    manifest.assets[0].brief = 'the OldGame fox';
    write(dir, 'asset-manifest.json', JSON.stringify(manifest));
    r = await gkAsync(dir, env, 'gen', 'image', '--id', 'hero');
    assert.equal(r.code, 1);
    assert.match(r.out, /forbiddenTerms/);
    assert.equal(api.calls.length, 5);

    r = await gkAsync(dir, env, 'gen', 'voice');
    assert.equal(r.code, 0, r.out);
    const speech = api.calls.filter((c) => c.url === '/v1/audio/speech');
    assert.deepEqual(speech.map((c) => c.body.input), ['Hello hero', 'Chào anh hùng']);
    assert.equal(speech[0].body.response_format, 'mp3');
    assert.equal(read(dir, 'assets/i18n/vi/vo/hello.mp3'), 'ID3fake-mp3');
    r = await gkAsync(dir, {}, 'validate');
    assert.equal(r.code, 0, r.out);
  } finally {
    api.close();
  }
});

test('gen import: a PNG made elsewhere is fitted, placed per language and labelled', async () => {
  const dir = gameWithManifest();
  write(dir, 'made.png', '');
  fs.writeFileSync(path.join(dir, 'made.png'), solidPng(240, 96));
  let r = await gkAsync(dir, {}, 'gen', 'import', 'play', 'made.png', '--lang', 'vi', '--source', 'Codex');
  assert.equal(r.code, 0, r.out);
  const img = decodePng(fs.readFileSync(path.join(dir, 'assets/i18n/vi/ui/play.png')));
  assert.deepEqual([img.width, img.height], [120, 48]);
  assert.equal(JSON.parse(read(dir, 'provenance.json')).entries.find((e) => e.path === 'assets/i18n/vi/ui/play.png').source, 'Codex');
  write(dir, 'x.wav', 'RIFF');
  r = await gkAsync(dir, {}, 'gen', 'import', 'hello', 'x.wav');
  assert.match(r.out, /đuôi phải là \.mp3/);
});
