---
name: engine-godot
description: Dùng ở pha P1 khi game gốc làm bằng Godot 3 hoặc 4 — giải .pck và decompile GDScript bằng GDRE Tools, đọc project.godot, lấy số từ .tscn/.tres vào params, map _process/_physics_process, signal, Timer, AnimationPlayer, physics body sang core/view của template.
---

# Phân tích game Godot (P1)

Phương pháp chung (câu hỏi trước, đừng tin decompiler, cách ghi kết luận): skill **re-notes**. Skill này chỉ thêm phần riêng của Godot. Project khôi phục từ `.pck` là code decompile: để trong `decompiled/` (gitignored, hook chặn commit); asset xuất ra để trong `reference/`.

## 1. Lấy project
| Dạng | Cách |
| --- | --- |
| Project (`project.godot`) | `own`: mở bằng Godot Editor đúng version (`source.engineVersion`), đọc thẳng `.gd`; chạy với debugger, `print` giá trị, viết script xuất bảng làm oracle `observed` (không vào repo game) |
| `.pck` riêng, `.pck` trong APK (`assets/*.pck`), hoặc nhúng trong file chạy | GDRE Tools "Recover project" → `decompiled/gdre/`. Recon đọc version từ header `.pck` |
| Script `.gd` | text, đọc thẳng |
| `.gdc` (bytecode/token) | GDRE decompile — cần đúng version engine |
| `.gde` hoặc `.pck` mã hoá | cần key mã hoá script (256-bit, nằm trong file chạy). Không lấy được → ghi `notes/QUESTIONS.md`, báo lại triage |

GDRE cũng chuyển texture đã import (`.stex` ở Godot 3, `.ctex` ở Godot 4) về PNG và âm thanh về file thường. `own`: chọn asset cần dùng, xuất sang `assets/`/`public/`, nhãn `own`. `third-party`: chỉ là tư liệu; chỉ phân tích file tĩnh, không chạy debugger hay sửa game đang chạy.

## 2. `project.godot`: số cấp project
- Độ phân giải: `window/size/width|height` (3) / `window/size/viewport_width|height` (4), chế độ stretch → `world.width/height`.
- Tần số vật lý: `physics/common/physics_fps` (3) / `physics/common/physics_ticks_per_second` (4), mặc định 60 → `runtime.fixedStepHz`.
- Trọng lực 2D: `physics/2d/default_gravity` (+ hướng). Khoá nào không có trong file thì engine dùng giá trị mặc định của version đó: ghi `source` là "mặc định Godot <version>", `confidence: derived`.
- `[input]`: action và phím → `Action` trong `src/contracts/input.ts`. `[autoload]`: singleton giữ state toàn cục (điểm, tiền, tiến trình).

## 3. `.tscn` / `.tres` là nguồn số liệu
- Biến `export var` / `@export var` có giá trị mặc định trong script, nhưng giá trị ghi trong `.tscn` (node instance) hoặc `.tres` **ghi đè** nó. Lấy giá trị có hiệu lực: `source` = `res://…/player.tscn: [node name="Player"] speed`, `confidence: observed`.
- `CollisionShape2D` + `shape` sub_resource (kích thước, offset), `Timer` (`wait_time`, `one_shot`, `autostart`), `[connection signal=… from=… to=… method=…]` (ai nghe signal nào) — đều ghi vào notes và `params/`.
- `Resource` tuỳ chỉnh (`.tres`: bảng quái, level, item) → `params/` hoặc `spec/oracles/`.

## 4. Map Godot → template
| Godot | Template |
| --- | --- |
| `_physics_process(delta)` | `stepWorld(…, dt)` fixed step trong `src/core/` |
| `_process(delta)` | logic gameplay trong đó chuyển vào fixed step; ghi chú hành vi phụ thuộc fps của bản gốc. Chỉ hiệu ứng hình → `view/` |
| signal, `emit_signal` / `.emit()` | gọi hàm trực tiếp trong core, hoặc `WorldEvent` trả về cho view/analytics |
| `Timer`, `await get_tree().create_timer(t).timeout` / `yield(…)` | timer trong state, đếm bằng thời gian mô phỏng |
| `AnimationPlayer` (track thuộc tính, track gọi hàm) | track đổi gameplay (hitbox bật, vị trí, gọi hàm ở giây t) → bảng frame trong `params/`/`spec/oracles/`; còn lại → `view/` |
| `Tween` | ảnh hưởng gameplay → hàm theo thời gian + easing trong core; trang trí → view |
| `CharacterBody2D`/`KinematicBody2D` `move_and_slide`, `Area2D` | tái hiện đúng ngữ nghĩa trượt/va chạm cần cho gameplay trong core, kèm test biên |
| `RigidBody2D` | engine vật lý khó khớp tuyệt đối: tự viết nếu công thức đơn giản, thư viện vật lý JS chỉ khi kết quả khớp — ghi `DECISIONS.md` |
| `randi`, `randf`, `RandomNumberGenerator` | `Rng` có seed |
| `FileAccess`/`File` lưu `user://`, `ConfigFile` | `platform.save.get/set` |
| `Label`, `tr()`, file dịch `.csv`/`.po`/`.translation` | key trong `Language/*.json`, gọi `t()` (bảng dịch gốc chuyển sang); ảnh có chữ → `assets/i18n/en/` + `tAsset()` |

Toạ độ 2D của Godot là px, y hướng xuống như canvas; kiểm tra `scale` của node cha và camera zoom trước khi lấy kích thước.

## 5. Kết thúc
Ghi `notes/godot.md`: version, cách lấy project, script/scene chứa từng cơ chế, chỗ khó chuyển sang web (`third-party`: bằng lời của mình). Số vào `params/` có `source` + `confidence`. `npm run gk -- validate`, `npm run gk -- gate`; báo người dùng câu nào trong `notes/QUESTIONS.md` còn mở. Tiếp: **re-notes**, rồi **gameplay-spec**, **asset-inventory**, **ui-extract**.
