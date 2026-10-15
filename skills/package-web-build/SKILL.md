---
name: package-web-build
description: Dùng ở pha P5 (hoặc bất cứ khi nào cần bản build) để đóng gói game thành gói cho từng portal theo cấu trúc chuẩn index.html, Build/, StreamingAssets/, TemplateData/ — mỗi portal một gói, có build id, nén và zip.
---

# Đóng gói

`gamekit pack [--portal a,b | --all] [--compress] [--zip]`

- Mỗi portal trong `portals` (game.yaml) ra một thư mục `dist/<portal>/`, build bằng Vite với `GK_PORTAL=<portal>` — gói chỉ chứa adapter của portal đó.
- Cấu trúc:
  - `index.html` — entry, loader có thanh tiến độ, đường dẫn tương đối.
  - `Build/` — JS đã bundle và asset import từ code (`assets/`).
  - `StreamingAssets/` — chép từ `public/StreamingAssets/` (asset tải theo nhu cầu, params JSON, manifest) + `build-manifest.json` (name, version, portal, buildId, buildHash, builtAt).
  - `TemplateData/` — chép từ `public/TemplateData/` (css, logo, favicon).
- `buildId` = `version+commit` (thêm `.dirty` nếu còn thay đổi chưa commit) — được nhúng vào game để báo lỗi kèm phiên bản. Phát hành thật thì commit hết trước khi pack.
- `--compress` tạo `.gz`/`.br` cho `Build/` (cho server tự host như nginx). Portal ngoài thường tự nén, không cần.
- `--zip` tạo `dist/<game>-<portal>-v<version>.zip` để nộp portal (cần lệnh `zip`).
- Không bật source map khi phát hành (`build.sourcemap: false` trong vite.config.ts).

Sau khi pack: skill **release-check**.
