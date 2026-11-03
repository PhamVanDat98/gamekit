# Changelog

## Chưa phát hành
Vật lý: không ánh xạ engine sang engine, mà ánh xạ từng hành vi và đo độ lệch.
- Skill `physics-assess` (cuối P1) và `spec/physics-assessment.yaml`: kiểm kê cách game gốc dùng vật lý, chấm mức ảnh hưởng từng cơ chế, đề xuất thư viện, chạy thử cơ chế rủi ro. Cổng P1 có `{auto: physics}` và mục người dùng duyệt.
- `fidelity` (exact / calibrated / emergent) cho nghĩa vụ; `parity` báo số đã đóng theo từng mức. Từ P2, `calibrated`/`emergent` cần oracle, `toleranceDecision`, và `calibrated` cần cả bộ `calibrate` lẫn `holdout`.
- Oracle có `toleranceAbs` và dạng `kind: trajectory`. Template có `oracleMismatches` trong `tests/support/oracle.ts`; so theo sai số tương đối trước đây hỏng khi giá trị bằng 0.
- Sửa: `runtime.fixedStepHz` không có tác dụng vì `main.ts` gõ cứng 60 Hz. Giờ game đọc `sim.fixedStepHz` trong `params/game.json`, `validate` báo lỗi nếu hai nơi khác nhau.
- Template, input: cú bấm nhanh (nhấn và nhả giữa hai bước) không còn mất. `InputFrame` có thêm `pressed`/`released` (như `GetKeyDown`/`GetKeyUp`); `inputAt` đổi thành `frameAt`; phím bấm lúc tạm dừng không bắn khi tiếp tục.
- Template, vẽ: `main.ts` dùng `alpha` của vòng lặp, vẽ nội suy giữa hai tick (`capturePositions`), để hình không giật khi tần số mô phỏng khác tần số màn hình.
- Template, toán: `core/mathf` có `roundToInt` (làm tròn nửa về số chẵn như `Mathf.RoundToInt`) và `sign` (như `Mathf.Sign`); lint cấm `Math.round`/`Math.sign` trong `core/`.
- Template, test: `world.test.ts`, `replay.test.ts` đọc `sim.fixedStepHz` thay vì gõ cứng 60 Hz.
- Game cũ: xem **Nâng cấp game cũ** trong README.

Gói Android:
- Lệnh `gamekit unpack <file>`: giải nén APK, XAPK, APKS, OBB cùng các APK con, nhận diện engine; với Unity báo thêm phiên bản, Mono hay IL2CPP, kiến trúc, vị trí logic, metadata và dữ liệu. Có `--game` (hoặc chạy trong thư mục game) thì ghi `notes/source-unpack.md` và `source.path`, `source.engine`, `source.engineVersion`.
- Đọc ZIP không thêm thư viện, có zip64. File đầu vào coi là không đáng tin: chặn đường dẫn ra ngoài thư mục đích, kiểm tra CRC và kích thước, giới hạn tổng dung lượng (`--max-gb`, mặc định 20), không ghi đè file chỉ khác hoa thường. Không cho giải nén vào repo game, trừ `reference/` và `decompiled/`.
- Skill `re-notes` nói rõ vị trí file của gói nhiều phần và đường dẫn Unity trên Android.

Skill P1:
- Thêm `engine-unity` (kèm `references/GkTraceRecorder.cs` ghi trace từ project Unity), `gameplay-spec`, `asset-inventory`, `ui-extract`. `gamekit status` ở P1 không còn báo các skill này là chưa có; engine khác Unity vẫn chưa có skill `engine-*` riêng.

Skill P3, P5:
- Thêm `web-relayout`, `perf-budget`, `qa-smoke`. `gamekit status` ở P3 và P5 không còn báo các skill này là chưa có; `store-assets` vẫn chưa có.
- Lệnh `gamekit smoke`: chạy gói build trong Chromium qua Playwright (cài riêng, không phải dependency của plugin), đo thời gian vào game và FPS, bắt lỗi console, màn trắng, thiếu footer Settings, ngôn ngữ không tải được; `--browser` dùng Chrome hoặc Edge có sẵn. Cổng P5 chưa chạy lệnh này tự động.

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
