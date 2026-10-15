/*
 * Template demo: a small dodge game so the whole pipeline runs end to end.
 * Replace with the ported game's logic. Rules for core/:
 *   - no DOM, no renderer, no platform imports (lint enforces it)
 *   - every gameplay number from PARAMS, randomness from Rng, time from the fixed step
 */
import type { InputFrame } from '../contracts/input';
import type { Obstacle, WorldEvent, WorldState } from '../contracts/world';
import type { Params } from './params';
import { Rng } from './rng';

const HALF = 0.5;

export function createWorld(params: Params, seed: number): WorldState {
  return {
    tick: 0,
    time: 0,
    score: 0,
    over: false,
    player: { x: params.world.width * HALF, y: params.player.y, size: params.player.size },
    obstacles: [],
    nextObstacleId: 1,
    spawnTimer: 0,
    rng: new Rng(seed),
  };
}

export function obstacleSpeed(params: Params, time: number): number {
  return params.obstacle.speedStart + params.obstacle.speedPerSecond * time;
}

export function overlaps(a: { x: number; y: number; size: number }, b: { x: number; y: number; size: number }): boolean {
  const r = (a.size + b.size) * HALF;
  return Math.abs(a.x - b.x) < r && Math.abs(a.y - b.y) < r;
}

/** Advance one fixed step. Mutates `w` and returns what happened, for view/analytics. */
export function stepWorld(w: WorldState, params: Params, input: InputFrame, dt: number): WorldEvent[] {
  if (w.over) return [];
  const events: WorldEvent[] = [];
  w.tick++;
  w.time += dt;

  // Player
  const dir = (input.actions.includes('right') ? 1 : 0) - (input.actions.includes('left') ? 1 : 0);
  const halfSize = w.player.size * HALF;
  w.player.x = Math.min(params.world.width - halfSize, Math.max(halfSize, w.player.x + dir * params.player.speed * dt));

  // Spawning
  w.spawnTimer -= dt;
  if (w.spawnTimer <= 0) {
    w.spawnTimer += params.obstacle.spawnEvery;
    const s = params.obstacle.size;
    const o: Obstacle = { id: w.nextObstacleId++, x: w.rng.range(s * HALF, params.world.width - s * HALF), y: -s, size: s };
    w.obstacles.push(o);
    events.push({ type: 'spawn', id: o.id });
  }

  // Obstacles
  const v = obstacleSpeed(params, w.time);
  for (const o of w.obstacles) o.y += v * dt;
  w.obstacles = w.obstacles.filter((o) => o.y - o.size < params.world.height);

  // Score and collision
  w.score += params.score.perSecond * dt;
  if (w.obstacles.some((o) => overlaps(o, w.player))) {
    w.over = true;
    events.push({ type: 'gameOver', score: Math.floor(w.score) });
  }
  return events;
}

/** Stable fingerprint of the simulation state — replay tests compare these. */
export function worldHash(w: WorldState): string {
  const PRECISION = 1000;
  const r = (n: number) => Math.round(n * PRECISION) / PRECISION;
  return JSON.stringify([w.tick, r(w.score), w.over, r(w.player.x), w.obstacles.map((o) => [o.id, r(o.x), r(o.y)]), w.rng.seedState]);
}
