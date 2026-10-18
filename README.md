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
npm run dev                 # chơi thử với dev-mock (?ad=fail|skip|none|slow)
npm run gk -- status        # pha hiện tại, việc còn mở, skill tiếp theo
npm test                    # parity + replay + platform
npm run gk -- parity        # mọi nghĩa vụ trong spec/obligations.yaml đã có test xanh?
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
| `recon [đường dẫn] [--no-hash] [--no-write] [--json]` | Nhận diện engine game gốc theo dấu hiệu file (thư mục build hoặc APK/IPA/ZIP — đọc mục lục zip, không giải nén), phiên bản Unity; kiểm kê file vào `notes/inventory.json`; điền `source.engine/path/engineVersion` còn trống |
| `status` / `next` | Pha, thời gian ở pha (cảnh báo vượt dự kiến), việc còn mở, skill tiếp theo. Có `re-plan.yaml` / `module-plan.yaml`: việc song song — xong chờ integrate, đang làm, sẵn sàng giao ngay, đủ `maxParallel`, chờ phụ thuộc — kèm lệnh nên chạy |
| `gate [--advance]` | Chấm `gates/<pha>.md`: mục `{auto: …}` chạy script (song song; `test` + `parity` dùng chung một lần vitest), mục `(bạn)` chỉ người dùng tick. `{only: split\|single}` theo việc có `re-plan.yaml` |
| `gate --area <id>` | Cổng một mảng phân tích: luật P2 trên file của mảng, câu hỏi bắt buộc xong, nghĩa vụ có nguồn |
| `validate [--stage Px]` | Schema `game.yaml`, `params/*.json` (mọi giá trị có `source`; `confidence` = observed/derived/inferred, inferred cần `tolerance` từ P2), `spec/obligations.yaml`, `spec/oracles/*.json`, provenance, `module-plan.yaml`, `asset-manifest.json` |
| `questions [--area id] [--json]` | Câu hỏi phân tích theo mảng (`notes/<mảng>/questions.yaml`): tiến độ, câu bắt buộc chưa xong (chưa trả lời mà chưa ghi `openReason` + `impact`) |
| `parity [--report file.json]` | Chạy vitest, đóng từng nghĩa vụ trong `spec/obligations.yaml` bằng test gắn thẻ `[id:case]`. Test đỏ, skip/todo, thiếu case hay thẻ lạ đều tính là chưa đạt |
| `parity --area id \| --module id \| --obligation a,b [--json]` | Chỉ chấm và chỉ chạy test của nghĩa vụ trong phạm vi |
| `parity --mutate` | Đổi bảng oracle / số params của từng nghĩa vụ, chạy lại test của nó: oracle phải làm test đỏ (lỗi nếu không); params chỉ cảnh báo |
| `provenance add <file…> --label …` | Nhãn `reference / generated / own / licensed / placeholder` |
| `pack [--portal] [--all] [--version V] [--compress] [--zip]` | `builds/<YYMMDDNN>/<portal>/{index.html, preview.html, version.txt, <v>/…}` + `builds/<v>/manifest.json` (+ zip) |
| `release-check [--version V] [--portal p]` | Mặc định bản mới nhất. Kiểm bố cục az-v1, footer bản quyền, chặn asset reference/placeholder, tên game gốc, link ngoài, đường dẫn tuyệt đối, vượt ngân sách tải |
| `fanout [--plan build\|re] [--wave N \| --ready]` | Mỗi module một worktree `../<game>.worktrees/<id>` trên nhánh `mod/<id>` (mảng phân tích: `re-<id>`, nhánh `re/<id>`) + `BRIEF.md`; symlink `node_modules` và `links` (tư liệu local). `--ready`: mọi đơn vị có phụ thuộc đã merge, tối đa `maxParallel` |
| `check-ownership` | Module chỉ sửa trong thư mục được giao, không đụng vùng shared |
| `integrate [--plan build\|re] [--wave N \| --ready] [--keep-going] [--cleanup]` | Merge theo phụ thuộc, test sau mỗi merge (mảng: `validate`), đỏ thì hoàn tác. `--ready` bỏ qua đơn vị chưa xong; `--keep-going` bỏ qua đơn vị lỗi và đơn vị phụ thuộc nó |
| `precommit` | Git hook: chặn `reference/`, `decompiled/`, code decompile, asset chưa nhãn |

## Cấu trúc plugin

```
.claude-plugin/   plugin.json, marketplace.json
hooks/            SessionStart → using-gamekit + gamekit status
commands/         /gamekit:status, /gamekit:next
skills/           using-gamekit, rebuild-game, module-plan, integrate, platform-sdk, package-web-build, release-check
portals/          vỏ portal dùng chung: azgames, dev-mock (portal.yaml, kit.mjs, shell.html, loader.entry.js, Icons/), shared/
scripts/          CLI gamekit.mjs + lệnh; lib/
schemas/          game, params, provenance, module-plan, asset-manifest (JSON Schema)
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
