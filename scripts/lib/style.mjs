// Style options (style/options/<id>.json) and the chosen style (style/style.json): checks, and the
// src/view/theme.ts the game reads them from.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readJson, toPosix } from './io.mjs';
import { check } from './schema.mjs';
import { GkError } from './log.mjs';

export const THEME_TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/game/src/view/theme.ts');

/** [{ file, data }] for style/options/*.json, sorted. Unreadable files come back with `error`. */
export function loadStyleOptions(root) {
  const dir = path.join(root, 'style', 'options');
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const file = `style/options/${f}`;
      try {
        return { file, data: readJson(path.join(dir, f)) };
      } catch (e) {
        return { file, error: e.message };
      }
    });
}

export function loadChosenStyle(root) {
  const f = path.join(root, 'style', 'style.json');
  return exists(f) ? readJson(f) : null;
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** WCAG contrast ratio, 1…21. */
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Black or white, whichever reads better on `bg`. */
export const onColour = (bg) => (contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff');

/** Problems of one style file: { errors, warnings }. */
export function styleProblems(root, data, file) {
  const errors = check('style', data).map((e) => `${file}: ${e}`);
  const warnings = [];
  if (errors.length) return { errors, warnings };
  if (file.startsWith('style/options/') && path.basename(file, '.json') !== data.id) errors.push(`${file}: id "${data.id}" phải trùng tên file`);
  const p = data.palette;
  const pairs = [
    ['text', 'bg', 4.5],
    ['text', 'surface', 4.5],
    ['muted', 'surface', 3],
    [p.onPrimary ? 'onPrimary' : null, 'primary', 3],
  ];
  for (const [fg, bg, min] of pairs) {
    if (!fg) continue;
    const r = contrast(p[fg], p[bg]);
    if (r < min) warnings.push(`${file}: chữ ${fg} trên ${bg} tương phản ${r.toFixed(1)}:1 (nên ≥ ${min}:1)`);
  }
  for (const [slot, f] of Object.entries(data.fonts)) {
    if (!f.file) continue;
    if (!/^assets\/fonts\/[^/]+\.(woff2?|ttf|otf)$/.test(f.file)) errors.push(`${file}: fonts.${slot}.file phải là file trong assets/fonts/ (woff2/woff/ttf/otf)`);
    else if (!exists(path.join(root, f.file))) (file === 'style/style.json' ? errors : warnings).push(`${file}: thiếu ${f.file}`);
  }
  return { errors, warnings };
}

const stack = (f) => `${/[\s\d]/.test(f.family) ? `"${f.family}"` : f.family}, system-ui, sans-serif`;
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** src/view/theme.ts for a style: the template file with THEME, imports and FONT_FILES filled in. */
export function themeSource(style) {
  const tpl = fs.readFileSync(THEME_TEMPLATE, 'utf8');
  const p = { ...style.palette, onPrimary: style.palette.onPrimary ?? onColour(style.palette.primary) };
  const shape = { radius: 12, stroke: 0, shadow: 'soft', ...style.shape };
  const obj = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'number' ? v : q(v)}`).join(', ')} }`;
  const theme = `export const THEME = {
  palette: ${obj(p)},
  fonts: ${obj({ display: stack(style.fonts.display), body: stack(style.fonts.body) })},
  shape: ${obj(shape)},
} as const;`;
  const files = [];
  const imports = [];
  for (const slot of ['display', 'body']) {
    const f = style.fonts[slot];
    if (!f.file || files.some((x) => x.file === f.file && x.family === f.family)) continue;
    const id = `font${files.length}`;
    imports.push(`import ${id} from '../../${toPosix(f.file)}';`);
    files.push({ ...f, id });
  }
  const fontFiles = `const FONT_FILES: ReadonlyArray<{ family: string; url: string; weight?: number }> = [${files
    .map((f) => `{ family: ${q(f.family)}, url: ${f.id}${f.weight ? `, weight: ${f.weight}` : ''} }`)
    .join(', ')}];`;
  const replaced = tpl
    .replace(/export const THEME = \{[\s\S]*?\} as const;/, theme)
    .replace(/const FONT_FILES: [^\n]*= \[\];/, fontFiles);
  if (replaced === tpl) throw new GkError('templates/game/src/view/theme.ts không còn đúng dạng để sinh theme');
  const header = `// Sinh từ style/style.json (${style.id}) bằng \`gamekit style choose\` — sửa style ở đó rồi chạy lại.\n`;
  return header + (imports.length ? `${imports.join('\n')}\n\n` : '') + replaced;
}
