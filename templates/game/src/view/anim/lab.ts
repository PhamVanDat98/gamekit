/**
 * Motion lab (dev only, npm run dev → /lab.html): play motion/*.json on a rig, slow it down,
 * step frames, see onion skin and the path. Agents screenshot a fixed frame with a URL:
 *   /lab.html?m=hop&onion=1&f=20      (f = freeze at that frame, onion = ghosts, trail = path)
 * Replace PLACEHOLDER_RIG with the game's real rig (same part names as the motions use).
 * Dev tool text is not player-facing, so it does not go through t().
 */
import { MOTIONS, drawRig, motionFrames, onionSkin, poseAt, worldMatrices, type Motion, type RigPart } from './index';

const BODY_W = 80;
const BODY_H = 90;
const PLACEHOLDER_RIG: RigPart[] = [
  {
    name: 'root',
    at: [0, 0],
    pivot: [0, 0],
  },
  {
    // Pivot at the feet: squash flattens towards the ground, like a real landing.
    name: 'body',
    parent: 'root',
    at: [0, 0],
    pivot: [BODY_W / 2, BODY_H],
    draw: (ctx) => {
      ctx.fillStyle = '#4fb3ff';
      ctx.beginPath();
      ctx.roundRect(0, 0, BODY_W, BODY_H, 28);
      ctx.fill();
    },
  },
  {
    name: 'antenna',
    parent: 'body',
    at: [BODY_W / 2, 4],
    pivot: [3, 34],
    z: -1,
    draw: (ctx) => {
      ctx.fillStyle = '#4fb3ff';
      ctx.fillRect(1, 6, 4, 30);
      ctx.fillStyle = '#ffd25a';
      ctx.beginPath();
      ctx.arc(3, 5, 6, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    name: 'eyes',
    parent: 'body',
    at: [BODY_W / 2, 34],
    pivot: [22, 9],
    z: 1,
    draw: (ctx) => {
      ctx.fillStyle = '#0d0f12';
      for (const x of [6, 38]) {
        ctx.beginPath();
        ctx.ellipse(x, 9, 6, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
];

const q = new URLSearchParams(location.search);
const names = Object.keys(MOTIONS).sort();
let current: Motion | undefined = MOTIONS[q.get('m') ?? ''] ?? MOTIONS[names[0] ?? ''];
let speed = Number(q.get('speed') ?? 1);
let onion = q.get('onion') === '1';
let trail = q.get('trail') !== '0';
let frozen: number | null = q.has('f') ? Number(q.get('f')) : null;
let t = 0;

const canvas = document.getElementById('lab') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const controls = document.getElementById('controls')!;
const ORIGIN: [number, number] = [canvas.width / 2 - 20, canvas.height - 80];

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
  d.style.display = 'flex';
  d.style.gap = '6px';
  d.style.flexWrap = 'wrap';
  d.append(...els);
  return d;
}
const info = document.createElement('pre');
const fps = () => current?.fps ?? 60;
controls.append(
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
  info,
);

function drawFrame(m: Motion, sec: number, alpha: number): void {
  ctx.save();
  ctx.translate(...ORIGIN);
  ctx.globalAlpha = alpha;
  drawRig(ctx, PLACEHOLDER_RIG, poseAt(m, sec));
  ctx.restore();
}

function drawTrail(m: Motion): void {
  // Where the body's pivot travels: arcs should curve, spacing shows ease (close dots = slow).
  ctx.fillStyle = '#ffd25a';
  for (let f = 0; f <= motionFrames(m); f += 2) {
    const mat = worldMatrices(PLACEHOLDER_RIG, poseAt(m, f / (m.fps ?? 60))).body;
    if (!mat) continue;
    const x = mat[0] * (BODY_W / 2) + mat[2] * BODY_H + mat[4];
    const y = mat[1] * (BODY_W / 2) + mat[3] * BODY_H + mat[5];
    ctx.fillRect(ORIGIN[0] + x - 1.5, ORIGIN[1] + y - 1.5, 3, 3);
  }
}

function render(): void {
  for (const [b, isOn] of pressed) b.setAttribute('aria-pressed', String(isOn()));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#3a3f49';
  ctx.beginPath();
  ctx.moveTo(0, ORIGIN[1]);
  ctx.lineTo(canvas.width, ORIGIN[1]);
  ctx.stroke();
  const m = current;
  if (!m) {
    info.textContent = 'Chưa có motion/*.json';
    return;
  }
  const sec = frozen != null ? frozen / fps() : t;
  if (trail) drawTrail(m);
  if (onion) onionSkin(sec, (s, a) => drawFrame(m, s, a));
  else drawFrame(m, sec, 1);
  const total = motionFrames(m);
  info.textContent = `${m.name} · ${m.role}\nkhung ${Math.min(total, Math.round(sec * fps()))}/${total} @${fps()}${frozen != null ? ' (dừng)' : ''}\n\n${m.brief ?? ''}`;
}

let last = performance.now();
function tick(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  if (current && frozen == null) {
    t += dt * speed;
    // One-shots replay after a short pause so the end pose can be read.
    const PAUSE = 0.6;
    if (!current.loop && t > motionFrames(current) / fps() + PAUSE) t = 0;
  }
  render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
