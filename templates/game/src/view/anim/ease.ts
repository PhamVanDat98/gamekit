/**
 * Easing curves: t in 0..1 → progress (back/elastic leave 0..1 on purpose: that is the overshoot).
 * Same formulas as the plugin's `gamekit motion` checker (scripts/lib/motion.mjs) — keep them in step.
 */
export type EaseName = 'linear' | 'in' | 'out' | 'inOut' | 'inBack' | 'outBack' | 'inOutBack' | 'outElastic' | 'outBounce' | 'hold';

const C1 = 1.70158;
const C2 = C1 * 1.525;
const C3 = C1 + 1;
const C4 = (2 * Math.PI) / 3;

function outBounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

export const EASES: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inBack: (t) => C3 * t * t * t - C1 * t * t,
  outBack: (t) => 1 + C3 * (t - 1) ** 3 + C1 * (t - 1) ** 2,
  inOutBack: (t) =>
    t < 0.5 ? ((2 * t) ** 2 * ((C2 + 1) * 2 * t - C2)) / 2 : ((2 * t - 2) ** 2 * ((C2 + 1) * (2 * t - 2) + C2) + 2) / 2,
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((10 * t - 0.75) * C4) + 1),
  outBounce,
  hold: (t) => (t < 1 ? 0 : 1),
};

export const DEFAULT_EASE: EaseName = 'inOut';
