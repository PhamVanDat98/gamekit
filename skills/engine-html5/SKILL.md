---
name: engine-html5
description: Dùng ở P1 khi game.yaml có source.engine là html5 (status gợi ý engine-html5) — game web viết bằng JS thuần hoặc Phaser, PixiJS, Three.js, CreateJS — tách bundle, đọc source map, gỡ làm rối, tìm config/level JSON, và các bẫy (requestAnimationFrame dt, Arcade physics, Math.random, setTimeout). Dùng cả khi game gốc đã là web nhưng cần dựng lại cho deterministic và đóng gói portal.
---

# Phân tích game HTML5 (P1)

Dùng cùng skill **re-notes**. `source.variant` của `gamekit recon`: `phaser`, `pixi`, `three`, `createjs` hoặc `js`.

## 1. Logic và data nằm ở đâu
| Thứ | Ở đâu |
| --- | --- |
| Logic | bundle JS lớn nhất (webpack/rollup/vite), đôi khi nhiều chunk; file `*.js.map` nếu còn |
| Cấu hình engine | object config khi tạo game (Phaser: `new Phaser.Game({ physics: { arcade: { gravity, fps } }, fps, scale })`) |
| Level, bảng số | JSON trong `assets/`/`data/`, map Tiled (`.tmj`/`.json`/`.tmx`), mảng hằng trong bundle |
| Asset | `assets/`, `img/`, `audio/`; atlas `.json` + `.png` |

## 2. Công cụ
| Việc | Công cụ |
| --- | --- |
| Module, import, entry | REA `analyze_javascript_application` |
| Đọc code | source map (khôi phục file gốc); prettier / js-beautify để format |
| Làm rối `_0x…` (recon báo) | công cụ gỡ javascript-obfuscator (vd webcrack); luôn đối chiếu kết quả với bản gốc |
| Chạy và đo (chỉ `own`) | DevTools: breakpoint, `Performance`, đọc biến trong console |
| Tìm hàm theo hành vi | REA `trace_feature`; tìm chuỗi (tên scene, tên asset, key input) |

`third-party`: chỉ đọc file tĩnh, ghi chú bằng lời của mình.

## 3. Danh mục cơ chế
`gamekit recon` chưa tự lập danh mục cho HTML5 thuần. Lập tay trong `spec/inventory.yaml`: mỗi scene (Phaser `class X extends Phaser.Scene`), mỗi class/entity, mỗi module gameplay của bundle là một mục; id = tên class hoặc đường dẫn module trong source map.

## 4. Quy trình cho một câu hỏi
1. Tìm module/class qua source map hoặc chuỗi; đọc hàm `update(time, delta)` / vòng `requestAnimationFrame`, handler input, callback va chạm (`physics.add.collider`/`overlap`).
2. Số liệu: hằng trong bundle, config game, JSON level. Ghi `source` dạng `main.js (source map: src/player.ts) Player.update`.
3. `params/` + `spec/oracles/`; với game của người dùng, gọi thẳng hàm của game trong trình duyệt để sinh oracle: [oracle-harness](../parity-check/references/oracle-harness.md).

## 5. Bẫy khi chuyển sang web
- **`requestAnimationFrame` có dt thay đổi**; nhiều game nhân `delta` (ms) chứ không phải giây — kiểm đơn vị. Code không nhân dt chạy nhanh hơn trên màn 120/144 Hz: ghi rõ đó là theo frame ở 60 Hz.
- **Phaser Arcade physics**: vận tốc px/s, `drag`, `gravity`, `bounce`, `maxVelocity`; bước vật lý theo `physics.arcade.fps` (mặc định 60). Matter.js (Phaser) là engine khác. Viết lại công thức Arcade trong `core/` là khả thi.
- **Timer**: `setTimeout`/`setInterval`, `this.time.addEvent`, tween (`this.tweens.add` với `ease`) — chuyển sang thời gian mô phỏng (dt), chép đúng easing.
- **`Math.random` không seed** → không khớp chuỗi; ghi phân phối. Game tự viết PRNG: chép đúng thuật toán (RNG gốc, skill rebuild-game).
- **Phụ thuộc DOM/kích thước màn hình** trong logic (vd spawn theo `window.innerWidth`): tách thành params của thế giới logic.
- **Lưu**: `localStorage` → `platform.save`; SDK portal cũ của game (nếu có) bỏ, thay ở P4.
- **Game đã là JS**: với `own`, dịch sang TS nhanh, nhưng vẫn đưa vào `core/` thuần và số qua `params/`.

## 6. Runtime web
Giữ cùng họ thư viện nếu hợp (Phaser → Phaser, Pixi → Pixi) để bớt việc ở `view/`. Quyết ở **runtime-select**.
