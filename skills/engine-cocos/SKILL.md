---
name: engine-cocos
description: Dùng ở P1 khi game.yaml có source.engine là cocos (status gợi ý engine-cocos) — tìm logic và số liệu trong bản build Cocos Creator 2.x, 3.x hoặc native (APK có .jsc mã hoá), đọc dữ liệu prefab/scene đã serialize, và các bẫy khi chuyển sang web (update(dt), schedule, tween, physics PTM_RATIO, design resolution). Dùng cả khi bundle JS bị làm rối hoặc không tìm thấy số trong code.
---

# Phân tích game Cocos (P1)

Dùng cùng skill **re-notes**. Dạng build lấy từ `source.variant` của `gamekit recon` (chưa có: skill **game-recon**).

## 1. Logic và data nằm ở đâu
| `source.variant` | Logic | Data | Engine |
| --- | --- | --- | --- |
| `source` | `assets/**/*.ts` / `*.js` (component có `@ccclass` hoặc `cc.Class`) | `*.prefab`, `*.fire` (2.x) / `*.scene` (3.x) — JSON | `project.json` / `package.json` ghi phiên bản Creator |
| `creator-2` | `src/project.js` (2.0–2.3) hoặc `assets/<bundle>/index.js` (2.4) | `res/import/**/*.json`, `assets/<bundle>/import/**` | `cocos2d-js-min.js` |
| `creator-3` | `assets/<bundle>/index.js`, `src/chunks/` | `assets/<bundle>/import/**` | `cocos-js/` |
| `native` | `assets/src/*.jsc`, `assets/assets/<bundle>/index.jsc` — mã hoá xxtea | như creator-2/3 trong `assets/` | `libcocos2djs.so` / `libcocos.so` |

Bản build cũ hơn (cocos2d-x thuần, Lua: `libcocos2dlua.so`, `.luac`) recon chưa nhận riêng: đọc Lua bytecode bằng công cụ decompile Lua phù hợp phiên bản (kiểm chứng), có thể cũng mã hoá xxtea.

**Số liệu** thường đặt ở thuộc tính component (`@property` / `properties:`) và được serialize vào prefab/scene. Từ 2.4 và 3.x, JSON import ở dạng nén ("packed": mảng, tham chiếu class theo chỉ số) — đọc tay được nhưng chậm; với game của người dùng, chạy game trong trình duyệt rồi đọc giá trị qua console (`cc.find('Canvas/Player').getComponent('PlayerCtrl')`) là nhanh nhất.

## 2. Công cụ
| Việc | Công cụ |
| --- | --- |
| Cấu trúc bundle, module, import | REA `analyze_javascript_application` |
| Đọc code | source map nếu có (recon báo); prettier/js-beautify để format |
| Code làm rối kiểu `_0x…` | công cụ gỡ javascript-obfuscator (vd webcrack — kiểm chứng kết quả) |
| `.jsc` | tìm khoá xxtea trong `libcocos2djs.so` (REA `open_binary`, tìm chuỗi/hàm quanh `xxtea`/`setXXTeaKey`), giải mã, giải nén nếu là zip/gzip; rồi chạy recon lại trên thư mục đã giải mã |
| Chạy và quan sát (chỉ `own`) | DevTools, breakpoint trong bundle, `cc.director.getScene()` |
| Asset | `res/raw-assets`, `assets/<bundle>/native/**`; atlas `.plist`/`.json` |

## 3. Danh mục cơ chế
`gamekit recon <bản build> --write` lấy tên component từ `cc._RF.push(…, "Tên")` (2.x) và `@ccclass('Tên')`. Bundle mã hoá hoặc không có tên: lập tay theo scene/prefab.

## 4. Quy trình cho một câu hỏi
1. Tìm component theo tên trong danh mục; REA `trace_feature` hoặc tìm chuỗi (tên node, tên event).
2. Đọc `onLoad`/`start`, `update(dt)`, callback `schedule`, handler va chạm (`onCollisionEnter`, `onBeginContact`), event (`node.on`, `cc.systemEvent`).
3. Lấy giá trị thuộc tính từ prefab/scene (mục 1), ghi `source` dạng `assets/main/import/xx/xxxx.json → PlayerCtrl.speed`.
4. `params/` kèm `unit`, `confidence`; bảng → `spec/oracles/` ([oracle-harness](../parity-check/references/oracle-harness.md), cách JS + Playwright).

## 5. Bẫy khi chuyển sang web
- **`update(dt)` có `dt` thay đổi** theo frame; `cc.game.setFrameRate` (mặc định 60). Code không nhân `dt` chạy theo frame.
- **`schedule(cb, interval, repeat, delay)`** và `scheduleOnce`: chạy theo bộ hẹn giờ của director, chịu `cc.director.getScheduler().setTimeScale`. Ghi đúng interval/repeat/delay.
- **Tween/action** (`cc.tween`, `cc.moveTo`, `cc.sequence`…): chép thời lượng và đúng tên easing (`cc.easing.*` / `easing: 'quadOut'`) — easing khác làm cảm giác khác.
- **Tọa độ**: y hướng lên, gốc node ở anchor (mặc định 0.5, 0.5), vị trí là tương đối node cha. Đổi về hệ y xuống của canvas khi vẽ, không khi tính logic nếu giữ nguyên công thức gốc.
- **Design resolution** + Fit Width/Fit Height trên component Canvas quyết định game "nhìn thấy" bao nhiêu; ghi vào params thế giới.
- **Physics**: Creator 2.x dùng Box2D với `cc.PhysicsManager.PTM_RATIO = 32` (px trên mét); Creator 3.x chọn builtin/box2d/cannon/bullet trong Project Settings. Va chạm không physics (Collision Manager) là AABB/polygon đơn giản — dễ viết lại đúng. Quyết engine physics ở **runtime-select**.
- **Ngẫu nhiên**: `Math.random` không có seed — không có chuỗi gốc để khớp; ghi phân phối và miền giá trị.
- **Lưu**: `cc.sys.localStorage` → `platform.save`.
- **Game đã là JS**: với `own`, dịch logic sang TypeScript nhanh, nhưng vẫn đưa vào `core/` thuần (không `cc.*`, không `Math.random`, số qua `params/`).

## 6. Runtime web
2D: Pixi/Phaser/canvas thuần; có thể giữ cách tổ chức scene. Quyết ở **runtime-select**.
