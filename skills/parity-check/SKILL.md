---
name: parity-check
description: Dùng ở P2 khi cần chứng minh bản web tái hiện đúng game gốc — lập spec/obligations.yaml (mỗi cơ chế một nghĩa vụ), dựng bảng oracle trong spec/oracles, gắn thẻ [id:case] vào test, chạy gamekit parity cho tới khi mọi nghĩa vụ bắt buộc đóng. Cũng dùng khi gate P2 báo mục Parity đỏ.
---

# Parity với game gốc (P2)

Parity không phải cảm giác "chơi thấy giống". Nó là danh sách nghĩa vụ trong `spec/obligations.yaml`, mỗi nghĩa vụ chỉ được đóng bằng test xanh. `gamekit parity` chấm theo kiểu **fail-closed**: test đỏ, test `skip`/`todo`, thiếu case, thẻ trỏ tới nghĩa vụ không tồn tại đều tính là **chưa đạt**. Không có trạng thái "chắc là đúng".

## 1. Lập danh sách nghĩa vụ
Đọc `spec/gameplay-spec.md`, `notes/`, `params/`. Mỗi hành vi người chơi cảm nhận được = một nghĩa vụ:

```yaml
- id: enemy.bullet-ring          # ổn định, dùng trong thẻ test
  title: Vòng đạn 16 viên, góc lệch 22.5°, bắn mỗi 0.5 s
  cases: [normal, edge, oracle]  # loại case bắt buộc phải có test
  params: [enemy.ringCount, enemy.ringInterval]
  oracle: spec/oracles/bullet-ring.json
  source: notes/enemy.md
```

- Chia mảng song song: mỗi mảng ghi nghĩa vụ vào `spec/obligations/<mảng>.yaml`, id bắt đầu bằng `<mảng>.`; `validate` và `parity` gộp mọi file.
- Chia theo hành vi, không theo file code. Một nghĩa vụ nên kiểm chứng được bằng vài test.
- `cases`: `normal` (giá trị điển hình) · `edge` (biên: tường, máu 0, max level, dt lớn) · `invalid` (input sai, save hỏng) · `oracle` (bảng từ game gốc) · `replay` (luồng chơi ghi lại).
- `required: false` cho thứ có thì tốt (hiệu ứng phụ). Mặc định là bắt buộc.
- Không làm được hoặc không làm: `status: blocked | out-of-scope`, kèm `decision: D-n` trong `DECISIONS.md` (hoặc `D-<mảng>-n` trong `notes/<mảng>/decisions.md`). Chỉ người dùng đặt `approved: true`. Nghĩa vụ bỏ qua được ghi lại, **không bao giờ tính là đã đóng**.

`gamekit validate` kiểm tra schema, id trùng, `params` có tồn tại, file oracle có thật.

## 2. Bảng oracle: nhiều điểm so sánh hơn vài số lẻ
Công thức có nhiều nhánh (sát thương theo level, đường bay, đường cong tốc độ, bảng rơi đồ) thì đừng chỉ so 1–2 giá trị. Lập bảng `spec/oracles/<tên>.json` gồm `source`, `confidence`, `tolerance` và `cases: [{ in, out }]`, phủ cả lưới đầu vào và các biên. Test dùng `it.each(oracle.cases)` (xem `tests/core/world.test.ts` trong template).

Lấy `out` từ đâu (ghi vào `confidence`):
- `observed`: bảng data của game gốc, hằng số đọc thẳng trong binary/asset.
- `derived`: tính theo logic đã lần ra trong `notes/`. Cẩn thận: nếu chính bạn suy ra công thức rồi dùng nó sinh oracle, test chỉ chứng minh code khớp với cách bạn hiểu. Phải ghi rõ điều đó.
- `inferred`: đo từ video hoặc chơi thử. Bắt buộc có `tolerance`.

Chạy code của game gốc để sinh oracle (harness, emulator, Unity Editor): với game của người dùng (`own`) cứ làm, đây là cách có oracle `observed` tốt nhất. Với `third-party` đó là chạy binary của người khác: chỉ làm khi người dùng đồng ý, và ghi lại thành `D-n`.

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

## 5. Test xanh có thật sự bắt lỗi không?
Test xanh có thể chỉ đang so một giá trị với chính nó. Với mỗi nghĩa vụ quan trọng, phá thử một lần: đổi một giá trị trong `params/` hoặc một dòng oracle, chạy `gamekit parity`, phải thấy nghĩa vụ đó đỏ. Xong thì hoàn tác. Nếu vẫn xanh, test chưa chạm tới hành vi thật: viết lại test.

## 6. Báo cáo
Báo người dùng: số nghĩa vụ bắt buộc đã đóng / tổng, các nghĩa vụ bỏ qua kèm D-n, các nghĩa vụ chỉ dựa trên `inferred` hoặc `derived`, và những gì **chưa** kiểm chứng. Chỉ báo những lệnh đã thật sự chạy.
