import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tmpDir, write } from './helpers.mjs';
import { zipDir } from '../scripts/lib/zip.mjs';
import { recon } from '../scripts/recon.mjs';

function unityApk(dir) {
  write(dir, 'apk/lib/arm64-v8a/libunity.so', 'elf');
  write(dir, 'apk/lib/arm64-v8a/libil2cpp.so', 'elf');
  write(dir, 'apk/assets/bin/Data/Managed/Metadata/global-metadata.dat', 'meta');
  write(dir, 'apk/assets/bin/Data/globalgamemanagers', '\0\0\0\0\0\0\x00\x162021.3.5f1\0rest');
  write(dir, 'apk/assets/bin/Data/sharedassets0.assets', 'x'.repeat(2000));
  write(dir, 'apk/res/drawable/icon.png', 'png');
  write(dir, 'apk/classes.dex', 'dex');
  zipDir(path.join(dir, 'apk'), path.join(dir, 'game.apk'));
  return path.join(dir, 'game.apk');
}

test('recon: Unity IL2CPP APK — engine, backend, version from globalgamemanagers, logic files', () => {
  const r = recon(unityApk(tmpDir()));
  assert.equal(r.engine, 'unity');
  assert.equal(r.backend, 'IL2CPP');
  assert.equal(r.version, '2021.3.5f1');
  assert.equal(r.source, false);
  assert.ok(r.logic.some((p) => p.endsWith('libil2cpp.so')));
  assert.ok(r.tools.some((t) => /gamekit ghidra/.test(t)));
  assert.equal(r.inventory.files, 7);
  assert.equal(r.inventory.byKind.image.count, 1);
});

test('recon: XAPK — looks inside the APKs it holds', () => {
  const dir = tmpDir();
  const apk = unityApk(dir);
  fs.mkdirSync(path.join(dir, 'x'));
  fs.copyFileSync(apk, path.join(dir, 'x', 'com.demo.apk'));
  write(dir, 'x/manifest.json', '{}');
  zipDir(path.join(dir, 'x'), path.join(dir, 'game.xapk'));
  const r = recon(path.join(dir, 'game.xapk'));
  assert.equal(r.engine, 'unity');
  assert.equal(r.version, '2021.3.5f1');
  assert.ok(r.evidence.some((e) => e.startsWith('com.demo.apk!/')));
});

test('recon: Unity Mono desktop build, Unity project, Cocos web build, Godot pck, plain HTML5', () => {
  const dir = tmpDir();
  write(dir, 'mono/UnityPlayer.dll', 'x');
  write(dir, 'mono/Game_Data/Managed/Assembly-CSharp.dll', 'x');
  write(dir, 'mono/Game_Data/globalgamemanagers', '2019.4.40f1');
  let r = recon(path.join(dir, 'mono'));
  assert.deepEqual([r.engine, r.backend, r.version], ['unity', 'Mono', '2019.4.40f1']);
  assert.ok(r.tools.some((t) => /ILSpy/.test(t)));

  write(dir, 'proj/ProjectSettings/ProjectVersion.txt', 'm_EditorVersion: 2022.3.10f1\n');
  write(dir, 'proj/Assets/Scripts/Player.cs', 'class Player {}');
  r = recon(path.join(dir, 'proj'));
  assert.deepEqual([r.engine, r.source, r.version], ['unity', true, '2022.3.10f1']);
  assert.ok(r.logic.includes('Assets/Scripts/Player.cs'));

  write(dir, 'cocos/index.html', '<html>');
  write(dir, 'cocos/cocos2d-js-min.js', '/* Cocos Creator v2.4.11 */');
  r = recon(path.join(dir, 'cocos'));
  assert.deepEqual([r.engine, r.version], ['cocos', '2.4.11']);

  const pck = Buffer.alloc(24);
  pck.write('GDPC', 0, 'latin1');
  pck.writeUInt32LE(2, 4);
  pck.writeUInt32LE(4, 8);
  pck.writeUInt32LE(2, 12);
  pck.writeUInt32LE(1, 16);
  fs.writeFileSync(path.join(dir, 'game.pck'), pck);
  r = recon(path.join(dir, 'game.pck'));
  assert.deepEqual([r.engine, r.version], ['godot', '4.2.1']);

  write(dir, 'web/index.html', '<html>');
  write(dir, 'web/js/game.js', '');
  assert.equal(recon(path.join(dir, 'web')).engine, 'html5');
  write(dir, 'nothing/readme.txt', '');
  assert.equal(recon(path.join(dir, 'nothing')).engine, 'unknown');
});

test('recon: Flutter points at libapp.so, Construct/Defold projects, hashed Cocos web build', () => {
  const dir = tmpDir();
  write(dir, 'fl/lib/arm64-v8a/libflutter.so', 'x');
  write(dir, 'fl/lib/arm64-v8a/libapp.so', 'x');
  write(dir, 'fl/classes.dex', 'x');
  let r = recon(path.join(dir, 'fl'));
  assert.equal(r.name, 'Flutter (Flame?)');
  assert.deepEqual(r.logic, ['lib/arm64-v8a/libapp.so']);
  write(dir, 'c3/game.c3p', 'x');
  r = recon(path.join(dir, 'c3'));
  assert.deepEqual([r.engine, r.source], ['construct', true]);
  write(dir, 'df/game.project', '[project]');
  assert.equal(recon(path.join(dir, 'df')).name, 'Defold (project)');
  write(dir, 'cw/index.html', '');
  write(dir, 'cw/cocos2d-js-min.1a2b3c.js', 'Cocos Creator v2.4.8');
  r = recon(path.join(dir, 'cw'));
  assert.deepEqual([r.engine, r.version], ['cocos', '2.4.8']);
});

test('recon: no Cocos false positives (project.json, src/settings.js); Unity iOS before UnityFramework; a broken split APK is skipped', () => {
  const dir = tmpDir();
  write(dir, 'mono/apps/game/project.json', '{}');
  write(dir, 'mono/assets/logo.png', 'x');
  assert.notEqual(recon(path.join(dir, 'mono')).engine, 'cocos', 'project.json + assets/ không đủ là project Creator');
  write(dir, 'ph/index.html', '');
  write(dir, 'ph/src/settings.js', '');
  write(dir, 'ph/src/main.js', 'new Phaser.Game()');
  assert.equal(recon(path.join(dir, 'ph')).engine, 'html5');
  write(dir, 'cc/assets/scenes/Main.fire', '{}');
  write(dir, 'cc/assets/scenes/Main.fire.meta', '{}');
  write(dir, 'cc/settings/project.json', '{}');
  assert.deepEqual([recon(path.join(dir, 'cc')).name, recon(path.join(dir, 'cc')).source], ['Cocos Creator (project)', true]);
  write(dir, 'ios/Payload/G.app/Data/globalgamemanagers', '2018.4.36f1');
  write(dir, 'ios/Payload/G.app/Data/Managed/Metadata/global-metadata.dat', 'x');
  zipDir(path.join(dir, 'ios'), path.join(dir, 'g.ipa'));
  const ios = recon(path.join(dir, 'g.ipa'));
  assert.deepEqual([ios.engine, ios.version, ios.backend], ['unity', '2018.4.36f1', 'IL2CPP']);
  const apkDir = path.join(dir, 'xa');
  write(dir, 'xa/config.zz.apk', 'not a zip');
  fs.copyFileSync(unityApk(tmpDir()), path.join(apkDir, 'com.a.apk'));
  zipDir(apkDir, path.join(dir, 'g.xapk'));
  const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('gk-recon-')).length;
  const r = recon(path.join(dir, 'g.xapk'));
  assert.equal(r.engine, 'unity');
  assert.match(r.skipped.join(), /config\.zz\.apk/);
  assert.equal(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('gk-recon-')).length, before, 'file tạm đã xoá');
});
