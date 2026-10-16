import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion, checkVersion, latestVersion, copyrightYear } from '../scripts/lib/version.mjs';
import { escapeHtml, jsString, fillTemplate, withBase } from '../scripts/lib/html.mjs';
import { listPortals, loadPortal, checkSetting, missingSettings, copyrightFor } from '../scripts/lib/portals.mjs';
import { token } from './helpers.mjs';

test('version: YYMMDDNN from the build date, next number of the day, capped at 99', () => {
  const d = new Date(2026, 9, 16); // 16/10/2026, giờ máy
  assert.equal(nextVersion([], d), '26101601');
  assert.equal(nextVersion(['26101601', '26101602', '26101501', '.vite-x', 'manifest.json'], d), '26101603');
  assert.equal(nextVersion(['26101599'], d), '26101601');
  assert.throws(() => nextVersion(['26101699'], d), /99/);
  assert.equal(checkVersion('26101605', ['26101601']), '26101605');
  assert.throws(() => checkVersion('2610160', []), /8 chữ số/);
  assert.throws(() => checkVersion('26101601', ['26101601']), /đã có/);
  assert.equal(latestVersion(['26101601', '26101702', 'x']), '26101702');
  assert.equal(latestVersion([]), null);
  assert.equal(copyrightYear('26101601'), '2026');
});

test('html: values are escaped for where they land; unknown placeholders fail', () => {
  assert.equal(escapeHtml(`Zombie <Run> & "Co" 'x'`), 'Zombie &lt;Run&gt; &amp; &quot;Co&quot; &#39;x&#39;');
  const js = jsString('a</script><script>alert(1)\u2028"');
  assert.doesNotMatch(js, /<\/script>/i);
  assert.doesNotMatch(js, /\u2028/);
  assert.equal(JSON.parse(js.replace(/\u003c/g, '<')), 'a</script><script>alert(1)\u2028"');
  assert.equal(fillTemplate('<b>{{A}}</b>{{B_C}}', { A: '1', B_C: '{{A}}' }), '<b>1</b>{{A}}', 'một lượt, không thay lại giá trị đã chèn');
  assert.throws(() => fillTemplate('{{MISSING}}', {}), /MISSING/);
  assert.equal(withBase('<html><head>\n<title>x</title>', '26101601'), '<html><head>\n    <base href="26101601/">\n<title>x</title>');
  assert.throws(() => withBase('<html>', '26101601'), /<head>/);
});

test('portal kits: azgames settings, patterns and the GMSOFT_SIGNED token', () => {
  assert.deepEqual(listPortals(), ['azgames', 'dev-mock']);
  const az = loadPortal('azgames');
  assert.deepEqual(missingSettings(az, { gameCode: 'g205' }), ['gameId', 'portalGid', 'signed']);
  assert.equal(checkSetting(az, 'gameId', 'ten-game-az'), null);
  assert.match(checkSetting(az, 'gameId', 'ten-game'), /sai định dạng/);
  assert.equal(checkSetting(az, 'portalGid', 'ten-game'), null);
  assert.match(checkSetting(az, 'portalGid', 'ten-game-az'), /sai định dạng/);
  assert.equal(checkSetting(az, 'signed', token({ signed: 'x', domain: 'azgame.io' })), null);
  assert.match(checkSetting(az, 'signed', '@@ không phải base64 @@'), /giải mã/);
  assert.match(checkSetting(az, 'signed', token({ signed: 'x' })), /domain/);
  assert.match(checkSetting(az, 'signed', token({ signed: 'x', domain: 'evil.com' })), /evil\.com/);
  assert.match(checkSetting(az, 'nope', 'x'), /khoá lạ/);
  assert.equal(checkSetting(az, 'gameCode', null), null, 'thiếu giá trị do missingSettings xử lý');
  assert.equal(copyrightFor(az, '26101601'), '© 2026 Azgames.io');
  const dev = loadPortal('dev-mock');
  assert.deepEqual(missingSettings(dev, {}), []);
  assert.equal(copyrightFor(dev, '27010101'), '© 2027 GameKit (dev)');
  assert.throws(() => loadPortal('../x'), /Không có bộ vỏ/);
});
