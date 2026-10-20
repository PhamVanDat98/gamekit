import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { tmpDir, write, read, solidPng, gk, sh, CLI, editYaml } from './helpers.mjs';
import { decodePng, dominantShare } from '../scripts/lib/png.mjs';
import { cachedChromium, serveDir } from '../scripts/lib/browser.mjs';
import { parseStep, smokeConfig, fpsStats, judge, pickScenarios, DEFAULT_SMOKE, SCENARIOS, SCENARIO_SETS } from '../scripts/smoke.mjs';
import { smokeSetFor, parseGate } from '../scripts/gate.mjs';
import { crc32 } from '../scripts/lib/zip.mjs';

/** Encode RGBA rows with a given PNG filter per row, so the decoder's unfiltering is really exercised. */
function pngWithFilters(w, h, pixel, filters) {
  const stride = w * 4;
  const raw = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) row.set(pixel(x, y), x * 4);
    const f = filters[y % filters.length];
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const pred = [0, a, b, (a + b) >> 1, pr][f];
      out[i] = (row[i] - pred) & 255;
    }
    raw.push(Buffer.from([f]), out);
    prev = row;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(raw))), chunk('IEND', Buffer.alloc(0))]);
}

test('png: decodes every filter type back to the same pixels; one flat colour reads as blank', () => {
  const pixel = (x, y) => [(x * 37 + y * 11) & 255, (x * 5) & 255, (y * 13) & 255, 255 - ((x + y) & 63)];
  const img = decodePng(pngWithFilters(9, 10, pixel, [0, 1, 2, 3, 4]));
  assert.equal(img.width, 9);
  assert.equal(img.height, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) assert.deepEqual([...img.data.subarray((y * 9 + x) * 4, (y * 9 + x) * 4 + 4)], pixel(x, y), `pixel ${x},${y}`);
  assert.equal(dominantShare(decodePng(solidPng(20, 10))), 1);
  assert.ok(dominantShare(img) < 0.5);
  assert.equal(decodePng(Buffer.from('not a png')), null);
});

test('smoke: start steps parse or fail with the accepted forms; config falls back to defaults', () => {
  assert.deepEqual(parseStep('click 0.5 0.25'), { kind: 'click', x: 0.5, y: 0.25 });
  assert.deepEqual(parseStep('tap 1 0'), { kind: 'tap', x: 1, y: 0 });
  assert.deepEqual(parseStep('key Space'), { kind: 'key', key: 'Space' });
  assert.deepEqual(parseStep('wait 300'), { kind: 'wait', ms: 300 });
  for (const bad of ['click 2 0', 'click 0.5', 'press Space', 'wait soon', 'key']) assert.throws(() => parseStep(bad), /click x y/, bad);
  const cfg = smokeConfig({});
  assert.equal(cfg.playSec, DEFAULT_SMOKE.playSec);
  assert.deepEqual(cfg.start, [{ kind: 'click', x: 0.5, y: 0.5 }]);
  assert.deepEqual(smokeConfig({ smoke: { start: ['key Enter'], playSec: 3 } }).start, [{ kind: 'key', key: 'Enter' }]);
});

test('smoke: scenario sets — basic for P3/P4, full by default and wherever perf is judged', () => {
  const ids = (args) => pickScenarios(args).map((s) => s.id);
  assert.deepEqual(ids({}), SCENARIOS.map((s) => s.id));
  assert.deepEqual(ids({ scenarios: 'basic' }), ['desktop', 'mobile-portrait', 'mobile-landscape', 'ad-fail']);
  assert.deepEqual(ids({ scenarios: 'full' }), ids({}));
  assert.deepEqual(ids({ quick: true }), ['desktop']);
  assert.deepEqual(ids({ scenarios: 'basic', only: 'ad-fail' }), ['ad-fail']);
  assert.deepEqual(ids({ 'no-perf': true }), SCENARIOS.filter((s) => s.id !== 'weak-phone').map((s) => s.id));
  assert.throws(() => pickScenarios({ scenarios: 'tiny' }), /basic, full/);
  assert.ok(!SCENARIO_SETS.basic.includes('weak-phone'), 'basic never judges perf');
  const items = (t) => parseGate(t);
  assert.equal(smokeSetFor('P3', items('- [ ] a {auto: smoke}')), 'basic');
  assert.equal(smokeSetFor('P4', items('- [ ] a {auto: smoke}')), 'basic');
  assert.equal(smokeSetFor('P5', items('- [ ] a {auto: smoke}')), 'full');
  assert.equal(smokeSetFor('P3', items('- [ ] a {auto: smoke}\n- [ ] b {auto: perf}')), 'full', 'perf in any gate needs weak-phone');
});

test('smoke: fps from frame timestamps', () => {
  assert.equal(fpsStats([0, 16]), null);
  const frames = Array.from({ length: 61 }, (_, i) => i * (1000 / 60));
  const s = fpsStats(frames);
  assert.equal(s.avg, 60);
  assert.equal(s.frames, 61);
  const janky = [...frames, frames.at(-1) + 200];
  assert.ok(fpsStats(janky).avg < 60);
});

const scenario = (id, extra = {}) => ({
  id,
  device: SCENARIOS.find((s) => s.id === id).device,
  errors: [],
  platform: ['loadingEnd', 'gameplayStart', 'gameplayStart', 'showAd interstitial round_end (ok)'],
  readyMs: 500,
  blank: 0.5,
  hashes: ['a', 'b', 'c'],
  fps: { avg: 60, p5: 58, frames: 300 },
  layout: { iw: 1280, ih: 720, sw: 1280, sh: 720, canvas: { x: 0, y: 0, w: 1280, h: 720 }, gear: { x: 1230, y: 10, w: 40, h: 40 } },
  ...extra,
});
const errorsOf = (issues, cat) => issues.filter((i) => i.level === 'error' && (!cat || i.cat === cat)).map((i) => `${i.where}: ${i.msg}`);
const game = { phase: 'P3', budget: { timeToPlaySec: 5, minFpsDesktop: 60, minFpsMobile: 30 } };

test('smoke judge: a healthy run has no problems', () => {
  const all = SCENARIOS.map((s) => scenario(s.id, s.id === 'desktop' ? { settings: { found: true, footer: '© 2026 X', footerVisible: true, copyright: '© 2026 X' } } : {}));
  assert.deepEqual(judge(all, game), []);
});

test('smoke judge: console errors, stuck loading, scroll, overflow, blank and frozen screens are errors', () => {
  const issues = judge(
    [
      scenario('desktop', { errors: ['lỗi JS: boom', 'lỗi JS: boom'] }),
      scenario('mobile-portrait', { stuck: true, layout: null }),
      scenario('mobile-landscape', { layout: { iw: 844, ih: 390, sw: 900, sh: 390, canvas: { x: -50, y: 0, w: 944, h: 390 }, gear: null } }),
      scenario('ad-fail', { blank: 0.995 }),
      scenario('ad-skip', { hashes: ['x', 'x', 'x'] }),
    ],
    game,
  );
  const e = errorsOf(issues).join('\n');
  assert.equal(e.match(/boom/g).length, 1, 'duplicate errors reported once');
  assert.match(e, /mobile-portrait: màn loading không tắt/);
  assert.match(e, /mobile-landscape: trang cuộn được/);
  assert.match(e, /mobile-landscape: canvas tràn/);
  assert.match(e, /ad-fail: màn hình gần như một màu/);
  assert.match(e, /ad-skip: hình không đổi/);
});

test('smoke judge: missing platform events warn before P4 and fail from P4; Settings footer and language are checked', () => {
  const quiet = scenario('desktop', { platform: [], settings: { found: true, footer: 'sai', footerVisible: true, copyright: '© 2026 X', switchedTo: 'vi', languageAfter: 'en' } });
  const p3 = judge([quiet], game);
  assert.ok(p3.some((i) => i.level === 'warn' && /gameplayStart/.test(i.msg)));
  assert.match(errorsOf(p3).join('\n'), /footer Settings "sai"/);
  assert.match(errorsOf(p3).join('\n'), /đổi ngôn ngữ sang vi/);
  assert.match(errorsOf(judge([quiet], { ...game, phase: 'P4' })).join('\n'), /loadingEnd[\s\S]*gameplayStart/);
  const noFooter = judge([scenario('desktop', { settings: { found: true, footerVisible: false } })], game);
  assert.match(errorsOf(noFooter).join('\n'), /footer bản quyền/);
});

test('smoke judge: perf budget — FPS under 90% and slow time-to-play on the weak phone are perf errors', () => {
  const issues = judge([scenario('desktop', { fps: { avg: 50, p5: 40, frames: 200 } }), scenario('weak-phone', { readyMs: 7200, fps: { avg: 20, p5: 10, frames: 100 } })], game);
  const perf = errorsOf(issues, 'perf').join('\n');
  assert.match(perf, /desktop: FPS trung bình 50 < ngân sách 60/);
  assert.match(perf, /weak-phone: FPS trung bình 20 < ngân sách 30/);
  assert.match(perf, /weak-phone: vào game sau 7\.2s/);
  assert.deepEqual(errorsOf(issues, 'smoke'), []);
  assert.deepEqual(errorsOf(judge([scenario('desktop', { fps: { avg: 55, p5: 50, frames: 300 } })], game)), [], '55 ≥ 90% của 60');
});

test('smoke judge: ad scenarios that never met an ad are reported as not exercised', () => {
  const issues = judge([scenario('ad-fail', { platform: ['gameplayStart'] }), scenario('ad-none', { platform: ['gameplayStart'] }), scenario('ad-skip')], game);
  const warns = issues.filter((i) => i.level === 'warn').map((i) => i.where);
  assert.deepEqual(warns.sort(), ['ad-fail', 'ad-none']);
});

test('static server: serves files with types, folders as index.html, refuses to leave the folder', async () => {
  const dir = tmpDir();
  write(dir, 'pkg/index.html', '<p>hi</p>');
  write(dir, 'pkg/v/a.js', 'x=1');
  write(dir, 'secret.txt', 'no');
  const s = await serveDir(path.join(dir, 'pkg'));
  const get = (p) =>
    new Promise((resolve) => {
      http.get(s.url + p, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
      });
    });
  try {
    assert.deepEqual(await get(''), { status: 200, type: 'text/html; charset=utf-8', body: '<p>hi</p>' });
    assert.equal((await get('v/a.js')).type, 'text/javascript; charset=utf-8');
    assert.equal((await get('nope.js')).status, 404);
    assert.notEqual((await get('..%2fsecret.txt')).body, 'no');
    assert.notEqual((await get('v/..%2f..%2fsecret.txt')).body, 'no');
  } finally {
    await s.close();
  }
});

test('browser: newest cached playwright chromium is found whatever revision', () => {
  const dir = tmpDir();
  for (const rev of ['1100', '1194']) write(dir, `chromium-${rev}/chrome-linux/chrome`, '');
  write(dir, 'chromium_headless_shell-1300/chrome-linux/headless_shell', '');
  assert.equal(cachedChromium({ PLAYWRIGHT_BROWSERS_PATH: dir }, 'linux'), path.join(dir, 'chromium-1194', 'chrome-linux', 'chrome'));
  assert.equal(cachedChromium({ PLAYWRIGHT_BROWSERS_PATH: path.join(dir, 'none'), HOME: dir }, 'linux'), null);
});

// ---------- end to end: a real game, a real browser. Slow (npm install + chromium); CI sets GK_E2E=1 ----------

test('e2e: template game passes smoke; a broken layout and a crash are caught; gate runs smoke once', { skip: !process.env.GK_E2E && 'đặt GK_E2E=1 để chạy (cần mạng cho npm install và một Chromium)', timeout: 20 * 60_000 }, () => {
  const parent = tmpDir();
  const init = spawnSync(process.execPath, [CLI, 'init', 'e2e', '--no-input', '--set', 'title=E2E', '--set', 'portals=dev-mock'], { cwd: parent, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  const dir = path.join(parent, 'e2e');
  sh(dir, 'git', 'config', 'user.email', 'test@example.com');
  sh(dir, 'git', 'config', 'user.name', 'test');
  const npm = (...a) => spawnSync('npm', a, { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
  for (const s of ['test', 'typecheck', 'lint']) {
    const r = npm('run', s);
    assert.equal(r.status, 0, `${s}: ${r.stdout}${r.stderr}`);
  }

  const smoke = () => {
    const r = gk(dir, 'smoke', '--json');
    return { code: r.code, report: JSON.parse(r.out.slice(r.out.indexOf('{'))) };
  };
  const ok = smoke();
  assert.equal(ok.code, 0, JSON.stringify(ok.report.issues, null, 2));
  assert.deepEqual(ok.report.scenarios.map((s) => s.id).sort(), SCENARIOS.map((s) => s.id).sort());
  for (const s of ok.report.scenarios) for (const f of s.shots) assert.ok(fs.existsSync(path.join(dir, f)), f);
  assert.equal(JSON.parse(read(dir, '.gamekit/smoke/report.json')).ok, true);
  assert.equal(sh(dir, 'git', 'status', '--porcelain', '--', '.gamekit'), '', 'smoke output is gitignored');

  // A canvas wider than the phone: scroll + overflow, caught on mobile.
  const css = read(dir, 'src/view/style.css');
  write(dir, 'src/view/style.css', `${css}\ncanvas#game { min-width: 1200px !important; }\n`);
  const wide = smoke();
  assert.equal(wide.code, 1);
  assert.ok(wide.report.issues.some((i) => i.where === 'mobile-portrait' && /tràn|cuộn/.test(i.msg)), JSON.stringify(wide.report.issues));
  write(dir, 'src/view/style.css', css);

  // A crash once the game starts.
  const main = read(dir, 'src/main.ts');
  write(dir, 'src/main.ts', main.replace("platform.gameplayStart();", "platform.gameplayStart();\n    throw new Error('e2e boom');"));
  const r = gk(dir, 'smoke', '--quick', '--json');
  assert.equal(r.code, 1);
  assert.match(r.out, /e2e boom/);
  write(dir, 'src/main.ts', main);

  // Gate P3: {auto: smoke} passes on the healthy game (human items ticked for the test).
  editYaml(dir, (g) => (g.phase = 'P3'));
  write(dir, 'gates/P3.md', read(dir, 'gates/P3.md').replaceAll('- [ ]', '- [x]'));
  const gate = gk(dir, 'gate');
  assert.match(gate.out, /✔ Smoke: chạy được trên desktop/);

  // Packaged build: pack dev-mock, smoke it with --version.
  assert.equal(gk(dir, 'pack', '--portal', 'dev-mock').code, 0);
  const packed = gk(dir, 'smoke', '--version', '--quick');
  assert.equal(packed.code, 0, packed.out);
  assert.match(packed.out, /Smoke builds\/\d{8}\/dev-mock/);
});
