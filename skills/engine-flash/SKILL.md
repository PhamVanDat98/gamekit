---
name: engine-flash
description: Dùng ở P1 khi game.yaml có source.engine là flash (status gợi ý engine-flash) — game Flash .swf (ActionScript 2 hoặc 3) — xuất script và asset bằng JPEXS FFDec, đọc frame rate trong header, script trên timeline, và các bẫy (logic theo enterFrame, đơn vị twip, hitTest, MovieClip timeline). Dùng cả khi cần chạy lại game gốc bằng Ruffle để đo.
---

# Phân tích game Flash (P1)

Dùng cùng skill **re-notes**. `source.engineVersion` do recon ghi là `SWF <n>` (phiên bản định dạng).

## 1. Logic và data nằm ở đâu
- Toàn bộ nằm trong `.swf`: ActionScript (AS3 = class trong DoABC; AS2 = script gắn frame/nút/MovieClip), symbol (MovieClip, hình, âm thanh, font), timeline.
- **Frame rate** của stage nằm trong header SWF (FFDec hiển thị) — hầu hết logic chạy theo frame ở tốc độ này.
- Game có thể tải thêm `.swf`/XML khi chạy — tìm `Loader`, `URLLoader`, `loadMovie` để biết file phụ.

## 2. Công cụ
| Việc | Công cụ |
| --- | --- |
| Xem/xuất script, symbol, âm thanh, frame rate | JPEXS FFDec (GUI và dòng lệnh, có export) |
| Chạy để quan sát/đo (chỉ `own`, hoặc `third-party` khi người dùng đồng ý + `D-n`) | Ruffle (desktop/web) — AS3 hỗ trợ chưa đủ mọi API, kiểm chứng |

Script xuất ra để trong `decompiled/`. `third-party`: ghi chú bằng lời của mình.

## 3. Danh mục cơ chế
Recon không tự lập. Lập tay từ cây FFDec: AS3 — mỗi class gameplay một mục; AS2 — mỗi MovieClip có script/`onClipEvent` và mỗi frame có script logic một mục.

## 4. Quy trình cho một câu hỏi
1. Tìm class/symbol (tên linkage, chuỗi); đọc handler `ENTER_FRAME`/`onEnterFrame`, `onClipEvent(enterFrame)`, handler phím/chuột, script trên frame.
2. Số liệu: hằng trong script, biến đặt trên frame đầu, XML đi kèm.
3. `source` dạng `game.swf → class Player.onFrame` hoặc `game.swf → frame 2 (layer actions)`.
4. `params/` (đổi theo frame rate) + `spec/oracles/` ([oracle-harness](../parity-check/references/oracle-harness.md) — Flash thường chỉ đo được, `confidence: inferred` + `tolerance`).

## 5. Bẫy khi chuyển sang web
- **Logic theo frame**: tốc độ "5" là px/frame → × frame rate = px/s. Game không có dt.
- **Timeline là logic**: `gotoAndPlay`, `stop()`, nhãn frame, MovieClip lồng nhau có script riêng; animation và gameplay đan xen.
- **AS2 và AS3 khác nhau** (biến không khai báo kiểu, `_root`, `_x` của AS2). Đọc theo đúng phiên bản.
- **Va chạm**: `hitTestObject` dùng hình chữ nhật bao; `hitTestPoint(x, y, true)` dùng hình dạng thật — khác nhau rõ khi tái hiện.
- Đơn vị nội bộ SWF là twip (1/20 px) — FFDec thường đã đổi; tọa độ y xuống, góc `rotation` bằng độ.
- `Math.random()` không seed. Lưu `SharedObject` → `platform.save`.

## 6. Runtime web
Canvas/Pixi/Phaser cho 2D vector đã rasterize; vector phức tạp có thể giữ SVG. Quyết ở **runtime-select**.
