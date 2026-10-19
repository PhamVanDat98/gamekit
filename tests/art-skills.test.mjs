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

test('gameart gen: runs Codex CLI (no API key), picks the image from $CODEX_HOME/generated_images/<thread>, attaches refs', { skip: (skipPy || process.platform === 'win32') && 'cần python3 + Pillow, không chạy trên Windows' }, () => {
  const dir = tmpDir();
  const home = path.join(dir, 'codex-home');
  fs.mkdirSync(home);
  const fake = path.join(dir, 'fake-codex');
  fs.writeFileSync(
    fake,
    `#!${spawnSync(PY, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim()}
import json, os, sys
from pathlib import Path
from PIL import Image
argv = sys.argv[1:]
prompt = sys.stdin.read()
home = Path(os.environ["CODEX_HOME"])
(home / "call.json").write_text(json.dumps({"argv": argv, "prompt": prompt}))
if "FAIL" in prompt:
    print(json.dumps({"type": "thread.started", "thread_id": "t-fail"}))
    print(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": "IMAGE_UNAVAILABLE"}}))
    sys.exit(0)
print(json.dumps({"type": "thread.started", "thread_id": "t-1"}))
out = home / "generated_images" / "t-1"
out.mkdir(parents=True)
Image.new("RGB", (40, 30), (250, 3, 248)).save(out / "ig_1.png")
print(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": str(out / "ig_1.png")}}))
`,
  );
  fs.chmodSync(fake, 0o755);
  py(dir, `Image.new('RGB', (8, 8)).save('frame.png')`);
  const env = { ...process.env, CODEX_HOME: home };
  delete env.OPENAI_API_KEY;
  const run = (...args) => {
    const r = spawnSync(PY, ['-I', GA, ...args], { cwd: dir, encoding: 'utf8', env });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  let r = run('gen', '--prompt', 'a slime enemy', '--ref', 'frame.png', '--out', 'raw/slime.png', '--codex', fake);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Codex CLI/);
  assert.equal(py(dir, `print(Image.open('raw/slime.png').size)`), '(40, 30)');
  const call = JSON.parse(fs.readFileSync(path.join(home, 'call.json'), 'utf8'));
  assert.equal(call.argv[0], 'exec');
  assert.equal(call.argv.at(-1), '-');
  assert.ok(call.argv.includes('--image') && call.argv[call.argv.indexOf('--image') + 1].endsWith('frame.png'));
  assert.ok(call.argv.includes('features.image_generation=true'));
  assert.ok(call.argv.includes('features.shell_tool=false'), 'tắt shell: Codex chỉ được tạo ảnh');
  assert.match(call.prompt, /a slime enemy/);
  r = run('gen', '--prompt', 'FAIL', '--out', 'raw/x.png', '--codex', fake);
  assert.equal(r.code, 1);
  assert.match(r.out, /IMAGE_UNAVAILABLE.*codex login/);
  r = run('gen', '--prompt', 'x', '--out', 'raw/x.png', '--codex', path.join(dir, 'missing'));
  assert.equal(r.code, 1);
});

test('gameart split, grade, compose, compare: assets from one sheet, pulled toward the concept, checked in the scene', { skip: skipPy }, () => {
  const dir = tmpDir();
  py(dir, `
im = Image.new('RGB', (600, 200), (250, 3, 248))
d = ImageDraw.Draw(im)
d.ellipse([20, 40, 140, 160], fill=(60, 160, 60))            # slime
d.rectangle([220, 50, 320, 170], fill=(200, 60, 40))         # crate
d.ellipse([420, 60, 500, 140], fill=(240, 200, 40))          # coin
d.ellipse([505, 60, 515, 70], fill=(255, 255, 255))          # sparkle next to the coin (same object)
im.save('sheet.png')
# "concept": warm, darker scene; the asset is a cool, bright version of the same thing
c = Image.new('RGB', (320, 180), (90, 60, 40)); ImageDraw.Draw(c).ellipse([120, 60, 200, 140], fill=(200, 120, 40)); c.save('frame.png')
a = Image.new('RGBA', (80, 80), (0, 0, 0, 0)); ImageDraw.Draw(a).ellipse([0, 0, 79, 79], fill=(120, 200, 255, 255)); a.save('asset.png')
Image.new('RGB', (320, 180), (90, 60, 40)).save('bg.png')`);
  let r = ga(dir, 'split', 'sheet.png', '--out-dir', 'parts', '--names', 'slime,crate,coin', '--index', 'index.png');
  assert.equal(r.code, 0, r.out);
  for (const n of ['slime', 'crate', 'coin']) assert.ok(fs.existsSync(path.join(dir, 'parts', `${n}.png`)), n);
  assert.ok(fs.existsSync(path.join(dir, 'index.png')));
  assert.equal(py(dir, `print(Image.open('parts/coin.png').size[0] > 90)`), 'True', 'tia lấp lánh sát đồng xu thuộc cùng một vật');
  r = ga(dir, 'split', 'sheet.png', '--out-dir', 'p2', '--names', 'a,b');
  assert.equal(r.code, 1);
  assert.match(r.out, /3 vật nhưng --names có 2 tên/);

  r = ga(dir, 'grade', 'asset.png', '--ref', 'frame.png', '--ref-box', '120,60,80,80', '--out-dir', 'graded', '--strength', '1');
  assert.equal(r.code, 0, r.out);
  const [, before, after] = r.out.match(/lệch màu với concept ([\d.]+) → ([\d.]+)/);
  assert.ok(Number(after) < Number(before) / 2, r.out);
  assert.equal(py(dir, `print(Image.open('graded/asset.png').getpixel((0, 0))[3])`), '0', 'giữ alpha');

  fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify({ size: [320, 180], items: [{ file: 'graded/asset.png', x: 160, y: 140, anchor: 'bottom' }] }));
  r = ga(dir, 'compose', '--bg', 'bg.png', '--layout', 'layout.json', '--out', 'mock.png');
  assert.equal(r.code, 0, r.out);
  r = ga(dir, 'compare', 'frame.png', 'mock.png', '--out', 'cmp.png');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /giống/);
  assert.ok(fs.existsSync(path.join(dir, 'cmp.png')));
  r = ga(dir, 'compare', 'frame.png', 'asset.png');
  assert.equal(r.code, 1);
  assert.match(r.out, /lệch/);
});

const VX = path.join(ART, 'voxel-art', 'scripts', 'voxel.py');
const vx = (cwd, ...args) => {
  const r = spawnSync(PY, ['-I', VX, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

test('voxel-art: examples render; directions and frames make strips with feet on one line; .vox export; model errors point at the file', { skip: skipPy }, () => {
  const dir = tmpDir();
  for (const f of fs.readdirSync(path.join(ART, 'voxel-art', 'examples'))) {
    const r = vx(dir, 'render', path.join(ART, 'voxel-art', 'examples', f), '--out', `${f}.png`, '--dirs', '4', '--outline', '#1b1630');
    assert.equal(r.code, 0, `${f}: ${r.out}`);
  }
  fs.writeFileSync(
    path.join(dir, 'bob.vox.py'),
    `PALETTE = {"g": "#5fa85b", "k": "#1b1630"}
SIZE = (8, 8, 10)
FRAMES = 2
def build(v, frame=0):
    v.box(1, 1, 0, 7, 7, 8, "g")
    v.set(2, 0, 6, "k")
    if frame:
        v.shift(dz=-1, where=lambda x, y, z: z >= 5)
`,
  );
  let r = vx(dir, 'render', 'bob.vox.py', '--out', 'bob.png', '--canvas', '56x64');
  assert.equal(r.code, 0, r.out);
  const boxes = JSON.parse(py(dir, `
import json
im = Image.open('bob.png'); print(json.dumps([im.size, [im.crop((i*56, 0, i*56+56, 64)).getchannel('A').getbbox() for i in range(2)]]))`));
  assert.deepEqual(boxes[0], [112, 64]);
  assert.equal(boxes[1][0][3], boxes[1][1][3], 'đáy hai frame thẳng hàng');
  assert.ok(boxes[1][1][1] > boxes[1][0][1], 'frame 2 nhún xuống');
  r = vx(dir, 'render', 'bob.vox.py', '--out', 'x.png', '--canvas', '10x10');
  assert.equal(r.code, 1);
  assert.match(r.out, /lớn hơn canvas/);
  r = vx(dir, 'render', 'bob.vox.py', '--out', 'x.png', '--px', '3');
  assert.match(r.out, /số chẵn/);
  r = vx(dir, 'export', 'bob.vox.py', '--out', 'bob.vox');
  assert.equal(r.code, 0, r.out);
  const vox = fs.readFileSync(path.join(dir, 'bob.vox'));
  assert.equal(vox.subarray(0, 4).toString(), 'VOX ');
  assert.equal(vox.readInt32LE(4), 150);
  assert.ok(vox.includes(Buffer.from('XYZI')) && vox.includes(Buffer.from('RGBA')));
  fs.writeFileSync(path.join(dir, 'bad.vox.py'), `PALETTE = {"g": "#00ff00"}\nSIZE = (4, 4, 4)\ndef build(v):\n    v.box(0, 0, 0, 2, 2, 2, "q")\n`);
  r = vx(dir, 'info', 'bad.vox.py');
  assert.equal(r.code, 1);
  assert.match(r.out, /màu 'q' không có trong PALETTE/);
  fs.writeFileSync(path.join(dir, 'boom.vox.py'), `PALETTE = {"g": "#00ff00"}\nSIZE = (4, 4, 4)\ndef build(v):\n    v.box(0, 0, 0, 2, 2, 2, "g")\n    1 / 0\n`);
  r = vx(dir, 'info', 'boom.vox.py');
  assert.match(r.out, /boom\.vox\.py:5: ZeroDivisionError/);
});
