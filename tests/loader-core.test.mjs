import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitelockDecision, pickLanguage, progressPercent, safeStorage, isAllowedHost } from '../portals/shared/loader-core.js';

const domains = ['azgames.io', 'azgame.io'];

test('sitelock: top window needs an allowed host and a referrer', () => {
  const top = (host, referrer) => sitelockDecision({ isTop: true, host, referrer, parentHost: '', domains });
  assert.equal(top('azgames.io', 'https://azgames.io/x'), 'run');
  assert.equal(top('gamea.azgame.io', 'https://www.google.com/'), 'run');
  assert.equal(top('azgames.io', ''), 'redirect');
  assert.equal(top('evil.com', 'https://azgames.io/'), 'redirect');
  assert.equal(top('notazgames.io', 'https://azgames.io/'), 'redirect');
  assert.equal(isAllowedHost('AZGAMES.IO', domains), true);
});

test('sitelock: an iframe needs a known, allowed parent', () => {
  const frame = (parentHost, referrer) => sitelockDecision({ isTop: false, host: 'gamea.azgame.io', referrer, parentHost, domains });
  assert.equal(frame('azgames.io', ''), 'run');
  assert.equal(frame('', 'https://www.azgames.io/game'), 'run');
  assert.equal(frame('', 'https://evil.com/'), 'block');
  assert.equal(frame('', ''), 'block');
  assert.equal(frame('', 'không phải url'), 'block');
  assert.equal(frame('evil.com', 'https://azgames.io/game'), 'block', 'biết parent thì không tin referrer');
});

test('language: saved → ?lang → browser → default → en, region variants match', () => {
  const available = ['en', 'es', 'pt-br', 'zh-hans'];
  const pick = (o) => pickLanguage({ available, fallback: 'en', browser: [], ...o });
  assert.equal(pick({ saved: 'es', query: 'pt-br' }), 'es');
  assert.equal(pick({ saved: 'fr', query: 'PT-BR' }), 'pt-br');
  assert.equal(pick({ browser: ['fr-FR', 'pt-BR'] }), 'pt-br');
  assert.equal(pick({ browser: ['zh-Hans-CN'] }), 'zh-hans');
  assert.equal(pick({ browser: ['es-MX'] }), 'es');
  assert.equal(pick({ browser: ['de'], fallback: 'es' }), 'es');
  assert.equal(pick({}), 'en');
  assert.equal(pickLanguage({ available: ['es'], browser: [], fallback: 'de' }), 'es', 'không có en thì lấy mã đầu tiên');
});

test('progress and storage never throw', () => {
  assert.equal(progressPercent(50, 200), 25);
  assert.equal(progressPercent(500, 200), 100);
  assert.equal(progressPercent(5, 0), 0);
  const broken = safeStorage(() => {
    throw new Error('SecurityError');
  });
  assert.equal(broken.get('k'), null);
  broken.set('k', 'v');
  const throwing = safeStorage(() => ({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('quota'); } }));
  assert.equal(throwing.get('k'), null);
  throwing.set('k', 'v');
  const m = new Map();
  const ok = safeStorage(() => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }));
  ok.set('a', 'b');
  assert.equal(ok.get('a'), 'b');
});
