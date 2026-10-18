import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gk, newGame, sh, write, read } from './helpers.mjs';
import { checkModulePlan } from '../scripts/validate.mjs';
import { ownershipProblems, topo } from '../scripts/parallel.mjs';

test('module plan: overlap, shared and wave order are rejected', () => {
  const base = { base: 'main', shared: ['src/contracts/', 'params/'] };
  const ok = checkModulePlan({ ...base, modules: [
    { id: 'a', wave: 1, owns: ['src/core/a/'], brief: 'x' },
    { id: 'b', wave: 2, owns: ['src/core/b/'], dependsOn: ['a'], brief: 'x' },
  ] });
  assert.ok(ok.ok, ok.errors.join('\n'));
  const bad = checkModulePlan({ ...base, modules: [
    { id: 'a', wave: 1, owns: ['src/core/'], brief: 'x' },
    { id: 'b', wave: 1, owns: ['src/core/b/'], dependsOn: ['a'], brief: 'x' },
    { id: 'c', wave: 1, owns: ['params/x.json'], brief: 'x' },
  ] });
  const text = bad.errors.join('\n');
  assert.match(text, /cùng sở hữu/);
  assert.match(text, /đợt trước/);
  assert.match(text, /vùng dùng chung/);
});

test('ownership and topo order', () => {
  const plan = { base: 'main', shared: ['params/'], modules: [] };
  const mod = { id: 'a', owns: ['src/core/a/'] };
  assert.ok(ownershipProblems(plan, mod, ['src/core/a/x.ts']).ok);
  assert.equal(ownershipProblems(plan, mod, ['src/core/ab.ts', 'params/g.json']).errors.length, 2);
  const order = topo([
    { id: 'c', dependsOn: ['b'] },
    { id: 'b', dependsOn: ['a'] },
    { id: 'a' },
  ]).map((m) => m.id);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('fanout → work → check-ownership → integrate (merge + rollback on red tests)', () => {
  const dir = newGame('para');
  write(dir, 'module-plan.yaml', `base: main
shared: [src/contracts/, params/, package.json, game.yaml, module-plan.yaml]
modules:
  - { id: a, wave: 1, owns: [src/core/a/], brief: A }
  - { id: b, wave: 1, owns: [src/core/b/], brief: B }
`);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  assert.equal(gk(dir, 'fanout', '--wave', '1').code, 0);
  const wt = (id) => path.join(path.dirname(dir), 'para.worktrees', id);
  assert.match(read(wt('a'), '.gamekit/local/BRIEF.md'), /src\/core\/a\//);
  for (const id of ['a', 'b']) {
    sh(wt(id), 'git', 'config', 'user.email', 't@e');
    write(wt(id), `src/core/${id}/x.ts`, 'export const x = 1;\n');
    sh(wt(id), 'git', 'add', '-A');
    sh(wt(id), 'git', 'commit', '-qm', id);
  }
  write(wt('b'), 'params/game.json', '{}');
  const own = gk(wt('b'), 'check-ownership');
  assert.equal(own.code, 1);
  assert.match(own.out, /vùng dùng chung/);
  sh(wt('b'), 'git', 'checkout', '-q', 'params/game.json');
  assert.equal(gk(wt('b'), 'check-ownership').code, 0);

  const head = sh(dir, 'git', 'rev-parse', 'HEAD').trim();
  const red = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 1');
  assert.equal(red.code, 1);
  assert.equal(sh(dir, 'git', 'rev-parse', 'HEAD').trim(), head, 'merge rolled back');

  const green = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 0', '--cleanup');
  assert.equal(green.code, 0, green.out);
  assert.ok(fs.existsSync(path.join(dir, 'src/core/a/x.ts')));
  assert.ok(fs.existsSync(path.join(dir, 'src/core/b/x.ts')));
  assert.ok(!fs.existsSync(wt('a')), 'worktree removed');
});


test('integrate: moving a shared file is caught; empty branches are not "merged"; deleted branches still count', () => {
  const dir = newGame('edge');
  write(dir, 'module-plan.yaml', `base: main
shared: [src/contracts/, params/, package.json, game.yaml, module-plan.yaml]
modules:
  - { id: a, wave: 1, owns: [src/core/a/], brief: A }
  - { id: e, wave: 1, owns: [src/core/e/], brief: E }
  - { id: c, wave: 2, owns: [src/core/c/], dependsOn: [a], brief: C }
`);
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'plan');
  assert.equal(gk(dir, 'fanout', '--wave', '1').code, 0);
  const wt = (id) => path.join(path.dirname(dir), 'edge.worktrees', id);
  sh(wt('a'), 'git', 'config', 'user.email', 't@e');
  fs.mkdirSync(path.join(wt('a'), 'src/core/a'), { recursive: true });
  sh(wt('a'), 'git', 'mv', 'src/contracts/input.ts', 'src/core/a/input.ts');
  sh(wt('a'), 'git', 'commit', '-qm', 'move');
  const moved = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 0');
  assert.equal(moved.code, 1);
  assert.match(moved.out, /src\/contracts\/input\.ts/);
  sh(wt('a'), 'git', 'reset', '-q', '--hard', 'HEAD~1');
  write(wt('a'), 'src/core/a/x.ts', 'export const x = 1;\n');
  sh(wt('a'), 'git', 'add', '-A');
  sh(wt('a'), 'git', 'commit', '-qm', 'a');
  // e has no commits but an uncommitted file: must not be treated as merged nor have its work deleted
  write(wt('e'), 'src/core/e/wip.ts', 'export const w = 1;\n');
  const r = gk(dir, 'integrate', '--wave', '1', '--test', 'exit 0', '--cleanup');
  assert.equal(r.code, 1);
  assert.match(r.out, /chưa commit/);
  assert.ok(fs.existsSync(path.join(wt('e'), 'src/core/e/wip.ts')), 'uncommitted work kept');
  sh(dir, 'git', 'worktree', 'remove', wt('a'));
  sh(dir, 'git', 'branch', '-D', 'mod/a');
  assert.equal(gk(dir, 'fanout', '--wave', '2').code, 0, 'a counted as merged via its merge commit');
});
