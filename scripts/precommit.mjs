// gamekit precommit — run by .githooks/pre-commit. Blocks reference assets, decompiled code and unlabeled assets.
import path from 'node:path';
import { log, Problems } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { git } from './lib/git.mjs';
import { readYaml } from './lib/io.mjs';
import { check } from './lib/schema.mjs';
import { loadProvenance, SHIPPED_DIRS, FORBIDDEN_DIRS, pathUnder } from './validate.mjs';

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const pr = new Problems();
  // -z keeps non-ASCII (Vietnamese) paths verbatim instead of quoting them.
  const staged = (git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { raw: true }) || '').split('\0').filter(Boolean);
  // Judge by the provenance.json being committed, not the working copy.
  const stagedProv = git(root, ['show', ':provenance.json'], { allowFail: true, raw: true });
  let prov;
  try {
    prov = stagedProv ? JSON.parse(stagedProv) : loadProvenance(root);
  } catch {
    prov = loadProvenance(root);
  }
  const labels = new Map((prov.entries ?? []).map((e) => [e.path, e.label]));
  for (const f of staged) {
    if (FORBIDDEN_DIRS.some((d) => pathUnder(f, d + '/'))) pr.error(f, 'thư mục cấm commit (asset gốc / code decompile / dữ liệu local)');
    if (/\.(il|cs\.decompiled|decompiled)$|(^|\/)(Assembly-CSharp|dump)\.cs$/i.test(f)) pr.error(f, 'trông như code decompile — chỉ commit ghi chú RE viết bằng lời của mình');
    if (SHIPPED_DIRS.some((d) => pathUnder(f, d + '/')) && path.basename(f) !== '.gitkeep') {
      const label = labels.get(f);
      if (!label) pr.error(f, 'asset chưa có nhãn provenance');
      else if (label === 'reference') pr.error(f, 'asset reference của game gốc không được commit vào thư mục phát hành');
    }
  }
  if (staged.includes('game.yaml')) for (const e of check('game', readYaml(path.join(root, 'game.yaml')))) pr.error('game.yaml', e);
  if (!pr.ok) log.info('Commit bị chặn bởi GameKit:');
  return pr.report('pre-commit') ? 0 : 1;
}
