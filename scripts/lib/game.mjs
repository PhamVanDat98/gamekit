import path from 'node:path';
import YAML from 'yaml';
import { exists, readYaml, readYamlDoc, writeYamlDoc } from './io.mjs';
import { GkError } from './log.mjs';

/** Walk up from `start` to find the folder holding game.yaml. */
export function findGameRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (exists(path.join(dir, 'game.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function requireGameRoot(start) {
  const root = findGameRoot(start);
  if (!root) throw new GkError('Không tìm thấy game.yaml. Chạy trong thư mục game, hoặc tạo game mới bằng `gamekit init <tên>`.');
  return root;
}

export const loadGame = (root) => readYaml(path.join(root, 'game.yaml'));

/** Update game.yaml in place (keeps comments). `edits` = [[pathArray, value], …] */
export function updateGame(root, edits) {
  const file = path.join(root, 'game.yaml');
  const doc = readYamlDoc(file);
  for (const [p, v] of edits) doc.setIn(p, v);
  // Keep maps in block style so game.yaml stays easy to read and diff.
  YAML.visit(doc, { Map: (_, node) => void (node.flow = false) });
  writeYamlDoc(file, doc);
}

/** `own` (default: the user's game — keep its art, sound, name) or `third-party` (remake: reskin required). */
export const ownershipOf = (game) => game?.source?.ownership ?? 'own';
export const OWNERSHIP_LABEL = { own: 'game của bạn', 'third-party': 'làm lại game người khác' };

export const nowIso =() => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
