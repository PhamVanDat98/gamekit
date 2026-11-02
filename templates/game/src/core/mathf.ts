/*
 * Unity-compatible math helpers. core/ bans Math.round and Math.sign (lint) because
 * their semantics differ from Mathf.RoundToInt / Mathf.Sign in the original engine.
 */
const HALF = 0.5;

/**
 * Mathf.RoundToInt: halves round to the nearest EVEN integer (0.5 -> 0, 1.5 -> 2, 2.5 -> 2, -1.5 -> -2).
 * Math.round rounds halves toward +Infinity (2.5 -> 3, -0.5 -> -0). Never returns -0.
 */
export function roundToInt(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  let r: number;
  if (diff < HALF) r = f;
  else if (diff > HALF) r = f + 1;
  else r = f % 2 === 0 ? f : f + 1;
  return r === 0 ? 0 : r; // collapse -0 into 0
}

/**
 * Mathf.Sign: zero counts as positive (sign(0) = 1, sign(-0) = 1, sign(-3) = -1).
 * Math.sign returns 0 for zero (and -0 for -0).
 */
export function sign(x: number): 1 | -1 {
  return x >= 0 ? 1 : -1;
}
