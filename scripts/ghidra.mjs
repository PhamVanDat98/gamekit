// gamekit ghidra <binary> — analyse a native binary of the original game with Ghidra headless and export
// what a port needs: function list, strings, decompiled C of chosen functions. IL2CPP: names from an
// Il2CppDumper script.json. Project in .gamekit/ghidra/, output in decompiled/ghidra/ (both gitignored).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exists, readJson, writeJson, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame, nowIso } from './lib/game.mjs';
import { listZip, readZipEntry } from './lib/unzip.mjs';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ghidra');
const ARCHIVE = /\.(apk|xapk|apks|aab|ipa|zip)$/i;

export function launcher(home, platform = process.platform) {
  const f = path.join(home, 'support', platform === 'win32' ? 'analyzeHeadless.bat' : 'analyzeHeadless');
  if (!exists(f)) throw new GkError(`Không thấy ${f} — GHIDRA_HOME phải trỏ tới thư mục cài Ghidra (có support/analyzeHeadless)`);
  return f;
}

/** Arguments for analyzeHeadless. `imported`: the program is already in the project → skip import + analysis. */
export function headlessArgs({ projectDir, project, binary, imported, outDir, il2cpp, functions, max, timeout }) {
  const a = [projectDir, project];
  if (imported) a.push('-process', path.basename(binary), '-noanalysis');
  else {
    a.push('-import', binary, '-overwrite');
    if (timeout) a.push('-analysisTimeoutPerFile', String(timeout));
  }
  a.push('-scriptPath', SCRIPTS, '-postScript', 'GameKitExport.java', outDir, il2cpp ?? '-', functions ?? '-', String(max ?? 200));
  return a;
}

/**
 * analyzeHeadless is a .bat on Windows: cmd.exe would split paths with spaces and read "|" in a
 * --functions regex as a pipe, so quote every argument ourselves.
 */
function runHeadless(exe, args) {
  if (process.platform !== 'win32') return spawnSync(exe, args, { stdio: 'inherit' });
  const line = [exe, ...args].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(' ');
  return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { stdio: 'inherit', windowsVerbatimArguments: true });
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const given = args._[0];
  if (!given) throw new GkError('Dùng: gamekit ghidra <file nhị phân | file .apk/.ipa --entry lib/arm64-v8a/libil2cpp.so> [--il2cpp script.json] [--functions <regex>|all] [--max 200] [--reanalyze] [--timeout giây] [--dry-run]');
  let binary = path.resolve(args.cwd ?? process.cwd(), given);
  if (!exists(binary)) throw new GkError(`Không có ${given}`);
  const local = path.join(root, '.gamekit', 'ghidra');
  fs.mkdirSync(local, { recursive: true });

  let program = path.basename(binary); // name in the project and under decompiled/ghidra/
  let identity; // what the program was imported from: a different file means a new import
  if (ARCHIVE.test(binary)) {
    // Native code inside an APK/IPA: copy the one entry out (lib/<abi>/libil2cpp.so, Frameworks/UnityFramework…).
    // XAPK/APKS: native code sits in split APKs inside — "config.arm64_v8a.apk!/lib/arm64-v8a/libil2cpp.so".
    const archiveFile = binary;
    const outer = listZip(archiveFile);
    const native = (list, prefix) => list.filter((e) => /(^|\/)lib\/[^/]+\/[^/]+\.so$|\.framework\/[^/.]+$|GameAssembly\.dll$/.test(e.name)).map((e) => prefix + e.name);
    // Split APKs are unpacked to a temp file only while we read them.
    const withInner = (name, fn) => {
      const e = outer.find((x) => x.name === name);
      if (!e) throw new GkError(`${given} không có ${name}`);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-ghidra-'));
      try {
        const f = path.join(dir, path.basename(name));
        fs.writeFileSync(f, readZipEntry(archiveFile, e, { limit: 2 * 1024 ** 3 }));
        return fn(f);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };
    if (!args.entry) {
      const natives = [...native(outer, ''), ...outer.filter((e) => /\.apk$/i.test(e.name)).flatMap((e) => withInner(e.name, (f) => native(listZip(f), `${e.name}!/`)))];
      throw new GkError(`${given} là file nén — chọn file trong đó bằng --entry:\n${natives.map((n) => `  ${n}`).join('\n') || '  (không thấy thư viện native)'}`);
    }
    const [apk, rest] = String(args.entry).includes('!/') ? String(args.entry).split('!/') : [null, String(args.entry)];
    const abi = /(^|\/)lib\/([^/]+)\/[^/]+$/.exec(rest)?.[2];
    program = abi ? `${abi}_${path.basename(rest)}` : path.basename(rest);
    const to = path.join(local, 'bin', program);
    const extract = (archive) => {
      const entry = listZip(archive).find((e) => e.name === rest);
      if (!entry) throw new GkError(`${given} không có ${args.entry}`);
      identity = `${toPosix(archiveFile)}!/${args.entry}:${entry.size}:${fs.statSync(archiveFile).mtimeMs}`;
      if (args['dry-run']) return;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, readZipEntry(archive, entry, { limit: 2 * 1024 ** 3 }));
    };
    if (apk) withInner(apk, extract);
    else extract(archiveFile);
    binary = to;
  } else {
    const st = fs.statSync(binary);
    identity = `${toPosix(binary)}:${st.size}:${st.mtimeMs}`;
  }

  const il2cpp = args.il2cpp ? path.resolve(args.cwd ?? process.cwd(), args.il2cpp) : null;
  if (il2cpp && !exists(il2cpp)) throw new GkError(`Không có ${args.il2cpp} (script.json của Il2CppDumper)`);
  const functions = args.functions === true ? 'all' : args.functions;
  if (functions && functions !== 'all') {
    try {
      new RegExp(functions);
    } catch (e) {
      throw new GkError(`--functions không phải regex hợp lệ: ${e.message}`);
    }
  }
  const max = args.max === undefined ? 200 : Number(args.max);
  if (!Number.isInteger(max) || max < 1) throw new GkError('--max phải là số nguyên dương');
  const stateFile = path.join(local, 'imported.json');
  const state = exists(stateFile) ? readJson(stateFile) : {};
  const known = state[program] && exists(path.join(local, `${game.name}.rep`));
  const changed = known && state[program].identity !== identity;
  const imported = !args.reanalyze && known && !changed;
  const outDir = path.join(root, 'decompiled', 'ghidra', program);
  const a = headlessArgs({ projectDir: local, project: game.name, binary, imported, outDir, il2cpp, functions, max, timeout: args.timeout });

  const home = args['ghidra-home'] ?? process.env.GHIDRA_HOME;
  if (args['dry-run']) {
    log.info(['analyzeHeadless', ...a].map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' '));
    return 0;
  }
  if (!home) throw new GkError('Chưa có Ghidra: đặt biến môi trường GHIDRA_HOME (thư mục cài Ghidra 11+, cần JDK 21) hoặc --ghidra-home <thư mục>');
  const exe = launcher(home);
  if (changed) log.info(`Ghidra: ${program} khác file đã phân tích trước đây — nhập và phân tích lại`);
  log.info(imported ? `Ghidra: ${program} đã phân tích — chỉ xuất lại (--reanalyze để phân tích lại)` : `Ghidra: nhập và phân tích ${program} (file lớn như libil2cpp.so có thể mất hàng giờ)…`);
  // Old output must not pass for this run's: the script writes "done" as its last step.
  for (const f of ['functions.tsv', 'strings.tsv', 'c', 'done']) fs.rmSync(path.join(outDir, f), { recursive: true, force: true });
  const r = runHeadless(exe, a);
  if (r.status !== 0) throw new GkError(`analyzeHeadless dừng với mã ${r.status ?? r.signal}`);
  if (!exists(path.join(outDir, 'done'))) throw new GkError(`GameKitExport.java không chạy xong (xem "SCRIPT ERROR" trong log phía trên) — ${toPosix(path.relative(root, outDir))}/ không dùng được`);

  state[program] = { binary: toPosix(binary), identity, il2cpp: Boolean(il2cpp), at: nowIso() };
  writeJson(stateFile, state);
  const name = program;
  const programs = (game.ghidra?.programs ?? []).filter((p) => p.name !== name);
  programs.push({ name, il2cpp: Boolean(il2cpp) || Boolean(game.ghidra?.programs?.find((p) => p.name === name)?.il2cpp), exportedAt: nowIso() });
  updateGame(root, [[['ghidra'], { project: '.gamekit/ghidra', output: 'decompiled/ghidra', programs }]]);
  const count = fs.readFileSync(path.join(outDir, 'functions.tsv'), 'utf8').split('\n').filter(Boolean).length - 1;
  const c = path.join(outDir, 'c');
  log.ok(`decompiled/ghidra/${name}/: ${count} hàm trong functions.tsv${exists(c) ? `, ${fs.readdirSync(c).length} file C` : ''}, strings.tsv`);
  log.info('Đọc ở đó, ghi kết luận vào notes/ (skill re-notes). decompiled/ không bao giờ được commit.');
  return 0;
}
