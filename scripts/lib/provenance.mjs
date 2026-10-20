// provenance.json: one label per shipped file.
import path from 'node:path';
import { exists, readJson, writeJson } from './io.mjs';
import { GkError } from './log.mjs';
import { nowIso } from './game.mjs';
import { check } from './schema.mjs';

export const LABELS = ['reference', 'generated', 'own', 'licensed', 'placeholder'];

/** Set the label of `files` (paths relative to the game root), replacing earlier entries. */
export function labelFiles(root, files, { label, source = null, license = null, note = null }) {
  if (!LABELS.includes(label)) throw new GkError(`--label phải là một trong: ${LABELS.join(', ')}`);
  const file = path.join(root, 'provenance.json');
  const prov = exists(file) ? readJson(file) : { entries: [] };
  const byPath = new Map(prov.entries.map((e) => [e.path, e]));
  for (const f of files) byPath.set(f, { path: f, label, source, license, note, at: nowIso() });
  prov.entries = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  const errs = check('provenance', prov);
  if (errs.length) throw new GkError(`provenance không hợp lệ: ${errs.join('; ')}`);
  writeJson(file, prov);
}
