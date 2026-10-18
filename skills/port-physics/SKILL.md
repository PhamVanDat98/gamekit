---
name: port-physics
description: Dùng ở P2 khi dựng lại chuyển động và va chạm — chọn tái hiện công thức gốc hay dùng thư viện vật lý (bản gốc dùng Box2D/Unity Physics2D, Arcade, Chipmunk hay tự viết), chuyển tham số vật lý sang params, xử lý thứ tự va chạm, vật đi xuyên khi nhanh, nền một chiều, dốc, trigger, và kiểm bằng nghĩa vụ edge + trace. Dùng cả khi người chơi thấy nhảy/rơi/nảy "khác cảm giác" bản gốc.
---

# Vật lý và va chạm (P2)

Vật lý là chỗ bản port hay "cảm giác khác" nhất, dù mọi con số đều đúng. Toàn bộ vật lý ảnh hưởng tới kết quả chơi nằm trong `src/core/`, chạy ở bước cố định (`runtime.fixedStepHz`); `view/` chỉ nội suy để vẽ.

## 1. Bản gốc làm vật lý thế nào?
Trả lời ở P1 (câu hỏi trong `notes/QUESTIONS.md`), rồi chọn:

| Bản gốc | Bản web |
| --- | --- |
| Tự viết: cộng vận tốc, AABB/hình tròn, phản xạ đơn giản | **Viết lại đúng công thức gốc** trong `core/` — gần như luôn khớp được tuyệt đối |
| Box2D (Unity Physics2D, Cocos 2.x Box2D, Godot 2D không dùng Box2D) | planck.js (bản Box2D cho JS) với cùng tham số; chấp nhận sai số nhỏ vì khác phiên bản/độ chính xác — đặt `tolerance` |
| Arcade (Phaser) | viết lại công thức Arcade (AABB, vận tốc, drag) hoặc dùng chính Phaser Arcade nếu runtime là Phaser — nhưng gọi từ `core/` thì phải tách khỏi phần vẽ |
| Engine 3D (PhysX, Bullet) | Rapier/cannon-es; khả năng khớp thấp — ghi `D-n`, thống nhất sai số với người dùng |

**Không thay sang một engine vật lý khác loại** (vd bản gốc Box2D → matter-js) chỉ vì tiện: hành vi va chạm, ma sát, nảy khác nhau rõ. Chọn ghi vào `DECISIONS.md` (skill runtime-select).

## 2. Tham số vào params/
Mọi tham số vật lý có `source`: trọng lực, ma sát, độ nảy (và cách gộp của hai vật — Unity PhysicsMaterial2D có combine mode), drag/linear damping, gravityScale, số vòng lặp solver (Box2D: velocity/position iterations), bước cố định, tỉ lệ đơn vị → px (Unity Pixels Per Unit; Box2D thường 32 px/m). Mặc định của engine cũng là số gốc: ghi rõ "mặc định của Unity 2021.3" làm source khi project không đổi.

## 3. Những chỗ hay lệch
- **Cách tích phân**: Euler hiện (vị trí trước, vận tốc sau) khác Euler nửa ẩn (vận tốc trước — Box2D dùng cách này). Sai thứ tự = quỹ đạo nhảy khác.
- **Thứ tự cập nhật**: vật nào di chuyển trước, va chạm xét theo thứ tự nào (theo id, theo thứ tự tạo). Giữ thứ tự ổn định (mảng theo id), không phụ thuộc thứ tự `Map`/`Set` tạo ra ngẫu nhiên.
- **Đi xuyên** khi nhanh: bản gốc có continuous collision không? Nếu có: chia bước nhỏ (substep) hoặc quét (swept AABB). Nếu không: đừng "sửa" — bản gốc đi xuyên thì bản web cũng đi xuyên (hoặc ghi `D-n`).
- **So sánh biên**: `<` hay `<=` khi chạm tường/chạm đất; khoảng hở (skin width, `Physics2D.defaultContactOffset`).
- **Nền một chiều, dốc, coyote time, buffer nhảy**: thường là code riêng của game, không phải engine — đọc code gốc.
- **Trigger và collider**: trigger không đẩy vật; ma trận layer quyết định cái gì va chạm cái gì — chuyển thành bảng trong `params/` hoặc `data/`.
- **float32**: Unity/Box2D dùng float32; JS dùng float64. Cần khớp tuyệt đối thì dùng `Math.fround` ở công thức then chốt; thường chỉ cần `tolerance`.

## 4. Kiểm
- Nghĩa vụ cho từng hành vi (rơi, nhảy cao bao nhiêu, nảy, trượt, va chạm góc) với case `edge`: tốc độ rất lớn, góc, hai vật cùng chạm một lúc, đứng sát tường.
- Oracle quỹ đạo từ bản gốc: chạy bản gốc với input cố định, ghi vị trí mỗi N frame (xem [oracle-harness](../parity-check/references/oracle-harness.md)), so bằng trace (skill **parity-debug**).
- Chơi thử cạnh bản gốc: độ cao nhảy, thời gian rơi, cảm giác dừng. Khác thì đo bằng trace trước khi chỉnh số.
