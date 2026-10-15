import { InputState } from './core/input';
import { advance, createFixedStep } from './core/loop';
import { PARAMS } from './core/params';
import { createWorld, stepWorld } from './core/world';
import { bindInput } from './view/input-dom';
import { Renderer } from './view/renderer';
import { BUILD_ID, PauseBus, bootPlatform } from './platform';
import { installWebGuard } from './platform/web-guard';

const FIXED_HZ = 60;
const MS = 1000;

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const loader = document.getElementById('loader');
  const bar = document.getElementById('loader-bar');
  const setProgress = (p: number) => {
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    platform?.loadingProgress(p);
  };

  const bus = new PauseBus();
  let platform: Awaited<ReturnType<typeof bootPlatform>> | null = null;
  platform = await bootPlatform(bus);
  setProgress(0.5);
  installWebGuard({ bus, platform, focusEl: canvas, buildId: BUILD_ID });

  const renderer = new Renderer(canvas, PARAMS);
  const input = new InputState();
  const step = createFixedStep(FIXED_HZ);
  let world = createWorld(PARAMS, Date.now() >>> 0);
  let state: 'ready' | 'playing' | 'over' = 'ready';
  let round = 0;

  const start = async () => {
    if (state === 'playing' || bus.has('ad')) return;
    if (state === 'over') {
      // Ads only between rounds, never while the player is acting.
      await platform!.interstitial('round_end');
    }
    world = createWorld(PARAMS, Date.now() >>> 0);
    state = 'playing';
    round++;
    input.clear();
    platform!.track('level_start', { round });
    platform!.gameplayStart();
  };
  bindInput(canvas, input, () => void start());

  setProgress(1);
  loader?.remove();
  platform.loadingEnd();
  canvas.focus();

  let last = performance.now();
  const frame = (now: number) => {
    const elapsed = (now - last) / MS;
    last = now;
    if (state === 'playing' && !bus.paused) {
      const { steps } = advance(step, elapsed);
      for (let i = 0; i < steps; i++) {
        const events = stepWorld(world, PARAMS, input.frame(world.tick), step.stepSec);
        for (const e of events) {
          if (e.type === 'gameOver') {
            state = 'over';
            platform!.gameplayStop();
            platform!.track('level_fail', { round, score: e.score });
            void platform!.submitScore('main', e.score);
          }
        }
        if (state !== 'playing') break;
      }
    } else {
      step.accumulator = 0;
    }
    renderer.draw(world, state === 'ready' ? 'Chạm hoặc nhấn Space để chơi' : state === 'over' ? `Điểm: ${Math.floor(world.score)}` : bus.paused ? 'Tạm dừng' : null);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
