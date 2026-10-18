---
name: engine-gamemaker
description: Dùng ở P1 khi game.yaml có source.engine là gamemaker (status gợi ý engine-gamemaker) — game GameMaker (data.win, game.unx, game.ios, game.droid) — mở và decompile GML bằng UndertaleModTool, đọc object/event/room, và các bẫy (Step event theo room speed/game speed, alarm đếm step, hspeed/gravity/friction có sẵn, YYC không đọc được GML). Dùng cả khi recon báo có thể là YYC.
---

# Phân tích game GameMaker (P1)

Dùng cùng skill **re-notes**. `source.variant`: `bytecode` (VM). Recon cảnh báo khi có dấu hiệu YYC.

## 1. Logic và data nằm ở đâu
- `data.win` (Windows), `game.unx` (Linux), `game.ios` (iOS), `assets/game.droid` (Android): một file chứa object, event GML (bytecode với bản VM), room, sprite, âm thanh (có thể có `audiogroup*.dat` riêng).
- **YYC** (YoYo Compiler): GML đã biên dịch thành native trong binary — không còn bytecode; chỉ còn cách REA/Ghidra trên binary (`binary_overview`, `open_binary`, `analyze_function`). Đánh giá lại khả thi.

## 2. Công cụ
UndertaleModTool: mở file data, xem object/room/sprite, decompile GML (bản VM), xuất asset. Kết quả decompile để trong `decompiled/`. `third-party`: ghi chú bằng lời của mình.

## 3. Danh mục cơ chế
Lập tay từ danh sách Objects trong UndertaleModTool: mỗi object gameplay một mục (`kind: object`); script dùng chung lớn một mục.

## 4. Quy trình cho một câu hỏi
1. Mở object; đọc event Create (biến khởi tạo, số liệu), Step/Begin Step/End Step, Alarm[n], Collision, Draw (đôi khi có logic).
2. Room: creation code của room và **instance creation code** của từng instance (ghi đè biến theo từng con) — số liệu hay nằm ở đây.
3. `source` dạng `data.win → obj_player Step_0` hoặc `data.win → room rm_level3, instance 100123 creation code`.
4. `params/` + `spec/oracles/` ([oracle-harness](../parity-check/references/oracle-harness.md); thường đo, `confidence: inferred` + `tolerance`).

## 5. Bẫy khi chuyển sang web
- **Step event theo frame**: GMS1 `room_speed`, GMS2 game speed (FPS hoặc micro giây/frame trong Game Options). Tốc độ là px/step → × fps = px/s.
- **Chuyển động có sẵn** của instance: `hspeed`, `vspeed`, `speed`, `direction`, `gravity`, `gravity_direction`, `friction` được engine áp mỗi step theo công thức riêng — viết lại đúng thứ tự (trước/sau Step event).
- **Alarm** đếm ngược theo step, không theo giây.
- `direction` tính bằng độ, ngược chiều kim đồng hồ, 0 = phải, trong khi y hướng xuống.
- **Ngẫu nhiên**: `random`, `irandom(n)` (gồm n), `choose`; có seed qua `random_set_seed`, `randomize()` đặt seed ngẫu nhiên. Thuật toán nội bộ cần kiểm chứng nếu phải khớp chuỗi.
- Va chạm theo collision mask của sprite (hình chữ nhật hoặc chính xác theo pixel).
- Lưu `ini_*`/file → `platform.save`.

## 6. Runtime web
2D: Phaser/Pixi/canvas. Quyết ở **runtime-select**.
