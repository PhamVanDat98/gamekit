import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT } from './helpers.mjs';
import { AVAILABLE_SKILLS, PHASE_INFO } from '../scripts/lib/phases.mjs';

const SKILLS = path.join(ROOT, 'skills');
const skillDirs = () => fs.readdirSync(SKILLS).filter((d) => fs.statSync(path.join(SKILLS, d)).isDirectory()).sort();

function frontmatter(dir) {
  const text = fs.readFileSync(path.join(SKILLS, dir, 'SKILL.md'), 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, `${dir}/SKILL.md thiếu frontmatter`);
  return { meta: YAML.parse(m[1]), text };
}

test('skills: frontmatter name matches the folder and description says when to use it', () => {
  for (const d of skillDirs()) {
    const { meta } = frontmatter(d);
    assert.equal(meta.name, d);
    assert.ok(typeof meta.description === 'string' && meta.description.length > 40, `${d}: description quá ngắn`);
  }
});

test('skills: AVAILABLE_SKILLS lists exactly the shipped skills, each suggested by a phase', () => {
  assert.deepEqual([...AVAILABLE_SKILLS].sort(), skillDirs());
  const suggested = new Set(Object.values(PHASE_INFO).flatMap((p) => [...p.skills, ...(p.thirdParty?.skills ?? [])]));
  for (const s of AVAILABLE_SKILLS) {
    if (s === 'using-gamekit') continue;
    const viaEngine = s.startsWith('engine-') && suggested.has('engine-<engine>');
    assert.ok(suggested.has(s) || viaEngine, `${s} không có trong pha nào`);
  }
});

test('skills: relative links inside a skill point to files that exist', () => {
  for (const d of skillDirs()) {
    const { text } = frontmatter(d);
    for (const [, target] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue; // URL
      assert.ok(fs.existsSync(path.join(SKILLS, d, target)), `${d}: link hỏng ${target}`);
    }
  }
});
