// Portal kits: gamekit/portals/<id>/ — the shell page, loader and settings every game shares for that portal.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readYaml } from './io.mjs';
import { GkError } from './log.mjs';
import { copyrightYear } from './version.mjs';

export const PORTALS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../portals');

export const listPortals = () =>
  fs.readdirSync(PORTALS_DIR).filter((d) => exists(path.join(PORTALS_DIR, d, 'portal.yaml'))).sort();

export function loadPortal(id) {
  const dir = path.join(PORTALS_DIR, String(id));
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(id)) || !exists(path.join(dir, 'portal.yaml')))
    throw new GkError(`Không có bộ vỏ portal "${id}" (có: ${listPortals().join(', ')})`);
  return { id, dir, config: readYaml(path.join(dir, 'portal.yaml')) };
}

const CHECKS = {
  // GMSOFT_SIGNED: base64 of a JSON with `signed` and `domain`; the domain must be one the sitelock allows.
  'gmsoft-signed': (value, kit) => {
    let data;
    try {
      data = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    } catch {
      return 'không giải mã được (cần chuỗi base64 của JSON)';
    }
    if (!data || typeof data !== 'object' || !data.signed || typeof data.domain !== 'string') return 'thiếu trường signed hoặc domain';
    const domains = kit.config.sitelock ?? [];
    if (!domains.some((d) => data.domain === d || data.domain.endsWith('.' + d))) return `domain "${data.domain}" không thuộc ${domains.join(', ')}`;
    return null;
  },
};

/** One setting value → why it is wrong, or null. Missing values are reported by missingSettings(). */
export function checkSetting(kit, key, value) {
  const def = kit.config.settings?.[key];
  if (!def) return `khoá lạ "${key}" (portal ${kit.id} có: ${Object.keys(kit.config.settings ?? {}).join(', ') || 'không có'})`;
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return 'phải là chuỗi';
  if (def.pattern && !new RegExp(def.pattern).test(value)) return `sai định dạng (cần khớp ${def.pattern}${def.example ? `, vd ${def.example}` : ''})`;
  if (def.check) return CHECKS[def.check] ? CHECKS[def.check](value, kit) : `kiểm tra lạ "${def.check}"`;
  return null;
}

export const missingSettings = (kit, values = {}) =>
  Object.entries(kit.config.settings ?? {})
    .filter(([k, d]) => d.required && (values?.[k] == null || values[k] === ''))
    .map(([k]) => k);

export const copyrightFor = (kit, version) => String(kit.config.copyright ?? '').replaceAll('{{YEAR}}', copyrightYear(version));

/** Append each portal's checklist to gates/P4.md once, tagged with the portal id. */
export function applyPortalChecklists(root, portals) {
  const file = path.join(root, 'gates', 'P4.md');
  if (!exists(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  for (const p of portals) {
    for (const item of loadPortal(p).config.checklist ?? []) {
      if (!text.includes(`[${p}] ${item}`)) text = `${text.trimEnd()}\n- [ ] [${p}] ${item}\n`;
    }
  }
  fs.writeFileSync(file, text);
}
