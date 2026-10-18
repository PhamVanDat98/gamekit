import game from '../../params/game.json';

/** Strips {value, source, …} wrappers so code reads plain numbers. */
export type Unwrap<T> = T extends { value: infer V }
  ? V
  : T extends object
    ? { [K in keyof T as K extends '$schema' ? never : K]: Unwrap<T[K]> }
    : T;

export function unwrap<T>(node: T): Unwrap<T> {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    if ('value' in node) return (node as { value: unknown }).value as Unwrap<T>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) if (k !== '$schema') out[k] = unwrap(v);
    return out as Unwrap<T>;
  }
  return node as Unwrap<T>;
}

/**
 * params/<name>.json besides game.json, one entry per file, keyed by its name:
 * params/player.json → PARAMS.player.*. `gamekit validate` fails while a file is missing here.
 *   import player from '../../params/player.json';
 *   const FILES = { player };
 */
const FILES = {};

/**
 * Gameplay numbers. Every one comes from params/*.json with a source in the
 * original game — never type a gameplay number in code (hard rule).
 * game.json sits at the root; `validate` rejects a group defined in two files.
 */
export const PARAMS = { ...unwrap(game), ...unwrap(FILES) };
export type Params = typeof PARAMS;
