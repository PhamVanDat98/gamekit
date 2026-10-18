// spec/inventory.yaml — every gameplay type found in the original game. Each one must end up
// covered (a question in notes/QUESTIONS.md or an obligation in spec/obligations.yaml) or skipped
// with a reason, so mechanisms nobody thought to ask about cannot slip through P1.
import path from 'node:path';
import YAML from 'yaml';
import fs from 'node:fs';
import { exists, readYaml } from './io.mjs';

export const INVENTORY_FILE = 'spec/inventory.yaml';

export function loadInventory(root) {
  const f = path.join(root, INVENTORY_FILE);
  return exists(f) ? readYaml(f) : null;
}

const HEADER = `# Danh mục cơ chế của game gốc (gamekit recon). Mỗi mục phải được xử lý trước cổng P1:
#   covers: [Q3, player.move]   câu hỏi trong notes/QUESTIONS.md và/hoặc nghĩa vụ trong spec/obligations.yaml
#   skip: "lý do"               không liên quan tới gameplay (UI debug, SDK, editor…)
# ignore: bỏ nhiều mục một lúc theo mẫu (* = mọi ký tự), mỗi mẫu một lý do.
# Chạy lại recon chỉ thêm mục mới; covers/skip đã ghi được giữ nguyên.
`;

export function writeInventory(root, data) {
  const f = path.join(root, INVENTORY_FILE);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, HEADER + YAML.stringify(data, { lineWidth: 0 }));
}

/** Merge freshly found items into the existing inventory, keeping what people wrote. */
export function mergeInventory(existing, found) {
  const data = existing ? structuredClone(existing) : { source: found.source, ignore: [], items: [] };
  data.items ??= [];
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const seen = new Set();
  let added = 0;
  for (const f of found.items) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    const cur = byId.get(f.id);
    if (cur) {
      Object.assign(cur, { ...f, covers: cur.covers, skip: cur.skip });
      delete cur.missing;
      for (const k of ['covers', 'skip']) if (cur[k] === undefined) delete cur[k];
    } else {
      data.items.push({ ...f });
      added++;
    }
  }
  // Items of the same source that are gone now are flagged, not deleted (their notes may matter).
  let missing = 0;
  for (const i of data.items) if (i.where && found.items.length && sameSource(i.where, found) && !seen.has(i.id)) {
    i.missing = true;
    missing++;
  }
  if (!existing || !existing.source) data.source = found.source;
  else if (!String(existing.source).includes(found.source)) data.source = `${existing.source}; ${found.source}`;
  return { data, added, missing };
}

const sameSource = (where, found) => found.items.some((f) => f.where === where);

const globRe = (p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

/**
 * Coverage of the inventory against question ids and obligation ids.
 * { total, covered, skipped, open: [ids], badRefs: [{ id, ref }], problems: [schema-ish errors] }
 */
export function inventoryCoverage(data, { questionIds, obligationIds }) {
  const res = { total: 0, covered: 0, skipped: 0, open: [], badRefs: [], problems: [] };
  if (!data) return null;
  if (!Array.isArray(data.items)) {
    res.problems.push('thiếu danh sách items');
    return res;
  }
  const ignore = (Array.isArray(data.ignore) ? data.ignore : []).map((g) => {
    if (!g?.pattern || !String(g.reason ?? '').trim()) res.problems.push(`ignore "${g?.pattern ?? '?'}" cần pattern và reason`);
    return g?.pattern ? globRe(String(g.pattern)) : null;
  });
  const ids = new Set();
  for (const i of data.items) {
    if (!i?.id) {
      res.problems.push('có mục không có id');
      continue;
    }
    if (ids.has(i.id)) res.problems.push(`trùng id ${i.id}`);
    ids.add(i.id);
    if (i.missing) continue;
    res.total++;
    const covers = Array.isArray(i.covers) ? i.covers : i.covers ? [i.covers] : [];
    for (const ref of covers) {
      const known = /^Q\d+$/i.test(ref) ? questionIds.has(String(ref).toUpperCase()) : obligationIds.has(ref);
      if (!known) res.badRefs.push({ id: i.id, ref });
    }
    if (covers.length) res.covered++;
    else if (String(i.skip ?? '').trim() || ignore.some((re) => re?.test(i.id))) res.skipped++;
    else res.open.push(i.id);
  }
  return res;
}
