// gamekit fanout | check-ownership | integrate — run units of a plan in parallel on git worktrees.
// Two plans share this code: module-plan.yaml (--plan build, default: modules of P2) and re-plan.yaml (--plan re: analysis areas of P1).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exists, readYaml } from './lib/io.mjs';
import { log, GkError, Problems } from './lib/log.mjs';
import { requireGameRoot, loadGame, ownershipOf } from './lib/game.mjs';
import { git, isClean, currentBranch, branchExists } from './lib/git.mjs';
import { checkModulePlan, pathUnder } from './validate.mjs';
import { branchOf as planBranch, checkRePlan, loadPlan, mergeGrep, mergeMessage, PLAN_FILES, readySet, topo, unitsOf } from './lib/plan.mjs';

export { topo };

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gamekit.mjs');
const UNIT = { re: 'mảng', build: 'module' };
const KINDS = Object.keys(PLAN_FILES);

export const branchOf = (id, kind = 'build') => planBranch(kind, id);

/** A unit counts as merged only when its merge commit is in base — survives branch deletion, ignores empty branches. */
export function isMerged(root, base, id, kind = 'build') {
  const hits = git(root, ['log', base, '--merges', '--fixed-strings', `--grep=${mergeGrep(kind, id)}`, '--format=%H'], { allowFail: true });
  return Boolean(hits);
}

const commitsAhead = (root, base, br) => Number(git(root, ['rev-list', '--count', `${base}..${br}`]) || 0);
const worktreeDirty = (wt) => exists(wt) && (git(wt, ['status', '--porcelain'], { allowFail: true }) ?? '') !== '';
/** Modules keep <game>.worktrees/<id>; areas get re-<id> so an area and a module of the same name never share a folder. */
export const worktreeOf = (root, game, id, kind = 'build') => path.join(path.dirname(root), `${game.name}.worktrees`, kind === 'build' ? id : `${kind}-${id}`);

function kindOf(args) {
  const kind = args.plan ?? 'build';
  if (!KINDS.includes(kind)) throw new GkError(`--plan phải là một trong: ${KINDS.join(', ')}`);
  return kind;
}

function loadPlanOrDie(root, kind) {
  const plan = loadPlan(root, kind);
  if (!plan) throw new GkError(kind === 'build' ? 'Chưa có module-plan.yaml — chạy skill module-plan trước.' : `Chưa có ${PLAN_FILES.re} — chia mảng phân tích trước (mẫu: re-plan.example.yaml)`);
  let pr;
  if (kind === 'build') pr = checkModulePlan(plan);
  else {
    const modulePlan = loadPlan(root, 'build');
    pr = checkRePlan(plan, { modulePlan: modulePlan && checkModulePlan(modulePlan).ok ? modulePlan : null });
  }
  if (!pr.ok) {
    pr.report(PLAN_FILES[kind]);
    throw new GkError(`${PLAN_FILES[kind]} không hợp lệ`);
  }
  return plan;
}

/** Merged and running (worktree open, not merged) units, from git — the only state parallel work keeps. */
function progress(root, game, plan, kind) {
  const units = unitsOf(plan, kind);
  const merged = new Set(units.filter((u) => isMerged(root, plan.base, u.id, kind)).map((u) => u.id));
  const running = new Set(units.filter((u) => !merged.has(u.id) && exists(worktreeOf(root, game, u.id, kind))).map((u) => u.id));
  return { units, merged, running };
}

const waveOf = (plan, wave) => {
  const mods = plan.modules.filter((m) => m.wave === wave);
  if (!mods.length) throw new GkError(`Không có module nào ở đợt ${wave}`);
  return mods;
};

const list = (xs, fmt = (x) => `- \`${x}\``) => (xs?.length ? xs.map(fmt).join('\n') : '- Không');

/** Obligations of a ledger file, for briefs: "- id: title (cases)". Missing or broken files give an empty list. */
function obligationLines(root, rel) {
  try {
    const data = exists(path.join(root, rel)) ? readYaml(path.join(root, rel)) : null;
    return (data?.obligations ?? []).map((o) => `- \`${o.id}\`: ${o.title} (case: ${(o.cases ?? []).join(', ')})`);
  } catch {
    return [];
  }
}

export function briefFor(plan, m, game, { kind = 'build', root = null, rePlan = null } = {}) {
  const deps = (m.dependsOn ?? []).map((d) => `- ${d} (đã merge vào ${plan.base})`);
  const common = `## Bạn chỉ được sửa
${list(m.owns)}

## Không được sửa (agent chính quản lý)
${list(plan.shared)}
Cần đổi contract, params dùng chung, package.json hay mục nào ở trên → dừng lại, ghi rõ đề xuất vào phần trả lời, không tự sửa.
Quyết định riêng (sai khác game gốc, bỏ một nghĩa vụ) ghi vào \`notes/${m.id}/decisions.md\` với mã \`D-${m.id}-n\`, không sửa \`DECISIONS.md\`.

## Phụ thuộc
${deps.length ? deps.join('\n') : '- Không'}
${plan.links?.length ? `\n## Tư liệu local (symlink từ thư mục game, chỉ đọc, không commit)\n${list(plan.links)}\n` : ''}`;

  if (kind === 're') {
    const thirdParty = ownershipOf(game) === 'third-party';
    const units = Object.entries(plan.units ?? {}).map(([k, v]) => `${k}: ${v}`);
    return `# Brief phân tích: mảng ${m.id} — ${game.title}

${m.brief}

Làm theo skill **re-notes**. ${thirdParty ? 'Game của người khác: chỉ phân tích file tĩnh, ghi chú bằng lời của mình, không chép code decompile.' : 'Game của người dùng: được đọc source, decompile, chạy và đo chính game này.'}

## Chỗ cần xem trong game gốc
${list(m.targets)}

## Đơn vị chuẩn (ghi params theo đúng các đơn vị này)
${list(units, (u) => `- ${u}`)}

${common}
## Đầu ra
- Câu hỏi: \`notes/${m.id}/questions.yaml\` (mẫu \`notes/questions.example.yaml\`), id \`${m.id}.<tên>\`
- Ghi chú: \`notes/${m.id}/*.md\` — Kết luận, Vị trí, Độ tin cậy, Phạm vi đã tìm, Còn chưa biết
- Số liệu: \`params/${m.id}.json\` (game đọc là \`PARAMS.${m.id}.*\`) với \`source\` + \`confidence\`; \`inferred\` có \`tolerance\`. Không sửa \`src/core/params.ts\` — agent chính nạp file khi sang P2
- Nghĩa vụ parity: \`spec/obligations/${m.id}.yaml\`, id \`${m.id}.<tên>\`; bảng nhiều điểm trong \`spec/oracles/${m.id}/\`
- Spec của mảng: \`spec/${m.id}.md\`
${m.buildModule ? `- Module dựng lại ở P2: \`${m.buildModule}\` — viết sao cho module đó làm được mà không phải hỏi lại\n` : ''}
## Xong khi
- Mọi câu hỏi bắt buộc \`answered\`, hoặc có \`openReason\` + \`impact\`
- \`npm run gk -- validate\` sạch
- \`npm run gk -- check-ownership --plan re\` đạt
- Đã commit trên nhánh \`${branchOf(m.id, kind)}\`
`;
  }

  // A module built from an analysis area gets that area's outputs as its inputs.
  const area = unitsOf(rePlan, 're').find((a) => a.buildModule === m.id);
  const fromArea = area
    ? `\n## Đầu vào từ phân tích (mảng ${area.id})
- Ghi chú: \`notes/${area.id}/\` · spec: \`spec/${area.id}.md\` · số liệu: \`params/${area.id}.json\` (\`PARAMS.${area.id}.*\`)
- Nghĩa vụ phải đóng (gắn thẻ \`[id:case]\` vào tên test):
${(root && obligationLines(root, `spec/obligations/${area.id}.yaml`).join('\n')) || `- xem \`spec/obligations/${area.id}.yaml\``}
`
    : '';
  return `# Brief: ${m.id} (đợt ${m.wave}) — ${game.title}

${m.brief}
${fromArea}
${common}
## Contract dùng
${list(m.contracts ?? ['contracts/'])}

## Xong khi
- Test xanh: ${(m.tests ?? ['npm test']).map((t) => `\`${t}\``).join(', ')}
- \`npm run typecheck\` và \`npm run lint\` sạch
- \`npm run gk -- check-ownership\` đạt
- Số liệu gameplay chỉ lấy từ \`params/\` (luật cứng: bám sát game gốc); logic \`core/\` viết test trước
- Đã commit trên nhánh \`${branchOf(m.id, kind)}\`
`;
}

/**
 * A symlink is a file to git, so ignore patterns with a trailing slash (decompiled/) do not cover it.
 * Exclude the exact names in the shared info/exclude, which every worktree of the repo reads.
 */
function excludeFromGit(root, names) {
  const common = git(root, ['rev-parse', '--git-common-dir']);
  const file = path.join(path.resolve(root, common), 'info', 'exclude');
  const have = exists(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = new Set(have.split(/\r?\n/));
  const add = names.map((n) => `/${n}`).filter((l) => !lines.has(l));
  if (!add.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${have}${have && !have.endsWith('\n') ? '\n' : ''}# GameKit: symlink tư liệu local trong worktree\n${add.join('\n')}\n`);
}

const linkNames = (plan) => (plan.links ?? []).map((l) => l.replace(/^\.\//, '').replace(/\/+$/, ''));

function openWorktree(root, game, plan, kind, m, rePlan) {
  const wt = worktreeOf(root, game, m.id, kind);
  const br = branchOf(m.id, kind);
  if (exists(wt)) log.warn(`${wt} đã có — giữ nguyên`);
  else {
    fs.mkdirSync(path.dirname(wt), { recursive: true });
    git(root, ['worktree', 'add', ...(branchExists(root, br) ? [wt, br] : ['-b', br, wt, plan.base])]);
  }
  const local = path.join(wt, '.gamekit', 'local');
  fs.mkdirSync(local, { recursive: true });
  fs.writeFileSync(path.join(local, 'BRIEF.md'), briefFor(plan, m, game, { kind, root, rePlan }));
  // Share the machine-local plugin pointer, installed dependencies and local copies of the original game.
  const cfg = path.join(root, '.gamekit', 'local', 'config.json');
  if (exists(cfg)) fs.copyFileSync(cfg, path.join(local, 'config.json'));
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  for (const name of ['node_modules', ...linkNames(plan)]) {
    const from = path.join(root, name);
    const to = path.join(wt, name);
    if (!exists(from)) {
      if (name !== 'node_modules') log.warn(`${m.id}: links ${name}/ chưa có trong thư mục game — bỏ qua`);
      continue;
    }
    if (exists(to) || isLink(to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.symlinkSync(from, to, type);
  }
  return { id: m.id, worktree: wt, branch: br };
}

const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

export async function fanout(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const kind = kindOf(args);
  const plan = loadPlanOrDie(root, kind);
  if (currentBranch(root) !== plan.base) throw new GkError(`Phải đứng ở nhánh ${plan.base} để fanout`);
  if (!isClean(root)) throw new GkError('Working tree chưa sạch — commit kế hoạch, contracts, params, stub trước khi chia việc');
  const max = plan.maxParallel ?? 4;
  const { units, merged, running } = progress(root, game, plan, kind);
  let picked;
  if (args.wave !== undefined || (kind === 'build' && !args.ready)) {
    if (kind !== 'build') throw new GkError(`${PLAN_FILES.re} không chia đợt — dùng \`fanout --plan re --ready\``);
    const wave = Number(args.wave ?? 1);
    const mods = waveOf(plan, wave);
    for (const m of mods) for (const d of m.dependsOn ?? []) {
      if (!merged.has(d)) throw new GkError(`${m.id} cần ${d} đã merge vào ${plan.base} (chạy integrate đợt trước)`);
    }
    const todo = mods.filter((m) => !merged.has(m.id));
    const room = Math.max(0, max - [...running].filter((id) => !todo.some((m) => m.id === id)).length);
    picked = todo.slice(0, room);
    if (todo.length > room) log.warn(`Đợt ${wave}: ${todo.length} module, maxParallel ${max} — mở ${room}, còn ${todo.slice(room).map((m) => m.id).join(', ')} chạy lượt sau (fanout lại khi có module merge xong)`);
  } else {
    // Units already running keep their worktree; new ones start when every dependency is merged.
    picked = readySet(units, { merged, running, maxParallel: max });
    const waiting = units.filter((u) => !merged.has(u.id) && !running.has(u.id) && !picked.includes(u));
    if (waiting.length) log.dim(`Chờ: ${waiting.map((u) => `${u.id} (${(u.dependsOn ?? []).filter((d) => !merged.has(d)).join(', ') || `maxParallel ${max}`})`).join(', ')}`);
    if (!picked.length) {
      log.info(merged.size === units.length ? `Mọi ${UNIT[kind]} đã merge.` : `Không có ${UNIT[kind]} nào sẵn sàng (đang chạy: ${[...running].join(', ') || 'không'}).`);
      return 0;
    }
  }
  if (args['dry-run']) {
    for (const m of picked) log.info(`[dry-run] ${branchOf(m.id, kind)} → ${worktreeOf(root, game, m.id, kind)}`);
    return 0;
  }
  if (linkNames(plan).length) excludeFromGit(root, linkNames(plan));
  const rePlan = kind === 'build' ? loadPlan(root, 're') : null;
  const prompts = picked.map((m) => openWorktree(root, game, plan, kind, m, rePlan));
  for (const p of prompts) log.ok(`${p.id}: ${p.branch} tại ${p.worktree}`);
  log.info('\nGiao cho mỗi subagent (song song, mỗi worktree một agent):');
  for (const p of prompts) log.info(`  [${p.id}] cd "${p.worktree}" && đọc .gamekit/local/BRIEF.md, làm theo, commit trên ${p.branch}.`);
  const again = kind === 'build' && args.wave !== undefined ? `--wave ${args.wave}` : `--plan ${kind} --ready`;
  log.info(`\nXong ${UNIT[kind]} nào thì ở ${plan.base}: gamekit integrate ${again}`);
  return 0;
}

/** Files changed on `ref` since it left base, plus uncommitted changes when checking the current tree. */
export function changedFiles(root, base, ref, includeWorking) {
  // -z: paths verbatim (Vietnamese names are not quoted); --no-renames: a move counts as delete + add, so both paths are checked.
  const diff = git(root, ['diff', '--name-only', '--no-renames', '-z', `${base}...${ref}`], { raw: true }) || '';
  const out = new Set(diff.split('\0').filter(Boolean));
  if (includeWorking) {
    const parts = (git(root, ['status', '--porcelain', '-uall', '-z'], { raw: true }) || '').split('\0').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const status = parts[i].slice(0, 2);
      out.add(parts[i].slice(3));
      if (status.includes('R') || status.includes('C')) out.add(parts[++i]); // rename/copy source path
    }
  }
  return [...out].filter((f) => !f.startsWith('.gamekit/local/'));
}

export function ownershipProblems(plan, mod, files) {
  const pr = new Problems();
  for (const f of files) {
    if (plan.shared.some((s) => pathUnder(f, s))) pr.error(mod.id, `${f} thuộc vùng dùng chung — chỉ agent chính được sửa`);
    else if (!mod.owns.some((o) => pathUnder(f, o))) pr.error(mod.id, `${f} nằm ngoài thư mục được giao (${mod.owns.join(', ')})`);
  }
  return pr;
}

export async function checkOwnership(args) {
  const root = requireGameRoot(args.cwd);
  const branch = args.branch ?? currentBranch(root);
  // The branch prefix names the plan: mod/<id> → module-plan.yaml, re/<id> → re-plan.yaml.
  const fromBranch = KINDS.find((k) => branch.startsWith(`${branchOf('', k)}`));
  const kind = args.plan ? kindOf(args) : (fromBranch ?? 'build');
  const id = args.module ?? (branch.startsWith(branchOf('', kind)) ? branch.slice(branchOf('', kind).length) : null);
  if (!id) {
    log.ok(`Đang ở ${branch} (agent chính) — không giới hạn sở hữu`);
    return 0;
  }
  const plan = loadPlanOrDie(root, kind);
  const mod = unitsOf(plan, kind).find((m) => m.id === id);
  if (!mod) throw new GkError(`${PLAN_FILES[kind]} không có ${UNIT[kind]} ${id}`);
  const files = changedFiles(root, plan.base, branch, !args.branch);
  return ownershipProblems(plan, mod, files).report(`check-ownership ${id}`) ? 0 : 1;
}

function runTests(root, cmd) {
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n') };
}

/** Analysis areas change data, not code: validate is their test. Modules run the game's tests. */
const defaultTest = (kind) => (kind === 'build' ? 'npm test --silent' : `"${process.execPath}" "${CLI}" validate`);

/**
 * Merge one unit; returns null when merged, otherwise { why, pending }. pending = the subagent is not done
 * (uncommitted work, no commit yet). The merge is undone when tests go red.
 */
function mergeUnit(root, game, plan, kind, m, { testCmd, dryRun }) {
  const br = branchOf(m.id, kind);
  const wt = worktreeOf(root, game, m.id, kind);
  if (worktreeDirty(wt)) return { pending: true, why: `worktree còn thay đổi chưa commit (${wt}) — subagent commit trước khi integrate` };
  if (commitsAhead(root, plan.base, br) === 0) return { pending: true, why: `nhánh ${br} chưa có commit nào — ${UNIT[kind]} chưa làm xong` };
  const own = ownershipProblems(plan, m, changedFiles(root, plan.base, br, false));
  if (!own.ok) {
    own.report(`check-ownership ${m.id}`);
    return { why: 'sửa ngoài phạm vi — trả lại cho subagent' };
  }
  if (dryRun) {
    log.info(`[dry-run] merge ${br}`);
    return null;
  }
  const before = git(root, ['rev-parse', 'HEAD']);
  const mr = git(root, ['merge', '--no-ff', '--no-edit', '-m', mergeMessage(kind, m.id, m.wave), br], { allowFail: true });
  if (mr === null) {
    git(root, ['merge', '--abort'], { allowFail: true });
    return { why: `xung đột khi merge — sửa ${kind === 'build' ? 'contract' : 'kế hoạch mảng'} hoặc giao lại, rồi chạy lại integrate` };
  }
  const t = runTests(root, testCmd);
  if (!t.ok) {
    git(root, ['reset', '--hard', before]);
    log.info(t.out);
    return { why: 'test đỏ sau khi merge — đã hoàn tác merge này' };
  }
  return null;
}

function removeWorktree(root, game, plan, kind, m) {
  const wt = worktreeOf(root, game, m.id, kind);
  if (!exists(wt)) return;
  if (!isMerged(root, plan.base, m.id, kind)) return log.warn(`${m.id}: chưa merge — giữ worktree ${wt}`);
  if (worktreeDirty(wt)) return log.warn(`${m.id}: worktree còn thay đổi chưa commit — giữ ${wt}`);
  // Symlinks we created (node_modules, links); remove them so git sees a clean tree.
  for (const name of ['node_modules', ...linkNames(plan)]) if (isLink(path.join(wt, name))) fs.unlinkSync(path.join(wt, name));
  fs.rmSync(path.join(wt, '.gamekit', 'local'), { recursive: true, force: true });
  if (git(root, ['worktree', 'remove', wt], { allowFail: true }) === null) log.warn(`${m.id}: không gỡ được ${wt}`);
  else log.ok(`${m.id}: đã gỡ worktree`);
}

export async function integrate(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const kind = kindOf(args);
  const plan = loadPlanOrDie(root, kind);
  const testCmd = args.test ?? defaultTest(kind);
  if (currentBranch(root) !== plan.base) throw new GkError(`Phải đứng ở nhánh ${plan.base} để integrate`);
  if (!isClean(root)) throw new GkError('Working tree chưa sạch');
  const byWave = kind === 'build' && (args.wave !== undefined || !args.ready);
  if (kind !== 'build' && args.wave !== undefined) throw new GkError(`${PLAN_FILES.re} không chia đợt — dùng \`integrate --plan re --ready\``);
  const wave = byWave ? Number(args.wave ?? 1) : null;
  const units = byWave ? topo(waveOf(plan, wave)) : topo(unitsOf(plan, kind));
  const merged = new Set(unitsOf(plan, kind).filter((u) => isMerged(root, plan.base, u.id, kind)).map((u) => u.id));
  const failed = new Map(); // id → why; dependents of a failed unit are skipped, not merged
  const blocked = new Map();
  let count = 0;
  for (const m of units) {
    if (merged.has(m.id)) {
      log.dim(`${m.id}: đã merge trước đó`);
      continue;
    }
    if (!branchExists(root, branchOf(m.id, kind))) {
      if (byWave) throw new GkError(`Chưa có nhánh ${branchOf(m.id, kind)}`);
      continue; // not fanned out yet
    }
    const waitOn = (m.dependsOn ?? []).filter((d) => !merged.has(d));
    if (waitOn.length) {
      blocked.set(m.id, waitOn);
      continue;
    }
    const res = mergeUnit(root, game, plan, kind, m, { testCmd, dryRun: args['dry-run'] });
    if (res?.pending && !byWave) {
      log.dim(`${m.id}: chưa xong — ${res.why}`); // --ready merges what is done and leaves the rest running
      continue;
    }
    const why = res?.why;
    if (why) {
      if (!args['keep-going']) throw new GkError(`${m.id}: ${why}. ${count} ${UNIT[kind]} trước đó vẫn giữ.`);
      failed.set(m.id, why);
      log.fail(`${m.id}: ${why}`);
      continue;
    }
    if (args['dry-run']) continue;
    merged.add(m.id);
    count++;
    log.ok(`${m.id}: merge xong, test xanh`);
  }
  if (args.cleanup && !args['dry-run']) for (const m of units) removeWorktree(root, game, plan, kind, m);
  for (const [id, deps] of blocked) log.warn(`${id}: chờ ${deps.join(', ')} merge${deps.some((d) => failed.has(d)) ? ' (đang lỗi)' : ''}`);
  log.ok(`${byWave ? `Đợt ${wave}` : PLAN_FILES[kind]}: ${count} ${UNIT[kind]} mới được merge vào ${plan.base}${failed.size ? `, ${failed.size} lỗi: ${[...failed.keys()].join(', ')}` : ''}`);
  if (!byWave && count) log.info(`Mở tiếp ${UNIT[kind]} vừa đủ điều kiện: gamekit fanout --plan ${kind} --ready`);
  return failed.size ? 1 : 0;
}
