# Changelog

## Chưa phát hành
- Skill `replace-graphics` (P3, game làm lại của người khác): chọn cách làm từng asset theo `make` — `vector`, `pixel-code`, `image-gen`, `licensed` —, duyệt style theo đợt, hậu xử lý ảnh từ model, gắn nhãn, `validate`. Kèm hướng dẫn [pxl](https://github.com/crsolver/claude-pxl) (pixel art bằng code, không cần API key) và bảng công cụ tạo art cho Claude Code/Codex, gồm skill cho Codex: `imagegen` có sẵn, plugin Game Studio (`sprite-pipeline`, `game-ui-frontend`, `game-playtest`), cách cài pxl và agent-sprite-forge vào Codex; skill [illustrate](https://github.com/code-katz/claude-illustrate-skill) cho logo/icon SVG (`make: vector`), ghi nguồn gốc bằng `gamekit provenance` thay cho `assets/MANIFEST.md` của nó. Bảng chọn cách làm theo ảnh mẫu style; công thức cartoon phẳng viền đen bằng SVG (render PNG trong suốt bằng Chromium); claudedraw (style gạch chéo bút sáp) và codex-visual-asset-skills (tách nền, ghép atlas — kèm lưu ý đã thử).
- Skill `game-raster-art` (`art-skills/`, cài cho Codex): asset game raster bằng `image_gen` của Codex — chốt style bằng ảnh neo, 9 style game (sticker-cartoon, doodle-monster, chibi-anime, pixel-16bit, painted-fantasy, clay-3d, flat-vector, neon-arcade, dark-ink), mẫu prompt theo loại asset; `gameart.py` (Python + Pillow) tách nền một màu kể cả khe hẹp và khử ám màu viền, đặt vào canvas đúng cỡ với một tỉ lệ chung và điểm neo giữa-đáy, cắt strip animation (báo lỗi khi model vẽ sai số tư thế, `--frames auto --pick`), pixel art đúng lưới + giảm màu, tile lặp liền mạch, nền parallax lặp ngang, contact sheet, kiểm cỡ/alpha/viền.
- `asset-manifest.json`: `make` nhận thêm `pixel-code`.

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
