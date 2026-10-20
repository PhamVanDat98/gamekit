---
name: engine-laya
description: Dùng ở pha P1 khi gamekit recon báo LayaAir (laya.core.js, libs/laya.*.js, liblaya.so) — tách code game trong bundle.js khỏi thư viện laya.*.js, đọc scene/prefab JSON (.ls/.lh, .scene) và atlas, đổi thời gian của Laya.timer.frameLoop/loop sang params có unit, xử lý bản build WeChat/minigame.
---

# Phân tích game LayaAir (P1)

Phương pháp chung theo skill **re-notes**; skill này chỉ thêm phần riêng của LayaAir. Ghi vào `notes/laya.md` và các file chủ đề.

## 1. Bản nào, code ở đâu
| Thấy | Ý nghĩa |
| --- | --- |
| `libs/laya.core.js`, `laya.webgl.js`, `laya.ui.js`, `laya.physics.js`… | thư viện engine (recon đọc `version` trong `laya.core.js` → `engineVersion`). Chỉ đọc để hiểu API, không port |
| `js/bundle.js` | **code game** (TS/AS3 đã biên dịch; tên class thường còn) |
| `ui/layaUI.max.all.js` (Laya 1) | dữ liệu UI nhúng trong JS (`uiView`) |
| `.scene`, `.json` UI (Laya 1/2); `.ls` scene, `.lh` prefab (3D, và mọi scene ở Laya 3) | cây node JSON: type, props, children, component/script gắn kèm |
| `.atlas` + PNG | atlas kiểu TexturePacker: `frames.<tên>.frame {x,y,w,h}`, `sourceSize`, `meta.image` |
| `game.js`, `game.json`, `project.config.json`, adapter (`weapp-adapter.js`, `laya.wxmini.js`) | bản WeChat/minigame (xem mục 5) |

Thư viện gộp chung một file hoặc đã minify: tìm chuỗi `Laya.` / `laya.version` để xác nhận; recon có thể chỉ báo HTML5 hoặc không nhận ra — khi đó sửa `source.engine: laya` trong `game.yaml`. `own`: hỏi người dùng project LayaAir IDE (`src/` TypeScript/AS3) — đọc thẳng, khỏi đọc bundle.

## 2. Đọc bundle.js
Beautify bản sao vào `decompiled/laya/` (gitignored); có `bundle.js.map` thì lấy `sourcesContent` (với `own` đó chính là source). Bắt đầu từ class main (`new Main()`, `Laya.init`/`Laya3D.init` với kích thước thiết kế, `scaleMode`, `screenMode`), rồi tới các script component (Laya 2/3: `extends Laya.Script` với `onAwake`, `onEnable`, `onStart`, `onUpdate`, `onLateUpdate`) và scene được gắn script trong `.ls`/`.scene`.

## 3. Thời gian
| API | Đơn vị gốc | Ghi params |
| --- | --- | --- |
| `Laya.timer.frameLoop(n, …)`, `frameOnce` | mỗi n frame | `unit: "frame"`; tốc độ trong đó là `px/frame@<fps>` |
| `Laya.timer.loop(ms, …)`, `once` | ms | `unit: "ms"` |
| `onUpdate()` của Script | mỗi frame, không có dt | như frameLoop |
| nhân `Laya.timer.delta` | ms giữa hai frame | đã theo thời gian thật → đổi sang giây |

Fps gốc lấy từ `Laya.stage.frameRate` (`"fast"` = 60, `"slow"` = 30, `"mouse"` đổi theo chuột) và `Laya.timer.scale`. Logic theo frame: hoặc đặt `runtime.fixedStepHz` = fps gốc (và `FIXED_HZ` trong `src/main.ts`, template đặt cứng 60) để giữ nguyên đơn vị, hoặc đổi sang giây (`derived`); ghi lựa chọn vào `DECISIONS.md`. Timer của Laya dùng giờ thật và `Math.random` không seed: core dùng fixed step + `Rng`.

## 4. Scene, asset
- Scene/prefab → dữ liệu level của mình trong `public/StreamingAssets/` (vị trí, loại, tham số component). Giá trị trong props của script component là số gameplay → `params/` với `source`: `res/scenes/Level3.ls node Enemy#12 props.speed`.
- Atlas → giữ atlas hoặc pack lại; 3D: `.lm` mesh, `.lmat` material, `.lani` animation là định dạng riêng của Laya — ghi cách chuyển sang glTF ở P2 (runtime-select), có thể phải xuất lại từ project của người dùng.
- Text: chuỗi trong `.scene`/`uiView`/code → `Language/en.json` + `t()`; ảnh có chữ (rất phổ biến ở game Trung Quốc) → `assets/i18n/en/` qua `tAsset()`, `text: true` trong `asset-manifest.json`. Font bitmap (`.fnt`) có chữ cố định — kiểm đủ ký tự cho mọi ngôn ngữ.
- `own`: asset vào `assets/`/`public/` với `gamekit provenance add … --label own`. `third-party`: chỉ trong `reference/`.

## 5. WeChat / minigame
- Gọi `wx.*` (hoặc `tt.*`, `qq.*`, `swan.*`): đăng nhập, chia sẻ, quảng cáo (`wx.createRewardedVideoAd`), lưu (`wx.setStorageSync`), mạng. Liệt kê vào `notes/platform.md` → P4 ánh xạ sang `Platform` (skill platform-sdk); `core/` không biết gì về chúng.
- Asset thường tải từ CDN, không có trong gói; subpackage. `own`: lấy asset từ project hoặc CDN của người dùng. `third-party`: không tải từ server của họ, không giải mã gói `.wxapkg`; thiếu thì đo từ video (skill **engine-other** § video).
- Màn hình dọc cố định (`game.json` `deviceOrientation`), safe area điện thoại — ghi cho web-relayout ở P3.

## 6. Kết thúc
Cập nhật `notes/QUESTIONS.md`, `params/` đủ `unit` + `source` + `confidence`, `gamekit validate`. Không commit `decompiled/`. Báo người dùng: bản LayaAir, 2D/3D, minigame hay web, timing theo frame hay ms, API nền tảng cần thay. Tiếp theo: **re-notes** → gameplay-spec → `gamekit gate`.
