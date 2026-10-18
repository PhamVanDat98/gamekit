---
name: rebuild-game
description: Dùng ở pha P2 khi dựng lại một game bằng JS/TS từ spec, params và nghĩa vụ đã lập ở P1 — skill điều phối của P2 (thứ tự làm, khi nào dùng runtime-select, module-plan, port-data, port-timing, port-physics, parity-check, parity-debug, integrate); luật viết core/ theo TDD, deterministic, RNG gốc; chơi được trọn vẹn (asset gốc nếu là game của người dùng, placeholder nếu làm lại game người khác).
---

# Dựng lại game (P2)

Mục tiêu cổng P2: chơi được trọn vẹn (`own`: với asset gốc nhãn `own`; `third-party`: với placeholder), mọi nghĩa vụ bắt buộc đóng (`gamekit parity`), không còn câu hỏi RE "mở", không còn source TODO. P2 không làm điều khiển web/bố cục (P3), SDK portal/save/leaderboard (P4).

## Lộ trình
| # | Việc | Skill |
| --- | --- | --- |
| 1 | Kiểm đầu vào từ P1: `gamekit re` không còn việc trước cổng P1, `spec/obligations.yaml` là nghĩa vụ của game gốc | (P1: re-notes, parity-check §1) |
| 2 | Chọn cách vẽ, vật lý, `fixedStepHz` | **runtime-select** |
| 3 | Game lớn: chia module, chốt `src/contracts/`, giao song song | **module-plan** → `gamekit fanout` |
| 4 | Chuyển dữ liệu nội dung (level, wave, bảng) bằng script → `data/*.json` | **port-data** |
| 5 | Viết logic `core/` theo TDD (mục 2–3 dưới đây) | rebuild-game |
| 6 | Hẹn giờ, coroutine, tween, máy trạng thái → theo tick | **port-timing** |
| 7 | Chuyển động, va chạm | **port-physics** |
| 8 | Đóng nghĩa vụ: test gắn thẻ `[id:case]`, oracle | **parity-check** |
| 9 | Test parity/replay đỏ hoặc chơi thử thấy khác | **parity-debug** |
| 10 | Gộp module, test sau mỗi lần gộp | **integrate** |
| 11 | View đủ để chơi trọn vẹn (mục 4) và kết thúc (mục 5) | rebuild-game |

Bước 4, 6, 7 thường xen nhau theo từng cơ chế; game nhỏ thì bỏ 3 và 10 (ghi lý do không chia vào `DECISIONS.md`). Chơi thử phát hiện hành vi bản gốc chưa ai hỏi → thêm câu hỏi vào `notes/QUESTIONS.md` và nghĩa vụ mới, quay lại phân tích (skill re-notes); cổng P2 chặn câu còn "mở".

## 1. Có project chưa?
- Chưa có `game.yaml`: `gamekit init <ten-game> --title "<Tên>" --engine <engine gốc> --dir <thư mục cha>`. Mặc định là game của người dùng (`own`). Làm lại game người khác: `--third-party`, đặt tên mới, điền `release.forbiddenTerms`.
- `own` có source gốc (C#…): đọc thẳng code để lấy logic và số; vẫn viết test trước, viết lại cho hợp `core/`/`view/`, không dịch máy từng dòng.

## 2. Số liệu trước, code sau
- Mọi số gameplay vào `params/*.json`: `{ "value", "unit", "source", "confidence"?, "tolerance"? }`; bảng/nội dung vào `data/*.json` có `source` (skill port-data). Chưa biết thì `"TODO: …"` — validate chặn ở cổng P2.
- Code đọc qua `PARAMS` (`src/core/params.ts`), không gõ số trong `core/` (lint chặn).

## 3. TDD cho core/
Với mỗi nghĩa vụ trong `spec/obligations.yaml`:
1. Viết test trong `tests/core/…`: giá trị kỳ vọng lấy từ `params/` (đọc JSON thô để có `tolerance`) hoặc `spec/oracles/`, như `tests/core/world.test.ts`. Tên test gắn thẻ `[id:case]`.
2. Chạy, thấy đỏ.
3. Viết logic trong `src/core/…` cho xanh. Chỉ dùng `Rng` có seed và `dt` của bước cố định; không đồng hồ thật, không `setTimeout` (skill port-timing).
4. Refactor, `npm run lint`.

Thay `src/core/world.ts` demo bằng logic game thật; giữ `worldHash` và replay test cho luồng chơi chính (`tests/replay/`).

**RNG gốc.** `Rng` mặc định dùng mulberry32 — đủ khi chuỗi ngẫu nhiên không cần khớp bản gốc. Khi nội dung sinh từ seed (level, rơi đồ, spawn) phải giống bản gốc, truyền nguồn ngẫu nhiên của game gốc: `new Rng(new DotNetRandom(seed))` (`src/core/rng-dotnet.ts`, khớp `System.Random` của .NET) hoặc tự viết một `RandomSource` (UnityEngine.Random là Xorshift128, LCG tự viết…). Luôn kèm nghĩa vụ `rng.sequence` với oracle dump từ chính game gốc. Chú ý cách game gốc biến số ngẫu nhiên thành kết quả (`Next(min, max)` loại trừ max; `Random.Range(int)` của Unity cũng loại trừ max, bản float thì không) và **số lần gọi RNG mỗi tick**.

## 4. View
`src/view/` vẽ từ state, map input thiết bị → `Action` (`src/contracts/input.ts`). Không sửa state. Ở P2 chỉ cần đủ để chơi trọn vẹn và so với bản gốc; điều khiển cảm ứng, bố cục ngang/dọc là P3 (skill web-relayout). Không unit test; kiểm bằng `npm run dev` và ảnh chụp.

## 5. Kết thúc
`npm test`, `npm run typecheck`, `npm run lint`, `gamekit validate`, `gamekit parity`, `gamekit re` (không còn câu "mở") sạch → `gamekit gate`. Báo người dùng: nghĩa vụ đã đóng / tổng, nghĩa vụ chỉ dựa trên oracle `inferred`/`derived`, sai khác đã duyệt (`D-n`), những gì chưa kiểm chứng. Chỉ `--advance` khi họ đồng ý.
