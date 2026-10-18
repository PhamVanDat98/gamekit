# Changelog

## Chưa phát hành
Port game Unity có source:
- Lệnh `unity scan`: đọc project Unity (Force Text) — settings (Fixed Timestep, gravity, layer, sorting layer, input axes), scene trong build, camera/CanvasScaler, mọi script (field serialized + giá trị mặc định, Unity message, bẫy khi sang JS theo dòng), giá trị serialized trong scene/prefab/ScriptableObject kể cả override prefab trong scene, Animator (state, transition, điều kiện), animation event, sprite PPU/rect/pivot. Ra `notes/unity/REPORT.md` (bảng **Inspector ghi đè**: giá trị game chạy khác mặc định trong code), `notes/unity/params-draft.json` (giá trị dạng params, `confidence: observed`), `notes/unity/data/`, `spec/port-map.yaml`.
- `spec/port-map.yaml` (schema mới): mỗi script gốc `todo | doing | done | skip`; `validate` kiểm target/note; cổng P1/P2 có `{auto: port-map}`. Cổng nhận thẻ `{engine: …}`.
- Game `--engine unity` có `src/core/unity/` (Mathf.Round về số chẵn, Sign(0)=1, intDiv, Repeat, DeltaAngle, SmoothDamp…; Random.Range int/float; AnimationCurve Hermite; Scheduler cho coroutine/Invoke theo thời gian mô phỏng) và `src/view/unity-space.ts` (world y-up ↔ canvas), có test. `init` chép `templates/engines/<engine>/`.
- Hướng dẫn Ghidra cho game chỉ còn bản build (`skills/re-notes/references/ghidra-headless.md`): số liệu từ file data (AssetRipper → `unity scan`), tên từ Il2CppDumper, `analyzeHeadless`, Ghidra qua MCP, cách đọc pseudocode IL2CPP.
- Skill `engine-unity`: vì sao port sai, quy trình quét → params → từng script, bảng lifecycle, bảng bẫy (`references/pitfalls.md`), `GameKitRecorder.cs` ghi oracle `observed` thẳng từ Unity Editor. `rebuild-game`, `re-notes`, `using-gamekit`, AGENTS.md của game trỏ tới đây.

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
