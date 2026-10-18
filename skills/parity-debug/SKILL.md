---
name: parity-debug
description: Dùng ở P2 khi bản web lệch bản gốc — test parity hay replay đỏ, oracle không khớp, hoặc chơi thử thấy khác — để tìm tick đầu tiên lệch bằng trace (tests/support/trace.ts), phân loại nguyên nhân (đơn vị, bước thời gian, thứ tự cập nhật, float32, làm tròn, RNG), sửa ở core/ chứ không sửa số kỳ vọng, và thêm test chống tái diễn. Dùng cả khi gamekit parity báo failed mà không rõ vì sao.
---

# Tìm chỗ lệch bản gốc (P2)

Đừng chỉnh số cho tới khi test xanh. Một số kỳ vọng bị sửa cho khớp là một nghĩa vụ giả. Tìm **tick đầu tiên** bản web khác bản gốc rồi sửa nguyên nhân.

## 1. Thu nhỏ
- Chọn nghĩa vụ/case đỏ nhỏ nhất (`gamekit parity` liệt kê). Nhiều nghĩa vụ cùng đỏ: bắt đầu từ nghĩa vụ cơ bản nhất (di chuyển trước va chạm, va chạm trước điểm).
- Cố định mọi thứ: seed, input ghi sẵn, `dt` = `1 / fixedStepHz`. Tắt cơ chế không liên quan trong test (như template làm: dời người chơi, tắt spawn).

## 2. Hai trace cùng đầu vào
- **Trace tham chiếu**: từ bản gốc (oracle quỹ đạo — [oracle-harness](../parity-check/references/oracle-harness.md)), hoặc bảng oracle có sẵn, hoặc từ commit cũ đã đúng.
- **Trace bản web**: `recordTrace` trong `tests/support/trace.ts`:
```ts
import { firstDivergence, recordTrace } from '../support/trace';
import ref from '../../spec/oracles/jump-trace.json'; // cases: [{ in: { tick }, out: { y, vy } }]

const expected = ref.cases.map((c) => ({ tick: c.in.tick, ...c.out }));
const w = createWorld(PARAMS, 1);
const actual = recordTrace(w, 120, (s, t) => void stepWorld(s, PARAMS, inputAt(rec, t), DT), (s) => ({ y: s.player.y, vy: s.player.vy }));
const d = firstDivergence(expected, actual, ref.tolerance ?? 0);
expect(d).toBeNull(); // khi đỏ: d.tick, d.keys, d.expected, d.actual cho biết lệch ở đâu
```
- Chỉ lấy vài trường liên quan; thêm trường trung gian (vận tốc, timer, số lần gọi RNG) khi cần thu hẹp.

## 3. Đọc kiểu lệch
| Dấu hiệu | Thường do |
| --- | --- |
| Lệch ngay tick 0 | trạng thái đầu, params sai, đơn vị (px ↔ unit, trục y), điểm neo (giữa hay góc) |
| Lệch theo tỉ lệ cố định (×2, ×1.25, ×60) | frame ↔ giây, 50 Hz ↔ 60 Hz, Pixels Per Unit, độ ↔ radian |
| Lệch tăng dần đều | `dt` hoặc tần số bước khác, Euler hiện vs nửa ẩn, drag áp dụng khác thứ tự |
| Khớp rồi nhảy hẳn ở một tick | thứ tự cập nhật, so sánh `<` vs `<=`, lệch một tick khi hẹn giờ, va chạm xét theo thứ tự khác |
| Lệch rất nhỏ nhưng lớn dần | float32 vs float64 (`Math.fround`), làm tròn (Unity `Mathf.Round` làm tròn về số chẵn; C# ép kiểu int cắt về 0, `Math.floor` thì không), chia nguyên |
| Vị trí sinh/kết quả ngẫu nhiên khác | thuật toán RNG, cách seed, **số lần gọi RNG mỗi tick** (thêm/bớt một lần gọi làm lệch mọi thứ sau đó), thứ tự gọi |
| Chỉ lệch ở web, test xanh | view nội suy sai hoặc input map sai — không phải core |

Không rõ: chia đôi khoảng tick (so trace thưa → dày quanh chỗ lệch), hoặc tắt từng phần của `stepWorld` cho tới khi khớp.

## 4. Sửa và chặn tái diễn
- Sửa trong `src/core/` (hoặc script chuyển dữ liệu — skill port-data). **Không** sửa `out` của oracle hay số kỳ vọng, trừ khi chứng minh được oracle sai — khi đó sửa nguồn oracle và ghi lại trong `notes/`.
- Thêm case `edge` tái hiện đúng tick đã lệch, gắn thẻ nghĩa vụ.
- Ghi nguyên nhân vào ghi chú RE của cơ chế (cái bẫy này hay lặp lại ở cơ chế khác).
- Không thể khớp tuyệt đối (khác engine vật lý, float): đặt `tolerance` có lý do, hoặc `deviation` + `D-n`, người dùng duyệt.
- Chạy lại `npm test`, `gamekit parity`; phá thử như mục 5 của parity-check để chắc test giờ thật sự bắt lỗi.
