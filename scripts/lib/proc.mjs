import { spawn } from 'node:child_process';

/** Run a command without blocking, so independent checks run side by side. Resolves { status, out }; never rejects. */
export function runAsync(cmd, args, { cwd, shell = process.platform === 'win32' } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { cwd, shell, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ status: null, out: e.message });
      return;
    }
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => resolve({ status: null, out: `${out}${e.message}` }));
    child.on('close', (status) => resolve({ status, out }));
  });
}

/** Last lines of a command's output, for one-line gate details. */
export const tail = (out, n = 3) => String(out ?? '').trim().split('\n').slice(-n).join(' | ');
