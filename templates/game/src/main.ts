import './view/style.css';
import { InputState } from './core/input';
import { advance, createFixedStep } from './core/loop';
import { PARAMS } from './core/params';
import { createWorld, stepWorld } from './core/world';
import { t } from './view/i18n';
import { bindInput } from './view/input-dom';
import { Renderer } from './view/renderer';
import { mountSettings } from './view/settings';
import { BUILD_ID, PauseBus, bootPlatform } from './platform';
import { installWebGuard } from './platform/web-guard';

const FIXED_HZ = 60;
const MS = 1000;
/** After game over, taps are ignored this long so a tap meant for the dying round never restarts it and opens an ad. */
const RESTART_DELAY_MS = 600;

/** The portal shell page has no game markup (npm run dev's index.html does): create it when missing. */
function ensureStage(): { stage: HTMLElement; canvas: HTMLCanvasElement } {
  let canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) {
    const stage = document.createElement('main');
    stage.id = 'stage';
    canvas = document.createElement('canvas');
    canvas.id = 'game';
    canvas.tabIndex = 0;
    stage.append(canvas);
    document.body.append(stage);
  }
  return { stage: canvas.parentElement ?? document.body, canvas };
}

async function main(): Promise<void> {
  // npm run dev has no portal loader.js; dropped from builds (import.meta.env.DEV is false there).
  if (import.meta.env.DEV) (await import('./platform/dev-loader')).installDevLoader();
  const { stage, canvas } = ensureStage();
  const devLoader = document.getElementById('loader'); // only in index.html for npm run dev

  const bus = new PauseBus();
  const platform = await bootPlatform(bus);
  platform.loadingProgress(0.5);
  installWebGuard({ bus, platform, focusEl: canvas, buildId: BUILD_ID });
  mountSettings(stage, {
    copyright: platform.info.copyright,
    sound: true,
    onSound: (on) => bus.setUserMuted(!on),
    onOpen: () => bus.pause('menu'),
    onClose: () => bus.resume('menu'),
    returnFocus: canvas,
  });

  const renderer = new Renderer(canvas, PARAMS);
  const input = new InputState();
  const step = createFixedStep(FIXED_HZ);
  let world = createWorld(PARAMS, Date.now() >>> 0);
  let state: 'ready' | 'playing' | 'over' = 'ready';
  let round = 0;
  let overAt = 0;
  // Paused (ad, menu, hidden tab, blur): keyup/pointerup may never arrive, so nothing stays held.
  bus.subscribe((s) => {
    if (s.paused) input.clear();
  });

  const start = async () => {
    if (state === 'playing' || bus.has('ad') || bus.has('menu')) return;
    if (state === 'over' && performance.now() - overAt < RESTART_DELAY_MS) return;
    if (state === 'over') {
      // Ads only between rounds, never while the player is acting.
      await platform.interstitial('round_end');
    }
    world = createWorld(PARAMS, Date.now() >>> 0);
    state = 'playing';
    round++;
    input.clear();
    platform.track('level_start', { round });
    platform.gameplayStart();
  };
  bindInput(canvas, input, () => void start());

  platform.loadingProgress(1);
  devLoader?.remove();
  platform.loadingEnd();
  canvas.focus();

  let last = performance.now();
  let shown = false;
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
            overAt = performance.now();
            platform.gameplayStop();
            platform.track('level_fail', { round, score: e.score });
            void platform.submitScore('main', e.score);
          }
        }
        if (state !== 'playing') break;
      }
    } else {
      step.accumulator = 0;
    }
    const overlay =
      state === 'ready' ? t('game.start') : state === 'over' ? t('game.score', { score: Math.floor(world.score) }) : bus.paused ? t('game.paused') : null;
    renderer.draw(world, overlay);
    if (!shown) {
      shown = true;
      window.GM_LOADER?.ready(); // first frame on screen: the portal hides its loading screen
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
