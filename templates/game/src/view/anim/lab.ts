/**
 * Motion lab (dev only, npm run dev → /lab.html).
 *   Xem: play one motion/*.json, slow it down, step frames, onion skin, path of the body.
 *        Fixed frames for screenshots: /lab.html?m=hop&onion=1&f=20
 *   Chơi thử: the sample character driven by keys/touch — idle loop, walk while ←/→ is held,
 *        one-shots on top, with the game-feel layer a renderer adds (flash, shake, dust): /lab.html?play=1
 *   Xuất frame: bake the motion into one PNG per frame → art/frames/<name>/ (dev server writes them).
 *   Ảnh từng khung: play art/frames/<name>/ (drawn/ if redrawn by `gamekit frames --codex`, else the
 *        baked poses) with a contact sheet under it: /lab.html?frames=hop
 * Swap SAMPLE_RIG for the game's real rig (same part names as the motions).
 * Dev tool text is not player-facing, so it does not go through t().
 */
import { Animator, MOTIONS, Spring, drawRig, motionFrames, onionSkin, poseAt, worldMatrices, type Motion, type Poses, type RigPart } from './index';
import { SAMPLE_RIG, SAMPLE_SHADOW } from './sample-rig';
import { bakeMotion } from './bake';
import { FrameAnim, frameIndex, loadFrameAnim, type FrameMeta } from './frames';

const RIG: RigPart[] = SAMPLE_RIG;
const WALK_SPEED = 63; // px/s: one stride of the walk cycle per step, so the feet do not slide
const FLASH = { hit: [0, 3], attack: [0, 24] } as const; // frames: white flash on hit, red blinking telegraph
const SHAKE_AT: Record<string, [number, number]> = { hit: [0, 0.45], attack: [38, 0.55], hop: [34, 0.25], celebrate: [30, 0.2], surprise: [9, 0.15] };
const DUST_AT: Record<string, number> = { hop: 34, celebrate: 30, surprise: 34 };
const KEYS: Record<string, string> = { ' ': 'hop', a: 'attack', h: 'hit', c: 'celebrate', s: 'surprise' };

const q = new URLSearchParams(location.search);
const names = Object.keys(MOTIONS).sort();
let mode: 'view' | 'play' | 'frames' = q.get('play') === '1' ? 'play' : q.has('frames') ? 'frames' : 'view';
let current: Motion | undefined = MOTIONS[q.get('m') ?? ''] ?? MOTIONS['hop'] ?? MOTIONS[names[0] ?? ''];
let speed = Number(q.get('speed') ?? 1);
let onion = q.get('onion') === '1';
let trail = q.get('trail') !== '0';
let frozen: number | null = q.has('f') ? Number(q.get('f')) : null;
let t = 0;

const canvas = document.getElementById('lab') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const controls = document.getElementById('controls')!;
const GROUND = canvas.height - 70;
// The character is drawn on its own layer so flashes tint only the character.
const layer = document.createElement('canvas');
layer.width = canvas.width;
layer.height = canvas.height;
const lctx = layer.getContext('2d')!;

// ---------- play mode state ----------
const anim = new Animator();
const idle = MOTIONS['idle'] ?? null;
const walk = MOTIONS['walk'] ?? null;
anim.loop(idle);
const held = new Set<string>();
let x = canvas.width / 2;
let facing = 1;
let walking = false;
const lean = new Spring(0, 0, 3, 0.5);
let trauma = 0;
let lastShot: { name: string; frame: number } | null = null;
const dust: { x: number; y: number; vx: number; vy: number; life: number }[] = [];

// ---------- frame-by-frame state ----------
const FRAME_METAS = Object.fromEntries(
  Object.entries(import.meta.glob<FrameMeta>('../../../art/frames/*/meta.json', { eager: true, import: 'default' })).map(([, m]) => [m.name, m]),
);
const FRAME_URLS = import.meta.glob<string>('../../../art/frames/*/**/*.png', { eager: true, query: '?url', import: 'default' });
const urlOf = (name: string, file: string) => FRAME_URLS[`../../../art/frames/${name}/${file}`];
let bakeFps = Number(q.get('fps') ?? 24);
let framesName = q.get('frames') || Object.keys(FRAME_METAS).sort()[0] || '';
let framesAnim: FrameAnim | null = null;
let framesDrawn = false;
let framesT = 0;
// Writing art/frames/ makes Vite reload this page (it globs that folder): keep the message across it.
const NOTE_KEY = 'gk-lab-bake-note';
let bakeNote = '';
try {
  bakeNote = sessionStorage.getItem(NOTE_KEY) ?? '';
  sessionStorage.removeItem(NOTE_KEY);
} catch {
  // storage blocked: the message only lasts until the reload
}

async function openFrames(name: string): Promise<void> {
  framesName = name;
  framesAnim = null;
  const meta = FRAME_METAS[name];
  if (!meta) return;
  // Redrawn frames win when every one of them exists.
  framesDrawn = meta.frames.every((f) => urlOf(name, `drawn/${f.file.replace('pose-', '')}`));
  framesAnim = await loadFrameAnim(meta, (file) => urlOf(name, framesDrawn ? `drawn/${file.replace('pose-', '')}` : file));
  framesT = 0;
}

async function bakeCurrent(): Promise<void> {
  if (!current) return;
  const { meta, frames } = bakeMotion(RIG, current, { fps: bakeFps });
  bakeNote = `Đang ghi ${frames.length} khung…`;
  const res = await fetch('/__gk/bake', { method: 'POST', body: JSON.stringify({ meta, images: frames.map((c) => c.toDataURL('image/png')) }) });
  bakeNote = res.ok
    ? `Đã ghi ${frames.length} khung ${meta.width}×${meta.height} @${bakeFps} vào art/frames/${meta.name}/. Tiếp: npm run gk -- frames ${meta.name}`
    : `Lỗi ghi: ${await res.text()} (chỉ chạy khi npm run dev)`;
  try {
    sessionStorage.setItem(NOTE_KEY, bakeNote);
  } catch {
    // shown below until the reload
  }
  render();
}

function trigger(name: string): void {
  const m = MOTIONS[name];
  if (m) anim.play(m);
}

// ---------- controls ----------
const pressed = new Map<HTMLButtonElement, () => boolean>();
function button(label: string, onClick: () => void, isOn?: () => boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    onClick();
    render();
  };
  if (isOn) pressed.set(b, isOn);
  return b;
}
function row(...els: HTMLElement[]): HTMLElement {
  const d = document.createElement('div');
  d.className = 'row';
  d.append(...els);
  return d;
}
/** Touch-friendly hold button for walking. */
function holdButton(label: string, key: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  const on = (e: Event) => (e.preventDefault(), held.add(key));
  const off = () => held.delete(key);
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
  return b;
}
const info = document.createElement('pre');
const fps = () => current?.fps ?? 60;
const group = () => Object.assign(document.createElement('div'), { className: 'group' });
const viewControls = group();
const playControls = group();
viewControls.append(
  row(...names.map((n) => button(n, () => ((current = MOTIONS[n]), (t = 0), (frozen = null)), () => current?.name === n))),
  row(
    button('1×', () => (speed = 1), () => speed === 1),
    button('0.25×', () => (speed = 0.25), () => speed === 0.25),
    button('onion', () => (onion = !onion), () => onion),
    button('đường đi', () => (trail = !trail), () => trail),
  ),
  row(
    button('⏯', () => (frozen = frozen == null ? Math.round(t * fps()) : null)),
    button('◀ khung', () => (frozen = Math.max(0, (frozen ?? Math.round(t * fps())) - 1))),
    button('khung ▶', () => (frozen = (frozen ?? Math.round(t * fps())) + 1)),
    button('↺', () => ((t = 0), (frozen = null))),
  ),
  row(
    ...[12, 24, 30].map((n) => button(`${n} fps`, () => (bakeFps = n), () => bakeFps === n)),
    button('Xuất frame', () => void bakeCurrent()),
  ),
);
const framesControls = group();
framesControls.append(
  row(...Object.keys(FRAME_METAS).sort().map((n) => button(n, () => void openFrames(n), () => framesName === n))),
);
playControls.append(
  row(holdButton('◀ đi', 'ArrowLeft'), holdButton('đi ▶', 'ArrowRight')),
  row(...Object.entries(KEYS).map(([k, n]) => button(`${n} (${k === ' ' ? 'Space' : k.toUpperCase()})`, () => trigger(n)))),
);
controls.append(
  row(
    button('Xem từng chuyển động', () => (mode = 'view'), () => mode === 'view'),
    button('Chơi thử', () => (mode = 'play'), () => mode === 'play'),
    button('Ảnh từng khung', () => (mode = 'frames'), () => mode === 'frames'),
  ),
  viewControls,
  playControls,
  framesControls,
  info,
);

addEventListener('keydown', (e) => {
  if (mode !== 'play') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') held.add(e.key);
  const name = KEYS[e.key.toLowerCase()];
  if (name && !e.repeat) trigger(name);
  if (name || e.key.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.key));
addEventListener('blur', () => held.clear());

// ---------- drawing ----------
function drawShadow(cx: number, poses: Poses): void {
  // Secondary action from code: the shadow shrinks and fades as the body leaves the ground.
  const lift = Math.max(0, -(poses.body?.y ?? 0) - (poses.root?.y ?? 0));
  const k = Math.max(0.45, 1 - lift / 220);
  ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`;
  ctx.beginPath();
  ctx.ellipse(cx, GROUND + 2, (SAMPLE_SHADOW / 2) * k * (poses.root?.sx ?? 1), 7 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCharacter(cx: number, poses: Poses, alpha = 1, opts: { dir?: number; rot?: number; tint?: string } = {}): void {
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(0, 0, layer.width, layer.height);
  lctx.translate(cx, GROUND);
  lctx.scale(opts.dir ?? 1, 1);
  lctx.rotate(((opts.rot ?? 0) * Math.PI) / 180);
  drawRig(lctx, RIG, poses);
  if (opts.tint) {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-atop';
    lctx.fillStyle = opts.tint;
    lctx.fillRect(0, 0, layer.width, layer.height);
    lctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = 1;
}

function drawGround(offset = 0): void {
  ctx.strokeStyle = '#3a3f49';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(canvas.width, GROUND);
  ctx.stroke();
  ctx.fillStyle = '#2a2e36';
  const GAP = 40;
  for (let gx = -GAP + (((offset % GAP) + GAP) % GAP); gx < canvas.width; gx += GAP) ctx.fillRect(gx, GROUND + 10, 14, 3);
}

function drawTrail(m: Motion, cx: number): void {
  // Where the head's neck pivot travels: arcs should curve, spacing shows ease (close dots = slow).
  ctx.fillStyle = '#ffd25a';
  for (let f = 0; f <= motionFrames(m); f += 2) {
    const mat = worldMatrices(RIG, poseAt(m, f / (m.fps ?? 60))).head;
    if (!mat) continue;
    const head = RIG.find((p) => p.name === 'head')!;
    const px = mat[0] * head.pivot[0] + mat[2] * head.pivot[1] + mat[4];
    const py = mat[1] * head.pivot[0] + mat[3] * head.pivot[1] + mat[5];
    ctx.fillRect(cx + px - 1.5, GROUND + py - 1.5, 3, 3);
  }
}

function renderView(): void {
  const m = current;
  drawGround();
  if (!m) {
    info.textContent = 'Chưa có motion/*.json';
    return;
  }
  const cx = canvas.width / 2;
  const sec = frozen != null ? frozen / fps() : t;
  drawShadow(cx, poseAt(m, sec));
  if (trail) drawTrail(m, cx);
  if (onion) onionSkin(sec, (s, a) => drawCharacter(cx, poseAt(m, s), a));
  else drawCharacter(cx, poseAt(m, sec));
  const total = motionFrames(m);
  info.textContent = `${m.name} · ${m.role}\nkhung ${Math.min(total, Math.round(sec * fps()))}/${total} @${fps()}${frozen != null ? ' (dừng)' : ''}${bakeNote ? `\n\n${bakeNote}` : ''}\n\n${m.brief ?? ''}`;
}

function renderPlay(): void {
  const shake = trauma * trauma;
  const MAX_SHAKE = 10;
  const now = performance.now() / 1000;
  ctx.save();
  ctx.translate(Math.sin(now * 61) * shake * MAX_SHAKE, Math.cos(now * 47) * shake * MAX_SHAKE);
  drawGround(-x);
  const poses = anim.all;
  // The world scrolls under the character; wrap so it never walks off the lab.
  const cx = canvas.width / 2;
  drawShadow(cx, poses);
  const playing = anim.playing;
  const f = anim.frame;
  let tint: string | undefined;
  if (playing === 'hit' && f >= FLASH.hit[0] && f < FLASH.hit[1]) tint = 'rgba(255,255,255,0.9)';
  if (playing === 'attack' && f < FLASH.attack[1] && Math.floor(f / 4) % 2 === 0) tint = 'rgba(255,70,70,0.45)';
  drawCharacter(cx, poses, 1, { dir: facing, rot: lean.value * facing, tint });
  ctx.fillStyle = '#e8d8bd';
  for (const d of dust) {
    ctx.globalAlpha = Math.max(0, d.life);
    ctx.beginPath();
    ctx.arc(cx + d.x, GROUND + d.y, 3 + (1 - d.life) * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  info.textContent = `Chơi thử: giữ ←/→ để đi · Space nhảy · A đòn đánh (telegraph) · H bị đánh · C mừng · S giật mình\n\nđang chạy: ${walking ? 'walk' : 'idle'}${playing ? ` + ${playing} (khung ${Math.floor(f)})` : ''}`;
}

function renderFrames(): void {
  drawGround();
  const meta = FRAME_METAS[framesName];
  if (!meta) {
    info.textContent = 'Chưa có art/frames/*. Sang "Xem từng chuyển động", chọn motion rồi bấm "Xuất frame".';
    return;
  }
  if (!framesAnim) {
    info.textContent = `Đang tải ${framesName}…`;
    return;
  }
  const cx = canvas.width / 2;
  const fixed = q.has('i') ? Number(q.get('i')) : null;
  const sec = framesT;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, GROUND + 2, SAMPLE_SHADOW / 2, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const idx = fixed ?? frameIndex(meta, sec);
  framesAnim.drawFrame(ctx, idx, cx, GROUND);
  // Contact sheet: every frame side by side — the drawings must not wobble (same size, same anchor).
  const n = meta.frames.length;
  const cell = Math.min(56, (canvas.width - 8) / n);
  const k = Math.min(cell / meta.width, 48 / meta.height);
  for (let i = 0; i < n; i++) {
    const x0 = 4 + i * cell;
    ctx.fillStyle = i === idx ? '#4fb3ff33' : '#00000022';
    ctx.fillRect(x0, 4, cell - 2, 52);
    ctx.save();
    ctx.translate(x0 + (cell - 2) / 2, 4 + 50);
    ctx.scale(k, k);
    framesAnim.drawFrame(ctx, i, 0, 0);
    ctx.restore();
  }
  info.textContent = `${meta.name}: ${n} ảnh ${meta.width}×${meta.height} @${meta.fps} fps · ${framesDrawn ? 'ảnh vẽ lại (drawn/)' : 'pose đã xuất (chưa vẽ lại)'}\nkhung ${idx + 1}/${n}`;
}

function render(): void {
  for (const [b, isOn] of pressed) b.setAttribute('aria-pressed', String(isOn()));
  viewControls.hidden = mode !== 'view';
  playControls.hidden = mode !== 'play';
  framesControls.hidden = mode !== 'frames';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mode === 'view') renderView();
  else if (mode === 'frames') renderFrames();
  else renderPlay();
}

function updatePlay(dt: number): void {
  const dir = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  if (dir) facing = dir;
  const nowWalking = dir !== 0 && !anim.playing;
  if (nowWalking !== walking) {
    walking = nowWalking;
    anim.loop(walking ? walk : idle);
  }
  if (walking) x += dir * WALK_SPEED * dt;
  lean.target = walking ? 4 : 0; // a little forward lean while walking
  lean.update(dt);

  // Effects keyed to frames of the one-shot that is playing.
  const name = anim.playing;
  const f = anim.frame;
  if (name) {
    const before = lastShot?.name === name ? lastShot.frame : -1;
    const shake = SHAKE_AT[name];
    if (shake && before < shake[0] && f >= shake[0]) trauma = Math.min(1, trauma + shake[1]);
    const landAt = DUST_AT[name];
    if (landAt != null && before < landAt && f >= landAt)
      for (let i = 0; i < 8; i++) dust.push({ x: (i < 4 ? -1 : 1) * (18 + i * 3), y: 0, vx: (i < 4 ? -1 : 1) * (40 + i * 12), vy: -30 - i * 6, life: 1 });
  }
  lastShot = name ? { name, frame: f } : null;
  anim.update(dt);
  trauma = Math.max(0, trauma - dt * 1.6);
  for (const d of dust) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vx *= 0.9;
    d.vy += 120 * dt;
    d.y = Math.min(0, d.y);
    d.life -= dt * 2;
  }
  for (let i = dust.length - 1; i >= 0; i--) if (dust[i]!.life <= 0) dust.splice(i, 1);
}

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'play') updatePlay(dt);
  else if (mode === 'frames') framesT += dt;
  else if (current && frozen == null) {
    t += dt * speed;
    // One-shots replay after a short pause so the end pose can be read.
    const PAUSE = 0.6;
    if (!current.loop && t > motionFrames(current) / fps() + PAUSE) t = 0;
  }
  render();
  requestAnimationFrame(tick);
}
if (framesName) void openFrames(framesName);
requestAnimationFrame(tick);
