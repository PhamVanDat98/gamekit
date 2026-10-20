import { t } from './i18n';
import { THEME } from './theme';
import type { WorldState } from '../contracts/world';
import type { Params } from '../core/params';

/**
 * Placeholder renderer on a plain canvas. Replace with Pixi/Phaser/Three in
 * rebuild-game; view/ reads WorldState and never changes it.
 * Colours and fonts come from the style (theme.ts, P3).
 */
const { palette: C, fonts: F } = THEME;

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
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, params.world.width, params.world.height);
    const box = (x: number, y: number, s: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    };
    for (const o of w.obstacles) box(o.x, o.y, o.size, C.secondary);
    box(w.player.x, w.player.y, w.player.size, C.primary);
    ctx.fillStyle = C.text;
    ctx.font = `600 24px ${F.display}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.floor(w.score)), 16, 36);
    if (overlay) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, params.world.width, params.world.height);
      ctx.fillStyle = C.text;
      ctx.textAlign = 'center';
      const max = params.world.width - 32;
      fitFont(ctx, overlay, `600 {size}px ${F.display}`, 28, max);
      ctx.fillText(overlay, params.world.width / 2, params.world.height / 2);
      ctx.fillStyle = C.muted;
      const controls = t('game.controls');
      fitFont(ctx, controls, `{size}px ${F.body}`, 16, max);
      ctx.fillText(controls, params.world.width / 2, params.world.height / 2 + 32);
    }
  }
}

/** Translations often run longer than English: shrink the font until the line fits `max` px. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, font: string, size: number, max: number): void {
  let px = size;
  ctx.font = font.replace('{size}', String(px));
  while (px > 10 && ctx.measureText(text).width > max) ctx.font = font.replace('{size}', String(--px));
}
