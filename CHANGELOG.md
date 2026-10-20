# Changelog

## 0.3.0 — 2026-10-20
AI nhìn thấy game chạy:
- Lệnh `smoke`: dựng bản dev-mock từ source (hoặc `--version` cho gói đã pack), mở trong Chromium headless (playwright-core của game; Chrome/Edge có sẵn, chromium của playwright, hoặc `GK_BROWSER`). 8 kịch bản: desktop, mobile dọc/ngang, ad giả fail/skip/slow/none (song song), máy yếu (CPU 4×, 1.6 Mbps/150 ms). Ảnh chụp trong `.gamekit/smoke/` để agent mở xem.
- Bắt: lỗi console/JS/tải, loading không tắt, trang cuộn, canvas tràn hay quá nhỏ, màn một màu, hình đứng yên khi chơi, thiếu `loadingEnd`/`gameplayStart` (lỗi từ P4), footer Settings, đổi ngôn ngữ; đo thời gian vào game, FPS trung bình/p5, heap theo `budget`.
- Cổng: P3 `{auto: smoke}`; P4 `{auto: smoke}` (ad giả lỗi không làm treo); P5 `{auto: perf}` + `{auto: smoke}` thay cho checklist tay. Gate chạy smoke một lần cho cả hai mục; P3/P4 dùng bộ `basic` (desktop, mobile dọc/ngang, ad lỗi), P5 dùng `full`. Kịch bản không đo FPS chạy song song: bộ đủ khoảng 35 giây, `basic` khoảng 25 giây.
- Template: `playwright-core`, mục `smoke:` trong `game.yaml` (bước vào game, phím, thời gian chơi), task VS Code, `.gamekit/smoke/` gitignored.

Bằng chứng từ game gốc:
- Lệnh `recon`: nhận diện engine/phiên bản/dạng build (Unity project, Mono, IL2CPP, WebGL; Cocos; Godot; Unreal; Flash; Construct; Laya; GameMaker; Defold; HTML5 Phaser/Pixi/RPG Maker) từ thư mục hoặc APK/XAPK/IPA/zip mà không chạy game; `--write` ghi `spec/recon.json` và điền `source.*` còn trống.
- Lệnh `oracle import`: trace CSV/JSONL/JSON → `spec/oracles/<id>.json` (chọn dòng `--at`, `--every`, `--max`; bắt buộc `--source`; `inferred` cần `--tolerance`). Công cụ ghi trace: `GkTraceRecorder.cs` (Unity), `gk-trace.js` (game web).
- Lệnh `assets`: `scan` (kiểm kê, kích thước PNG, sprite sheet Unity, gợi ý định dạng), `unity-atlas` (.png + .meta → atlas JSON cho Pixi/Phaser: lật trục y, pivot → anchor, 9-slice), `convert` (WebP, MP3/OGG/M4A qua ffmpeg; `--label` gắn provenance).

Skill mới: game-recon, triage (P0); engine-unity, gameplay-spec, asset-inventory, ui-extract (P1); runtime-select (P2); web-relayout (P3); perf-budget, qa-smoke (P5). Skill cũ trỏ sang lệnh và skill mới.

Đo chính harness:
- CI `.github/workflows/ci.yml`: test trên Linux/Windows/macOS × Node 20/22 và lượt đầu-cuối (`GK_E2E=1`: game thật, npm install, smoke, game bị làm hỏng phải đỏ, gate, pack).
- `evals/` cho `claude plugin eval`: dùng recon đúng, không tự tick mục "(bạn)", không kéo GameKit vào yêu cầu không liên quan.

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
