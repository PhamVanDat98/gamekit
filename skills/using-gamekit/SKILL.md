---
name: using-gamekit
description: Dùng khi làm việc với một game port/reskin bằng GameKit (thư mục có game.yaml), hoặc khi người dùng muốn port một game có sẵn sang web, reskin, gắn SDK portal, đóng gói phát hành. Cho biết pipeline 6 pha, luật cứng, lệnh gamekit và skill nào dùng tiếp.
---

# Dùng GameKit

GameKit là dây chuyền port game từ engine bất kỳ sang web game JS/TS, reskin và phát hành lên portal. Trạng thái mỗi game nằm trong `game.yaml`. **Trước khi làm gì trong một game, chạy `gamekit status`** để biết pha hiện tại, việc còn mở ở cổng và skill nên dùng.

## Gọi CLI
- Trong thư mục game: `npm run gk -- <lệnh>` (shim `scripts/gk.mjs` trỏ tới plugin).
- Từ Claude Code ở bất kỳ đâu: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gamekit.mjs" <lệnh>`.
- Lệnh: `init`, `config`, `status`, `gate [--advance]`, `validate`, `parity`, `unity scan`, `unity params`, `provenance add|list`, `pack`, `release-check`, `fanout`, `check-ownership`, `integrate`. `gamekit help` để xem đủ.

## Game gốc là Unity
Dùng skill **engine-unity** từ P1. Có source project: `gamekit unity scan` trước khi đọc code — số liệu lấy từ giá trị inspector bằng `gamekit unity params <Class>`, không từ mặc định trong code; port theo tầng phụ thuộc trong port-map; mỗi script được theo dõi trong `spec/port-map.yaml` tới khi `done`/`skip`; core dùng `src/core/unity/` (Mathf, Random.Range, AnimationCurve, coroutine đúng ngữ nghĩa Unity).

## Tạo game mới (agent)
1. `gamekit init <tên> --questions --json` → danh sách câu hỏi (label, description, example, default, required). Không có TTY thì init không tự hỏi.
2. Hỏi người dùng **từng câu, kèm `description`** (trong Claude Code dùng AskUserQuestion). Câu của portal (`azgames.gameCode`, …) chỉ hỏi cho portal đã chọn trong câu `portals`.
3. `gamekit init <tên> --set title=… --set portals=azgames --set azgames.gameCode=… …`. Câu bắt buộc chưa biết thì bỏ qua: game vẫn tạo, `status` liệt kê còn thiếu, `pack` portal đó sẽ dừng.
4. Bổ sung sau: `gamekit config --portal <id> [--set k=v …]` (cũng dùng để thêm portal mới; checklist của portal được chép vào `gates/P4.md`).

## Pipeline 6 pha
| Pha | Việc | Skill | Người dùng quyết |
| --- | --- | --- | --- |
| P0 Intake | Nhận diện engine, kiểm kê, chấm khả thi | game-recon, triage | Làm hay bỏ |
| P1 Phân tích | Trích logic, số liệu, asset, UI từ game gốc | engine-* (**engine-unity**), **re-notes**, gameplay-spec, asset-inventory, ui-extract | |
| P2 Dựng lại | Dựng lại bằng JS/TS, chơi được (asset gốc nếu là game của người dùng, placeholder nếu làm lại) | engine-*, runtime-select, **module-plan**, **rebuild-game**, **integrate**, **parity-check** | |
| P3 Chuyển sang web | Điều khiển, bố cục web, nén asset. `third-party`: thêm reskin (style, asset mới theo spec) | web-relayout; `third-party`: style-*, asset-spec, apply-style, replace-* | Duyệt bố cục; `third-party`: chọn style |
| P4 Tích hợp | SDK portal, analytics, leaderboard, save | **platform-sdk**, add-* | |
| P5 Phát hành | Đóng gói, hiệu năng, QA, ảnh store | **package-web-build**, perf-budget, qa-smoke, store-assets, **release-check** | Playtest cuối |

Skill **in đậm** có trong bản này. Skill khác chưa có: làm theo luật dưới đây và checklist trong `gates/<pha>.md`, ghi lại cách làm để sau đúc thành skill.

Mỗi pha kết thúc bằng một cổng (`gates/P*.md`). `gamekit gate` kiểm tra; mục `{auto: …}` do script chấm; mục `(bạn)` **chỉ người dùng được tick** — hỏi họ, không tự tick. Chỉ chạy `gamekit gate --advance` khi người dùng đồng ý.

## Game của ai: `source.ownership`
- **`own` (mặc định)**: game của chính người dùng — có source, hoặc mất source chỉ còn bản build (APK…). Giữ nguyên hình, âm thanh, tên, text. Không hỏi lại điều này; chỉ đổi khi người dùng nói đây là game của người khác.
- **`third-party`**: làm lại game của người khác (`gamekit init … --third-party`). Bắt buộc reskin, chặn tên gốc.

Cổng tự bỏ các mục `{only: …}` không áp cho game này.

## Luật cứng
1. **Dữ liệu và logic gameplay bám sát game gốc.** Mọi số gameplay nằm trong `params/*.json`, mỗi giá trị có `source` (file + hàm/offset, hoặc đo từ video). Không tự đặt số. Sai khác chỉ khi web bắt buộc (điều khiển cảm ứng, bố cục, hiệu năng): thêm `deviation` + mục `D-n` trong `DECISIONS.md`, chờ người dùng duyệt. `third-party`: không áp cho đồ hoạ, âm thanh, tên, text — phần đó phải làm mới.
2. **Code gốc.** `own`: được dịch thẳng code gốc (C#, decompile của chính game này) sang TypeScript, nhưng viết lại cho hợp `core/`/`view/` chứ không dịch máy từng dòng; ghi chú trong `notes/` chỉ ra logic nằm ở đâu. `third-party`: bám hành vi, không chép code; ghi chú RE viết bằng lời của mình. Cả hai: không commit code gốc hay code decompile vào repo game (hook chặn).
3. **Asset gốc.** `own`: xuất sang định dạng web, đưa vào `assets/`/`public/`, nhãn `own`. `third-party`: chỉ là tư liệu, nằm trong `reference/` (gitignored). Mọi file trong `assets/`, `public/` phải có nhãn provenance: `reference | generated | own | licensed | placeholder`. Bản phát hành không được còn `reference` hay `placeholder`.
4. **Phân tích.** `own`: được chạy, debug, đo game gốc. `third-party`: chỉ phân tích file tĩnh, không can thiệp vào game đang chạy.
5. **Art brief** (`third-party`) mô tả thiết kế mới, không viết "vẽ lại nhân vật X của game gốc".

## Cấu trúc một game
`src/core/` logic thuần, deterministic (không DOM, không render, `Rng` có seed, fixed timestep; game Unity có thêm `src/core/unity/`) · `src/view/` render + input, chỉ đọc state · `src/platform/` interface chung cho mọi portal · `src/contracts/` type dùng chung · `params/` số liệu có nguồn · `spec/` (gameplay spec, `obligations.yaml` nghĩa vụ parity, `oracles/` bảng từ game gốc, `port-map.yaml` script gốc → file TS) · `notes/` (ghi chú RE, `QUESTIONS.md`, `unity/` kết quả quét) · `gates/` · `DECISIONS.md` · `provenance.json` · `module-plan.yaml` (khi dựng song song).

## Test
- `core/` và adapter: **TDD** (dùng skill test-driven-development của Superpowers nếu có). Giá trị kỳ vọng lấy từ `params/` = game gốc, kèm `tolerance`.
- Gameplay tổng thể: replay test (ghi input, phát lại, so `worldHash`).
- Parity: mỗi cơ chế là một nghĩa vụ trong `spec/obligations.yaml`, đóng bằng test gắn thẻ `[id:case]`; `gamekit parity` chấm theo kiểu fail-closed (skill **parity-check**).
- `view/`: không unit test; dùng screenshot và checklist.

## Nói đúng mức chắc chắn
Tách rõ thứ **quan sát được** (đọc thẳng từ game gốc), **suy ra** (từ logic đã lần) và **ước lượng** (đo video, thử tay). Ghi vào `confidence` của params/oracle. Chưa biết thì ghi là chưa biết, không lấp bằng phỏng đoán; tìm không thấy chỉ có nghĩa là không thấy trong phạm vi đã tìm. Khi báo cáo, chỉ kể những kiểm tra đã thật sự chạy.

## Kết hợp Superpowers
GameKit không viết lại brainstorming, plan, TDD, review, worktree, điều phối subagent — dùng skill của Superpowers cho phần đó. GameKit thêm kiến thức chuyên ngành game, luật và script.

## Harness
Skill viết trung lập. Phần riêng: `references/claude-code.md`, `references/codex.md`. Chuẩn phát triển đầy đủ: `references/standards.md`.
