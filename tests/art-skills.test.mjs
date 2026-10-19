import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, tmpDir } from './helpers.mjs';

const ART = path.join(ROOT, 'art-skills');
const GA = path.join(ART, 'game-raster-art', 'scripts', 'gameart.py');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const hasPillow = spawnSync(PY, ['-c', 'import PIL'], { encoding: 'utf8' }).status === 0;
const ga = (cwd, ...args) => {
  const r = spawnSync(PY, ['-I', GA, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
/** Run a Python snippet with Pillow; prints are returned. */
const py = (cwd, code) => {
  const r = spawnSync(PY, ['-I', '-c', `from PIL import Image, ImageDraw\n${code}`], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

test('art-skills: each skill has frontmatter name = folder, a description, agents/openai.yaml and working links', () => {
  const dirs = fs.readdirSync(ART).filter((d) => fs.statSync(path.join(ART, d)).isDirectory());
  assert.ok(dirs.includes('game-raster-art'));
  for (const d of dirs) {
    const text = fs.readFileSync(path.join(ART, d, 'SKILL.md'), 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(m, `${d}/SKILL.md thiếu frontmatter`);
    assert.match(m[1], new RegExp(`^name: ${d}$`, 'm'));
    assert.match(m[1], /^description: .*Dùng khi/m);
    assert.ok(fs.existsSync(path.join(ART, d, 'agents', 'openai.yaml')), `${d} thiếu agents/openai.yaml`);
    for (const [, target] of text.matchAll(/\]\(((?!https?:)[^)#]+)\)/g)) assert.ok(fs.existsSync(path.join(ART, d, target)), `${d}: link hỏng ${target}`);
  }
});

const skipPy = !hasPillow && 'không có python3 + Pillow';

test('gameart key: flat magenta background → transparent, trimmed, no magenta left at the edges', { skip: skipPy }, () => {
  const dir = tmpDir();
  py(dir, `
im = Image.new('RGB', (400, 300), (250, 3, 248))
d = ImageDraw.Draw(im)
d.ellipse([120, 60, 280, 260], fill=(40, 160, 220), outline=(20, 20, 30), width=6)
d.rectangle([180, 120, 220, 200], fill=(250, 3, 248))  # enclosed pocket of key color
im = im.resize((800, 600)).resize((400, 300), Image.Resampling.LANCZOS)  # anti-aliased edges like a model
im.save('src.png')`);
  const r = ga(dir, 'key', 'src.png', '--out', 'out.png');
  assert.equal(r.code, 0, r.out);
  const info = JSON.parse(py(dir, `
import json
im = Image.open('out.png').convert('RGBA'); w, h = im.size
px = im.load()
pink = sum(1 for y in range(h) for x in range(w) if px[x,y][3] > 24 and px[x,y][0] > 200 and px[x,y][2] > 200 and px[x,y][1] < 80)
print(json.dumps({'size': [w, h], 'corner': px[0,0][3], 'pocket': px[w//2, h//2][3], 'pink': pink}))`));
  assert.ok(Math.abs(info.size[0] - 161) <= 3 && Math.abs(info.size[1] - 201) <= 3, JSON.stringify(info));
  assert.equal(info.corner, 0);
  assert.equal(info.pocket, 0);
  assert.equal(info.pink, 0);
  assert.equal(ga(dir, 'check', 'out.png', '--alpha', '--key', '#fa03f8').code, 0);
});

test('gameart anim: N poses → strip with one shared scale and feet on one line; wrong count is an error; --pick', { skip: skipPy }, () => {
  const dir = tmpDir();
  // 4 poses with uneven spacing; pose 2 is taller (arm up) and pose 3 jumps (higher on the canvas)
  py(dir, `
im = Image.new('RGB', (900, 300), (4, 250, 8))
d = ImageDraw.Draw(im)
for x, top, bottom in [(60, 100, 260), (290, 60, 260), (480, 100, 260), (700, 80, 240)]:
    d.rectangle([x, top, x + 80, bottom], fill=(200, 60, 40), outline=(20, 20, 20), width=4)
im.save('strip.png')`);
  let r = ga(dir, 'anim', 'strip.png', '--frames', '4', '--size', '48x64', '--out', 'anim.png', '--gif', 'anim.gif');
  assert.equal(r.code, 0, r.out);
  const boxes = JSON.parse(py(dir, `
import json
im = Image.open('anim.png').convert('RGBA'); print(json.dumps([im.crop((i*48, 0, i*48+48, 64)).getchannel('A').getbbox() for i in range(4)]) if im.size == (192, 64) else 'null')`));
  assert.ok(boxes, 'strip phải là 192×64');
  assert.ok(boxes.every((b) => b[3] === boxes[0][3]), `chân phải cùng một đường: ${JSON.stringify(boxes)}`);
  assert.ok(boxes[1][3] - boxes[1][1] > boxes[0][3] - boxes[0][1], 'cùng tỉ lệ: tư thế cao hơn vẫn cao hơn');
  assert.ok(fs.existsSync(path.join(dir, 'anim.gif')));
  // slot anchor keeps the jump: the last pose ends higher than the others
  r = ga(dir, 'anim', 'strip.png', '--frames', '4', '--size', '48x64', '--out', 'slot.png', '--anchor', 'slot');
  assert.equal(r.code, 0, r.out);
  r = ga(dir, 'anim', 'strip.png', '--frames', '5', '--size', '48x64', '--out', 'x.png');
  assert.equal(r.code, 1);
  assert.match(r.out, /có 4 hình, cần 5/);
  r = ga(dir, 'anim', 'strip.png', '--frames', 'auto', '--pick', '0,2', '--size', '48x64', '--out', 'pick.png');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /96×64 \(2 frame/);
});

test('gameart pixel, tile, bg, fit, check', { skip: skipPy }, () => {
  const dir = tmpDir();
  py(dir, `
im = Image.new('RGB', (512, 512), (250, 3, 248))
d = ImageDraw.Draw(im)
for i in range(40):
    d.ellipse([100 + i * 4, 100 + i * 3, 300 + i * 2, 420], fill=(30 + i * 5, 120 + i * 2, 60 + i))
im.save('char.png')
t = Image.new('RGB', (300, 300))
t.putdata([(80 + x // 4, 140 + y // 6, 60) for y in range(300) for x in range(300)])  # gradient: edges don't match
t.save('tex.png')`);
  let r = ga(dir, 'pixel', 'char.png', '--out', 'px.png', '--size', '32x32', '--colors', '8');
  assert.equal(r.code, 0, r.out);
  const px = JSON.parse(py(dir, `
import json
im = Image.open('px.png').convert('RGBA')
alphas = sorted(set(a for a in im.getchannel('A').getdata()))
print(json.dumps({'size': im.size, 'colors': len(set(p[:3] for p in im.getdata() if p[3])), 'alphas': alphas}))`));
  assert.deepEqual(px.size, [32, 32]);
  assert.ok(px.colors <= 8, `${px.colors} màu`);
  assert.deepEqual(px.alphas, [0, 255], 'alpha cứng');

  r = ga(dir, 'tile', 'tex.png', '--out', 'tile.png', '--size', '64x64', '--preview', 'tile3.png');
  assert.equal(r.code, 0, r.out);
  const [, before, after] = r.out.match(/ngang (\d+)→(\d+)/);
  assert.ok(Number(after) < Number(before) / 3, r.out);
  assert.ok(fs.existsSync(path.join(dir, 'tile3.png')));

  assert.equal(ga(dir, 'bg', 'tex.png', '--out', 'bg.png', '--size', '320x180', '--seamless-x').code, 0);
  assert.equal(ga(dir, 'key', 'char.png', '--out', 'k.png').code, 0);
  assert.equal(ga(dir, 'fit', 'k.png', '--out', 'f.png', '--size', '96x96').code, 0);
  assert.equal(ga(dir, 'check', 'f.png', '--size', '96x96', '--alpha').code, 0);
  r = ga(dir, 'check', 'f.png', '--size', '64x64');
  assert.equal(r.code, 1);
  assert.match(r.out, /96×96, spec cần 64×64/);
  r = ga(dir, 'check', 'bg.png', '--alpha');
  assert.match(r.out, /không có pixel trong suốt/);
  assert.equal(ga(dir, 'sheet', 'f.png', 'px.png', '--out', 'sheet.png').code, 0);
  assert.equal(ga(dir, 'fit', 'k.png', '--out', 'x.png', '--size', '9').code, 1);
});
