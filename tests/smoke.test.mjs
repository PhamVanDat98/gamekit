import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, write, editYaml } from './helpers.mjs';
import { loadPlaywright, smoke } from '../scripts/smoke.mjs';

const pw = loadPlaywright(process.cwd());

test('smoke: catches a blank screen, page errors, no Settings footer, a language that does not load', { skip: !pw && 'cần Playwright' }, async () => {
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
