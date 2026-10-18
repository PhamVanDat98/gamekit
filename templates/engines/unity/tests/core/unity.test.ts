import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Mathf, UnityRandom, Scheduler, evaluateCurve, wait, type Coroutine } from '../../src/core/unity';
import { createSpace } from '../../src/view/unity-space';

// Giá trị kỳ vọng là kết quả của Unity (UnityEngine.Mathf / Random / AnimationCurve), không phải của JS.
describe('Mathf như Unity', () => {
  it('Round làm tròn .5 về số chẵn', () => {
    expect([0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5, 2.4, 2.6].map(Mathf.round)).toEqual([0, 2, 2, 4, 0, -2, -2, 2, 3]);
  });
  it('Sign(0) = 1; (int) cắt về 0; chia nguyên', () => {
    expect(Mathf.sign(0)).toBe(1);
    expect(Mathf.sign(-0.1)).toBe(-1);
    expect(Mathf.toInt(-1.7)).toBe(-1);
    expect(Mathf.intDiv(7, 2)).toBe(3);
    expect(Mathf.intDiv(-7, 2)).toBe(-3);
  });
  it('Lerp kẹp t; Repeat, PingPong, DeltaAngle', () => {
    expect(Mathf.lerp(0, 10, 1.5)).toBe(10);
    expect(Mathf.lerpUnclamped(0, 10, 1.5)).toBe(15);
    expect(Mathf.repeat(-1, 3)).toBe(2);
    expect(Mathf.pingPong(4, 3)).toBe(2);
    expect(Mathf.deltaAngle(1080, 90)).toBe(90);
    expect(Mathf.deltaAngle(10, 350)).toBe(-20);
    expect(Mathf.moveTowards(0, 10, 3)).toBe(3);
    expect(Mathf.moveTowards(9, 10, 3)).toBe(10);
  });
  it('SmoothDamp tiến dần tới đích, không vượt', () => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < 200; i++) [x, v] = Mathf.smoothDamp(x, 10, v, 0.3, 1 / 50);
    expect(x).toBeCloseTo(10, 3);
    expect(x).toBeLessThanOrEqual(10);
  });
});

describe('Random.Range như Unity', () => {
  it('bản int không bao giờ trả về max', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(UnityRandom.rangeInt(rng, 0, 3));
    expect([...seen].sort()).toEqual([0, 1, 2]);
    expect(UnityRandom.rangeInt(rng, 4, 4)).toBe(4);
  });
});

describe('AnimationCurve', () => {
  const key = (time: number, value: number, slope: number) => ({ time, value, inSlope: slope, outSlope: slope });
  it('tangent quyết định hình đường cong; ngoài khoảng thì kẹp', () => {
    const linear = { m_Curve: [key(0, 0, 1), key(1, 1, 1)], m_PreInfinity: 2, m_PostInfinity: 2 };
    expect(evaluateCurve(linear, 0.25)).toBeCloseTo(0.25);
    const easeInOut = { m_Curve: [key(0, 0, 0), key(1, 1, 0)] };
    expect(evaluateCurve(easeInOut, 0.25)).toBeCloseTo(0.15625);
    expect(evaluateCurve(easeInOut, 2)).toBe(1);
    expect(evaluateCurve(easeInOut, -1)).toBe(0);
  });
  it('tangent vô cực là bậc thang; Loop lặp lại', () => {
    const step = { m_Curve: [key(0, 0, Infinity), key(1, 1, Infinity)] };
    expect(evaluateCurve(step, 0.9)).toBe(0);
    const loop = { m_Curve: [key(0, 0, 1), key(1, 1, 1)], m_PostInfinity: 1 };
    expect(evaluateCurve(loop, 1.25)).toBeCloseTo(0.25);
  });
});

describe('Scheduler như coroutine/Invoke', () => {
  it('phần trước yield đầu chạy ngay; WaitForSeconds tiếp tục ở bước đã đủ thời gian', () => {
    const s = new Scheduler();
    const log: string[] = [];
    function* co(): Coroutine {
      log.push(`a@${s.time}`);
      yield wait(0.5);
      log.push(`b@${s.time}`);
      yield null;
      log.push(`c@${s.time}`);
    }
    s.start(co());
    expect(log).toEqual(['a@0']);
    for (let i = 0; i < 4; i++) s.update(0.25);
    expect(log).toEqual(['a@0', 'b@0.5', 'c@0.75']);
  });
  it('InvokeRepeating và dừng', () => {
    const s = new Scheduler();
    let n = 0;
    const id = s.every(0.5, () => n++, 0.25);
    for (let i = 0; i < 8; i++) s.update(0.25); // tới 2 s: chạy ở 0.25, 0.75, 1.25, 1.75
    expect(n).toBe(4);
    s.stop(id);
    s.update(1);
    expect(n).toBe(4);
  });
});

describe('toạ độ Unity → canvas', () => {
  it('y lật, gốc ở giữa, orthographicSize quyết định tỉ lệ', () => {
    const sp = createSpace({ orthographicSize: 5, x: 0, y: 0 }, 540, 960);
    expect(sp.pxPerUnit).toBe(96);
    expect(sp.toScreen(0, 0)).toEqual({ x: 270, y: 480 });
    expect(sp.toScreen(1, 5)).toEqual({ x: 366, y: 0 });
    expect(sp.toWorld(366, 0)).toEqual({ x: 1, y: 5 });
    expect(sp.rotation(90)).toBeCloseTo(-Math.PI / 2);
    expect(sp.spriteSize(100, 100)).toBe(96);
  });
});
