// Recognise the engine of an original game from its files: a source project, a desktop/web build,
// or an APK/XAPK/IPA/zip. Works on a file list + a reader, so folders and archives share one rule set.

/** Signatures, most specific first. `engine` is the game.yaml value; `name` what people call it. */
const RULES = [
  { engine: 'unity', name: 'Unity (project)', source: true, any: [/(^|\/)ProjectSettings\/ProjectVersion\.txt$/] },
  { engine: 'unity', name: 'Unity', any: [/(^|\/)lib\/[^/]+\/libunity\.so$/, /(^|\/)UnityPlayer\.(dll|dylib|so)$/, /(^|\/)UnityFramework\.framework\//, /(^|\/)[^/]+_Data\/globalgamemanagers$/, /(^|\/)assets\/bin\/Data\//] },
  { engine: 'unity', name: 'Unity WebGL', any: [/(^|\/)Build\/[^/]+\.(loader\.js|framework\.js(\.gz|\.br|\.unityweb)?)$/, /(^|\/)Build\/UnityLoader\.js$/] },
  { engine: 'godot', name: 'Godot (project)', source: true, any: [/(^|\/)project\.godot$/] },
  { engine: 'godot', name: 'Godot', any: [/\.pck$/, /(^|\/)lib\/[^/]+\/libgodot_android\.so$/] },
  { engine: 'unreal', name: 'Unreal (project)', source: true, any: [/\.uproject$/] },
  { engine: 'unreal', name: 'Unreal', any: [/(^|\/)lib\/[^/]+\/lib(UE4|Unreal)\.so$/, /(^|\/)Content\/Paks\/[^/]+\.(pak|utoc)$/] },
  { engine: 'cocos', name: 'Cocos Creator (project)', source: true, all: [/(^|\/)assets\//, /(^|\/)(project\.json|settings\/project\.json|creator\.d\.ts)$/] },
  { engine: 'cocos', name: 'Cocos Creator / cocos2d-x JS', any: [/(^|\/)lib\/[^/]+\/libcocos2djs\.so$/, /(^|\/)lib\/[^/]+\/libcocos\.so$/, /(^|\/)cocos2d-js(-min)?\.js$/, /(^|\/)cocos-js\/cc\.js$/, /(^|\/)src\/settings(\.[0-9a-f]+)?\.js$/, /\.jsc$/] },
  { engine: 'cocos', name: 'cocos2d-x Lua', any: [/(^|\/)lib\/[^/]+\/libcocos2dlua\.so$/] },
  { engine: 'cocos', name: 'cocos2d-x C++', any: [/(^|\/)lib\/[^/]+\/libcocos2dcpp\.so$/, /(^|\/)lib\/[^/]+\/libMyGame\.so$/] },
  { engine: 'flash', name: 'Adobe AIR', any: [/(^|\/)META-INF\/AIR\//, /(^|\/)lib\/[^/]+\/libCore\.so$/] },
  { engine: 'flash', name: 'Flash', any: [/\.swf$/] },
  { engine: 'construct', name: 'Construct 3', any: [/(^|\/)c3runtime\.js$/, /(^|\/)scripts\/c3main\.js$/] },
  { engine: 'construct', name: 'Construct 2', any: [/(^|\/)c2runtime\.js$/] },
  { engine: 'laya', name: 'LayaAir', any: [/(^|\/)laya\.core\.js$/, /(^|\/)libs\/laya\.[^/]+\.js$/, /(^|\/)lib\/[^/]+\/liblaya\.so$/] },
  { engine: 'other', name: 'GameMaker', any: [/(^|\/)data\.win$/, /(^|\/)game\.(unx|ios|droid)$/, /(^|\/)lib\/[^/]+\/libyoyo\.so$/] },
  { engine: 'other', name: 'Defold', any: [/(^|\/)game\.(arcd|projectc)$/, /(^|\/)lib\/[^/]+\/libdmengine\.so$/] },
  { engine: 'other', name: 'Flutter (Flame?)', any: [/(^|\/)lib\/[^/]+\/libflutter\.so$/] },
  { engine: 'html5', name: 'RPG Maker MV/MZ', any: [/(^|\/)js\/(rpg|rmmz)_core\.js$/] },
  { engine: 'html5', name: 'HTML5', any: [/(^|\/)(assets\/www\/|www\/)?index\.html$/] },
];

const KIND = [
  ['image', /\.(png|jpe?g|webp|gif|bmp|tga|psd|ktx2?|astc|pvr|dds|svg)$/i],
  ['audio', /\.(ogg|mp3|wav|m4a|aac|caf|fsb|bank|wem|bnk|opus)$/i],
  ['video', /\.(mp4|webm|mov|usm)$/i],
  ['font', /\.(ttf|otf|woff2?|fnt)$/i],
  ['code', /\.(dll|so|dylib|exe|wasm|js|jsc|lua|luac|dex|gd|gdc|cs|swf|abc|py)$/i],
  ['data', /\.(json|xml|plist|csv|txt|bytes|asset|assets|resource|ress|unity3d|bundle|ab|pak|pck|tres|tscn|scn|dat|db|sqlite|bin|atlas|skel|plist)$/i],
];

export const kindOf = (p) => KIND.find(([, re]) => re.test(p))?.[0] ?? 'other';

const VERSION_PROBES = [
  // Unity serialized files / UnityFS bundles carry the editor version in their header.
  { engine: 'unity', files: [/(^|\/)ProjectSettings\/ProjectVersion\.txt$/, /globalgamemanagers$/, /data\.unity3d$/, /(^|\/)(mainData|level0|unity default resources)$/, /\.(data|data\.unityweb)$/], re: /m_EditorVersion:\s*(\S+)|\b((?:20\d\d|6000|5|4)\.\d+\.\d+[abfp]\d+)\b/ },
  { engine: 'cocos', files: [/cocos2d-js(-min)?\.js$/, /cocos-js\/cc\.js$/, /(^|\/)main\.js$/], re: /(?:Cocos ?Creator|cocos2d-x|CocosCreator)[ -]v?(\d+\.\d+(?:\.\d+)?)/i },
  { engine: 'godot', files: [/(^|\/)project\.godot$/], re: /config\/features=PackedStringArray\("(\d+\.\d+)/ },
  { engine: 'unreal', files: [/\.uproject$/], re: /"EngineAssociation"\s*:\s*"([^"]+)"/ },
  { engine: 'laya', files: [/laya\.core\.js$/], re: /\bversion\s*[=:]\s*["'](\d+\.\d+\.\d+)/ },
];

/**
 * files: [{ path, size }] (posix, relative). read(path, max) → Buffer|null (first `max` bytes).
 * Returns what the game is built with, where logic and data live, and a file inventory.
 */
export function detect(files, read) {
  const paths = files.map((f) => f.path);
  const hits = [];
  for (const r of RULES) {
    const ev = r.all ? (r.all.every((re) => paths.some((p) => re.test(p))) ? r.all.map((re) => paths.find((p) => re.test(p))) : []) : paths.filter((p) => r.any.some((re) => re.test(p))).slice(0, 3);
    if (ev.length) hits.push({ ...r, evidence: ev });
  }
  // HTML5 is only the answer when nothing more specific matched (most engines ship an index.html).
  const specific = hits.filter((h) => h.name !== 'HTML5');
  const top = specific[0] ?? hits[0] ?? null;
  const result = {
    engine: top?.engine ?? 'unknown',
    name: top?.name ?? 'không nhận ra',
    source: Boolean(top?.source),
    version: null,
    backend: null,
    evidence: top?.evidence ?? [],
    alsoMatched: [...new Set(specific.slice(1).map((h) => h.name))].filter((n) => n !== top?.name),
    inventory: inventory(files),
    logic: [],
    data: [],
    tools: [],
  };
  if (top) {
    const probe = VERSION_PROBES.find((v) => v.engine === top.engine);
    if (probe) {
      for (const p of paths.filter((x) => probe.files.some((re) => re.test(x))).slice(0, 8)) {
        const buf = read(p, 256 * 1024);
        const m = buf && probe.re.exec(buf.toString('latin1'));
        if (m) {
          result.version = m.slice(1).find(Boolean);
          break;
        }
      }
    }
    if (top.engine === 'godot' && !result.version) {
      // .pck header: "GDPC", pack format, major, minor, patch (u32 LE each).
      const pck = paths.find((p) => p.endsWith('.pck'));
      const buf = pck && read(pck, 20);
      if (buf && buf.length >= 20 && buf.toString('latin1', 0, 4) === 'GDPC') result.version = `${buf.readUInt32LE(8)}.${buf.readUInt32LE(12)}.${buf.readUInt32LE(16)}`;
    }
    if (top.engine === 'flash') {
      const swf = paths.find((p) => p.endsWith('.swf'));
      const buf = swf && read(swf, 4);
      if (buf && /^[FCZ]WS$/.test(buf.toString('latin1', 0, 3))) result.version = `SWF ${buf[3]}`;
    }
  }
  explain(result, paths);
  return result;
}

function inventory(files) {
  const byKind = {};
  const byExt = {};
  let total = 0;
  for (const f of files) {
    const k = kindOf(f.path);
    byKind[k] ??= { count: 0, bytes: 0 };
    byKind[k].count++;
    byKind[k].bytes += f.size;
    const ext = /\.([a-z0-9]+)$/i.exec(f.path)?.[1]?.toLowerCase() ?? '(không đuôi)';
    byExt[ext] ??= { count: 0, bytes: 0 };
    byExt[ext].count++;
    byExt[ext].bytes += f.size;
    total += f.size;
  }
  const topExt = Object.entries(byExt)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 12)
    .map(([ext, v]) => ({ ext, ...v }));
  return { files: files.length, bytes: total, byKind, topExt };
}

/** Where logic and data live for this engine, and which tools read them. */
function explain(r, paths) {
  const find = (re) => paths.filter((p) => re.test(p)).slice(0, 5);
  if (r.engine === 'unity') {
    if (r.source) {
      r.logic = find(/(^|\/)Assets\/.*\.cs$/);
      r.data = find(/(^|\/)Assets\/.*\.(asset|prefab|unity)$/);
      r.tools = ['Unity Editor (mở project, đọc thẳng C#)'];
      return;
    }
    const il2cpp = find(/(libil2cpp\.so|GameAssembly\.(dll|dylib)|global-metadata\.dat)$/);
    const mono = find(/(^|\/)Managed\/Assembly-CSharp\.dll$/);
    const wasm = find(/\.wasm(\.gz|\.br|\.unityweb)?$/);
    r.backend = il2cpp.length ? 'IL2CPP' : mono.length ? 'Mono' : wasm.length ? 'IL2CPP (WebGL)' : null;
    r.logic = il2cpp.length ? il2cpp : mono.length ? mono : wasm;
    r.data = find(/(globalgamemanagers|data\.unity3d|\.assets|\.resource|\.bundle|\.ab|\.data(\.gz|\.br|\.unityweb)?)$/);
    r.tools =
      r.backend === 'Mono'
        ? ['ILSpy / dnSpy (C# gần như source)', 'AssetRipper (asset, scene, ScriptableObject)']
        : ['Il2CppDumper hoặc Cpp2IL (tên class/hàm, script.json)', '`gamekit ghidra <binary> --il2cpp script.json` (đặt tên hàm, decompile)', 'AssetRipper (asset)'];
    return;
  }
  if (r.engine === 'cocos') {
    r.logic = find(/(\.jsc|\.luac?|(^|\/)(main|project|index)(\.[0-9a-f]+)?\.js|lib\/[^/]+\/libcocos2d(cpp|lua|js)\.so|libMyGame\.so)$/);
    r.data = find(/(^|\/)(res|assets)\/.*\.(json|plist|atlas|png)$/);
    r.tools = paths.some((p) => /\.(jsc|luac)$/.test(p))
      ? ['Script đã mã hoá (.jsc/.luac, thường XXTEA): tìm key trong lib*.so (strings/Ghidra), giải mã rồi đọc JS/Lua', 'Ghidra cho lib*.so']
      : ['Đọc bundle JS (beautify, tách module theo uuid/require)', 'Source map nếu có'];
    return;
  }
  if (r.engine === 'godot') {
    r.logic = find(/\.(gd|gdc|pck)$/);
    r.data = find(/\.(tres|tscn|scn|res|import)$/);
    r.tools = r.source ? ['Godot Editor'] : ['GDRE Tools (giải .pck, decompile GDScript)'];
    return;
  }
  if (r.engine === 'unreal') {
    r.logic = find(/(\.uproject|lib(UE4|Unreal)\.so|\.exe|Source\/.*\.(cpp|h))$/);
    r.data = find(/\.(pak|utoc|ucas|uasset)$/);
    r.tools = ['FModel / UModel (asset trong .pak)', 'Blueprint: FModel xem graph; native: Ghidra'];
    return;
  }
  if (r.engine === 'flash') {
    r.logic = find(/\.swf$/);
    r.data = r.logic;
    r.tools = ['JPEXS FFDec (ActionScript, hình, âm thanh trong swf)'];
    return;
  }
  if (['construct', 'laya', 'html5'].includes(r.engine)) {
    r.logic = find(/\.js$/);
    r.data = find(/\.(json|xml|atlas)$/);
    r.tools = ['Đọc bundle JS (beautify); source map nếu có', r.engine === 'construct' ? 'data.json chứa event sheet' : null].filter(Boolean);
    return;
  }
  if (r.name === 'GameMaker') {
    r.logic = find(/(data\.win|game\.(unx|ios|droid)|libyoyo\.so)$/);
    r.tools = ['UndertaleModTool (data.win: code GML, sprite, âm thanh)'];
    return;
  }
  if (r.name === 'Defold') {
    r.logic = find(/game\.(arcd|projectc)$/);
    r.tools = ['Giải game.arcd (archive Defold), script Lua bên trong'];
    return;
  }
  const dex = find(/classes\d*\.dex$/);
  if (dex.length) {
    r.logic = dex;
    r.tools = ['jadx (Java/Kotlin)'];
  }
}
