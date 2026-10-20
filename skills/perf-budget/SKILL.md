---
name: perf-budget
description: Dùng ở pha P5 khi kiểm hoặc sửa hiệu năng bản web so với budget trong game.yaml (initialLoadMB, timeToPlaySec, minFpsDesktop, minFpsMobile) — đo bằng gamekit pack/release-check (tải đầu) và gamekit smoke (thời gian vào game, FPS trên máy tính và điện thoại chậm), rồi sửa — nén asset, atlas, tải sau, giảm draw call, bớt cấp phát mỗi frame.
---

# Ngân sách hiệu năng (P5)

## 1. Ngân sách
`budget` trong `game.yaml` (mặc định template): `initialLoadMB: 10`, `timeToPlaySec: 5`, `minFpsDesktop: 60`, `minFpsMobile: 30`. Con số là quyết định của người dùng: không nới để qua cổng; muốn đổi thì hỏi và ghi `D-n` trong `DECISIONS.md`.

## 2. Đo
| Đo gì | Lệnh | So với |
| --- | --- | --- |
| Byte tải trước khi vào game | `npm run gk -- pack --all` → `builds/<v>/manifest.json` `portals.<id>.initialBytes`; `npm run gk -- release-check` in "tải đầu X MB / Y MB" | `initialLoadMB` |
| Thời gian tới khung hình đầu | `npm run gk -- smoke` | `timeToPlaySec` |
| FPS khi đang chơi | `npm run gk -- smoke` | `minFpsDesktop`, `minFpsMobile` |

- `initialBytes` (chưa nén) = `index.html` ngoài + `<v>/loader.js`, `framework.js`, `css/style.css`, `Icons/*` + file `Language/*.json` lớn nhất. **Không** tính `assets/` và `StreamingAssets/` — nhưng ảnh/âm thanh tải trước khung hình đầu vẫn làm chậm `timeToPlay`, smoke mới bắt được.
- `smoke` (đọc `scripts/smoke.mjs`; cách chạy, cài Playwright: skill **qa-smoke**): mở gói `builds/<v>/dev-mock/` qua server tĩnh; `desktop` 1280×720; `phone-portrait` 390×844 và `phone-landscape` 844×390 với CPU chậm 4× và mạng kiểu 4G (60 ms, 9 Mbit/s xuống). Thời gian vào game = lúc game gọi `GM_LOADER.ready()` (template gọi ở khung hình đầu trong `main.ts`). FPS = số `requestAnimationFrame` trong 4 s (`--quick`: 1,5 s, chỉ desktop) sau khi bấm Space / chạm giữa màn để bắt đầu ván. Game bắt đầu bằng cách khác thì FPS đo màn menu — báo người dùng.
- FPS đếm theo `requestAnimationFrame` nên không vượt tần số làm tươi của màn hình.

## 3. Sửa theo triệu chứng
| Triệu chứng | Sửa |
| --- | --- |
| `initialBytes` lớn vì `framework.js` | Thư viện nặng không cần (chọn runtime nhẹ hơn, import từng phần); dữ liệu lớn `import` vào code → chuyển sang `public/StreamingAssets/` và `fetch` khi cần. Vite gom mọi code vào một `framework.js` (`inlineDynamicImports`), `import()` động **không** tách file. |
| Một file `Language/*.json` lớn | Chỉ chữ hiển thị; hội thoại/level dài tách ra `StreamingAssets/` theo ngôn ngữ, tải khi cần |
| `timeToPlay` chậm trên điện thoại | Chỉ tải asset của màn đầu trước `ready()`; phần còn lại (màn sau, nhạc nền, ảnh i18n chưa dùng) tải sau khung hình đầu |
| Ảnh nặng | Nén texture: WebP/AVIF cho ảnh không cần chính xác, PNG có palette cho UI; giảm độ phân giải về đúng cỡ hiển thị; gom sprite nhỏ thành atlas |
| Âm thanh nặng | Mono, bitrate thấp cho hiệu ứng, nhạc nền tải sau; một định dạng phổ biến (mp3/ogg/m4a) |
| FPS thấp | Gom draw call (atlas, batch của Pixi/Phaser), cắt hiệu ứng ngoài màn hình, canvas không lớn hơn cần thiết (giới hạn `devicePixelRatio`) |
| FPS giật theo nhịp (GC) | Không tạo object/mảng/closure/chuỗi mới mỗi frame trong `stepWorld` và `renderer.draw`; dùng pool, tái dùng mảng |

- Mỗi lần nén lại hay đổi định dạng asset: file mới cần nhãn provenance như bản cũ (`npm run gk -- provenance add <file> --label …`); `own` giữ nhãn `own`, `third-party` giữ `generated`/`licensed`/`own` của asset mới. Ảnh có chữ: nén cả mọi bản trong `assets/i18n/<mã>/`.
- Giảm chất lượng hình/âm thanh thấy rõ so với bản gốc (`own`) là sai khác: hỏi người dùng, ghi `D-n`.
- Logic gameplay không đổi để tăng FPS (số trong `params/` giữ nguyên; fixed step giữ nguyên).
- `pack --compress` thêm `.gz`/`.br` cho js/css/json/wasm, chỉ giúp khi server tự host phục vụ chúng; portal thường tự nén. Nó **không** đổi `initialBytes` (tính chưa nén).

## 4. Kết thúc
Sau mỗi lần sửa: `npm test`, `npm run gk -- pack --all`, `npm run gk -- release-check`, `npm run gk -- smoke`. Báo người dùng bảng trước/sau (MB tải đầu, giây vào game, FPS từng kịch bản) và chỉ những số đã đo thật. Tiếp theo: **qa-smoke**, **store-assets**, **release-check**.
