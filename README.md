# GameKit

Plugin skill + script cho dây chuyền **port game từ engine bất kỳ sang web game JS/TS, reskin và phát hành lên portal**. Dùng được trên Claude Code (plugin) và Codex (skill + AGENTS.md).

Bản này là **dự án con 1 — khung plugin**: trạng thái `game.yaml`, pipeline 6 pha có cổng, template game, interface platform + `dev-mock`, script validate / provenance / pack / release-check, dựng song song bằng worktree (fanout / integrate / check-ownership), tích hợp IDE.

**Game của ai.** Mặc định GameKit coi game là **của bạn** (`source.ownership: own`): giữ nguyên hình, âm thanh, tên; asset gốc gắn nhãn `own` và được phát hành; P3 là chuyển sang web (điều khiển, bố cục, nén asset). Làm lại game của người khác thì `init … --third-party`: asset gốc chỉ là tư liệu, bắt buộc reskin, chặn tên gốc. Mục cổng chỉ áp cho một loại game ghi `{only: own}` / `{only: third-party}`.

## Cài

Người dùng thử: xem [DUNG-THU.md](DUNG-THU.md).

Cần Node ≥ 20 và git.

```bash
cd gamekit && npm install
```

**Claude Code**
```
/plugin marketplace add /đường/dẫn/tới/gamekit
/plugin install gamekit@gamekit-dev
```
Sau khi cài: hook SessionStart nạp `using-gamekit`; có `/gamekit:status` và `/gamekit:next`.

**Codex**: game tạo từ template có sẵn `AGENTS.md`. Chép hoặc symlink `skills/` vào thư mục skill của Codex nếu muốn Codex tự nạp skill.

**Dòng lệnh** (tuỳ chọn): `npm link` trong thư mục plugin để có lệnh `gamekit` toàn cục.

## Dùng nhanh

```bash
node scripts/gamekit.mjs init my-game --title "Tên Mới" --engine unity --dir ~/games
cd ~/games/my-game
npm run gk -- recon ~/games-src/goc --write   # P0: engine, logic/data, SDK, khả thi, danh mục cơ chế
npm run dev                 # chơi thử với dev-mock (?ad=fail|skip|none|slow)
npm run gk -- status        # pha hiện tại, việc còn mở, skill tiếp theo
npm test                    # parity + replay + platform
npm run gk -- parity        # mọi nghĩa vụ trong spec/obligations.yaml đã có test xanh?
npm run gk -- re --watch    # theo dõi phân tích game gốc (P1) trực tiếp
npm run gk -- gate          # kiểm tra cổng; --advance để sang pha sau
npm run gk -- pack --all --zip
npm run gk -- release-check
npm run gk -- smoke         # bản build trong Chromium: máy tính + điện thoại, FPS, thời gian vào game
```

Trong VS Code: Ctrl+Shift+B = pack, task "GameKit: …" cho các lệnh khác, debug Chrome với dev-mock có sẵn trong `.vscode/`.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `init <tên>` | Tạo game từ `templates/game`, git init, cài hook, cài dependency. Hỏi thông tin (TTY) hoặc `--set k=v`; `--questions --json` in câu hỏi cho agent; `--third-party` khi làm lại game người khác |
| `config [--portal p] [--set k=v]` | Điền thông tin portal còn thiếu hoặc thêm portal (chép checklist vào `gates/P4.md`) |
| `recon [đường dẫn] [--write] [--json]` | Nhận diện game gốc từ thư mục, APK/IPA/zip, `Assembly-CSharp.dll`, `dump.cs` (Il2CppDumper) hoặc `.pck`: engine, phiên bản, dạng build (Mono/IL2CPP/WebGL, Creator 2/3…), nơi chứa logic và data, SDK (server, quảng cáo, analytics, IAP), dấu hiệu làm rối code, công cụ gợi ý, đánh giá khả thi và số ngày dự kiến. `--write` ghi `notes/recon.md`, `game.yaml`, danh mục cơ chế `spec/inventory.yaml` |
| `status` / `next` | Pha, thời gian ở pha (cảnh báo vượt dự kiến), việc còn mở, skill tiếp theo |
| `gate [--advance]` | Chấm `gates/<pha>.md`: mục `{auto: …}` chạy script, mục `(bạn)` chỉ người dùng tick |
| `validate [--stage Px]` | Schema `game.yaml`, `params/*.json` (mọi giá trị có `source`; `confidence` = observed/derived/inferred, inferred cần `tolerance` từ P2), `spec/obligations.yaml`, `spec/oracles/*.json`, provenance, `module-plan.yaml`, `asset-manifest.json` |
| `parity [--report file.json]` | Chạy vitest, đóng từng nghĩa vụ trong `spec/obligations.yaml` bằng test gắn thẻ `[id:case]`. Test đỏ, skip/todo, thiếu case hay thẻ lạ đều tính là chưa đạt |
| `re [--watch] [--json]` · `re focus <Q#>` · `re log "…"` | Theo dõi RE: câu hỏi trong `notes/QUESTIONS.md` theo trạng thái, bước phân tích và evidence của từng câu (nhật ký `notes/re-log.jsonl`), bước gần đây, cảnh báo (bước chưa gắn câu, phân tích lặp, kết quả bị cắt, game third-party dùng tool chạy game). Trong Claude Code hook tự ghi tool REA và lệnh RE; nơi khác ghi tay bằng `re log`. Có tỉ lệ phủ danh mục cơ chế và mục "còn phải xong trước cổng" (câu chưa xong thiếu ảnh hưởng, cơ chế chưa xử lý, spec còn TODO, nghĩa vụ chưa có nguồn; từ P2: câu còn mở). Cổng P1, P2 chấm `{auto: re}` |
| `assets [thư mục…] [--write]` | Kiểm kê asset (mặc định `assets/` + `public/`, hoặc thư mục xuất từ game gốc): theo loại và dung lượng, định dạng phải chuyển cho web, file quá nặng, nhãn provenance; `--write` ghi `notes/assets.md` |
| `provenance add <file…> --label …` | Nhãn `reference / generated / own / licensed / placeholder` |
| `pack [--portal] [--all] [--version V] [--compress] [--zip]` | `builds/<YYMMDDNN>/<portal>/{index.html, preview.html, version.txt, <v>/…}` + `builds/<v>/manifest.json` (+ zip) |
| `release-check [--version V] [--portal p]` | Mặc định bản mới nhất. Kiểm bố cục az-v1, footer bản quyền, chặn asset reference/placeholder, tên game gốc, link ngoài, đường dẫn tuyệt đối, vượt ngân sách tải |
| `smoke [--version V] [--json]` | Mở gói `dev-mock` của bản build trong Chromium headless: máy tính, điện thoại dọc/ngang (CPU chậm 4×). Đo thời gian vào game, bắt đầu chơi bằng phím/chạm, FPS, lỗi console, request hỏng, Settings + footer bản quyền; so với `budget` trong `game.yaml`; ảnh chụp ở `builds/<v>/smoke/`. Cần Playwright (không phải dependency của GameKit). Cổng P5 chấm `{auto: smoke}` |
| `fanout --wave N` | Mỗi module một worktree `../<game>.worktrees/<id>` trên nhánh `mod/<id>` + `BRIEF.md` |
| `check-ownership` | Module chỉ sửa trong thư mục được giao, không đụng vùng shared |
| `integrate --wave N [--cleanup]` | Merge theo phụ thuộc, test sau mỗi merge, đỏ thì hoàn tác |
| `precommit` | Git hook: chặn `reference/`, `decompiled/`, code decompile, asset chưa nhãn |

## Cấu trúc plugin

```
.claude-plugin/   plugin.json, marketplace.json
hooks/            SessionStart → using-gamekit + gamekit status; PostToolUse → nhật ký RE (tool REA, lệnh RE)
commands/         /gamekit:status, /gamekit:next
skills/           đủ mọi skill mà 6 pha gợi ý (38): using-gamekit · P0 game-recon, triage · P1 engine-{unity,cocos,godot,html5,
                  construct,laya,flash,unreal,gamemaker,native}, re-notes, asset-inventory, ui-extract, parity-check (+ oracle-harness) ·
                  P2 runtime-select, module-plan, rebuild-game, integrate · P3 web-relayout; third-party: style-direction, style-preview,
                  asset-spec, apply-style, replace-graphics, replace-audio, rename-and-text · P4 platform-sdk, add-analytics,
                  add-leaderboard, add-save, add-i18n · P5 package-web-build, qa-smoke, store-assets, release-check
portals/          vỏ portal dùng chung: azgames, dev-mock (portal.yaml, kit.mjs, shell.html, loader.entry.js, Icons/), shared/
scripts/          CLI gamekit.mjs + lệnh; lib/
schemas/          game, params, obligations, oracle, inventory, provenance, module-plan, asset-manifest (JSON Schema)
templates/game/   Vite + TS: core/ (deterministic), view/, platform/ (interface, PauseBus, dev-mock), contracts/, tests, gates, .vscode, AGENTS.md
tests/            node --test
```

## Template game

- `src/core/` logic thuần: `Rng` có seed, fixed timestep, input ghi/phát lại. ESLint chặn DOM, `Math.random`, `Date.now`, thư viện render và số lạ.
- `src/platform/`: `Platform` (game gọi) và `PortalAdapter` (mỗi portal một file mỏng). `createPlatform()` lo pause + tắt tiếng khi ad, gameplay start/stop cân bằng, không chồng ad, lọc tên event, save fallback. Build chỉ bundle adapter của portal đang đóng gói (`virtual:gk-adapter`).
- Game demo (né vật rơi) để pipeline chạy được từ đầu đến cuối; thay bằng game thật ở P2.

## Nâng cấp game cũ

Game tạo từ template trước bố cục az-v1 build ra `index.html` + `Build/` (hoặc `dist/`); `pack` bây giờ dừng với lỗi "vite.config.ts của game là bản cũ". Chép từ `templates/game/` của GameKit sang game (giữ phần code gameplay của bạn trong `src/core/`, `src/view/` nếu đã sửa — so sánh rồi gộp):

1. `vite.config.ts` (ra `framework.js`, `css/style.css`, `assets/{img,art,audio,fonts}/`).
2. `package.json`: thêm `esbuild`, `javascript-obfuscator` vào `devDependencies`; script `"preview": "vite preview --outDir builds"`. Rồi `npm install`.
3. `src/main.ts`.
4. `src/platform/`: `index.ts`, `types.ts`, `create-platform.ts`, `gm-globals.d.ts`, `dev-loader.ts`, `adapters/azgames.ts`, `web-guard.ts`.
5. `src/view/`: `i18n.ts`, `settings.ts`, `style.css`, `renderer.ts`, `input-dom.ts` (popup Settings phải giữ footer `gk-settings-footer`).
6. `Language/en.json` (chuỗi của game đưa vào đây, gọi bằng `t()`).
7. `public/Icons/web.png`, `public/Icons/loading.webp`, và hai mục tương ứng trong `provenance.json` (thay bằng icon thật ở P3).
8. `.gitignore`: `builds/` thay cho `dist/` (cũng sửa `ignores` trong `eslint.config.js`, `search.exclude` trong `.vscode/settings.json`). `index.html` gốc: favicon `./Icons/web.png`.
9. Xoá `public/TemplateData/`; dữ liệu tĩnh để trong `public/StreamingAssets/`.

Sau đó: `npm run gk -- config` (điền thông tin portal: gameCode, signed…), `npm run gk -- validate`, `npm test`, `npm run typecheck`, rồi `npm run gk -- pack --all`.

**Game tạo trước khi có `source.ownership`** được coi là `own`, nhưng `gates/*.md` cũ vẫn giữ mục của chế độ làm lại game (forbiddenTerms, reskin). Game của bạn: chép `gates/P0.md`…`P3.md` từ `templates/game/gates/`. Game làm lại của người khác: thêm `ownership: third-party` dưới `source:` trong `game.yaml`.

**Game tạo trước khi có `recon`/danh mục cơ chế** vẫn chạy như cũ (cổng cũ không có mục `{auto: re}`, `{auto: smoke}`). Muốn dùng quy trình mới: chạy `npm run gk -- recon <game gốc> --write`; chép `gates/P0.md`, `P1.md`, `P2.md`, `P3.md`, `P5.md` và `spec/gameplay-spec.md` từ `templates/game/` (nếu đang ở P1 trở đi, điền spec trước); thêm cột "Ảnh hưởng nếu chưa rõ" vào bảng `notes/QUESTIONS.md`; chép `src/core/rng.ts`, `rng-dotnet.ts` nếu cần RNG gốc. `npm run gk -- re` liệt kê những gì còn thiếu.

## Lộ trình

1. ✅ Khung plugin (bản này)
2. Adapter SDK thật: gmsdkv2, H5 Games Ads, CrazyGames, GameDistribution, Weegoo — chờ dữ liệu và tiêu chuẩn
3. Pipeline UI và style, template preview, asset-spec, giao diện review
4. Adapter engine Unity + script Ghidra headless
5. Tạo đồ hoạ và âm thanh qua Codex/OpenAI
6. Engine còn lại
7. QA, perf, store assets

## Phát triển plugin

`npm test` chạy bộ test của CLI (tạo game tạm, chạy git thật). Kiểm tra template đầy đủ: `init` một game, rồi `npm test`, `npm run typecheck`, `npm run lint`, `npm run gk -- pack --all`, `npm run gk -- release-check`.
