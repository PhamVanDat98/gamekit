---
name: port-timing
description: Dùng ở P2 khi chuyển thời gian và trình tự của game gốc sang core/ deterministic — Update/FixedUpdate, coroutine (yield WaitForSeconds), Invoke, schedule, Timer/await, alarm, enterFrame, tween (DOTween, cc.tween…), Animator/máy trạng thái, animation event, timeScale — thành máy trạng thái và bộ đếm theo tick. Dùng cả khi hành động trên web sớm/muộn vài frame so với bản gốc, hoặc replay không lặp lại được.
---

# Thời gian, tween, máy trạng thái (P2)

Trong `src/core/` không có đồng hồ thật, không `setTimeout`, không `async` chờ thời gian (lint chặn). Mọi thứ "sau X giây", "lặp mỗi Y", "chạy hiệu ứng rồi mới…" phải thành **state + bộ đếm** tiến theo bước cố định. Nhờ vậy replay lặp lại được và parity đo được tới từng tick.

## 1. Quy tắc chung
- **Đếm tick, không cộng giây float** khi có thể: `ticksLeft = Math.round(seconds * fixedStepHz)` rồi trừ 1 mỗi bước. Cộng dồn `dt` float sinh lệch một tick sau vài nghìn bước.
- Game gốc tính theo frame (Flash, GameMaker, game cũ): đặt `runtime.fixedStepHz` = fps gốc, đếm frame như bản gốc — không đổi sang giây rồi đổi lại.
- Xác định **thứ tự trong một tick** như bản gốc: input → logic → vật lý → va chạm → hẹn giờ? Một hành động "trễ một frame" thường do sai thứ tự này.
- Thứ chỉ để nhìn (rung camera, nhấp nháy, tween UI không ảnh hưởng va chạm) để trong `view/`; thứ thay đổi kết quả (vị trí có hitbox, thời gian bất tử, cooldown) phải ở `core/`.

## 2. Ánh xạ
| Bản gốc | Trong core/ |
| --- | --- |
| `Update(dt)` / `_process(delta)` / `update(dt)` | code trong `stepWorld` với `dt` cố định. Bản gốc phụ thuộc fps thật (dt biến thiên) → chọn fps tham chiếu (vd 60), ghi `D-n` |
| `FixedUpdate` / `_physics_process` | bước cố định; `fixedStepHz` = tần số gốc (Unity mặc định 50) |
| Coroutine `yield return new WaitForSeconds(t)`, `await get_tree().create_timer(t).timeout`, `scheduleOnce` | máy trạng thái: mỗi `yield` là một trạng thái, `ticksLeft` chờ. Coroutine lồng nhau → trạng thái lồng hoặc hàng đợi bước |
| `Invoke("F", t)`, `InvokeRepeating`, `schedule(f, interval)`, Timer node, alarm (GameMaker) | hàng đợi hẹn giờ trong state: `{ atTick, kind, payload }`, xử lý theo thứ tự `atTick` rồi thứ tự thêm |
| Tween (DOTween, LeanTween, `cc.tween`, Godot Tween) ảnh hưởng gameplay | hàm easing thuần `ease(t)` + `startTick`/`durationTicks` trong state; vị trí = nội suy theo tick. Easing phải đúng công thức của thư viện gốc (DOTween mặc định `OutQuad`; `cc.tween` mặc định tuyến tính — kiểm trong bản gốc) |
| Animator / AnimationPlayer state machine | `enum` trạng thái + bảng chuyển trạng thái (điều kiện, thời lượng tính bằng tick) |
| Animation event (đòn đánh trúng ở frame 7) | tick = frame × (fixedStepHz / fps của animation); ghi số frame và fps vào `params/` |
| `Time.timeScale`, slow-motion, pause | hệ số trong state nhân vào số bước mô phỏng/`dt` của logic, không đụng đồng hồ thật; pause do `PauseBus` (ngoài core) — core không biết pause |
| `Time.time`, `Time.frameCount` | `w.time`, `w.tick` |

## 3. Mẫu
```ts
// trong state (contracts): hàng đợi hẹn giờ — thay cho Invoke/schedule/coroutine chờ
export interface Timer { atTick: number; kind: 'spawnWave' | 'endInvincible'; id?: number }

function runTimers(w: WorldState): void {
  // sort ổn định: cùng tick thì theo thứ tự thêm vào — như bản gốc
  while (w.timers.length && (w.timers[0] as Timer).atTick <= w.tick) {
    const t = w.timers.shift() as Timer;
    if (t.kind === 'spawnWave') spawnWave(w);
    else if (t.kind === 'endInvincible') w.player.invincible = false;
  }
}
```
Thời lượng lấy từ `params/` (giây có `source`), đổi sang tick bằng một hàm dùng chung.

## 4. Kiểm
- Nghĩa vụ thời gian với case `normal` và `edge`: sự kiện xảy ra **đúng tick** (không chỉ "khoảng 2 giây"), hai hẹn giờ cùng tick, pause/timeScale giữa chừng.
- Replay test (`tests/replay/`) phải giống hệt sau khi thêm hẹn giờ.
- Lệch vài tick so với bản gốc → skill **parity-debug** (ghi trace, tìm tick đầu tiên lệch).
