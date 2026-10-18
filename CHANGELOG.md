# Changelog

## Chưa phát hành
- Mã quyết định theo mảng `D-<mảng>-n` (vd `D-player-1`), ghi trong `notes/<mảng>/decisions.md`: các mảng/module chạy song song không còn cùng sửa `DECISIONS.md`, không trùng số. `validate` chặn mã trùng và mã sai mảng; `D-n` trong `DECISIONS.md` giữ như cũ.
- Kế hoạch chia mảng phân tích `re-plan.yaml` (`kind: re`, mẫu `re-plan.example.yaml`): mảng sở hữu file riêng (bắt buộc `notes/<mảng>/`), phụ thuộc theo đồ thị (không theo đợt), `links` (tư liệu local gitignored sẽ symlink vào worktree), `units` (đơn vị chuẩn), `buildModule` (module P2 nhận kết quả). `validate` kiểm schema, trùng sở hữu, vùng dùng chung, vòng phụ thuộc, `buildModule` có trong `module-plan.yaml`, `links` phải được gitignore. `module-plan.yaml` nhận thêm `kind: build` và `links`.
- Câu hỏi theo mảng `notes/<mảng>/questions.yaml` (mẫu `notes/questions.example.yaml`): `validate` kiểm schema, id `<mảng>.<tên>`, trùng id giữa các mảng. `notes/QUESTIONS.md` vẫn dùng được khi không chia mảng.
- `scripts/lib/plan.mjs`: lõi chung cho hai loại kế hoạch (nhánh `re/<id>` / `mod/<id>`, `topo`, `readySet` — đơn vị sẵn sàng chạy theo phụ thuộc và `maxParallel`). Lệnh `fanout`/`integrate` chưa dùng `re-plan.yaml` (gói W3).
- Params theo mảng: `params/<tên>.json` nằm dưới khoá tên file (`params/player.json` → `PARAMS.player.*`, `params/game.json` vẫn ở gốc). Game nạp file qua `FILES` trong `src/core/params.ts` (giữ kiểu TypeScript); `validate` báo file chưa được nạp, nhóm params nằm ở hai file, khoá trùng. Nghĩa vụ trỏ tới khoá đúng như game đọc (`player.speed`); khoá trần của file khác `game.json` (vd `speed` trong `params/player.json`) không còn được nhận.
- Nghĩa vụ theo mảng: `spec/obligations/<mảng>.yaml` gộp với `spec/obligations.yaml` cho `validate` và `parity`; id phải có tiền tố `<mảng>.`, trùng id giữa các file là lỗi.
- `fanout` / `integrate` / `check-ownership` chạy được cả mảng phân tích (`--plan re`: nhánh `re/<id>`, worktree `re-<id>`, merge `merge: re/<id> (mảng)`, mặc định kiểm bằng `validate`) lẫn module (`--plan build`, mặc định). `check-ownership` tự nhận kế hoạch theo tiền tố nhánh.
- `--ready`: mở/merge theo đồ thị phụ thuộc thay cho cả đợt — module chỉ chờ phụ thuộc của chính nó; đơn vị đang làm dở được bỏ qua khi integrate. `maxParallel` giờ được giữ thật (tính cả worktree đang mở), kể cả với `--wave`.
- `integrate --keep-going`: đơn vị lỗi không dừng cả lượt, đơn vị phụ thuộc nó được giữ lại, đơn vị độc lập vẫn merge.
- `links` trong kế hoạch: symlink tư liệu local (`decompiled/`, `reference/`) vào worktree; tên được thêm vào `info/exclude` chung (mẫu `decompiled/` của `.gitignore` không phủ symlink). Brief của mảng ghi câu hỏi, đầu ra, đơn vị chuẩn, mã `D-<mảng>-n`; brief của module dựng từ một mảng kèm nghĩa vụ của mảng đó.
- File `params/<tên>.json` chưa được nạp trong `src/core/params.ts`: cảnh báo trước P2 (mảng phân tích ghi số trước khi game đọc), lỗi từ P2.
- Câu hỏi theo mảng có liên kết được kiểm: `notes`, `params`, `obligations` mà câu hỏi trỏ tới phải có thật (mọi pha). Từ P2: câu `answered` phải có ghi chú; ghi chú được trỏ tới phải đủ năm phần (Kết luận, Vị trí, Độ tin cậy, Phạm vi đã tìm, Còn chưa biết) và ghi `observed|derived|inferred`; câu bắt buộc chưa xong phải có `openReason` + `impact`. Trước P2 là cảnh báo.
- `obligations[].source` phải trỏ tới file có thật.
- Lệnh `gamekit questions [--area id] [--json]`: tiến độ từng mảng và câu bắt buộc còn chặn.
- Cổng mảng `gamekit gate --area <id>`: luật P2 (params có nguồn, không TODO, ghi chú đủ năm phần…) chỉ trên file mảng sở hữu, câu hỏi bắt buộc xong, nghĩa vụ của mảng có `source`. Mảng khác chưa xong không chặn; nạp params vào `src/core/params.ts` không tính (việc của agent chính).
- Mục cổng tự động mới: `{auto: areas}` (mọi mảng của `re-plan.yaml` đã merge và qua cổng mảng), `{auto: merged}` (mọi module đã merge, worktree đã gỡ), `{auto: questions}`. Thẻ `{only: split}` / `{only: single}` theo việc có `re-plan.yaml`. Template: P1 có `{auto: areas}` và `{auto: file:spec/gameplay-spec.md}`, mục `QUESTIONS.md` chỉ cho game không chia mảng; P2 `Mọi module đã merge` là `{auto: merged}`.
- `gate` chạy các mục auto song song (`pack`, `release-check` vẫn lần lượt, sau cùng); `{auto: test}` và `{auto: parity}` dùng chung một lần vitest khi `npm test` là `vitest run`. Cổng P2 của game demo: 7,4 s → 3,6 s.
- `parity --area <id> | --module <id> | --obligation a,b`: chỉ chấm và chỉ chạy (vitest `-t`) test của nghĩa vụ trong phạm vi; thẻ của nghĩa vụ ngoài phạm vi không tính là lạ. `--json`. Module nhận nghĩa vụ từ trường mới `obligations` trong `module-plan.yaml` (validate kiểm có thật), hoặc từ mảng có `buildModule` trỏ tới nó.
- `parity --mutate`: đổi bảng oracle của nghĩa vụ (test oracle phải đỏ, không thì lỗi) và từng số params (vẫn xanh = cảnh báo: kỳ vọng lấy từ chính params). Luôn khôi phục file. Skill parity-check mục 5 viết lại theo đó — hướng dẫn cũ "đổi params thì phải đỏ" sai với test lấy kỳ vọng từ params.
- `integrate --scoped`: sau mỗi merge chỉ test của module + `parity --module`, cuối lượt chạy toàn bộ một lần; đỏ thì hoàn tác cả lượt.
- `status` có mục **Việc song song** cho `re-plan.yaml` và `module-plan.yaml`: xong chờ integrate (kèm số commit), đang làm, sẵn sàng giao ngay, sẵn sàng nhưng đủ `maxParallel`, chờ phụ thuộc nào — kèm lệnh nên chạy. Trạng thái chỉ đọc từ git và worktree. `/gamekit:next` integrate trước, rồi giao mọi đơn vị sẵn sàng cho subagent trong cùng một lượt.
- Lệnh `gamekit recon [đường dẫn]`: nhận diện engine game gốc theo dấu hiệu file (Unity Mono/IL2CPP/WebGL, Godot, Unreal, Flash, Cocos, Construct, Laya, HTML5 Phaser/Pixi/RPG Maker, GameMaker) kèm bằng chứng; đọc mục lục APK/IPA/AAB/XAPK/ZIP (cả zip64) mà không giải nén; đọc phiên bản Unity; kiểm kê mọi file vào `notes/inventory.json` (cỡ, sha256 hoặc crc32 trong gói, loại). Chỉ điền `source.engine/path/engineVersion` còn trống, cảnh báo khi engine đã ghi khác. Không quét chính repo game (trừ `reference/`, `decompiled/`). Cổng P0 có `{auto: file:notes/inventory.json}`.
- `docs/re-process-review.md`: rà soát quy trình RE và kế hoạch chạy song song.

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
