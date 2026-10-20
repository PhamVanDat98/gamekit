# Changelog

## Chưa phát hành
Hoàn thành các mục 3–7 của lộ trình:
- **Mọi bước có skill**: P0 game-recon, triage · P1 engine-unity/-cocos/-godot/-unreal/-flash/-construct/-laya/-html5/-other, gameplay-spec, asset-inventory, ui-extract · P2 runtime-select · P3 web-relayout, style-direction, style-preview, apply-style, asset-spec, replace-graphics, replace-audio, rename-and-text · P4 add-analytics, add-leaderboard, add-save, add-i18n · P5 perf-budget, qa-smoke, store-assets. `status` gợi ý engine-<engine> theo `source.engine` (chưa rõ engine → game-recon).
- `recon`: nhận diện engine, version, backend từ thư mục hoặc apk/xapk/ipa/zip (đọc trong file nén, không giải nén), logic và dữ liệu nằm ở đâu, công cụ nên dùng, kiểm kê; `--write` ghi `notes/recon.md` và `source.*`.
- `ghidra`: Ghidra headless với `GameKitExport.java` — danh sách hàm, chuỗi, decompile C theo regex vào `decompiled/ghidra/`; tên hàm/chuỗi/metadata IL2CPP từ `script.json` của Il2CppDumper; `--entry` lấy `.so` trong APK; lần sau chỉ xuất lại.
- Style cho reskin: `style/options/<id>.json` (schema `style`), `style choose` sinh `style/style.json` + `src/view/theme.ts` (template đọc THEME: biến CSS `--gk-*`, renderer, font đi kèm game), `style preview` so sánh bằng UI kit + popup Settings thật với chữ thật mọi ngôn ngữ; validate kiểm tương phản, file font, theme.ts lệch style.
- `assets scan`: nháp `asset-manifest.json` (kích thước PNG/JPEG/WebP/GIF, alpha, loại, gợi ý ảnh có chữ). `review`: trang duyệt asset, `--apply` ghi `review` vào manifest và `notes/review.md`. Manifest có thêm `textKey`, `voice`, `ref`, `prompt`, `gen`, `review`; âm thanh không cần width/height.
- `gen`: sinh ảnh (`gpt-image-1.5`, nền trong suốt; chặn `gpt-image-2` cho asset cần alpha) và lời thoại qua OpenAI; ảnh có chữ mỗi ngôn ngữ một bản đúng chữ trong `Language/`; khớp đúng kích thước spec, nhãn `generated`; `gen prompt`/`--dry-run` cho Codex hay công cụ khác, `gen import` đưa file vào; game làm lại: chặn prompt có `release.forbiddenTerms`.
- `smoke`: gói build trong Chromium (Playwright) — thời gian vào game, FPS máy tính và điện thoại chậm 4× mạng 4G, lỗi console, màn trắng, Settings và footer, mọi ngôn ngữ và RTL; so với `budget`. `store`: ảnh theo kích thước từng portal + `store/listing.yaml`. Cổng P5: `{auto: smoke}`, `{auto: store}`.
- Template: `src/view/theme.ts`; renderer thu nhỏ chữ cho vừa khi bản dịch dài.
- Mục 2 (SDK các portal khác) còn chờ tài liệu SDK và tiêu chuẩn đóng gói.

- Đa ngôn ngữ cho ảnh có chữ (logo, nút, banner): `assets/i18n/<mã>/<đường dẫn>`, bản gốc ở `assets/i18n/en/`, lấy URL bằng `tAsset('ui/title.png')`; ngôn ngữ thiếu ảnh dùng bản en. Mỗi ảnh là một file riêng trong gói (không nhúng vào `framework.js`), người chơi chỉ tải ảnh của ngôn ngữ mình. `validate` báo file không có bản en, thư mục ngôn ngữ ngoài `languages`, `tAsset()` trỏ tới file không có; thiếu bản dịch chỉ cảnh báo. Game cũ: chép `src/view/i18n.ts` từ template.
- Mọi chữ người chơi thấy phải đổi theo ngôn ngữ, kể cả ảnh UI sinh ra có chữ: `asset-manifest.json` có trường `text: true` — ảnh đó phải nằm trong `assets/i18n/en/` (và ảnh trong `assets/i18n/` phải có `text: true`). Lint của template chặn chữ viết cứng trong `src/view/`, `src/main.ts` (`fillText`, `textContent`, `setAttribute('aria-label', …)`, Pixi `Text`, Phaser `add.text`…). Cổng P3 có mục kiểm chữ đa ngôn ngữ; bỏ yêu cầu "chữ không in vào ảnh" cho game `third-party` (được in, miễn là có bản cho mỗi ngôn ngữ).

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
