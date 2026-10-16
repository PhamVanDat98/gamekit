// Page loader shared by every portal kit: choose the language, download framework.js + Language/<code>.json
// in parallel with real byte progress, hand over to the game, offer a retry on failure.
// Portal entries add sitelock and SDK hooks around runLoader().
import { pickLanguage, progressPercent, safeStorage } from './loader-core.js';

const ALMOST = 99;

export function runLoader(cfg, hooks = {}) {
  const root = document.getElementById('gmLoader');
  const fill = document.getElementById('gmLoaderFill');
  const info = root && root.querySelector('.gmLoaderInfo');
  const start = typeof window.GM_LOAD_START === 'number' ? window.GM_LOAD_START : performance.now();
  const storage = safeStorage(() => window.localStorage);

  const setProgress = (p) => {
    if (!root) return;
    root.classList.add('gmIsLoading');
    if (fill) fill.style.width = `${p}%`;
    if (p >= ALMOST) {
      root.classList.add('gmAlmost');
      if (info) info.textContent = 'Almost there...';
    } else if (info) info.textContent = `${p}%`;
  };

  const code = pickLanguage({
    saved: storage.get(cfg.storageKey),
    query: new URLSearchParams(location.search).get('lang'),
    browser: navigator.languages || [navigator.language],
    fallback: cfg.defaultLanguage,
    available: cfg.languages.map((l) => l.code),
  });

  let readyDone = false;
  window.GM_LOADER = {
    copyright: cfg.copyright,
    version: cfg.version,
    setLanguage(next) {
      storage.set(cfg.storageKey, next);
      location.reload();
    },
    ready() {
      if (readyDone) return;
      readyDone = true;
      if (root) root.style.display = 'none';
      window.focus();
      if (hooks.onReady) hooks.onReady(Math.round(performance.now() - start));
    },
  };

  const total = cfg.sizes.framework + (cfg.sizes.lang[code] || 0);
  let received = 0;
  const onChunk = (n) => {
    received += n;
    setProgress(progressPercent(received, total));
  };

  const load = async () => {
    if (root) root.classList.remove('gmHasError');
    received = 0;
    const [frameworkCode, dictText] = await Promise.all([fetchText('framework.js', onChunk), fetchText(`Language/${code}.json`, onChunk)]);
    window.GM_LANG = { code, dict: JSON.parse(dictText), available: cfg.languages };
    setProgress(ALMOST);
    await runScript(frameworkCode);
  };
  const attempt = () =>
    load().catch((e) => {
      console.error('[loader]', e);
      if (root) root.classList.add('gmHasError');
    });
  const retry = document.getElementById('gmLoaderRetry');
  if (retry) retry.onclick = attempt;

  const art = root && root.querySelector('.gmLoaderThumb');
  if (art) {
    if (art.complete && art.naturalWidth) tintFromArt(art, root);
    else art.addEventListener('load', () => tintFromArt(art, root));
  }
  attempt();
}

async function fetchText(url, onChunk) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!res.body || !res.body.getReader) {
    const t = await res.text();
    onChunk(t.length);
    return t;
  }
  const reader = res.body.getReader();
  const parts = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    onChunk(value.byteLength);
  }
  return new Blob(parts).text();
}

/**
 * Run the downloaded framework.js from memory (no second download). If the portal's CSP forbids
 * blob: scripts, fall back to a normal <script src> — served from the HTTP cache in most setups.
 */
function runScript(code) {
  const inject = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`không chạy được ${src}`));
      document.body.appendChild(s);
    });
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  return inject(url)
    .catch(() => inject('framework.js'))
    .finally(() => URL.revokeObjectURL(url));
}

/** Progress bar colours from the loading art (GM Loader v1): up to 3 vivid, distinct colours. */
function tintFromArt(img, root) {
  try {
    const n = 32;
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    const bins = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (d[i + 3] < 200 || mx < 50 || mx - mn < 40) continue;
      const k = `${r >> 5},${g >> 5},${b >> 5}`;
      const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      bins.set(k, e);
    }
    const order = [...bins.values()]
      .map((e) => {
        const v = [e.r / e.n, e.g / e.n, e.b / e.n];
        const m = Math.max(...v);
        return { v, n: e.n, s: e.n * Math.pow((m - Math.min(...v)) / m, 1.5) };
      })
      .sort((a, b) => b.s - a.s);
    const bright = (v) => {
      const m = Math.max(...v) || 1, f = m < 225 ? 225 / m : 1, avg = (v[0] + v[1] + v[2]) / 3;
      return v.map((x) => Math.max(0, Math.min(255, Math.round((avg + (x - avg) * 1.3) * f))));
    };
    const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 90;
    const pick = [];
    for (const e of order) {
      if (pick.length === 3 || e.n < 3) break;
      const col = bright(e.v);
      if (pick.every((p) => far(p, col))) pick.push(col);
    }
    if (!pick.length) return;
    while (pick.length < 3) pick.push(pick[0].map((x) => Math.round(x + (255 - x) * pick.length * 0.22)));
    pick.forEach((col, i) => root.style.setProperty(`--gm-c${i + 1}`, col.join(',')));
  } catch {
    /* CORS or broken image: keep the default colours */
  }
}
