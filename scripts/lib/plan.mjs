// Work plans for parallel agents: re-plan.yaml (kind re: analysis areas, P1) and module-plan.yaml (kind build: modules, P2).
// Both describe units of work that each own some paths, depend on other units, and run on their own branch/worktree.
import path from 'node:path';
import { exists, readYaml } from './io.mjs';
import { GkError, Problems } from './log.mjs';
import { check } from './schema.mjs';

export const PLAN_FILES = { re: 're-plan.yaml', build: 'module-plan.yaml' };
const UNITS_KEY = { re: 'areas', build: 'modules' };
const UNIT_NAME = { re: 'mảng', build: 'module' };
const BRANCH_PREFIX = { re: 're', build: 'mod' };

export function loadPlan(root, kind) {
  const f = path.join(root, PLAN_FILES[kind]);
  return exists(f) ? readYaml(f) : null;
}

export const unitsOf = (plan, kind) => plan?.[UNITS_KEY[kind]] ?? [];
export const branchOf = (kind, id) => `${BRANCH_PREFIX[kind]}/${id}`;
/** Merge commit subject; `isMerged` greps for it. Build keeps the original "merge: <id> (đợt N)". */
export const mergeMessage = (kind, id, wave) => `merge: ${kind === 'build' ? id : branchOf(kind, id)} (${wave ? `đợt ${wave}` : UNIT_NAME[kind]})`;
export const mergeGrep = (kind, id) => `merge: ${kind === 'build' ? id : branchOf(kind, id)} (`;

const norm = (p) => p.replace(/^\.\//, '');
export const pathUnder = (file, prefix) => {
  const f = norm(file);
  const pre = norm(prefix);
  return pre.endsWith('/') ? f.startsWith(pre) : f === pre || f.startsWith(pre + '/');
};
export const overlaps = (a, b) => pathUnder(a, b) || pathUnder(b, a) || norm(a) === norm(b);

/** Order units so dependencies inside the same list come first; a cycle is an error. */
export function topo(units) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const done = new Set();
  const out = [];
  const visit = (u, stack = []) => {
    if (done.has(u.id)) return;
    if (stack.includes(u.id)) throw new GkError(`Phụ thuộc vòng: ${[...stack, u.id].join(' → ')}`);
    for (const d of u.dependsOn ?? []) if (byId.has(d)) visit(byId.get(d), [...stack, u.id]);
    done.add(u.id);
    out.push(u);
  };
  units.forEach((u) => visit(u));
  return out;
}

/**
 * Units that can start now: not merged, not already running, every dependency merged.
 * At most maxParallel units run at once, counting the ones already running. Dependency order.
 */
export function readySet(units, { merged = new Set(), running = new Set(), maxParallel = Infinity } = {}) {
  const ready = topo(units).filter((u) => !merged.has(u.id) && !running.has(u.id) && (u.dependsOn ?? []).every((d) => merged.has(d)));
  return ready.slice(0, Math.max(0, maxParallel - running.size));
}

/** Rules both plans share: unique ids, dependencies exist, one owner per path, nobody owns shared paths, links are local relative dirs. */
export function checkUnits(plan, kind, pr, where) {
  const units = unitsOf(plan, kind);
  const name = UNIT_NAME[kind];
  const ids = new Set();
  for (const u of units) {
    if (ids.has(u.id)) pr.error(where, `${name} trùng id ${u.id}`);
    ids.add(u.id);
  }
  for (const u of units) {
    for (const d of u.dependsOn ?? []) if (!ids.has(d)) pr.error(where, `${u.id} phụ thuộc ${d} không tồn tại`);
    for (const o of u.owns) for (const s of plan.shared) if (overlaps(o, s)) pr.error(where, `${u.id} sở hữu ${o} nhưng đây là vùng dùng chung (${s})`);
  }
  const all = units.flatMap((u) => u.owns.map((o) => [u.id, o]));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      if (all[i][0] !== all[j][0] && overlaps(all[i][1], all[j][1]))
        pr.error(where, `${all[i][0]} và ${all[j][0]} cùng sở hữu ${all[i][1]} / ${all[j][1]}: mỗi file chỉ một chủ`);
  try {
    topo(units);
  } catch (e) {
    pr.error(where, e.message);
  }
  for (const l of plan.links ?? []) {
    if (path.isAbsolute(l) || /^[a-z]:/i.test(l) || norm(l).split('/').includes('..')) pr.error(where, `links: ${l} phải là đường dẫn tương đối trong thư mục game`);
    else if (all.some(([, o]) => overlaps(o, l)) || plan.shared.some((s) => overlaps(s, l))) pr.error(where, `links: ${l} trùng với đường dẫn được sở hữu — chỉ symlink tư liệu local, không symlink code`);
  }
  return pr;
}

/** re-plan.yaml: schema, shared rules, each area owns notes/<id>/, buildModule exists in module-plan.yaml (when there is one). */
export function checkRePlan(plan, { modulePlan = null } = {}) {
  const pr = new Problems();
  const where = PLAN_FILES.re;
  for (const e of check('re-plan', plan)) pr.error(where, e);
  if (!pr.ok) return pr;
  checkUnits(plan, 're', pr, where);
  const modules = new Set(unitsOf(modulePlan, 'build').map((m) => m.id));
  for (const a of plan.areas) {
    if (!a.owns.some((o) => pathUnder(`notes/${a.id}/`, o))) pr.error(where, `${a.id} phải sở hữu notes/${a.id}/ (câu hỏi, ghi chú, quyết định D-${a.id}-n)`);
    if (a.buildModule && modulePlan && !modules.has(a.buildModule)) pr.error(where, `${a.id}: buildModule ${a.buildModule} không có trong ${PLAN_FILES.build}`);
  }
  return pr;
}

