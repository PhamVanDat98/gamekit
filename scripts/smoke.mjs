// gamekit smoke — open the dev-mock package in a headless browser: loading → game, no console or request errors,
// fits a desktop and a phone held both ways, Settings shows the copyright and switches language, time to play.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { exists } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame } from './lib/game.mjs';
import { latestVersion, VERSION_RE } from './lib/version.mjs';
import { loadPortal } from './lib/portals.mjs';

export const VIEWPORTS = [
  { id: 'desktop', label: 'máy tính 1280×720', viewport: { width: 1280, height: 720 } },
  { id: 'portrait', label: 'điện thoại dọc 390×844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { id: 'landscape', label: 'điện thoại ngang 844×390', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm',
};

/** Serve a package folder on 127.0.0.1 — the loader fetches framework.js and Language/, which file:// blocks. */
export function serveDir(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      rel = '';
    }
    let file = path.join(root, path.normalize(rel));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (exists(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!exists(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) }));
  });
}

const box = (r) => `${Math.round(r.width)}×${Math.round(r.height)} tại ${Math.round(r.left)},${Math.round(r.top)}`;

/**
 * Layout problems from what the page measured (pure, so it is tested without a browser):
 * { vw, vh, scrollW, scrollH, canvas: rect | null, gear: { ...rect, hit } | null }.
 */
export function layoutProblems(m) {
  if (!m.canvas) return ['không có canvas #game'];
  const out = [];
  const c = m.canvas;
  if (c.width < 1 || c.height < 1) out.push('canvas #game rộng hoặc cao 0');
  else if (c.left < -1 || c.top < -1 || c.right > m.vw + 1 || c.bottom > m.vh + 1) out.push(`canvas #game tràn màn hình (${box(c)}, màn ${m.vw}×${m.vh})`);
  if (m.scrollW > m.vw + 1 || m.scrollH > m.vh + 1) out.push(`trang cuộn được (${m.scrollW}×${m.scrollH}, màn ${m.vw}×${m.vh})`);
  if (!m.gear) out.push('không có nút Settings (.gk-gear)');
  else if (!m.gear.hit) out.push('nút Settings nằm ngoài màn hình hoặc bị che');
  return out;
}

/** Time to play from the loader's console line, else from navigation to the loading screen hiding. */
export const timeToPlay = (lines, fallbackMs) => Number(lines.map((l) => /game_started (\d+) ms/.exec(l)?.[1]).find(Boolean) ?? fallbackMs);

/** playwright-core from the game's node_modules — the plugin itself depends only on yaml and ajv. */
function loadPlaywright(root) {
  try {
    return createRequire(path.join(root, 'package.json'))('playwright-core');
  } catch {
    throw new GkError('Game thiếu playwright-core — chạy `npm i -D playwright-core` trong thư mục game');
  }
}

/** Chromium builds Playwright downloaded earlier (any version), newest first. */
function cachedChromiums() {
  const home = os.homedir();
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(home, '.cache', 'ms-playwright'),
    path.join(home, 'Library', 'Caches', 'ms-playwright'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'),
  ].filter(Boolean);
  const bins = [
    'chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ];
  const out = [];
  for (const root of roots) {
    if (!exists(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const d of dirs) for (const b of bins) if (exists(path.join(root, d, b))) out.push(path.join(root, d, b));
  }
  return out;
}

/** GK_CHROME, Playwright's own browser, an installed Chrome or Edge, then any Chromium Playwright cached. */
async function launch(chromium) {
  const tries = [process.env.GK_CHROME && { executablePath: process.env.GK_CHROME }, {}, { channel: 'chrome' }, { channel: 'msedge' }, ...cachedChromiums().map((executablePath) => ({ executablePath }))];
  let last;
  for (const opts of tries.filter(Boolean)) {
    try {
      return await chromium.launch({ headless: true, ...opts });
    } catch (e) {
      last = e;
    }
  }
  throw new GkError(`Không mở được trình duyệt (${String(last?.message ?? '').split('\n')[0]}). Cài một trong: \`npx playwright install chromium\`, Google Chrome, hoặc đặt GK_CHROME=<đường dẫn tới chrome>`);
}

const READY = () => document.getElementById('gmLoader')?.style.display === 'none';

/** Load the package in one viewport and check it; Settings and play run only where `opts` asks. */
async function checkViewport(browser, url, vp, { timeoutMs, shotsDir, play, language }) {
  const { id, label, ...contextOptions } = vp;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  const lines = [];
  const short = (u) => u.replace(url, '');
  const first = (s) => String(s).split('\n')[0];
  page.on('console', (m) => {
    if (m.type() !== 'error') lines.push(m.text());
    // "Failed to load resource" repeats a status the response handler already reports, with its URL.
    else if (!m.text().startsWith('Failed to load resource')) errors.push(`console: ${first(m.text())}`);
  });
  page.on('pageerror', (e) => errors.push(`lỗi JS: ${first(e.message)}`));
  // Mobile emulation reports streamed fetches the loader read to the end as ERR_ABORTED; a missing file is a 404 below.
  page.on('requestfailed', (r) => r.failure()?.errorText !== 'net::ERR_ABORTED' && errors.push(`tải lỗi: ${short(r.url())} (${r.failure()?.errorText ?? '?'})`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${short(r.url())}`));
  const result = { id, label, problems: [], warnings: [], ms: null };
  try {
    const t0 = Date.now();
    await page.goto(url);
    const ready = await page.waitForFunction(READY, null, { timeout: timeoutMs }).then(() => true, () => false);
    if (!ready) {
      result.problems.push(`màn loading không tắt sau ${timeoutMs / 1000}s (game chưa gọi GM_LOADER.ready)`);
      await page.screenshot({ path: path.join(shotsDir, `${id}.png`) });
      return result;
    }
    result.ms = timeToPlay(lines, Date.now() - t0);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      const gearEl = document.querySelector('.gk-gear');
      const gear = rect(gearEl);
      if (gear) gear.hit = gearEl.contains(document.elementFromPoint(gear.left + gear.width / 2, gear.top + gear.height / 2));
      const se = document.scrollingElement ?? document.documentElement;
      return { vw: innerWidth, vh: innerHeight, scrollW: se.scrollWidth, scrollH: se.scrollHeight, canvas: rect(document.getElementById('game')), gear };
    });
    result.problems.push(...layoutProblems(m));
    await page.screenshot({ path: path.join(shotsDir, `${id}.png`) });

    if (play && m.canvas) {
      // The template starts a round on click/tap/key; a game with its own menu may need more than this.
      await page.mouse.click(m.canvas.left + m.canvas.width / 2, m.canvas.top + m.canvas.height / 2);
      for (const key of ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key, { delay: 200 });
      await page.waitForTimeout(500);
      if (!lines.some((l) => l.includes('gameplayStart'))) result.warnings.push('bấm vào giữa màn hình và phím mũi tên/Space không thấy gameplayStart — chơi thử bằng tay');
      await page.screenshot({ path: path.join(shotsDir, `${id}-play.png`) });
    }

    if (m.gear?.hit) {
      await page.click('.gk-gear');
      const s = await page.evaluate(() => {
        const overlay = document.querySelector('.gk-settings');
        return {
          open: Boolean(overlay && !overlay.hidden),
          footer: document.querySelector('.gk-settings-footer')?.textContent?.trim() ?? '',
          copyright: window.GM_LOADER?.copyright ?? '',
          languages: (window.GM_LANG?.available ?? []).map((l) => l.code),
          current: window.GM_LANG?.code ?? null,
        };
      });
      if (!s.open) result.problems.push('bấm nút Settings không mở popup (.gk-settings)');
      else {
        await page.screenshot({ path: path.join(shotsDir, `${id}-settings.png`) });
        if (!s.footer) result.problems.push('popup Settings không có footer bản quyền (.gk-settings-footer)');
        else if (s.copyright && s.footer !== s.copyright) result.problems.push(`footer Settings "${s.footer}" khác bản quyền của portal "${s.copyright}"`);
        await page.keyboard.press('Escape');
        if (!(await page.evaluate(() => document.querySelector('.gk-settings')?.hidden))) result.problems.push('Escape không đóng popup Settings');
      }
      const other = s.languages.find((c) => c !== s.current);
      if (language && s.open && other) {
        await page.click('.gk-gear');
        await Promise.all([page.waitForEvent('load'), page.selectOption('.gk-settings select', other)]);
        const switched = await page.waitForFunction(READY, null, { timeout: timeoutMs }).then(() => true, () => false);
        const code = switched ? await page.evaluate(() => window.GM_LANG?.code) : null;
        if (code !== other) result.problems.push(`đổi ngôn ngữ sang ${other} trong Settings không có tác dụng (đang ${code ?? 'không vào lại được game'})`);
        else await page.screenshot({ path: path.join(shotsDir, `${id}-${other}.png`) });
      }
    }
  } catch (e) {
    result.problems.push(`không chạy hết kiểm tra: ${String(e.message).split('\n')[0]}`);
  } finally {
    result.problems.push(...[...new Set(errors)].slice(0, 5));
    await context.close();
  }
  return result;
}

/** Smoke-test builds/<version>/<portal>/ (default: latest build, dev-mock). */
export async function smokeGame(root, { version, portal = 'dev-mock' } = {}) {
  const game = loadGame(root);
  const buildsDir = path.join(root, 'builds');
  const v = version ? String(version) : latestVersion(exists(buildsDir) ? fs.readdirSync(buildsDir) : []);
  if (!v) throw new GkError('Chưa có bản build — chạy `gamekit pack` trước');
  if (!VERSION_RE.test(v)) throw new GkError(`--version phải là 8 chữ số YYMMDDNN, nhận "${v}"`);
  if (loadPortal(portal).config.sitelock?.length) throw new GkError(`Portal ${portal} có sitelock, không chạy được ở máy — smoke dùng dev-mock`);
  const dir = path.join(buildsDir, v, portal);
  if (!exists(path.join(dir, 'index.html'))) throw new GkError(`Không có builds/${v}/${portal}/index.html — \`gamekit pack\` (game.yaml cần portal ${portal})`);
  const { chromium } = loadPlaywright(root);
  const shotsDir = path.join(root, '.gamekit', 'local', 'smoke', v);
  fs.rmSync(shotsDir, { recursive: true, force: true });
  fs.mkdirSync(shotsDir, { recursive: true });
  const budgetMs = (game.budget?.timeToPlaySec ?? 5) * 1000;
  const timeoutMs = Math.max(15000, budgetMs * 3);

  const server = await serveDir(dir);
  const browser = await launch(chromium);
  try {
    const results = [];
    for (const vp of VIEWPORTS) results.push(await checkViewport(browser, server.url, vp, { timeoutMs, shotsDir, play: vp.id === 'desktop', language: vp.id === 'desktop' }));
    const slowest = Math.max(...results.map((r) => r.ms ?? 0));
    return { version: v, portal, results, budgetMs, slowest, shotsDir, ok: results.every((r) => !r.problems.length) && slowest <= budgetMs };
  } finally {
    await browser.close();
    await server.close();
  }
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  log.head('Smoke test gói dev-mock trong trình duyệt');
  const r = await smokeGame(root, { version: args.version, portal: args.portal });
  log.dim(`builds/${r.version}/${r.portal}`);
  for (const v of r.results) {
    const ms = v.ms == null ? '' : ` — vào game ${v.ms} ms`;
    if (!v.problems.length) log.ok(`${v.label}${ms}`);
    else log.fail(`${v.label}${ms}: ${v.problems.join('; ')}`);
    for (const w of v.warnings) log.warn(`${v.label}: ${w}`);
  }
  const within = r.slowest <= r.budgetMs;
  (within ? log.ok : log.fail)(`thời gian vào game ${r.slowest} ms (ngân sách ${r.budgetMs / 1000}s, đo ở máy nên mạng thật sẽ chậm hơn)`);
  log.dim(`Ảnh chụp: ${path.relative(root, r.shotsDir)}`);
  (r.ok ? log.ok : log.fail)(r.ok ? 'smoke: đạt' : 'smoke: chưa đạt');
  return r.ok ? 0 : 1;
}
