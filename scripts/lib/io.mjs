import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const exists = (p) => fs.existsSync(p);

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Không đọc được JSON ${file}: ${e.message}`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function readYaml(file) {
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
  } catch (e) {
    throw new Error(`Không đọc được YAML ${file}: ${e.message}`);
  }
}

/** Load a YAML document keeping comments, so edits don't wipe what people wrote. */
export function readYamlDoc(file) {
  return YAML.parseDocument(fs.readFileSync(file, 'utf8'));
}

export function writeYamlDoc(file, doc) {
  fs.writeFileSync(file, String(doc));
}

export function writeYaml(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify(data));
}

/** Recursively list files under dir (relative paths, forward slashes). */
export function walk(dir, { ignore = [] } = {}) {
  const out = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return out;
  const rec = (abs, rel) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ignore.some((i) => r === i || r.startsWith(i.endsWith('/') ? i : i + '/'))) continue;
      const a = path.join(abs, ent.name);
      if (ent.isDirectory()) rec(a, r);
      else out.push(r);
    }
  };
  rec(dir, '');
  return out.sort();
}

export function copyDir(src, dst, { transform } = {}) {
  for (const rel of walk(src)) {
    const from = path.join(src, rel);
    // npm strips .gitignore from packages, so templates ship it as _gitignore.
    const toRel = rel.replace(/(^|\/)_gitignore$/, '$1.gitignore');
    const to = path.join(dst, toRel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const buf = fs.readFileSync(from);
    if (transform && isText(rel)) fs.writeFileSync(to, transform(buf.toString('utf8'), toRel));
    else fs.writeFileSync(to, buf);
  }
}

const TEXT_EXT = /\.(md|json|ya?ml|ts|tsx|js|mjs|cjs|html|css|txt|svg)$|(^|\/)(_?gitignore|\.?[a-z]+rc)$/i;
export const isText = (rel) => TEXT_EXT.test(rel);

export const toPosix = (p) => p.split(path.sep).join('/');
