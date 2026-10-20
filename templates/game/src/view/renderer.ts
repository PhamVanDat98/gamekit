import { t } from './i18n';
import { Animator, Spring, motion, stretchFromSpeed } from './anim';
import type { WorldState } from '../contracts/world';
import type { Params } from '../core/params';

/**
 * Placeholder renderer on a plain canvas. Replace with Pixi/Phaser/Three in
 * rebuild-game; view/ reads WorldState and never changes it.
 * Colours come from the style (P3); these are neutral placeholders.
 * Motion is view-only (src/view/anim, skill animate): springs and motion/*.json on top of the state.
 */
const COLORS = { bg: '#14161a', player: '#4fb3ff', obstacle: '#ff6b5a', text: '#f2f2f2', dim: '#9aa0a6' };
const DEG = Math.PI / 180;
const LEAN_DEG = 12; // lean into the direction of travel at full speed
const MAX_DT = 0.1; // a long frame (tab came back) must not fling the springs

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private player = new Animator();
  private overlayAnim = new Animator();
  // Follow-through: lean and stretch chase the speed and overshoot a little when it changes.
  private lean = new Spring(0, 0, 3, 0.35);
  private stretch = new Spring(1, 1, 5, 0.45);
  private last: { x: number; time: number; vx: number } | null = null;
  private wasOver = false;
  private lastOverlay: string | null = null;

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

  /** `dt` = real seconds since the last frame, 0 while paused. */
  draw(w: WorldState, overlay: string | null, dt = 0): void {
    const { ctx, params } = this;
    dt = Math.min(dt, MAX_DT);
    this.animate(w, overlay, dt);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, params.world.width, params.world.height);
    const box = (x: number, y: number, s: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    };
    for (const o of w.obstacles) box(o.x, o.y, o.size, COLORS.obstacle);

    // Player: pivot at the bottom centre so squash and lean happen from the feet.
    const s = w.player.size;
    const p = this.player.pose('body');
    const k = this.stretch.value; // > 1: stretched along x while moving fast
    ctx.save();
    ctx.translate(w.player.x + p.x, w.player.y + s / 2 + p.y);
    ctx.rotate((this.lean.value + p.rot) * DEG);
    ctx.scale(p.sx * k, p.sy / k);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(-s / 2, -s, s, s);
    ctx.restore();

    ctx.fillStyle = COLORS.text;
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.floor(w.score)), 16, 36);
    if (overlay) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, params.world.width, params.world.height);
      const pop = this.overlayAnim.pose('root');
      ctx.save();
      ctx.translate(params.world.width / 2, params.world.height / 2);
      ctx.scale(pop.sx, pop.sy);
      ctx.globalAlpha = pop.alpha;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.font = '600 28px system-ui, sans-serif';
      ctx.fillText(overlay, 0, 0);
      ctx.fillStyle = COLORS.dim;
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(t('game.controls'), 0, 32);
      ctx.restore();
    }
  }

  private animate(w: WorldState, overlay: string | null, dt: number): void {
    // Speed from simulated time, not frame time: frames with 0 or 2 fixed steps would jitter.
    const prev = this.last;
    if (!prev || w.time < prev.time) this.last = { x: w.player.x, time: w.time, vx: 0 }; // new round
    else if (w.time > prev.time) this.last = { x: w.player.x, time: w.time, vx: (w.player.x - prev.x) / (w.time - prev.time) };
    const vx = this.last?.vx ?? 0;
    this.lean.target = (vx / this.params.player.speed) * LEAN_DEG;
    this.stretch.target = stretchFromSpeed(vx, this.params.player.speed, 1.15);
    this.lean.update(dt);
    this.stretch.update(dt);

    if (w.over && !this.wasOver) this.player.play(motion('hit'));
    this.wasOver = w.over;
    if (overlay !== this.lastOverlay) {
      if (overlay) this.overlayAnim.play(motion('pop-in'));
      this.lastOverlay = overlay;
    }
    this.player.update(dt);
    this.overlayAnim.update(dt);
  }
}
