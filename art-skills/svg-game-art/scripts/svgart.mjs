#!/usr/bin/env node
// svgart — kiểm style, render PNG trong suốt, ghép strip anim, contact sheet cho art SVG của game.
// Node ≥ 20, không phụ thuộc gói nào; render bằng Chromium/Chrome/Edge có sẵn trên máy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STYLES_DIR = path.join(HERE, '..', 'styles');

const HELP = `svgart — art SVG cho game

  styles                                   Liệt kê style có sẵn
  lint <file.svg…> --style <tên|style.json>  Kiểm SVG theo luật của style
  render <file.svg…> --out <file.png> --size <W>x<H>
                                           Render PNG nền trong suốt; nhiều file = strip ngang (mỗi frame W×H)
  sheet <file.svg…> --out <file.png> [--sizes 32,64,128]
                                           Contact sheet nền sáng/tối để tự xem lại

Biến môi trường CHROME_PATH: đường dẫn Chromium/Chrome/Edge nếu không tự tìm thấy.`;

class UserError extends Error {}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

// ---------- styles ----------
export function listStyles() {
  return fs
    .readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(STYLES_DIR, f), 'utf8')));
}

export function loadStyle(ref) {
  if (!ref || ref === true) throw new UserError('Cần --style <tên> hoặc --style <đường dẫn style.json> (xem: svgart styles)');
  const file = ref.endsWith('.json') ? path.resolve(ref) : path.join(STYLES_DIR, `${ref}.json`);
  if (!fs.existsSync(file)) throw new UserError(`Không có style "${ref}". Có: ${listStyles().map((s) => s.name).join(', ')}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---------- lint ----------
const ALWAYS_FORBIDDEN = ['image', 'text', 'foreignObject', 'script', 'pattern', 'style'];
const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color'];

const normHex = (c) => {
  const v = c.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
};

/** Every color/width/element the SVG uses, read with regexes (enough for hand-written SVG). */
function scan(svg) {
  const colors = [];
  const widths = [];
  for (const attr of COLOR_ATTRS) {
    for (const m of svg.matchAll(new RegExp(`[\\s"']${attr}\\s*=\\s*["']([^"']+)["']`, 'g'))) colors.push(m[1]);
    for (const m of svg.matchAll(new RegExp(`[;"'\\s]${attr}\\s*:\\s*([^;"']+)`, 'g'))) colors.push(m[1]);
  }
  for (const m of svg.matchAll(/stroke-width\s*[=:]\s*["']?([0-9.]+)/g)) widths.push(Number(m[1]));
  const elements = [...svg.matchAll(/<([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
  return { colors, widths, elements };
}

/** Problems (Vietnamese) for one SVG against a style. Empty array = passes. */
export function lintSvg(source, style) {
  const errs = [];
  const svg = source.replace(/<!--[\s\S]*?-->/g, '');
  const root = svg.match(/<svg\b[^>]*>/);
  if (!root) return ['không phải SVG (thiếu thẻ <svg>)'];
  const vb = root[0].match(/viewBox\s*=\s*["']([^"']+)["']/);
  if (!vb) errs.push('thẻ <svg> thiếu viewBox');
  else if (style.viewBox && vb[1].trim().split(/[\s,]+/).join(' ') !== style.viewBox)
    errs.push(`viewBox phải là "${style.viewBox}" (đang là "${vb[1]}") để mọi asset cùng thang`);

  const { colors, widths, elements } = scan(svg);
  const allow = style.allow ?? {};
  const forbidden = [...ALWAYS_FORBIDDEN];
  if (!allow.gradient) forbidden.push('linearGradient', 'radialGradient');
  if (!allow.filter) forbidden.push('filter');
  for (const el of new Set(elements)) if (forbidden.includes(el)) errs.push(`không dùng <${el}> trong style ${style.name}`);
  if (allow.filter) {
    const fe = new Set(elements.filter((e) => e.startsWith('fe')));
    for (const e of fe) if (!(allow.filter === true || allow.filter.includes(e))) errs.push(`filter chỉ được dùng ${allow.filter.join(', ')}; có <${e}>`);
  }
  if (!allow.opacity && /\b(fill-)?opacity\s*[=:]\s*["']?0?\.\d/.test(svg)) errs.push(`style ${style.name} không dùng độ trong suốt (opacity) — tô màu đặc`);

  const palette = new Set([...Object.values(style.colors), ...(style.ink ? [style.ink] : [])].map(normHex));
  const bad = new Set();
  for (const c of colors) {
    const v = normHex(c);
    if (['none', 'transparent', 'currentcolor', 'inherit'].includes(v) || v.startsWith('url(')) continue;
    if (!palette.has(v)) bad.add(c.trim());
  }
  if (bad.size) errs.push(`màu ngoài palette ${style.name}: ${[...bad].join(', ')} — chỉ dùng: ${[...palette].join(' ')}`);

  if (style.stroke) {
    const ok = Object.values(style.stroke);
    const off = [...new Set(widths)].filter((w) => !ok.some((o) => Math.abs(o - w) < 1e-6));
    if (off.length) errs.push(`stroke-width ${off.join(', ')} không thuộc style (${Object.entries(style.stroke).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    if (widths.length && style.roundJoins !== false && !/stroke-linejoin\s*[=:]\s*["']?round/.test(svg))
      errs.push('nét vẽ cần stroke-linejoin="round" (đặt một lần trên <g> hoặc <svg>)');
  } else if (widths.length && !allow.stroke) errs.push(`style ${style.name} không có nét viền — bỏ stroke`);
  return errs;
}

// ---------- chromium ----------
export function findChrome() {
  if (process.env.CHROME_PATH) return fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  const home = os.homedir();
  const globDir = (dir, re, tail) => {
    try {
      return fs
        .readdirSync(dir)
        .filter((d) => re.test(d))
        .sort()
        .reverse()
        .map((d) => path.join(dir, d, ...tail));
    } catch {
      return [];
    }
  };
  const pw = [];
  const linuxPw = (dir) => [...globDir(dir, /^chromium-\d+$/, ['chrome-linux', 'chrome']), ...globDir(dir, /^chromium-\d+$/, ['chrome-linux64', 'chrome'])];
  pw.push(...linuxPw('/opt/pw-browsers'), ...linuxPw(path.join(home, '.cache', 'ms-playwright')));
  pw.push(...globDir(path.join(home, 'Library', 'Caches', 'ms-playwright'), /^chromium-\d+$/, ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']));
  if (process.env.LOCALAPPDATA) pw.push(...globDir(path.join(process.env.LOCALAPPDATA, 'ms-playwright'), /^chromium-\d+$/, ['chrome-win', 'chrome.exe']));
  const system = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return [...pw, ...system].find((p) => fs.existsSync(p)) ?? null;
}

/** Minimal Chrome DevTools Protocol client over --remote-debugging-pipe (fd 3 in, fd 4 out). */
function cdp(chrome, userDir, w, h) {
  const proc = spawn(
    chrome,
    ['--headless', '--remote-debugging-pipe', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${userDir}`, `--window-size=${w + 100},${h + 200}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  );
  let id = 0;
  let buf = '';
  let stderr = '';
  const pending = new Map();
  const waiters = [];
  proc.stderr.on('data', (d) => (stderr += d));
  proc.stdio[4].on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
      } else if (msg.method) for (const w of [...waiters]) if (w.method === msg.method) waiters.splice(waiters.indexOf(w), 1) && w.resolve(msg.params);
    }
  });
  const exited = new Promise((_, reject) => proc.on('exit', (code) => reject(new UserError(`Chrome thoát (mã ${code}) ${stderr.slice(-300)}`))));
  exited.catch(() => {});
  const send = (method, params = {}, sessionId) =>
    Promise.race([
      exited,
      new Promise((resolve, reject) => {
        const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
        pending.set(msg.id, { resolve, reject });
        proc.stdio[3].write(`${JSON.stringify(msg)}\0`);
      }),
    ]);
  const once = (method) => Promise.race([exited, new Promise((resolve) => waiters.push({ method, resolve }))]);
  return { send, once, close: () => proc.kill() };
}

async function screenshot(html, out, w, h) {
  const chrome = findChrome();
  if (!chrome) throw new UserError('Không tìm thấy Chromium/Chrome/Edge. Cài Chrome, hoặc `npx playwright install chromium`, hoặc đặt CHROME_PATH.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svgart-'));
  const page = path.join(tmp, 'page.html');
  fs.writeFileSync(page, html);
  // The window must be bigger than the image: headless Chrome only paints reliably inside it,
  // and part of its height goes to browser UI. The viewport itself is set exactly below.
  const browser = cdp(chrome, path.join(tmp, 'profile'), w, h);
  const timer = setTimeout(() => browser.close(), 60000);
  try {
    const { targetInfos } = await browser.send('Target.getTargets');
    const target = targetInfos.find((t) => t.type === 'page') ?? { targetId: (await browser.send('Target.createTarget', { url: 'about:blank' })).targetId };
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const send = (m, p) => browser.send(m, p, sessionId);
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const loaded = browser.once('Page.loadEventFired');
    await send('Page.navigate', { url: pathToFileURL(page).href });
    await loaded;
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: true });
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
  } finally {
    clearTimeout(timer);
    browser.close();
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // Chrome on Windows can hold the profile a moment after exit; a leftover temp dir is harmless.
    }
  }
  const info = pngSize(out);
  if (!info || info.width !== w || info.height !== h) throw new UserError(`Chrome xuất ${info ? `${info.width}×${info.height}` : 'file hỏng'}, cần ${w}×${h}`);
}

export function pngSize(file) {
  if (!fs.existsSync(file)) return null;
  const b = fs.readFileSync(file);
  if (b.length < 26 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: b[25] === 6 || b[25] === 4 };
}

const dataUri = (file) => `data:image/svg+xml;base64,${fs.readFileSync(file).toString('base64')}`;
const PAGE = (body, css = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}img{display:block}${css}</style></head><body>${body}</body></html>`;

export async function render(files, out, size) {
  const m = /^(\d+)x(\d+)$/.exec(size ?? '');
  if (!m) throw new UserError('--size dạng <W>x<H>, vd 96x96');
  const [w, h] = [Number(m[1]), Number(m[2])];
  const imgs = files.map((f) => `<img src="${dataUri(f)}" width="${w}" height="${h}">`).join('');
  await screenshot(PAGE(`<div style="display:flex">${imgs}</div>`), out, w * files.length, h);
  return { width: w * files.length, height: h };
}

export async function sheet(files, out, sizes = [32, 64, 128]) {
  const big = Math.max(...sizes);
  const pad = 12;
  const label = 16;
  const width = sizes.reduce((a, s) => a + s + pad, pad);
  const rowH = pad + big + 4 + label;
  const rows = files
    .flatMap((f) =>
      ['#f4f1ea', '#22232a'].map(
        (bg, i) =>
          `<div style="box-sizing:border-box;height:${rowH}px;padding:${pad}px ${pad}px 0;background:${bg}">` +
          `<div style="display:flex;align-items:flex-end;gap:${pad}px;height:${big}px">${sizes.map((s) => `<img src="${dataUri(f)}" width="${s}" height="${s}">`).join('')}</div>` +
          `<div style="font:11px/16px sans-serif;margin-top:4px;color:${i ? '#ccc' : '#444'};white-space:nowrap">${path.basename(f)} · ${sizes.join('/')}px</div></div>`,
      ),
    )
    .join('');
  const height = files.length * 2 * rowH;
  await screenshot(PAGE(`<div style="width:${width}px">${rows}</div>`), out, width, height);
  return { width, height };
}

// ---------- CLI ----------
export async function main(argv) {
  const args = parseArgs(argv);
  const [cmd, ...files] = args._;
  const need = () => {
    if (!files.length) throw new UserError('Cần ít nhất một file .svg');
    for (const f of files) if (!fs.existsSync(f)) throw new UserError(`Không có ${f}`);
  };
  switch (cmd) {
    case 'styles':
      for (const s of listStyles()) console.log(`${s.name.padEnd(10)} ${s.title} — ${s.fits}`);
      return 0;
    case 'lint': {
      need();
      const style = loadStyle(args.style);
      let bad = 0;
      for (const f of files) {
        const errs = lintSvg(fs.readFileSync(f, 'utf8'), style);
        if (errs.length) {
          bad++;
          for (const e of errs) console.log(`✖ ${f}: ${e}`);
        } else console.log(`✔ ${f}`);
      }
      return bad ? 1 : 0;
    }
    case 'render': {
      need();
      if (!args.out || args.out === true) throw new UserError('Cần --out <file.png>');
      const r = await render(files, args.out, args.size);
      console.log(`✔ ${args.out} ${r.width}×${r.height}${files.length > 1 ? ` (${files.length} frame)` : ''}`);
      return 0;
    }
    case 'sheet': {
      need();
      if (!args.out || args.out === true) throw new UserError('Cần --out <file.png>');
      const sizes = args.sizes && args.sizes !== true ? args.sizes.split(',').map(Number) : undefined;
      await sheet(files, args.out, sizes);
      console.log(`✔ ${args.out}`);
      return 0;
    }
    default:
      console.log(HELP);
      return cmd && cmd !== 'help' ? 1 : 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UserError) {
      console.error(`✖ ${e.message}`);
      process.exitCode = 1;
    } else throw e;
  }
}
