import type { Action } from '../contracts/input';
import type { InputState } from '../core/input';

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'action',
  Enter: 'action',
};

/**
 * Keyboard + touch → actions. Touch: left half = left, right half = right.
 * onAction fires on a fresh press only (no key auto-repeat), so holding a key never restarts a round.
 */
export function bindInput(el: HTMLElement, input: InputState, onAction: () => void): () => void {
  const inPopup = (e: Event) => e.target instanceof Element && e.target.closest('.gk-settings, .gk-gear') !== null;
  const down = (e: KeyboardEvent) => {
    if (inPopup(e)) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    input.press(a);
    if (a === 'action' && !e.repeat) onAction();
  };
  // Not filtered by the popup: a key pressed before the popup opened must still be released.
  const up = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (a) input.release(a);
  };
  // keyup never arrives once the window lost focus (alt-tab, click outside the iframe).
  const blur = () => input.clear();
  const pointer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    input.release('left');
    input.release('right');
    input.press(e.clientX < r.left + r.width / 2 ? 'left' : 'right');
    onAction();
  };
  const pointerUp = () => {
    input.release('left');
    input.release('right');
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  el.addEventListener('pointerdown', pointer);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    el.removeEventListener('pointerdown', pointer);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
  };
}
