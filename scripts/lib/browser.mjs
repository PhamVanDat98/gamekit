// Headless browser for smoke/perf: playwright-core from the game's node_modules (the plugin depends only on
// yaml and ajv), a browser found on the machine, and a tiny static server for a built package.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { GkError } from './log.mjs';

export function loadPlaywright(root) {
  try {
    return createRequire(path.join(root, 'package.json'))('playwright-core');
  } catch {
    throw new GkError('Game chưa có playwright-core — chạy: npm install -D playwright-core');
  }
}

/** Newest chromium under PLAYWRIGHT_BROWSERS_PATH / ms-playwright cache, whatever playwright version put it there. */
export function cachedChromium(env = process.env, platform = process.platform) {
  const home = env.HOME || env.USERPROFILE || '';
  const roots = [
    env.PLAYWRIGHT_BROWSERS_PATH,
    platform === 'win32' ? path.join(env.LOCALAPPDATA || '', 'ms-playwright') : null,
    platform === 'darwin' ? path.join(home, 'Library', 'Caches', 'ms-playwright') : path.join(home, '.cache', 'ms-playwright'),
  ].filter((r) => r && r !== '0' && fs.existsSync(r));
  const exe = {
    linux: ['chrome-linux/chrome', 'chrome-linux64/chrome'],
    darwin: ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium'],
    win32: ['chrome-win/chrome.exe', 'chrome-win64/chrome.exe'],
  }[platform] ?? [];
  const found = [];
  for (const r of roots) {
    for (const d of fs.readdirSync(r)) {
      const m = /^chromium-(\d+)$/.exec(d);
      if (!m) continue;
      for (const e of exe) if (fs.existsSync(path.join(r, d, e))) found.push({ rev: Number(m[1]), file: path.join(r, d, e) });
    }
  }
  return found.sort((a, b) => b.rev - a.rev)[0]?.file ?? null;
}

/**
 * Launch chromium. Order: $GK_BROWSER → playwright's own browser → any cached playwright chromium →
 * installed Chrome → Edge. Most machines have one of the last two, so nothing needs downloading.
 */
export async function launchBrowser(playwright, env = process.env) {
  const { chromium } = playwright;
  const tries = [];
  if (env.GK_BROWSER) tries.push(['GK_BROWSER', { executablePath: env.GK_BROWSER }]);
  tries.push(['playwright', {}]);
  const cached = cachedChromium(env);
  if (cached) tries.push([cached, { executablePath: cached }]);
  tries.push(['chrome', { channel: 'chrome' }], ['msedge', { channel: 'msedge' }]);
  const errors = [];
  for (const [label, opts] of tries) {
    try {
      const browser = await chromium.launch({ headless: true, ...opts });
      return { browser, label };
    } catch (e) {
      errors.push(`${label}: ${String(e.message).split('\n')[0]}`);
      if (label === 'GK_BROWSER') break; // asked for that one explicitly
    }
  }
  throw new GkError(
    `Không mở được trình duyệt headless. Cài Chrome, hoặc chạy \`npx playwright-core install chromium\` trong thư mục game, hoặc đặt GK_BROWSER=<đường dẫn chrome>.\n  ${errors.join('\n  ')}`,
  );
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

/** Serve `dir` on 127.0.0.1 (random port). Resolves { url, close() }. Never serves outside dir. */
export function serveDir(dir) {
  const base = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = path.resolve(base, '.' + rel);
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
