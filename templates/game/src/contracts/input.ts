/** Contract: actions core/ understands. Device mapping lives in view/. */
export type Action = 'left' | 'right' | 'action';

export interface InputFrame {
  readonly tick: number;
  /** Held now, plus anything tapped since the previous frame (like Input.GetKey). */
  readonly actions: readonly Action[];
  /** Went down since the previous frame (like Input.GetKeyDown). */
  readonly pressed: readonly Action[];
  /** Went up since the previous frame (like Input.GetKeyUp). */
  readonly released: readonly Action[];
}
