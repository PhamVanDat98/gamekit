---
name: parity-check
description: Dùng ở cuối P1 để lập spec/obligations.yaml từ ghi chú RE (mỗi cơ chế một nghĩa vụ, có nguồn), và ở P2 khi cần chứng minh bản web tái hiện đúng game gốc — dựng bảng oracle trong spec/oracles, gắn thẻ [id:case] vào test, chạy gamekit parity cho tới khi mọi nghĩa vụ bắt buộc đóng. Cũng dùng khi gate P2 báo mục Parity đỏ.
---

# Parity với game gốc (lập ở P1, đóng ở P2)

Parity không phải cảm giác "chơi thấy giống". Nó là danh sách nghĩa vụ trong `spec/obligations.yaml`, mỗi nghĩa vụ chỉ được đóng bằng test xanh. `gamekit parity` chấm theo kiểu **fail-closed**: test đỏ, test `skip`/`todo`, thiếu case, thẻ trỏ tới nghĩa vụ không tồn tại đều tính là **chưa đạt**. Không có trạng thái "chắc là đúng".

## 1. Lập danh sách nghĩa vụ (cuối P1)
Nghĩa vụ là **đầu ra của RE**: lập ở cuối P1, trước khi viết code, để biết phạm vi thật của việc dựng lại (và đánh giá khả thi lại nếu lớn hơn dự kiến). Cổng P1 chặn khi nghĩa vụ chưa trỏ tới ghi chú RE có thật (`source`). Ở P2 chỉ thêm nghĩa vụ khi phát hiện cơ chế mới — kèm câu hỏi mới trong `notes/QUESTIONS.md`.

Đọc `spec/gameplay-spec.md`, `notes/`, `params/`, `spec/inventory.yaml`. Mỗi hành vi người chơi cảm nhận được = một nghĩa vụ; thêm id của nó vào `covers` của cơ chế tương ứng trong danh mục:

```yaml
- id: enemy.bullet-ring          # ổn định, dùng trong thẻ test
  title: Vòng đạn 16 viên, góc lệch 22.5°, bắn mỗi 0.5 s
  cases: [normal, edge, oracle]  # loại case bắt buộc phải có test
  params: [enemy.ringCount, enemy.ringInterval]
  oracle: spec/oracles/bullet-ring.json
  source: notes/enemy.md
```

- Chia theo hành vi, không theo file code. Một nghĩa vụ nên kiểm chứng được bằng vài test.
- `cases`: `normal` (giá trị điển hình) · `edge` (biên: tường, máu 0, max level, dt lớn) · `invalid` (input sai, save hỏng) · `oracle` (bảng từ game gốc) · `replay` (luồng chơi ghi lại).
- `required: false` cho thứ có thì tốt (hiệu ứng phụ). Mặc định là bắt buộc.
- `fidelity` — mức khớp bản gốc cần có (mặc định `exact`):
  - `exact`: khớp tuyệt đối — luật, điểm, hẹn giờ, RNG, dữ liệu;
  - `close`: khớp gần — `validate` đòi `tolerance` trong params liên quan hoặc oracle;
  - `outcome`: chỉ kiểm kết quả/khoảng qua nhiều seed (va chạm rigidbody 3D) — phải có case `outcome`;
  - `feel`: không có test số, người chơi so cạnh bản gốc — cần `decision: D-n` + `approved: true` (chỉ người dùng đặt), `cases` không bắt buộc.
  Đừng hạ mức để cho xanh: `close`/`outcome`/`feel` chỉ khi khớp chặt hơn thật sự không làm được (skill port-physics §5) — ghi lý do trong ghi chú.
- Không làm được hoặc không làm: `status: blocked | out-of-scope`, kèm `decision: D-n` trong `DECISIONS.md`. Chỉ người dùng đặt `approved: true`. Nghĩa vụ bỏ qua được ghi lại, **không bao giờ tính là đã đóng**.

`gamekit validate` kiểm tra schema, id trùng, `params` có tồn tại, file oracle có thật.

## 2. Bảng oracle: nhiều điểm so sánh hơn vài số lẻ
Công thức có nhiều nhánh (sát thương theo level, đường bay, đường cong tốc độ, bảng rơi đồ) thì đừng chỉ so 1–2 giá trị. Lập bảng `spec/oracles/<tên>.json` gồm `source`, `confidence`, `tolerance` và `cases: [{ in, out }]`, phủ cả lưới đầu vào và các biên. Test dùng `it.each(oracle.cases)` (xem `tests/core/world.test.ts` trong template).

Lấy `out` từ đâu (ghi vào `confidence`):
- `observed`: bảng data của game gốc, hằng số đọc thẳng trong binary/asset.
- `derived`: tính theo logic đã lần ra trong `notes/`. Cẩn thận: nếu chính bạn suy ra công thức rồi dùng nó sinh oracle, test chỉ chứng minh code khớp với cách bạn hiểu. Phải ghi rõ điều đó.
- `inferred`: đo từ video hoặc chơi thử. Bắt buộc có `tolerance`.

Chạy code của game gốc để sinh oracle (harness, emulator, Unity Editor): với game của người dùng (`own`) cứ làm, đây là cách có oracle `observed` tốt nhất — công thức theo engine trong [references/oracle-harness.md](references/oracle-harness.md). Với `third-party` đó là chạy binary của người khác: chỉ làm khi người dùng đồng ý, và ghi lại thành `D-n`.

## 3. Gắn thẻ test
Tên test chứa `[id:case]`, viết ở `it` hoặc `describe`:

```ts
it('[enemy.bullet-ring:normal] bắn 16 viên mỗi 0.5 s', …)
it.each(ring.cases)('[enemy.bullet-ring:oracle] lv=$in.level', …)
```

Giá trị kỳ vọng lấy từ `params/` hoặc oracle, **không** gõ lại số trong test. Một nghĩa vụ chỉ đóng khi mọi case trong `cases` có ít nhất một test xanh, và không test nào gắn thẻ đó bị đỏ hay bị skip.

## 4. Chạy và đọc kết quả
`gamekit parity` chạy vitest và chấm. Gate P2 có mục `{auto: parity}`.

| Trạng thái | Nghĩa | Làm gì |
| --- | --- | --- |
| closed | đủ case, mọi test xanh | xong |
| open | thiếu case | viết test cho case còn thiếu |
| failed | có test đỏ | sửa `core/` (không sửa số kỳ vọng cho khớp) |
| unknown | có test skip/todo | chạy thật hoặc bỏ test đó |
| waived | blocked/out-of-scope theo D-n | chờ người dùng duyệt |
| accepted | `fidelity: feel`, người dùng đã duyệt D-n | xong — báo riêng là khớp cảm giác |

Cuối báo cáo, `gamekit parity` in số nghĩa vụ theo mức khớp (tuyệt đối · gần · kết quả · cảm giác).

## 5. Test xanh có thật sự bắt lỗi không?
Test xanh có thể chỉ đang so một giá trị với chính nó. Với mỗi nghĩa vụ quan trọng, phá thử một lần: đổi một giá trị trong `params/` hoặc một dòng oracle, chạy `gamekit parity`, phải thấy nghĩa vụ đó đỏ. Xong thì hoàn tác. Nếu vẫn xanh, test chưa chạm tới hành vi thật: viết lại test.

## 6. Báo cáo
Báo người dùng: số nghĩa vụ bắt buộc đã đóng / tổng, chia theo `fidelity`, các nghĩa vụ bỏ qua kèm D-n, các nghĩa vụ chỉ dựa trên `inferred` hoặc `derived`, và những gì **chưa** kiểm chứng. Chỉ báo những lệnh đã thật sự chạy.
