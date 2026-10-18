import { spawn } from 'node:child_process';

/** spawnSync without blocking, so independent checks (test, typecheck, lint, build) run side by side. */
export function runAsync(cmd, args, { cwd, env, shell = false } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(cmd, args, { cwd, env, shell, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', (e) => resolve({ status: null, stdout, stderr: `${stderr}${e.message}` }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
