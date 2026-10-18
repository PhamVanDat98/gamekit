import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, write } from './helpers.mjs';
import { detectEngine, kindOf, scanSource } from '../scripts/lib/recon.mjs';
import { listZip } from '../scripts/lib/unzip.mjs';
import { zipDir } from '../scripts/lib/zip.mjs';

const top = (paths) => {
  const [c] = detectEngine(paths);
  return c ? `${c.engine}${c.flavor ? `/${c.flavor}` : ''}` : 'unknown';
};

test('recon: engines and build kinds from file signatures', () => {
  assert.equal(top(['Game_Data/Managed/Assembly-CSharp.dll', 'Game_Data/globalgamemanagers', 'UnityPlayer.dll']), 'unity/mono');
  assert.equal(top(['GameAssembly.dll', 'Game_Data/il2cpp_data/Metadata/global-metadata.dat', 'UnityPlayer.dll']), 'unity/il2cpp');
  assert.equal(top(['game.apk!/lib/arm64-v8a/libil2cpp.so', 'game.apk!/lib/arm64-v8a/libunity.so']), 'unity/il2cpp');
  assert.equal(top(['Build/web.framework.js.gz', 'Build/web.wasm.gz', 'Build/web.data.gz', 'index.html']), 'unity/webgl');
  assert.equal(top(['game.pck', 'game.exe']), 'godot');
  assert.equal(top(['Game/Content/Paks/Game-Windows.pak', 'Engine/Binaries/ThirdParty/x.dll']), 'unreal');
  assert.equal(top(['game.swf']), 'flash');
  assert.equal(top(['lib/armeabi-v7a/libcocos2djs.so']), 'cocos');
  assert.equal(top(['scripts/c3runtime.js', 'index.html']), 'construct');
  assert.equal(top(['libs/laya.core.js', 'index.html']), 'laya');
  assert.equal(top(['js/rpg_core.js', 'index.html']), 'html5/rpgmaker');
  assert.equal(top(['index.html', 'js/phaser.min.js']), 'html5/phaser');
  assert.equal(top(['index.html', 'main.js']), 'html5', 'a page and scripts and nothing else');
  assert.equal(top(['assets/game.droid']), 'other/gamemaker');
  assert.equal(top(['readme.txt']), 'unknown');
  // a Unity WebGL build also has an index.html: html5 never outranks a real engine
  assert.ok(detectEngine(['index.html', 'Build/x.loader.js']).every((c) => c.engine !== 'html5'));
});

test('recon: file kinds', () => {
  assert.deepEqual(['a.dll', 'b.wasm.gz', 'c.assets', 'd.png', 'e.ogg', 'f.xyz', 'Build/g.data.br', 'index.html'].map(kindOf), ['code', 'code', 'data', 'asset', 'asset', 'other', 'data', 'code']);
});

test('unzip: lists the entries of an APK-like zip; scanSource walks folders and packages', () => {
  const dir = tmpDir();
  write(dir, 'apk/lib/arm64-v8a/libil2cpp.so', 'x'.repeat(100));
  write(dir, 'apk/assets/bin/Data/Managed/Metadata/global-metadata.dat', 'meta');
  write(dir, 'apk/assets/Tiếng Việt.png', 'png');
  zipDir(path.join(dir, 'apk'), path.join(dir, 'build', 'game.apk'));
  const entries = listZip(path.join(dir, 'build', 'game.apk'));
  assert.deepEqual(entries.map((e) => e.name).sort(), ['assets/Tiếng Việt.png', 'assets/bin/Data/Managed/Metadata/global-metadata.dat', 'lib/arm64-v8a/libil2cpp.so']);
  assert.equal(entries.find((e) => e.name.endsWith('.so')).size, 100);
  write(dir, 'build/readme.txt', 'hi');
  const { files, archives } = scanSource(path.join(dir, 'build'));
  assert.deepEqual(archives, [{ path: 'game.apk', entries: 3 }]);
  assert.ok(files.some((f) => f.path === 'game.apk!/lib/arm64-v8a/libil2cpp.so' && f.kind === 'code' && /^[0-9a-f]{8}$/.test(f.crc32)));
  assert.ok(files.some((f) => f.path === 'game.apk' && f.kind === 'package' && f.sha256.length === 64));
  assert.equal(top(files.map((f) => f.path)), 'unity/il2cpp');
  // a file that is not a zip is reported, not fatal
  fs.writeFileSync(path.join(dir, 'build', 'broken.apk'), 'not a zip');
  assert.match(scanSource(path.join(dir, 'build')).archives.find((a) => a.path === 'broken.apk').error, /không phải file zip/);
});
