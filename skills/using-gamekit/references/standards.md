# Chuẩn phát triển GameKit

| Chuẩn | Nội dung | Ép bằng |
| --- | --- | --- |
| Bám sát game gốc | Số gameplay chỉ trong `params/*.json`, có `source`; sai khác có `D-n` được duyệt | `validate` (từ P2: lỗi nếu còn TODO hoặc sai khác chưa duyệt) |
| Độ tin cậy số liệu | `confidence` = observed / derived / inferred trên params và oracle; inferred có `tolerance` | `validate` (từ P2: lỗi nếu inferred thiếu tolerance) |
| Parity | Mỗi cơ chế một nghĩa vụ trong `spec/obligations.yaml`, đóng bằng test `[id:case]` xanh; bỏ qua phải có `D-n` được duyệt | `gamekit parity` (fail-closed), cổng P2 `{auto: parity}` |
| Cấu trúc code | TS strict; `core/` / `view/` / `platform/` / `contracts/` | Template + ESLint: `core/` cấm import view/platform/thư viện render, cấm `Math.random`, `Date.now`, DOM |
| Data-driven | Không số lạ trong `core/` | ESLint `no-magic-numbers` cho `core/` |
| Asset | Tên, định dạng (WebP, KTX2/Basis, glTF + Meshopt/Draco, AAC/MP3), độ phân giải, atlas, spec trong `asset-manifest.json` | `validate` (kích thước, alpha PNG) |
| Chuyển động | Key pose theo khung trong `motion/*.json`, chỉ ở `view/`; slow in/out, anticipation (player-action ≤ 4 khung, telegraph ≥ 18), follow-through, squash giữ khối; bỏ kiểm tra phải có lý do (`skip`) | `gamekit motion`, cổng P3 `{auto: motion}` |
| Ngân sách hiệu năng | `budget` trong game.yaml (khởi điểm: tải đầu < 10MB, vào game < 5s, 60fps desktop, 30fps mobile) | `release-check` (tải đầu) |
| Portal và iframe | Đường dẫn tương đối, không link ngoài, chặn cuộn trang bởi phím, focus, pause khi ẩn tab, bàn phím + cảm ứng | `src/platform/web-guard.ts` + `release-check` |
| Chơi được khi tắt tiếng | Mọi thông tin gameplay có tín hiệu hình ảnh, không chỉ dựa vào màu | Checklist cổng P3 |
| Git | Conventional Commits; `reference/`, `decompiled/` gitignored | Pre-commit hook (`gamekit precommit`) |
| Version và build | Semver; build id = version + commit, số build `YYMMDDNN`; build hash trong `builds/<v>/manifest.json` | `pack` |
| Event analytics | Một bộ tên chung (`src/platform/events.ts`) | Type + `createPlatform` bỏ tên lạ |
| Theo dõi lỗi | `window.onerror`, promise lỗi → `track('error')` kèm build id | `web-guard.ts` |
| Ghi quyết định | `game.yaml` trạng thái; `DECISIONS.md` lý do và sai khác | Cổng các pha |
| Definition of Done | `gates/P*.md` | `gamekit gate` |
