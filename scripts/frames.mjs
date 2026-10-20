// gamekit frames <name> — frame-by-frame art from a baked motion: prompts per frame, redraw each
// frame with Codex (--codex), check the drawings (--check), install them into assets/ (--install).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists, readJson, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { pngInfo } from './lib/png.mjs';
import { analyzeMotion } from './lib/motion.mjs';
import { run as provenance } from './provenance.mjs';

export const FRAMES_DIR = 'art/frames';
export const DEFAULT_REF = 'art/character.png';
const INSTALL_DIR = 'assets/img/anim';

/** pose-03.png → drawn/03.png: what the image model writes for that frame. */
export const drawnFile = (file) => `drawn/${file.replace(/^pose-/, '')}`;

/** Which part of the motion a frame is in, so the image model knows how to draw it. */
export function beatAt(motion, at) {
  if (!motion || at == null) return 'pose';
  if (motion.loop) return 'cycle (loops: keep it consistent with its neighbours)';
  const { info } = analyzeMotion(motion);
  if (!info.main) return 'hold';
  if (info.anticipation && at >= info.anticipation.from && at < info.anticipation.to) return 'anticipation (wind-up: the pose leans away from the action)';
  if (at >= info.main.from && at <= info.main.to) return 'action (the fastest frames)';
  if (info.followUntil != null && at > info.main.to && at <= info.followUntil) return 'follow-through (overshoot and settle; loose parts still move)';
  return at < info.main.from ? 'rest before the action' : 'rest';
}

export function framePrompt({ meta, motion, i, ref, style }) {
  const f = meta.frames[i];
  const dir = `${FRAMES_DIR}/${meta.name}`;
  const beat = beatAt(motion, f.at);
  const [ax, ay] = meta.anchor;
  return [
    `Use your image generation tool to draw ONE frame of a 2D game animation, then save it as a PNG file at: ${dir}/${drawnFile(f.file)}`,
    '',
    'Attached images:',
    `1. ${ref} — the character reference. Keep exactly this character: design, proportions, colours, line weight, eyes.`,
    `2. ${dir}/${f.file} — the pose guide: frame ${i + 1} of ${meta.frames.length} of the "${meta.name}" animation${motion ? ` (${motion.role})` : ''}, ${meta.fps} fps.`,
    '',
    'Rules:',
    '- Copy the pose guide exactly: silhouette, angle of every body part, squash and stretch, size and position inside the canvas. Do not change the timing, do not add or remove parts.',
    `- The ground point under the feet is at x=${ax}, y=${ay} px of the canvas and must stay exactly there in every frame.`,
    `- Redraw it as clean hand-drawn 2D game art in the style of the reference${style ? `: ${style}` : ''}.`,
    `- Output exactly ${meta.width}×${meta.height} px, transparent background: no shadow, no ground, no text, no extra objects. If the generator returns another size, scale and pad the result to ${meta.width}×${meta.height} keeping the ground point at (${ax}, ${ay}) (for example with a short Python/Pillow script).`,
    `- Beat of this frame: ${beat}.${beat.startsWith('action') ? ' You may smear the moving parts along the direction of motion for this one frame, keeping the silhouette of the pose guide.' : ''}`,
    `- Only create ${dir}/${drawnFile(f.file)}; do not change any other file.`,
    ...(motion?.brief ? ['', `Animation brief: ${motion.brief}`] : []),
  ].join('\n');
}

export function loadFrames(root, name) {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new GkError('Dùng: gamekit frames <tên-motion> [--codex] [--check] [--install] [--ref ảnh] [--style "…"]');
  const dir = path.join(root, FRAMES_DIR, name);
  const metaFile = path.join(dir, 'meta.json');
  if (!exists(metaFile)) throw new GkError(`Chưa có ${FRAMES_DIR}/${name}/meta.json — npm run dev → /lab.html, chọn "${name}", bấm "Xuất frame"`);
  const meta = readJson(metaFile);
  const motionFile = meta.motion ? path.join(root, meta.motion) : null;
  const motion = motionFile && exists(motionFile) ? readJson(motionFile) : null;
  return { dir, meta, motion };
}

/** Problems with the redrawn frames (missing, wrong size, no alpha). Empty = ready to install. */
export function checkDrawn(dir, meta) {
  const problems = [];
  for (const f of meta.frames) {
    const rel = drawnFile(f.file);
    const file = path.join(dir, rel);
    if (!exists(file)) {
      problems.push(`${rel}: chưa có`);
      continue;
    }
    const info = pngInfo(file);
    if (!info) problems.push(`${rel}: không phải PNG`);
    else if (info.width !== meta.width || info.height !== meta.height) problems.push(`${rel}: ${info.width}×${info.height}, cần ${meta.width}×${meta.height} (anchor lệch → nhân vật rung)`);
    else if (info.alpha === false) problems.push(`${rel}: không có nền trong suốt`);
  }
  return problems;
}

function runCodex(root, { dir, meta, motion }, args) {
  const ref = args.ref ? String(args.ref) : DEFAULT_REF;
  if (!exists(path.join(root, ref)))
    throw new GkError(`Không có ảnh nhân vật tham chiếu ${ref}. Tạo trước (vd: codex exec "Tạo ảnh nhân vật … nền trong suốt, lưu ${DEFAULT_REF}") hoặc dùng --ref ${FRAMES_DIR}/${meta.name}/${meta.frames[0].file}`);
  const bin = process.env.GK_CODEX ?? 'codex';
  let drawn = 0;
  for (let i = 0; i < meta.frames.length; i++) {
    const f = meta.frames[i];
    const out = path.join(dir, drawnFile(f.file));
    if (exists(out)) continue; // delete a bad drawing and run again to redo just that frame
    fs.mkdirSync(path.dirname(out), { recursive: true });
    log.info(`Codex vẽ khung ${i + 1}/${meta.frames.length} → ${FRAMES_DIR}/${meta.name}/${drawnFile(f.file)}`);
    const prompt = framePrompt({ meta, motion, i, ref, style: args.style });
    const r = spawnSync(bin, ['exec', '--sandbox', 'workspace-write', '--image', ref, '--image', `${FRAMES_DIR}/${meta.name}/${f.file}`, prompt], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.error?.code === 'ENOENT') throw new GkError('Không tìm thấy codex. Cài: npm i -g @openai/codex rồi codex login');
    if (r.status !== 0 || !exists(out)) throw new GkError(`Codex không tạo được ${drawnFile(f.file)} (mã ${r.status}). Đã vẽ ${drawn} khung; chạy lại để tiếp tục từ khung này.`);
    drawn++;
  }
  return drawn;
}

function install(root, { dir, meta }) {
  const dest = path.join(root, INSTALL_DIR, meta.name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const frames = meta.frames.map((f) => {
    const file = path.basename(drawnFile(f.file));
    fs.copyFileSync(path.join(dir, drawnFile(f.file)), path.join(dest, file));
    return { ...f, file };
  });
  writeJson(path.join(dest, 'meta.json'), { ...meta, frames });
  return `${INSTALL_DIR}/${meta.name}`;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const frames = loadFrames(root, args._[0]);
  const { dir, meta, motion } = frames;
  const ref = args.ref ? String(args.ref) : DEFAULT_REF;
  const prompts = meta.frames.map((_, i) => `## Khung ${i + 1}/${meta.frames.length}\n\n${framePrompt({ meta, motion, i, ref, style: args.style })}\n`);
  fs.writeFileSync(path.join(dir, 'prompts.md'), `# ${meta.name}: prompt từng khung\n\n${prompts.join('\n')}`);
  log.head(`${meta.name}: ${meta.frames.length} khung ${meta.width}×${meta.height} @${meta.fps} fps`);
  log.ok(`Prompt từng khung: ${FRAMES_DIR}/${meta.name}/prompts.md`);

  if (args.codex) log.ok(`Codex đã vẽ ${runCodex(root, frames, args)} khung mới`);
  if (!args.codex && !args.check && !args.install) {
    log.info(`Tiếp: gamekit frames ${meta.name} --codex [--ref ${DEFAULT_REF}] [--style "…"] → ${FRAMES_DIR}/${meta.name}/drawn/, rồi xem ở /lab.html?frames=${meta.name}`);
    return 0;
  }
  const problems = checkDrawn(dir, meta);
  for (const p of problems) log.fail(p);
  if (problems.length) {
    log.fail(`${problems.length}/${meta.frames.length} khung chưa đạt. Xoá khung hỏng rồi chạy lại --codex để vẽ lại riêng khung đó.`);
    return 1;
  }
  log.ok(`${meta.frames.length} khung đúng kích thước, nền trong suốt — xem chạy thử: /lab.html?frames=${meta.name}`);
  if (args.install) {
    const rel = install(root, frames);
    await provenance({ cwd: root, _: ['add', rel], label: 'generated', source: `${FRAMES_DIR}/${meta.name} (${meta.motion ?? 'motion'})`, note: 'vẽ lại từng khung theo pose đã xuất' });
    log.ok(`Đã cài vào ${rel}/ (meta.json + ${meta.frames.length} ảnh); phát bằng FrameAnim (src/view/anim/frames.ts)`);
  }
  return 0;
}
