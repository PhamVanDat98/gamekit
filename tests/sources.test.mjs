import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir, write, read, solidPng, gk, newGame, editYaml } from './helpers.mjs';
import { zipDir } from '../scripts/lib/zip.mjs';
import { listZip, readZipEntry } from '../scripts/lib/unzip.mjs';
import { openSource } from '../scripts/lib/source.mjs';
import { recon } from '../scripts/recon.mjs';
import { parseTrace, buildCases, thin, flatten } from '../scripts/oracle.mjs';
import { parseUnityMeta, unityAtlas, scanAssets, ffmpegArgs, findFfmpeg } from '../scripts/assets.mjs';

const tree = (files) => {
  const dir = tmpDir();
  for (const [rel, body] of Object.entries(files)) write(dir, rel, body);
  return dir;
};
const archive = (files, name = 'game.apk') => {
  const out = path.join(tmpDir(), name);
  zipDir(tree(files), out);
  return out;
};

test('unzip: lists and reads entries written by our zip writer (deflate), names stay UTF-8', () => {
  const big = 'x'.repeat(5000);
  const apk = archive({ 'lib/arm64-v8a/libil2cpp.so': 'ELF', 'assets/Màn 1.json': big });
  const list = listZip(apk);
  assert.deepEqual(list.map((e) => e.name).sort(), ['assets/Màn 1.json', 'lib/arm64-v8a/libil2cpp.so']);
  const e = list.find((x) => x.name === 'assets/Màn 1.json');
  assert.equal(readZipEntry(apk, e).toString(), big);
  assert.equal(readZipEntry(apk, e, { limit: 10 }).toString(), 'x'.repeat(10));
  assert.throws(() => listZip(path.join(tree({ 'a.zip': 'not a zip' }), 'a.zip')), /không phải file zip/);
});

test('recon: engine, flavour and version from projects, builds and archives', () => {
  const cases = [
    [{ 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 2021.3.5f1\n', 'Assets/Scripts/Player.cs': 'class P {}' }, 'unity', 'unity-project', '2021.3.5f1'],
    [{ 'Game_Data/Managed/Assembly-CSharp.dll': 'MZ', 'Game_Data/globalgamemanagers': '\0\0\0\x142019.4.40f1\0junk', 'Game.exe': 'MZ' }, 'unity', 'unity-mono', '2019.4.40f1'],
    [{ 'GameAssembly.dll': 'MZ', 'Game_Data/il2cpp_data/Metadata/global-metadata.dat': 'meta', 'Game_Data/globalgamemanagers': '2022.3.10f1' }, 'unity', 'unity-il2cpp', '2022.3.10f1'],
    [{ 'index.html': '<html>', 'Build/web.loader.js': '', 'Build/web.framework.js': 'unityVersion:"2021.3.1f1"', 'Build/web.wasm': '', 'Build/web.data': '' }, 'unity', 'unity-webgl', '2021.3.1f1'],
    [{ 'project.godot': 'config/features=PackedStringArray("4.2", "Forward Plus")\n', 'player.gd': 'extends Node' }, 'godot', 'godot', '4.2'],
    [{ 'Game.uproject': '{"EngineAssociation": "5.3"}' }, 'unreal', 'unreal', '5.3'],
    [{ 'index.html': '<html>', 'cocos2d-js-min.js': 'cc.ENGINE_VERSION="2.4.11";', 'src/settings.js': '' }, 'cocos', 'cocos', '2.4.11'],
    [{ 'project.json': '{"engine":"cocos-creator-js","version":"2.4.5"}', 'assets/main.fire': '' }, 'cocos', 'cocos', '2.4.5'],
    [{ 'index.html': '<html>', 'scripts/c3runtime.js': '', 'data.json': '{}' }, 'construct', 'construct', '3'],
    [{ 'index.html': '<html>', 'js/phaser.min.js': 'VERSION:"3.60.0"', 'js/game.js': '' }, 'html5', 'html5', '3.60.0'],
    [{ 'data.win': 'FORM', 'game.exe': 'MZ' }, 'other', 'gamemaker', null],
    [{ 'readme.txt': 'hi' }, 'unknown', 'unknown', null],
  ];
  for (const [files, engine, flavour, version] of cases) {
    const r = recon(tree(files));
    assert.deepEqual([r.engine, r.flavour, r.version], [engine, flavour, version], JSON.stringify(Object.keys(files)));
    if (engine !== 'unknown') assert.ok(r.evidence.length && r.tools.length, flavour);
  }
  const swf = tree({ 'game.swf': Buffer.from([0x43, 0x57, 0x53, 32, 0, 0, 0, 0]) });
  assert.deepEqual([recon(swf).engine, recon(swf).version], ['flash', 'SWF 32']);
  const pckHead = Buffer.alloc(20);
  pckHead.write('GDPC', 0, 'latin1');
  [1, 3, 5, 1].forEach((n, i) => pckHead.writeUInt32LE(n, 4 + i * 4));
  assert.deepEqual([recon(tree({ 'game.pck': pckHead })).engine, recon(tree({ 'game.pck': pckHead })).version], ['godot', '3.5.1']);
});

test('recon: APK (IL2CPP, version from a deflated globalgamemanagers), XAPK with a split APK inside, platform', () => {
  const apkFiles = {
    'AndroidManifest.xml': 'x',
    'lib/arm64-v8a/libunity.so': 'ELF',
    'lib/arm64-v8a/libil2cpp.so': 'ELF',
    'assets/bin/Data/Managed/Metadata/global-metadata.dat': 'meta',
    'assets/bin/Data/globalgamemanagers': `${'\0'.repeat(20)}2020.3.48f1${'\0'.repeat(5000)}`,
    'assets/bin/Data/sounds/theme.ogg': 'o'.repeat(3000),
  };
  const apk = archive(apkFiles);
  const r = recon(apk);
  assert.deepEqual([r.kind, r.platform, r.engine, r.flavour, r.version], ['archive', 'android', 'unity', 'unity-il2cpp', '2020.3.48f1']);
  assert.equal(r.assets.kinds.audio.files, 1);
  const xapk = path.join(tmpDir(), 'game.xapk');
  const inner = tree({ 'manifest.json': '{}' });
  fs.copyFileSync(apk, path.join(inner, 'com.example.game.apk'));
  zipDir(inner, xapk);
  const x = recon(xapk);
  assert.equal(x.flavour, 'unity-il2cpp');
  assert.ok(x.evidence.some((e) => e.startsWith('com.example.game.apk!/')), x.evidence.join());
  assert.throws(() => recon(path.join(tree({ 'a.rar': 'x' }), 'a.rar')), /\.apk/);
});

test('recon: caches (Library/, node_modules/) are skipped; summary counts kinds and biggest assets', () => {
  const dir = tree({ 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 2021.3.5f1', 'Assets/a.png': 'p', 'Assets/b.wav': 'w'.repeat(100), 'Library/huge.bin': 'z', 'node_modules/x/y.js': '' });
  const src = openSource(dir);
  assert.deepEqual(src.entries.map((e) => e.path), ['Assets/a.png', 'Assets/b.wav', 'ProjectSettings/ProjectVersion.txt']);
  const r = recon(dir);
  assert.equal(r.assets.kinds.image.files, 1);
  assert.equal(r.assets.biggest[0].path, 'Assets/b.wav');
});

test('recon command: --write saves spec/recon.json and fills empty source fields only', () => {
  const dir = newGame();
  editYaml(dir, (g) => (g.source.engine = 'unknown'));
  const orig = tree({ 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 2022.3.1f1' });
  const r = gk(dir, 'recon', orig, '--write');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /unity-project · 2022\.3\.1f1/);
  const y = read(dir, 'game.yaml');
  assert.match(y, /engine: unity/);
  assert.match(y, /engineVersion: 2022\.3\.1f1/);
  assert.ok(y.includes(`path: ${orig}`));
  assert.equal(JSON.parse(read(dir, 'spec/recon.json')).flavour, 'unity-project');
  assert.equal(gk(dir, 'validate').code, 0);
  // Second run: source.path now set, so `recon` with no argument reads it; a different engine only warns.
  editYaml(dir, (g) => (g.source.engine = 'cocos'));
  const again = gk(dir, 'recon', '--write');
  assert.equal(again.code, 0);
  assert.match(again.out, /ghi engine cocos, recon thấy unity/);
  assert.match(read(dir, 'game.yaml'), /engine: cocos/);
  assert.equal(gk(tmpDir(), 'recon').code, 1);
});

// ---------- oracle import ----------

test('oracle: traces parse from CSV (any separator), JSONL (nested → dotted) and JSON', () => {
  assert.deepEqual(parseTrace('t;speed\n0;180\n0.5;183\n', 'a.csv'), [{ t: 0, speed: 180 }, { t: 0.5, speed: 183 }]);
  assert.deepEqual(parseTrace('t\tspeed\tname\n1\t2\tx\n', 'a.tsv'), [{ t: 1, speed: 2, name: 'x' }]);
  assert.deepEqual(parseTrace('{"t":0,"p":{"x":1,"y":2}}\n{"t":1,"p":{"x":3,"y":null}}\n', 'a.jsonl'), [
    { t: 0, 'p.x': 1, 'p.y': 2 },
    { t: 1, 'p.x': 3, 'p.y': null },
  ]);
  assert.deepEqual(parseTrace('[{"t":0,"v":1}]', 'a.json'), [{ t: 0, v: 1 }]);
  assert.deepEqual(flatten({ a: { b: { c: 1 } }, d: [1, 2] }), { 'a.b.c': 1, d: [1, 2] });
  assert.throws(() => parseTrace('{"t":0}\nnot json\n', 'a.jsonl'), /dòng 2/);
});

test('oracle: rows → cases — nearest row per --at value, dedupe, thinning keeps the ends, null rows dropped', () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ t: i / 10, v: i, w: i % 2 ? null : i }));
  assert.deepEqual(buildCases(rows, { in: ['t'], out: ['v'], at: { col: 't', values: [0, 2.04, 10] } }), [
    { in: { t: 0 }, out: 0 },
    { in: { t: 2 }, out: 20 },
    { in: { t: 10 }, out: 100 },
  ]);
  const thinned = buildCases(rows, { in: ['t'], out: ['v'], max: 5 });
  assert.deepEqual(thinned.map((c) => c.out), [0, 25, 50, 75, 100]);
  assert.equal(buildCases(rows, { in: ['t'], out: ['v', 'w'], max: 1000 }).length, 51, 'rows with null w are dropped');
  assert.deepEqual(buildCases([{ t: 0, v: 1 }, { t: 0, v: 2 }], { in: ['t'], out: ['v'] }), [{ in: { t: 0 }, out: 1 }]);
  assert.equal(buildCases(rows, { in: ['t'], out: ['v'], every: 50 }).length, 3);
  assert.throws(() => buildCases(rows, { in: ['time'], out: ['v'] }), /không có cột "time"/);
  assert.deepEqual(thin([1, 2, 3], 5), [1, 2, 3]);
});

test('oracle import command: writes a valid oracle, needs --source, refuses overwrite and inferred without tolerance', () => {
  const dir = newGame();
  write(dir, 'trace.csv', 't,obstacle.speed\n' + Array.from({ length: 301 }, (_, i) => `${i / 10},${180 + 6 * (i / 10)}`).join('\n'));
  const base = ['oracle', 'import', 'trace.csv', '--to', 'spec/oracles/from-trace.json', '--in', 't', '--out', 'obstacle.speed'];
  assert.match(gk(dir, ...base).out, /Thiếu --source/);
  const r = gk(dir, ...base, '--source', 'Editor, scene Level1', '--at', 't=0,5,10,30', '--tolerance', '0.001');
  assert.equal(r.code, 0, r.out);
  const o = JSON.parse(read(dir, 'spec/oracles/from-trace.json'));
  assert.deepEqual(o.cases.map((c) => [c.in.t, c.out]), [[0, 180], [5, 210], [10, 240], [30, 360]]);
  assert.equal(o.confidence, 'observed');
  assert.equal(gk(dir, 'validate').code, 0);
  assert.match(gk(dir, ...base, '--source', 'x').out, /đã có — thêm --force/);
  assert.equal(gk(dir, ...base, '--source', 'x', '--force').code, 0);
  assert.match(gk(dir, ...base.slice(0, 4), 'spec/oracles/v.json', '--in', 't', '--out', 'obstacle.speed', '--source', 'video', '--confidence', 'inferred').out, /inferred phải có --tolerance/);
  assert.match(gk(dir, ...base.slice(0, 4), 'params/x.json', '--in', 't', '--out', 'v', '--source', 'x').out, /spec\/oracles/);
});

// ---------- assets ----------

const META = `fileFormatVersion: 2
guid: 0123456789abcdef0123456789abcdef
TextureImporter:
  spriteMode: 2
  spritePixelsToUnits: 32
  spriteSheet:
    sprites:
    - serializedVersion: 2
      name: run_0
      rect: {serializedVersion: 2, x: 0, y: 32, width: 32, height: 32}
      alignment: 7
      pivot: {x: 0.5, y: 0}
      border: {x: 0, y: 0, z: 0, w: 0}
    - serializedVersion: 2
      name: panel
      rect: {serializedVersion: 2, x: 32, y: 0, width: 32, height: 16}
      alignment: 9
      pivot: {x: 0.25, y: 0.75}
      border: {x: 2, y: 3, z: 4, w: 5}
`;

test('assets: Unity .meta slicing → TexturePacker hash (y flipped, anchor from pivot, 9-slice borders)', () => {
  const meta = parseUnityMeta(META);
  assert.equal(meta.mode, 'multiple');
  assert.equal(meta.ppu, 32);
  const atlas = unityAtlas(meta, { image: 'hero.png', width: 64, height: 64 });
  assert.deepEqual(atlas.frames.run_0.frame, { x: 0, y: 0, w: 32, h: 32 });
  assert.deepEqual(atlas.frames.run_0.anchor, { x: 0.5, y: 1 });
  assert.deepEqual(atlas.frames.panel.frame, { x: 32, y: 48, w: 32, h: 16 });
  assert.deepEqual(atlas.frames.panel.anchor, { x: 0.25, y: 0.25 });
  assert.deepEqual(atlas.frames.panel.borders, { left: 2, top: 5, right: 4, bottom: 3 });
  assert.deepEqual(atlas.meta.size, { w: 64, h: 64 });
  assert.throws(() => unityAtlas(meta, { image: 'hero.png', width: 48, height: 48 }), /nằm ngoài ảnh/);
  const single = parseUnityMeta('TextureImporter:\n  spriteMode: 1\n  alignment: 9\n  spritePivot: {x: 0.5, y: 0.1}\n');
  const one = unityAtlas(single, { image: 'coin.png', width: 16, height: 16 });
  assert.deepEqual(Object.keys(one.frames), ['coin']);
  assert.equal(one.frames.coin.anchor.y, 0.9);
  assert.equal(parseUnityMeta('AudioImporter:\n  x: 1\n'), null);
});

test('assets scan: kinds, PNG sizes, Unity sprite sheets and what to convert to', () => {
  const dir = tree({ 'Assets/hero.png': solidPng(64, 64), 'Assets/hero.png.meta': META, 'Assets/theme.wav': 'w'.repeat(200), 'Assets/ui.psd': 'p', 'Assets/Main.cs': 'class M {}' });
  const src = openSource(dir);
  const { items, totals } = scanAssets(src);
  assert.deepEqual(items.map((i) => i.path), ['Assets/hero.png', 'Assets/theme.wav', 'Assets/ui.psd']);
  const hero = items[0];
  assert.deepEqual([hero.width, hero.height, hero.alpha], [64, 64, true]);
  assert.deepEqual(hero.unity, { spriteMode: 'multiple', sprites: 2, ppu: 32 });
  assert.match(hero.suggest, /unity-atlas/);
  assert.match(items[1].suggest, /mp3/);
  assert.match(items[2].suggest, /xuất PNG/);
  assert.equal(totals.image.files, 2);
});

test('assets commands: scan --write, unity-atlas next to the PNG, convert needs ffmpeg', () => {
  const dir = newGame();
  const orig = tree({ 'Sprites/hero.png': solidPng(64, 64), 'Sprites/hero.png.meta': META });
  write(dir, 'game.yaml', read(dir, 'game.yaml').replace('path: null', `path: ${JSON.stringify(orig)}`));
  const scan = gk(dir, 'assets', 'scan', '--write');
  assert.equal(scan.code, 0, scan.out);
  assert.equal(JSON.parse(read(dir, 'spec/asset-inventory.json')).items.length, 1);
  const atlas = gk(dir, 'assets', 'unity-atlas', path.join(orig, 'Sprites/hero.png'), '--to', 'assets/hero.json');
  assert.equal(atlas.code, 0, atlas.out);
  assert.equal(Object.keys(JSON.parse(read(dir, 'assets/hero.json')).frames).length, 2);
  assert.match(gk(dir, 'assets', 'unity-atlas', path.join(orig, 'nope.png')).out, /Không có/);
  const noFf = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'scripts', 'gamekit.mjs'), 'assets', 'convert', orig], { cwd: dir, encoding: 'utf8', env: { ...process.env, GK_FFMPEG: path.join(orig, 'no-ffmpeg') } });
  assert.equal(noFf.status, 1);
  assert.match(noFf.stdout, /Không tìm thấy ffmpeg/);
  assert.match(gk(dir, 'assets', 'nope').out, /scan \| unity-atlas \| convert/);
});

test('assets convert: ffmpeg arguments per kind', () => {
  assert.deepEqual(ffmpegArgs('a.png', 'a.webp').slice(-9), ['-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', 'a.webp']);
  assert.ok(ffmpegArgs('a.png', 'a.webp', { lossless: true }).includes('-lossless'));
  assert.deepEqual(ffmpegArgs('a.wav', 'a.ogg', { audio: 'ogg', bitrate: '96k' }).slice(-6), ['-vn', '-c:a', 'libvorbis', '-b:a', '96k', 'a.ogg']);
  assert.equal(ffmpegArgs('a.psd', 'a.webp'), null);
});

test('assets convert command: images → webp, audio → mp3, --label adds provenance, second run skips', { skip: !findFfmpeg() && 'máy không có ffmpeg' }, () => {
  const dir = newGame();
  const orig = tmpDir();
  fs.writeFileSync(path.join(orig, 'hero.png'), solidPng(32, 32));
  const tone = spawnSync(findFfmpeg(), ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', path.join(orig, 'beep.wav')]);
  assert.equal(tone.status, 0);
  const r = gk(dir, 'assets', 'convert', orig, '--to', 'assets/orig', '--label', 'own');
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(path.join(dir, 'assets/orig/hero.webp')));
  assert.ok(fs.existsSync(path.join(dir, 'assets/orig/beep.mp3')));
  const prov = JSON.parse(read(dir, 'provenance.json'));
  assert.deepEqual(prov.entries.filter((e) => e.path.startsWith('assets/orig/')).map((e) => [e.path, e.label]), [
    ['assets/orig/beep.mp3', 'own'],
    ['assets/orig/hero.webp', 'own'],
  ]);
  assert.equal(gk(dir, 'validate').code, 0);
  assert.match(gk(dir, 'assets', 'convert', orig, '--to', 'assets/orig').out, /đã có/);
});
