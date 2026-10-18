# Changelog

## Chưa phát hành
Bộ skill đủ cho cả 6 pha (38 skill):
- P1: một skill cho mỗi engine — `engine-unity`, `engine-cocos`, `engine-godot`, `engine-html5`, `engine-construct`, `engine-laya`, `engine-flash`, `engine-unreal`, `engine-gamemaker`, `engine-native` (engine `other`); `status` gợi ý đúng skill theo `source.engine` (engine chưa biết → `game-recon`). `ui-extract`.
- P2: `runtime-select`. P3 (làm lại game người khác): `style-direction`, `style-preview`, `asset-spec`, `apply-style`, `replace-graphics`, `replace-audio`, `rename-and-text`. P4: `add-analytics`, `add-leaderboard`, `add-save`, `add-i18n`. P5: `store-assets`.
- Test đồng bộ skill kiểm hai chiều: skill nào pha gợi ý cũng phải có, mọi engine đều có skill.
- `asset-manifest.json`: âm thanh không cần `width`/`height` (có `duration`, `loop`); `validate` kiểm `collider` trỏ tới param có thật, `brief` không chứa `forbiddenTerms`, `make` khớp nhãn provenance.

P0–P1 có công cụ thật, không chỉ checklist:
- Lệnh `recon`: nhận diện game gốc từ thư mục, APK/IPA/zip, `Assembly-CSharp.dll`, `dump.cs` (Il2CppDumper), `.pck` — engine (thêm `gamemaker`), phiên bản, dạng build (`source.variant`: source, mono, il2cpp, webgl, pck, creator-2/3, native…), nơi chứa logic và data, SDK (server, quảng cáo, analytics, IAP, thư viện), dấu hiệu làm rối code (dấu obfuscator .NET, metadata IL2CPP bị sửa, `_0x…`, `.jsc`), công cụ gợi ý. Tự đọc zip, metadata .NET và gói Godot, không cần công cụ ngoài.
- Đánh giá khả thi: điểm = truy cập logic × số cơ chế × làm rối × phụ thuộc server → làm / chạy thử / rủi ro, số ngày dự kiến từng pha. `recon --write` ghi `notes/recon.md` (giữ phần "Ghi chú thêm"), `game.yaml` (engine khi đang unknown, version, variant, path, `budget.plannedDays` chưa có), nên cảnh báo cắt lỗ của `status` có kế hoạch để so.
- Danh mục cơ chế `spec/inventory.yaml` (schema mới): type gameplay của game gốc (MonoBehaviour/ScriptableObject qua cả lớp cha trong game), mỗi mục phải `covers` (câu hỏi/nghĩa vụ) hoặc `skip`/`ignore` có lý do. Chạy lại recon chỉ thêm mục mới.
- `re` có tỉ lệ phủ danh mục cơ chế và mục "còn phải xong trước cổng": cơ chế chưa xử lý, câu chưa xong thiếu cột **Ảnh hưởng nếu chưa rõ**, `spec/gameplay-spec.md` còn TODO, nghĩa vụ chưa trỏ tới ghi chú RE; từ P2 câu còn `mở`. Cổng P1 và P2 chấm `{auto: re}`; `status` có một dòng tóm tắt.
- Nghĩa vụ parity lập ở **cuối P1** (đầu ra của RE), P2 chỉ đóng. Template có `spec/gameplay-spec.md` mẫu và cột ảnh hưởng trong `notes/QUESTIONS.md`.
- RNG gốc: `Rng` nhận `RandomSource`; template có `DotNetRandom` (khớp `System.Random` có seed, test với giá trị đã công bố của .NET) và mẫu nghĩa vụ `rng.sequence`.
- `skills/parity-check/references/oracle-harness.md`: cách sinh oracle từ chính game gốc theo engine (Unity Editor/batchmode, Mono + Assembly-CSharp.dll, IL2CPP/native qua Frida hoặc giả lập, JS qua Playwright, Godot headless).
- Lệnh `assets`: kiểm kê asset theo loại và dung lượng, định dạng phải chuyển cho web, file quá nặng, nhãn provenance; `--write` → `notes/assets.md`.
- Lệnh `smoke`: mở gói `dev-mock` trong Chromium headless (máy tính; điện thoại dọc/ngang, CPU chậm 4×), đo thời gian vào game, bắt đầu chơi bằng phím/chạm, FPS, lỗi console, request hỏng, Settings + footer bản quyền; so với `budget`; ảnh chụp ở `builds/<v>/smoke/`. Cần Playwright (tuỳ chọn). Cổng P5 chấm `{auto: smoke}`.
- Skill mới: `game-recon`, `triage`, `asset-inventory`, `web-relayout`, `qa-smoke`. Cổng P0 chấm `notes/recon.md`.

Theo dõi RE, REA làm bước phân tích của P1:
- Lệnh `re`: câu hỏi trong `notes/QUESTIONS.md` theo trạng thái, số bước và evidence mỗi câu, bước gần đây, cảnh báo (bước chưa gắn câu hỏi, phân tích lặp y hệt, kết quả bị cắt/chưa đủ, game third-party dùng tool chạy game). `--watch` cập nhật trực tiếp, `--json` cho agent; `re focus <Q#>` chọn câu đang làm; `re log` ghi tay (công cụ GUI, Codex).
- Nhật ký `notes/re-log.jsonl`: chỉ ghi tool, đối tượng, evidence id, giới hạn kết quả — không ghi nội dung trả về.
- Hook PostToolUse tự ghi tool REA (`mcp__rea__*`) và lệnh RE qua Bash (ilspycmd, Il2CppDumper, Cpp2IL, AssetRipper, jadx, apktool, gdre_tools, ffdec, wasm2wat, analyzeHeadless, `rea`), và nhắc agent ngay trong phiên khi bước chưa gắn câu hỏi, lặp lại, hoặc kết quả chưa đủ.
- `evidence: ["ev_…"]` (id Evidence của REA) cho params, oracle, nghĩa vụ; `validate` chặn id không có trong nhật ký.
- Cổng P1 có mục `{auto: re}`: trạng thái câu hỏi hợp lệ, câu đã trả lời có kết luận, evidence có trong nhật ký. Task VS Code "GameKit: theo dõi RE".
- Skill `re-notes` viết lại theo vòng hỏi → soi (REA) → đọc bằng chứng → dùng, kèm bảng tool REA theo engine.

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
