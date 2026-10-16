import type { PauseBus } from './pause-bus';
import type { Platform } from './types';

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Space', 'PageUp', 'PageDown']);

/**
 * Browser rules every portal checks: pause when the tab is hidden, don't scroll
 * the host page with game keys, keep focus inside the iframe, report errors.
 */
export function installWebGuard(opts: { bus: PauseBus; platform: Platform; focusEl: HTMLElement; buildId: string }): () => void {
  const { bus, platform, focusEl, buildId } = opts;
  const onVisibility = () => (document.hidden ? bus.pause('hidden') : bus.resume('hidden'));
  const onBlur = () => bus.pause('blur');
  const onFocus = () => bus.resume('blur');
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof Element && e.target.closest('.gk-settings')) return; // popup keeps its keys
    if (SCROLL_KEYS.has(e.key) || SCROLL_KEYS.has(e.code)) e.preventDefault();
  };
  const onPointer = () => focusEl.focus({ preventScroll: true });
  const onError = (e: ErrorEvent) => platform.track('error', { message: String(e.message).slice(0, 200), build: buildId });
  const onRejection = (e: PromiseRejectionEvent) => platform.track('error', { message: String(e.reason).slice(0, 200), build: buildId });
  const onContext = (e: Event) => e.preventDefault();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  window.addEventListener('keydown', onKey, { passive: false });
  focusEl.addEventListener('pointerdown', onPointer);
  focusEl.addEventListener('contextmenu', onContext);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('keydown', onKey);
    focusEl.removeEventListener('pointerdown', onPointer);
    focusEl.removeEventListener('contextmenu', onContext);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
