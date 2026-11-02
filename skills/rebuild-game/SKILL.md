---
name: rebuild-game
description: Dùng ở pha P2 khi dựng lại một game bằng JS/TS từ spec và params đã trích ở P1 — tạo project từ template GameKit, thay logic demo bằng logic game gốc theo TDD, giữ core/ deterministic, chơi được trọn vẹn (asset gốc nếu là game của người dùng, placeholder nếu làm lại game người khác).
---

# Dựng lại game (P2)

Mục tiêu cổng P2: chơi được trọn vẹn (`own`: với asset gốc nhãn `own`; `third-party`: với placeholder), test parity xanh, không còn source TODO.

## 1. Có project chưa?
- Chưa có `game.yaml`: `gamekit init <ten-game> --title "<Tên>" --engine <engine gốc> --dir <thư mục cha>`. Mặc định là game của người dùng (`own`): giữ tên gốc được. Làm lại game người khác: thêm `--third-party`, đặt tên mới và điền `release.forbiddenTerms` bằng tên/thương hiệu game gốc.
- `own` có source gốc (C#…): đọc thẳng code để lấy logic và số; vẫn viết test trước, viết lại cho hợp `core/`/`view/`, không dịch máy từng dòng.
- Đã có (đi từ P0/P1): kiểm tra `gamekit status` báo P2.

## 2. Chọn runtime (thay cho skill runtime-select chưa có)
- 2D đơn giản, ít sprite: canvas thuần (template sẵn). Nhiều sprite, hiệu ứng: Pixi. Cần scene có sẵn: Phaser. 3D: Three.js.
- Vật lý: dùng đúng thư viện đã chốt trong `spec/physics-assessment.yaml` (skill **physics-assess**), không tự chọn lại. Cơ chế `exact` viết công thức trong `core/`, kể cả khi game có thư viện vật lý: ưu tiên **tái hiện đúng công thức gốc** hơn thay bằng engine vật lý khác. Không dùng vật lý tích hợp của Phaser cho `core/`.
- Ghi lựa chọn + lý do vào `DECISIONS.md` và `runtime` trong game.yaml. Thư viện render chỉ được dùng trong `view/`.
- Thư viện vật lý nằm trong `core/`, sau một lớp bọc mỏng giữ đúng thứ tự `FixedUpdate → physics step → callback` của game gốc. Bước mô phỏng chỉ lấy từ fixed step; `worldHash` phải gồm trạng thái các vật thể. Thư viện wasm cần khởi tạo bất đồng bộ trước `createWorld`, cả trong test.

## 3. Số liệu trước, code sau
- Mọi số gameplay vào `params/*.json`: `{ "value", "unit", "source", "confidence"?, "tolerance"? }`. `source` trỏ tới chỗ trong game gốc; `confidence` là `observed | derived | inferred` (`inferred` phải có `tolerance`). Chưa biết thì `"TODO: …"` — validate sẽ chặn ở cổng P2.
- Thay `spec/obligations.yaml` demo bằng nghĩa vụ của game gốc (skill **parity-check**) trước khi viết core: danh sách này là thứ cổng P2 chấm.
- Code đọc qua `PARAMS` (`src/core/params.ts`), không gõ số trong `core/` (lint chặn).

## 4. TDD cho core/
Với mỗi cơ chế trong spec:
1. Viết test parity trong `tests/core/…`: giá trị kỳ vọng lấy từ `params/` (đọc file JSON thô để có `tolerance`) hoặc `spec/oracles/`, như `tests/core/world.test.ts`. Tên test gắn thẻ `[id:case]` của nghĩa vụ nó đóng.
2. Chạy, thấy đỏ.
3. Viết logic trong `src/core/…` cho xanh. Chỉ dùng `Rng` có seed và `dt` của fixed step.
4. Refactor, `npm run lint`.

Thêm replay test cho luồng chơi chính (`tests/replay/`). Thay `src/core/world.ts` demo bằng logic game thật; giữ `worldHash` cho replay.

Khi dịch code Unity vào `core/`:
- Input: `Input.GetKeyDown`/`GetKeyUp` ↔ `input.pressed`/`input.released`; `GetKey` ↔ `input.actions`.
- `Update` vs `FixedUpdate`: template chỉ có một nhịp cố định (`stepWorld`) để replay tất định. Logic `FixedUpdate` đưa thẳng vào. Logic `Update` dùng `Time.deltaTime` đưa vào `stepWorld` với dt cố định. Logic đếm theo frame trong `Update` (không có deltaTime) phụ thuộc fps của game gốc: chọn một fps tham chiếu từ game gốc, đổi sang giây, ghi thành một `D-n` trong DECISIONS.md. Không thêm đường bước biến thiên vào `core/`.
- `core/` dùng `roundToInt`, `sign` từ `core/mathf` (lint cấm `Math.round`/`Math.sign`); phép chia nguyên `int` của C# phải viết rõ `Math.trunc`.

## 5. View
`src/view/` vẽ từ state, map input thiết bị → `Action` (`src/contracts/input.ts`). Không sửa state. Không unit test; kiểm tra bằng chạy thử `npm run dev` và screenshot.

## 6. Game lớn → chia module
Nếu game có nhiều cơ chế độc lập, dùng skill **module-plan** trước khi viết core, rồi **integrate**. Game nhỏ thì làm tuần tự, ghi lý do không chia vào DECISIONS.md.

## 7. Kết thúc
`npm test`, `npm run typecheck`, `npm run lint`, `gamekit validate`, `gamekit parity` sạch → `gamekit gate`. Báo người dùng; chỉ `--advance` khi họ đồng ý.
