/**
 * Ngữ nghĩa Unity cho core/: port code C# thì gọi qua đây thay vì Math.* của JS.
 * Bảng đối chiếu đầy đủ: skill engine-unity (references/pitfalls.md).
 */
export * as Mathf from './mathf';
export * as UnityRandom from './random';
export { evaluateCurve, type Keyframe, type SerializedCurve } from './curve';
export { Scheduler, wait, until, type Coroutine, type Yield } from './scheduler';
