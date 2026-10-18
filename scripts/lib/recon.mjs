// Recon of an original game build or project: engine, variant, version, where logic and data live,
// SDKs, signs of obfuscation, and a first list of gameplay types (the mechanism inventory).
// Works on a folder, an APK/IPA/zip, or a single file (.dll, Il2CppDumper dump.cs, .pck, .swf).
// Everything here is a reading of file names and headers; the report says what it could not tell.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { dotnetTypes, godotPck, zipEntries, zipRead } from './binfmt.mjs';

const ZIP_EXT = /\.(apk|aab|ipa|zip|xapk|apks|jar|nupkg|whl)$/i;
const MAX_FILES = 200000;
const UNITY_VERSION = /\b((?:20[1-9]\d|6000|5|4)\.\d{1,2}\.\d{1,3}[abfpx]\d{1,3})\b/;

// ---------- reading a target ----------
/** { kind, root, files: [{ rel, size }], read(rel, max?) } for a folder, an archive or one file. */
export function openTarget(target) {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error(`không có ${target}`);
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    const files = [];
    const rec = (dir, rel) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (files.length >= MAX_FILES) return;
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'Library' || ent.name === 'Temp') continue;
        const r = rel ? `${rel}/${ent.name}` : ent.name;
        const a = path.join(dir, ent.name);
        if (ent.isDirectory()) rec(a, r);
        else if (ent.isFile()) files.push({ rel: r, size: fs.statSync(a).size });
      }
    };
    rec(abs, '');
    const read = (rel, max = Infinity) => {
      const f = path.join(abs, rel);
      if (max === Infinity) return fs.readFileSync(f);
      const fd = fs.openSync(f, 'r');
      try {
        const b = Buffer.alloc(Math.min(max, fs.fstatSync(fd).size));
        fs.readSync(fd, b, 0, b.length, 0);
        return b;
      } finally {
        fs.closeSync(fd);
      }
    };
    return { kind: 'dir', root: abs, files, read, truncated: files.length >= MAX_FILES };
  }
  if (ZIP_EXT.test(abs)) {
    const entries = zipEntries(abs).filter((e) => !e.name.endsWith('/'));
    const byName = new Map(entries.map((e) => [e.name, e]));
    return {
      kind: 'archive',
      root: abs,
      files: entries.map((e) => ({ rel: e.name, size: e.size })),
      read: (rel, max) => zipRead(abs, byName.get(rel), max),
    };
  }
  return { kind: 'file', root: abs, files: [{ rel: path.basename(abs), size: st.size }], read: (_rel, max = Infinity) => readHead(abs, max) };
}

function readHead(file, max) {
  if (max === Infinity) return fs.readFileSync(file);
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(Math.min(max, fs.fstatSync(fd).size));
    fs.readSync(fd, b, 0, b.length, 0);
    return b;
  } finally {
    fs.closeSync(fd);
  }
}

/** gzip / brotli (.unityweb is either) → plain bytes; a prefix decodes as far as it goes. */
function decoded(rel, buf) {
  try {
    if (buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    if (/\.(br|unityweb)$/i.test(rel)) return zlib.brotliDecompressSync(buf, { finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH });
  } catch {
    /* not compressed after all, or a truncated prefix the decoder rejects */
  }
  return buf;
}

const tryRead = (t, rel, max) => {
  try {
    return decoded(rel, t.read(rel, max));
  } catch {
    return null;
  }
};

// ---------- SDKs found by name ----------
const SDKS = [
  { cat: 'server', label: 'mạng / dữ liệu phía server', re: /photon|playfab|\bmirror\b|nakama|colyseus|socket\.?io|unity\.netcode|fusion\.runtime|smartfox|firebase\.(database|firestore|functions)|websocket-sharp|bestmhttp/i },
  { cat: 'ads', label: 'quảng cáo (bỏ, thay bằng SDK portal ở P4)', re: /googlemobileads|applovin|maxsdk|ironsource|unity\.?ads|unityengine\.advertisements|vungle|adcolony|chartboost|pangle|mintegral|admob|yandexmobileads/i },
  { cat: 'analytics', label: 'analytics (bỏ, thay bằng event portal)', re: /firebase\.analytics|gameanalytics|appsflyer|\badjust\b|facebook|crashlytics|amplitude/i },
  { cat: 'iap', label: 'mua trong app (portal không có — cần quyết định D-n)', re: /unityengine\.purchasing|billingclient|storekit|\bpurchasing\b/i },
  { cat: 'lib', label: 'thư viện cần tương đương trên web', re: /spine|dotween|textmeshpro|dragonbones|\blean(tween|touch)\b|cinemachine|box2d|\bchipmunk\b/i },
];

function sdkHits(names) {
  const hits = new Map();
  for (const n of names) {
    const base = n.split('/').pop();
    for (const s of SDKS) if (s.re.test(base)) {
      const set = hits.get(s.cat) ?? new Set();
      set.add(base.replace(/\.(dll|so|js|jar|aar)$/i, '').replace(/^lib/, ''));
      hits.set(s.cat, set);
    }
  }
  return SDKS.filter((s) => hits.has(s.cat)).map((s) => ({ cat: s.cat, label: s.label, names: [...hits.get(s.cat)].slice(0, 8) }));
}

// ---------- inventory sources ----------
const LIB_NS = /^(DG\.Tweening|TMPro|Spine|Photon|PlayFab|Firebase|GoogleMobileAds|UnityEngine|Unity\.|Sirenix|Newtonsoft|Facebook|AppsFlyer|GameAnalyticsSDK|com\.|I2\.|Lean\.|Cinemachine)/;

/** Gameplay-relevant types of a managed assembly → inventory items. */
export function inventoryFromAssembly(buf, where) {
  const types = dotnetTypes(buf);
  if (!types) return null;
  return types
    .filter((x) => (x.kind === 'class' || x.kind === 'struct') && !/Attribute$/.test(x.base ?? '') && !LIB_NS.test(x.ns))
    .map((x) => ({ id: x.ns ? `${x.ns}.${x.name}` : x.name, kind: x.unity ?? x.kind, where, methods: x.methods }));
}

/** Il2CppDumper dump.cs → types of Assembly-CSharp.dll (by the TypeDefIndex ranges in its header). */
export function inventoryFromDump(text, where) {
  const images = [...text.matchAll(/^\/\/ Image \d+: (.+?) - (\d+)/gm)].map((m) => ({ name: m[1], start: Number(m[2]) })).sort((a, b) => a.start - b.start);
  const imageOf = (idx) => images.filter((i) => i.start <= idx).at(-1)?.name;
  const items = [];
  let ns = '';
  for (const line of text.split(/\r?\n/)) {
    const n = line.match(/^\/\/ Namespace: ?(.*)$/);
    if (n) {
      ns = n[1].trim();
      continue;
    }
    const m = line.match(/^(?:(?:public|internal|private|protected|sealed|abstract|static)\s+)*(class|struct)\s+([\w`]+)(?:\s*:\s*([\w.<>`, ]+?))?\s*\/\/ TypeDefIndex: (\d+)/);
    if (!m || m[2].includes('<')) continue;
    const img = imageOf(Number(m[4]));
    if (images.length && img !== 'Assembly-CSharp.dll') continue;
    if (LIB_NS.test(ns)) continue;
    const base = (m[3] ?? '').split(',')[0].trim();
    items.push({ id: ns ? `${ns}.${m[2]}` : m[2], kind: /^(MonoBehaviour|ScriptableObject)$/.test(base) ? base : m[1], where, base });
  }
  // MonoBehaviour through a base class defined in the game.
  const byId = new Map(items.map((i) => [i.id.split('.').pop(), i]));
  for (const i of items) {
    let b = i.base;
    for (let hop = 0; hop < 16 && b && !/^(MonoBehaviour|ScriptableObject)$/.test(i.kind); hop++) {
      const up = byId.get(b);
      if (!up) break;
      if (/^(MonoBehaviour|ScriptableObject)$/.test(up.kind)) i.kind = up.kind;
      b = up.base;
    }
    delete i.base;
  }
  return items;
}

function inventoryFromCSharpSources(t, files) {
  const items = [];
  for (const f of files) {
    const text = tryRead(t, f.rel, 2 << 20)?.toString('utf8') ?? '';
    for (const m of text.matchAll(/^\s*(?:(?:public|internal|sealed|abstract|static|partial)\s+)*(class|struct)\s+(\w+)(?:<[^>]*>)?\s*(?::\s*([\w.]+))?/gm)) {
      items.push({ id: m[2], kind: /^(MonoBehaviour|ScriptableObject)$/.test(m[3] ?? '') ? m[3] : m[1], where: f.rel, lines: text.split('\n').length });
    }
  }
  return items;
}

function inventoryFromCocos(t, files) {
  const items = [];
  const seen = new Set();
  for (const f of files) {
    const text = tryRead(t, f.rel, 16 << 20)?.toString('utf8') ?? '';
    const found = [
      ...text.matchAll(/_RF\.push\([^,]*,\s*["'][\w-]+["'],\s*["'](\w+)["']/g),
      ...text.matchAll(/@ccclass\(\s*["'](\w+)["']\s*\)/g),
    ].map((m) => m[1]);
    for (const name of found) if (!seen.has(name)) {
      seen.add(name);
      items.push({ id: name, kind: 'component', where: f.rel });
    }
  }
  return items;
}

const scriptItems = (paths, where) => {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    const id = p.replace(/^res:\/\//, '').replace(/\.(gd|gdc|gde)(\.remap)?$/, '');
    if (seen.has(id) || /^(addons|\.godot|\.import)\//.test(id)) continue;
    seen.add(id);
    out.push({ id, kind: 'script', where });
  }
  return out;
};

// ---------- tools ----------
const TOOLS = {
  'unity:source': ['đọc thẳng Assets/**/*.cs', 'Unity Editor để chạy và đo (game của bạn)'],
  'unity:mono': ['REA inspect_managed_artifact', 'ILSpy / dnSpy (ilspycmd)', 'AssetRipper cho asset'],
  'unity:il2cpp': ['Il2CppDumper hoặc Cpp2IL → DummyDll, rồi `gamekit recon <DummyDll/Assembly-CSharp.dll> --write`', 'REA open_binary / analyze_function trên GameAssembly/libil2cpp', 'AssetRipper cho asset'],
  'unity:webgl': ['REA inspect_wasm_artifact', 'Il2CppDumper (wasm + global-metadata trong .data)', 'AssetRipper cho .data'],
  'godot:source': ['đọc thẳng *.gd'],
  'godot:pck': ['GDRE Tools (khôi phục project từ .pck)'],
  'cocos:creator-2': ['REA analyze_javascript_application', 'đọc bundle src/project.js / assets/*/index.js'],
  'cocos:creator-3': ['REA analyze_javascript_application', 'đọc bundle assets/*/index.js'],
  'cocos:native': ['giải nén APK; script .jsc cần khoá xxtea trong libcocos2djs.so (REA open_binary)', 'REA analyze_javascript_application sau khi giải mã'],
  'cocos:source': ['đọc thẳng assets/**/*.ts|js'],
  construct: ['đọc data.json (event sheet) và c3runtime.js / c2runtime.js'],
  laya: ['REA analyze_javascript_application', 'đọc bundle js'],
  html5: ['REA analyze_javascript_application', 'đọc bundle js, source map nếu có'],
  flash: ['JPEXS FFDec (ActionScript + asset)'],
  unreal: ['FModel / UModel cho .pak', 'REA open_binary / analyze_function cho code native'],
  gamemaker: ['UndertaleModTool (data.win / game.unx / game.droid)'],
  other: ['REA open_binary / binary_overview', 'Ghidra / IDA'],
};

// ---------- detection ----------
/**
 * Full report for a target. `inventory` is null when no list of gameplay types could be read;
 * `unknowns` lists what recon could not tell, so nobody mistakes silence for "not there".
 */
export function recon(target) {
  const t = openTarget(target);
  const rels = t.files.map((f) => f.rel);
  const has = (re) => rels.find((r) => re.test(r));
  const all = (re) => t.files.filter((f) => re.test(f.rel));
  const r = {
    target: t.root,
    kind: t.kind,
    files: t.files.length,
    bytes: t.files.reduce((s, f) => s + f.size, 0),
    engine: 'unknown',
    variant: null,
    engineVersion: null,
    platform: null,
    hasSource: false,
    logic: [],
    data: [],
    signals: [],
    unknowns: [],
    sdks: [],
    obfuscated: null,
    inventory: null,
    inventoryOnly: false,
  };
  const signal = (level, text) => r.signals.push({ level, text });
  if (t.truncated) r.unknowns.push(`chỉ quét ${MAX_FILES} file đầu`);

  // A single file given as an inventory source.
  if (t.kind === 'file') {
    const name = path.basename(t.root);
    if (/\.dll$/i.test(name)) {
      const items = inventoryFromAssembly(t.read(name), name);
      if (!items) throw new Error(`${name} không phải assembly .NET (không có metadata)`);
      Object.assign(r, { inventoryOnly: true, inventory: { source: name, items } });
      return r;
    }
    if (/\.cs$/i.test(name)) {
      Object.assign(r, { inventoryOnly: true, inventory: { source: name, items: inventoryFromDump(t.read(name).toString('utf8'), name) } });
      return r;
    }
    if (/\.pck$/i.test(name)) {
      const pck = godotPck(t.root);
      Object.assign(r, { engine: 'godot', variant: 'pck', engineVersion: pck.godot, logic: [name], data: [name] });
      r.inventory = { source: name, items: scriptItems(pck.files.filter((f) => /\.(gd|gdc|gde)(\.remap)?$/.test(f)), name) };
      return finish(r);
    }
    if (/\.swf$/i.test(name)) {
      const h = t.read(name, 8);
      Object.assign(r, { engine: 'flash', variant: 'swf', engineVersion: `SWF ${h[3]}`, logic: [name], data: [name] });
      return finish(r);
    }
  }

  // Platform from the container.
  if (has(/^lib\/[^/]+\/[^/]+\.so$/) || /\.(apk|aab|xapk)$/i.test(t.root)) r.platform = 'android';
  else if (has(/^Payload\/[^/]+\.app\//)) r.platform = 'ios';
  else if (has(/\.exe$/i)) r.platform = 'windows';
  else if (has(/(^|\/)index\.html$/i)) r.platform = 'web';
  if (/\.xapk$/i.test(t.root) && has(/\.apk$/i)) r.unknowns.push('XAPK: giải nén rồi chạy recon trên file .apk chính bên trong');

  const managed = all(/(^|\/)Managed\/Assembly-CSharp\.dll$/);
  const metadata = has(/global-metadata\.dat$/);
  const unityVersionFrom = (re) => {
    for (const f of all(re)) {
      const m = tryRead(t, f.rel, 1 << 16)?.toString('latin1').match(UNITY_VERSION);
      if (m) return m[1];
    }
    return null;
  };

  if (has(/(^|\/)ProjectSettings\/ProjectVersion\.txt$/) && has(/(^|\/)Assets\//)) {
    Object.assign(r, { engine: 'unity', variant: 'source', hasSource: true });
    const pv = tryRead(t, has(/(^|\/)ProjectSettings\/ProjectVersion\.txt$/), 4096)?.toString('utf8');
    r.engineVersion = pv?.match(/m_EditorVersion:\s*(\S+)/)?.[1] ?? null;
    const scripts = all(/(^|\/)Assets\/.*\.cs$/).filter((f) => !/\/(Editor|Plugins|ThirdParty|Packages)\//i.test(f.rel));
    r.logic = [`Assets/**/*.cs (${scripts.length} file)`];
    r.data = ['Assets/ (scene, prefab, ScriptableObject)'];
    r.inventory = { source: 'Assets/**/*.cs', items: inventoryFromCSharpSources(t, scripts) };
  } else if (metadata || has(/(^|\/)(GameAssembly\.dll|libil2cpp\.so)$/)) {
    Object.assign(r, { engine: 'unity', variant: 'il2cpp' });
    r.logic = [has(/(^|\/)(GameAssembly\.dll|libil2cpp\.so)$/), metadata].filter(Boolean);
    r.data = dataDirs(rels);
    if (metadata) {
      const head = tryRead(t, metadata, 8);
      if (head && head.readUInt32LE(0) === 0xfab11baf) signal('info', `global-metadata.dat bình thường (v${head.readUInt32LE(4)}) — Il2CppDumper/Cpp2IL dùng được`);
      else {
        signal('risk', 'global-metadata.dat không có magic FAB11BAF — có thể đã mã hoá hoặc đổi định dạng; Il2CppDumper sẽ không chạy thẳng');
        r.obfuscated = true;
      }
      const meta = tryRead(t, metadata, 64 << 20)?.toString('latin1') ?? '';
      r.sdkNames = [...new Set(meta.match(/[\w.-]{3,60}\.dll/g) ?? [])];
    } else r.unknowns.push('không thấy global-metadata.dat — có thể bị đổi tên/nhúng vào binary');
    r.engineVersion = unityVersionFrom(/(^|\/)(globalgamemanagers|data\.unity3d|level0|unity default resources)$/);
    r.unknowns.push('danh mục cơ chế: IL2CPP không có IL — chạy Il2CppDumper/Cpp2IL rồi `gamekit recon <DummyDll/Assembly-CSharp.dll | dump.cs> --write`');
  } else if (managed.length) {
    Object.assign(r, { engine: 'unity', variant: 'mono' });
    r.logic = managed.map((f) => f.rel);
    r.data = dataDirs(rels);
    r.engineVersion = unityVersionFrom(/(^|\/)(globalgamemanagers|data\.unity3d|level0|unity default resources)$/);
    const buf = tryRead(t, managed[0].rel, 128 << 20);
    const items = buf && inventoryFromAssembly(buf, managed[0].rel);
    if (items) r.inventory = { source: managed[0].rel, items };
    else r.unknowns.push(`không đọc được metadata của ${managed[0].rel}`);
    if (buf) {
      const marks = buf.toString('latin1').match(/ConfusedByAttribute|Beebyte|ObfuscatedByGoliath|DotfuscatorAttribute|Obfuscar|BabelObfuscator|SmartAssembly|Eazfuscator|\.NET Reactor/g);
      const short = items ? items.filter((i) => i.id.split('.').pop().length <= 2 || /[^\x20-\x7e]/.test(i.id)).length : 0;
      if (marks?.length || (items && items.length > 10 && short / items.length > 0.3)) {
        r.obfuscated = true;
        signal('risk', `Assembly-CSharp.dll có dấu hiệu bị làm rối${marks?.length ? ` (${[...new Set(marks)].join(', ')})` : ' (tên type ngắn/ký tự lạ)'}`);
      } else r.obfuscated = false;
    }
    r.sdkNames = all(/(^|\/)Managed\/[^/]+\.dll$/).map((f) => f.rel);
  } else if (has(/(^|\/)Build\/[^/]+\.(wasm|wasm\.gz|wasm\.br|wasm\.unityweb)$/i) || has(/(^|\/)(Build\/)?UnityLoader\.js$/)) {
    Object.assign(r, { engine: 'unity', variant: 'webgl', platform: 'web' });
    r.logic = all(/(^|\/)Build\/[^/]+\.(wasm|framework\.js)(\.gz|\.br|\.unityweb)?$/i).map((f) => f.rel);
    r.data = all(/(^|\/)Build\/[^/]+\.data(\.gz|\.br|\.unityweb)?$/i).map((f) => f.rel);
    r.engineVersion = unityVersionFrom(/(^|\/)Build\/[^/]+\.(loader\.js|framework\.js(\.gz|\.br|\.unityweb)?|json)$/i);
  } else if (has(/(^|\/)project\.godot$/)) {
    Object.assign(r, { engine: 'godot', variant: 'source', hasSource: true });
    const pg = tryRead(t, has(/(^|\/)project\.godot$/), 1 << 16)?.toString('utf8') ?? '';
    r.engineVersion = pg.match(/config\/features=PackedStringArray\("([\d.]+)"/)?.[1] ?? (/config_version=4/.test(pg) ? '3.x' : null);
    const gd = all(/\.gd$/);
    r.logic = [`*.gd (${gd.length} file)`];
    r.data = ['*.tscn, *.tres'];
    r.inventory = { source: '*.gd', items: scriptItems(gd.map((f) => f.rel), 'project') };
  } else if (has(/\.pck$/i) || has(/(^|\/)libgodot_android\.so$/)) {
    Object.assign(r, { engine: 'godot', variant: 'pck' });
    const pckRel = has(/\.pck$/i);
    r.logic = [pckRel ?? 'pck nhúng trong binary'];
    r.data = r.logic;
    if (pckRel && t.kind === 'dir') {
      try {
        const pck = godotPck(path.join(t.root, pckRel));
        r.engineVersion = pck.godot;
        r.inventory = { source: pckRel, items: scriptItems(pck.files.filter((f) => /\.(gd|gdc|gde)(\.remap)?$/.test(f)), pckRel) };
      } catch (e) {
        signal('risk', e.message);
        if (/mã hoá/.test(e.message)) r.obfuscated = true;
      }
    } else r.unknowns.push('phiên bản Godot và danh sách script: giải nén .pck (GDRE Tools) rồi chạy recon trên thư mục đó');
  } else if (has(/(^|\/)(cocos2d-js[\w.-]*\.js|cocos2d-jsb[\w.-]*\.js|lib(cocos2djs|cocos)\.so)$/) || has(/(^|\/)cocos-js\//) || has(/(^|\/)src\/settings[\w.]*\.js$/)) {
    r.engine = 'cocos';
    const jsc = all(/\.jsc$/);
    r.variant = has(/(^|\/)cocos-js\//) || has(/(^|\/)src\/import-map[\w.]*\.json$/) ? 'creator-3' : has(/lib(cocos2djs|cocos)\.so$/) ? 'native' : 'creator-2';
    const engineJs = has(/(^|\/)(cocos2d-js[\w.-]*\.js|cocos2d-jsb[\w.-]*\.js|cocos-js\/cc[\w.-]*\.js)$/);
    const ejs = engineJs ? tryRead(t, engineJs, 4 << 20)?.toString('latin1') ?? '' : '';
    r.engineVersion = ejs.match(/(?:ENGINE_VERSION|CocosEngine)\s*[=:]\s*["']([\d.]+)["']/)?.[1] ?? null;
    const bundles = all(/(^|\/)(src\/project[\w.-]*\.js|assets\/[^/]+\/index[\w.-]*\.js|assets\/[^/]+\/(?:[^/]+\/)?[\w-]+\.js)$/).filter((f) => !/cocos2d|cocos-js/.test(f.rel)).slice(0, 50);
    r.logic = [...bundles.map((f) => f.rel).slice(0, 6), ...(jsc.length ? [`${jsc.length} file .jsc (đã mã hoá)`] : [])];
    r.data = all(/(^|\/)(res|assets)\/[^/]+\/(config|import)[\w.-]*\.json$/).map((f) => f.rel).slice(0, 4);
    if (jsc.length) {
      r.obfuscated = true;
      signal('risk', `${jsc.length} script .jsc đã mã hoá (xxtea) — cần khoá trong libcocos2djs.so trước khi đọc được`);
    }
    const items = inventoryFromCocos(t, bundles);
    if (items.length) r.inventory = { source: 'cc._RF.push / @ccclass', items };
    else r.unknowns.push('không lấy được danh sách component từ bundle (đã mã hoá hoặc build lạ)');
  } else if (has(/(^|\/)c3runtime\.js$/) || has(/(^|\/)c2runtime\.js$/)) {
    Object.assign(r, { engine: 'construct', variant: has(/c3runtime\.js$/) ? 'c3' : 'c2' });
    r.logic = [has(/(^|\/)data\.json$/) ?? 'data.json', has(/c[23]runtime\.js$/)];
    r.data = ['images/, media/'];
    r.unknowns.push('danh mục cơ chế: logic nằm trong event sheet của data.json — lập tay theo từng sheet');
  } else if (has(/(^|\/)(libs\/)?laya[\w.-]*\.js$/i)) {
    Object.assign(r, { engine: 'laya', variant: 'js' });
    r.logic = all(/(^|\/)js\/[^/]+\.js$/).map((f) => f.rel).slice(0, 6);
  } else if (has(/\.swf$/i)) {
    Object.assign(r, { engine: 'flash', variant: 'swf' });
    r.logic = all(/\.swf$/i).map((f) => f.rel);
    r.data = r.logic;
  } else if (has(/\.pak$/i) || has(/(^|\/)lib(UE4|Unreal)\.so$/) || has(/-Shipping\.exe$/i)) {
    Object.assign(r, { engine: 'unreal', variant: 'pak' });
    r.logic = [has(/(^|\/)lib(UE4|Unreal)\.so$/) ?? has(/-Shipping\.exe$/i), has(/\.pak$/i)].filter(Boolean);
    r.data = all(/\.pak$/i).map((f) => f.rel);
  } else if (has(/(^|\/)(data\.win|game\.unx|game\.ios|game\.droid)$/)) {
    Object.assign(r, { engine: 'gamemaker', variant: 'bytecode' });
    r.logic = [has(/(^|\/)(data\.win|game\.unx|game\.ios|game\.droid)$/)];
    r.data = r.logic;
    if (has(/(^|\/)lib(yoyo|yyc)[\w]*\.so$/i)) signal('risk', 'có thể là YYC (code biên dịch native) — UndertaleModTool không đọc được logic');
  } else if (has(/\.(js|mjs)$/) && has(/(^|\/)index\.html$/i)) {
    r.engine = 'html5';
    const libs = { phaser: /phaser[\w.-]*\.js$/i, pixi: /pixi[\w.-]*\.js$/i, three: /three[\w.-]*\.js$/i, createjs: /(createjs|easeljs)[\w.-]*\.js$/i };
    r.variant = Object.keys(libs).find((k) => has(libs[k])) ?? 'js';
    r.logic = all(/\.js$/).sort((a, b) => b.size - a.size).slice(0, 5).map((f) => f.rel);
  } else if (has(/\.(exe|so|dylib|elf)$/i)) {
    Object.assign(r, { engine: 'other', variant: 'native' });
    r.logic = all(/\.(exe|so|dll|dylib)$/i).sort((a, b) => b.size - a.size).slice(0, 4).map((f) => f.rel);
  } else r.unknowns.push('không nhận ra engine — xem cấu trúc thư mục bằng tay, hoặc đưa đúng thư mục/APK của bản build');

  // JS: source maps make it easy; javascript-obfuscator makes it hard.
  if (['cocos', 'html5', 'laya', 'construct'].includes(r.engine)) {
    if (has(/\.js\.map$/)) signal('info', `có source map (${all(/\.js\.map$/).length} file) — đọc được gần như source`);
    const main = all(/\.js$/).filter((f) => !/cocos2d|cocos-js|phaser|pixi|three|laya\.core/i.test(f.rel)).sort((a, b) => b.size - a.size)[0];
    const sample = main && tryRead(t, main.rel, 2 << 20)?.toString('latin1');
    if (sample) {
      const hex = (sample.match(/_0x[0-9a-f]{4,6}/g) ?? []).length;
      if (hex > 200) {
        r.obfuscated = true;
        signal('risk', `${main.rel} bị làm rối kiểu javascript-obfuscator (${hex} tên _0x…)`);
      } else r.obfuscated ??= false;
    }
  }
  if (r.engine === 'unknown') r.unknowns.push('engine');
  if (!r.engineVersion && r.engine !== 'unknown') r.unknowns.push('phiên bản engine');
  return finish(r, rels);
}

function dataDirs(rels) {
  const dirs = new Set();
  for (const r of rels) {
    const m = r.match(/^(.*?(?:_Data|assets\/bin\/Data|Data))\/(?:[^/]+\.(?:assets|resS|resource|bundle|unity3d)|globalgamemanagers|level\d+|StreamingAssets\/)/);
    if (m) dirs.add(`${m[1]}/`);
  }
  return [...dirs].slice(0, 4);
}

function finish(r, rels = []) {
  r.sdks = sdkHits([...rels, ...(r.sdkNames ?? [])]);
  delete r.sdkNames;
  for (const s of r.sdks) if (s.cat === 'server') r.signals.push({ level: 'risk', text: `có SDK ${s.label}: ${s.names.join(', ')} — phần chạy trên server không nằm trong file game` });
  r.tools = TOOLS[`${r.engine}:${r.variant}`] ?? TOOLS[r.engine] ?? TOOLS.other;
  if (r.engine === 'unity' && r.variant === 'mono' && r.obfuscated) r.tools = ['de4dot (gỡ làm rối) trước khi đọc', ...r.tools];
  return r;
}
