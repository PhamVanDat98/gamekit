# Viết animation mới cho dự án

## Trình tự
1. **Mô tả động tác bằng lời**, theo nhịp: chuẩn bị → hành động → theo đà → hồi. Ví dụ "con slime tấn công: co lại (chuẩn bị), phóng tới giãn dài (hành động), đập bẹp (theo đà), hồi tròn".
2. **Chọn khung xương** đủ khớp cho động tác, không hơn: slime chỉ cần một xương (`sprite`), cánh cửa một xương xoay quanh bản lề, nhện 1 thân + 8 chân hai khúc, xúc tu là chuỗi xương.
3. **Đặt tư thế chính** (key) ở các mốc thời gian: vòng lặp đi/chạy/bay thì đặt key ở 0, 0.25, 0.5, 0.75; động tác một lần thì đặt ở các nhịp của bước 1.
4. **Thêm phần phụ**: `waves` cho đuôi, tóc, áo, râu, xúc tu (chuỗi xương + `phase_step` để trễ nhịp); `ik` cho chân chạm đất.
5. `AN preview` → xem GIF → chỉnh từng key → `AN check` sạch.

## Nguyên tắc cho chuyển động có hồn
- **Chuẩn bị ngược chiều**: trước khi nhảy thì ngồi xuống; trước khi chém thì vung ra sau. Một key ngược chiều trước hành động chính.
- **Thời gian không đều**: hành động chính nhanh (ít frame), chuẩn bị và hồi chậm hơn. Dùng `"out"` sau cú đánh (nhanh rồi chậm lại), `"in"` trước khi chạm.
- **Nén – giãn** (`sx`, `sy`) giữ thể tích: giãn dài thì hẹp lại (`sy` 1.15 ↔ `sx` 0.9).
- **Trễ nhịp và theo đà**: phần mềm đi sau phần cứng — đầu cánh sau gốc cánh, đuôi sau thân (`phase` / `phase_step` dương).
- **Vòng lặp khép kín**: key cuối nối mượt về key đầu (với `loop: true` không cần lặp key 0 ở t = 1).
- **Chân bám đất**: chân chống dùng `ik` với `target` y = 0 và x lùi đều về sau trong lúc chống; chân bước nhấc theo cung (y âm ở giữa). Thân thấp nhất ngay sau khi chạm đất, cao nhất lúc đổi chân.
- **Ít frame vẫn rõ**: 4–8 frame cho vòng lặp, 4–7 cho động tác ngắn; `check` báo xương xoay > 100° giữa hai frame là dấu hiệu cần thêm frame hoặc key.
- **Đặt tại chỗ**: nhân vật không trôi theo x qua cả vòng; game di chuyển nó.

## Mẫu ý tưởng (chưa có trong thư viện, tự viết theo cách trên)
| Thứ | Khung xương | Animation |
| --- | --- | --- |
| Slime / thạch | `sprite` | hop: `sy` 0.8 → 1.15 → 0.8, `y` bật lên giữa vòng; attack: `x` lao tới với `sx` giãn |
| Cánh cửa, rương | 1 xương nắp/cánh | `rot` 0 → −100 easing `out`, nảy nhẹ −95 → −100 |
| Nhện | thân + 8 chân hai khúc, `side` xen kẽ | `ik` mỗi chân, pha lệch 0 / 0.5 theo cặp chéo |
| Tóc, khăn, áo choàng | chuỗi 3–5 xương gắn vào đầu/vai | `waves` với `phase_step` 0.1–0.2, `amp` giảm dần (`decay` < 1) |
| Cây, cỏ, cờ | chuỗi xương từ gốc | `waves` biên độ nhỏ, `cycles` 1 |
| Vũ khí đeo tay | xương con của cẳng tay (`at: 1`) | xoay theo tay, thêm `rot` riêng khi vung |
| Bay lơ lửng (ma, đom đóm) | `sprite` hoặc thân + chuỗi đuôi | `y` sin, `rot` nhẹ, `waves` cho đuôi |

Khi một animation đã đạt, chép thành mẫu cho nhân vật khác cùng khung xương; khung khác thì giữ nhịp thời gian và tỉ lệ biên độ, đổi tên xương.
