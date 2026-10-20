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
const AN = path.join(ART, 'game-animation', 'scripts', 'animate.py');
const LIB = path.join(ART, 'game-animation', 'library');
const an = (cwd, ...args) => {
  const r = spawnSync(PY, ['-I', AN, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

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

test('gameart guide + anim --slots + inspect: equal slots, drifting frames flagged', { skip: skipPy }, () => {
  const dir = tmpDir();
  let r = ga(dir, 'guide', '--frames', '4', '--cell', '64x64', '--out', 'guide.png');
  assert.equal(r.code, 0, r.out);
  assert.equal(py(dir, `print(Image.open('guide.png').size)`), '(1536, 384)');
  // 4 slots; slot 2 is a different, bigger subject (identity/size drift); slot 3 slid up off the ground line
  py(dir, `
im = Image.new('RGB', (400, 100), (250, 3, 248)); d = ImageDraw.Draw(im)
d.ellipse([30, 50, 70, 95], fill=(60, 160, 60)); d.ellipse([130, 50, 170, 95], fill=(60, 160, 60))
d.rectangle([215, 20, 290, 95], fill=(40, 40, 200)); d.ellipse([330, 30, 370, 75], fill=(60, 160, 60))
im.save('raw.png')
ref = Image.new('RGBA', (40, 45), (0, 0, 0, 0)); ImageDraw.Draw(ref).ellipse([0, 0, 39, 44], fill=(60, 160, 60, 255)); ref.save('ref.png')`);
  r = ga(dir, 'anim', 'raw.png', '--frames', '4', '--slots', '--anchor', 'slot', '--size', '64x64', '--out', 'strip.png');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ô đều nhau/);
  r = ga(dir, 'inspect', 'strip.png', '--frames', '4', '--ref', 'ref.png');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /✔ frame 0/);
  assert.match(r.out, /✔ frame 1/);
  assert.match(r.out, /✖ frame 2: .*(diện tích|màu)/);
  assert.match(r.out, /✖ frame 3: .*chân lệch/);
  assert.equal(ga(dir, 'anim', 'raw.png', '--frames', 'auto', '--slots', '--size', '64x64', '--out', 'x.png').code, 1);
});

test('gameart pose + canvas + anim --lock-first + replace: Codex edits a canvas holding the approved frame, guided by stick-figure poses', { skip: skipPy }, () => {
  const dir = tmpDir();
  let r = an(dir, 'pose', path.join(ART, 'game-animation', 'library', 'humanoid', 'walk.anim.json'), '--frames', '6', '--cell', '128x128', '--out', 'pose.png');
  assert.equal(r.code, 0, r.out);
  const pose = JSON.parse(py(dir, `
import json
im = Image.open('pose.png').convert('RGB'); w, h = im.size; cw = w // 6
def has(c, i):
    return any(abs(p[0]-c[0]) < 30 and abs(p[1]-c[1]) < 30 and abs(p[2]-c[2]) < 30 for p in im.crop((i*cw, 0, (i+1)*cw, h)).getdata())
# front leg (red) x-position per slot: it swings forward and back over the cycle
def front_x(i):
    xs = [x for y in range(int(h * 0.75), h) for x in range(cw) if (lambda p: p[0] > 190 and 60 < p[1] < 110 and p[2] < 80)(im.getpixel((i*cw + x, y)))]
    return sum(xs) / len(xs)
print(json.dumps({'size': [w, h], 'front': all(has((225, 85, 45), i) for i in range(6)), 'back': all(has((55, 105, 210), i) for i in range(6)), 'fx': [round(front_x(i)) for i in range(6)]}))`));
  assert.deepEqual(pose.size, [1536, 256]);
  assert.ok(pose.front && pose.back, 'mỗi ô có chân trước (đỏ) và chân sau (xanh)');
  assert.ok(Math.max(...pose.fx) - Math.min(...pose.fx) > 10, `chân trước phải đánh qua lại: ${pose.fx}`);

  py(dir, `
s = Image.new('RGBA', (60, 120), (0, 0, 0, 0)); ImageDraw.Draw(s).rounded_rectangle([0, 0, 59, 119], radius=20, fill=(40, 160, 90, 255)); s.save('hero.png')`);
  r = ga(dir, 'canvas', '--seed', 'hero.png', '--frames', '6', '--cell', '128x128', '--out', 'canvas.png');
  assert.equal(r.code, 0, r.out);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8'));
  assert.deepEqual(meta.slot_px, [256, 256]);
  const cv = JSON.parse(py(dir, `
import json
im = Image.open('canvas.png').convert('RGB')
key = lambda p: p[0] > 240 and p[1] < 20 and p[2] > 240
slot1 = [x for x in range(256) for y in range(256) if not key(im.getpixel((x, y)))]
rest = sum(1 for x in range(256, 1536) for y in range(0, 256, 4) if not key(im.getpixel((x, y))))
bottom = max(y for y in range(256) if not key(im.getpixel((128, y))))
print(json.dumps({'size': im.size, 'slot1': len(slot1) > 1000, 'rest': rest, 'bottom': bottom}))`));
  assert.deepEqual(cv.size, [1536, 256]);
  assert.ok(cv.slot1, 'ô 1 có sprite đã duyệt');
  assert.equal(cv.rest, 0, 'các ô khác trống (màu nền tách)');
  assert.ok(Math.abs(cv.bottom - meta.ground_y) <= 1, `chân trên đường đất: ${cv.bottom} vs ${meta.ground_y}`);

  // what Codex returns: slot 1 redrawn slightly off-colour, other slots filled; slot 4 drawn too big
  py(dir, `
out = Image.open('canvas.png').convert('RGB'); d = ImageDraw.Draw(out)
d.rectangle([0, 0, 255, 255], fill=(250, 3, 248))
d.rounded_rectangle([87, 70, 169, 235], radius=18, fill=(70, 120, 200))            # slot 1 redraw, wrong colour
for i, (w, top) in enumerate([(82, 70), (84, 66), (80, 70), (150, 10), (82, 70)], start=1):  # sprite is 1:2
    x = i * 256 + 128 - w // 2; d.rounded_rectangle([x, top, x + w, 235], radius=18, fill=(40, 160, 90))
out.save('raw.png')`);
  r = ga(dir, 'anim', 'raw.png', '--frames', '6', '--slots', '--anchor', 'slot', '--lock-first', 'hero.png', '--size', '64x96', '--out', 'walk.png');
  assert.equal(r.code, 0, r.out);
  assert.equal(py(dir, `
im = Image.open('walk.png'); f0 = im.crop((0, 0, 64, 96)); bb = f0.getchannel('A').getbbox()
p = f0.getpixel(((bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2)); print(p[1] > p[2])`), 'True', 'frame 1 là màu của sprite đã duyệt (xanh lá), không phải bản model vẽ lại');
  r = ga(dir, 'inspect', 'walk.png', '--frames', '6', '--ref', 'hero.png');
  assert.equal(r.code, 1);
  assert.match(r.out, /✖ frame 4/);
  py(dir, `
im = Image.new('RGB', (300, 400), (250, 3, 248)); ImageDraw.Draw(im).rounded_rectangle([70, 60, 230, 380], radius=20, fill=(40, 160, 90)); im.save('fix.png')`);
  r = ga(dir, 'replace', 'walk.png', '--frames', '6', '--frame', '4', '--with', 'fix.png', '--out', 'walk.png');
  assert.equal(r.code, 0, r.out);
  r = ga(dir, 'inspect', 'walk.png', '--frames', '6', '--ref', 'hero.png');
  assert.equal(r.code, 0, r.out);
  assert.equal(ga(dir, 'replace', 'walk.png', '--frames', '6', '--frame', '9', '--with', 'fix.png', '--out', 'x.png').code, 1);
});

test('game-animation library: every template loads, passes check and previews; new copies anim + skeleton into the project', { skip: skipPy }, () => {
  const dir = tmpDir();
  const lib = an(dir, 'library');
  assert.equal(lib.code, 0, lib.out);
  const names = lib.out.trim().split('\n').map((l) => l.split(/\s+/)[0]);
  for (const n of ['humanoid/walk', 'humanoid/run', 'humanoid/jump', 'humanoid/attack', 'humanoid/hit', 'humanoid/idle', 'quadruped/walk', 'bird/flap', 'fish/swim', 'snake/slither', 'sprite/squash-hop', 'sprite/spin']) assert.ok(names.includes(n), n);
  for (const n of names) {
    const r = an(dir, 'check', path.join(LIB, `${n}.anim.json`));
    assert.equal(r.code, 0, `${n}: ${r.out}`);
  }
  let r = an(dir, 'new', 'quadruped/walk', '--out', 'art/anim/dog');
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(path.join(dir, 'art/anim/dog/walk.anim.json')) && fs.existsSync(path.join(dir, 'art/anim/dog/quadruped.skeleton.json')));
  r = an(dir, 'preview', 'art/anim/dog/walk.anim.json', '--out', 'dog.gif');
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(path.join(dir, 'dog.gif')));
  assert.equal(an(dir, 'new', 'humanoid/moonwalk', '--out', 'x').code, 1);
});

test('game-animation: a project-specific skeleton and animation (inline), waves, easing; spec errors are explained; pops are flagged', { skip: skipPy }, () => {
  const dir = tmpDir();
  const ghost = {
    frames: 6, fps: 8, loop: true,
    skeleton: { root: [0, -2], bones: { body: { length: 1, angle: 180, width: 0.6 }, eye: { parent: 'body', at: 0.8, length: 0.3, angle: -90, shape: 'circle', face: true },
      tail1: { parent: 'body', at: 0, length: 0.4, angle: 20 }, tail2: { parent: 'tail1', length: 0.35, angle: 30 }, tail3: { parent: 'tail2', length: 0.3, angle: 40 } } },
    keys: { body: { y: [[0, 0], [0.5, -0.3, 'out']], sy: [[0, 1], [0.5, 1.08]] } },
    waves: [{ bones: ['tail1', 'tail2', 'tail3'], amp: 15, phase_step: 0.15 }],
  };
  fs.writeFileSync(path.join(dir, 'ghost.anim.json'), JSON.stringify(ghost));
  let r = an(dir, 'check', 'ghost.anim.json');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /5 xương, 6 frame, 1 xương có key, 1 sóng, 0 IK/);
  r = an(dir, 'bake', 'ghost.anim.json', '--out', 'ghost.json');
  assert.equal(r.code, 0, r.out);
  const baked = JSON.parse(fs.readFileSync(path.join(dir, 'ghost.json'), 'utf8'));
  assert.equal(baked.frames.length, 6);
  assert.ok(baked.frames[3].body.y < baked.frames[0].body.y, 'thân bay lên giữa vòng (y âm hơn)');
  assert.notEqual(baked.frames[1].tail3.angle, baked.frames[0].tail3.angle, 'đuôi có sóng');

  const bad = (patch, re) => {
    fs.writeFileSync(path.join(dir, 'bad.anim.json'), JSON.stringify({ ...ghost, ...patch }));
    const x = an(dir, 'check', 'bad.anim.json');
    assert.equal(x.code, 1, x.out);
    assert.match(x.out, re);
  };
  bad({ keys: { wing: { rot: [[0, 1]] } } }, /xương 'wing' không có/);
  bad({ keys: { tail1: { y: [[0, 1]] } } }, /chỉ xương gốc/);
  bad({ keys: { body: { rot: [[0, 1, 'bouncy']] } } }, /easing 'bouncy'/);
  bad({ ik: [{ bones: ['body', 'tail2'], target: [[0, [0, 0]]] }] }, /ik cần 2 xương cha-con/);
  bad({ skeleton: { bones: { a: { length: 1 }, b: { length: 1 } } } }, /đúng một xương gốc/);
  bad({ keys: { body: { rot: [[0, 0, 'step'], [0.2, 170, 'step']] } } }, /xoay \d+° trong một frame/);
});

test('game-animation humanoid walk: planted foot on the ground moving back, knee bends, hips lowest after contact', { skip: skipPy }, () => {
  const dir = tmpDir();
  const m = JSON.parse(py(dir, `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ART, 'game-animation', 'scripts'))})
import animate as A
an = A.load_anim(${JSON.stringify(path.join(LIB, 'humanoid', 'walk.anim.json'))})
an.frames = 16
P = A.all_poses(an)
stance = [i for i in range(16) if 0.15 < i / 16 < 0.42]
print(json.dumps({
  'ground': max(abs(P[i]['shin_front']['end'][1]) for i in stance),
  'back': all(P[a]['shin_front']['end'][0] > P[b]['shin_front']['end'][0] for a, b in zip(stance, stance[1:])),
  'knee': max(abs(p['shin_front']['angle'] - p['thigh_front']['angle']) for p in P),
  'lift': -min(p['shin_front']['end'][1] for p in P),
  'low': max(range(16), key=lambda i: P[i]['torso']['start'][1]) / 16}))`));
  assert.ok(m.ground < 1e-3, `chân đỡ nằm trên đất: ${m.ground}`);
  assert.ok(m.back, 'chân đỡ lùi đều, không trượt tới');
  assert.ok(m.knee > 20, `gối gập: ${m.knee}°`);
  assert.ok(m.lift > 0.15, `chân bước nhấc lên: ${m.lift}`);
  assert.ok(m.low < 0.2 || (m.low > 0.5 && m.low < 0.7), `hông thấp nhất ngay sau tiếp đất: ${m.low}`);
});

test('game-animation rig + tween: parts follow bones; one sprite squashes and hops; a flat spin keeps a sliver', { skip: skipPy }, () => {
  const dir = tmpDir();
  py(dir, `
import os, json
os.makedirs('parts', exist_ok=True)
def part(w, h, fill):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); ImageDraw.Draw(im).rounded_rectangle([0, 0, w - 1, h - 1], radius=min(w, h) // 3, fill=fill); return im
part(30, 46, (70, 130, 200, 255)).save('parts/torso.png'); part(36, 36, (250, 210, 170, 255)).save('parts/head.png')
names = ['torso', 'head']
for s in ('front', 'back'):
    for n, wh in (('thigh', (13, 24)), ('shin', (12, 26)), ('arm', (11, 20)), ('forearm', (10, 20))):
        part(*wh, (80, 70, 70, 255)).save(f'parts/{n}_{s}.png'); names.append(f'{n}_{s}')
json.dump({'parts': {n: {'file': f'parts/{n}.png'} for n in names}}, open('rig.json', 'w'))
part(60, 80, (200, 80, 60, 255)).save('sprite.png')`);
  let r = an(dir, 'rig', 'rig.json', '--anim', path.join(LIB, 'humanoid', 'walk.anim.json'), '--size', '96x96', '--out', 'walk.png', '--gif', 'walk.gif');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /8 frame, 10 phần/);
  const walk = JSON.parse(py(dir, `
import json
im = Image.open('walk.png'); fr = [im.crop((i*96, 0, i*96+96, 96)) for i in range(8)]
print(json.dumps({'size': im.size, 'bottom': [f.getchannel('A').getbbox()[3] for f in fr], 'same': fr[0].tobytes() == fr[2].tobytes()}))`));
  assert.deepEqual(walk.size, [768, 96]);
  assert.equal(walk.same, false, 'các frame khác nhau');
  assert.ok(Math.max(...walk.bottom) - Math.min(...walk.bottom) <= 8, `chân gần một đường: ${walk.bottom}`);
  fs.writeFileSync(path.join(dir, 'bad-rig.json'), JSON.stringify({ parts: { tentacle: { file: 'parts/head.png' } } }));
  r = an(dir, 'rig', 'bad-rig.json', '--anim', path.join(LIB, 'humanoid', 'walk.anim.json'), '--size', '64x64', '--out', 'x.png');
  assert.equal(r.code, 1);
  assert.match(r.out, /xương 'tentacle' không có/);

  r = an(dir, 'tween', 'sprite.png', '--anim', path.join(LIB, 'sprite', 'squash-hop.anim.json'), '--size', '64x96', '--out', 'hop.png');
  assert.equal(r.code, 0, r.out);
  const hop = JSON.parse(py(dir, `
import json
im = Image.open('hop.png'); print(json.dumps([im.crop((i*64, 0, i*64+64, 96)).getchannel('A').getbbox() for i in range(8)]))`));
  const bottoms = hop.map((b) => b[3]);
  assert.ok(Math.min(...bottoms) < Math.max(...bottoms) - 8, `nảy lên: ${bottoms}`);
  const widths = hop.map((b) => b[2] - b[0]);
  assert.ok(Math.max(...widths) - Math.min(...widths) > 4, `nén giãn: ${widths}`);
  r = an(dir, 'tween', 'sprite.png', '--anim', path.join(LIB, 'sprite', 'spin.anim.json'), '--size', '48x48', '--out', 'spin.png');
  assert.equal(r.code, 0, r.out);
  assert.equal(py(dir, `
im = Image.open('spin.png'); print(all(im.crop((i*48, 0, i*48+48, 48)).getchannel('A').getbbox() for i in range(8)))`), 'True', 'không frame nào biến mất');
});
