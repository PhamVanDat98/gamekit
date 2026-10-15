import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { readJson } from './io.mjs';

export const SCHEMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../schemas');

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
const cache = new Map();

export function validator(name) {
  if (!cache.has(name)) {
    const schema = readJson(path.join(SCHEMA_DIR, `${name}.schema.json`));
    cache.set(name, ajv.compile(schema));
  }
  return cache.get(name);
}

/** Returns a list of human-readable errors (empty when valid). */
export function check(name, data) {
  const v = validator(name);
  if (v(data)) return [];
  return v.errors.map((e) => {
    const where = e.instancePath || '(gốc)';
    const extra = e.params?.additionalProperty ? ` "${e.params.additionalProperty}"` : '';
    const allowed = e.params?.allowedValues ? ` (cho phép: ${e.params.allowedValues.join(', ')})` : '';
    return `${where} ${e.message}${extra}${allowed}`;
  });
}
