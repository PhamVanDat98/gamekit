# Changelog

## Chưa phát hành
- Skill `replace-graphics` (P3, game làm lại của người khác): chọn cách làm từng asset theo `make` — `image-gen` (Codex, không API key), `pixel-code` (pxl), `voxel-code`, `vector` cho UI, `licensed` —, khung hình concept trước rồi rút asset từ nó, ghép thử và so với concept, gắn nhãn, `validate`. Kèm hướng dẫn [pxl](https://github.com/crsolver/claude-pxl) và bảng rà soát công cụ tạo art (cái nào cần API key, chuyển sang Codex CLI hay bỏ).
- Skill `game-raster-art` (`art-skills/`, Codex và Claude Code): asset game raster bằng `image_gen` của Codex, **không API key** — ngoài Codex tạo ảnh qua Codex CLI (`gameart.py gen` → `codex exec` trên tài khoản ChatGPT). Concept là một khung hình trong game đúng cỡ hiển thị; asset rút ra từ chính khung hình đó (nền sửa từ frame, nhiều asset một tấm rồi `split`), `grade` khớp màu với frame, `compose` + `compare` ghép thử vào cảnh và đo độ lệch màu với concept. 8 style game, mẫu prompt theo loại asset; `gameart.py` còn tách nền một màu kể cả khe hẹp, đặt đúng cỡ với một tỉ lệ chung và điểm neo giữa-đáy, cắt strip animation (báo khi model vẽ sai số tư thế, `--frames auto --pick`), pixel, tile, parallax, contact sheet, kiểm cỡ/alpha/viền.
- `game-raster-art` animation frame-by-frame không trôi nét: `image_gen` vẽ lại nhân vật mỗi frame nên dải dài bị trôi (showcase mượt trên GitHub dùng model video hoặc ô nhỏ + khung bố cục). Thêm `tween` (cả sprite đã duyệt: bob, breathe, sway, wobble, hop, spin, pulse), `rig` (nhân vật cắt rời thành bộ phận do `image_gen` vẽ một lần, quay quanh khớp: idle, walk, run, jump, attack, hit, hoặc keys riêng), `guide` (khung bố cục cho dải frame), `anim --slots`, `inspect` (chỉ ra frame lệch cỡ/màu/chân để tạo lại bằng sửa từ sprite đã duyệt).
- `game-raster-art`: Codex vẽ từng frame theo cách ổn định nhất hiện có — `pose` (dải hình que đúng chu kỳ idle/walk/run/jump/attack/hit, tay/chân trước-sau khác màu, cùng toán với `rig`), `canvas` (ảnh để Codex sửa: frame đã duyệt nằm sẵn ở ô 1, ý tưởng từ `sprite-pipeline` của OpenAI), `anim --lock-first` (đặt lại đúng pixel của frame đã duyệt), `replace` (thay frame hỏng, khớp cỡ và đường chân). Sửa preset `attack` (vung từ sau, qua đầu, chém ra trước).
- Skill `voxel-art` (`art-skills/`): model voxel viết bằng Python (box, ellipsoid, cylinder, layer, mirror, speckle) → sprite isometric pixel-perfect 1–4 hướng, strip animation, `.vox` cho MagicaVoxel.
- Luật art: không API key; agent chỉ tự vẽ bằng code khi là pixel art hoặc voxel.
- `asset-manifest.json`: `make` nhận thêm `pixel-code` và `voxel-code`.

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
