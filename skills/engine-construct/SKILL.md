---
name: engine-construct
description: Dùng ở P1 khi game.yaml có source.engine là construct (status gợi ý engine-construct) — game Construct 2/3 (c2runtime.js/c3runtime.js + data.json) — đọc event sheet và tham số behavior trong data.json hoặc project .c3p, lập danh mục cơ chế theo event sheet, và các bẫy (thứ tự event mỗi tick, dt, behavior Platform/Bullet/8Direction). Dùng cả khi người dùng có file project .c3p/.capx.
---

# Phân tích game Construct (P1)

Dùng cùng skill **re-notes**. `source.variant`: `c3` hoặc `c2`.

## 1. Logic và data nằm ở đâu
- **Có project** (`.c3p` là zip, `.capx` cho C2) — game của người dùng: mở bằng Construct editor, đọc event sheet trực tiếp. Nhanh và chắc nhất.
- **Chỉ có bản export**: `data.json` chứa layout, object type, tham số behavior và event sheet ở dạng mảng lồng nhau đã rút gọn; `c3runtime.js`/`c2runtime.js` là engine (không phải logic game). Không có công cụ dịch ngược đáng tin cho event sheet — đọc `data.json` bằng tay (format đẹp bằng `jq`/prettier) và đối chiếu tên object/biến.
- Asset: `images/`, `media/`, sprite sheet.

## 2. Danh mục cơ chế
`gamekit recon` không tự lập. Lập tay trong `spec/inventory.yaml`: mỗi event sheet (và group lớn trong đó) một mục, mỗi object type có behavior gameplay một mục (`kind: behavior`).

## 3. Quy trình cho một câu hỏi
1. Tìm object type liên quan và behavior của nó (tên behavior + tham số: Platform `max speed`, `acceleration`, `deceleration`, `jump strength`, `gravity`, `max fall speed`; Bullet `speed`, `acceleration`; Sine `period`, `magnitude`…).
2. Tìm event dùng object đó: điều kiện (`On collision`, `Every X seconds`, `Is overlapping`), hành động, biến instance/global.
3. Ghi `source` dạng `data.json → event sheet "Game" / group "Spawn"` hoặc `data.json → object Player, behavior Platform.maxSpeed`.
4. `params/` + `spec/oracles/` ([oracle-harness](../parity-check/references/oracle-harness.md): game của người dùng chạy được trong trình duyệt để đo).

## 4. Bẫy khi chuyển sang web
- **Event chạy từ trên xuống mỗi tick**; trigger (`On …`) chạy khi sự kiện xảy ra, không theo thứ tự. Sub-event, `Else`, `Pick` (chọn instance) quyết định ai bị ảnh hưởng.
- **`dt`**: behavior tự nhân dt; event tự viết có thể quên `* dt` (chạy theo frame). Cài đặt `Minimum framerate` của project giới hạn dt lớn nhất.
- **Behavior có công thức riêng** (Platform: tăng tốc, ma sát, nhảy, slope; Bullet; Physics = Box2D). Tái hiện bằng công thức tương đương trong `core/`, kiểm bằng oracle đo từ bản gốc.
- **`random(a, b)`** không seed; `choose()`.
- **Lưu**: plugin LocalStorage / WebStorage → `platform.save`.
- Tọa độ y xuống, góc độ (degree), layout size và viewport quyết định vùng chơi.

## 5. Runtime web
Phaser (Arcade) hoặc canvas thuần thường đủ. Quyết ở **runtime-select**.
