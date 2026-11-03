import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { newGame, write, editYaml, tmpDir } from './helpers.mjs';
import { loadPlaywright, serve, smoke } from '../scripts/smoke.mjs';

const pw = loadPlaywright(process.cwd());
// The module alone is not enough: the browser must have been installed too.
const browser = (() => {
  try {
    return pw && fs.existsSync(pw.chromium.executablePath());
  } catch {
    return false;
  }
})();

test('smoke server: stays inside the package, survives bad escapes', async () => {
  const dir = tmpDir();
  write(dir, 'pkg/index.html', 'ok');
  write(dir, 'pkg-secret/x.txt', 'SECRET');
  const srv = await serve(path.join(dir, 'pkg'));
  try {
    const get = (u) => fetch(srv.url + u).then(async (r) => [r.status, await r.text()]);
    assert.deepEqual(await get('/index.html'), [200, 'ok']);
    assert.equal((await get('/..%2fpkg-secret%2fx.txt'))[0], 403);
    assert.equal((await get('/100%.png'))[0], 400);
  } finally {
    srv.close();
  }
});

test('smoke: catches a blank screen, page errors, no Settings footer, a language that does not load', { skip: !browser && 'cần Playwright + Chromium' }, async () => {
  const dir = newGame('smk');
  editYaml(dir, (g) => {
    g.languages = ['en', 'vi'];
  });
  // A broken "package": blank page, throws, ignores ?lang= except for en.
  write(dir, 'builds/26102001/dev-mock/index.html', `<!doctype html><body style="margin:0;background:#000"><script>
    window.GM_LANG = { code: 'en' };
    window.GM_LOADER = { ready() {} };
    setTimeout(() => { window.GM_LOADER.ready(); throw new Error('boom'); }, 50);
  </script></body>`);
  const { report } = await smoke(dir, { version: '26102001', quick: true });
  const f = report.failures.join('\n');
  assert.match(f, /desktop: màn hình trống/);
  assert.match(f, /pageerror: boom/);
  assert.match(f, /Settings: không có nút bánh răng/);
  assert.match(f, /lang vi: game chạy bằng en/);
  assert.equal(report.scenarios[0].timeToPlayMs > 0, true);
});
