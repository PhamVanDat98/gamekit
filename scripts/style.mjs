// gamekit style list | choose <id> | preview — style options for a reskin (P3).
//   list     options in style/options/ and which one is chosen
//   choose   copy the option to style/style.json and write src/view/theme.ts from it
//   preview  .gamekit/local/preview/style.html: every option as a UI kit with the game's real strings
import fs from 'node:fs';
import path from 'node:path';
import { exists, writeJson, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame } from './lib/game.mjs';
import { loadLanguages } from './lib/languages.mjs';
import { contrast, loadChosenStyle, loadStyleOptions, onColour, styleProblems, themeSource } from './lib/style.mjs';

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const [sub, id] = args._;
  if (sub === 'list' || !sub) return list(root);
  if (sub === 'choose') return choose(root, id);
  if (sub === 'preview') return preview(root);
  throw new GkError('Dùng: gamekit style list | style choose <id> | style preview');
}

function list(root) {
  const options = loadStyleOptions(root);
  const chosen = loadChosenStyle(root);
  if (!options.length) log.info('Chưa có style nào. Tạo style/options/<id>.json theo schema .gamekit/schemas/style.schema.json (skill style-direction).');
  for (const o of options) log.info(`${chosen?.id === o.data?.id ? '●' : '○'} ${o.data?.id ?? o.file}  ${o.data?.name ?? o.error}`);
  if (chosen) log.info(`\nĐang dùng: ${chosen.id} (style/style.json)`);
  return 0;
}

function choose(root, id) {
  if (!id) throw new GkError('Dùng: gamekit style choose <id>');
  const opt = loadStyleOptions(root).find((o) => o.data?.id === id);
  if (!opt) throw new GkError(`Không có style/options/${id}.json`);
  const { errors, warnings } = styleProblems(root, opt.data, opt.file);
  for (const w of warnings) log.warn(w);
  if (errors.length) throw new GkError(errors.join('\n'));
  const { $schema: _, ...data } = opt.data;
  writeJson(path.join(root, 'style', 'style.json'), { $schema: '../.gamekit/schemas/style.schema.json', ...data });
  fs.writeFileSync(path.join(root, 'src', 'view', 'theme.ts'), themeSource(data));
  log.ok(`Đã chọn style ${id}: style/style.json, src/view/theme.ts`);
  log.info('Chạy npm run dev để xem trong game; npm run typecheck && npm run lint trước khi commit.');
  return 0;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Rules of the game's own Settings popup, so the preview shows the real thing with each style. */
function settingsCss(root) {
  const f = path.join(root, 'src', 'view', 'style.css');
  if (!exists(f)) return '';
  const css = fs.readFileSync(f, 'utf8');
  return [...css.matchAll(/(^|\n)([^{}\n]*\.gk-settings[^{]*)\{([^}]*)\}/g)].map((m) => `${m[2].trim()} {${m[3]}}`).join('\n');
}

export function previewHtml(root) {
  const game = loadGame(root);
  const options = loadStyleOptions(root).filter((o) => o.data);
  const chosen = loadChosenStyle(root);
  if (chosen && !options.some((o) => o.data.id === chosen.id)) options.unshift({ file: 'style/style.json', data: chosen });
  if (!options.length) throw new GkError('Chưa có style nào trong style/options/ (skill style-direction)');
  const langs = loadLanguages(root);
  const en = langs.en ?? {};
  const strings = Object.fromEntries((game.languages ?? ['en']).map((c) => [c, { ...en, ...(langs[c] ?? {}) }]));
  const rtl = Object.fromEntries(Object.entries(langs).map(([c, d]) => [c, d?._meta?.dir === 'rtl']));
  const out = path.join(root, '.gamekit', 'local', 'preview');
  const rel = (f) => toPosix(path.relative(out, path.join(root, f)));
  const faces = [];
  const cards = options.map(({ file, data: s }) => {
    const p = { ...s.palette, onPrimary: s.palette.onPrimary ?? onColour(s.palette.primary) };
    const shape = { radius: 12, stroke: 0, shadow: 'soft', ...s.shape };
    for (const f of Object.values(s.fonts)) if (f.file && exists(path.join(root, f.file))) faces.push(`@font-face { font-family: "${esc(f.family)}"; src: url("${rel(f.file)}"); ${f.weight ? `font-weight: ${f.weight};` : ''} }`);
    const vars = {
      ...Object.fromEntries(Object.entries(p).map(([k, v]) => [`--gk-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v])),
      '--gk-font-display': `"${s.fonts.display.family}", system-ui, sans-serif`,
      '--gk-font-body': `"${s.fonts.body.family}", system-ui, sans-serif`,
      '--gk-radius': `${shape.radius}px`,
      '--gk-stroke': `${shape.stroke}px`,
      '--gk-shadow': { none: 'none', soft: '0 6px 18px rgba(0,0,0,.35)', hard: '0 4px 0 rgba(0,0,0,.55)' }[shape.shadow],
    };
    const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
    const sw = Object.entries(p)
      .map(([k, v]) => `<div class="sw"><span style="background:${v}"></span><b>${k}</b><small>${v}</small></div>`)
      .join('');
    const ratio = (a, b) => contrast(p[a], p[b]).toFixed(1);
    const imgDir = path.join(root, 'style', 'options', s.id);
    const imgs = exists(imgDir) ? fs.readdirSync(imgDir).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)) : [];
    return `<section class="card" style="${esc(style)}">
  <header><h2>${esc(s.name)} <code>${esc(s.id)}</code>${chosen?.id === s.id ? ' <em>đang dùng</em>' : ''}</h2><p>${esc(s.mood ?? '')}</p><small>${esc(file)}</small></header>
  <div class="palette">${sw}</div>
  <p class="ratios">Tương phản: text/bg ${ratio('text', 'bg')}:1 · text/surface ${ratio('text', 'surface')}:1 · onPrimary/primary ${ratio('onPrimary', 'primary')}:1</p>
  <div class="stage">
    <div class="hud"><span data-k="game.score" data-p='{"score":1234}'></span><button class="gk-gear" type="button">⚙</button></div>
    <h3 class="title" data-k="game.start"></h3>
    <div class="buttons"><button class="btn primary" data-k="settings.sound"></button><button class="btn secondary" data-k="settings.language"></button><button class="btn" disabled data-k="settings.close"></button></div>
    <div class="gk-settings-panel"><h2 class="gk-settings-title" data-k="settings.title"></h2><button class="gk-settings-toggle" data-k="settings.sound" data-suffix="settings.on"></button><label class="gk-settings-row"><span data-k="settings.language"></span><select><option>English</option></select></label><button class="gk-settings-close" data-k="settings.close"></button><footer class="gk-settings-footer">© 2026 Portal</footer></div>
    <div class="long"><b>Chuỗi dài nhất</b><ol class="longest"></ol></div>
  </div>
  ${s.art?.prompt ? `<p class="art"><b>Art prompt:</b> ${esc(s.art.prompt)}${s.art.negative ? `<br><b>Tránh:</b> ${esc(s.art.negative)}` : ''}</p>` : ''}
  ${imgs.length ? `<div class="imgs">${imgs.map((f) => `<img src="${esc(rel(`style/options/${s.id}/${f}`))}" alt="${esc(f)}">`).join('')}</div>` : ''}
</section>`;
  });
  const data = JSON.stringify({ strings, rtl, def: game.language ?? 'en' }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(game.title)} — so sánh style</title>
<style>
${faces.join('\n')}
:root { color-scheme: light dark; --page: #f4f4f6; --ink: #1d1d22; }
@media (prefers-color-scheme: dark) { :root { --page: #121216; --ink: #e9e9ef; } }
body { margin: 0; padding: 16px; background: var(--page); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }
.bar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 0 12px; background: var(--page); }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); }
.card { border-radius: 12px; overflow: hidden; background: color-mix(in srgb, var(--page) 80%, var(--ink) 6%); }
.card header { padding: 12px 14px; } .card h2 { margin: 0; font-size: 18px; } .card em { color: #0a7; font-style: normal; font-size: 12px; }
.palette { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; padding: 0 14px; }
.sw { display: flex; flex-direction: column; font-size: 11px; } .sw span { height: 32px; border-radius: 6px; border: 1px solid rgba(127,127,127,.3); }
.ratios, .art { padding: 0 14px; font-size: 12px; opacity: .8; }
.stage { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--gk-bg); color: var(--gk-text); font-family: var(--gk-font-body); }
.hud { display: flex; justify-content: space-between; align-items: center; font: 600 18px var(--gk-font-display); }
.gk-gear { width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgba(0,0,0,.45); color: #fff; font-size: 22px; }
.title { margin: 0; font: 700 26px var(--gk-font-display); text-align: center; }
.buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.btn { padding: 10px 16px; border: var(--gk-stroke) solid var(--gk-text); border-radius: var(--gk-radius); box-shadow: var(--gk-shadow); font: 600 16px var(--gk-font-display); background: var(--gk-surface); color: var(--gk-text); }
.btn.primary { background: var(--gk-primary); color: var(--gk-on-primary); } .btn.secondary { background: var(--gk-secondary); color: var(--gk-on-primary); } .btn:disabled { opacity: .45; }
.long { font-size: 12px; color: var(--gk-muted); } .long ol { margin: 4px 0 0; padding-inline-start: 18px; } .long li span { display: inline-block; max-width: 260px; padding: 4px 8px; border-radius: var(--gk-radius); background: var(--gk-surface); color: var(--gk-text); font: 600 15px var(--gk-font-display); overflow-wrap: anywhere; }
.imgs { display: flex; gap: 8px; overflow-x: auto; padding: 0 14px 14px; } .imgs img { height: 140px; border-radius: 8px; }
${settingsCss(root)}
.gk-settings-panel { position: static; }
</style></head><body>
<div class="bar"><b>${esc(game.title)}</b> — so sánh ${options.length} style ·
<label>Ngôn ngữ <select id="lang"></select></label>
<label><input type="checkbox" id="longest"> Chuỗi dài nhất mọi ngôn ngữ</label>
<span>Chọn: <code>npm run gk -- style choose &lt;id&gt;</code></span></div>
<div class="grid">${cards.join('\n')}</div>
<script>
const D = ${data};
const sel = document.getElementById('lang');
for (const c of Object.keys(D.strings)) sel.add(new Option(c, c, false, c === D.def));
const fill = (s, p) => s.replace(/\\{(\\w+)\\}/g, (m, k) => (k in p ? p[k] : m));
function render() {
  const all = document.getElementById('longest').checked;
  const dict = D.strings[sel.value] || {};
  const pick = (k) => all ? Object.values(D.strings).map((d) => d[k] || '').sort((a, b) => b.length - a.length)[0] : (dict[k] ?? k);
  for (const card of document.querySelectorAll('.card')) {
    card.querySelector('.stage').dir = D.rtl[sel.value] ? 'rtl' : 'ltr';
    for (const el of card.querySelectorAll('[data-k]')) {
      const p = el.dataset.p ? JSON.parse(el.dataset.p) : {};
      let s = fill(pick(el.dataset.k), p);
      if (el.dataset.suffix) s += ': ' + pick(el.dataset.suffix);
      el.textContent = s;
    }
    const pool = all ? Object.values(D.strings).flatMap((d) => Object.entries(d)) : Object.entries(dict);
    const longest = pool.filter(([k, v]) => k !== '_meta' && typeof v === 'string').sort((a, b) => b[1].length - a[1].length).slice(0, 5);
    const ol = card.querySelector('.longest');
    ol.replaceChildren(...longest.map(([k, v]) => { const li = document.createElement('li'); const sp = document.createElement('span'); sp.textContent = v; li.append(sp, ' ', k); return li; }));
  }
}
sel.onchange = render; document.getElementById('longest').onchange = render; render();
</script></body></html>
`;
}

function preview(root) {
  const html = previewHtml(root);
  const out = path.join(root, '.gamekit', 'local', 'preview', 'style.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  log.ok(`Đã tạo ${toPosix(path.relative(root, out))} — mở bằng trình duyệt để so sánh, rồi người dùng chọn: gamekit style choose <id>`);
  return 0;
}

