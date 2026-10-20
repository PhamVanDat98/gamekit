// gamekit recon <path> — look at the original game (folder, APK, IPA, zip) without running it: which engine and
// version, where logic and data live, what tools fit, how much of each asset kind. --write saves spec/recon.json
// and fills source.engine / engineVersion / path in game.yaml when they are still empty.
import path from 'node:path';
import { writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot, loadGame, updateGame, nowIso } from './lib/game.mjs';
import { openSource, kindOf, ASSET_KINDS } from './lib/source.mjs';

const VERSION_PROBE = 64 * 1024;
const UNITY_VERSION_RE = /\b((?:20\d\d|[56])\.\d+\.\d+[abfpx]\d+)\b/;

const base = (p) => p.split('/').pop();
const has = (entries, re) => entries.filter((e) => re.test(e.path));

function text(src, file, limit = VERSION_PROBE) {
  try {
    const b = src.read(file, limit);
    return b ? b.toString('latin1') : '';
  } catch {
    return '';
  }
}

/** First version string matching `re` (group 1) in any of `files`. */
function versionIn(src, files, re, limit) {
  for (const f of files) {
    const m = re.exec(text(src, f.path ?? f, limit));
    if (m) return m[1];
  }
  return null;
}

const TOOLS = {
  'unity-project': ['Mở bằng Unity Editor đúng phiên bản; đọc thẳng Assets/Scripts'],
  'unity-mono': ['ILSpy / dnSpyEx cho Assembly-CSharp.dll', 'AssetRipper hoặc UABEA để xuất asset'],
  'unity-il2cpp': ['Il2CppDumper hoặc Cpp2IL (cần global-metadata.dat) để lấy tên hàm/kiểu', 'Ghidra (script ghidra_with_struct.py của Il2CppDumper) cho logic', 'AssetRipper cho asset'],
  'unity-webgl': ['Như IL2CPP: wasm + global-metadata trong file .data', 'AssetRipper đọc được .data / .unityweb'],
  cocos: ['Đọc bundle JS (có thể có source map); asset trong assets/ hoặc res/ (JSON + atlas)'],
  godot: ['GDRE Tools để giải .pck → .gd, .tscn, .tres'],
  unreal: ['FModel / UModel cho .pak; logic native: Ghidra'],
  flash: ['JPEXS FFDec cho .swf (ActionScript + asset)'],
  construct: ['Đọc data.json (event sheet) + c3runtime.js'],
  laya: ['Đọc bundle JS'],
  html5: ['Đọc bundle JS (source map nếu có); tách module theo import'],
  gamemaker: ['UndertaleModTool đọc data.win / game.droid'],
  native: ['Ghidra / IDA'],
};

/** Engine, flavour, version and the files that prove it. Order matters: most specific first. */
export function detectEngine(src) {
  const E = src.entries;
  const ev = (list) => list.slice(0, 5).map((e) => e.path);
  const out = (engine, flavour, version, evidence, logic) => ({ engine, flavour, version: version ?? null, evidence, logic, tools: TOOLS[flavour] ?? TOOLS[engine] ?? [] });

  // Unity source project
  const pv = has(E, /(^|\/)ProjectSettings\/ProjectVersion\.txt$/);
  if (pv.length) {
    const v = versionIn(src, pv, /m_EditorVersion:\s*(\S+)/);
    return out('unity', 'unity-project', v, ev(pv), ['Assets/**/*.cs (source C#)', 'ScriptableObject *.asset, prefab, scene']);
  }
  // Unity builds (desktop folder, APK, WebGL)
  const unityMarkers = has(E, /(_Data\/(globalgamemanagers|data\.unity3d|Managed\/)|assets\/bin\/Data\/|libunity\.so$|UnityPlayer\.dll$|UnityFramework|\.unityweb$|\.loader\.js$)/);
  if (unityMarkers.length) {
    const il2cpp = has(E, /(libil2cpp\.so|GameAssembly\.(dll|dylib)|global-metadata\.dat)$/);
    const mono = has(E, /Managed\/Assembly-CSharp\.dll$/);
    const webgl = has(E, /(\.wasm(\.(gz|br|unityweb))?|\.data(\.(gz|br|unityweb))?|\.loader\.js)$/);
    const ggm = has(E, /(globalgamemanagers|data\.unity3d|unity default resources|\.data(\.(gz|br|unityweb))?)$/);
    const version = versionIn(src, ggm, UNITY_VERSION_RE) ?? versionIn(src, has(E, /\.framework\.js$/), UNITY_VERSION_RE, 2 * 1024 * 1024);
    if (webgl.length && !mono.length && !il2cpp.some((e) => /\.so$|\.dll$/.test(e.path)))
      return out('unity', 'unity-webgl', version, ev(webgl), ['Build/*.wasm (IL2CPP → wasm)', 'Build/*.data (asset + global-metadata)']);
    if (il2cpp.length) return out('unity', 'unity-il2cpp', version, ev(il2cpp), ['libil2cpp.so / GameAssembly.dll (native)', 'global-metadata.dat (tên kiểu, hàm, chuỗi)']);
    return out('unity', 'unity-mono', version, ev(mono.length ? mono : unityMarkers), ['Managed/Assembly-CSharp.dll (IL, đọc gần như source)', '*.assets, ScriptableObject']);
  }
  // Godot
  const godotProj = has(E, /(^|\/)project\.godot$/);
  if (godotProj.length) return out('godot', 'godot', versionIn(src, godotProj, /config\/features=PackedStringArray\("(\d+\.\d+)/), ev(godotProj), ['*.gd (GDScript)', '*.tscn, *.tres']);
  const pck = has(E, /\.pck$|libgodot_android\.so$/);
  if (pck.length) {
    const p = pck.find((e) => /\.pck$/.test(e.path));
    let version = null;
    const head = p && src.read(p.path, 20);
    if (head && head.length >= 20 && head.toString('latin1', 0, 4) === 'GDPC') version = `${head.readUInt32LE(8)}.${head.readUInt32LE(12)}.${head.readUInt32LE(16)}`;
    return out('godot', 'godot', version, ev(pck), ['.pck → script .gd, scene .tscn']);
  }
  // Unreal
  const uproj = has(E, /\.uproject$/);
  if (uproj.length) return out('unreal', 'unreal', versionIn(src, uproj, /"EngineAssociation"\s*:\s*"([^"]+)"/), ev(uproj), ['Source/**/*.cpp, Blueprint trong Content/']);
  const ue = has(E, /(\.pak$|libUE4\.so$|libUnreal\.so$)/);
  if (ue.length) return out('unreal', 'unreal', null, ev(ue), ['Blueprint / native trong .pak và .so']);
  // Cocos
  const cocosNative = has(E, /libcocos(2djs)?\.so$/);
  const cocosJs = has(E, /(cocos2d-js[^/]*\.js|cocos-js\/|cc\.js$|(^|\/)src\/settings\.(js|json)$|(^|\/)settings\.json$)/);
  const creatorProj = has(E, /(^|\/)project\.json$|(^|\/)package\.json$/).filter((e) => /"(cocos-creator|creator)"|cocos-creator-js/.test(text(src, e.path)));
  if (cocosNative.length || cocosJs.length || creatorProj.length) {
    const version =
      versionIn(src, creatorProj, /"version"\s*:\s*"(\d+\.\d+\.\d+)"/) ??
      versionIn(src, has(E, /cocos2d-js[^/]*\.js$|cocos-js\/cc\.js$|cc\.js$/), /ENGINE_VERSION\s*[=:]\s*["']([\d.]+)/, 4 * 1024 * 1024);
    return out('cocos', 'cocos', version, ev([...creatorProj, ...cocosNative, ...cocosJs]), ['bundle JS (main/index.js, project.js)', 'assets/ hoặc res/ (JSON, atlas .plist)']);
  }
  // Flash
  const swf = has(E, /\.(swf|fla)$/);
  if (swf.length) {
    const head = src.read(swf[0].path, 4);
    const version = head && /^[FCZ]WS$/.test(head.toString('latin1', 0, 3)) ? `SWF ${head[3]}` : null;
    return out('flash', 'flash', version, ev(swf), ['ActionScript trong .swf']);
  }
  // Construct
  const c3 = has(E, /(c3runtime\.js|c2runtime\.js|\.c3p|\.capx)$/);
  if (c3.length) return out('construct', 'construct', c3.some((e) => /c2runtime|\.capx/.test(e.path)) ? '2' : '3', ev(c3), ['data.json (event sheet)', 'scripts/']);
  // Laya
  const laya = has(E, /laya\.(core|webgl)\.js$|(^|\/)libs\/laya[^/]*\.js$/);
  if (laya.length) return out('laya', 'laya', null, ev(laya), ['bundle JS (bin/js)']);
  // GameMaker, Defold → other
  const gm = has(E, /(^|\/)(data\.win|game\.droid|game\.ios)$|libyoyo\.so$/);
  if (gm.length) return { ...out('other', 'gamemaker', null, ev(gm), ['data.win / game.droid (bytecode GML)']), note: 'GameMaker' };
  const defold = has(E, /game\.(projectc|arcd|arci)$/);
  if (defold.length) return { ...out('other', 'native', null, ev(defold), ['game.arcd (Lua bytecode + data)']), note: 'Defold' };
  // Plain HTML5 (Phaser, Pixi, RPG Maker…)
  const html = has(E, /(^|\/)index\.html$/);
  const js = has(E, /\.js$/);
  if (html.length && js.length) {
    const lib = js.find((e) => /phaser/i.test(base(e.path))) ? 'Phaser' : js.find((e) => /pixi/i.test(base(e.path))) ? 'Pixi' : js.find((e) => /(rpg|rmmz)_core\.js$/.test(e.path)) ? 'RPG Maker' : null;
    const version = lib === 'Phaser' ? versionIn(src, js.filter((e) => /phaser/i.test(e.path)), /VERSION\s*:\s*["']([\d.]+)/, 4 * 1024 * 1024) : null;
    return { ...out('html5', 'html5', version, ev(html), ['bundle JS']), note: lib };
  }
  const native = has(E, /\.(so|dll|exe|dylib)$/);
  if (native.length) return out('other', 'native', null, ev(native), ['native code']);
  return out('unknown', 'unknown', null, [], []);
}

/** Files and bytes per kind, and the biggest assets. */
export function summarizeAssets(entries) {
  const kinds = {};
  for (const e of entries) {
    const k = kindOf(e.path);
    if (k === 'meta') continue;
    kinds[k] ??= { files: 0, bytes: 0 };
    kinds[k].files++;
    kinds[k].bytes += e.bytes;
  }
  const biggest = entries
    .filter((e) => ASSET_KINDS.includes(kindOf(e.path)))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10)
    .map((e) => ({ path: e.path, bytes: e.bytes }));
  return { kinds, biggest, totalBytes: entries.reduce((s, e) => s + e.bytes, 0) };
}

export function platformOf(src) {
  const E = src.entries;
  if (has(E, /AndroidManifest\.xml$/).length) return 'android';
  if (has(E, /\.app\/Info\.plist$|^Payload\//).length) return 'ios';
  if (has(E, /(^|\/)index\.html$/).length && has(E, /\.(wasm|js)(\.(gz|br|unityweb))?$/).length) return 'web';
  if (has(E, /\.exe$/).length) return 'windows';
  if (has(E, /(^|\/)(Assets|ProjectSettings|project\.godot|Content)\b/).length) return 'source';
  return 'unknown';
}

export function recon(p) {
  const src = openSource(p);
  try {
    const engine = detectEngine(src);
    return { path: src.label, at: nowIso(), kind: src.kind, platform: platformOf(src), files: src.entries.length, ...engine, assets: summarizeAssets(src.entries) };
  } finally {
    src.close();
  }
}

const mb = (b) => `${(b / 1048576).toFixed(1)}MB`;

export async function run(args) {
  const root = findGameRoot(args.cwd);
  const game = root ? loadGame(root) : null;
  const target = args._[0] ?? game?.source?.path;
  if (!target) throw new GkError('Dùng: gamekit recon <thư mục game gốc | file .apk/.ipa/.zip> [--write] [--json]');
  const abs = path.resolve(root && !args._[0] ? root : (args.cwd ?? process.cwd()), target);
  const r = recon(abs);
  if (args.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } else {
    log.head(`Game gốc: ${r.path}`);
    log.info(`Dạng: ${r.kind === 'dir' ? 'thư mục' : 'file nén'} · nền tảng: ${r.platform} · ${r.files} file · ${mb(r.assets.totalBytes)}`);
    (r.engine === 'unknown' ? log.warn : log.ok)(`Engine: ${r.engine}${r.note ? ` (${r.note})` : ''} · ${r.flavour}${r.version ? ` · ${r.version}` : ' · chưa rõ phiên bản'}`);
    if (r.evidence.length) log.dim(`  dấu hiệu: ${r.evidence.join(', ')}`);
    if (r.logic.length) log.info(`Logic/data nằm ở: ${r.logic.join(' · ')}`);
    if (r.tools.length) log.info(`Công cụ hợp: ${r.tools.join(' · ')}`);
    log.info('Asset:');
    for (const [k, v] of Object.entries(r.assets.kinds).sort((a, b) => b[1].bytes - a[1].bytes)) log.info(`  ${k.padEnd(8)} ${String(v.files).padStart(6)} file  ${mb(v.bytes).padStart(9)}`);
  }
  if (args.write) {
    if (!root) throw new GkError('--write cần chạy trong thư mục game (có game.yaml)');
    writeJson(path.join(root, 'spec', 'recon.json'), r);
    const edits = [];
    if (!game.source?.engine || game.source.engine === 'unknown') edits.push([['source', 'engine'], r.engine]);
    else if (r.engine !== 'unknown' && game.source.engine !== r.engine) log.warn(`game.yaml ghi engine ${game.source.engine}, recon thấy ${r.engine} — kiểm tra lại`);
    if (!game.source?.engineVersion && r.version) edits.push([['source', 'engineVersion'], r.version]);
    if (!game.source?.path) edits.push([['source', 'path'], abs]);
    if (edits.length) updateGame(root, edits);
    if (!args.json) log.ok(`Đã ghi spec/recon.json${edits.length ? ` và ${edits.map((e) => e[0].join('.')).join(', ')} trong game.yaml` : ''}`);
  }
  return 0;
}
