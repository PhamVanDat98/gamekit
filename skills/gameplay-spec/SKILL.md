---
name: gameplay-spec
description: Dùng ở P1 khi ghi chú phân tích trong notes/ đã đủ và cần viết spec/gameplay-spec.md — core loop, từng cơ chế (khoá params, nghĩa vụ parity dự kiến), luồng trạng thái và màn hình, level và độ khó (bảng vào spec/oracles/), điểm, kinh tế, RNG, thắng/thua, trường hợp biên; mỗi câu trỏ về bằng chứng và độ tin cậy. Cũng dùng khi gate P1 báo thiếu gameplay spec, hoặc khi P2 phát hiện hành vi mới cần cập nhật spec.
---

# Viết gameplay spec (P1)

`spec/gameplay-spec.md` là bản mô tả **hành vi** của game gốc mà bản web phải tái hiện, đủ để dựng lại mà không cần mở game gốc. Nó tổng hợp từ `notes/` (skill **re-notes**), không phân tích lại. Template không có sẵn file này: tạo mới. Cổng P1 cần: core loop, cơ chế, level, điểm, kinh tế.

## 1. Chuẩn bị
- Đọc `notes/*.md`, `notes/QUESTIONS.md`, `params/*.json`, `spec/oracles/`, ghi chú UI (`notes/ui.md`, skill **ui-extract**) nếu đã có.
- Thiếu bằng chứng cho một phần nào đó: thêm câu vào `notes/QUESTIONS.md` (trạng thái `mở`), quay lại re-notes. Không lấp chỗ trống bằng phỏng đoán.
- `own`: được dẫn tên class/hàm trong game gốc làm vị trí. `third-party`: viết bằng lời của mình, không chép code hay chuỗi decompile vào spec; tên riêng của game gốc chỉ dùng làm nhãn nội bộ.

## 2. Quy ước bằng chứng
Mỗi câu mô tả hành vi kết thúc bằng nguồn + độ tin cậy, ví dụ: `— notes/enemy.md § Vòng đạn (EnemyRing.Fire) · observed`.
- `observed` đọc thẳng (hằng số, bảng data, source) · `derived` suy từ logic đã lần · `inferred` ước lượng từ video hoặc chơi thử (số kèm `tolerance` trong params).
- Số **không** viết trong spec: dẫn khoá params, vd `enemy.ringCount`. Thiếu khoá thì thêm vào `params/` với `source` (tạm `"TODO: …"` được tới trước cổng P2).
- Hành vi, không phải code: "đạn bay thẳng, tăng tốc `bullet.accel` mỗi giây", không phải "hàm Update cộng accel × dt".
- Câu chưa có câu trả lời: ghi `Chưa biết — Q7` (số câu trong `notes/QUESTIONS.md`), không xoá khỏi spec.

## 3. Cấu trúc file
Bỏ mục không áp dụng, đừng để trống.

| Mục | Nội dung |
| --- | --- |
| Tóm tắt | Thể loại, mục tiêu, một ván kéo dài bao lâu |
| Core loop | Một vòng chơi từ lúc vào tới lúc kết thúc ván, 3–6 bước |
| Điều khiển | Input gốc → hành động. Cách map sang web để tới P3 |
| Cơ chế | Mỗi cơ chế một mục con (xem bước 4) |
| Trạng thái và màn hình | Máy trạng thái: boot → menu → chơi → pause → thắng/thua → … ; điều kiện chuyển; trạng thái nào dừng thời gian mô phỏng. Màn hình chi tiết ở `notes/ui.md` |
| Level, tiến trình, độ khó | Cách mở khoá, tham số theo level/thời gian. Bảng nhiều điểm → `spec/oracles/<tên>.json` |
| Điểm | Công thức, combo, hệ số, làm tròn, điểm cao lưu ở đâu |
| Kinh tế | Tiền tệ, nguồn/chi, giá, phần thưởng. IAP, server, đăng nhập: ghi riêng, bản web không có thì cần `D-n` |
| RNG | Thuật toán, cách seed, mọi chỗ dùng ngẫu nhiên và thứ tự gọi (replay phụ thuộc vào đây) |
| Thời gian | Theo frame hay theo giây, bước cố định, đơn vị gốc |
| Thắng / thua | Điều kiện chính xác, thứ tự kiểm tra trong một frame |
| Trường hợp biên | Va chạm cùng frame, giá trị max/0, tràn số, chia nguyên, `dt` lớn, mất focus, save hỏng |
| Ngoài phạm vi | Thứ không port (online, IAP…) kèm `D-n` trong `DECISIONS.md`, chờ người dùng duyệt |

## 4. Mỗi cơ chế
```markdown
### Vòng đạn của boss
Bắn `enemy.ringCount` viên cách đều, mỗi `enemy.ringInterval` s, bắt đầu từ góc hướng về người chơi. — notes/enemy.md § Vòng đạn · observed
Đơn vị gốc: frame ở 30 fps, đã đổi sang giây trong params. — notes/enemy.md · derived
- Nghĩa vụ: `enemy.bullet-ring` · cases: normal, edge, oracle · oracle: `spec/oracles/bullet-ring.json`
- Biên: boss chết giữa lúc bắn → vòng đang bắn vẫn bay tiếp. — Q12 (mở)
```
- Một cơ chế = một hành vi người chơi cảm nhận được, không phải một file code.
- Id nghĩa vụ theo dạng `nhom.hanh-vi`, ổn định vì test sẽ gắn thẻ `[id:case]`. Cơ chế có trong `spec/physics-assessment.yaml` (skill **physics-assess**) dùng đúng `id` ở đó.
- Bảng theo level/thời gian (tốc độ, máu, bảng rơi đồ): tạo `spec/oracles/<tên>.json` gồm `source`, `confidence`, `tolerance` hoặc `toleranceAbs`, `cases: [{ in, out }]`, phủ cả biên. Cách làm chi tiết: skill **parity-check**.

## 5. Nối sang spec/obligations.yaml
Spec là nguồn của `spec/obligations.yaml`. Ở P2, skill **parity-check** chép mỗi dòng "Nghĩa vụ" thành một mục (`id`, `title`, `cases`, `params`, `oracle`, `source`) và thay danh sách demo của template. Viết sẵn đủ thông tin trong spec để bước đó là chép, không phải phân tích lại. Mọi khoá params và file oracle nhắc tới phải có thật: `validate` báo khi obligations trỏ tới thứ không tồn tại.

## 6. Kết thúc
1. Đối chiếu: mọi cơ chế trong `notes/` có trong spec; mọi khoá params dẫn trong spec có trong `params/`; mọi câu "Chưa biết" có số Q trong `notes/QUESTIONS.md` kèm lý do và ảnh hưởng tới bản port. Người chưa chơi game gốc đọc core loop và cơ chế có hình dung được một ván không?
2. `gamekit validate` sạch lỗi, rồi `gamekit gate`. Mục "Có `spec/gameplay-spec.md`" của cổng chỉ tick khi spec xong theo các luật trên.
3. Báo người dùng: số cơ chế, số oracle, số câu còn mở và ảnh hưởng, phần nào chỉ dựa trên `inferred`. Không tick mục `(bạn)`.
4. Tiếp: **asset-inventory**, **ui-extract**, **physics-assess** nếu chưa làm.

## 7. Khi spec đổi ở P2
Dựng lại mà phát hiện hành vi mới hoặc sai: sửa `notes/` trước (bằng chứng), rồi spec, rồi nghĩa vụ và test. Không sửa spec cho khớp code.
