import type { WorldState } from '../contracts/world';
import type { Params } from '../core/params';

/**
 * Placeholder renderer on a plain canvas. Replace with Pixi/Phaser/Three in
 * rebuild-game; view/ reads WorldState and never changes it.
 * Colours come from the style (P3); these are neutral placeholders.
 */
const COLORS = { bg: '#14161a', player: '#4fb3ff', obstacle: '#ff6b5a', text: '#f2f2f2', dim: '#9aa0a6' };

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

  draw(w: WorldState, overlay: string | null): void {
    const { ctx, params } = this;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, params.world.width, params.world.height);
    const box = (x: number, y: number, s: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    };
    for (const o of w.obstacles) box(o.x, o.y, o.size, COLORS.obstacle);
    box(w.player.x, w.player.y, w.player.size, COLORS.player);
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
      ctx.fillText('← → hoặc chạm hai bên màn hình', params.world.width / 2, params.world.height / 2 + 32);
    }
  }
}
