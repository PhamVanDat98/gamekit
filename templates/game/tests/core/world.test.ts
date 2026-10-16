import { describe, expect, it } from 'vitest';
import type { InputFrame } from '../../src/contracts/input';
import { PARAMS } from '../../src/core/params';
import { createWorld, obstacleSpeed, stepWorld } from '../../src/core/world';
import raw from '../../params/game.json';
import speedOracle from '../../spec/oracles/obstacle-speed.json';

const DT = 1 / 60;
const hold = (tick: number, ...actions: InputFrame['actions'][number][]): InputFrame => ({ tick, actions });

/**
 * Parity tests: expected values come from params (= the original game), with the
 * tolerance recorded next to each value. When porting, add one per mechanic.
 * The [id:case] tag in each name closes that obligation in spec/obligations.yaml (`gk parity`).
 */
describe('parity with params', () => {
  it('[player.move:normal] player moves player.speed px per second', () => {
    const w = createWorld(PARAMS, 1);
    w.obstacles = [];
    w.spawnTimer = Infinity;
    const x0 = w.player.x;
    for (let i = 0; i < 30; i++) stepWorld(w, PARAMS, hold(i, 'right'), DT); // 0.5 s, stays inside the field
    const moved = (w.player.x - x0) / 0.5;
    expect(Math.abs(moved - raw.player.speed.value) / raw.player.speed.value).toBeLessThanOrEqual(raw.player.speed.tolerance);
  });

  it('[obstacle.speed:normal] obstacle speed starts at speedStart and ramps by speedPerSecond', () => {
    expect(obstacleSpeed(PARAMS, 0)).toBeCloseTo(raw.obstacle.speedStart.value);
    expect(obstacleSpeed(PARAMS, 10)).toBeCloseTo(raw.obstacle.speedStart.value + 10 * raw.obstacle.speedPerSecond.value);
  });

  // Oracle: every row of the table taken from the original game must match within tolerance.
  it.each(speedOracle.cases)('[obstacle.speed:oracle] t=$in.t s → $out px/s', (c) => {
    expect(Math.abs(obstacleSpeed(PARAMS, c.in.t) - c.out) / c.out).toBeLessThanOrEqual(speedOracle.tolerance);
  });

  it('[obstacle.spawn:normal] spawns one obstacle every spawnEvery seconds', () => {
    const w = createWorld(PARAMS, 7);
    w.player.x = -1000; // out of the way
    let spawns = 0;
    const seconds = 4;
    for (let i = 0; i < seconds * 60; i++) spawns += stepWorld(w, PARAMS, hold(i), DT).filter((e) => e.type === 'spawn').length;
    expect(spawns).toBe(Math.ceil(seconds / raw.obstacle.spawnEvery.value));
  });

  it('[score.rate:normal] scores score.perSecond per second', () => {
    const w = createWorld(PARAMS, 3);
    w.spawnTimer = Infinity;
    for (let i = 0; i < 60; i++) stepWorld(w, PARAMS, hold(i), DT);
    expect(w.score).toBeCloseTo(raw.score.perSecond.value, 5);
  });
});

describe('rules', () => {
  it('[rules.collision:normal] game ends on collision and stops updating', () => {
    const w = createWorld(PARAMS, 1);
    w.spawnTimer = Infinity;
    w.obstacles.push({ id: 99, x: w.player.x, y: w.player.y, size: PARAMS.obstacle.size });
    const events = stepWorld(w, PARAMS, hold(0), DT);
    expect(w.over).toBe(true);
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
    const tick = w.tick;
    stepWorld(w, PARAMS, hold(1), DT);
    expect(w.tick).toBe(tick);
  });

  it('[player.move:edge] player stays inside the field', () => {
    const w = createWorld(PARAMS, 1);
    w.spawnTimer = Infinity;
    for (let i = 0; i < 600; i++) stepWorld(w, PARAMS, hold(i, 'left'), DT);
    expect(w.player.x).toBe(PARAMS.player.size / 2);
  });
});
