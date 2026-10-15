#!/usr/bin/env node
// GameKit CLI. Every agent (Claude Code, Codex) and every IDE task calls this same entry point.
import { log } from './lib/log.mjs';

const HELP = `GameKit — port & reskin web game

Dùng: gamekit <lệnh> [tuỳ chọn]

  init <tên> [--title] [--engine] [--dir]   Tạo game mới từ template
  status | next                             Game đang ở pha nào, việc gì tiếp
  gate [--advance]                          Kiểm tra cổng của pha hiện tại
  validate [--stage P2]                     Kiểm tra game.yaml, params, provenance, module-plan, asset-manifest
  provenance add <file…> --label <nhãn>     Gắn nguồn gốc asset (reference|generated|own|licensed|placeholder)
  provenance list [--label]
  pack [--portal a,b | --all] [--compress] [--zip]   Đóng gói mỗi portal một bản trong dist/
  release-check [--portal]                  Cổng phát hành
  fanout --wave N [--dry-run]               Tạo worktree + brief cho từng module của đợt
  check-ownership [--module id]             Module chỉ sửa trong thư mục được giao
  integrate --wave N [--test "cmd"] [--cleanup]   Merge theo phụ thuộc, test sau mỗi lần
  precommit                                 (git hook) chặn asset gốc, code decompile, asset chưa nhãn
`;

// Flags that are boolean switches; they never consume the next word.
const BOOL = new Set(['all', 'advance', 'dry-run', 'cleanup', 'compress', 'zip', 'quiet', 'no-git', 'no-install', 'help']);

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) out[k] = v;
      else if (!BOOL.has(k) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

const COMMANDS = {
  init: () => import('./init.mjs').then((m) => m.run),
  status: () => import('./status.mjs').then((m) => m.run),
  next: () => import('./status.mjs').then((m) => m.run),
  gate: () => import('./gate.mjs').then((m) => m.run),
  validate: () => import('./validate.mjs').then((m) => m.run),
  provenance: () => import('./provenance.mjs').then((m) => m.run),
  pack: () => import('./pack.mjs').then((m) => m.run),
  'release-check': () => import('./release-check.mjs').then((m) => m.run),
  fanout: () => import('./parallel.mjs').then((m) => m.fanout),
  'check-ownership': () => import('./parallel.mjs').then((m) => m.checkOwnership),
  integrate: () => import('./parallel.mjs').then((m) => m.integrate),
  precommit: () => import('./precommit.mjs').then((m) => m.run),
};

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const [cmd, ...rest] = args._;
  if (!cmd || cmd === 'help' || args.help) {
    log.info(HELP);
    return 0;
  }
  const load = COMMANDS[cmd];
  if (!load) {
    log.fail(`Không có lệnh "${cmd}"`);
    log.info(HELP);
    return 2;
  }
  const fn = await load();
  return fn({ ...args, _: rest, cmd });
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gamekit.mjs');
if (isMain) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((e) => {
      log.fail(e.message);
      if (process.env.GK_DEBUG) console.error(e.stack);
      process.exit(e.exitCode ?? 1);
    });
}
