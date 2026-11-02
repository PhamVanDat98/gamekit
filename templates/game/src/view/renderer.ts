import { t } from './i18n';
import type { WorldState } from '../contracts/world';
import type { Params } from '../core/params';

/**
 * Placeholder renderer on a plain canvas. Replace with Pixi/Phaser/Three in
 * rebuild-game; view/ reads WorldState and never changes it.
 * Colours come from the style (P3); these are neutral placeholders.
 */
const COLORS = { bg: '#14161a', player: '#4fb3ff', obstacle: '#ff6b5a', text: '#f2f2f2', dim: '#9aa0a6' };

/** Entity positions at one tick; draw() blends from these to the current ones. */
export interface Positions {
  readonly player: { readonly x: number; readonly y: number };
  readonly obstacles: ReadonlyMap<number, { readonly x: number; readonly y: number }>;
}

export function capturePositions(w: WorldState): Positions {
  return {
    player: { x: w.player.x, y: w.player.y },
    obstacles: new Map(w.obstacles.map((o) => [o.id, { x: o.x, y: o.y }])),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private params: Params,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    canvas.width = params.world.width;
    canvas.height = params.world.height;
  }

  /** `prev` + `alpha` (0..1) interpolate between the previous and current tick; defaults draw the current state. */
  draw(w: WorldState, overlay: string | null, alpha = 1, prev: Positions | null = null): void {
    const { ctx, params } = this;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, params.world.width, params.world.height);
    const box = (x: number, y: number, s: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    };
    for (const o of w.obstacles) {
      const p = prev?.obstacles.get(o.id); // a new obstacle has no previous position
      box(p ? lerp(p.x, o.x, alpha) : o.x, p ? lerp(p.y, o.y, alpha) : o.y, o.size, COLORS.obstacle);
    }
    const pp = prev?.player;
    box(pp ? lerp(pp.x, w.player.x, alpha) : w.player.x, pp ? lerp(pp.y, w.player.y, alpha) : w.player.y, w.player.size, COLORS.player);
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.floor(w.score)), 16, 36);
    if (overlay) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, params.world.width, params.world.height);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.font = '600 28px system-ui, sans-serif';
      ctx.fillText(overlay, params.world.width / 2, params.world.height / 2);
      ctx.fillStyle = COLORS.dim;
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(t('game.controls'), params.world.width / 2, params.world.height / 2 + 32);
    }
  }
}
