import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchOf, checkRePlan, mergeGrep, mergeMessage, readySet, topo } from '../scripts/lib/plan.mjs';

const area = (id, extra = {}) => ({ id, owns: [`notes/${id}/`, `params/${id}.json`], brief: id, ...extra });
const plan = (areas, extra = {}) => ({ kind: 're', base: 'main', shared: ['DECISIONS.md', 'src/contracts/'], areas, ...extra });
const errors = (pr) => pr.errors.join('\n');

test('re-plan: a valid plan passes; dependencies form a graph, not waves', () => {
  const pr = checkRePlan(plan([area('player'), area('score', { dependsOn: ['player'] }), area('economy', { dependsOn: ['score', 'player'] })]));
  assert.equal(pr.ok, true, errors(pr));
});

test('re-plan: unknown dependency, cycle, duplicate id, shared and double ownership fail', () => {
  assert.match(errors(checkRePlan(plan([area('a', { dependsOn: ['x'] })]))), /phụ thuộc x không tồn tại/);
  assert.match(errors(checkRePlan(plan([area('a', { dependsOn: ['b'] }), area('b', { dependsOn: ['a'] })]))), /Phụ thuộc vòng/);
  assert.match(errors(checkRePlan(plan([area('a'), area('a')]))), /trùng id a/);
  assert.match(errors(checkRePlan(plan([area('a', { owns: ['notes/a/', 'src/contracts/world.ts'] })]))), /vùng dùng chung/);
  assert.match(errors(checkRePlan(plan([area('a'), area('b', { owns: ['notes/b/', 'params/a.json'] })]))), /cùng sở hữu/);
});

test('re-plan: each area owns notes/<id>/ (questions, notes, D-<id>-n decisions)', () => {
  assert.match(errors(checkRePlan(plan([area('a', { owns: ['params/a.json'] })]))), /a phải sở hữu notes\/a\//);
  assert.equal(checkRePlan(plan([area('a', { owns: ['notes/a/movement.md', 'notes/a/'] })])).ok, true);
});

test('re-plan: buildModule must exist in module-plan.yaml when there is one', () => {
  const p = plan([area('player', { buildModule: 'core-player' })]);
  assert.equal(checkRePlan(p).ok, true, 'no module plan yet');
  const modulePlan = { base: 'main', shared: [], modules: [{ id: 'core-spawner', wave: 1, owns: ['src/core/spawner/'], brief: 'x' }] };
  assert.match(errors(checkRePlan(p, { modulePlan })), /buildModule core-player không có/);
  modulePlan.modules.push({ id: 'core-player', wave: 1, owns: ['src/core/player/'], brief: 'x' });
  assert.equal(checkRePlan(p, { modulePlan }).ok, true);
});

test('re-plan: links are relative local folders, never owned or shared paths; schema rejects unknown kind', () => {
  assert.match(errors(checkRePlan(plan([area('a')], { links: ['../orig/'] }))), /tương đối/);
  assert.match(errors(checkRePlan(plan([area('a')], { links: ['/abs/decompiled'] }))), /tương đối/);
  assert.match(errors(checkRePlan(plan([area('a')], { links: ['notes/a/'] }))), /trùng với đường dẫn được sở hữu/);
  assert.equal(checkRePlan(plan([area('a')], { links: ['decompiled/', 'reference/'] })).ok, true);
  assert.equal(checkRePlan(plan([area('a')], { kind: 'build' })).ok, false);
});

test('readySet: starts every unit whose dependencies are merged, up to maxParallel, in dependency order', () => {
  const units = [area('score', { dependsOn: ['player'] }), area('player'), area('audio'), area('economy', { dependsOn: ['score'] })];
  assert.deepEqual(readySet(units).map((u) => u.id), ['player', 'audio']);
  assert.deepEqual(readySet(units, { merged: new Set(['player']) }).map((u) => u.id), ['score', 'audio'], 'score does not wait for audio');
  assert.deepEqual(readySet(units, { merged: new Set(['player']), running: new Set(['audio']) }).map((u) => u.id), ['score']);
  assert.deepEqual(readySet(units, { merged: new Set(['player']), running: new Set(['audio']), maxParallel: 1 }), []);
  assert.deepEqual(readySet(units, { maxParallel: 1 }).map((u) => u.id), ['player']);
  assert.deepEqual(topo(units).map((u) => u.id), ['player', 'score', 'audio', 'economy']);
});

test('branches and merge commits: build keeps mod/<id> and "merge: <id> (đợt N)"; re uses re/<id>', () => {
  assert.equal(branchOf('build', 'core-player'), 'mod/core-player');
  assert.equal(mergeMessage('build', 'core-player', 2), 'merge: core-player (đợt 2)');
  assert.equal(branchOf('re', 'player'), 're/player');
  assert.equal(mergeMessage('re', 'player'), 'merge: re/player (mảng)');
  assert.ok(mergeMessage('re', 'player').startsWith(mergeGrep('re', 'player')));
  assert.ok(!mergeMessage('re', 'player').startsWith(mergeGrep('build', 'player')), 'an area merge never counts as the module of the same name');
});
