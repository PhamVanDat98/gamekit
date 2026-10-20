---
name: engine-construct
description: Dùng ở pha P1 khi gamekit recon báo Construct 2/3 (c2runtime.js, c3runtime.js, scripts/c3main.js) — đọc event sheet trong data.json (điều kiện, hành động, sub-event, picking), lấy thuộc tính behavior (Platform, 8Direction, Bullet…) làm params, hiểu family, chuyển layout thành dữ liệu level.
---

# Phân tích game Construct (P1)

Phương pháp chung theo skill **re-notes**; skill này chỉ thêm phần riêng của Construct. Ghi vào `notes/construct.md` và file chủ đề (`notes/events-<sheet>.md`).

## 1. Nguồn tốt nhất trước
- `own`: hỏi người dùng file project `.c3p` (C3) / `.capx` (C2) — đó là zip, mở bằng Construct là thấy event sheet nguyên bản. Recon chỉ nhận ra bản export.
- Bản export: C3 có `data.json` + `scripts/c3runtime.js` (+ `scripts/c3main.js`); C2 có `c2runtime.js` + `data.js` (nội dung cũng là JSON). JS người dùng viết trong event (C3) nằm ở `scripts/project/` hoặc `scriptsInEvents.js`.
- `c2runtime.js`/`c3runtime.js` là **runtime của Scirra**, không phải code game: chỉ đọc để hiểu một behavior làm gì, không chép, không port. Logic game là event sheet.

## 2. Đọc data.json
File là mảng lồng nhau, tham chiếu bằng chỉ số chứ không bằng tên. Viết một script nhỏ (để trong `decompiled/construct/`, gitignored) giải chỉ số → tên và in event sheet ra dạng giả mã đọc được:
- **Object type**: tên, plugin (Sprite, Text, TiledBackground…), behavior gắn kèm + thuộc tính, instance variable mặc định, animation (tên, tốc độ fps, lặp, frame + rect trong sheet ảnh).
- **Event**: danh sách điều kiện → danh sách hành động → sub-event. Mỗi điều kiện/hành động gồm: object type, hàm ACE (C2: chuỗi dạng `cr.plugins_.Sprite.prototype.cnds.IsOverlapping`; C3: tên ACE ứng với `C3.Plugins.<Plugin>.Cnds/Acts/Exps` trong runtime), tham số (biểu thức đã biên dịch thành cây). Tra tên ACE trong runtime khi không chắc nghĩa.
- Ngữ nghĩa cần giữ: sheet chạy từ trên xuống mỗi tick; điều kiện **lọc instance** (picking) và hành động chỉ áp cho instance đã lọc; sub-event kế thừa picking; `Trigger once while true`, `On created`, trigger (`On collision`) chạy ngoài thứ tự; `Else`; include sheet; group bật/tắt; function.
- Global variable và instance variable mặc định là số gameplay → `params/`.

## 3. Thời gian
Construct tick theo tần số màn hình, `dt` thay đổi. Behavior đã nhân `dt` nên thuộc tính là đơn vị **trên giây**. Event viết tay **không** dùng `dt` (vd `Set X to Self.X + 5` mỗi tick) là px/tick, phụ thuộc fps: ghi `unit: "px/tick@60fps"` và ghi rõ giả định 60 Hz. `Every X seconds`, `Wait` → giây theo game time (`timescale`). C2 có thuộc tính project giới hạn `dt` tối đa (minimum framerate) — ghi lại. `random()`/`choose()` không seed: core dùng `Rng`, parity so phân phối.

## 4. Behavior → params
Đọc thuộc tính **thật** của từng object type trong data.json (`observed`); bảng dưới chỉ là mặc định của Construct để nhận ra giá trị chưa chỉnh — đối chiếu tài liệu Scirra đúng bản trước khi dựa vào.

| Behavior | Thuộc tính (mặc định) | Đơn vị |
| --- | --- | --- |
| Platform | max speed 330, acceleration 1500, deceleration 1500, jump strength 650, gravity 1500, max fall speed 1000, double jump, jump sustain | px/s, px/s², ms |
| 8Direction | max speed 200, acceleration 600, deceleration 500, directions, set angle | px/s, px/s² |
| Bullet | speed 400, acceleration 0, gravity 0, bounce off solids, set angle | px/s, px/s² |
| Sine | movement, wave, period 4, magnitude 50, period/magnitude random, offset | s, px hoặc độ |
| Rotate | speed 180, acceleration 0 | độ/s, độ/s² |
| Fade | fade in 0, wait 0, fade out 1, destroy | s |
| Solid, Jumpthru, Physics, Car, Pathfinding… | đọc từ data | — |

Ví dụ: `"player": { "maxSpeed": { "value": 330, "unit": "px/s", "source": "data.json objectType Player, behavior Platform.maxSpeed", "confidence": "observed" } }`. Cách behavior tính (Platform: thứ tự gia tốc, trọng lực, va chạm dốc) phải tái hiện trong `core/` bằng code tự viết, có test parity; ghi phần đã kiểm chứng và phần còn đoán.

## 5. Family, layout
- **Family** = nhóm object type dùng chung behavior, biến, event. Trong `core/` mô hình bằng tag/union type, không nhân đôi logic cho từng type.
- **Layout** = level: layer (parallax, scale), instance (type, x, y, width, height, angle, biến instance, thứ tự z), tilemap. Xuất sang JSON của mình trong `public/StreamingAssets/` (chỉ key, không câu chữ); layout dài nhiều level → `spec/oracles/` nếu dùng để test.
- **Text**: chuỗi trong object Text, biến, dictionary/JSON → `Language/en.json` + `t()`. Ảnh có chữ → `assets/i18n/en/` qua `tAsset()`, `text: true` trong `asset-manifest.json`.
- **Asset**: `images/` là sheet ảnh đã pack (rect nằm trong data.json), `media/` là âm thanh (webm/ogg/m4a) — đã ở định dạng web. `own`: dùng lại, `gamekit provenance add … --label own`. `third-party`: để trong `reference/`.

## 6. Kết thúc
`notes/` có giả mã từng sheet (`own` được dẫn tên event/sheet gốc; `third-party` viết bằng lời của mình), `params/` đủ `source` + `confidence`, `notes/QUESTIONS.md` cập nhật, `gamekit validate`. Báo người dùng: C2 hay C3, số sheet/object type/layout, behavior dùng tới, chỗ nào phụ thuộc fps. Tiếp theo: **re-notes** cho câu còn mở → gameplay-spec → `gamekit gate`.
