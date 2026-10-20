// gamekit review [--apply review.json] — a page to review every asset the game ships.
//   review          .gamekit/local/review/index.html: each asset next to its spec, the original it
//                   replaces, its provenance label and every language version; mark OK / needs a fix
//   --apply <file>  the review.json the page downloads → asset-manifest.json review + notes/review.md
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, writeJson, walk, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { imageSize } from './lib/png.mjs';
import { check } from './lib/schema.mjs';

const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;
const AUDIO = /\.(ogg|mp3|wav|m4a|aac)$/i;
const FONT = /\.(woff2?|ttf|otf)$/i;

/** Everything the page shows, with the problems a reviewer should see first. */
export function collect(root) {
  const game = loadGame(root);
  const langs = game.languages ?? ['en'];
  const manFile = path.join(root, 'asset-manifest.json');
  const man = exists(manFile) ? readJson(manFile) : { assets: [] };
  const provFile = path.join(root, 'provenance.json');
  const labels = new Map((exists(provFile) ? readJson(provFile).entries : []).map((e) => [e.path, e.label]));
  const shipped = ['assets', 'public'].flatMap((d) => walk(path.join(root, d)).map((f) => `${d}/${f}`)).filter((f) => path.basename(f) !== '.gitkeep');
  const items = [];
  const seen = new Set();
  const add = (a) => {
    const p = a.path;
    const file = path.join(root, p);
    const has = exists(file);
    const size = has && IMAGE.test(p) && !p.endsWith('.svg') ? imageSize(file) : null;
    const it = {
      id: a.id ?? null,
      path: p,
      kind: a.kind ?? (AUDIO.test(p) ? 'audio' : FONT.test(p) ? 'font' : IMAGE.test(p) ? 'image' : 'file'),
      media: AUDIO.test(p) ? 'audio' : FONT.test(p) ? 'font' : IMAGE.test(p) ? 'image' : 'file',
      exists: has,
      spec: a.width ? { w: a.frames ? a.frames.width * a.frames.count : a.width, h: a.height } : null,
      size,
      label: labels.get(p) ?? null,
      brief: a.brief ?? null,
      ref: a.ref && exists(path.join(root, a.ref)) ? a.ref : null,
      text: Boolean(a.text),
      langs: null,
      review: a.review ?? null,
      issues: [],
    };
    if (a.text && p.startsWith('assets/i18n/en/')) {
      const rest = p.slice('assets/i18n/en/'.length);
      it.langs = Object.fromEntries(langs.map((c) => [c, exists(path.join(root, 'assets/i18n', c, rest)) ? `assets/i18n/${c}/${rest}` : null]));
      const miss = langs.filter((c) => !it.langs[c]);
      if (miss.length) it.issues.push(`thiếu bản ${miss.join(', ')}`);
      for (const c of langs) if (it.langs[c]) seen.add(it.langs[c]);
    }
    if (!has) it.issues.push('chưa có file');
    if (it.spec && size && (size.width !== it.spec.w || size.height !== it.spec.h)) it.issues.push(`${size.width}×${size.height}, spec ${it.spec.w}×${it.spec.h}`);
    if (has && !it.label) it.issues.push('chưa có nhãn provenance');
    if (it.label === 'placeholder' || it.label === 'reference') it.issues.push(`nhãn ${it.label}`);
    if (/^TODO/.test(it.brief ?? '')) it.issues.push('brief TODO');
    if (it.review?.status === 'fix') it.issues.push(`cần sửa: ${it.review.note ?? ''}`);
    seen.add(p);
    items.push(it);
  };
  for (const a of man.assets ?? []) add(a);
  for (const p of shipped) if (!seen.has(p)) add({ path: p });
  return { game, items };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function reviewHtml(root) {
  const { game, items } = collect(root);
  const out = path.join(root, '.gamekit', 'local', 'review');
  // Relative URL from the page, each segment percent-encoded (#, ?, % and spaces in file names).
  const href = (p) => toPosix(path.relative(out, path.join(root, p))).split('/').map(encodeURIComponent).join('/');
  const url = (p) => esc(href(p));
  const fonts = new Map(items.filter((i) => i.media === 'font' && i.exists).map((i, n) => [i.path, `gkfont${n}`]));
  const media = (p, m) =>
    m === 'image' ? `<img loading="lazy" src="${url(p)}" alt="">` : m === 'audio' ? `<audio controls preload="none" src="${url(p)}"></audio>` : m === 'font' && fonts.has(p) ? `<span class="font" style="font-family:${fonts.get(p)}">Aa Ăă Ññ 123</span>` : `<span class="file">${esc(path.basename(p))}</span>`;
  const faces = [...fonts].map(([p, id]) => `@font-face{font-family:${id};src:url("${href(p)}")}`);
  const rows = items.map((it) => {
    const variants = it.langs
      ? `<div class="langs">${Object.entries(it.langs)
          .map(([c, p]) => `<figure>${p ? media(p, it.media) : '<span class="miss">thiếu — dùng en</span>'}<figcaption>${esc(c)}</figcaption></figure>`)
          .join('')}</div>`
      : `<div class="langs"><figure>${it.exists ? media(it.path, it.media) : '<span class="miss">chưa có file</span>'}</figure></div>`;
    return `<article class="item${it.issues.length ? ' bad' : ''}" data-path="${esc(it.path)}" data-kind="${esc(it.kind)}" data-status="${esc(it.review?.status ?? '')}" data-note="${esc(it.review?.note ?? '')}">
  <div class="media">${it.ref ? `<figure class="ref">${media(it.ref, it.media)}<figcaption>gốc: ${esc(it.ref)}</figcaption></figure>` : ''}${variants}</div>
  <div class="meta">
    <b>${esc(it.id ?? path.basename(it.path))}</b> <code>${esc(it.path)}</code>
    <div>${esc(it.kind)}${it.spec ? ` · spec ${it.spec.w}×${it.spec.h}` : ''}${it.size ? ` · thật ${it.size.width}×${it.size.height}` : ''}${it.text ? ' · <b>có chữ</b>' : ''} · nhãn <span class="label ${esc(it.label ?? 'none')}">${esc(it.label ?? 'chưa có')}</span></div>
    ${it.brief ? `<p class="brief">${esc(it.brief)}</p>` : ''}
    ${it.issues.length ? `<ul class="issues">${it.issues.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <div class="decide"><label><input type="radio" name="s:${esc(it.path)}" value="ok"> OK</label><label><input type="radio" name="s:${esc(it.path)}" value="fix"> Cần sửa</label><textarea placeholder="Ghi chú cho người sửa" rows="2"></textarea></div>
  </div>
</article>`;
  });
  const kinds = [...new Set(items.map((i) => i.kind))].sort();
  const key = JSON.stringify(`gk-review:${game.name}`);
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(game.title)} — duyệt asset</title>
<style>
${faces.join('\n')}
:root { color-scheme: light dark; --page: #f5f5f7; --card: #fff; --ink: #1d1d22; --line: #ddd; --bad: #c62828; --ok: #2e7d32; --checker: #e9e9ee; }
@media (prefers-color-scheme: dark) { :root { --page: #121216; --card: #1c1c22; --ink: #e9e9ef; --line: #333; --bad: #ff6b6b; --ok: #6bd88a; --checker: #26262e; } }
body { margin: 0; padding: 16px; background: var(--page); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }
.bar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 0 12px; background: var(--page); }
.item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-bottom: 12px; padding: 12px; border-radius: 10px; background: var(--card); border-left: 4px solid transparent; }
.item.bad { border-left-color: var(--bad); }
@media (max-width: 700px) { .item { grid-template-columns: 1fr; } }
.media { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
.langs { display: flex; flex-wrap: wrap; gap: 8px; }
figure { margin: 0; text-align: center; } figcaption { font-size: 11px; opacity: .7; }
img { max-width: min(100%, 220px); max-height: 180px; background: repeating-conic-gradient(var(--checker) 0 25%, transparent 0 50%) 0 0 / 16px 16px; }
.ref img { opacity: .9; outline: 2px dashed var(--line); }
.font { font-size: 28px; } .miss { display: inline-block; padding: 24px 12px; border: 1px dashed var(--bad); color: var(--bad); font-size: 12px; }
code { font-size: 12px; word-break: break-all; } .brief { margin: 6px 0; opacity: .85; }
.issues { margin: 6px 0; padding-inline-start: 18px; color: var(--bad); }
.label.placeholder, .label.reference, .label.none { color: var(--bad); font-weight: 600; } .label.own, .label.generated, .label.licensed { color: var(--ok); }
.decide { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .decide textarea { flex: 1 1 100%; font: inherit; }
</style></head><body>
<div class="bar"><b>${esc(game.title)}</b> — ${items.length} asset, <span id="nbad">${items.filter((i) => i.issues.length).length}</span> có vấn đề ·
<label><input type="checkbox" id="onlybad"> Chỉ mục có vấn đề</label>
<label>Loại <select id="kind"><option value="">tất cả</option>${kinds.map((k) => `<option>${esc(k)}</option>`).join('')}</select></label>
<button id="save" type="button">Tải review.json</button>
<span>rồi: <code>npm run gk -- review --apply review.json</code></span></div>
${rows.join('\n')}
<script>
const KEY = ${key};
let state = {};
try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
for (const el of document.querySelectorAll('.item')) {
  const p = el.dataset.path;
  // This browser's unsent marks first, then what was already applied to asset-manifest.json.
  const s = state[p] || { status: el.dataset.status || undefined, note: el.dataset.note || '' };
  for (const r of el.querySelectorAll('input[type=radio]')) { r.checked = r.value === s.status; r.onchange = () => { state[p] = { ...state[p], status: r.value }; persist(); }; }
  const ta = el.querySelector('textarea');
  ta.value = s.note || '';
  ta.oninput = () => { state[p] = { ...state[p], note: ta.value }; persist(); };
}
function filter() {
  const only = document.getElementById('onlybad').checked, kind = document.getElementById('kind').value;
  for (const el of document.querySelectorAll('.item')) el.hidden = (only && !el.classList.contains('bad')) || (kind && el.dataset.kind !== kind);
}
document.getElementById('onlybad').onchange = filter; document.getElementById('kind').onchange = filter;
document.getElementById('save').onclick = () => {
  const items = Object.fromEntries(Object.entries(state).filter(([, v]) => v.status));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ game: ${JSON.stringify(game.name)}, at: new Date().toISOString(), items }, null, 2)], { type: 'application/json' }));
  a.download = 'review.json'; a.click();
};
</script></body></html>
`;
}

/** Notes come from a textarea: keep each on one checklist line. */
const oneLine = (s) => String(s ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();

function apply(root, file) {
  const src = path.resolve(file);
  if (!exists(src)) throw new GkError(`Không có ${file}`);
  const data = readJson(src);
  if (!data.items || typeof data.items !== 'object') throw new GkError(`${file} không phải review.json của trang duyệt`);
  const game = loadGame(root);
  if (data.game && data.game !== game.name) throw new GkError(`${file} là của game ${data.game}, không phải ${game.name}`);
  const manFile = path.join(root, 'asset-manifest.json');
  const man = exists(manFile) ? readJson(manFile) : null;
  const at = nowIso();
  let inManifest = 0;
  for (const a of man?.assets ?? []) {
    const r = data.items[a.path];
    if (!r || !['ok', 'fix'].includes(r.status)) continue;
    a.review = { status: r.status, note: oneLine(r.note) || null, at };
    inManifest++;
  }
  if (man) {
    const errs = check('asset-manifest', man);
    if (errs.length) throw new GkError(`asset-manifest.json sẽ không hợp lệ: ${errs.slice(0, 5).join('; ')}`);
    writeJson(manFile, man);
  }
  const fixes = Object.entries(data.items).filter(([, v]) => v.status === 'fix');
  const oks = Object.entries(data.items).filter(([, v]) => v.status === 'ok').length;
  const notes = path.join(root, 'notes', 'review.md');
  fs.mkdirSync(path.dirname(notes), { recursive: true });
  const section = [`## Duyệt asset ${at.slice(0, 10)}`, '', `${oks} OK, ${fixes.length} cần sửa.`, '', ...fixes.map(([p, v]) => `- [ ] \`${oneLine(p).replace(/`/g, "'")}\`${oneLine(v.note) ? ` — ${oneLine(v.note)}` : ''}`), ''].join('\n');
  fs.writeFileSync(notes, (exists(notes) ? fs.readFileSync(notes, 'utf8') + '\n' : '# Ghi chú duyệt asset\n\n') + section);
  log.ok(`${oks} OK, ${fixes.length} cần sửa — asset-manifest.json (${inManifest} mục), notes/review.md`);
  return 0;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  if (args.apply) return apply(root, path.resolve(args.cwd ?? process.cwd(), args.apply));
  const out = path.join(root, '.gamekit', 'local', 'review', 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, reviewHtml(root));
  const { items } = collect(root);
  const bad = items.filter((i) => i.issues.length);
  log.ok(`Đã tạo .gamekit/local/review/index.html — ${items.length} asset, ${bad.length} có vấn đề`);
  for (const i of bad.slice(0, 15)) log.info(`  ${i.path}: ${i.issues.join('; ')}`);
  if (bad.length > 15) log.info(`  … và ${bad.length - 15} mục khác`);
  log.info('Mở file bằng trình duyệt, đánh dấu OK / Cần sửa, bấm "Tải review.json", rồi: gamekit review --apply review.json');
  return 0;
}
