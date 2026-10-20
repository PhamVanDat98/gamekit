---
name: qa-smoke
description: Dùng ở pha P5 khi kiểm bản build trước phát hành — chạy gamekit smoke (Chromium qua Playwright — vào game, FPS máy tính và điện thoại chậm, lỗi console, màn trắng, Settings có footer, mọi ngôn ngữ), đọc ảnh chụp và report.json, sửa lỗi, rồi hướng dẫn người dùng thử tay trên điện thoại thật tầm trung. Cũng dùng khi mục smoke của cổng P5 đỏ.
---

# Smoke test và QA (P5)

## 1. Chuẩn bị
- Playwright (một lần cho game/máy): `npm i -D playwright && npx playwright install chromium`. Dùng Chromium có sẵn: biến môi trường `GAMEKIT_CHROMIUM=<đường dẫn>`.
- Có gói build: `npm run gk -- pack --all` (smoke cần `builds/<v>/<portal>/index.html`).

## 2. Chạy
`npm run gk -- smoke [--version V] [--portal dev-mock] [--quick]` — mặc định bản mới nhất, portal `dev-mock` (vỏ thật có sitelock không chạy ở `127.0.0.1`). `--quick` chỉ chạy desktop, đo FPS 1,5 s. Cổng P5 `{auto: smoke}` chạy bản đầy đủ.

Kiểm tra (đọc `scripts/smoke.mjs`):
| Kịch bản | Kiểm |
| --- | --- |
| `desktop` 1280×720, `phone-portrait` 390×844, `phone-landscape` 844×390 (điện thoại: CPU chậm 4×, mạng 4G) | gọi `GM_LOADER.ready()` trong 60 s và trong `budget.timeToPlaySec`; ảnh sau khi vào không một màu; bấm Space / chạm giữa màn để vào ván; FPS ≥ `minFpsDesktop` / `minFpsMobile`; không `pageerror`, `console.error`, request lỗi, HTTP ≥ 400 |
| Settings (desktop) | có nút `.gk-gear`; popup hiện `.gk-settings-footer` có chữ |
| Mỗi mã trong `languages` | mở với `?lang=<mã>`, vào được game, `GM_LANG.code` đúng mã, không lỗi; ghi `dir` (rtl) |

## 3. Kết quả
Thư mục `.gamekit/local/smoke/<v>-<portal>/` (xoá và tạo lại mỗi lần chạy): `<kịch bản>-ready.png`, `<kịch bản>-play.png`, `settings.png`, `lang-<mã>.png`, `report.json` (`scenarios[]`: `timeToPlayMs`, `fps`, `blank`, `errors`; `languages[]`; `settings`; `failures[]`). Mở ảnh xem bằng mắt: chữ tràn, chữ chưa dịch, bố cục vỡ ở màn dọc/ngang, ảnh có chữ sai ngôn ngữ.

| Lỗi | Hướng sửa |
| --- | --- |
| không gọi `GM_LOADER.ready()` trong 60 s | Lỗi khởi động (xem `errors`), hoặc game đổi `main.ts` mà bỏ `ready()` ở khung hình đầu |
| màn hình trống (một màu) | Canvas chưa vẽ, CSS che, asset lỗi đường dẫn (tương đối, `base: './'`) |
| `N FPS < …`, `vào game sau … s` | Skill **perf-budget** |
| `request failed` / `HTTP 404` | Asset thiếu trong gói hoặc đường dẫn tuyệt đối; sửa nguồn rồi `pack` lại, không sửa tay `builds/` |
| `Settings: …` | Khôi phục nút bánh răng và footer `gk-settings-footer` (`src/view/settings.ts`) |
| `lang xx: game chạy bằng yy` / không vào được | Thiếu `Language/xx.json` trong gói, JSON hỏng, `languages` trong game.yaml không khớp |

Sửa xong: `pack` lại rồi chạy lại `smoke` — smoke luôn đo gói đã build, không đo `npm run dev`.

## 4. Thử tay trên điện thoại thật (mục đầu của `gates/P5.md`)
Agent không làm được phần này: đưa danh sách cho người dùng, chỉ tick mục sau khi người dùng báo đã thử và đạt. Mở bản build trên điện thoại tầm trung cùng mạng LAN: `npm run preview -- --host` rồi vào `http://<IP máy>:4173/<v>/dev-mock/<v>/index.html`.
1. Chơi hết một ván: vào màn, thắng/thua, màn kết thúc, chơi lại (interstitial chỉ giữa hai ván).
2. Xoay màn hình giữa ván: bố cục không vỡ, điều khiển cảm ứng vẫn đúng, trang không cuộn.
3. Âm thanh: có tiếng sau lần chạm đầu; tắt trong Settings thì im; ad chạy thì im.
4. Ad giả: thêm `?ad=fail`, `?ad=skip`, `?ad=none`, `?ad=slow` — game không treo, luôn chạy tiếp; rewarded chỉ thưởng khi xem hết.
5. Settings: đổi ngôn ngữ → trang tải lại bằng ngôn ngữ mới và nhớ lựa chọn; footer bản quyền hiện ở mọi ngôn ngữ.
6. Chuyển sang app/tab khác giữa ván → game dừng, im tiếng; quay lại không mất ván.
7. Tiến trình đã lưu (nếu có, skill **add-save**) còn sau khi tải lại.

`own`: so thêm cảm giác chơi với game gốc trên cùng điện thoại; `third-party`: không còn hình, tên, chữ của game gốc ở bất kỳ màn nào.

## 5. Kết thúc
`npm run gk -- smoke` đạt → `npm run gk -- gate`. Báo người dùng: số liệu từng kịch bản (giây vào game, FPS), ngôn ngữ đã kiểm, đường dẫn thư mục ảnh, lỗi đã sửa, và danh sách thử tay còn chờ họ. Mục "Đã playtest bản cuối (bạn)" chỉ người dùng tick. Tiếp theo: **store-assets**, **release-check**.
