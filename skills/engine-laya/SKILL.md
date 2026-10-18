---
name: engine-laya
description: Dùng ở P1 khi game.yaml có source.engine là laya (status gợi ý engine-laya) — game LayaAir 1/2/3 xuất ra JS (bundle.js, laya.*.js) — tìm logic trong bundle, số liệu trong file scene/prefab của LayaAir IDE, và các bẫy (Laya.timer theo frame hay ms, Laya.stage.frameRate, Tween, physics). Dùng cả khi game là mini-game Trung Quốc xuất từ Laya.
---

# Phân tích game LayaAir (P1)

Dùng cùng skill **re-notes**.

## 1. Logic và data nằm ở đâu
| Thứ | Ở đâu |
| --- | --- |
| Engine | `libs/laya.core.js`, `laya.*.js` (không phải logic game) |
| Logic | `js/bundle.js` hoặc bundle tương tự (TS/AS3 đã biên dịch); có thể kèm source map |
| Scene, prefab, UI | file JSON của LayaAir IDE (`.scene`, `.json`, `.prefab`; 3D: `.ls`, `.lh`) — chứa thuộc tính component, số liệu |
| Bảng cấu hình | JSON/CSV trong `res/` hoặc `config/` (game Laya hay dùng bảng cấu hình xuất từ Excel) |

## 2. Công cụ
REA `analyze_javascript_application` cho bundle; prettier/js-beautify; source map nếu có; công cụ gỡ javascript-obfuscator khi bị làm rối (đối chiếu kết quả). Game của người dùng: chạy trong trình duyệt, DevTools.

## 3. Danh mục cơ chế
Recon chưa tự lập. Lập tay: mỗi class script (thường `extends Laya.Script` hoặc class trong namespace game) một mục; bảng cấu hình lớn một mục.

## 4. Quy trình cho một câu hỏi
1. Tìm class qua chuỗi (tên scene, tên tài nguyên) hoặc REA `trace_feature`.
2. Đọc `onAwake`/`onEnable`/`onUpdate`, callback `Laya.timer`, handler va chạm.
3. Số liệu từ scene/prefab JSON hoặc bảng cấu hình; `source` dạng `res/config/level.json → level[3].speed`.
4. `params/` + `spec/oracles/` ([oracle-harness](../parity-check/references/oracle-harness.md), cách JS + Playwright cho game của người dùng).

## 5. Bẫy khi chuyển sang web
- **`Laya.timer.frameLoop(n, …)`/`frameOnce` tính theo frame**, còn `loop(ms, …)`/`once` tính theo ms — đọc đúng hàm. `Laya.stage.frameRate` (`fast` 60 / `slow` 30 / `mouse`) đổi tốc độ code theo frame.
- `onUpdate` có thể không nhân `Laya.timer.delta` → theo frame.
- **Tween** (`Laya.Tween.to(…, duration, Laya.Ease.xxx)`): chép thời lượng, easing.
- **Physics** LayaAir 2: Box2D (đơn vị theo tỉ lệ px/m của engine — kiểm trong code); 3D: Bullet/Cannon — cân nhắc kỹ khả thi.
- `Math.random` không seed. Lưu `Laya.LocalStorage` → `platform.save`.

## 6. Runtime web
2D: Pixi/Phaser/canvas; 3D: Three.js. Quyết ở **runtime-select**.
