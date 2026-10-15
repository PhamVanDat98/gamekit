import { execFileSync } from 'node:child_process';

export function git(cwd, args, { allowFail = false, raw = false } = {}) {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return raw ? out : out.trim();
  } catch (e) {
    if (allowFail) return null;
    const msg = (e.stderr || e.stdout || e.message).toString().trim();
    throw new Error(`git ${args.join(' ')} thất bại: ${msg}`);
  }
}

export const isRepo = (cwd) => git(cwd, ['rev-parse', '--is-inside-work-tree'], { allowFail: true }) === 'true';
export const currentBranch = (cwd) => git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
export const isClean = (cwd) => git(cwd, ['status', '--porcelain']) === '';
export const branchExists = (cwd, b) => git(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], { allowFail: true }) !== null;
