// What a player downloads before the game starts, from an assembled package (layout az-v1).
// Shared by pack (manifest initialBytes) and release-check (budget.initialLoadMB) so both count the same files.
import fs from 'node:fs';
import path from 'node:path';
import { exists, walk } from './io.mjs';

/** Pre-compressed copies written by `pack --compress`. */
export const COMPRESSED = /\.(gz|br)$/;
const INITIAL = ['loader.js', 'framework.js', 'css/style.css'];

/** Outer index.html + <v>/{loader.js, framework.js, css/style.css, Icons/*} + the biggest Language/*.json (uncompressed bytes). */
export function initialLoadBytes(portalDir, version) {
  const size = (abs) => (exists(abs) ? fs.statSync(abs).size : 0);
  const inner = path.join(portalDir, String(version));
  let bytes = size(path.join(portalDir, 'index.html'));
  for (const rel of INITIAL) bytes += size(path.join(inner, rel));
  for (const rel of walk(path.join(inner, 'Icons'))) if (!COMPRESSED.test(rel)) bytes += size(path.join(inner, 'Icons', rel));
  let biggestLanguage = 0;
  for (const rel of walk(path.join(inner, 'Language')))
    if (rel.endsWith('.json')) biggestLanguage = Math.max(biggestLanguage, size(path.join(inner, 'Language', rel)));
  return bytes + biggestLanguage;
}
