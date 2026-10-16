// Assemble one portal package (layout az-v1) from a vite build:
//   <outDir>/{index.html, preview.html, version.txt, <v>/{index.html, loader.js, framework.js, css/, Icons/, Language/, assets/, StreamingAssets/}}
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exists, walk } from './io.mjs';
import { GkError } from './log.mjs';
import { withBase } from './html.mjs';
import { copyrightFor } from './portals.mjs';
import { buildLanguages } from './languages.mjs';

/** What a vite build for a package may contain at its root (public/ is copied there too). */
export const VITE_TOP = new Set(['framework.js', 'css', 'assets', 'Icons', 'StreamingAssets', 'index.html']);
export const ASSET_KINDS = new Set(['img', 'art', 'audio', 'fonts']);

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/**
 * buildLoader({ entry, define }) bundles the kit's loader.entry.js; obfuscate(code, seed) scrambles it.
 * Both are injected so tests run without esbuild/javascript-obfuscator (pack passes the game's own).
 */
export async function assemblePortal({ game, kit, settings = {}, version, viteOut, languages, outDir, buildLoader, obfuscate }) {
  if (!/^\d{8}$/.test(String(version))) throw new GkError(`version phải gồm 8 chữ số (YYMMDDNN), nhận được "${version}"`);
  // The pre-az-v1 template built a page (index.html + Build/); the package now needs framework.js.
  if (exists(path.join(viteOut, 'Build')) || (exists(path.join(viteOut, 'index.html')) && !exists(path.join(viteOut, 'framework.js'))))
    throw new GkError('vite.config.ts của game là bản cũ (ra index.html + Build/) — xem mục Nâng cấp game cũ trong README của GameKit');
  for (const rel of walk(viteOut)) {
    const [top, kind] = rel.split('/');
    if (!VITE_TOP.has(top)) throw new GkError(`${rel}: không thuộc bố cục gói — public/ chỉ nên có Icons/ và StreamingAssets/`);
    if (top === 'css' && rel !== 'css/style.css') throw new GkError(`${rel}: không thuộc bố cục gói — css/ chỉ có style.css`);
    if (top === 'Icons' && rel !== 'Icons/web.png' && rel !== 'Icons/loading.webp') throw new GkError(`${rel}: không thuộc bố cục gói — Icons/ chỉ có web.png, loading.webp (domain.webp lấy từ bộ vỏ portal)`);
    if (top === 'assets' && !ASSET_KINDS.has(kind)) throw new GkError(`${rel}: asset phải nằm trong assets/{${[...ASSET_KINDS].join(',')}}`);
  }
  const need = (rel) => {
    const f = path.join(viteOut, rel);
    if (!exists(f)) throw new GkError(`Bản build thiếu ${rel}`);
    return f;
  };
  const srcFramework = need('framework.js');
  const srcCss = need('css/style.css');
  const srcWeb = need('Icons/web.png');
  const srcLoading = need('Icons/loading.webp');
  const langs = buildLanguages(languages, game.languages ?? ['en']);
  fs.rmSync(outDir, { recursive: true, force: true });
  const inner = path.join(outDir, version);

  copy(srcFramework, path.join(inner, 'framework.js'));
  copy(srcCss, path.join(inner, 'css', 'style.css'));
  for (const rel of walk(path.join(viteOut, 'assets'))) copy(path.join(viteOut, 'assets', rel), path.join(inner, 'assets', rel));
  for (const rel of walk(path.join(viteOut, 'StreamingAssets'))) {
    if (path.basename(rel) !== '.gitkeep') copy(path.join(viteOut, 'StreamingAssets', rel), path.join(inner, 'StreamingAssets', rel));
  }
  copy(srcWeb, path.join(inner, 'Icons', 'web.png'));
  copy(srcLoading, path.join(inner, 'Icons', 'loading.webp'));
  copy(path.join(kit.dir, 'Icons', 'domain.webp'), path.join(inner, 'Icons', 'domain.webp'));

  const sizes = { framework: fs.statSync(path.join(inner, 'framework.js')).size, lang: {} };
  fs.mkdirSync(path.join(inner, 'Language'), { recursive: true });
  for (const [code, text] of Object.entries(langs.files)) {
    fs.writeFileSync(path.join(inner, 'Language', `${code}.json`), text);
    sizes.lang[code] = Buffer.byteLength(text);
  }

  const mod = await import(pathToFileURL(path.join(kit.dir, 'kit.mjs')).href);
  const cfg = {
    ...mod.loaderConfig({ game, settings, version }),
    version,
    languages: langs.list,
    defaultLanguage: game.language ?? 'en',
    sizes,
    copyright: copyrightFor(kit, version),
    sitelock: kit.config.sitelock ?? null,
  };
  const bundled = await buildLoader({ entry: path.join(kit.dir, 'loader.entry.js'), define: { __GK_LOADER__: JSON.stringify(cfg) } });
  fs.writeFileSync(path.join(inner, 'loader.js'), await obfuscate(bundled, Number(version)));

  const html = mod.renderShell({ game, settings, version });
  fs.writeFileSync(path.join(inner, 'index.html'), html);
  const outer = withBase(html, version);
  fs.writeFileSync(path.join(outDir, 'index.html'), outer);
  fs.writeFileSync(path.join(outDir, 'preview.html'), outer);
  fs.writeFileSync(path.join(outDir, 'version.txt'), version);
  return { cfg };
}
