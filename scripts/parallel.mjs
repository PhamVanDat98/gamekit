// gamekit fanout | check-ownership | integrate — build modules in parallel on git worktrees.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists } from './lib/io.mjs';
import { log, GkError, Problems } from './lib/log.mjs';
import { requireGameRoot, loadGame } from './lib/game.mjs';
import { git, isClean, currentBranch, branchExists } from './lib/git.mjs';
import { loadModulePlan, checkModulePlan, pathUnder } from './validate.mjs';
import { markPortMapDone, scriptsBrief } from './unity.mjs';

export const branchOf = (id) => `mod/${id}`;
const mergeMessage = (id, wave) => `merge: ${id} (đợt ${wave})`;

/** A module counts as merged only when its merge commit is in base — survives branch deletion, ignores empty branches. */
export function isMerged(root, base, id) {
  const hits = git(root, ['log', base, '--merges', '--fixed-strings', `--grep=merge: ${id} (`, '--format=%H'], { allowFail: true });
  return Boolean(hits);
}

const commitsAhead = (root, base, br) => Number(git(root, ['rev-list', '--count', `${base}..${br}`]) || 0);
const worktreeDirty = (wt) => exists(wt) && (git(wt, ['status', '--porcelain'], { allowFail: true }) ?? '') !== '';
export const worktreeOf = (root, game, id) => path.join(path.dirname(root), `${game.name}.worktrees`, id);

function loadPlanOrDie(root) {
  const plan = loadModulePlan(root);
  if (!plan) throw new GkError('Chưa có module-plan.yaml — chạy skill module-plan trước.');
  const pr = checkModulePlan(plan);
  if (!pr.ok) {
    pr.report('module-plan.yaml');
    throw new GkError('module-plan.yaml không hợp lệ');
  }
  return plan;
}

const waveOf = (plan, wave) => {
  const mods = plan.modules.filter((m) => m.wave === wave);
  if (!mods.length) throw new GkError(`Không có module nào ở đợt ${wave}`);
  return mods;
};

/** Order modules so dependencies inside the same list come first. */
export function topo(mods) {
  const ids = new Set(mods.map((m) => m.id));
  const done = new Set();
  const out = [];
  const visit = (m, stack = []) => {
    if (done.has(m.id)) return;
    if (stack.includes(m.id)) throw new GkError(`Phụ thuộc vòng: ${[...stack, m.id].join(' → ')}`);
    for (const d of m.dependsOn ?? []) if (ids.has(d)) visit(mods.find((x) => x.id === d), [...stack, m.id]);
    done.add(m.id);
    out.push(m);
  };
  mods.forEach((m) => visit(m));
  return out;
}

export function briefFor(plan, m, game, root) {
  const shared = plan.shared.map((s) => `- \`${s}\``).join('\n');
  return `# Brief: ${m.id} (đợt ${m.wave}) — ${game.title}

${m.brief}

## Bạn chỉ được sửa
${m.owns.map((o) => `- \`${o}\``).join('\n')}

## Không được sửa (agent chính quản lý)
${shared}
Cần đổi contract, params hay package.json → dừng lại, ghi rõ đề xuất vào phần trả lời, không tự sửa.

## Contract dùng
${(m.contracts ?? ['contracts/']).map((c) => `- \`${c}\``).join('\n')}

${m.scripts?.length && root ? scriptsBrief(root, game, m.scripts) : ''}## Phụ thuộc
${(m.dependsOn ?? []).length ? m.dependsOn.map((d) => `- ${d} (đã merge vào ${plan.base})`).join('\n') : '- Không'}

## Xong khi
- Test xanh: ${(m.tests ?? ['npm test']).map((t) => `\`${t}\``).join(', ')}
- \`npm run typecheck\` và \`npm run lint\` sạch
- \`npm run gk -- check-ownership\` đạt
- Số liệu gameplay chỉ lấy từ \`params/\` (luật cứng: bám sát game gốc); logic \`core/\` viết test trước
- Đã commit trên nhánh \`${branchOf(m.id)}\`
`;
}

export async function fanout(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const plan = loadPlanOrDie(root);
  const wave = Number(args.wave ?? 1);
  const mods = waveOf(plan, wave);
  if (currentBranch(root) !== plan.base) throw new GkError(`Phải đứng ở nhánh ${plan.base} để fanout`);
  if (!isClean(root)) throw new GkError('Working tree chưa sạch — commit contracts/params/stub trước khi chia việc');
  for (const m of mods) for (const d of m.dependsOn ?? []) {
    if (!isMerged(root, plan.base, d)) throw new GkError(`${m.id} cần ${d} đã merge vào ${plan.base} (chạy integrate đợt trước)`);
  }
  const max = plan.maxParallel ?? 4;
  if (mods.length > max) log.warn(`Đợt ${wave} có ${mods.length} module, vượt maxParallel ${max}: chạy thành nhiều lượt`);
  const prompts = [];
  for (const m of mods) {
    const wt = worktreeOf(root, game, m.id);
    const br = branchOf(m.id);
    if (args['dry-run']) {
      log.info(`[dry-run] ${br} → ${wt}`);
      continue;
    }
    if (exists(wt)) log.warn(`${wt} đã có — giữ nguyên`);
    else {
      fs.mkdirSync(path.dirname(wt), { recursive: true });
      git(root, ['worktree', 'add', ...(branchExists(root, br) ? [wt, br] : ['-b', br, wt, plan.base])]);
    }
    const local = path.join(wt, '.gamekit', 'local');
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, 'BRIEF.md'), briefFor(plan, m, game, root));
    // Share the machine-local plugin pointer and installed dependencies with the worktree.
    const cfg = path.join(root, '.gamekit', 'local', 'config.json');
    if (exists(cfg)) fs.copyFileSync(cfg, path.join(local, 'config.json'));
    const nm = path.join(root, 'node_modules');
    if (exists(nm) && !exists(path.join(wt, 'node_modules'))) fs.symlinkSync(nm, path.join(wt, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    prompts.push({ id: m.id, worktree: wt, branch: br });
    log.ok(`${m.id}: ${br} tại ${wt}`);
  }
  if (prompts.length) {
    log.info('\nGiao cho mỗi subagent (song song, mỗi worktree một agent):');
    for (const p of prompts) log.info(`  [${p.id}] cd "${p.worktree}" && đọc .gamekit/local/BRIEF.md, làm theo, commit trên ${p.branch}.`);
    log.info(`\nXong hết thì ở ${plan.base}: gamekit integrate --wave ${wave}`);
  }
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
  const plan = loadPlanOrDie(root);
  const branch = args.branch ?? currentBranch(root);
  const id = args.module ?? (branch.startsWith('mod/') ? branch.slice(4) : null);
  if (!id) {
    log.ok(`Đang ở ${branch} (agent chính) — không giới hạn sở hữu`);
    return 0;
  }
  const mod = plan.modules.find((m) => m.id === id);
  if (!mod) throw new GkError(`module-plan.yaml không có module ${id}`);
  const files = changedFiles(root, plan.base, branch, !args.branch);
  return ownershipProblems(plan, mod, files).report(`check-ownership ${id}`) ? 0 : 1;
}

function runTests(root, cmd) {
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n') };
}

export async function integrate(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const plan = loadPlanOrDie(root);
  const wave = Number(args.wave ?? 1);
  const testCmd = args.test ?? 'npm test --silent';
  if (currentBranch(root) !== plan.base) throw new GkError(`Phải đứng ở nhánh ${plan.base} để integrate`);
  if (!isClean(root)) throw new GkError('Working tree chưa sạch');
  const mods = topo(waveOf(plan, wave));
  let merged = 0;
  for (const m of mods) {
    const br = branchOf(m.id);
    if (!branchExists(root, br)) throw new GkError(`Chưa có nhánh ${br}`);
    if (isMerged(root, plan.base, m.id)) {
      log.dim(`${m.id}: đã merge trước đó`);
      continue;
    }
    const wt = worktreeOf(root, game, m.id);
    if (worktreeDirty(wt)) throw new GkError(`${m.id}: worktree còn thay đổi chưa commit (${wt}) — subagent commit trước khi integrate`);
    if (commitsAhead(root, plan.base, br) === 0) throw new GkError(`${m.id}: nhánh ${br} chưa có commit nào — module chưa làm xong`);
    const own = ownershipProblems(plan, m, changedFiles(root, plan.base, br, false));
    if (!own.ok) {
      own.report(`check-ownership ${m.id}`);
      throw new GkError(`${m.id} sửa ngoài phạm vi — trả lại cho subagent`);
    }
    const before = git(root, ['rev-parse', 'HEAD']);
    if (args['dry-run']) {
      log.info(`[dry-run] merge ${br}`);
      continue;
    }
    const mr = git(root, ['merge', '--no-ff', '--no-edit', '-m', mergeMessage(m.id, wave), br], { allowFail: true });
    if (mr === null) {
      git(root, ['merge', '--abort'], { allowFail: true });
      throw new GkError(`${m.id}: xung đột khi merge — sửa contract hoặc giao lại module, rồi chạy lại integrate`);
    }
    const t = runTests(root, testCmd);
    if (!t.ok) {
      git(root, ['reset', '--hard', before]);
      log.info(t.out);
      throw new GkError(`${m.id}: test đỏ sau khi merge — đã hoàn tác merge này. ${merged} module trước đó vẫn giữ.`);
    }
    merged++;
    log.ok(`${m.id}: merge xong, test xanh`);
    const done = markPortMapDone(root, m.scripts, m.owns);
    if (done.length) {
      git(root, ['add', 'spec/port-map.yaml']);
      const id = git(root, ['config', 'user.email'], { allowFail: true }) ? [] : ['-c', 'user.name=GameKit', '-c', 'user.email=gamekit@localhost'];
      git(root, [...id, 'commit', '-q', '--no-verify', '-m', `chore: port-map — ${m.id} xong ${done.length} script`]);
      log.ok(`${m.id}: port-map đánh dấu done ${done.join(', ')}`);
    }
  }
  if (args.cleanup && !args['dry-run']) {
    for (const m of mods) {
      const wt = worktreeOf(root, game, m.id);
      if (!exists(wt)) continue;
      if (!isMerged(root, plan.base, m.id)) log.warn(`${m.id}: chưa merge — giữ worktree ${wt}`);
      else if (worktreeDirty(wt)) log.warn(`${m.id}: worktree còn thay đổi chưa commit — giữ ${wt}`);
      else {
        // node_modules is a symlink we created; remove it so git sees a clean tree.
        const nm = path.join(wt, 'node_modules');
        if (exists(nm) && fs.lstatSync(nm).isSymbolicLink()) fs.unlinkSync(nm);
        fs.rmSync(path.join(wt, '.gamekit', 'local'), { recursive: true, force: true });
        if (git(root, ['worktree', 'remove', wt], { allowFail: true }) === null) log.warn(`${m.id}: không gỡ được ${wt}`);
        else log.ok(`${m.id}: đã gỡ worktree`);
      }
    }
  }
  log.ok(`Đợt ${wave}: ${merged} module mới được merge vào ${plan.base}`);
  return 0;
}
