// Language/<code>.json: flat keys, {param} placeholders, plural keys (.one/.other/…), _meta { name, dir }.
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './io.mjs';

export function loadLanguages(root) {
  const dir = path.join(root, 'Language');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) out[f.slice(0, -5)] = readJson(path.join(dir, f));
  return out;
}

/** Sorted placeholder names, to compare a translation with en. */
export const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
