// gamekit smoke — open the game in a headless browser the way a player would: desktop, phone portrait and
// landscape, every fake-ad mode, a throttled "weak phone". Screenshots go to .gamekit/smoke/ so an agent can
// look at them; layout, console errors, loading, frozen/blank screens and the perf budget are judged here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { exists, writeJson, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { PHASES } from './lib/phases.mjs';
import { latestVersion, nextVersion } from './lib/version.mjs';
import { loadPortal } from './lib/portals.mjs';
import { decodePng, dominantShare } from './lib/png.mjs';
import { launchBrowser, loadPlaywright, serveDir } from './lib/browser.mjs';
import { buildPortal } from './pack.mjs';

export const OUT_DIR = '.gamekit/smoke';

export const DEFAULT_SMOKE = {
  start: ['click 0.5 0.5'],
  keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'],
  playSec: 6,
  target: 'canvas',
  settings: '.gk-gear',
};

export const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 } },
  'mobile-portrait': { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  'mobile-landscape': { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
};

/** Lighthouse's "slow 4G, mid-range phone": 4× CPU slowdown, 1.6 Mbps down, 150 ms RTT. */
export const WEAK_PHONE = { cpuRate: 4, latency: 150, downKbps: 1600, upKbps: 750 };

export const SCENARIOS = [
  { id: 'desktop', device: 'desktop', settings: true, fps: 'minFpsDesktop' },
  { id: 'mobile-portrait', device: 'mobile-portrait' },
  { id: 'mobile-landscape', device: 'mobile-landscape' },
  { id: 'ad-fail', device: 'desktop', query: 'ad=fail', ad: true },
  { id: 'ad-skip', device: 'desktop', query: 'ad=skip', ad: true },
  { id: 'ad-slow', device: 'desktop', query: 'ad=slow', ad: true },
  { id: 'ad-none', device: 'desktop', query: 'ad=none', ad: true },
  { id: 'weak-phone', device: 'mobile-portrait', throttle: true, fps: 'minFpsMobile', timeToPlay: true, perf: true },
];

/** Headless rAF runs at the display rate (60), so a 60 fps budget is met at ~58–60; allow 10 %. */
export const FPS_SLACK = 0.9;
const BLANK_SHARE = 0.98;
const MIN_CANVAS_SHARE = 0.25;
const MIN_TAP_PX = 32;
const READY_TIMEOUT_MS = 30_000;
const THROTTLED_READY_TIMEOUT_MS = 90_000;
const STEP_MS = 250;
const AD_PLAY_SEC = 12;

/** "click 0.5 0.6" | "tap 0.5 0.6" (fractions of the game canvas) | "key Space" | "wait 500" */
export function parseStep(text) {
  const parts = String(text).trim().split(/\s+/);
  const [kind, a, b] = parts;
  const frac = (v) => v !== undefined && /^(0(\.\d+)?|1(\.0+)?)$/.test(v);
  if ((kind === 'click' || kind === 'tap') && parts.length === 3 && frac(a) && frac(b)) return { kind, x: Number(a), y: Number(b) };
  if (kind === 'key' && parts.length === 2 && /^[A-Za-z0-9+]+$/.test(a)) return { kind, key: a };
  if (kind === 'wait' && parts.length === 2 && /^\d+$/.test(a)) return { kind, ms: Number(a) };
  throw new GkError(`smoke.start: bước "${text}" không hợp lệ — dùng "click x y" / "tap x y" (0..1 theo canvas), "key <Code>", "wait <ms>"`);
}

export function smokeConfig(game) {
  const cfg = { ...DEFAULT_SMOKE, ...(game.smoke ?? {}) };
  return { ...cfg, start: cfg.start.map(parseStep) };
}

/** Small seeded PRNG so a smoke run presses the same keys every time. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs in the page before any script: time the loader's ready() and record animation frames. */
function probe() {
  const s = (window.__gkSmoke = { readyMs: null, frames: [], measuring: false });
  let loader;
  Object.defineProperty(window, 'GM_LOADER', {
    configurable: true,
    get: () => loader,
    set(v) {
      if (v && typeof v.ready === 'function') {
        const ready = v.ready;
        v.ready = function (...a) {
          if (s.readyMs === null) s.readyMs = performance.now();
          return ready.apply(this, a);
        };
      }
      loader = v;
    },
  });
  const tick = (t) => {
    if (s.measuring) s.frames.push(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Average and 5th-percentile fps from frame timestamps (ms). */
export function fpsStats(frames) {
  if (frames.length < 3) return null;
  const dts = [];
  for (let i = 1; i < frames.length; i++) dts.push(frames[i] - frames[i - 1]);
  const avg = ((frames.length - 1) * 1000) / (frames.at(-1) - frames[0]);
  const sorted = dts.map((d) => 1000 / Math.max(d, 0.001)).sort((a, b) => a - b);
  const p5 = sorted[Math.floor(sorted.length * 0.05)];
  return { avg: Math.round(avg * 10) / 10, p5: Math.round(p5 * 10) / 10, frames: frames.length };
}

async function measureLayout(page, cfg) {
  return page.evaluate(
    ({ target, settings }) => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const canvases = [...document.querySelectorAll(target)].map(box).filter((b) => b.w > 0 && b.h > 0);
      canvases.sort((a, b) => b.w * b.h - a.w * a.h);
      const se = document.scrollingElement || document.documentElement;
      return { iw: innerWidth, ih: innerHeight, sw: se.scrollWidth, sh: se.scrollHeight, canvas: canvases[0] ?? null, gear: box(document.querySelector(settings)) };
    },
    { target: cfg.target, settings: cfg.settings },
  );
}

const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

async function runScenario(browser, baseUrl, sc, cfg, outDir) {
  const device = DEVICES[sc.device];
  const ctx = await browser.newContext({ ...device });
  const page = await ctx.newPage();
  const r = { id: sc.id, device: sc.device, url: null, errors: [], platform: [], shots: [], readyMs: null, fps: null, heapMB: null, layout: null, hashes: [] };
  const origin = new URL(baseUrl).origin;
  const short = (u) => u.replace(origin, '');
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') r.errors.push(`console.error: ${short(t).slice(0, 300)}`);
    const dm = /^\[dev-mock\] (.*)$/.exec(t);
    if (dm) r.platform.push(dm[1]);
  });
  page.on('pageerror', (e) => r.errors.push(`lỗi JS: ${String(e.message).slice(0, 300)}`));
  const pending = [];
  page.on('requestfailed', (q) => {
    const why = q.failure()?.errorText ?? '?';
    // The loader streams framework.js with a reader; chromium may flag it ERR_ABORTED after the full 200 body arrived.
    const check = why.includes('ERR_ABORTED') ? q.response().catch(() => null) : Promise.resolve(null);
    pending.push(check.then((res) => !res?.ok() && r.errors.push(`tải lỗi: ${short(q.url())} (${why})`)));
  });
  page.on('response', (q) => q.status() >= 400 && r.errors.push(`HTTP ${q.status()}: ${short(q.url())}`));
  await page.addInitScript(probe);
  if (sc.throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: WEAK_PHONE.cpuRate });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: WEAK_PHONE.latency,
      downloadThroughput: (WEAK_PHONE.downKbps * 1024) / 8,
      uploadThroughput: (WEAK_PHONE.upKbps * 1024) / 8,
    });
  }
  const shot = async (name, opts = {}) => {
    const file = path.join(outDir, `${sc.id}${name ? `-${name}` : ''}.png`);
    const buf = await page.screenshot({ path: file, ...opts });
    r.shots.push(file);
    return buf;
  };
  try {
    r.url = `${baseUrl}index.html${sc.query ? `?${sc.query}` : ''}`;
    await page.goto(r.url, { waitUntil: 'load', timeout: sc.throttle ? THROTTLED_READY_TIMEOUT_MS : READY_TIMEOUT_MS });
    try {
      await page.waitForFunction(() => window.__gkSmoke.readyMs !== null, null, { timeout: sc.throttle ? THROTTLED_READY_TIMEOUT_MS : READY_TIMEOUT_MS });
    } catch {
      await shot('stuck');
      r.stuck = true;
      return r;
    }
    r.readyMs = Math.round(await page.evaluate(() => window.__gkSmoke.readyMs));
    await page.waitForTimeout(300);
    const readyBuf = await shot('ready');
    const img = decodePng(readyBuf);
    r.blank = img ? dominantShare(img) : null;
    r.layout = await measureLayout(page, cfg);
    const c = r.layout.canvas;
    const clip = c && { x: Math.max(0, c.x), y: Math.max(0, c.y), width: Math.max(1, Math.min(c.w, r.layout.iw - Math.max(0, c.x))), height: Math.max(1, Math.min(c.h, r.layout.ih - Math.max(0, c.y))) };
    r.hashes.push(sha(readyBuf));
    if (!c) return r;

    const point = (fx, fy) => ({ x: c.x + fx * c.w, y: c.y + fy * c.h });
    const hitGear = (p) => r.layout.gear && p.x >= r.layout.gear.x - 8 && p.x <= r.layout.gear.x + r.layout.gear.w + 8 && p.y >= r.layout.gear.y - 8 && p.y <= r.layout.gear.y + r.layout.gear.h + 8;
    const press = async (p) => (device.hasTouch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
    for (const step of cfg.start) {
      if (step.kind === 'wait') await page.waitForTimeout(step.ms);
      else if (step.kind === 'key') await page.keyboard.press(step.key);
      else await press(point(step.x, step.y));
    }
    await page.waitForTimeout(200);
    r.hashes.push(sha(await page.screenshot({ clip })));

    // Play: random keys and taps from a fixed seed, recording frames the whole time.
    const rand = mulberry32(0x5eed ^ sc.id.length);
    await page.evaluate(() => (window.__gkSmoke.measuring = true));
    // Ads only come between rounds: ad scenarios play longer so a round ends and the next one starts.
    const until = Date.now() + (sc.ad ? Math.max(cfg.playSec * 2, AD_PLAY_SEC) : cfg.playSec) * 1000;
    while (Date.now() < until) {
      if (cfg.keys.length && rand() < 0.6) {
        const key = cfg.keys[Math.floor(rand() * cfg.keys.length)];
        await page.keyboard.down(key);
        await page.waitForTimeout(100 + Math.floor(rand() * 300));
        await page.keyboard.up(key);
      } else {
        const p = point(0.1 + rand() * 0.8, 0.1 + rand() * 0.8);
        if (!hitGear(p)) await press(p);
        await page.waitForTimeout(STEP_MS);
      }
    }
    const probeData = await page.evaluate(() => {
      const s = window.__gkSmoke;
      s.measuring = false;
      return { frames: s.frames, heap: performance.memory ? performance.memory.usedJSHeapSize : null };
    });
    r.fps = fpsStats(probeData.frames);
    r.heapMB = probeData.heap ? Math.round(probeData.heap / 1048576) : null;
    r.hashes.push(sha(await page.screenshot({ clip })));
    await shot('');

    if (sc.settings) r.settings = await checkSettings(page, cfg, shot);
  } catch (e) {
    r.errors.push(`smoke: ${String(e.message).split('\n')[0]}`);
  } finally {
    await Promise.all(pending);
    await ctx.close();
  }
  return r;
}

/** Gear → popup with the portal copyright footer → close; switch language when there is more than one. */
async function checkSettings(page, cfg, shot) {
  const out = { found: false };
  const gear = page.locator(cfg.settings).first();
  if (!(await gear.count()) || !(await gear.isVisible())) return out;
  out.found = true;
  await gear.click();
  await page.waitForTimeout(200);
  await shot('settings');
  const info = await page.evaluate(() => {
    const f = document.querySelector('.gk-settings-footer');
    const sel = document.querySelector('.gk-settings select');
    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    return {
      footer: f ? f.textContent.trim() : null,
      footerVisible: visible(f),
      copyright: window.GM_LOADER?.copyright ?? null,
      languages: sel && !sel.closest('[hidden]') ? [...sel.options].map((o) => o.value) : [],
      current: window.GM_LANG?.code ?? null,
    };
  });
  Object.assign(out, info);
  const other = info.languages.find((l) => l !== info.current);
  if (other) {
    await Promise.all([page.waitForEvent('load', { timeout: READY_TIMEOUT_MS }), page.selectOption('.gk-settings select', other)]);
    await page.waitForFunction(() => window.GM_LANG && window.__gkSmoke.readyMs !== null, null, { timeout: READY_TIMEOUT_MS });
    out.switchedTo = other;
    out.languageAfter = await page.evaluate(() => window.GM_LANG.code);
    await page.waitForTimeout(200);
    await shot(`lang-${other}`);
  } else {
    await page.keyboard.press('Escape');
  }
  return out;
}

/**
 * Turn raw scenario results into problems. Pure, so it is unit-tested without a browser.
 * cat "perf" = budget misses (gate item {auto: perf}); everything else is "smoke".
 */
export function judge(results, game) {
  const issues = [];
  const add = (level, cat, where, msg) => issues.push({ level, cat, where, msg });
  const budget = game.budget ?? {};
  const fromP4 = PHASES.indexOf(game.phase) >= PHASES.indexOf('P4') || game.phase === 'released';
  for (const r of results) {
    const w = r.id;
    for (const e of [...new Set(r.errors)]) add('error', 'smoke', w, e);
    if (r.stuck) {
      add('error', 'smoke', w, 'màn loading không tắt — game phải gọi window.GM_LOADER.ready() khi khung hình đầu tiên lên');
      continue;
    }
    const L = r.layout;
    if (!L) continue;
    if (L.sw > L.iw + 1 || L.sh > L.ih + 1) add('error', 'smoke', w, `trang cuộn được (${L.sw}×${L.sh} trong khung ${L.iw}×${L.ih}) — game phải vừa khung, không có thanh cuộn`);
    if (!L.canvas) add('error', 'smoke', w, 'không thấy canvas của game (smoke.target)');
    else {
      const c = L.canvas;
      if (c.x < -1 || c.y < -1 || c.x + c.w > L.iw + 1 || c.y + c.h > L.ih + 1)
        add('error', 'smoke', w, `canvas tràn khỏi màn hình (${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.w)}×${Math.round(c.h)} trong ${L.iw}×${L.ih})`);
      const share = (c.w * c.h) / (L.iw * L.ih);
      if (share < MIN_CANVAS_SHARE) add('warn', 'smoke', w, `canvas chỉ chiếm ${Math.round(share * 100)}% màn hình — xem lại bố cục cho ${r.device}`);
    }
    if (L.gear && (L.gear.w < MIN_TAP_PX || L.gear.h < MIN_TAP_PX) && r.device !== 'desktop')
      add('warn', 'smoke', w, `nút Settings ${Math.round(L.gear.w)}×${Math.round(L.gear.h)}px — nhỏ để chạm (nên ≥ 44px)`);
    if (r.blank !== null && r.blank !== undefined && r.blank > BLANK_SHARE) add('error', 'smoke', w, `màn hình gần như một màu (${Math.round(r.blank * 100)}%) sau khi tải xong — game có vẽ gì không?`);
    if (r.hashes.length >= 3 && new Set(r.hashes).size === 1)
      add('error', 'smoke', w, 'hình không đổi suốt lúc chơi — game có nhận input không? (xem smoke.start, smoke.keys trong game.yaml)');
    if (r.settings) {
      if (!r.settings.found) add('warn', 'smoke', w, 'không thấy nút Settings (smoke.settings) — portal cần popup có footer bản quyền');
      else {
        if (!r.settings.footerVisible) add('error', 'smoke', w, 'popup Settings không hiện footer bản quyền (.gk-settings-footer)');
        else if (r.settings.copyright && r.settings.footer !== r.settings.copyright) add('error', 'smoke', w, `footer Settings "${r.settings.footer}" khác bản quyền của portal "${r.settings.copyright}"`);
        if (r.settings.switchedTo && r.settings.languageAfter !== r.settings.switchedTo)
          add('error', 'smoke', w, `đổi ngôn ngữ sang ${r.settings.switchedTo} nhưng game vẫn chạy ${r.settings.languageAfter}`);
      }
    }
    const calls = (name) => r.platform.filter((l) => l === name || l.startsWith(`${name} `)).length;
    if (r.id === 'desktop') {
      for (const ev of ['loadingEnd', 'gameplayStart']) {
        if (!calls(ev)) add(fromP4 ? 'error' : 'warn', 'smoke', w, `không thấy platform.${ev}() — portal cần sự kiện này (gate P4)`);
      }
    }
    const sc = SCENARIOS.find((s) => s.id === r.id);
    if (sc?.fps && r.fps && budget[sc.fps]) {
      if (r.fps.avg < budget[sc.fps] * FPS_SLACK) add('error', 'perf', w, `FPS trung bình ${r.fps.avg} < ngân sách ${budget[sc.fps]} (budget.${sc.fps})`);
      else if (r.fps.p5 < budget[sc.fps] / 2) add('warn', 'perf', w, `FPS thấp nhất (p5) ${r.fps.p5} — giật khung, dưới nửa ngân sách ${budget[sc.fps]}`);
    }
    if (sc?.timeToPlay && budget.timeToPlaySec && r.readyMs !== null && r.readyMs / 1000 > budget.timeToPlaySec)
      add('error', 'perf', w, `vào game sau ${(r.readyMs / 1000).toFixed(1)}s trên máy yếu > ngân sách ${budget.timeToPlaySec}s (budget.timeToPlaySec)`);
  }
  for (const r of results) {
    // ad=none: the platform never calls the SDK, so a second round starting is the proof an ad slot was passed.
    const exercised = r.id === 'ad-none' ? r.platform.filter((l) => l === 'gameplayStart').length >= 2 : r.platform.some((l) => l.startsWith('showAd '));
    if (SCENARIOS.find((s) => s.id === r.id)?.ad && !r.stuck && !exercised)
      add('warn', 'smoke', r.id, 'không gặp quảng cáo nào trong lúc chơi — chế độ ad này chưa được kiểm; tăng smoke.playSec hoặc thêm bước vào smoke.start');
  }
  return issues;
}

function pickScenarios(args) {
  if (args.quick) return SCENARIOS.filter((s) => s.id === 'desktop');
  let list = SCENARIOS;
  if (args.only) {
    const want = String(args.only).split(',').map((s) => s.trim());
    for (const id of want) if (!SCENARIOS.some((s) => s.id === id)) throw new GkError(`--only: không có kịch bản "${id}" (có: ${SCENARIOS.map((s) => s.id).join(', ')})`);
    list = SCENARIOS.filter((s) => want.includes(s.id));
  }
  if (args['no-perf']) list = list.filter((s) => !s.perf);
  return list;
}

/** Build (or reuse builds/<V>/dev-mock), run the scenarios, judge. Returns { ok, perfOk, issues, report }. */
export async function smokeForGame(root, args = {}) {
  const game = loadGame(root);
  const cfg = smokeConfig(game);
  const scenarios = pickScenarios(args);
  const outDir = path.join(root, OUT_DIR);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  let pkgDir;
  let built;
  if (args.version) {
    const v = args.version === true ? latestVersion(exists(path.join(root, 'builds')) ? fs.readdirSync(path.join(root, 'builds')) : []) : String(args.version);
    pkgDir = v && path.join(root, 'builds', v, 'dev-mock');
    if (!pkgDir || !exists(pkgDir)) throw new GkError(`Không có builds/${v ?? '<bản nào>'}/dev-mock — chạy gamekit pack --portal dev-mock trước`);
    built = `builds/${v}/dev-mock`;
  } else {
    if (!args.quiet) log.dim('Dựng bản dev-mock từ source hiện tại…');
    const version = `${nextVersion([]).slice(0, 6)}00`; // never collides with a pack number (01–99)
    pkgDir = path.join(outDir, 'build', 'dev-mock');
    await buildPortal({ root, game, kit: loadPortal('dev-mock'), version, buildId: `${version}+smoke`, outDir: pkgDir, quiet: true });
    built = 'source';
  }

  const playwright = loadPlaywright(root);
  const { browser, label } = await launchBrowser(playwright);
  const server = await serveDir(pkgDir);
  const results = [];
  try {
    // Measured scenarios run alone; the fake-ad ones only look for errors, so they share the CPU.
    for (const sc of scenarios.filter((s) => !s.ad)) {
      if (!args.quiet) log.dim(`  ${sc.id}…`);
      results.push(await runScenario(browser, server.url, sc, cfg, outDir));
    }
    const ads = scenarios.filter((s) => s.ad);
    if (ads.length && !args.quiet) log.dim(`  ${ads.map((s) => s.id).join(', ')}…`);
    results.push(...(await Promise.all(ads.map((sc) => runScenario(browser, server.url, sc, cfg, outDir)))));
  } finally {
    await server.close();
    await browser.close();
  }
  const issues = judge(results, game);
  const rel = (f) => toPosix(path.relative(root, f));
  const report = {
    at: nowIso(),
    build: built,
    browser: label,
    budget: game.budget ?? {},
    weakPhone: WEAK_PHONE,
    scenarios: results.map(({ hashes, ...r }) => ({ ...r, shots: r.shots.map(rel) })),
    issues,
  };
  const ok = !issues.some((i) => i.level === 'error' && i.cat === 'smoke');
  const perfOk = !issues.some((i) => i.level === 'error' && i.cat === 'perf');
  report.ok = ok;
  report.perfOk = perfOk;
  writeJson(path.join(outDir, 'report.json'), report);
  return { ok, perfOk, issues, report };
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const res = await smokeForGame(root, { ...args, quiet: args.quiet || args.json });
  if (args.json) {
    process.stdout.write(JSON.stringify(res.report, null, 2) + '\n');
    return res.ok && res.perfOk ? 0 : 1;
  }
  log.head(`Smoke ${res.report.build} (${res.report.browser})`);
  for (const s of res.report.scenarios) {
    const bits = [];
    if (s.readyMs !== null) bits.push(`vào game ${(s.readyMs / 1000).toFixed(2)}s`);
    if (s.fps) bits.push(`FPS ${s.fps.avg} (p5 ${s.fps.p5})`);
    if (s.heapMB !== null) bits.push(`heap ${s.heapMB}MB`);
    const ads = s.platform.filter((l) => l.startsWith('showAd ')).length;
    if (ads) bits.push(`${ads} quảng cáo`);
    const bad = res.issues.some((i) => i.where === s.id && i.level === 'error');
    (bad ? log.fail : log.ok)(`${s.id}: ${bits.join(' · ') || 'không chạy được'}`);
  }
  for (const i of res.issues) (i.level === 'error' ? log.fail : log.warn)(`${i.where}: ${i.msg}`);
  log.info(`\nẢnh chụp (mở ra xem — đây là thứ người chơi thấy):`);
  for (const s of res.report.scenarios) for (const f of s.shots) log.info(`  ${f}`);
  log.dim(`Báo cáo: ${OUT_DIR}/report.json`);
  if (!res.ok) log.fail('Smoke: chưa đạt');
  else log.ok('Smoke: đạt');
  if (!res.perfOk) log.fail('Hiệu năng: vượt ngân sách');
  return res.ok && res.perfOk ? 0 : 1;
}
