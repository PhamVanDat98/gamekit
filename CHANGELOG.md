# Changelog

## Chưa phát hành
Nhận diện game gốc ở P0, cho mọi dạng phát hành:
- Lệnh `recon [đường dẫn] [--write] [--json]`: nhận dạng phát hành (APK, split APK XAPK/APKS/APKM, AAB, OBB, IPA, Windows/macOS/Linux, Electron/NW.js, web, project source), cửa hàng (Steam, GOG, Epic, itch) và ~40 biến thể engine (Unity Mono/IL2CPP/WebGL, Unreal, Godot, Cocos Creator/2d-x, GameMaker, RPG Maker MV/MZ/XP/VX, Ren'Py, Construct, Defold, LÖVE, MonoGame, libGDX, Flutter, React Native, Phaser/Pixi/three…), version Unity/Godot, nơi chứa logic/data, công cụ, cảnh báo (script mã hoá, OBB, Hermes, `.pak` AES…). Mở archive lồng nhau (XAPK → APK), zip64, `.asar`. `--write` ghi `notes/recon.md` (giữ mục "Kiểm tra tay") và điền `source.engine`/`engineVersion` khi còn trống.
- Skill `game-recon` (P0): lấy đúng bản build theo từng dạng, kiểm chứng kết quả recon, kiểm kê asset, báo cáo `notes/triage.md`.
- `source.engine` nhận thêm: egret, playcanvas, gamemaker, rpgmaker, renpy, defold, love2d, monogame, libgdx, openfl, solar2d, flutter, react-native, android-native, ios-native, native.
- Sửa: pre-commit trước đây để lọt file build gốc (`game.apk`, `libil2cpp.so`, `Assembly-CSharp.dll`, `global-metadata.dat`…) nếu chúng nằm ngoài `reference/`; giờ chặn file build gốc và code gốc/decompile (`.cs`, `.java`, `.gd`, `.lua`…) ở mọi chỗ.
- Sửa: cổng P0 chỉ xem `source.path` có điền hay không (đường dẫn sai vẫn qua). Giờ `{auto: source-path}` kiểm đường dẫn có trên máy và nằm ngoài thư mục game; `validate` báo lỗi khi bản gốc nằm trong thư mục game (sẽ bị commit), trừ `reference/`.
- `gates/P0.md`: thêm `{auto: file:notes/recon.md}` và `{auto: file:notes/triage.md}`. Game cũ: chép `gates/P0.md` từ template nếu muốn dùng.

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
