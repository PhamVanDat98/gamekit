import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { EASES, analyzeMotion, chartMotion, sampleKeys } from '../scripts/lib/motion.mjs';
import { check } from '../scripts/lib/schema.mjs';

const checks = (m) => {
  const r = analyzeMotion(m);
  return { errors: r.errors.map((e) => e.check), warnings: r.warnings.map((w) => w.check), waived: r.waived.map((w) => w.check) };
};
const keys = (...pairs) => pairs.map(([f, v, ease, beat]) => ({ f, v, ...(ease && { ease }), ...(beat && { beat }) }));

test('motion: eases match the template runtime (src/view/anim/ease.ts)', () => {
  // Same numbers are asserted in templates/game/tests/view/anim.test.ts.
  assert.equal(EASES.out(0.5), 0.875);
  assert.equal(EASES.inOut(0.25), 0.0625);
  assert.ok(Math.abs(EASES.outBack(0.5) - 1.0876975) < 1e-6);
  assert.equal(EASES.outBounce(0.5), 0.765625);
  assert.equal(EASES.hold(0.99), 0);
  for (const [name, e] of Object.entries(EASES)) {
    assert.ok(Math.abs(e(0)) < 1e-9 && Math.abs(e(1) - 1) < 1e-9, name);
  }
  assert.equal(sampleKeys(keys([0, 0], [10, -100, 'out']), 5), -87.5);
});

test('motion: template and recipe motions pass with no warnings', () => {
  const dir = path.join(ROOT, 'templates/game/motion');
  const recipes = fs.readFileSync(path.join(ROOT, 'skills/animate/references/recipes.md'), 'utf8');
  const all = [
    ...fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))),
    ...[...recipes.matchAll(/```json\n([\s\S]*?)```/g)].map(([, j]) => JSON.parse(j)),
  ];
  assert.ok(all.length >= 10);
  for (const m of all) {
    assert.deepEqual(check('motion', m), [], m.name);
    assert.deepEqual(checks(m), { errors: [], warnings: [], waived: Object.keys(m.skip ?? {}) }, m.name);
  }
});

test('motion: the usual AI motion — one linear tween, no anticipation — fails', () => {
  const r = checks({ name: 'j', role: 'action', tracks: { 'body.y': keys([0, 0], [20, -100, 'linear'], [40, 0, 'linear']) } });
  assert.deepEqual([...new Set(r.errors)], ['slow-in-out', 'anticipation']);
  assert.ok(r.warnings.includes('squash-stretch'));
});

test('motion: anticipation limits follow the role', () => {
  const late = checks({ name: 'a', role: 'player-action', tracks: { 'b.stretch': keys([0, 1], [10, 0.8], [14, 1.2, 'out', 'action'], [24, 1]) } });
  assert.deepEqual(late.errors, ['anticipation']);
  const short = checks({ name: 't', role: 'telegraph', tracks: { 'arm.rot': keys([0, 0], [6, -30], [10, 90, 'out'], [24, 80]) } });
  assert.deepEqual(short.errors, ['anticipation']);
  const slowHit = checks({ name: 'h', role: 'reaction', tracks: { 'b.x': keys([0, 0], [8, 6], [12, -30, 'out', 'action'], [30, 0]) } });
  assert.deepEqual(slowHit.errors, ['anticipation']);
  // 30fps file: 2 frames there = 4 at 60, still fine for the player.
  assert.deepEqual(checks({ name: 'p', role: 'player-action', fps: 30, tracks: { 'b.stretch': keys([0, 1], [2, 0.8], [3, 1.2, 'out', 'action'], [7, 1]) } }).errors, []);
  const sameWay = checks({ name: 's', role: 'action', tracks: { 'b.y': keys([0, 0], [10, -30], [16, -100, 'out', 'action'], [26, -95]) } });
  assert.ok(sameWay.errors.includes('anticipation'));
});

test('motion: dead stops, loop seams and ui without overshoot are caught', () => {
  const dead = checks({ name: 'd', role: 'ui', tracks: { 'r.sx': keys([0, 0], [18, 1, 'out']), 'r.sy': keys([0, 0], [18, 1, 'out']) } });
  assert.deepEqual(dead.errors, ['follow-through']);
  assert.ok(dead.warnings.includes('follow-through'));
  const seam = checks({ name: 'i', role: 'idle', loop: true, tracks: { 'b.stretch': keys([0, 1], [60, 1.03], [90, 1.01]) } });
  assert.deepEqual(seam.errors, ['structure']);
  assert.deepEqual(checks({ name: 'i', role: 'idle', tracks: { 'b.stretch': keys([0, 1], [60, 1.03], [120, 1]) } }).errors, ['structure']);
  // A coin spinning at constant speed is fine; a vanishing part may stop at full speed.
  assert.deepEqual(checks({ name: 'c', role: 'fx', loop: true, tracks: { 'c.rot': keys([0, 0], [60, 360, 'linear']), 'c.alpha': keys([0, 1], [60, 1]) } }).errors, ['structure']);
  assert.deepEqual(checks({ name: 'c', role: 'action', loop: true, tracks: { 'c.rot': keys([0, 0], [60, 0, 'linear']) } }).errors, []);
});

test('motion: straight paths, lockstep parts, uniform timing and lost volume warn', () => {
  const r = checks({
    name: 's',
    role: 'action',
    tracks: {
      'b.x': keys([0, 0], [8, -5], [20, 100, 'out'], [30, 98]),
      'b.y': keys([0, 0], [8, 0], [20, 100, 'out'], [30, 98]),
      'h.rot': keys([0, 0], [8, -5], [20, 10, 'out'], [30, 8]),
    },
  });
  assert.deepEqual(r.errors, []);
  for (const w of ['squash-stretch', 'arcs', 'overlap', 'timing']) assert.ok(r.warnings.includes(w), w);
  const fat = checks({ name: 'f', role: 'reaction', tracks: { 'b.sx': keys([0, 1], [2, 1.4, 'out'], [10, 1]), 'b.sy': keys([0, 1], [2, 1.3, 'out'], [12, 1]) } });
  assert.ok(fat.warnings.includes('squash-stretch'));
});

test('motion: skip waives a check only with a reason; structure errors stop the analysis', () => {
  const m = { name: 'w', role: 'action', skip: { anticipation: 'bị đẩy, không tự chuẩn bị' }, tracks: { 'b.y': keys([0, 0], [20, -100, 'out'], [30, -95]), 'b.stretch': keys([0, 1], [20, 1.1], [30, 1]) } };
  assert.deepEqual(checks(m), { errors: [], warnings: [], waived: ['anticipation'] });
  assert.ok(check('motion', { ...m, skip: { anticipation: '' } }).length);
  assert.ok(check('motion', { ...m, skip: { magic: 'lý do' } }).length);
  const bad = checks({ name: 'b', role: 'action', tracks: { 'b.y': keys([0, 0], [0, 5]), 'b.stretch': keys([0, 1]), 'b.sy': keys([0, 1]) } });
  assert.deepEqual(bad.errors, ['structure', 'structure']);
});

test('motion: the chart shows spans, keys and one sparkline per track (y drawn upward)', () => {
  const hop = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/game/motion/hop.json'), 'utf8'));
  const chart = chartMotion(hop);
  assert.match(chart, /^hop · action · 58 khung @60 = 0\.97 s/);
  const line = (label) => chart.split('\n').find((l) => l.startsWith(label));
  assert.match(line('nhịp'), /^nhịp\s+·+━+~+$/);
  // Crouch then rise: the y line starts low (ground) and reaches the top bar at the apex.
  const y = line('body.y↑');
  assert.ok(y.includes('▁') && y.includes('█'));
  assert.ok(line('body.stretch'));
  // Long motions fold several frames into a column but keep a 3-frame blink visible.
  const idle = chartMotion(JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/game/motion/idle.json'), 'utf8')));
  assert.match(idle, /1 cột = 2 khung/);
  assert.match(idle, /eyes\.sy .*0\.10…1$/m);
});
