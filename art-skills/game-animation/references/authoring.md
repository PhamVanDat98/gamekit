# Viết animation mới cho dự án

Phần nhịp, chẩn đoán và cách duyệt dựa trên [Spine-SKILL](https://github.com/zxzAndyMAC/Spine-SKILL) (MIT), chuyển sang khung xương + keyframe của skill này.

## Trình tự
1. **Brief một câu** cho động tác, theo nhịp: chuẩn bị → hành động → theo đà → hồi. Nói rõ lực từ đâu và tư thế nào phải đọc được. Ví dụ: "con slime tấn công: co lại (chuẩn bị), phóng tới giãn dài (hành động), đập bẹp (theo đà), hồi tròn".
2. **Có mocap thì dùng mocap** (người đi, chạy, nhảy, ngã, múa…): xem [Mocap](#mocap). Còn lại viết keyframe theo các bước sau.
3. **Chọn khung xương** đủ khớp cho động tác, không hơn: slime chỉ cần một xương (`sprite`), cánh cửa một xương xoay quanh bản lề, nhện 1 thân + 8 chân hai khúc, xúc tu là chuỗi xương.
4. **Đặt tư thế chính** (key) trước, rồi mới chia thời gian chuyển: vòng lặp đi/chạy/bay đặt key ở 0, 0.25, 0.5, 0.75; động tác một lần đặt ở các nhịp của bước 1. Số key do động tác quyết định, không rải đều cho đủ.
5. **Thêm phần phụ**: `waves` cho đuôi, tóc, áo, râu, xúc tu (chuỗi xương + `phase_step` để trễ nhịp); `ik` cho chân chạm đất.
6. **Duyệt** theo [Cách duyệt](#cách-duyệt).

## Nhịp theo loại động tác
| Động tác | Phải có trước | Thay thế giả (trông mượt mà vẫn sai) |
| --- | --- | --- |
| Tấn công, ném, phép | Hướng lấy đà, tích lực, nhịp ra đòn **nhanh**, giữ vài frame ở điểm chạm, giật lùi, hồi | Cùng easing suốt, không khựng ở điểm chạm, vũ khí lơ lửng |
| Trúng đòn, chết | Lực từ đâu, lan theo thứ tự (thân trước, đầu và tay sau), mất điểm tựa, tư thế cuối | Mọi bộ phận lắc cùng pha; tư thế chết bật về tư thế đầu |
| Nhảy, tiếp đất | Nén xuống lấy đà, bật, đường bay, hấp thụ khi chạm đất (khuỵu gối), đứng lại | Một sóng sin dọc; thân duỗi không liên quan đến đường bay |
| Đứng chờ, biểu cảm | Thở, nhịp nghỉ, ánh nhìn; ít chỗ cử động | Mọi thứ cùng lắc đều; chớp mắt như máy đếm nhịp |
| Đi, chạy (người, thú) | Điểm tựa, đẩy, bay, hồi; trọng tâm; dáng đi có tham chiếu (mocap, video) | Tay chân đung đưa độc lập; gối gập ngược; chân quạt đều tốc |
| Máy móc, cửa, rương | Trục xoay, phần cứng không co giãn, chặn ở giới hạn | Kéo giãn phần cứng; bánh răng không khớp |
| Đuôi, xúc tu, vải, tóc | Đầu dẫn, sóng lan dọc chuỗi, quán tính và tắt dần | Mọi đoạn cùng pha; trễ cộng dồn làm gãy hình |

## Nguyên tắc cho chuyển động có hồn
- **Chuẩn bị ngược chiều**: trước khi nhảy thì ngồi xuống; trước khi chém thì vung ra sau. Một key ngược chiều trước hành động chính.
- **Thời gian không đều**: hành động chính nhanh (ít frame), chuẩn bị và hồi chậm hơn; khựng (hold) ở tư thế mạnh. Dùng `"out"` sau cú đánh (nhanh rồi chậm lại), `"in"` trước khi chạm. Sóng mượt đều suốt là dấu hiệu "cứng như rối".
- **Phối hợp khớp, không chỉ biên độ**: hông dẫn, vai theo sau; tay đánh ngược chân cùng bên; gối gập khi đỡ trọng lượng. Tăng biên độ không chữa được chuyển động cứng — sửa nhịp và thứ tự khớp trước.
- **Cung tròn**: đầu tay, đầu chân, vũ khí đi theo cung, không theo đường thẳng giữa hai key.
- **Nén – giãn** (`sx`, `sy`) giữ thể tích: giãn dài thì hẹp lại (`sy` 1.15 ↔ `sx` 0.9). Phần cứng (giáp, vũ khí) không co giãn.
- **Trễ nhịp và theo đà**: phần mềm đi sau phần cứng — đầu cánh sau gốc cánh, đuôi sau thân (`phase` / `phase_step` dương).
- **Vòng lặp khép kín**: key cuối nối mượt về key đầu (với `loop: true` không cần lặp key 0 ở t = 1).
- **Chân bám đất**: chân chống dùng `ik` với `target` y = 0 và x lùi đều về sau trong lúc chống; chân bước nhấc theo cung (y âm ở giữa). Thân thấp nhất ngay sau khi chạm đất, cao nhất lúc đổi chân.
- **Ít frame vẫn rõ**: 4–8 frame cho vòng lặp, 4–7 cho động tác ngắn; `check` báo xương xoay > 100° giữa hai frame là dấu hiệu cần thêm frame hoặc key.
- **Đặt tại chỗ**: nhân vật không trôi theo x qua cả vòng; game di chuyển nó. Chân trượt hay không chỉ biết khi ghép vào game với tốc độ di chuyển thật.

## Bệnh → kiểm gì → sửa gì
| Bệnh | Kiểm trước | Sửa trước |
| --- | --- | --- |
| Cứng, như rối | GIF ở tốc độ thật; các khớp có cùng lúc đổi hướng không | Nhịp chính, thứ tự khớp (hông → vai → tay), cung, theo đà; người: thay bằng mocap |
| Trôi, lơ lửng, không có lực | Có key chuẩn bị, có khựng ở điểm chạm không; easing | Thêm key ngược chiều; rút ngắn nhịp ra đòn; `out` sau va chạm |
| Chân trượt | Chân chống có lùi đều với y = 0 không; tốc độ game có khớp bước chân | IK cho chân chống; chỉnh tốc độ di chuyển trong game theo độ dài bước |
| Gối/khuỷu gập ngược | `knee` của IK; tư thế nghỉ | `"knee": "forward"`/`"back"`; đích IK trong tầm với |
| Giật, xoay vọt một frame | `check`; góc nhảy qua ±180° | Thêm key giữa; tăng `frames`; đặt góc liên tục (−190 thay vì 170) |
| Khớp tròn như bóng, tay chân ngắn (rig) | Ảnh bộ phận so với nhân vật gốc, phần bị thân che | Vẽ lại bộ phận đủ dài, đầu khớp tròn và chồng lên nhau; dùng `pose` cho Codex vẽ từng frame khi chất liệu cần biến dạng liền mạch |
| Hở khớp, rách ở tư thế cực | Tư thế xa nhất trong dải PNG | Bộ phận chồng nhiều hơn; giảm góc cực; sửa `pivot` |
| Số liệu ổn mà mắt thấy sai | Xem lại GIF đúng chỗ người dùng phàn nàn | Tìm lại nguyên nhân hình ảnh; `check` chỉ loại được lỗi nó đo |

Sửa từng chỗ, giữ nguyên phần đã duyệt; lưu bản cũ để so trước/sau.

## Cách duyệt
1. `AN preview <anim> --out x.gif` — xem ở **tốc độ thật**, ít nhất **3 vòng** (lỗi nối vòng chỉ lộ khi lặp).
2. `AN preview <anim> --out x.png` — dải từng frame: soi tư thế mạnh, đường đi của đầu tay/chân (cung hay thẳng), chân chống có nằm trên đất.
3. `AN check <anim>` sạch.
4. Sau khi ra asset (`rig`/`tween`/frame Codex vẽ): xem lại ở cỡ thật trong game và trên nền game; một frame đẹp chưa đủ.

## Mocap
`AN mocap <file.bvh> --out <anim.json>` chuyển motion capture (BVH) thành animation cho khung humanoid nhìn ngang: thân, đầu, tay là key góc; chân là đích IK nên bàn chân đặt đúng chỗ diễn viên đặt, khớp chiều dài chân của khung (`--skeleton`, tính từ thư mục `--out`; khung thư viện được chép sang nếu chưa có).
- `--cycle`: tự tìm đoạn lặp khớp nhất (bỏ qua đoạn đứng yên), bắt đầu lúc chân trước chạm đất. `--start/--end` giới hạn vùng tìm.
- `--once --start A --end B`: động tác một lần (nhảy, ngã, vung kiếm). Xem frame bằng cách chạy thử rồi `preview`, hoặc đọc vị trí hông trong file.
- `--frames` số frame ra, `--keys` số key lấy mẫu (mặc định 24; động tác nhanh tăng lên 40–48). `check` báo giật → tăng `--frames`.
- Mặc định tại chỗ (vòng lặp bỏ phần trôi đều; động tác một lần giữ hông ở x = 0); `--keep-travel` giữ quãng đường. Nhân vật quay ngược → `--flip`.
- Nhìn ngang nên động tác ở mặt phẳng trước mặt (dang tay sang hai bên, nhảy dang tay chân) mất đi; chọn clip có chuyển động theo hướng đi.
- Kết quả là file `.anim.json` bình thường: sửa key tiếp được (phóng đại tư thế, thêm khựng) cho hợp style game.

Nguồn BVH:
| Nguồn | Giấy phép | Ghi chú |
| --- | --- | --- |
| [CMU Graphics Lab](http://mocap.cs.cmu.edu) — bản BVH: [cgspeed](https://github.com/Shriinivas/cmubvh) | Dùng tự do cả thương mại (không bán lại dữ liệu thô) | ~2500 clip: đi, chạy, nhảy, leo, đánh, múa, thể thao; frame 0 là T-pose → `--start 1` |
| [Animated Drawings](https://github.com/facebookresearch/AnimatedDrawings) `examples/bvh` | MIT | zombie, jumping, wave_hello, dab, jumping_jacks |
| [Bandai Namco Research Motion Dataset](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset) | CC BY-NC 4.0 — **không thương mại** | Đi/chạy theo cảm xúc, động tác kiểu game; chỉ để thử |
| [100STYLE](https://www.ianxmason.com/100style/) | CC BY 4.0 (ghi công) | 100 kiểu đi (khom, rón rén, robot…) |
| [SFU Motion Capture](https://mocap.cs.sfu.ca) | Chỉ nghiên cứu | Không dùng cho game phát hành |

Ghi nguồn từng clip vào `art/anim/SOURCES.md` (mẫu: `library/humanoid/SOURCES.md`).

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
