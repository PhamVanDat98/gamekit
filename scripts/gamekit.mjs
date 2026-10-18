#!/usr/bin/env node
// GameKit CLI. Every agent (Claude Code, Codex) and every IDE task calls this same entry point.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { log } from './lib/log.mjs';

const HELP = `GameKit — port & reskin web game

Dùng: gamekit <lệnh> [tuỳ chọn]

  init <tên> [--title] [--engine] [--dir] [--set k=v…] [--no-input] [--third-party]   Tạo game mới; hỏi thông tin dự án (terminal) hoặc nhận --set.
                                            Mặc định là game của bạn; --third-party khi làm lại game người khác (bắt buộc reskin)
  init <tên> --questions --json             In danh sách câu hỏi kèm giải thích (cho agent hỏi người dùng)
  config [--portal p] [--set k=v…] [--questions --json]   Điền thông tin portal còn thiếu, thêm portal
  status | next                             Game đang ở pha nào, việc gì tiếp
  gate [--advance]                          Kiểm tra cổng của pha hiện tại
  validate [--stage P2]                     Kiểm tra game.yaml, params, obligations, oracle, provenance, module-plan, asset-manifest
  parity [--report file.json]               Đóng nghĩa vụ trong spec/obligations.yaml bằng test gắn thẻ [id:case] (chạy vitest)
  re [--watch] [--json] [--last N]          Theo dõi RE: câu hỏi, bước phân tích, evidence (notes/re-log.jsonl); --watch cập nhật trực tiếp
  re focus <Q#> | --clear                   Câu hỏi đang làm — các bước phân tích sau đó gắn vào câu này
  re log "<tóm tắt>" [--kind note|inspect|conclude] [--q Q#] [--tool t] [--evidence ev_…]   Ghi tay một bước (công cụ GUI, Codex)
  provenance add <file…> --label <nhãn>     Gắn nguồn gốc asset (reference|generated|own|licensed|placeholder)
  provenance list [--label]
  pack [--portal a,b | --all] [--version V] [--compress] [--zip]   builds/<YYMMDDNN>/<portal>/ theo bố cục portal
  release-check [--version V] [--portal p]   Cổng phát hành cho builds/<V> (mặc định bản mới nhất)
  fanout --wave N [--dry-run]               Tạo worktree + brief cho từng module của đợt
  check-ownership [--module id]             Module chỉ sửa trong thư mục được giao
  integrate --wave N [--test "cmd"] [--cleanup]   Merge theo phụ thuộc, test sau mỗi lần
  precommit                                 (git hook) chặn asset gốc, code decompile, asset chưa nhãn
`;

// Flags that are boolean switches; they never consume the next word.
const BOOL = new Set(['all', 'advance', 'dry-run', 'cleanup', 'compress', 'zip', 'quiet', 'no-git', 'no-install', 'help', 'questions', 'json', 'no-input', 'third-party', 'watch', 'clear']);

export function parseArgs(argv) {
  const out = { _: [] };
  // A repeated flag (--set a=1 --set b=2) collects into an array.
  const put = (k, v) => (out[k] = k in out ? [].concat(out[k], v) : v);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) put(k, v);
      else if (!BOOL.has(k) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) put(k, argv[++i]);
      else put(k, true);
    } else out._.push(a);
  }
  return out;
}

const COMMANDS = {
  init: () => import('./init.mjs').then((m) => m.run),
  config: () => import('./config.mjs').then((m) => m.run),
  status: () => import('./status.mjs').then((m) => m.run),
  next: () => import('./status.mjs').then((m) => m.run),
  gate: () => import('./gate.mjs').then((m) => m.run),
  validate: () => import('./validate.mjs').then((m) => m.run),
  parity: () => import('./parity.mjs').then((m) => m.run),
  re: () => import('./re.mjs').then((m) => m.run),
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
  ensureDeps();
  const fn = await load();
  return fn({ ...args, _: rest, cmd });
}

/**
 * Claude Code installs plugins by copying the repo, without node_modules. Install the plugin's own
 * dependencies (yaml, ajv) the first time any command needs them, wherever it is run from.
 */
function ensureDeps() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const need = ['yaml', 'ajv'].filter((d) => !fs.existsSync(path.join(root, 'node_modules', d, 'package.json')));
  if (!need.length) return;
  log.info(`GameKit cài thư viện lần đầu (${need.join(', ')})…`);
  const r = spawnSync('npm', ['install', '--omit=dev', '--prefer-offline', '--no-audit', '--no-fund', '--silent'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    const e = new Error(`Không cài được thư viện của GameKit. Chạy tay: cd "${root}" && npm install`);
    e.exitCode = 1;
    throw e;
  }
}

// Resolve symlinks so `npm link` / npx bins (…/bin/gamekit) count as running this file.
const realArgv1 = (() => {
  try {
    return fs.realpathSync(process.argv[1] ?? '');
  } catch {
    return '';
  }
})();
const isMain = realArgv1 === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((e) => {
      log.fail(e.message);
      if (process.env.GK_DEBUG) console.error(e.stack);
      process.exit(e.exitCode ?? 1);
    });
}
