---
name: engine-html5
description: Dùng ở pha P1 khi gamekit recon báo HTML5 hoặc RPG Maker MV/MZ (index.html, www/, js/rpg_*.js) — nhận ra framework thật (Phaser, Pixi, PlayCanvas, Cocos bị nhận nhầm, Cordova), beautify và dùng source map, tìm vòng lặp update và hằng số, đọc data JSON; với game của người dùng thì tách lại thành core/view/platform chứ không dán bundle.
---

# Phân tích game HTML5 / JS (P1)

Phương pháp chung theo skill **re-notes**; skill này chỉ thêm phần riêng của game JS. Ghi vào `notes/html5.md` và các file chủ đề.

## 1. Framework thật là gì
Recon chỉ trả "HTML5" khi không khớp gì cụ thể hơn. Tìm trong bundle (bản beautify) rồi sửa `source.engine` trong `game.yaml` nếu cần:

| Dấu hiệu | Framework | Ghi chú |
| --- | --- | --- |
| `Phaser.VERSION`, banner "Phaser v3" | Phaser | Arcade physics: px/s, px/s², bước cố định `physics.arcade.fps` (mặc định 60) |
| `PIXI.VERSION` | Pixi | ticker: `delta` (v7) / `ticker.deltaTime` (v8) là hệ số frame, 1 = 1/60 s |
| `pc.version`, `config.json`, `__settings__.js` | PlayCanvas | script `update(dt)` theo giây; scene/entity trong JSON |
| `cc.game`, `cc._RF`, `cc.Class` | Cocos Creator | recon nhận nhầm (file có hash) → `source.engine: cocos`, dùng skill engine-cocos |
| `C3`/`cr.plugins_`, `Laya.` | Construct / LayaAir | dùng engine-construct / engine-laya |
| `createjs`, `lib.properties.fps` | Adobe Animate (HTML5 Canvas) | timeline theo frame như Flash → cách đổi thời gian ở engine-flash |
| `js/rpg_core.js` (MV), `js/rmmz_core.js` (MZ) | RPG Maker | mục 4 |
| `cordova.js`, `cordova_plugins.js`, `assets/www/` | Cordova (APK) | plugin (ad, IAP) → `notes/platform.md` cho P4 |

## 2. Đọc code
1. Chép bundle vào `decompiled/js/` (gitignored), beautify (vd `npx prettier --parser babel`). Không sửa bản gốc.
2. Cuối file có `//# sourceMappingURL=` → lấy `.map`; `sourcesContent` cho lại source trước khi bundle (`own`: đó là source của người dùng).
3. Tách module: webpack (`__webpack_require__`, bảng module theo id), rollup/vite (phẳng, theo thứ tự import). Code thư viện (Phaser, Pixi, howler…) bỏ qua; chỉ ghi bản và API game dùng.
4. Tìm **vòng lặp update**: `requestAnimationFrame`, `setInterval`, `scene.update(time, delta)`, `app.ticker.add`. Ghi: có nhân delta không (không nhân = đơn vị theo frame, phụ thuộc fps), delta tính bằng ms hay s hay hệ số frame.
5. Tìm **hằng số**: object config, `const SPEED`, số đứng cạnh `velocity`/`gravity`/`spawn`; file `*.json` (level, wave, shop). Mỗi số → `params/` với `source`: `main.js (beautify) class Player.update, dòng ~1200` hoặc `data/levels.json[3].speed`. Tên đã minify thì ghi kèm chuỗi lân cận để tìm lại.
6. `Math.random`, `Date.now`, `performance.now` trong logic: ghi lại — `core/` thay bằng `Rng` có seed và `dt` của fixed step (lint chặn hai hàm kia).

## 3. Game của người dùng: không dán bundle
`own`: code đã là JS, nhưng vẫn **dựng lại cấu trúc**: logic thuần → `src/core/` (deterministic, test trước), vẽ + input → `src/view/`, SDK/ad/lưu → `src/platform/`, chữ → `t()`. Được chuyển từng hàm sang TypeScript; không chép nguyên file, không đưa thư viện render vào `core/`. Ghi trong `notes/` hàm nào chuyển vào đâu. `third-party`: chỉ ghi hành vi bằng lời của mình, không chép code.

## 4. RPG Maker MV/MZ
- `js/rpg_*.js` / `js/rmmz_*.js` là engine; logic riêng của game nằm trong `js/plugins.js` + `js/plugins/*.js` và `data/*.json`.
- `data/`: `Actors`, `Classes` (bảng chỉ số theo level → `spec/oracles/`), `Skills`/`Items` (chuỗi công thức sát thương `formula`), `Enemies`, `Troops`, `States`, `System`, `CommonEvents`, `MapInfos`, `MapNNN.json` (event + lệnh theo mã: 101/401 hội thoại, 102 lựa chọn, 201 chuyển map, 230 chờ N frame).
- Thời gian theo frame ở 60 fps (wait, move route): `unit: "frame@60fps"`.
- Toàn bộ hội thoại, tên, mô tả trong data → key trong `Language/<mã>.json`; data giữ key.
- Asset mã hoá (`.rpgmvp`, `.png_`, key trong `System.json`): `own` giải bằng key của chính game; `third-party` không giải, asset gốc chỉ là tư liệu.

## 5. Asset
Đã ở định dạng web: `own` dùng lại (nén thêm nếu vượt `budget`), `gamekit provenance add … --label own`; `third-party` để trong `reference/`. Ảnh có chữ → `assets/i18n/en/` qua `tAsset()`, `text: true` trong `asset-manifest.json`. Font web: kiểm license (`licensed`).

## 6. Kết thúc
Cập nhật `notes/QUESTIONS.md`, `params/` đủ `unit` + `source` + `confidence`, `gamekit validate`. Không commit `decompiled/`. Báo người dùng: framework và bản, có source map không, vòng lặp tính theo frame hay thời gian, kế hoạch tách core/view/platform. Tiếp theo: **re-notes** → gameplay-spec → `gamekit gate`.
