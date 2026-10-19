import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, tmpDir } from './helpers.mjs';
import { lintSvg, loadStyle, listStyles, findChrome, render, pngSize } from '../art-skills/svg-game-art/scripts/svgart.mjs';

const ART = path.join(ROOT, 'art-skills');
const SKILL = path.join(ART, 'svg-game-art');
const CLI = path.join(SKILL, 'scripts', 'svgart.mjs');
const svg = (body, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${attrs}>${body}</svg>`;

test('art-skills: each skill has frontmatter name = folder, a description, and agents/openai.yaml for Codex', () => {
  for (const d of fs.readdirSync(ART).filter((d) => fs.statSync(path.join(ART, d)).isDirectory())) {
    const text = fs.readFileSync(path.join(ART, d, 'SKILL.md'), 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(m, `${d}/SKILL.md thiếu frontmatter`);
    assert.match(m[1], new RegExp(`^name: ${d}$`, 'm'));
    assert.match(m[1], /^description: .*Dùng khi/m);
    assert.ok(fs.existsSync(path.join(ART, d, 'agents', 'openai.yaml')), `${d} thiếu agents/openai.yaml`);
    for (const [, target] of text.matchAll(/\]\(((?!https?:)[^)#]+)\)/g)) assert.ok(fs.existsSync(path.join(ART, d, target)), `${d}: link hỏng ${target}`);
  }
});

test('svg-game-art: every style is valid and its example passes lint', () => {
  const styles = listStyles();
  assert.deepEqual(styles.map((s) => s.name).sort(), ['doodle', 'flat', 'neon', 'paper', 'sticker']);
  for (const s of styles) {
    assert.ok(fs.existsSync(path.join(SKILL, 'styles', `${s.name}.json`)), `${s.name}: tên khác tên file`);
    for (const [k, c] of Object.entries(s.colors)) assert.match(c, /^#[0-9a-f]{6}$/, `${s.name}.${k}`);
    const examples = fs.readdirSync(path.join(SKILL, 'examples')).filter((f) => f.startsWith(`${s.name}-`));
    assert.ok(examples.length, `${s.name} không có ví dụ`);
    for (const f of examples) assert.deepEqual(lintSvg(fs.readFileSync(path.join(SKILL, 'examples', f), 'utf8'), s), [], f);
  }
});

test('svg-game-art lint: palette, stroke widths, round joins, forbidden elements, opacity, viewBox', () => {
  const doodle = loadStyle('doodle');
  const ok = svg('<g stroke="#151515" stroke-linejoin="round"><circle cx="50" cy="50" r="20" fill="#f08a6c" stroke-width="3.2"/></g>');
  assert.deepEqual(lintSvg(ok, doodle), []);
  assert.match(lintSvg(ok.replace('#f08a6c', '#123456'), doodle).join(), /ngoài palette.*#123456/);
  assert.match(lintSvg(ok.replace('3.2', '5'), doodle).join(), /stroke-width 5/);
  assert.match(lintSvg(ok.replace(' stroke-linejoin="round"', ''), doodle).join(), /linejoin/);
  assert.match(lintSvg(ok.replace('<g ', '<linearGradient id="a"/><g '), doodle).join(), /linearGradient/);
  assert.match(lintSvg(ok.replace('<g ', '<text>Hi</text><g '), doodle).join(), /<text>/);
  assert.match(lintSvg(ok.replace('fill="#f08a6c"', 'fill="#f08a6c" opacity="0.5"'), doodle).join(), /opacity/);
  assert.match(lintSvg(ok.replace(' viewBox="0 0 100 100"', ' viewBox="0 0 64 64"'), doodle).join(), /viewBox/);
  // comments are not checked; shorthand hex matches the palette
  assert.deepEqual(lintSvg(ok.replace('<g ', '<!-- stroke: #000 --><g ').replace('#151515', '#151515'), doodle), []);
  assert.deepEqual(lintSvg(svg('<rect width="10" height="10" fill="#FFF"/>'), loadStyle('flat')), []);
  assert.match(lintSvg(svg('<rect width="10" height="10" fill="#fff" stroke="#fff" stroke-width="2"/>'), loadStyle('flat')).join(), /không có nét viền/);
  const neon = loadStyle('neon');
  assert.deepEqual(lintSvg(svg('<filter id="g"><feGaussianBlur stdDeviation="2"/></filter><path d="M0 0" stroke="#00f0ff" stroke-width="3" stroke-linejoin="round"/>'), neon), []);
  assert.match(lintSvg(svg('<filter id="g"><feTurbulence/></filter>'), neon).join(), /feTurbulence/);
  assert.match(lintSvg(svg('<filter id="g"/>'), doodle).join(), /<filter>/);
});

test('svgart CLI: lint exit code, unknown style lists the styles', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'bad.svg'), svg('<rect width="1" height="1" fill="#123456"/>'));
  let r = spawnSync(process.execPath, [CLI, 'lint', path.join(dir, 'bad.svg'), '--style', 'flat'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /#123456/);
  r = spawnSync(process.execPath, [CLI, 'lint', path.join(dir, 'bad.svg'), '--style', 'nope'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /doodle.*sticker|sticker.*doodle/);
  r = spawnSync(process.execPath, [CLI, 'styles'], { encoding: 'utf8' });
  assert.match(r.stdout, /neon/);
});

test('svgart render: transparent PNG at the exact size; several frames make a horizontal strip', { skip: !findChrome() && 'không có Chromium/Chrome trên máy' }, async () => {
  const dir = tmpDir();
  const f0 = path.join(dir, 'f0.svg');
  const f1 = path.join(dir, 'f1.svg');
  fs.writeFileSync(f0, svg('<circle cx="50" cy="80" r="14" fill="#ff5a5f"/>'));
  fs.writeFileSync(f1, svg('<circle cx="50" cy="70" r="14" fill="#ff5a5f"/>'));
  const one = path.join(dir, 'one.png');
  await render([f0], one, '48x40');
  assert.deepEqual(pngSize(one), { width: 48, height: 40, alpha: true });
  const strip = path.join(dir, 'strip.png');
  await render([f0, f1, f0], strip, '64x64');
  assert.deepEqual(pngSize(strip), { width: 192, height: 64, alpha: true });
});
