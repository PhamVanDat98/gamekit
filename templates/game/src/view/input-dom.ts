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

/** Keyboard + touch → actions. Touch: left half = left, right half = right. */
export function bindInput(el: HTMLElement, input: InputState, onAction: () => void): () => void {
  const down = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    input.press(a);
    if (a === 'action') onAction();
  };
  const up = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (a) input.release(a);
  };
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
  el.addEventListener('pointerdown', pointer);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    el.removeEventListener('pointerdown', pointer);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
  };
}
