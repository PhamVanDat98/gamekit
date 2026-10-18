import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gk, newGame, tmpDir, write } from './helpers.mjs';
import { layoutProblems, serveDir, timeToPlay } from '../scripts/smoke.mjs';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const fits = { vw: 390, vh: 844, scrollW: 390, scrollH: 844, canvas: rect(0, 62, 390, 720), gear: { ...rect(330, 10, 48, 48), hit: true } };

test('smoke: layout — canvas inside the viewport, no page scroll, a reachable Settings button', () => {
  assert.deepEqual(layoutProblems(fits), []);
  assert.deepEqual(layoutProblems({ ...fits, canvas: null }), ['không có canvas #game']);
  assert.match(layoutProblems({ ...fits, canvas: rect(-45, 62, 480, 720) })[0], /tràn màn hình \(480×720 tại -45,62, màn 390×844\)/);
  assert.match(layoutProblems({ ...fits, canvas: rect(0, 0, 0, 0) })[0], /rộng hoặc cao 0/);
  assert.match(layoutProblems({ ...fits, scrollH: 900 })[0], /trang cuộn được/);
  assert.match(layoutProblems({ ...fits, gear: null })[0], /không có nút Settings/);
  assert.match(layoutProblems({ ...fits, gear: { ...fits.gear, hit: false } })[0], /bị che/);
  assert.deepEqual(layoutProblems({ ...fits, canvas: rect(-0.5, 0, 390.8, 844.4) }), [], 'sub-pixel rounding is not overflow');
});

test('smoke: time to play comes from the loader line, else the measured fallback', () => {
  assert.equal(timeToPlay(['[dev-mock] loader 26101801', '[dev-mock] game_started 412 ms'], 900), 412);
  assert.equal(timeToPlay(['[dev-mock] init'], 900), 900);
});

const get = (url) =>
  new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
  });

test('smoke: the package server serves files with their type, 404s, and never leaves its folder', async () => {
  const parent = tmpDir();
  write(parent, 'pkg/index.html', '<!doctype html>outer');
  write(parent, 'pkg/26101801/framework.js', 'console.log(1)');
  write(parent, 'secret.txt', 'nope');
  const s = await serveDir(`${parent}/pkg`);
  try {
    assert.deepEqual(await get(s.url), { status: 200, type: 'text/html; charset=utf-8', body: '<!doctype html>outer' });
    assert.equal((await get(`${s.url}26101801/framework.js`)).type, 'text/javascript');
    assert.equal((await get(`${s.url}26101801/missing.js`)).status, 404);
    for (const p of ['%2e%2e/secret.txt', '..%2fsecret.txt', '26101801/%2e%2e/%2e%2e/secret.txt']) {
      const r = await get(`${s.url}${p}`);
      assert.notEqual(r.body, 'nope', p);
    }
  } finally {
    await s.close();
  }
});

test('smoke command: no build, a sitelocked portal and a missing playwright-core are errors naming the fix', () => {
  const dir = newGame();
  let r = gk(dir, 'smoke');
  assert.equal(r.code, 1);
  assert.match(r.out, /Chưa có bản build — chạy `gamekit pack`/);
  write(dir, 'builds/26101801/dev-mock/index.html', '<!doctype html>');
  assert.match(gk(dir, 'smoke', '--portal', 'azgames').out, /azgames có sitelock/);
  assert.match(gk(dir, 'smoke', '--version', '2610').out, /8 chữ số/);
  r = gk(dir, 'smoke');
  assert.equal(r.code, 1);
  assert.match(r.out, /thiếu playwright-core — chạy `npm i -D playwright-core`/);
  assert.match(gk(dir, 'help').out, /smoke \[--version V\]/);
});
