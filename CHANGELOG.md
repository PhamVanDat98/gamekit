# Changelog

## Chưa phát hành
Smoke test tự động:
- Lệnh `smoke`: mở gói dev-mock mới nhất trong trình duyệt headless (`playwright-core` của game; Chromium của Playwright, Chrome/Edge đã cài, hoặc `GK_CHROME`). Kiểm màn loading → game, lỗi console/JS/tải file, canvas vừa máy tính và điện thoại dọc/ngang, nút Settings bấm được, footer bản quyền, Escape đóng popup, đổi ngôn ngữ, thời gian vào game so với `budget.timeToPlaySec`. Ảnh chụp trong `.gamekit/local/smoke/<v>/`.
- Template: `playwright-core` trong devDependencies, script `smoke`, task VS Code; `gates/P5.md` chấm `{auto: smoke}` thay cho hai mục kiểm tay (loading/Settings, smoke). Game cũ: `npm i -D playwright-core` rồi thêm mục `{auto: smoke}` vào `gates/P5.md` nếu muốn.

Tốc độ:
- `gate` chạy các kiểm tra tự động song song (test, typecheck, lint, pack); `release-check` chờ `pack` của cùng cổng. Cổng P2 của game mẫu: ~6s → ~3s.
- Cổng có cả `parity` và `test` chỉ chạy vitest một lần khi `npm test` là `vitest run` của template; `npm test` tự sửa thì vẫn chạy riêng.
- `gate` ở P4/P5 dùng lại bản build mới nhất khi nó đúng commit HEAD, cây sạch và cùng đầu vào (`game.yaml` trừ phase/gates/timings, bộ vỏ portal, version plugin — ghi ở `manifest.json` `inputs`); trước đây mỗi lần chạy `gate` đóng gói và tốn một số build. `gamekit pack` vẫn luôn đóng gói mới.
- `pack` build mọi portal cùng lúc (mỗi portal một thư mục riêng); một portal vẫn hiện log vite trực tiếp.
- Test của plugin tách thành nhiều file (`cli`, `validate`, `provenance`, `gate`, `parallel`) để chạy song song.

## 0.2.0 — 2026-10-16
Bản dùng thử (xem `DUNG-THU.md`):
- Plugin tự cài thư viện của nó (`yaml`, `ajv`) ở lệnh đầu tiên, chạy ở đâu cũng được — trước đây cài từ Claude Code thì `init` lỗi cho tới khi mở một thư mục game.
- Hook `pre-commit` của template luôn xuống dòng LF (`.gitattributes`); test symlink tự bỏ qua trên Windows không có quyền tạo symlink.

Game của bạn là mặc định:
- `source.ownership` trong `game.yaml`: `own` (mặc định — giữ hình, âm thanh, tên; asset gốc nhãn `own`; được dịch code gốc, chạy/debug game gốc) hoặc `third-party` (`init --third-party` — làm lại game người khác, bắt buộc reskin, chặn tên gốc). Thiếu trường = `own`.
- Cổng có mục `{only: own|third-party}`; game `own` không cần `release.forbiddenTerms`, không chọn style hay `asset-manifest.json`. P3 của game `own` là "Chuyển sang web" (điều khiển, bố cục, nén asset). `status` ghi rõ loại game.
- Sửa: `gate` đọc được file cổng xuống dòng CRLF (trước đây ra rỗng và **qua cổng mà không kiểm gì**); cổng không có mục nào giờ là lỗi.

Gói build AZGAMES:
- `pack` ra bố cục B.1 của AZGAMES: `builds/<YYMMDDNN>/<portal>/{index.html, preview.html, version.txt, <v>/…}`, `manifest.json`, zip; bỏ `dist/`. `release-check` kiểm bố cục, bản quyền, ngân sách theo gói mới (mặc định bản mới nhất, `--version`).
- Vỏ portal (trang, loader, sitelock, SDK) nằm trong plugin `portals/<id>/`, dùng chung mọi game.
- `init`/`config` hỏi thông tin portal kèm giải thích (TTY, `--set`, `--questions --json` cho agent); thiếu thì game vẫn tạo, `pack` portal đó dừng.
- Đa ngôn ngữ: `Language/<lang>.json`, người chơi chỉ tải một file; `t()` trong game.
- Popup Settings có footer bản quyền `platform.info.copyright`; pre-commit chặn `builds/`.
- Zip do GameKit tự viết (đường dẫn `/` trên mọi OS, cùng nội dung cùng file); `manifest.json` có `portals.<id>.initialBytes`; vite/vitest chạy không qua shell nên đường dẫn có dấu cách vẫn được.
- Game tạo từ template cũ: xem mục **Nâng cấp game cũ** trong README (`pack` báo rõ khi `vite.config.ts` còn là bản cũ).

Học từ [rea](https://github.com/morluto/rea) (ledger nghĩa vụ dựng lại, phân loại bằng chứng, oracle kiểu DX-Ball):
- Lệnh `parity`: đóng từng nghĩa vụ trong `spec/obligations.yaml` bằng test gắn thẻ `[id:case]`; fail-closed (đỏ, skip/todo, thiếu case, thẻ lạ đều chưa đạt). Cổng P2 chấm `{auto: parity}`.
- `confidence` (observed / derived / inferred) cho params; từ P2 giá trị inferred phải có `tolerance`.
- Bảng oracle `spec/oracles/*.json` có schema; template có ví dụ và test `it.each`.
- Skill `parity-check` (P2) và `re-notes` (P1, kèm `notes/QUESTIONS.md`).
- Test đồng bộ skill: frontmatter, `AVAILABLE_SKILLS`, link nội bộ.

## 0.1.0 — 2026-10-15
- Khung plugin GameKit (dự án con 1): CLI, schema, template game, 7 skill, hook SessionStart, slash command, tích hợp VS Code.
