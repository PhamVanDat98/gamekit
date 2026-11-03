// gamekit smoke [--version V] [--portal dev-mock] — open the packaged game in Chromium the way players do
// and check it: loading → first frame time, FPS (desktop, and a throttled phone), console errors, failed
// requests, a non-blank screen, start on Space/tap, the Settings popup and its copyright footer, every
// language (and right-to-left). Compares with game.yaml budget. Needs Playwright (npm i -D playwright).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { exists, writeJson, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { latestVersion } from './lib/version.mjs';
import { decodePng, colourCount } from './lib/png.mjs';

const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm', txt: 'text/plain' };

/** Phone profile: 4× slower CPU and a 4G-like network. */
export const SCENARIOS = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, mobile: false },
  { name: 'phone-portrait', viewport: { width: 390, height: 844 }, mobile: true, cpu: 4, net: { latency: 60, down: 9e6, up: 3e6 } },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 }, mobile: true, cpu: 4, net: { latency: 60, down: 9e6, up: 3e6 } },
];

export function loadPlaywright(root) {
  const from = [path.join(root, 'package.json'), import.meta.url];
  try {
    from.push(path.join(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 'noop.js'));
  } catch {
    /* no global npm */
  }
  for (const f of from)
    for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
      try {
        const pw = createRequire(f)(name);
        if (pw.chromium) return pw;
      } catch {
        /* next */
      }
    }
  return null;
}

/** Static server for one package folder (what a portal hosts). */
export function serve(dir) {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.statusCode = 400;
      return res.end();
    }
    let f = path.join(dir, url);
    const rel = path.relative(dir, f);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.statusCode = 403;
      return res.end();
    }
    if (exists(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!exists(f)) {
      res.statusCode = 404;
      return res.end('not found');
    }
    res.setHeader('content-type', TYPES[path.extname(f).slice(1).toLowerCase()] ?? 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

// Records when the game calls GM_LOADER.ready() (its first frame on screen).
const READY_HOOK = `(() => {
  let v;
  Object.defineProperty(window, 'GM_LOADER', { configurable: true, get() { return v; }, set(x) {
    if (x && typeof x.ready === 'function') { const r = x.ready; x.ready = function () { if (!window.__gkReady) window.__gkReady = performance.now(); return r.apply(this, arguments); }; }
    v = x;
  } });
})();`;

async function openPage(browser, sc, url) {
  const ctx = await browser.newContext({ viewport: sc.viewport, isMobile: sc.mobile, hasTouch: sc.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(READY_HOOK);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // "Failed to load resource" repeats the HTTP status below; aborted requests (media, cancelled fetches) are normal.
  page.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  page.on('requestfailed', (r) => !/ERR_ABORTED/.test(r.failure()?.errorText ?? '') && errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));
  if (sc.cpu || sc.net) {
    const cdp = await ctx.newCDPSession(page);
    if (sc.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: sc.cpu });
    if (sc.net) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: sc.net.latency, downloadThroughput: sc.net.down / 8, uploadThroughput: sc.net.up / 8 });
    }
  }
  await page.goto(url);
  return { ctx, page, errors };
}

async function waitReady(page, timeout) {
  try {
    // GM_LOADER.ready() (hooked), or — for a loader the hook cannot see — its loading screen hidden.
    await page.waitForFunction(
      () => {
        if (window.__gkReady) return true;
        const l = document.getElementById('gmLoader');
        if (l && getComputedStyle(l).display === 'none') window.__gkReady = performance.now();
        return Boolean(window.__gkReady);
      },
      null,
      { timeout, polling: 50 },
    );
    return await page.evaluate(() => Math.round(window.__gkReady));
  } catch {
    return null;
  }
}

const fps = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = (t) => {
          n++;
          if (t - t0 < ms) requestAnimationFrame(tick);
          else resolve(Math.round((n * 1000) / (t - t0)));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

async function shot(page, file) {
  const buf = await page.screenshot({ path: file });
  return colourCount(decodePng(buf), 8);
}

export async function smoke(root, { version, portal = 'dev-mock', quick = false, executablePath } = {}) {
  const game = loadGame(root);
  const pkg = path.join(root, 'builds', version, portal);
  if (!exists(path.join(pkg, 'index.html'))) throw new GkError(`Chưa có builds/${version}/${portal}/ — gamekit pack --portal ${portal}`);
  const pw = loadPlaywright(root);
  if (!pw) throw new GkError('Cần Playwright: npm i -D playwright && npx playwright install chromium (một lần cho máy)');
  const out = path.join(root, '.gamekit', 'local', 'smoke', `${version}-${portal}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const budget = game.budget ?? {};
  const report = { version, portal, at: nowIso(), scenarios: [], languages: [], settings: null, failures: [] };
  const fail = (s) => report.failures.push(s);
  const srv = await serve(pkg);
  let browser;
  try {
    browser = await pw.chromium.launch(executablePath || process.env.GAMEKIT_CHROMIUM ? { executablePath: executablePath ?? process.env.GAMEKIT_CHROMIUM } : {});
    for (const sc of quick ? SCENARIOS.slice(0, 1) : SCENARIOS) {
      const { ctx, page, errors } = await openPage(browser, sc, `${srv.url}/index.html`);
      const r = { name: sc.name, viewport: sc.viewport, timeToPlayMs: await waitReady(page, 60000), fps: null, blank: null, errors };
      if (r.timeToPlayMs == null) fail(`${sc.name}: game không gọi GM_LOADER.ready() trong 60 giây (màn loading không tắt)`);
      else {
        await page.waitForTimeout(500);
        r.blank = (await shot(page, path.join(out, `${sc.name}-ready.png`))) <= 2;
        if (r.blank) fail(`${sc.name}: màn hình trống (một màu) sau khi vào game`);
        // Start a round the way a player would, then measure while playing.
        const box = sc.viewport;
        if (sc.mobile) await page.touchscreen.tap(box.width / 2, box.height / 2);
        else await page.keyboard.press('Space');
        await page.waitForTimeout(800);
        r.fps = await fps(page, quick ? 2500 : 4000);
        await shot(page, path.join(out, `${sc.name}-play.png`));
        const min = sc.mobile ? budget.minFpsMobile : budget.minFpsDesktop;
        // A display runs at 60 Hz and one late frame reads as 59: allow 5 %.
        if (min && r.fps < min * 0.95) fail(`${sc.name}: ${r.fps} FPS < ${min} (budget.${sc.mobile ? 'minFpsMobile' : 'minFpsDesktop'})`);
        if (budget.timeToPlaySec && r.timeToPlayMs > budget.timeToPlaySec * 1000) fail(`${sc.name}: vào game sau ${(r.timeToPlayMs / 1000).toFixed(1)} s > ${budget.timeToPlaySec} s (budget.timeToPlaySec)`);
        if (sc.name === 'desktop') report.settings = await checkSettings(page, out);
      }
      for (const e of errors) fail(`${sc.name}: ${e}`);
      report.scenarios.push(r);
      await ctx.close();
    }
    if (report.settings && !report.settings.ok) fail(`Settings: ${report.settings.problem}`);
    for (const code of game.languages ?? ['en']) {
      const { ctx, page, errors } = await openPage(browser, SCENARIOS[0], `${srv.url}/index.html?lang=${encodeURIComponent(code)}`);
      const ready = await waitReady(page, 30000);
      const got = ready == null ? null : await page.evaluate(() => ({ code: window.GM_LANG?.code ?? null, dir: document.documentElement.dir || 'ltr' }));
      if (ready != null) await shot(page, path.join(out, `lang-${code}.png`));
      const l = { code, ok: ready != null && got?.code === code && !errors.length, got, errors };
      if (ready == null) fail(`lang ${code}: không vào được game`);
      else if (got.code !== code) fail(`lang ${code}: game chạy bằng ${got.code}`);
      for (const e of errors) fail(`lang ${code}: ${e}`);
      report.languages.push(l);
      await ctx.close();
    }
  } catch (e) {
    if (!browser) throw new GkError(`Không mở được Chromium: ${e.message.split('\n')[0]} — chạy: npx playwright install chromium (hoặc --browser <đường dẫn>)`);
    throw e;
  } finally {
    await browser?.close();
    srv.close();
  }
  writeJson(path.join(out, 'report.json'), report);
  return { report, out };
}

async function checkSettings(page, out) {
  const gear = page.locator('.gk-gear');
  if (!(await gear.count())) return { ok: false, problem: 'không có nút bánh răng .gk-gear' };
  await gear.first().click();
  await page.waitForTimeout(300);
  const footer = page.locator('.gk-settings-footer');
  const text = (await footer.count()) && (await footer.first().isVisible()) ? (await footer.first().textContent()).trim() : '';
  await page.screenshot({ path: path.join(out, 'settings.png') });
  const close = page.locator('.gk-settings-close');
  if (await close.count()) await close.first().click();
  return text ? { ok: true, footer: text } : { ok: false, problem: 'popup Settings không hiện footer bản quyền' };
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const builds = path.join(root, 'builds');
  const version = args.version ? String(args.version) : latestVersion(exists(builds) ? fs.readdirSync(builds) : []);
  if (!version) throw new GkError('Chưa có bản build — chạy gamekit pack');
  const portal = args.portal ?? 'dev-mock';
  log.info(`Smoke test builds/${version}/${portal} (Chromium${args.quick ? ', nhanh' : ', máy tính + điện thoại chậm 4× mạng 4G'})…`);
  const { report, out } = await smoke(root, { version, portal, quick: Boolean(args.quick), executablePath: args.browser });
  for (const s of report.scenarios)
    log.info(`  ${s.name.padEnd(16)} vào game ${s.timeToPlayMs == null ? '—' : `${(s.timeToPlayMs / 1000).toFixed(2)} s`} · ${s.fps ?? '—'} FPS · ${s.errors.length} lỗi`);
  log.info(`  ngôn ngữ: ${report.languages.map((l) => `${l.code}${l.ok ? '' : ' ✘'}${l.got?.dir === 'rtl' ? ' (rtl)' : ''}`).join(', ')}`);
  if (report.settings?.footer) log.info(`  Settings: footer "${report.settings.footer}"`);
  log.info(`  Ảnh chụp + report.json: ${toPosix(path.relative(root, out))}/`);
  if (report.failures.length) {
    for (const f of report.failures) log.fail(f);
    log.fail(`smoke: ${report.failures.length} lỗi`);
    return 1;
  }
  log.ok('smoke: đạt');
  return 0;
}
