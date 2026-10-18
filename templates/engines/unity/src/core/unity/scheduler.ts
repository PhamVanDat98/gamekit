/**
 * Coroutine, Invoke và InvokeRepeating chạy theo thời gian mô phỏng (dt của fixed step), không theo
 * đồng hồ thật — replay vẫn khớp. Ngữ nghĩa giữ như Unity:
 * - StartCoroutine chạy ngay phần trước `yield` đầu tiên, trong lúc gọi.
 * - `yield null` (C# `yield return null`) chờ tới bước sau.
 * - `yield wait(s)` (C# `yield return new WaitForSeconds(s)`) tiếp tục ở bước đầu tiên đã trôi đủ s giây.
 * - `yield until(fn)` (C# `yield return new WaitUntil(fn)`) kiểm tra mỗi bước.
 * - Invoke(name, t) = after(t, fn); InvokeRepeating(name, t, r) = every(r, fn, t).
 *
 * Gọi `update(dt)` mỗi bước mô phỏng, ở chỗ Unity chạy coroutine: sau Update của bước đó.
 */
export type Yield = null | undefined | { wait: number } | { until: () => boolean };
export type Coroutine = Generator<Yield, void, void>;

export const wait = (seconds: number): Yield => ({ wait: seconds });
export const until = (fn: () => boolean): Yield => ({ until: fn });

interface Task {
  id: number;
  at: number;
  run: () => void;
  every?: number;
  until?: () => boolean;
}

export class Scheduler {
  private now = 0;
  private nextId = 1;
  private tasks: Task[] = [];
  private cancelled = new Set<number>();

  /** Thời gian mô phỏng đã trôi (giây), như Time.time. */
  get time(): number {
    return this.now;
  }

  after(seconds: number, fn: () => void): number {
    return this.push({ id: this.nextId++, at: this.now + seconds, run: fn });
  }

  every(repeatRate: number, fn: () => void, firstDelay = repeatRate): number {
    if (repeatRate <= 0) throw new Error('InvokeRepeating: repeatRate phải > 0');
    return this.push({ id: this.nextId++, at: this.now + firstDelay, run: fn, every: repeatRate });
  }

  /** StartCoroutine: trả về id để stop(). */
  start(co: Coroutine): number {
    const id = this.nextId++;
    this.resume(id, co);
    return id;
  }

  /** StopCoroutine / CancelInvoke cho một id. */
  stop(id: number): void {
    this.cancelled.add(id);
    this.tasks = this.tasks.filter((t) => t.id !== id);
  }

  /** StopAllCoroutines + CancelInvoke(). */
  stopAll(): void {
    for (const t of this.tasks) this.cancelled.add(t.id);
    this.tasks = [];
  }

  update(dt: number): void {
    this.now += dt;
    const due = this.tasks.filter((t) => (t.until ? t.until() : t.at <= this.now));
    this.tasks = this.tasks.filter((t) => !due.includes(t));
    // Đúng thứ tự hẹn: sớm trước, cùng lúc thì cái đặt trước chạy trước.
    due.sort((a, b) => a.at - b.at || a.id - b.id);
    for (const t of due) {
      if (this.cancelled.has(t.id)) continue;
      t.run();
      if (t.every !== undefined && !this.cancelled.has(t.id)) this.push({ ...t, at: t.at + t.every });
    }
  }

  private resume(id: number, co: Coroutine): void {
    if (this.cancelled.has(id)) return;
    const r = co.next();
    if (r.done) return;
    const y = r.value;
    const run = () => this.resume(id, co);
    if (y && 'wait' in y) this.push({ id, at: this.now + y.wait, run });
    else if (y && 'until' in y) this.push({ id, at: this.now, run, until: y.until });
    else this.push({ id, at: this.now, run }); // yield null: bước sau
  }

  private push(t: Task): number {
    this.tasks.push(t);
    return t.id;
  }
}
