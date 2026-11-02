import type { Action, InputFrame } from '../contracts/input';

/**
 * Input goes through this layer so a session can be recorded and replayed.
 * The view/ layer feeds raw device state; core/ only ever sees InputFrame.
 *
 * Besides the held set it keeps press/release edges since the last frame(), so a tap
 * that starts and ends between two fixed steps is still seen (for exactly one step).
 */
export class InputState {
  private held = new Set<Action>();
  private pressedEdges = new Set<Action>();
  private releasedEdges = new Set<Action>();

  press(a: Action): void {
    if (this.held.has(a)) return; // DOM keydown auto-repeat is not a new press
    this.held.add(a);
    this.pressedEdges.add(a);
  }

  release(a: Action): void {
    if (!this.held.delete(a)) return;
    this.releasedEdges.add(a);
  }

  /** Drop pending edges but keep what is held (used while nothing is stepping). */
  clearEdges(): void {
    this.pressedEdges.clear();
    this.releasedEdges.clear();
  }

  /** Drop everything: held and edges. */
  clear(): void {
    this.held.clear();
    this.clearEdges();
  }

  /** Call once per step: the edges are consumed, so only the first call after them sees them. */
  frame(tick: number): InputFrame {
    const actions = [...new Set([...this.held, ...this.pressedEdges])].sort();
    const frame: InputFrame = { tick, actions, pressed: [...this.pressedEdges].sort(), released: [...this.releasedEdges].sort() };
    this.clearEdges();
    return frame;
  }
}

const frameKey = (f: Pick<InputFrame, 'actions' | 'pressed' | 'released'>) => JSON.stringify([f.actions, f.pressed, f.released]);

/** Records only the ticks where input changed or an edge happened — compact and exact. */
export class InputRecorder {
  readonly frames: InputFrame[] = [];
  private last = frameKey({ actions: [], pressed: [], released: [] });

  record(frame: InputFrame): void {
    const key = frameKey(frame);
    // Edges count even when the frame looks like the last one: a tap on two ticks in a row is two taps.
    if (key !== this.last || frame.pressed.length > 0 || frame.released.length > 0) {
      this.frames.push(frame);
      this.last = key;
    }
  }
}

/**
 * Plays a recording back as the frame for `tick`. `actions` persist from the last
 * recorded frame; `pressed`/`released` exist only on the tick they were recorded.
 */
export function frameAt(recording: readonly InputFrame[], tick: number): InputFrame {
  let actions: readonly Action[] = [];
  let edges: InputFrame | null = null;
  for (const f of recording) {
    if (f.tick > tick) break;
    actions = f.actions;
    edges = f.tick === tick ? f : null;
  }
  return { tick, actions, pressed: edges?.pressed ?? [], released: edges?.released ?? [] };
}
