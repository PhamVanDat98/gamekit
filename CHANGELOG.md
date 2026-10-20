# Changelog

## Chưa phát hành
Chuyển động theo nguyên lý hoạt hình (skill **animate**, P3):
- `motion/*.json`: chuyển động viết bằng key pose theo khung (`<phần>.<x|y|rot|sx|sy|stretch|alpha>`, ease từng key, `beat`, `loop`, `step` giữ pose kiểu on twos), `role` = action / player-action / telegraph / reaction / ui / idle / fx. Schema `motion.schema.json`; `validate` kiểm định dạng.
- Lệnh `motion`: chấm theo nguyên lý — lỗi khi đi đều (`linear`), thiếu anticipation (action, telegraph), player-action chuẩn bị > 4 khung@60 (trễ input), telegraph < 18 khung (không kịp phản ứng), reaction không vào ngay, dừng cứng không follow-through, vòng lặp giật ở chỗ nối; cảnh báo thiếu squash & stretch hoặc mất khối, không overlap, đường thẳng thay cho arc, nhịp đều. In biểu đồ nhịp (sparkline từng track, đoạn chuẩn bị / action / follow-through) để agent "xem" timing. Bỏ kiểm tra bằng `skip` có lý do. Cổng P3 có `{auto: motion}` và mục duyệt chuyển động (bạn) cho game làm lại.
- Template: `src/view/anim/` (ease, motion, `Animator`, `Spring`, `stretchFromSpeed`, rig cắt rời, onion skin), 4 chuyển động mẫu (`idle`, `hop`, `hit`, `pop-in`), `lab.html` (xem chậm, từng khung, onion skin, đường đi; URL cố định để chụp màn hình). Renderer demo: nghiêng + giãn theo tốc độ bằng spring, `hit` khi thua, `pop-in` cho overlay.
- Nhân vật mẫu **Mochi** (`src/view/anim/sample-rig.ts`, 12 phần vẽ bằng code) và 8 chuyển động: `idle`, `walk`, `hop`, `hit`, `attack` (telegraph), `celebrate`, `surprise`, `pop-in`. Lab có chế độ **Chơi thử** (`?play=1`: đi, nhảy, đánh, bị đánh… kèm nháy sáng, rung màn hình, bụi). Kiểm tra mới `rest`: chuyển động một lần phải về pose nghỉ, không thì giật khi về idle.
- **Mesh deform, tự viết, không Spine** (`src/view/anim/mesh.ts`): part có `mesh` được vẽ qua lưới tam giác (canvas 2D, ô gần vuông, cạnh nới ra để không lộ khe) và uốn cong (`bend`) / phồng giữa (`bulge`); phần con cưỡi theo đường cong của phần cha. **Drag** (`drag.ts`): phần phụ tự trễ theo chuyển động của khung chứa nó rồi lắc tắt dần, cho mọi chuyển động; `posesWithDrag` mô phỏng lại từ đầu nên tua, onion skin, xuất frame đều cho cùng kết quả. Mochi có thân, tay, chân, đuôi, tai mềm; 8 chuyển động có thêm key `bend`/`bulge`. Lab: nút **Mềm (mesh)** để so với con rối cứng. `gamekit motion` nhận `bend`, `bulge` (bulge tính là squash; phải về 0 cuối chuyển động).
- **Ảnh từng khung, không Spine**: lab "Xuất frame" ghi `art/frames/<motion>/pose-NN.png` + `meta.json` (cùng anchor mọi khung); lệnh `frames` viết prompt từng khung (giữ pose, anchor, kích thước, nhịp của khung), `--codex` gọi `codex exec --image <tham chiếu> --image <pose>` cho từng khung còn thiếu, `--check` kiểm đủ khung/kích thước/nền trong suốt, `--install` cài vào `assets/img/anim/` với nhãn `generated`. `FrameAnim` phát ảnh (có `hold` cho limited animation); lab `?frames=<motion>` xem kèm contact sheet.
- Skill `animate` + tài liệu: 12 nguyên lý áp vào web game kèm số khung, công thức từng hành động (nhảy, đáp, đi/chạy, telegraph, nút, popup, nhặt xu…; JSON mẫu được test chấm lại), làm asset cho AI theo rig cắt rời thay vì sprite sheet.

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
