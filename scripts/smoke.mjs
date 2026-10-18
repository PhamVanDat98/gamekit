// gamekit smoke [--version V] [--json] — open the dev-mock package of a build in headless Chromium on
// desktop and phone sizes (portrait, landscape; phone CPU slowed 4×), and check it against the budget in
// game.yaml: time until the game is ready, entering gameplay, frame rate, console errors, failed requests.
// Screenshots and report.json go to builds/<V>/smoke/. Needs Playwright (optional, not a GameKit dependency).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { exists, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame } from './lib/game.mjs';

const PROFILES = [
  { id: 'desktop', label: 'máy tính 1280×720', viewport: { width: 1280, height: 720 }, mobile: false, cpu: 1, fpsKey: 'minFpsDesktop' },
  { id: 'mobile-portrait', label: 'điện thoại dọc 390×844, CPU chậm 4×', viewport: { width: 390, height: 844 }, mobile: true, cpu: 4, fpsKey: 'minFpsMobile' },
  { id: 'mobile-landscape', label: 'điện thoại ngang 844×390, CPU chậm 4×', viewport: { width: 844, height: 390 }, mobile: true, cpu: 4, fpsKey: 'minFpsMobile' },
];
const FPS_MS = 3000;
const START_WAIT_MS = 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };

/** Playwright from the game's node_modules, else a global install; null when there is none. */
export function loadPlaywright(root) {
  const req = createRequire(path.join(root, 'package.json'));
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return req(name);
    } catch {
      /* try the next one */
    }
  }
  const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
  const globalRoot = g.stdout?.trim();
  if (globalRoot) for (const name of ['playwright', 'playwright-core']) {
    try {
      return createRequire(path.join(globalRoot, 'noop.js'))(name);
    } catch {
      /* not installed globally */
    }
  }
  return null;
}

function latestVersion(root) {
  const dir = path.join(root, 'builds');
  if (!exists(dir)) return null;
  const vs = fs.readdirSync(dir).filter((v) => /^\d{8}$/.test(v) && exists(path.join(dir, v, 'dev-mock', v, 'index.html'))).sort();
  return vs.at(-1) ?? null;
}

function serve(dir) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dir, url);
    if (!file.startsWith(dir + path.sep) || !exists(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** One profile: what happened when loading and starting the game. */
async function runProfile(browser, profile, url, shotFile, readyTimeoutMs) {
  const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.mobile, hasTouch: profile.mobile, deviceScaleFactor: profile.mobile ? 2 : 1 });
  const page = await context.newPage();
  const r = { profile: profile.id, label: profile.label, readyMs: null, playable: false, fps: null, errors: [], failed: [], bytes: 0, settings: null };
  const seen = new Map();
  const t0 = Date.now();
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error') r.errors.push(text.slice(0, 300));
    for (const key of ['loadingEnd', 'gameplayStart']) if (text.includes(`[dev-mock] ${key}`) && !seen.has(key)) seen.set(key, Date.now());
  });
  page.on('pageerror', (e) => r.errors.push(String(e.message ?? e).slice(0, 300)));
  page.on('requestfailed', (q) => r.failed.push(`${q.url().replace(/^https?:\/\/[^/]+/, '')} (${q.failure()?.errorText ?? 'lỗi'})`));
  page.on('response', (s) => {
    if (s.status() >= 400) r.failed.push(`${s.url().replace(/^https?:\/\/[^/]+/, '')} (${s.status()})`);
  });
  page.on('requestfinished', async (q) => {
    try {
      r.bytes += (await q.sizes()).responseBodySize;
    } catch {
      /* page closed */
    }
  });
  try {
    if (profile.cpu > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: readyTimeoutMs });
    const deadline = t0 + readyTimeoutMs;
    while (!seen.has('loadingEnd') && Date.now() < deadline) await page.waitForTimeout(50);
    if (seen.has('loadingEnd')) r.readyMs = seen.get('loadingEnd') - t0;
    if (r.readyMs != null) {
      // Same ways a player starts: key on desktop, tap on phones; then a click as a fallback.
      const tries = profile.mobile
        ? [() => page.touchscreen.tap(profile.viewport.width / 2, profile.viewport.height / 2), () => page.mouse.click(profile.viewport.width / 2, profile.viewport.height / 2)]
        : [() => page.keyboard.press('Space'), () => page.keyboard.press('Enter'), () => page.mouse.click(profile.viewport.width / 2, profile.viewport.height / 2)];
      for (const t of tries) {
        await t();
        const until = Date.now() + START_WAIT_MS;
        while (!seen.has('gameplayStart') && Date.now() < until) await page.waitForTimeout(50);
        if (seen.has('gameplayStart')) break;
      }
      r.playable = seen.has('gameplayStart');
      r.fps = await page.evaluate(
        (ms) =>
          new Promise((resolve) => {
            let frames = 0;
            let start = null;
            const tick = (t) => {
              if (start === null) start = t;
              else frames++;
              if (t - start < ms) requestAnimationFrame(tick);
              else resolve(Math.round((frames * 10000) / (t - start)) / 10);
            };
            requestAnimationFrame(tick);
          }),
        FPS_MS,
      );
      await page.screenshot({ path: shotFile });
      if (!profile.mobile) r.settings = await checkSettings(page);
    }
  } catch (e) {
    r.errors.push(`smoke: ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return r;
}

/** The Settings popup opens from the gear and keeps the copyright footer (portal requirement). */
async function checkSettings(page) {
  const gear = await page.$('.gk-gear');
  if (!gear) return 'không thấy nút Settings (.gk-gear)';
  await gear.click();
  try {
    await page.waitForSelector('.gk-settings-footer', { state: 'visible', timeout: 2000 });
  } catch {
    return 'mở Settings nhưng không thấy footer bản quyền (.gk-settings-footer)';
  }
  await page.keyboard.press('Escape');
  return 'ok';
}

/** Pass/fail of each result against the budget: [{ profile, checks: [{ name, ok, detail }] }]. */
export function judgeSmoke(budget, results) {
  return results.map((r) => {
    const minFps = budget[PROFILES.find((p) => p.id === r.profile)?.fpsKey] ?? null;
    const limitMs = (budget.timeToPlaySec ?? 5) * 1000;
    const checks = [
      { name: 'vào được game', ok: r.readyMs != null, detail: r.readyMs == null ? 'không thấy loadingEnd từ dev-mock' : '' },
      { name: 'thời gian vào game', ok: r.readyMs != null && r.readyMs <= limitMs, detail: r.readyMs == null ? '' : `${(r.readyMs / 1000).toFixed(2)} s / ngân sách ${limitMs / 1000} s` },
      { name: 'bắt đầu chơi bằng phím/chạm', ok: r.playable, detail: r.playable ? '' : 'không thấy gameplayStart sau Space/Enter/chạm/nhấp' },
      { name: 'FPS', ok: r.fps != null && (minFps == null || r.fps >= minFps * 0.9), detail: r.fps == null ? '' : `${r.fps} / tối thiểu ${minFps ?? '?'}` },
      { name: 'không lỗi console', ok: !r.errors.length, detail: r.errors.slice(0, 3).join(' | ') },
      { name: 'không request hỏng', ok: !r.failed.length, detail: r.failed.slice(0, 3).join(', ') },
    ];
    if (r.settings != null) checks.push({ name: 'Settings + footer bản quyền', ok: r.settings === 'ok', detail: r.settings === 'ok' ? '' : r.settings });
    return { profile: r.profile, label: r.label, checks };
  });
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const version = args.version ? String(args.version) : latestVersion(root);
  if (!version || !exists(path.join(root, 'builds', version, 'dev-mock', version, 'index.html')))
    throw new GkError(args.version ? `Không có builds/${version}/dev-mock — đóng gói lại có dev-mock` : 'Chưa có bản build — chạy `gamekit pack` trước');
  const pw = loadPlaywright(root);
  if (!pw?.chromium)
    throw new GkError('Cần Playwright để chạy smoke: `npm i -D playwright-core` trong thư mục game rồi `npx playwright install chromium` (hoặc cài playwright toàn cục)');
  const buildsDir = path.join(root, 'builds');
  const shotDir = path.join(buildsDir, version, 'smoke');
  fs.mkdirSync(shotDir, { recursive: true });
  const server = await serve(buildsDir);
  const url = `http://127.0.0.1:${server.address().port}/${version}/dev-mock/${version}/index.html`;
  const budget = game.budget ?? {};
  const readyTimeoutMs = Math.max(20000, (budget.timeToPlaySec ?? 5) * 3000);
  let browser;
  const results = [];
  try {
    browser = await pw.chromium.launch();
    for (const p of PROFILES) results.push(await runProfile(browser, p, url, path.join(shotDir, `${p.id}.png`), readyTimeoutMs));
  } catch (e) {
    throw new GkError(`Không chạy được Chromium: ${e.message.split('\n')[0]} — \`npx playwright install chromium\``);
  } finally {
    await browser?.close();
    server.close();
  }
  const verdict = judgeSmoke(budget, results);
  const ok = verdict.every((v) => v.checks.every((c) => c.ok));
  const manifest = path.join(buildsDir, version, 'manifest.json');
  const initialBytes = exists(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).portals?.['dev-mock']?.initialBytes : null;
  writeJson(path.join(shotDir, 'report.json'), { version, url: url.replace(/:\d+/, ''), budget, initialBytes, results, verdict, ok });
  if (args.json) log.info(JSON.stringify({ version, results, verdict, ok }, null, 2));
  else {
    log.head(`Smoke bản ${version} (dev-mock, Chromium headless)`);
    for (const v of verdict) {
      const r = results.find((x) => x.profile === v.profile);
      log.info(`\n${v.label} — tải ${(r.bytes / 1048576).toFixed(2)} MB`);
      for (const c of v.checks) (c.ok ? log.ok : log.fail)(`${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    }
    log.dim(`\nẢnh chụp + report.json: builds/${version}/smoke/. Headless chỉ là ước lượng; vẫn thử trên điện thoại thật.`);
  }
  return ok ? 0 : 1;
}
