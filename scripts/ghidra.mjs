// gamekit ghidra <binary> — analyse a native binary of the original game with Ghidra headless and export
// what a port needs: function list, strings, decompiled C of chosen functions. IL2CPP: names from an
// Il2CppDumper script.json. Project in .gamekit/ghidra/, output in decompiled/ghidra/ (both gitignored).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exists, readJson, writeJson, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame, nowIso } from './lib/game.mjs';
import { listZip, readZipEntry } from './lib/unzip.mjs';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ghidra');
const ARCHIVE = /\.(apk|xapk|aab|ipa|zip)$/i;

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

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const given = args._[0];
  if (!given) throw new GkError('Dùng: gamekit ghidra <file nhị phân | file .apk/.ipa --entry lib/arm64-v8a/libil2cpp.so> [--il2cpp script.json] [--functions <regex>|all] [--max 200] [--reanalyze] [--timeout giây] [--dry-run]');
  let binary = path.resolve(args.cwd ?? process.cwd(), given);
  if (!exists(binary)) throw new GkError(`Không có ${given}`);
  const local = path.join(root, '.gamekit', 'ghidra');
  fs.mkdirSync(local, { recursive: true });

  if (ARCHIVE.test(binary)) {
    // Native code inside an APK/IPA: copy the one entry out (lib/<abi>/libil2cpp.so, Frameworks/UnityFramework…).
    if (!args.entry) {
      const natives = listZip(binary).filter((e) => /(^|\/)lib\/[^/]+\/[^/]+\.so$|\.framework\/[^/.]+$|GameAssembly\.dll$/.test(e.name));
      throw new GkError(`${given} là file nén — chọn file trong đó bằng --entry:\n${natives.map((e) => `  ${e.name}`).join('\n') || '  (không thấy thư viện native)'}`);
    }
    const entry = listZip(binary).find((e) => e.name === args.entry);
    if (!entry) throw new GkError(`${given} không có ${args.entry}`);
    const to = path.join(local, 'bin', path.basename(entry.name));
    if (!args['dry-run']) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, readZipEntry(binary, entry, { limit: 2 * 1024 ** 3 }));
    }
    binary = to;
  }

  const il2cpp = args.il2cpp ? path.resolve(args.cwd ?? process.cwd(), args.il2cpp) : null;
  if (il2cpp && !exists(il2cpp)) throw new GkError(`Không có ${args.il2cpp} (script.json của Il2CppDumper)`);
  const name = path.basename(binary);
  const stateFile = path.join(local, 'imported.json');
  const state = exists(stateFile) ? readJson(stateFile) : {};
  const imported = !args.reanalyze && Boolean(state[name]) && exists(path.join(local, `${game.name}.rep`));
  const outDir = path.join(root, 'decompiled', 'ghidra', name);
  const a = headlessArgs({
    projectDir: local,
    project: game.name,
    binary,
    imported,
    outDir,
    il2cpp,
    functions: args.functions === true ? 'all' : args.functions,
    max: args.max ? Number(args.max) : 200,
    timeout: args.timeout,
  });

  const home = args['ghidra-home'] ?? process.env.GHIDRA_HOME;
  if (args['dry-run']) {
    log.info(['analyzeHeadless', ...a].map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' '));
    return 0;
  }
  if (!home) throw new GkError('Chưa có Ghidra: đặt biến môi trường GHIDRA_HOME (thư mục cài Ghidra 11+, cần JDK 21) hoặc --ghidra-home <thư mục>');
  const exe = launcher(home);
  log.info(imported ? `Ghidra: ${name} đã phân tích — chỉ xuất lại (--reanalyze để phân tích lại)` : `Ghidra: nhập và phân tích ${name} (file lớn như libil2cpp.so có thể mất hàng giờ)…`);
  const r = spawnSync(exe, a, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new GkError(`analyzeHeadless dừng với mã ${r.status ?? r.signal}`);
  if (!exists(path.join(outDir, 'functions.tsv'))) throw new GkError(`Ghidra chạy xong nhưng không có ${toPosix(path.relative(root, outDir))}/functions.tsv — xem log phía trên`);

  state[name] = { binary: toPosix(binary), il2cpp: Boolean(il2cpp), at: nowIso() };
  writeJson(stateFile, state);
  const programs = (game.ghidra?.programs ?? []).filter((p) => p.name !== name);
  programs.push({ name, il2cpp: Boolean(il2cpp) || Boolean(game.ghidra?.programs?.find((p) => p.name === name)?.il2cpp), exportedAt: nowIso() });
  updateGame(root, [[['ghidra'], { project: '.gamekit/ghidra', output: 'decompiled/ghidra', programs }]]);
  const count = fs.readFileSync(path.join(outDir, 'functions.tsv'), 'utf8').split('\n').filter(Boolean).length - 1;
  const c = path.join(outDir, 'c');
  log.ok(`decompiled/ghidra/${name}/: ${count} hàm trong functions.tsv${exists(c) ? `, ${fs.readdirSync(c).length} file C` : ''}, strings.tsv`);
  log.info('Đọc ở đó, ghi kết luận vào notes/ (skill re-notes). decompiled/ không bao giờ được commit.');
  return 0;
}
