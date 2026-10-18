/* eslint-disable no-magic-numbers -- hằng số toán học của Unity, không phải số gameplay */
/**
 * UnityEngine.Mathf với đúng ngữ nghĩa của Unity. JS khác ở những chỗ người chơi cảm nhận được:
 * Math.round(2.5) = 3 nhưng Mathf.Round(2.5) = 2; Math.sign(0) = 0 nhưng Mathf.Sign(0) = 1;
 * (int)x trong C# cắt về 0, chia hai int là chia nguyên. Port code C# thì gọi các hàm ở đây.
 */
export const Deg2Rad = Math.PI / 180;
export const Rad2Deg = 180 / Math.PI;
/** Mathf.Epsilon: số float dương nhỏ nhất. */
export const Epsilon = 1.401298e-45;

/** Mathf.Round / RoundToInt: .5 làm tròn về số chẵn gần nhất (banker's rounding). */
export function round(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
export const roundToInt = round;
export const floorToInt = (x: number): number => Math.floor(x);
export const ceilToInt = (x: number): number => Math.ceil(x);

/** Ép kiểu (int)x của C#: cắt phần thập phân về phía 0. */
export const toInt = (x: number): number => Math.trunc(x);
/** a / b khi cả hai là int trong C#: chia nguyên, cắt về 0. */
export function intDiv(a: number, b: number): number {
  if (b === 0) throw new Error('DivideByZeroException');
  return Math.trunc(a / b);
}
/** Làm tròn về float 32-bit như biến `float` của C# (dùng khi cộng dồn cần khớp từng bit với bản gốc). */
export const f32 = Math.fround;

/** Mathf.Sign: 1 khi x >= 0 (kể cả 0), -1 khi âm. */
export const sign = (x: number): number => (x >= 0 ? 1 : -1);

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
export const clamp01 = (value: number): number => clamp(value, 0, 1);

/** Mathf.Lerp: t bị kẹp trong [0, 1]. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);
export const lerpUnclamped = (a: number, b: number, t: number): number => a + (b - a) * t;
export const inverseLerp = (a: number, b: number, value: number): number => (a !== b ? clamp01((value - a) / (b - a)) : 0);

/** Mathf.Repeat: như t % length nhưng luôn dương. */
export const repeat = (t: number, length: number): number => clamp(t - Math.floor(t / length) * length, 0, length);
export function pingPong(t: number, length: number): number {
  const r = repeat(t, length * 2);
  return length - Math.abs(r - length);
}

/** Góc ngắn nhất từ current tới target, theo độ, trong (-180, 180]. */
export function deltaAngle(current: number, target: number): number {
  let d = repeat(target - current, 360);
  if (d > 180) d -= 360;
  return d;
}
export const lerpAngle = (a: number, b: number, t: number): number => a + deltaAngle(a, b) * clamp01(t);

export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + sign(target - current) * maxDelta;
}
export function moveTowardsAngle(current: number, target: number, maxDelta: number): number {
  const d = deltaAngle(current, target);
  if (-maxDelta < d && d < maxDelta) return target;
  return moveTowards(current, current + d, maxDelta);
}

/** Mathf.SmoothStep: nội suy Hermite giữa from và to. */
export function smoothStep(from: number, to: number, t: number): number {
  const x = clamp01(t);
  const s = -2 * x * x * x + 3 * x * x;
  return to * s + from * (1 - s);
}

/**
 * Mathf.SmoothDamp. Unity giữ vận tốc trong biến `ref`; ở đây trả về [giá trị, vận tốc mới] để core
 * vẫn thuần. `deltaTime` bắt buộc truyền vào (core không có Time.deltaTime).
 */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Infinity,
): [value: number, velocity: number] {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxChange = maxSpeed * st;
  const change = clamp(current - target, -maxChange, maxChange);
  const originalTo = target;
  const to = current - change;
  const temp = (velocity + omega * change) * deltaTime;
  let vel = (velocity - omega * temp) * exp;
  let out = to + (change + temp) * exp;
  if (originalTo - current > 0 === out > originalTo) {
    out = originalTo;
    vel = (out - originalTo) / deltaTime;
  }
  return [out, vel];
}

/** Mathf.Approximately. */
export const approximately = (a: number, b: number): boolean =>
  Math.abs(b - a) < Math.max(1e-6 * Math.max(Math.abs(a), Math.abs(b)), Epsilon * 8);
