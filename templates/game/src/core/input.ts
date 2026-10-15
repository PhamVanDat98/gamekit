import type { Action, InputFrame } from '../contracts/input';

/**
 * Input goes through this layer so a session can be recorded and replayed.
 * The view/ layer feeds raw device state; core/ only ever sees InputFrame.
 */
export class InputState {
  private held = new Set<Action>();

  press(a: Action): void {
    this.held.add(a);
  }

  release(a: Action): void {
    this.held.delete(a);
  }

  clear(): void {
    this.held.clear();
  }

  frame(tick: number): InputFrame {
    return { tick, actions: [...this.held].sort() };
  }
}

/** Records only the ticks where input changed — compact and exact. */
export class InputRecorder {
  readonly frames: InputFrame[] = [];
  private last = '';

  record(frame: InputFrame): void {
    const key = frame.actions.join(',');
    if (key !== this.last) {
      this.frames.push(frame);
      this.last = key;
    }
  }
}

/** Plays a recording back: returns the actions held at a given tick. */
export function inputAt(recording: readonly InputFrame[], tick: number): readonly Action[] {
  let current: readonly Action[] = [];
  for (const f of recording) {
    if (f.tick > tick) break;
    current = f.actions;
  }
  return current;
}
