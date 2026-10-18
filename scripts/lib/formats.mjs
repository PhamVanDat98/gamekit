// What a game build is made of: container (APK, Steam folder, .app, web folder…), store, engine.
// Used by `gamekit recon`. Table-driven: add a format by adding a rule, not code.
// Every path is matched lowercased, with "!/" (inside an archive) read as "/".
import fs from 'node:fs';
import path from 'node:path';
import { listZip, looksLikeZip, readZipEntry, zipSource } from './zip.mjs';

/** Archives recon opens and lists (all zips). Nested ones are opened up to MAX_DEPTH. */
const ZIP_EXT = /\.(apk|xapk|apks|apkm|aab|ipa|obb|zip|love|nw|jar)$/i;
const MAX_DEPTH = 2;
const NESTED_LIMIT = 512 * 2 ** 20; // a nested archive is inflated in memory
const MAX_FILES = 300000;

// ---------- Containers: how the game was shipped ----------
export const CONTAINERS = [
  { id: 'apk', label: 'Android APK', match: [/\.apk\/androidmanifest\.xml$/, /^androidmanifest\.xml$/] },
  { id: 'split-apk', label: 'Android split APK (XAPK/APKS/APKM)', match: [/\.(xapk|apks|apkm)\//, /(^|\/)(split_)?config\.[a-z0-9_]+\.apk$/] },
  { id: 'aab', label: 'Android App Bundle (AAB)', match: [/(^|\/)base\/manifest\/androidmanifest\.xml$/] },
  { id: 'obb', label: 'Android OBB (dữ liệu mở rộng)', match: [/\.obb$/] },
  { id: 'ipa', label: 'iOS IPA', match: [/(^|\/)payload\/[^/]+\.app\//] },
  { id: 'windows', label: 'Bản build Windows', match: [/\.exe$/] },
  { id: 'macos', label: 'Bản build macOS (.app)', match: [/\.app\/contents\/info\.plist$/] },
  { id: 'linux', label: 'Bản build Linux', match: [/\.(x86_64|x86)$/] },
  { id: 'electron', label: 'Electron (bên trong là web)', match: [/(^|\/)resources\/app\.asar(\/|$)/, /(^|\/)resources\/app\/package\.json$/] },
  { id: 'nwjs', label: 'NW.js (bên trong là web)', match: [/(^|\/)(nw\.dll|nw_elf\.dll|package\.nw|nw\.pak)$/, /\.nw\//] },
  { id: 'web', label: 'Thư mục web (HTML5)', match: [/(^|\/)index\.html?$/] },
  { id: 'source-project', label: 'Project gốc (source)', match: [
    /(^|\/)projectsettings\/projectversion\.txt$/, /\.uproject$/, /(^|\/)project\.godot$/, /\.yyp$/, /\.project\.gmx$/,
    /\.(c3p|capx|fla|xfl)$/, /(^|\/)game\.project$/, /(^|\/)game\.(rpgproject|rmmzproject)$/, /(^|\/)game\/[^/]+\.rpy$/,
    /\.fire$/,
  ] },
];

// ---------- Stores: features to map to portal SDKs at P4 ----------
export const STORES = [
  { id: 'steam', label: 'Steam', match: [/(^|\/)steamapps\/common\//, /(^|\/)(lib)?steam_api(64)?\.(dll|so|dylib|bundle)(\/|$)/, /(^|\/)steam_appid\.txt$/, /(^|\/)(steamworks\.net|facepunch\.steamworks[^/]*)\.dll$/] },
  { id: 'gog', label: 'GOG', match: [/(^|\/)goggame-\d+\.(info|dll|ico)$/, /(^|\/)galaxy(64)?\.dll$/] },
  { id: 'epic', label: 'Epic Games Store', match: [/(^|\/)\.egstore\//, /(^|\/)eossdk-[^/]+\.dll$/] },
  { id: 'itch', label: 'itch.io', match: [/(^|\/)\.itch\.toml$/] },
];

// ---------- Engines ----------
// `engine` is the game.yaml value; `label` the exact variant. `weight` breaks ties (specific beats generic).
// `requires`: every regex must match some path. `unless`: no regex may match any path.
const BUNDLE_JS = 'bundle JS (có thể minify; tìm source map *.js.map)';
export const ENGINE_RULES = [
  { id: 'unity-il2cpp', engine: 'unity', label: 'Unity (IL2CPP)', weight: 30,
    match: [/(^|\/)libil2cpp\.so$/, /(^|\/)gameassembly\.(dll|so|dylib)$/, /(^|\/)il2cpp_data\//],
    logic: '`libil2cpp.so` / `GameAssembly.dll` (native) + `global-metadata.dat` (tên class/hàm)',
    data: '`*_Data/` hoặc `assets/bin/Data/`: `globalgamemanagers`, `*.assets`, `*.resS`, AssetBundle',
    tools: 'Il2CppDumper / Cpp2IL lấy tên → Ghidra/IDA; AssetRipper, UABEA cho data' },
  { id: 'unity-mono', engine: 'unity', label: 'Unity (Mono)', weight: 30,
    match: [/(^|\/)managed\/assembly-csharp(-firstpass)?\.dll$/],
    logic: '`Managed/Assembly-CSharp.dll` (IL — đọc gần như source C#)',
    data: '`*_Data/` hoặc `assets/bin/Data/`: `*.assets`, `*.resS`, ScriptableObject, AssetBundle',
    tools: 'ILSpy / dnSpy; AssetRipper, UABEA' },
  { id: 'unity-webgl', engine: 'unity', label: 'Unity WebGL', weight: 30,
    match: [/(^|\/)build\/[^/]+\.loader\.js$/, /\.framework\.js(\.gz|\.br|\.unityweb)?$/, /\.data(\.gz|\.br|\.unityweb)$/, /(^|\/)unityloader\.js$/],
    logic: '`Build/*.wasm` (IL2CPP → wasm) + `*.framework.js`',
    data: '`Build/*.data` (UnityWebData: chứa globalgamemanagers, *.assets)',
    tools: 'wasm2c / Ghidra (plugin wasm), Il2CppDumper (wasm + metadata trong .data); AssetRipper cho data' },
  { id: 'unity', engine: 'unity', label: 'Unity', weight: 20,
    match: [/(^|\/)libunity\.so$/, /(^|\/)unityplayer\.(dll|dylib|so)$/, /(^|\/)unityframework\.framework\//, /(^|\/)globalgamemanagers$/, /(^|\/)data\.unity3d$/, /(^|\/)assets\/bin\/data\//, /\.unity3d$/],
    logic: 'xem biến thể Mono (`Managed/*.dll`) hay IL2CPP (`libil2cpp.so`/`GameAssembly`)',
    data: '`*.assets`, `*.resS`, AssetBundle', tools: 'AssetRipper, UABEA' },
  { id: 'unity-project', engine: 'unity', label: 'Unity (project gốc)', weight: 40,
    match: [/(^|\/)projectsettings\/projectversion\.txt$/],
    logic: '`Assets/**/*.cs` — đọc thẳng', data: '`Assets/` (prefab, ScriptableObject, scene YAML)', tools: 'Unity Editor; đọc file YAML' },
  { id: 'unreal', engine: 'unreal', label: 'Unreal Engine', weight: 30,
    match: [/(^|\/)content\/paks\/[^/]+\.(pak|utoc|ucas)$/, /\.(utoc|ucas)$/, /-shipping(\.exe)?$/, /(^|\/)lib(ue4|unreal)\.so$/, /(^|\/)engine\/binaries\//],
    logic: 'Blueprint trong `.pak`/`.utoc` (bytecode Kismet) + native trong exe/`libUE4.so`',
    data: '`Content/Paks/*.pak` (có thể mã hoá AES), `.uasset`/`.umap`',
    tools: 'FModel / UModel / repak; Blueprint: kismet-analyzer; native: Ghidra/IDA' },
  { id: 'unreal-project', engine: 'unreal', label: 'Unreal (project gốc)', weight: 40, match: [/\.uproject$/],
    logic: '`Source/` (C++) + Blueprint trong `Content/`', data: '`Content/*.uasset`', tools: 'Unreal Editor' },
  { id: 'godot', engine: 'godot', label: 'Godot', weight: 30,
    match: [/\.pck$/, /(^|\/)libgodot_android\.so$/, /(^|\/)godot[^/]*\.(exe|x86_64)$/],
    logic: 'script `.gd`/`.gdc` trong `.pck` (hoặc nhúng cuối exe)', data: '`.tres`, `.tscn`, `.import`, `.ctex` trong `.pck`',
    tools: 'GDRE Tools (gdsdecomp); `.pck` mã hoá cần key trong export preset' },
  { id: 'godot-project', engine: 'godot', label: 'Godot (project gốc)', weight: 40, match: [/(^|\/)project\.godot$/],
    logic: '`*.gd` — đọc thẳng', data: '`*.tres`, `*.tscn`', tools: 'Godot Editor' },
  { id: 'cocos-creator', engine: 'cocos', label: 'Cocos Creator', weight: 30,
    match: [/(^|\/)libcocos(2djs)?\.so$/, /(^|\/)cocos-js\//, /(^|\/)cocos2d-js(-min)?(\.[0-9a-f]+)?\.js$/, /(^|\/)assets\/(main|internal|resources)\/(config|index)(\.[0-9a-f]+)?\.(json|js|jsc)$/, /(^|\/)src\/settings(\.[0-9a-f]+)?\.(js|json|jsc)$/, /\.fire$/],
    logic: 'JS: `assets/*/index.js` / `src/project.js` (APK: có thể là `.jsc` mã hoá XXTEA)',
    data: '`assets/*/config.json` + `import/`, `native/` (uuid → file)', tools: 'đọc bundle; giải `.jsc` bằng khoá XXTEA; cocos-creator asset unpackers' },
  { id: 'cocos2dx-lua', engine: 'cocos', label: 'Cocos2d-x (Lua)', weight: 30, match: [/(^|\/)libcocos2dlua\.so$/, /\.luac$/],
    logic: 'script `.lua`/`.luac` (có thể mã hoá XXTEA + signature)', data: '`res/`, plist/atlas', tools: 'giải XXTEA; unluac / luadec' },
  { id: 'cocos2dx-cpp', engine: 'cocos', label: 'Cocos2d-x (C++)', weight: 25, match: [/(^|\/)libcocos2dcpp\.so$/, /(^|\/)libmygame\.so$/],
    logic: 'native trong `.so`', data: '`assets/` (plist, atlas, ccb/csb)', tools: 'Ghidra/IDA' },
  { id: 'flash', engine: 'flash', label: 'Flash / Adobe AIR', weight: 30,
    match: [/\.swf$/, /(^|\/)meta-inf\/air\/application\.xml$/, /(^|\/)libcore\.so$/, /(^|\/)adobe air\.framework\//],
    logic: 'ActionScript trong `.swf`', data: 'hình, âm thanh trong `.swf`', tools: 'JPEXS FFDec' },
  { id: 'construct', engine: 'construct', label: 'Construct', weight: 30,
    match: [/(^|\/)c3runtime\.js$/, /(^|\/)c2runtime\.js$/, /(^|\/)scripts\/c3main\.js$/, /\.(c3p|capx)$/],
    logic: 'event sheet trong `data.json` (C3) / `data.js` (C2)', data: '`images/`, `media/`', tools: 'đọc data.json; `.c3p` là zip của project' },
  { id: 'laya', engine: 'laya', label: 'LayaAir', weight: 30, match: [/(^|\/)laya\.(core|webgl|ui)(\.min)?\.js$/, /(^|\/)libs\/laya[^/]*\.js$/, /(^|\/)libconchruntime\.so$/],
    logic: BUNDLE_JS, data: '`res/`, `.atlas`, `.ls`/`.lh` (scene)', tools: 'đọc bundle' },
  { id: 'egret', engine: 'egret', label: 'Egret', weight: 30, match: [/(^|\/)egret(\.web)?(\.min)?\.js$/, /(^|\/)libegret\.so$/],
    logic: BUNDLE_JS, data: '`resource/` + `default.res.json`', tools: 'đọc bundle' },
  { id: 'playcanvas', engine: 'playcanvas', label: 'PlayCanvas', weight: 30, match: [/(^|\/)playcanvas(-stable)?(\.min)?\.js$/, /(^|\/)__start__\.js$/],
    logic: 'script trong `files/assets/*/` + `config.json`', data: '`config.json`, `scene/*.json`', tools: 'đọc JSON + script' },
  { id: 'gamemaker', engine: 'gamemaker', label: 'GameMaker', weight: 30,
    match: [/(^|\/)data\.win$/, /(^|\/)game\.(droid|ios|unx|win)$/, /(^|\/)libyoyo\.so$/, /(^|\/)html5game\//, /\.(yyp|project\.gmx)$/],
    logic: 'bytecode GML trong `data.win` (VM); bản YYC thì logic đã biên dịch native vào exe/`libyoyo.so`',
    data: '`data.win` (sprite, room, âm thanh `audiogroup*.dat`)', tools: 'UndertaleModTool; YYC: Ghidra' },
  { id: 'rpgmaker-mv', engine: 'rpgmaker', label: 'RPG Maker MV/MZ', weight: 30,
    match: [/(^|\/)js\/rpg_core\.js$/, /(^|\/)js\/rmmz_core\.js$/, /(^|\/)game\.(rpgproject|rmmzproject)$/],
    logic: 'event và database trong `data/*.json` (Map, CommonEvents, Skills…) + plugin `js/plugins/`', data: '`img/`, `audio/` (có thể mã hoá)',
    tools: 'đọc JSON; giải asset bằng `encryptionKey` trong `data/System.json`' },
  { id: 'rpgmaker-rgss', engine: 'rpgmaker', label: 'RPG Maker XP/VX/VX Ace', weight: 30,
    match: [/\.(rgssad|rgss2a|rgss3a)$/, /(^|\/)rgss\d+[a-z]?\.dll$/, /(^|\/)data\/scripts\.(rxdata|rvdata2?)$/],
    logic: 'Ruby (RGSS) trong `Scripts.rxdata/rvdata2` (Marshal)', data: '`Data/*.rvdata2`, `Graphics/`, `Audio/` (hoặc trong archive `.rgss*a`)',
    tools: 'RPG Maker Decrypter; rvpacker' },
  { id: 'renpy', engine: 'renpy', label: "Ren'Py", weight: 30, match: [/(^|\/)renpy\//, /\.rpa$/, /\.rpyc$/, /(^|\/)game\/[^/]+\.rpy$/],
    logic: 'script `.rpy` (hoặc `.rpyc` đã biên dịch)', data: 'archive `.rpa`, `game/images`, `game/audio`', tools: 'unrpa; unrpyc' },
  { id: 'wolf', engine: 'other', label: 'Wolf RPG Editor', weight: 30, match: [/(^|\/)data\.wolf$/, /\.wolf$/],
    logic: 'event trong `Data/*.wolf`', data: 'archive `.wolf`', tools: 'WolfDec / UberWolf' },
  { id: 'tyrano', engine: 'html5', label: 'TyranoScript', weight: 28, match: [/(^|\/)tyrano\/tyrano\.js$/, /(^|\/)data\/scenario\/[^/]+\.ks$/],
    logic: 'kịch bản `data/scenario/*.ks`', data: '`data/`', tools: 'đọc file text' },
  { id: 'defold', engine: 'defold', label: 'Defold', weight: 30, match: [/(^|\/)game\.(projectc|arcd|arci|dmanifest)$/, /(^|\/)libdmengine[^/]*\.so$/, /(^|\/)game\.project$/],
    logic: 'Lua đã biên dịch trong `game.arcd`', data: '`game.arcd` + `game.arci`', tools: 'defold-unpacker; unluac' },
  { id: 'love2d', engine: 'love2d', label: 'LÖVE (Love2D)', weight: 30, match: [/\.love(\/|$)/, /(^|\/)(love\.dll|liblove[^/]*\.so)$/, /(^|\/)conf\.lua$/],
    logic: 'Lua (`main.lua`…) trong `.love` (zip; bản fused nằm cuối exe)', data: 'trong `.love`', tools: 'giải zip; unluac nếu là bytecode' },
  { id: 'monogame', engine: 'monogame', label: 'MonoGame / XNA / FNA', weight: 30,
    match: [/(^|\/)(monogame\.framework|fna|microsoft\.xna\.framework[^/]*)\.dll$/, /\.xnb$/],
    logic: 'C# trong exe/dll .NET của game', data: '`Content/*.xnb`', tools: 'ILSpy / dnSpy; xnbcli' },
  { id: 'libgdx', engine: 'libgdx', label: 'libGDX', weight: 30, match: [/(^|\/)libgdx(64)?\.(so|dll|dylib)$/, /(^|\/)com\/badlogic\/gdx\//],
    logic: 'Java/Kotlin (`classes.dex` hoặc `.jar`)', data: '`assets/` (atlas, tmx)', tools: 'jadx; JD-GUI / CFR' },
  { id: 'openfl', engine: 'openfl', label: 'OpenFL / Lime (Haxe)', weight: 30, match: [/(^|\/)lime\.(ndll|hdll)$/, /(^|\/)libapplicationmain\.so$/, /(^|\/)lime\.js$/],
    logic: 'Haxe biên dịch sang C++ (native) hoặc JS', data: '`assets/`, `manifest/`', tools: 'đọc bundle JS; native: Ghidra' },
  { id: 'heaps', engine: 'other', label: 'Heaps / HashLink (Haxe)', weight: 30, match: [/(^|\/)hlboot\.dat$/, /(^|\/)libhl\.(dll|so|dylib)$/],
    logic: 'bytecode HashLink trong `hlboot.dat`', data: '`res.pak`', tools: 'hlbc' },
  { id: 'solar2d', engine: 'solar2d', label: 'Solar2D (Corona)', weight: 30, match: [/(^|\/)libcorona\.so$/, /(^|\/)resource\.car$/, /(^|\/)libsolar2d[^/]*$/],
    logic: 'Lua đã biên dịch trong `resource.car`', data: '`assets/`', tools: 'corona-archiver; unluac' },
  { id: 'flutter', engine: 'flutter', label: 'Flutter (Flame?)', weight: 30, match: [/(^|\/)libflutter\.so$/, /(^|\/)flutter_assets\//, /(^|\/)app\.framework\/flutter_assets\//],
    logic: 'Dart biên dịch AOT trong `libapp.so` / `App.framework`', data: '`flutter_assets/`', tools: 'blutter; reFlutter' },
  { id: 'react-native', engine: 'react-native', label: 'React Native', weight: 30, match: [/(^|\/)index\.android\.bundle$/, /(^|\/)main\.jsbundle$/, /(^|\/)libreactnativejni\.so$/],
    logic: '`index.android.bundle` / `main.jsbundle` (JS, hoặc Hermes bytecode)', data: '`assets/`, `res/`', tools: 'đọc bundle; Hermes: hermes-dec' },
  { id: 'phaser', engine: 'html5', label: 'HTML5 (Phaser)', weight: 15, match: [/(^|\/)phaser(\.min)?(\.[0-9a-f]+)?\.js$/], logic: BUNDLE_JS, data: 'JSON, atlas, tilemap', tools: 'đọc bundle, source map' },
  { id: 'pixi', engine: 'html5', label: 'HTML5 (PixiJS)', weight: 15, match: [/(^|\/)pixi(\.min)?(\.[0-9a-f]+)?\.js$/], logic: BUNDLE_JS, data: 'JSON, atlas', tools: 'đọc bundle, source map' },
  { id: 'three', engine: 'html5', label: 'HTML5 (three.js)', weight: 15, match: [/(^|\/)three(\.module)?(\.min)?\.js$/], logic: BUNDLE_JS, data: 'glTF/GLB, texture', tools: 'đọc bundle; glTF viewer' },
  { id: 'babylon', engine: 'html5', label: 'HTML5 (Babylon.js)', weight: 15, match: [/(^|\/)babylon(\.max)?\.js$/], logic: BUNDLE_JS, data: '`.babylon`, glTF', tools: 'đọc bundle' },
  { id: 'createjs', engine: 'html5', label: 'HTML5 (CreateJS / Animate)', weight: 15, match: [/(^|\/)(createjs|easeljs)[^/]*\.js$/], logic: BUNDLE_JS, data: 'spritesheet JSON', tools: 'đọc bundle' },
  { id: 'emscripten', engine: 'native', label: 'WebAssembly (Emscripten / native biên dịch sang web)', weight: 10, match: [/\.wasm(\.gz|\.br)?$/],
    unless: [/(^|\/)build\/[^/]+\.loader\.js$/, /\.framework\.js/], logic: '`.wasm`', data: 'file `.data` cạnh wasm (Emscripten FS)', tools: 'wasm2wat / wasm2c, Ghidra (plugin wasm)' },
  { id: 'android-native', engine: 'android-native', label: 'Android Java/Kotlin (không thấy engine)', weight: 5, match: [/(^|\/)classes\d*\.dex$/],
    logic: '`classes*.dex` (Java/Kotlin) + `lib/*/*.so` nếu có', data: '`assets/`, `res/`', tools: 'jadx; apktool cho resource' },
  { id: 'ios-native', engine: 'ios-native', label: 'iOS native (không thấy engine)', weight: 5, match: [/(^|\/)payload\/[^/]+\.app\/[^/]+$/],
    logic: 'Mach-O trong `Payload/*.app/` (có thể mã hoá FairPlay)', data: '`Payload/*.app/` (Assets.car…)', tools: 'Ghidra/IDA; class-dump' },
  { id: 'native-desktop', engine: 'native', label: 'Native (C/C++, không thấy engine)', weight: 3, match: [/\.exe$/, /\.app\/contents\/macos\//],
    unless: [/(^|\/)resources\/app(\.asar)?\//, /(^|\/)resources\/app\.asar$/, /(^|\/)(nw\.dll|package\.nw)$/, /(^|\/)index\.html?$/],
    logic: 'exe/dll native', data: 'file data riêng cạnh exe', tools: 'Ghidra / IDA' },
  { id: 'html5', engine: 'html5', label: 'HTML5 (chưa rõ framework)', weight: 2, match: [/(^|\/)index\.html?$/],
    logic: BUNDLE_JS, data: 'JSON, atlas, âm thanh cạnh index.html', tools: 'đọc bundle, source map' },
];

// ---------- Things worth knowing before P1 ----------
const NOTES = [
  { match: /\.jsc$/, text: 'Script đã mã hoá (`.jsc`, XXTEA của Cocos). Game của bạn: khoá nằm trong project gốc (build setting "Encrypt JS"); không còn project thì phải tìm khoá trong `libcocos*.so`.' },
  { match: /\.(rpgmvp|rpgmvo|rpgmvm|png_|ogg_|m4a_)$/, text: 'Asset RPG Maker đã mã hoá; khoá `encryptionKey` nằm trong `data/System.json`.' },
  { match: /\.(br|gz|unityweb)$/, text: 'Có file nén (brotli/gzip/unityweb) — giải nén trước khi phân tích.' },
  { match: /\.js\.map$/, text: 'Có source map (`*.js.map`) — đọc được code gần nguyên bản, ưu tiên dùng.' },
  { match: /\.obb$/, text: 'Có OBB: phần lớn asset nằm trong OBB chứ không phải APK.' },
  { match: /(^|\/)(split_)?config\.[a-z0-9_]+\.apk$/, text: 'Split APK: `base.apk` chứa code; `split_config.<abi>.apk` chứa `.so`, `split_config.<dpi>/<lang>` chứa tài nguyên — phân tích cả bộ.' },
  { match: /(^|\/)index\.android\.bundle$/, text: 'Bundle React Native có thể là Hermes bytecode (không phải JS đọc được) — kiểm tra header, dùng hermes-dec.' },
  { match: /(^|\/)content\/paks\/[^/]+\.pak$/, text: '`.pak` của Unreal có thể mã hoá AES. Game của bạn: key trong project (`Config/DefaultCrypto.ini` / `Crypto.json`).' },
  { match: /\.pck$/, text: '`.pck` của Godot có thể mã hoá. Game của bạn: key trong export preset (`export_presets.cfg`, `script_encryption_key`).' },
  { match: /(^|\/)(setup|install(er)?)[^/]*\.exe$|\.msi$/, text: 'Có vẻ là bộ cài, chưa phải game đã cài: cài vào máy (hoặc giải bằng innoextract / 7-Zip) rồi chạy recon trên thư mục cài.' },
  { match: /\.dmg$/, text: '`.dmg`: mount trên macOS (hoặc mở bằng 7-Zip), rồi chạy recon trên `.app` bên trong.' },
];

const STORE_NOTES = {
  steam: 'Steam: liệt kê tính năng Steamworks game dùng (achievement, cloud save, leaderboard, overlay, DLC) để map sang SDK portal ở P4. exe có thể bị bọc SteamStub DRM — game của bạn: lấy bản build không DRM từ máy build.',
  gog: 'GOG Galaxy: liệt kê tính năng Galaxy SDK game dùng để map sang portal ở P4.',
  epic: 'Epic Online Services: liệt kê tính năng EOS game dùng để map sang portal ở P4.',
};

const UNITY_VERSION = /\b(20\d\d|[3-6])\.\d+\.\d+[abfpx]\d+\b/;
const UNITY_VERSION_FILES = /(^|\/)(globalgamemanagers|data\.unity3d|maindata|projectsettings\/projectversion\.txt|[^/]+\.unity3d)$/;

/** Files of the input: a folder walk plus every listed archive, nested up to MAX_DEPTH. */
export function inventory(input) {
  const files = [];
  const problems = [];
  const sources = [];
  let truncated = false;
  const add = (p, size, read) => {
    if (files.length >= MAX_FILES) return void (truncated = true);
    files.push({ path: p, size, read });
  };
  const openZip = (src, prefix, depth) => {
    let entries;
    try {
      entries = listZip(src);
    } catch (e) {
      problems.push(`${prefix}: ${e.message}`);
      return;
    }
    for (const e of entries) {
      const p = `${prefix}!/${e.name}`;
      add(p, e.size, (n) => readZipEntry(src, e, { limit: n }));
      if (depth < MAX_DEPTH && ZIP_EXT.test(e.name)) {
        if (e.size > NESTED_LIMIT) problems.push(`${p}: lớn hơn ${NESTED_LIMIT / 2 ** 20} MB, không mở bên trong`);
        else {
          try {
            openZip(zipSource(readZipEntry(src, e)), p, depth + 1);
          } catch (err) {
            problems.push(`${p}: ${err.message}`);
          }
        }
      }
    }
  };
  const openFile = (abs, rel) => {
    const size = fs.statSync(abs).size;
    const read = (n) => readHead(abs, n);
    add(rel, size, read);
    if (/\.asar$/i.test(abs)) {
      try {
        for (const f of listAsar(abs)) add(`${rel}!/${f}`, 0, () => Buffer.alloc(0));
      } catch (e) {
        problems.push(`${rel}: ${e.message}`);
      }
    } else if (ZIP_EXT.test(abs) || (!/\.[a-z0-9]+$/i.test(abs) && looksLikeZip(read(4)))) {
      // Kept open: entries read from it later (version sniffing). close() releases them.
      const src = zipSource(abs);
      sources.push(src);
      openZip(src, rel, 1);
    }
  };

  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    const rec = (abs, rel) => {
      let ents;
      try {
        ents = fs.readdirSync(abs, { withFileTypes: true });
      } catch (e) {
        problems.push(`${rel || '.'}: ${e.message}`);
        return;
      }
      for (const ent of ents.sort((a, b) => a.name.localeCompare(b.name))) {
        if (truncated) return;
        const r = rel ? `${rel}/${ent.name}` : ent.name;
        const a = path.join(abs, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'node_modules' || ent.name === '.git') continue;
          rec(a, r);
        } else if (ent.isFile()) {
          try {
            openFile(a, r);
          } catch (e) {
            problems.push(`${r}: ${e.message}`);
          }
        }
      }
    };
    rec(input, '');
  } else openFile(input, path.basename(input));
  const close = () => sources.forEach((src) => src.close());
  return { files, problems, truncated, isDir: stat.isDirectory(), close };
}

function readHead(file, n) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(Math.min(n, fs.fstatSync(fd).size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

/** File paths inside an Electron .asar (header: pickle sizes, then JSON). */
export function listAsar(file) {
  const head = readHead(file, 16);
  if (head.length < 16) throw new Error('asar quá ngắn');
  const jsonLen = head.readUInt32LE(12);
  const fd = fs.openSync(file, 'r');
  let header;
  try {
    const buf = Buffer.alloc(jsonLen);
    fs.readSync(fd, buf, 0, jsonLen, 16);
    header = JSON.parse(buf.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
  const out = [];
  const rec = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (child.files) rec(child, p);
      else out.push(p);
    }
  };
  rec(header, '');
  return out;
}

const norm = (p) => p.toLowerCase().replaceAll('!/', '/');

function matchAll(rules, paths, cap = 3) {
  const out = [];
  for (const r of rules) {
    const evidence = [];
    for (const p of paths) if (r.match.some((re) => re.test(p.n)) && evidence.length < cap) evidence.push(p.path);
    if (!evidence.length) continue;
    if (r.requires && !r.requires.every((re) => paths.some((p) => re.test(p.n)))) continue;
    if (r.unless && r.unless.some((re) => paths.some((p) => re.test(p.n)))) continue;
    out.push({ ...r, match: undefined, requires: undefined, unless: undefined, evidence });
  }
  return out;
}

/** Recon of one path (file or folder): containers, stores, engines, version, notes. */
export function recon(input) {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) throw new Error(`Không có ${input}`);
  const inv = inventory(abs);
  try {
    return summarize(abs, inv);
  } finally {
    inv.close();
  }
}

function summarize(abs, inv) {
  const paths = inv.files.map((f) => ({ ...f, n: norm(f.path) }));
  // The absolute path itself says "Steam" (steamapps/common) even when no file does.
  const where = [{ path: abs, n: `${norm(abs.split(path.sep).join('/'))}/` }];
  const containers = matchAll(CONTAINERS, paths);
  if (!inv.isDir) {
    const ext = path.extname(abs).toLowerCase();
    const byExt = { '.apk': 'apk', '.xapk': 'split-apk', '.apks': 'split-apk', '.apkm': 'split-apk', '.aab': 'aab', '.ipa': 'ipa', '.obb': 'obb' }[ext];
    if (byExt && !containers.some((c) => c.id === byExt)) containers.unshift({ ...CONTAINERS.find((c) => c.id === byExt), match: undefined, evidence: [path.basename(abs)] });
  }
  const stores = matchAll(STORES, [...where, ...paths]);
  let engines = matchAll(ENGINE_RULES, paths).sort((a, b) => b.weight - a.weight);
  // Fallbacks only when nothing specific was found.
  const specific = engines.filter((e) => e.weight >= 10);
  if (specific.length) engines = specific;
  const sniffed = sniffSingleFile(abs, inv);
  if (sniffed && !engines.some((e) => e.id === sniffed.id)) engines.unshift(sniffed);

  const notes = [];
  for (const n of NOTES) if (paths.some((p) => n.match.test(p.n))) notes.push(n.text);
  for (const s of stores) if (STORE_NOTES[s.id]) notes.push(STORE_NOTES[s.id]);
  const has = (re) => paths.some((p) => re.test(p.n));
  if (engines.some((e) => e.id === 'unity-il2cpp') && !has(/(^|\/)global-metadata\.dat$/))
    notes.push('IL2CPP nhưng không thấy `global-metadata.dat`: metadata có thể bị đổi tên/mã hoá, hoặc nằm trong file khác (WebGL: trong `.data`).');
  if (has(/\.rpyc$/) && !has(/\.rpy$/)) notes.push("Ren'Py chỉ có `.rpyc` (không có `.rpy`): cần unrpyc để đọc script.");
  if (engines.some((e) => e.id === 'gamemaker') && !has(/(^|\/)data\.win$/) && has(/\.exe$/))
    notes.push('GameMaker không có `data.win` cạnh exe: có thể là bản YYC (logic biên dịch native) hoặc data nhúng trong exe.');
  if (containers.some((c) => c.id === 'electron' || c.id === 'nwjs')) notes.push('Electron/NW.js: game thật là web bên trong (`resources/app.asar`, `package.nw` hoặc thư mục cạnh exe) — engine ở dưới là của phần web đó.');
  if (inv.truncated) notes.push(`Dừng liệt kê ở ${MAX_FILES} file — chạy recon trên thư mục con chứa game.`);
  if (!engines.length) notes.push('Không nhận ra engine. Xem danh sách file lớn nhất bên dưới, mở `skills/game-recon/references/formats.md` để nhận diện bằng tay.');

  const engineVersion = detectVersion(engines[0]?.engine, paths);
  const largest = [...inv.files].sort((a, b) => b.size - a.size).slice(0, 10).map((f) => ({ path: f.path, size: f.size }));
  const strip = (x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));
  return {
    input: abs,
    isDir: inv.isDir,
    fileCount: inv.files.length,
    containers: containers.map(strip),
    stores: stores.map(strip),
    engines: engines.map(strip),
    engine: engines[0]?.engine ?? 'unknown',
    engineVersion,
    notes,
    problems: inv.problems,
    largest,
  };
}

/** A lone file with no telling extension: look at its magic bytes. */
function sniffSingleFile(abs, inv) {
  if (inv.isDir) return null;
  const head = readHead(abs, 8);
  const magic = head.toString('latin1', 0, 4);
  const rule = (id) => ({ ...ENGINE_RULES.find((r) => r.id === id), match: undefined, evidence: [`${path.basename(abs)} (magic ${JSON.stringify(magic)})`] });
  if (magic === 'GDPC') return rule('godot');
  if (['FWS', 'CWS', 'ZWS'].includes(magic.slice(0, 3))) return rule('flash');
  if (/^Unity(FS|Web|Raw)/.test(head.toString('latin1'))) return rule('unity');
  if (magic.startsWith('MZ')) {
    // Godot embeds its .pck at the end of the exe, ending with "GDPC".
    const size = fs.statSync(abs).size;
    const fd = fs.openSync(abs, 'r');
    const tail = Buffer.alloc(4);
    try {
      fs.readSync(fd, tail, 0, 4, Math.max(0, size - 4));
    } finally {
      fs.closeSync(fd);
    }
    if (tail.toString('latin1') === 'GDPC') return rule('godot');
  }
  return null;
}

function detectVersion(engine, paths) {
  try {
    if (engine === 'unity') {
      for (const p of paths.filter((x) => UNITY_VERSION_FILES.test(x.n))) {
        const m = p.read(4096).toString('latin1').match(UNITY_VERSION);
        if (m) return m[0];
      }
    }
    if (engine === 'godot') {
      for (const p of paths.filter((x) => /\.pck$/.test(x.n))) {
        const h = p.read(20);
        if (h.length >= 20 && h.toString('latin1', 0, 4) === 'GDPC') return `${h.readUInt32LE(8)}.${h.readUInt32LE(12)}.${h.readUInt32LE(16)}`;
      }
      for (const p of paths.filter((x) => /(^|\/)project\.godot$/.test(x.n))) {
        const m = p.read(65536).toString('utf8').match(/config\/features=PackedStringArray\("(\d+\.\d+)"/);
        if (m) return m[1];
      }
    }
  } catch {
    // Version is a nicety; an unreadable file must not fail recon.
  }
  return null;
}
