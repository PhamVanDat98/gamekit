// Language/<code>.json: flat keys, {param} placeholders, plural keys (.one/.other/…), _meta { name, dir }.
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './io.mjs';
import { GkError } from './log.mjs';

export function loadLanguages(root) {
  const dir = path.join(root, 'Language');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) out[f.slice(0, -5)] = readJson(path.join(dir, f));
  return out;
}

/**
 * Package files: every key present (missing ones from en, so players download exactly one file),
 * minified; `_meta.name` goes to the loader's list, `_meta.dir` stays only for right-to-left.
 */
export function buildLanguages(sources, codes) {
  if (!sources.en) throw new GkError('Thiếu Language/en.json');
  const { _meta: _enMeta, ...enKeys } = sources.en;
  const files = {};
  const list = [];
  for (const code of codes) {
    const src = sources[code];
    if (!src) throw new GkError(`Thiếu Language/${code}.json`);
    const { _meta: meta = {}, ...keys } = src;
    const out = withEnFallback(enKeys, keys);
    if (meta.dir === 'rtl') out._meta = { dir: 'rtl' };
    files[code] = JSON.stringify(out);
    list.push({ code, name: meta.name ?? code });
  }
  return { files, list };
}

const PLURAL = /^(.+)\.(zero|one|two|few|many|other)$/;
const pluralBase = (k) => PLURAL.exec(k)?.[1];

/**
 * Keys missing from a translation come from en — except plural forms of a key the translation already
 * pluralises: ru with only `coins.other` must not get en's `coins.one` ("1 coin" in a Russian game).
 * Same rule as src/platform/dev-loader.ts in the game template.
 */
export function withEnFallback(enKeys, keys) {
  const own = new Set(Object.keys(keys).map(pluralBase).filter(Boolean));
  const out = {};
  for (const [k, v] of Object.entries(enKeys)) if (!own.has(pluralBase(k))) out[k] = v;
  return Object.assign(out, keys);
}

/** Sorted placeholder names, to compare a translation with en. */
export const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
