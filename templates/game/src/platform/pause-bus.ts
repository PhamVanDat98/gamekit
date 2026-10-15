/**
 * One place that decides whether the game runs and whether sound plays.
 * Ads, hidden tabs and the pause menu each add a reason; the game resumes only
 * when every reason is gone. Every adapter goes through here.
 */
export type PauseReason = 'ad' | 'hidden' | 'blur' | 'menu';

export interface PauseState {
  readonly paused: boolean;
  readonly muted: boolean;
}

type Listener = (s: PauseState) => void;

export class PauseBus {
  private reasons = new Set<PauseReason>();
  private userMuted = false;
  private listeners = new Set<Listener>();

  get paused(): boolean {
    return this.reasons.size > 0;
  }

  /** Sound is off while paused for any reason, or when the player muted it. */
  get muted(): boolean {
    return this.userMuted || this.paused;
  }

  has(reason: PauseReason): boolean {
    return this.reasons.has(reason);
  }

  pause(reason: PauseReason): void {
    if (this.reasons.has(reason)) return;
    this.reasons.add(reason);
    this.emit();
  }

  resume(reason: PauseReason): void {
    if (!this.reasons.delete(reason)) return;
    this.emit();
  }

  setUserMuted(muted: boolean): void {
    if (this.userMuted === muted) return;
    this.userMuted = muted;
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private get state(): PauseState {
    return { paused: this.paused, muted: this.muted };
  }

  private emit(): void {
    const s = this.state;
    for (const fn of this.listeners) fn(s);
  }
}
