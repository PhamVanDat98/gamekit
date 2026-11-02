// gamekit unpack <file> — unpack an APK/XAPK/APKS/OBB and report the engine and where its logic and data are.
import fs from 'node:fs';
import path from 'node:path';
import { exists, toPosix, walk, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot, loadGame, updateGame } from './lib/game.mjs';
import { extractZip, isZip, listZip } from './lib/unzip.mjs';

const DEFAULT_MAX_GB = 20;
const NOTES_FILE = 'notes/source-unpack.md';
// Folders in a game repo that git ignores, so a copy of the original game can sit there.
const IGNORED_IN_GAME = ['reference', 'decompiled'];

const ENGINES = [
  ['unity', /(^|\/)lib\/[^/]+\/libunity\.so$|(^|\/)assets\/bin\/Data\//],
  ['unreal', /(^|\/)lib\/[^/]+\/lib(UE4|Unreal)\.so$/],
  ['godot', /(^|\/)lib\/[^/]+\/libgodot_android\.so$/],
  ['cocos', /(^|\/)lib\/[^/]+\/libcocos[\w-]*\.so$/],
  ['html5', /(^|\/)assets\/(www|public)\/index\.html$/],
];

const mb = (n) => `${(n / 2 ** 20).toFixed(1)} MB`;
const baseName = (file) => path.basename(file).replace(/\.(xapk|apks|apkm|apk|obb)$/i, '');

/** Unpack the archive, then the APK/OBB it holds, each in its own folder. Returns problems found. */
async function unpackAll(input, out, maxBytes) {
  const names = listZip(input).map((e) => e.name);
  const isBundle = names.some((n) => /\.(apk|obb)$/i.test(n));
  const isApk = names.includes('AndroidManifest.xml');
  const isObb = /\.obb$/i.test(input);
  if (!isBundle && !isApk && !isObb) throw new GkError(`${input}: không thấy APK, OBB hay AndroidManifest.xml bên trong, đây không phải gói Android`);

  if (!isBundle) {
    const { problems } = await extractZip(input, path.join(out, isApk ? 'apk' : 'obb', baseName(input)), { maxBytes });
    return { kind: isApk ? 'apk' : 'obb', problems };
  }
  const bundle = path.join(out, 'bundle');
  const { files, problems } = await extractZip(input, bundle, { maxBytes });
  for (const rel of files.filter((f) => /\.(apk|obb)$/i.test(f))) {
    const inner = path.join(bundle, rel);
    const isInnerApk = /\.apk$/i.test(rel);
    // Unity's OBB is a zip; other engines may use their own format, which is left as it is.
    if (!isInnerApk && !isZip(inner)) {
      problems.push(`${rel}: OBB không phải ZIP, giữ nguyên ở bundle/ để phân tích riêng`);
      continue;
    }
    const inside = await extractZip(inner, path.join(out, isInnerApk ? 'apk' : 'obb', baseName(rel)), { maxBytes });
    problems.push(...inside.problems.map((p) => `${path.basename(rel)} → ${p}`));
    // The original package still holds this file, so don't keep a second copy of it.
    if (!inside.problems.length) fs.rmSync(inner);
  }
  return { kind: 'bundle', problems };
}

function readHead(file, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    return buf.subarray(0, fs.readSync(fd, buf, 0, length, 0));
  } finally {
    fs.closeSync(fd);
  }
}

/** Engine version from a UnityFS header: signature, format, player version, engine version. */
export function unityVersionOf(file) {
  const parts = readHead(file, 96).toString('latin1');
  if (!parts.startsWith('UnityFS\0')) return null;
  const strings = parts.slice(12).split('\0');
  return /^\d{4,}\.\d+\.\d+/.test(strings[1] ?? '') ? strings[1] : null;
}

/** IL2CPP metadata starts with a fixed magic; without it the file was encrypted or reshaped. */
function metadataState(file) {
  const head = readHead(file, 8);
  if (head.length === 8 && head.readUInt32LE(0) === 0xfab11baf) return { state: 'plain', version: head.readUInt32LE(4) };
  return { state: 'protected', version: null };
}

function inspectUnity(out, files, warnings) {
  const find = (re) => files.find((f) => re.test(f)) ?? null;
  const libil2cpp = find(/\/lib\/[^/]+\/libil2cpp\.so$/);
  const libunity = find(/\/lib\/[^/]+\/libunity\.so$/);
  const metadataPath = find(/\/assets\/bin\/Data\/Managed\/Metadata\/global-metadata\.dat$/);
  const assemblyCSharp = find(/\/Managed\/Assembly-CSharp\.dll$/);
  const backend = libil2cpp || metadataPath ? 'il2cpp' : assemblyCSharp || find(/\/lib\/[^/]+\/libmono[\w-]*\.so$/) ? 'mono' : 'unknown';
  const abis = [...new Set(files.flatMap((f) => /\/lib\/([^/]+)\/libunity\.so$/.exec(f)?.[1] ?? []))];

  const dataFiles = files
    .filter((f) => /\/assets\/bin\/Data\/[^/]+$/.test(f) && /(\.unity3d|\.resS?|\.resource|\.assets|globalgamemanagers)$/.test(f))
    .map((f) => ({ path: f, size: fs.statSync(path.join(out, f)).size }))
    .sort((a, b) => b.size - a.size);
  const bundles = files.filter((f) => /\/assets\/.*\.bundle$/.test(f));
  const addressables = find(/\/assets\/aa\/catalog[^/]*\.(json|bin)$/);

  const versionSource = files.find((f) => /\/assets\/bin\/Data\/data(pack)?\.unity3d$/.test(f) && unityVersionOf(path.join(out, f)));
  const metadata = metadataPath ? { path: metadataPath, ...metadataState(path.join(out, metadataPath)) } : null;

  if (backend === 'il2cpp' && !libil2cpp) warnings.push('Có global-metadata.dat nhưng thiếu libil2cpp.so: thiếu split theo kiến trúc (config.arm64_v8a.apk…), gói chưa đủ để phân tích logic');
  if (backend === 'il2cpp' && !metadataPath) warnings.push('Có libil2cpp.so nhưng không thấy global-metadata.dat ở vị trí chuẩn: có thể đã bị đổi chỗ, hoặc thiếu asset pack/OBB');
  if (metadata?.state === 'protected') warnings.push('global-metadata.dat không có magic chuẩn: có thể đã mã hoá hoặc làm rối, Il2CppDumper/Cpp2IL khó đọc trực tiếp');
  if (backend === 'unknown') warnings.push('Không xác định được Mono hay IL2CPP: có thể thiếu split của gói');
  if (!dataFiles.length) warnings.push('Không thấy dữ liệu trong assets/bin/Data: có thể thiếu asset pack/OBB');
  if (addressables) warnings.push(`Có Addressables (${addressables}): đọc catalog để biết bundle nào tải từ server, các bundle đó không có trong gói`);

  return {
    version: versionSource ? unityVersionOf(path.join(out, versionSource)) : null,
    backend,
    abis,
    libil2cpp,
    libunity,
    metadata,
    assemblyCSharp,
    dataFiles,
    bundleCount: bundles.length,
    addressables,
  };
}

function inspect(out) {
  const files = walk(out).filter((f) => f !== 'unpack-report.json');
  const engine = ENGINES.find(([, re]) => files.some((f) => re.test(f)))?.[0] ?? 'unknown';
  const warnings = [];
  if (engine === 'unknown') warnings.push('Không nhận ra engine từ tên file: xem lib/ và assets/, rồi điền source.engine trong game.yaml bằng tay');
  return { engine, files, warnings, unity: engine === 'unity' ? inspectUnity(out, files, warnings) : null };
}

function readManifest(out) {
  const file = path.join(out, 'bundle', 'manifest.json');
  if (!exists(file)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { packageName: m.package_name ?? null, name: m.name ?? null, versionName: m.version_name ?? null, versionCode: m.version_code ?? null };
  } catch {
    return null;
  }
}

function nextSteps(report) {
  const u = report.unity;
  if (!u) return ['Tra bảng ở bước 2 của skill re-notes theo engine đã nhận ra.'];
  const steps = [];
  if (u.backend === 'il2cpp' && u.libil2cpp && u.metadata) steps.push(`Lấy tên hàm và class bằng Il2CppDumper/Cpp2IL từ \`${u.libil2cpp}\` và \`${u.metadata.path}\`, rồi đọc trong Ghidra. Kết quả để trong \`decompiled/\`.`);
  if (u.backend === 'mono' && u.assemblyCSharp) steps.push(`Đọc \`${u.assemblyCSharp}\` bằng ILSpy/dnSpy. Kết quả để trong \`decompiled/\`.`);
  if (u.dataFiles.length) steps.push('Mở cả thư mục apk/ (và obb/ nếu có) bằng AssetRipper, vì dữ liệu nằm rải ở nhiều gói.');
  return steps;
}

function notesText(report) {
  const u = report.unity;
  const lines = ['# Bóc tách gói game gốc', '', `Sinh bởi \`gamekit unpack\`. Thư mục đã giải nén: \`${report.out}\` (ngoài repo, không commit).`, ''];
  if (report.package) lines.push(`- **Gói:** \`${report.package.packageName}\`, phiên bản ${report.package.versionName} (${report.package.versionCode})`);
  lines.push(`- **Engine:** ${report.engine}${u?.version ? ` ${u.version}` : ''}`);
  if (u) {
    lines.push(`- **Kiểu build:** ${u.backend}${u.abis.length ? `, kiến trúc ${u.abis.join(', ')}` : ''}`);
    if (u.libil2cpp) lines.push(`- **Logic:** \`${u.libil2cpp}\``);
    if (u.assemblyCSharp) lines.push(`- **Logic:** \`${u.assemblyCSharp}\``);
    if (u.metadata) lines.push(`- **Metadata:** \`${u.metadata.path}\` (${u.metadata.state === 'plain' ? `đọc được, phiên bản ${u.metadata.version}` : 'có thể đã bảo vệ'})`);
    if (u.dataFiles.length) lines.push('- **Dữ liệu lớn nhất:**', ...u.dataFiles.slice(0, 8).map((d) => `  - \`${d.path}\` (${mb(d.size)})`));
  }
  if (report.warnings.length) lines.push('', '## Cần lưu ý', ...report.warnings.map((w) => `- ${w}`));
  const steps = nextSteps(report);
  if (steps.length) lines.push('', '## Bước tiếp theo', ...steps.map((s) => `- ${s}`));
  return `${lines.join('\n')}\n`;
}

function recordInGame(root, report, out) {
  const game = loadGame(root);
  const current = game.source?.engine;
  const edits = [[['source', 'path'], out]];
  if (report.engine !== 'unknown' && (!current || current === 'unknown')) edits.push([['source', 'engine'], report.engine]);
  else if (report.engine !== 'unknown' && current !== report.engine) log.warn(`game.yaml ghi engine ${current}, gói này là ${report.engine}: giữ nguyên, kiểm tra lại`);
  if (report.unity?.version && (current === 'unity' || report.engine === current || !current || current === 'unknown')) edits.push([['source', 'engineVersion'], report.unity.version]);
  updateGame(root, edits);
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(root, NOTES_FILE), notesText(report));
}

export async function run(args) {
  if (!args._[0]) throw new GkError('Dùng: gamekit unpack <file.apk|xapk|apks|obb> [--out <thư mục>] [--game <thư mục game>] [--max-gb 20]');
  const input = path.resolve(String(args._[0]));
  if (!exists(input) || !fs.statSync(input).isFile()) throw new GkError(`Không thấy file ${input}`);
  const out = path.resolve(args.out ? String(args.out) : path.join(path.dirname(input), `${baseName(input)}.unpacked`));
  if (exists(out) && fs.readdirSync(out).length) throw new GkError(`${out} đã có và không rỗng. Chọn --out khác hoặc xoá thư mục đó.`);

  const gameRoot = findGameRoot(args.game ? path.resolve(String(args.game)) : process.cwd());
  if (args.game && !gameRoot) throw new GkError(`Không thấy game.yaml trong ${path.resolve(String(args.game))}`);
  if (gameRoot) {
    const rel = toPosix(path.relative(gameRoot, out));
    const insideRepo = !rel.startsWith('..') && !path.isAbsolute(rel);
    if (insideRepo && !IGNORED_IN_GAME.includes(rel.split('/')[0])) throw new GkError(`${out} nằm trong repo game. Đặt ngoài repo, hoặc trong ${IGNORED_IN_GAME.join('/ hay ')}/ (đã gitignore).`);
  }
  const maxGb = args['max-gb'] === undefined ? DEFAULT_MAX_GB : Number(args['max-gb']);
  if (!(maxGb > 0)) throw new GkError('--max-gb phải là số dương');

  log.info(`Đang giải nén ${path.basename(input)}…`);
  const { kind, problems } = await unpackAll(input, out, maxGb * 2 ** 30);
  const { files, warnings, ...found } = inspect(out);
  const report = { input, out, kind, package: readManifest(out), ...found, fileCount: files.length, warnings: [...warnings, ...problems] };
  writeJson(path.join(out, 'unpack-report.json'), report);
  if (gameRoot) recordInGame(gameRoot, report, out);

  const u = report.unity;
  log.ok(`Đã giải nén ${files.length} file vào ${out}`);
  if (report.package) log.info(`Gói: ${report.package.packageName} ${report.package.versionName ?? ''}`);
  log.info(`Engine: ${report.engine}${u?.version ? ` ${u.version}` : ''}${u ? `, ${u.backend}` : ''}${u?.abis.length ? `, ${u.abis.join(', ')}` : ''}`);
  if (u?.libil2cpp) log.info(`Logic: ${u.libil2cpp}`);
  if (u?.assemblyCSharp) log.info(`Logic: ${u.assemblyCSharp}`);
  if (u?.metadata) log.info(`Metadata: ${u.metadata.path} (${u.metadata.state === 'plain' ? `đọc được, phiên bản ${u.metadata.version}` : 'có thể đã bảo vệ'})`);
  if (u?.dataFiles.length) log.info(`Dữ liệu: ${u.dataFiles.length} file, lớn nhất ${u.dataFiles[0].path} (${mb(u.dataFiles[0].size)})`);
  for (const w of report.warnings.slice(0, 20)) log.warn(w);
  if (report.warnings.length > 20) log.warn(`… và ${report.warnings.length - 20} cảnh báo khác, xem unpack-report.json`);
  if (gameRoot) log.ok(`Đã ghi ${NOTES_FILE} và source.path trong game.yaml`);
  return 0;
}
