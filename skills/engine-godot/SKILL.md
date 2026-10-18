---
name: engine-godot
description: Dùng ở P1 khi game.yaml có source.engine là godot (status gợi ý engine-godot) — khôi phục project từ .pck (rời, trong APK hoặc nhúng trong exe), đọc GDScript 3/4, số liệu trong .tscn/.tres, kết nối signal và AnimationPlayer, và các bẫy khi chuyển sang web (_process vs _physics_process, physics fps, RandomNumberGenerator). Dùng cả khi .pck bị mã hoá hoặc script chỉ có bản .gdc.
---

# Phân tích game Godot (P1)

Dùng cùng skill **re-notes**. `source.variant` của `gamekit recon`: `source` (có `project.godot`) hoặc `pck`.

## 1. Logic và data nằm ở đâu
| Thứ | Ở đâu |
| --- | --- |
| Logic | `*.gd` (text) hoặc `*.gdc` (bytecode/token — trong bản export), C# nếu dùng Godot Mono (`*.dll` trong `data_*`) |
| Cài đặt dự án | `project.godot`: kích thước cửa sổ, stretch mode, physics fps, autoload (singleton toàn cục), input map |
| Số liệu | thuộc tính `export` trong `.tscn` (scene) và `.tres` (resource) — text, ghi đè mặc định trong script |
| Kết nối logic ngoài code | `[connection signal=… from=… to=… method=…]` trong `.tscn`; track AnimationPlayer gọi method / đổi property; node `Timer` (`wait_time`, `one_shot`, `autostart`) |
| Asset | `.import/` (3.x) / `.godot/imported/` (4.x) chứa bản đã chuyển đổi; ảnh/âm thanh gốc nếu được đóng gói |

## 2. Công cụ
| Việc | Công cụ |
| --- | --- |
| Khôi phục project từ `.pck`/exe/APK, decompile `.gdc` | GDRE Tools (kiểm phiên bản Godot nó hỗ trợ) |
| `.pck` mã hoá | cần khoá mã hoá biên dịch trong binary: tìm bằng REA `open_binary` / `binary_overview` trên exe/`libgodot_android.so`, rồi đưa khoá cho GDRE |
| Godot Mono (C#) | REA `inspect_managed_artifact`, ILSpy |
| Danh sách script, phiên bản | `gamekit recon <file.pck | thư mục project> --write` |

## 3. Danh mục cơ chế
`gamekit recon` lấy danh sách script `.gd`/`.gdc` (từ project hoặc thư mục `.pck`). Script gắn vào scene nào: tìm `ext_resource … type="Script"` trong `.tscn`. Autoload trong `project.godot` là cơ chế toàn cục — đưa vào danh mục nếu chưa có.

## 4. Quy trình cho một câu hỏi
1. Tìm script và scene dùng nó; đọc `_ready`, `_process(delta)`, `_physics_process(delta)`, `_input`/`_unhandled_input`, hàm nhận signal.
2. Lấy giá trị `export` trong `.tscn`/`.tres`; kiểm signal connections và AnimationPlayer trong scene đó.
3. `source` dạng `scenes/player.tscn → Player.speed` hoặc `player.gd _physics_process`.
4. `params/` + `spec/oracles/`; game của người dùng chạy được Godot headless để sinh oracle: [oracle-harness](../parity-check/references/oracle-harness.md).

## 5. Bẫy khi chuyển sang web
- **`_process(delta)`** chạy mỗi frame; **`_physics_process(delta)`** chạy cố định theo `physics/common/physics_fps` (3.x) / `physics_ticks_per_second` (4.x), mặc định 60. Đặt `runtime.fixedStepHz` theo giá trị trong `project.godot`.
- **GDScript 3 và 4 khác nhau**: `yield` → `await`, `export` → `@export`, `onready` → `@onready`, `move_and_slide(velocity, up)` (3.x trả về vận tốc) → thuộc tính `velocity` (4.x). Đọc đúng ngữ nghĩa phiên bản gốc.
- **Physics**: `KinematicBody2D`/`CharacterBody2D` + `move_and_slide` có hành vi trượt/bậc thang riêng; `RigidBody2D` dùng engine physics của Godot — khó khớp chính xác bằng engine web; ghi `D-n` khi lệch.
- **Tọa độ** y hướng xuống như canvas; góc tính bằng radian; `Vector2.angle()` từ trục x.
- **Ngẫu nhiên**: `RandomNumberGenerator` (PCG32) có `seed`; hàm toàn cục `randi()`/`randf()` dùng bộ sinh toàn cục (`seed()`, `randomize()`). Nội dung sinh từ seed cần thuật toán đúng + oracle.
- **Chia số nguyên** trong GDScript với `int` cắt phần thập phân; `%` với số âm theo C. Dùng `Math.trunc` khi viết lại.
- **Timer, Tween, AnimationPlayer** chứa thời lượng và gameplay — lấy số từ scene, không đoán.
- **Lưu**: `user://` (FileAccess/ConfigFile) → `platform.save`.

## 6. Runtime web
Godot có xuất web chính thức, nhưng GameKit dựng lại bằng TS để đóng gói portal và kiểm parity. 2D y xuống: canvas/Pixi/Phaser. Quyết ở **runtime-select**.
