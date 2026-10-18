import type { Rng } from '../rng';

/**
 * UnityEngine.Random.Range trên Rng có seed của game. Hai bản quá tải khác nhau:
 * Range(int, int) KHÔNG bao giờ trả về max; Range(float, float) có thể trả về max.
 * Viết `Random.Range(0, 3)` thành `rangeInt(rng, 0, 3)` → 0, 1 hoặc 2.
 * Chuỗi số không trùng với Unity (thuật toán khác); parity cho phần ngẫu nhiên kiểm bằng biên và phân bố.
 */
export function rangeInt(rng: Rng, min: number, max: number): number {
  if (min === max) return min;
  if (min < max) return min + Math.floor(rng.next() * (max - min));
  // Unity: min > max cho kết quả trong (max, min].
  return min - Math.floor(rng.next() * (min - max));
}

export function rangeFloat(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng.next();
}

/** Random.value: [0, 1]. */
export const value = (rng: Rng): number => rng.next();

/** Random.insideUnitCircle. */
export function insideUnitCircle(rng: Rng): { x: number; y: number } {
  const angle = rng.next() * Math.PI * 2;
  const r = Math.sqrt(rng.next());
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}
