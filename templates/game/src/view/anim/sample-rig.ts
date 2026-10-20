import type { RigPart } from './rig';

/**
 * "Mochi" — a sample cut-out character drawn in code (vector), facing right, origin on the ground
 * under the feet. 12 parts with pivots on the joints, like a rig built from AI-made parts would be.
 * The motions in motion/*.json key these part names. Replace with the game's real rig.
 */
const INK = '#3b2a20';
const FUR = '#fff1d6';
const FUR_BACK = '#ead6b4'; // far-side limbs are darker: depth without shading the art
const PATCH = '#f5a25d';
const PINK = '#ff9fae';

const BODY_W = 60;
const BODY_H = 50;
const LEG = 16;
const HEAD_W = 84;
const HEAD_H = 70;

function shape(ctx: CanvasRenderingContext2D, fill: string, path: (ctx: CanvasRenderingContext2D) => void, line = 3): void {
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

const leg = (fill: string) => (ctx: CanvasRenderingContext2D) => {
  // Drawn 6px into the body (hidden behind it) so the hip never shows a gap when it rotates.
  shape(ctx, fill, (c) => c.roundRect(0, 0, 12, LEG + 4, 6));
  shape(ctx, fill, (c) => c.ellipse(8, LEG + 5, 9, 5.5, 0, 0, Math.PI * 2));
};

const arm = (fill: string) => (ctx: CanvasRenderingContext2D) => {
  shape(ctx, fill, (c) => c.roundRect(0, 0, 12, 26, 6));
  shape(ctx, fill, (c) => c.arc(6, 25, 7.5, 0, Math.PI * 2));
};

const ear = (inner: boolean) => (ctx: CanvasRenderingContext2D) => {
  shape(ctx, inner ? FUR : FUR_BACK, (c) => {
    c.moveTo(0, 28);
    c.quadraticCurveTo(2, 4, 12, 0);
    c.quadraticCurveTo(22, 6, 24, 28);
    c.closePath();
  });
  if (inner) {
    ctx.beginPath();
    ctx.moveTo(6, 24);
    ctx.quadraticCurveTo(8, 10, 12, 7);
    ctx.quadraticCurveTo(17, 11, 18, 24);
    ctx.closePath();
    ctx.fillStyle = PINK;
    ctx.fill();
  }
};

export const SAMPLE_RIG: RigPart[] = [
  { name: 'root', at: [0, 0], pivot: [0, 0] },
  {
    // Pivot at the feet (below the body drawing): squash flattens towards the ground and the legs come along.
    name: 'body',
    parent: 'root',
    at: [0, 0],
    pivot: [BODY_W / 2, BODY_H + LEG],
    draw: (ctx) => {
      shape(ctx, FUR, (c) => c.roundRect(0, 0, BODY_W, BODY_H, [20, 22, 22, 22]));
      ctx.beginPath();
      ctx.ellipse(BODY_W / 2 + 6, BODY_H / 2 + 6, 17, 15, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(10, 14, 9, 7, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = PATCH;
      ctx.fill();
    },
  },
  {
    name: 'tail',
    parent: 'body',
    at: [6, BODY_H - 14],
    pivot: [30, 30],
    z: -3,
    draw: (ctx) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 15;
      const curve = () => {
        ctx.beginPath();
        ctx.moveTo(30, 30);
        ctx.quadraticCurveTo(4, 30, 6, 4);
      };
      curve();
      ctx.stroke();
      ctx.strokeStyle = PATCH;
      ctx.lineWidth = 9;
      curve();
      ctx.stroke();
    },
  },
  { name: 'legL', parent: 'body', at: [BODY_W / 2 - 13, BODY_H - 6], pivot: [6, 0], z: -2, draw: leg(FUR_BACK) },
  { name: 'legR', parent: 'body', at: [BODY_W / 2 + 7, BODY_H - 6], pivot: [6, 0], z: -1, draw: leg(FUR) },
  { name: 'armL', parent: 'body', at: [BODY_W / 2 - 8, 12], pivot: [6, 4], z: -2, draw: arm(FUR_BACK) },
  { name: 'armR', parent: 'body', at: [BODY_W / 2 + 12, 14], pivot: [6, 4], z: 5, draw: arm(FUR) },
  {
    // Pivot at the neck: nods and drags turn around it.
    name: 'head',
    parent: 'body',
    at: [BODY_W / 2 + 4, 8],
    pivot: [HEAD_W / 2 - 4, HEAD_H - 4],
    z: 2,
    draw: (ctx) => {
      shape(ctx, FUR, (c) => c.ellipse(HEAD_W / 2, HEAD_H / 2 + 2, HEAD_W / 2, HEAD_H / 2 - 2, 0, 0, Math.PI * 2));
      ctx.beginPath();
      ctx.ellipse(22, 22, 13, 10, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = PATCH;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,120,140,0.45)';
      for (const [x, y] of [[44, 50], [76, 48]] as const) {
        ctx.beginPath();
        ctx.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  { name: 'earL', parent: 'head', at: [22, 12], pivot: [12, 26], z: 1, draw: ear(false) },
  { name: 'earR', parent: 'head', at: [56, 8], pivot: [12, 26], z: 1.5, draw: ear(true) },
  {
    name: 'eyes',
    parent: 'head',
    at: [60, 34],
    pivot: [16, 10],
    z: 3,
    draw: (ctx) => {
      for (const [x, rx, ry] of [[4, 5, 8], [26, 6.5, 10]] as const) {
        ctx.beginPath();
        ctx.ellipse(x, 10, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + rx * 0.35, 10 - ry * 0.4, rx * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    },
  },
  {
    // A small D-shaped smile; mouth.sy > 1 opens it (shout, surprise).
    name: 'mouth',
    parent: 'head',
    at: [70, 52],
    pivot: [6, 0],
    z: 3,
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 0);
      ctx.quadraticCurveTo(6, 9, 0, 0);
      ctx.closePath();
      ctx.fillStyle = '#9b2f3a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    },
  },
];

/** Ground shadow width at rest (px); the lab shrinks it as the body rises. */
export const SAMPLE_SHADOW = 78;
