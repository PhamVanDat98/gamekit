# Changelog

## Chưa phát hành
- `pack` khi có portal chưa điền đủ thông tin: vẫn đóng gói các portal đã đủ, liệt kê mục còn thiếu, thoát mã 1 (trước đây dừng hết). Chưa có token azgames thì thử bằng `pack --portal dev-mock`.
- `gate`: mục `{auto: pack}` dùng lại bản build mới nhất nếu nó được build từ HEAD, không build lại.
- `init`/`config --questions` in JSON luôn; `--json` không cần nữa (vẫn nhận để lệnh cũ chạy được).
- `validate`: số liệu và oracle `template-demo` là cảnh báo trước P2, lỗi từ P2 (cổng P2 không còn qua với game demo). File dữ liệu sai dạng (`null`, thiếu `path`…) được báo theo file thay vì crash `validate`/`gate`.
- `integrate`: module đã merge mà nhánh có commit mới (sửa sau review) được merge tiếp, `--cleanup` không gỡ worktree đó; test đỏ thì dọn cả file test sinh ra; `fanout` chạy được khi thư mục worktree bị xoá tay. `module-plan.yaml` từ chối đường dẫn glob, `/…`, `..`, `\`.
- `parity`: file test không nạp được hoặc hook lỗi làm parity đỏ (trước đây thẻ trong file đó biến mất mà vẫn đạt); thẻ sai dạng (`[A:normal]`, `[a : edge]`) được cảnh báo.
- `provenance add .` không còn ghi đường dẫn có `/` ở đầu hay gắn nhãn `.git/`, `node_modules/`; chặn file ngoài game; `licensed` cần `--license`.
- `precommit` kiểm `game.yaml` bản đã stage và chạy đúng khi game là thư mục con của repo lớn hơn.
- `phase` sai trong `game.yaml`, tên game `a-`, cờ thiếu giá trị (`--title`): báo lỗi rõ thay vì crash hoặc ghi `"true"`.
- Template: phím không còn bị kẹt sau khi rời cửa sổ hay mở Settings; chơi lại sau game over cần 600 ms và nhấn mới (tránh bấm nhầm quảng cáo); `gameplayStop` khi tạm dừng; vòng lặp không chậm đi trên máy yếu và không dừng hẳn khi một khung hình lỗi; `src/core` typecheck không có DOM, ESLint chặn thêm `Date()`, `crypto`, `Intl`, `fetch`, `import()`, số lạ trong object; Settings giữ focus trong hộp thoại; bản dịch có dạng số nhiều không trộn tiếng Anh.
- Hook SessionStart: npm install lỗi thì chờ 1 ngày mới thử lại (trước đây thử 90 giây mỗi phiên, không báo) và báo lỗi kèm lệnh cài tay; kiểm cả `yaml` và `ajv`; chỉ nhận thư mục có `game.yaml` và `.gamekit/`; đường dẫn `references/` tuyệt đối; bỏ phần trùng với AGENTS.md của game (context nhỏ hơn ~20%).
- Tài liệu: platform-sdk hướng dẫn tạo bộ vỏ `portals/<id>/`, thêm ghi chú portal azgames; sửa chỗ lệch với code (re-notes, rebuild-game, release-check, standards); README liệt kê skill `status` gợi ý nhưng chưa có.

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
