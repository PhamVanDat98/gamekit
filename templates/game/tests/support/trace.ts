/**
 * Per-tick traces for hunting down where the port drifts from the original (skill parity-debug).
 * A trace is one row per sampled tick with the few numbers a mechanic depends on. The reference trace
 * comes from the original game (spec/oracles/, harness) or from a known-good build.
 */
export type TraceValue = number | boolean | string;
export type TraceRow = { tick: number } & Record<string, TraceValue>;

export interface Divergence {
  tick: number;
  keys: string[];
  expected: TraceRow;
  actual: TraceRow;
}

/** Run `ticks` steps and sample the state every `every` ticks (tick 0 = before the first step). */
export function recordTrace<S>(state: S, ticks: number, step: (s: S, tick: number) => void, sample: (s: S, tick: number) => Omit<TraceRow, 'tick'>, every = 1): TraceRow[] {
  const rows: TraceRow[] = [{ tick: 0, ...sample(state, 0) } as TraceRow];
  for (let t = 1; t <= ticks; t++) {
    step(state, t);
    if (t % every === 0) rows.push({ tick: t, ...sample(state, t) } as TraceRow);
  }
  return rows;
}

function differs(a: TraceValue | undefined, b: TraceValue | undefined, tolerance: number): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  return a !== b;
}

/**
 * First sampled tick where `actual` differs from `expected` (relative tolerance, absolute below 1),
 * with the keys that differ. Ticks missing on either side are skipped; null = no divergence found.
 */
export function firstDivergence(expected: readonly TraceRow[], actual: readonly TraceRow[], tolerance = 0): Divergence | null {
  const byTick = new Map(actual.map((r) => [r.tick, r]));
  for (const e of expected) {
    const a = byTick.get(e.tick);
    if (!a) continue;
    const keys = Object.keys(e).filter((k) => k !== 'tick' && differs(e[k], a[k], tolerance));
    if (keys.length) return { tick: e.tick, keys, expected: e, actual: a };
  }
  return null;
}
