# GameKit

Plugin skill + script cho dây chuyền **port game từ engine bất kỳ sang web game JS/TS, reskin và phát hành lên portal**. Dùng được trên Claude Code (plugin) và Codex (skill + AGENTS.md).

Bản này gồm: trạng thái `game.yaml`, pipeline 6 pha có cổng, template game, interface platform + `dev-mock`, script validate / provenance / pack / release-check, dựng song song bằng worktree (fanout / integrate / check-ownership), tích hợp IDE. Từ 0.3.0: AI **nhìn thấy game chạy** (`smoke` trong trình duyệt headless, đo hiệu năng trên máy yếu), **lấy bằng chứng từ game gốc** (`recon`, trace → `oracle import`), **chuyển asset** (`assets`), skill cho mọi pha chính, CI và eval cho chính harness.

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
npm run dev                 # chơi thử với dev-mock (?ad=fail|skip|none|slow)
npm run gk -- status        # pha hiện tại, việc còn mở, skill tiếp theo
npm test                    # parity + replay + platform
npm run gk -- parity        # mọi nghĩa vụ trong spec/obligations.yaml đã có test xanh?
npm run gk -- smoke         # mở game trong Chromium headless: ảnh chụp .gamekit/smoke/, lỗi, bố cục, FPS
npm run gk -- gate          # kiểm tra cổng; --advance để sang pha sau
npm run gk -- pack --all --zip
npm run gk -- release-check
```

Trong VS Code: Ctrl+Shift+B = pack, task "GameKit: …" cho các lệnh khác, debug Chrome với dev-mock có sẵn trong `.vscode/`.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `init <tên>` | Tạo game từ `templates/game`, git init, cài hook, cài dependency. Hỏi thông tin (TTY) hoặc `--set k=v`; `--questions --json` in câu hỏi cho agent; `--third-party` khi làm lại game người khác |
| `config [--portal p] [--set k=v]` | Điền thông tin portal còn thiếu hoặc thêm portal (chép checklist vào `gates/P4.md`) |
| `status` / `next` | Pha, thời gian ở pha (cảnh báo vượt dự kiến), việc còn mở, skill tiếp theo |
| `gate [--advance]` | Chấm `gates/<pha>.md`: mục `{auto: …}` chạy script, mục `(bạn)` chỉ người dùng tick |
| `recon [<nguồn>] [--write]` | Nhận diện game gốc (thư mục, APK/XAPK/IPA/zip) mà không chạy nó: engine, phiên bản, Mono/IL2CPP/WebGL, logic/data ở đâu, công cụ hợp, thống kê asset. `--write` ghi `spec/recon.json` và điền `source.*` còn trống |
| `validate [--stage Px]` | Schema `game.yaml`, `params/*.json` (mọi giá trị có `source`; `confidence` = observed/derived/inferred, inferred cần `tolerance` từ P2), `spec/obligations.yaml`, `spec/oracles/*.json`, provenance, `module-plan.yaml`, `asset-manifest.json` |
| `parity [--report file.json]` | Chạy vitest, đóng từng nghĩa vụ trong `spec/obligations.yaml` bằng test gắn thẻ `[id:case]`. Test đỏ, skip/todo, thiếu case hay thẻ lạ đều tính là chưa đạt |
| `oracle import <trace> --to spec/oracles/<id>.json --in … --out … --source …` | Bảng oracle từ trace ghi khi chạy game gốc (CSV/JSONL/JSON); chọn dòng `--at t=0,5,10`, `--every`, `--max`. Công cụ ghi trace: `GkTraceRecorder.cs` (Unity), `gk-trace.js` (game web) |
| `assets scan \| unity-atlas \| convert` | Kiểm kê asset gốc → `spec/asset-inventory.json`; sprite sheet Unity (.png + .meta) → atlas JSON cho Pixi/Phaser; ảnh → WebP, âm thanh → MP3/OGG/M4A qua ffmpeg (`--label own` gắn provenance) |
| `provenance add <file…> --label …` | Nhãn `reference / generated / own / licensed / placeholder` |
| `pack [--portal] [--all] [--version V] [--compress] [--zip]` | `builds/<YYMMDDNN>/<portal>/{index.html, preview.html, version.txt, <v>/…}` + `builds/<v>/manifest.json` (+ zip) |
| `release-check [--version V] [--portal p]` | Mặc định bản mới nhất. Kiểm bố cục az-v1, footer bản quyền, chặn asset reference/placeholder, tên game gốc, link ngoài, đường dẫn tuyệt đối, vượt ngân sách tải |
| `smoke [--quick \| --scenarios basic\|full] [--only …] [--no-perf] [--version [V]] [--json]` | Mở game trong Chromium headless: desktop, mobile dọc/ngang, ad giả fail/skip/slow/none, máy yếu (CPU 4×, 1.6 Mbps). Bộ `basic` (desktop, mobile dọc/ngang, ad lỗi; ~25s) cho cổng P3/P4, `full` (~35s) cho P5. Chụp ảnh vào `.gamekit/smoke/`, bắt lỗi console/tải, cuộn trang, canvas tràn, màn trống, hình đứng yên, Settings + đổi ngôn ngữ, đo thời gian vào game và FPS theo `budget`. Cổng `{auto: smoke}`, `{auto: perf}` |
| `fanout --wave N` | Mỗi module một worktree `../<game>.worktrees/<id>` trên nhánh `mod/<id>` + `BRIEF.md` |
| `check-ownership` | Module chỉ sửa trong thư mục được giao, không đụng vùng shared |
| `integrate --wave N [--cleanup]` | Merge theo phụ thuộc, test sau mỗi merge, đỏ thì hoàn tác |
| `precommit` | Git hook: chặn `reference/`, `decompiled/`, code decompile, asset chưa nhãn |

## Cấu trúc plugin

```
.claude-plugin/   plugin.json, marketplace.json
hooks/            SessionStart → using-gamekit + gamekit status
commands/         /gamekit:status, /gamekit:next
skills/           using-gamekit; P0 game-recon, triage; P1 engine-unity, re-notes, gameplay-spec, asset-inventory, ui-extract;
                  P2 runtime-select, rebuild-game, parity-check, module-plan, integrate; P3 web-relayout; P4 platform-sdk;
                  P5 package-web-build, perf-budget, qa-smoke, release-check
portals/          vỏ portal dùng chung: azgames, dev-mock (portal.yaml, kit.mjs, shell.html, loader.entry.js, Icons/), shared/
scripts/          CLI gamekit.mjs + lệnh; lib/
schemas/          game, params, provenance, module-plan, asset-manifest (JSON Schema)
templates/game/   Vite + TS: core/ (deterministic), view/, platform/ (interface, PauseBus, dev-mock), contracts/, tests, gates, .vscode, AGENTS.md
tests/            node --test (GK_E2E=1: thêm lượt đầu-cuối với npm install thật + Chromium)
evals/            eval cho chính harness (claude plugin eval)
.github/          CI: test 3 hệ điều hành + đầu-cuối
```

## Template game

- `src/core/` logic thuần: `Rng` có seed, fixed timestep, input ghi/phát lại. ESLint chặn DOM, `Math.random`, `Date.now`, thư viện render và số lạ.
- `src/platform/`: `Platform` (game gọi) và `PortalAdapter` (mỗi portal một file mỏng). `createPlatform()` lo pause + tắt tiếng khi ad, gameplay start/stop cân bằng, không chồng ad, lọc tên event, save fallback. Build chỉ bundle adapter của portal đang đóng gói (`virtual:gk-adapter`).
- Game demo (né vật rơi) để pipeline chạy được từ đầu đến cuối; thay bằng game thật ở P2.
- `smoke` trong `game.yaml`: bước vào game (`click x y`, `tap x y`, `key Code`, `wait ms`), phím chơi ngẫu nhiên, thời gian chơi — để `gamekit smoke` chơi được game thật. `playwright-core` có sẵn trong devDependencies; trình duyệt dùng Chrome/Edge của máy, hoặc `npx playwright-core install chromium`, hoặc `GK_BROWSER`.
- `.github/workflows/gamekit.yml`: CI cho game (validate, test, typecheck, lint, parity từ P3, smoke; ảnh chụp tải về ở Artifacts).

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

**Game tạo trước 0.3.0** (chưa có `smoke`): `npm install -D playwright-core`; thêm `.gamekit/smoke/` vào `.gitignore`; chép `gates/P3.md`…`P5.md` từ template để có mục `{auto: smoke}`, `{auto: perf}`; tuỳ chọn chép mục `smoke:` trong `game.yaml` và `.github/workflows/gamekit.yml`.

**Game tạo trước khi có `source.ownership`** được coi là `own`, nhưng `gates/*.md` cũ vẫn giữ mục của chế độ làm lại game (forbiddenTerms, reskin). Game của bạn: chép `gates/P0.md`…`P3.md` từ `templates/game/gates/`. Game làm lại của người khác: thêm `ownership: third-party` dưới `source:` trong `game.yaml`.

## Lộ trình

1. ✅ Khung plugin
2. Adapter SDK thật: gmsdkv2, H5 Games Ads, CrazyGames, GameDistribution, Weegoo — chờ dữ liệu và tiêu chuẩn
3. Pipeline UI và style, template preview, asset-spec, giao diện review (đã có: ui-extract, web-relayout)
4. ✅ Engine Unity: `recon`, skill engine-unity (Ghidra headless cho IL2CPP), `GkTraceRecorder`, `assets unity-atlas`
5. Tạo đồ hoạ và âm thanh qua Codex/OpenAI
6. Engine còn lại (recon đã nhận diện; còn skill engine-cocos, engine-godot…)
7. ✅ QA, perf (`smoke`, perf-budget, qa-smoke); còn store assets

## Phát triển plugin

`npm test` chạy bộ test của CLI (tạo game tạm, chạy git thật). `GK_E2E=1 npm test` thêm lượt đầu-cuối: `init` có `npm install`, test/typecheck/lint của game, `smoke` (cả bản bị làm hỏng phải đỏ), gate P3, `pack` + `smoke --version` — cần mạng và một Chromium (`GK_BROWSER=<đường dẫn>` nếu không tự tìm thấy). CI (`.github/workflows/ci.yml`) chạy cả hai.

Kiểm tra template đầy đủ bằng tay: `init` một game, rồi `npm test`, `npm run typecheck`, `npm run lint`, `npm run gk -- smoke`, `npm run gk -- pack --all`, `npm run gk -- release-check`.

**Eval cho harness** (`evals/`, định dạng `claude plugin eval`, cần Claude Code ≥ 2.1.269, tốn usage): agent có dùng `recon` và báo đúng engine không, có tự tick mục "(bạn)" không, có kéo GameKit vào yêu cầu không liên quan không. Chạy sau khi sửa skill:
```bash
claude plugin eval . --scaffold --allow-tools Bash Edit Write --no-publish --max-cost-usd 3
```
Bash trong eval cần sandbox (Linux: `apt install bubblewrap socat`).
