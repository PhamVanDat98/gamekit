export interface OracleThresholds {
  tolerance?: number;
  toleranceAbs?: number;
}

function within(actual: number, expected: number, { tolerance, toleranceAbs }: OracleThresholds): boolean {
  const diff = Math.abs(actual - expected);
  if (tolerance == null && toleranceAbs == null) return diff === 0;
  if (toleranceAbs != null && diff <= toleranceAbs) return true;
  // Relative error means nothing at 0: only toleranceAbs can pass there.
  return tolerance != null && expected !== 0 && diff / Math.abs(expected) <= tolerance;
}

/**
 * Compare a result with one oracle case; returns what differs (empty = match).
 * `out` is a value or an object of values, e.g. { x, y }: every value in it must be
 * present in `actual`. A case's own thresholds override the oracle's.
 */
export function oracleMismatches(actual: unknown, c: OracleThresholds & { out: unknown }, oracle: OracleThresholds = {}): string[] {
  const limits = { tolerance: c.tolerance ?? oracle.tolerance, toleranceAbs: c.toleranceAbs ?? oracle.toleranceAbs };
  const compare = (got: unknown, want: unknown, at: string): string[] => {
    if (typeof want === 'number') return typeof got === 'number' && within(got, want, limits) ? [] : [`${at}: ${String(got)}, game gốc ${want}`];
    if (want && typeof want === 'object') {
      const obj = (got ?? {}) as Record<string, unknown>;
      return Object.entries(want).flatMap(([k, v]) => compare(obj[k], v, at ? `${at}.${k}` : k));
    }
    return Object.is(got, want) ? [] : [`${at}: ${String(got)}, game gốc ${String(want)}`];
  };
  return compare(actual, c.out, '');
}
