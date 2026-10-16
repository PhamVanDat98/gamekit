# GameKit

Plugin skill + script cho dây chuyền **port game từ engine bất kỳ sang web game JS/TS, reskin và phát hành lên portal**. Dùng được trên Claude Code (plugin) và Codex (skill + AGENTS.md).

Bản này là **dự án con 1 — khung plugin**: trạng thái `game.yaml`, pipeline 6 pha có cổng, template game, interface platform + `dev-mock`, script validate / provenance / pack / release-check, dựng song song bằng worktree (fanout / integrate / check-ownership), tích hợp IDE.

## Cài

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
| `init <tên>` | Tạo game từ `templates/game`, git init, cài hook, cài dependency |
| `status` / `next` | Pha, thời gian ở pha (cảnh báo vượt dự kiến), việc còn mở, skill tiếp theo |
| `gate [--advance]` | Chấm `gates/<pha>.md`: mục `{auto: …}` chạy script, mục `(bạn)` chỉ người dùng tick |
| `validate [--stage Px]` | Schema `game.yaml`, `params/*.json` (mọi giá trị có `source`; `confidence` = observed/derived/inferred, inferred cần `tolerance` từ P2), `spec/obligations.yaml`, `spec/oracles/*.json`, provenance, `module-plan.yaml`, `asset-manifest.json` |
| `parity [--report file.json]` | Chạy vitest, đóng từng nghĩa vụ trong `spec/obligations.yaml` bằng test gắn thẻ `[id:case]`. Test đỏ, skip/todo, thiếu case hay thẻ lạ đều tính là chưa đạt |
| `provenance add <file…> --label …` | Nhãn `reference / generated / own / licensed / placeholder` |
| `pack [--portal] [--all] [--compress] [--zip]` | `dist/<portal>/{index.html, Build/, StreamingAssets/, TemplateData/}` + `build-manifest.json` |
| `release-check` | Chặn asset reference/placeholder, tên game gốc, link ngoài, đường dẫn tuyệt đối, vượt ngân sách tải |
| `fanout --wave N` | Mỗi module một worktree `../<game>.worktrees/<id>` trên nhánh `mod/<id>` + `BRIEF.md` |
| `check-ownership` | Module chỉ sửa trong thư mục được giao, không đụng vùng shared |
| `integrate --wave N [--cleanup]` | Merge theo phụ thuộc, test sau mỗi merge, đỏ thì hoàn tác |
| `precommit` | Git hook: chặn `reference/`, `decompiled/`, code decompile, asset chưa nhãn |

## Cấu trúc plugin

```
.claude-plugin/   plugin.json, marketplace.json
hooks/            SessionStart → using-gamekit + gamekit status
commands/         /gamekit:status, /gamekit:next
skills/           using-gamekit, rebuild-game, module-plan, integrate, platform-sdk, package-web-build, release-check
scripts/          CLI gamekit.mjs + lệnh; lib/
schemas/          game, params, provenance, module-plan, asset-manifest (JSON Schema)
templates/game/   Vite + TS: core/ (deterministic), view/, platform/ (interface, PauseBus, dev-mock), contracts/, tests, gates, .vscode, AGENTS.md
tests/            node --test
```

## Template game

- `src/core/` logic thuần: `Rng` có seed, fixed timestep, input ghi/phát lại. ESLint chặn DOM, `Math.random`, `Date.now`, thư viện render và số lạ.
- `src/platform/`: `Platform` (game gọi) và `PortalAdapter` (mỗi portal một file mỏng). `createPlatform()` lo pause + tắt tiếng khi ad, gameplay start/stop cân bằng, không chồng ad, lọc tên event, save fallback. Build chỉ bundle adapter của portal đang đóng gói (`virtual:gk-adapter`).
- Game demo (né vật rơi) để pipeline chạy được từ đầu đến cuối; thay bằng game thật ở P2.

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
