/** Contract: actions core/ understands. Device mapping lives in view/. */
export type Action = 'left' | 'right' | 'action';

export interface InputFrame {
  readonly tick: number;
  readonly actions: readonly Action[];
}
