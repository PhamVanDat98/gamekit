import type { Rng } from '../core/rng';

/** Contract between core/ (writes) and view/ (reads only). */
export interface Body {
  x: number;
  y: number;
  size: number;
}

export interface Obstacle extends Body {
  readonly id: number;
}

export interface WorldState {
  tick: number;
  time: number;
  score: number;
  over: boolean;
  player: Body;
  obstacles: Obstacle[];
  nextObstacleId: number;
  spawnTimer: number;
  rng: Rng;
}

export type WorldEvent = { type: 'spawn'; id: number } | { type: 'gameOver'; score: number };
