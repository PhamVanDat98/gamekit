/* eslint-disable no-magic-numbers -- hệ số Hermite */
/**
 * AnimationCurve của Unity. Lấy keyframe y nguyên từ serialized (notes/unity/data/serialized.json hoặc
 * params-draft.json) đưa vào params/, rồi đánh giá bằng evaluateCurve. Đừng thay bằng lerp tuyến tính:
 * tangent (inSlope/outSlope) quyết định hình đường cong.
 */
export interface Keyframe {
  time: number;
  value: number;
  inSlope: number;
  outSlope: number;
  weightedMode?: number;
}

/** Dạng Unity ghi trong YAML: { m_Curve: [...], m_PreInfinity, m_PostInfinity }. 0 = PingPong, 1 = Loop, 2 = Clamp. */
export interface SerializedCurve {
  m_Curve: Keyframe[];
  m_PreInfinity?: number;
  m_PostInfinity?: number;
}

const PING_PONG = 0;
const LOOP = 1;

function wrapTime(t: number, start: number, end: number, mode: number): number {
  const len = end - start;
  if (len <= 0) return start;
  if (mode === LOOP) return start + (((t - start) % len) + len) % len;
  if (mode === PING_PONG) {
    const r = (((t - start) % (len * 2)) + len * 2) % (len * 2);
    return start + (r <= len ? r : len * 2 - r);
  }
  return t < start ? start : t > end ? end : t;
}

function hermite(k0: Keyframe, k1: Keyframe, t: number): number {
  const dt = k1.time - k0.time;
  if (dt <= 0) return k0.value;
  const m0 = k0.outSlope * dt;
  const m1 = k1.inSlope * dt;
  // Tangent vô cực = bậc thang (Constant) trong Unity.
  if (!Number.isFinite(m0) || !Number.isFinite(m1)) return k0.value;
  const s = (t - k0.time) / dt;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * k0.value + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * k1.value + (s3 - s2) * m1;
}

export function evaluateCurve(curve: SerializedCurve, time: number): number {
  const keys = curve.m_Curve;
  if (keys.length === 0) return 0;
  const first = keys[0] as Keyframe;
  if (keys.length === 1) return first.value;
  const last = keys[keys.length - 1] as Keyframe;
  if (keys.some((k) => k.weightedMode)) throw new Error('AnimationCurve có keyframe weighted: chưa hỗ trợ — xem DECISIONS.md hoặc lấy mẫu thành bảng oracle');
  let t = time;
  if (t < first.time) t = wrapTime(t, first.time, last.time, curve.m_PreInfinity ?? 2);
  else if (t > last.time) t = wrapTime(t, first.time, last.time, curve.m_PostInfinity ?? 2);
  if (t <= first.time) return first.value;
  if (t >= last.time) return last.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i] as Keyframe;
    const k1 = keys[i + 1] as Keyframe;
    if (t >= k0.time && t <= k1.time) return hermite(k0, k1, t);
  }
  return last.value;
}
