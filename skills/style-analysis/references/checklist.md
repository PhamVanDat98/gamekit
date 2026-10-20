# Checklist nhìn ảnh (điền các mục "(nhìn)" của style.md)

Nhìn **từng ảnh ở 100%** rồi nhìn **cả bộ thu nhỏ** (cái gì còn đọc được ở cỡ nhỏ là đặc trưng thật). Ghi điều thấy được, không ghi cảm tưởng chung chung ("đẹp", "dễ thương"). Mỗi ý nên đủ cụ thể để hai người vẽ ra giống nhau.

## Hình khối
- Hình cơ bản chiếm ưu thế: tròn / oval / vuông bo / tam giác / hỗn hợp (khối lớn tròn, chi tiết nhọn?).
- Tương phản kích thước: khối lớn–vừa–nhỏ theo tỉ lệ nào; có khối nào cố ý phóng đại (đầu, tay, vũ khí)?
- Đường cong vs thẳng: cạnh có bo, có góc nhọn không; đường cong căng (C, S) hay lỏng.
- Silhouette: tô đen vẫn nhận ra không; phần nào tạo nhận diện.

## Tỉ lệ nhân vật
- Đầu : thân (đếm số "đầu" trong chiều cao): 1–2 chibi, 3–4 cartoon, 6–8 thực.
- Tay chân: ống / giọt / có khớp; bàn tay mấy ngón, dạng găng hay chi tiết; bàn chân.
- Mặt: vị trí mắt (cao/thấp trên đầu), khoảng cách hai mắt, mắt chấm/oval/to có tròng và highlight; mũi có/không; miệng; má hồng.

## Nét
- Đều hay thay đổi độ dày (dày ở chỗ bóng/chỗ nặng, mỏng ở chỗ sáng); đầu nét nhọn hay tròn.
- Nét ngoài vs nét trong: nét trong mảnh hơn? cùng màu?
- Màu nét: đen, nâu, màu đậm của mảng bên cạnh (colored line)? Có chỗ bỏ nét (lost edge) không?

## Cách tô và ánh sáng
- Phẳng / cel 1 tầng bóng / cel 2 tầng / gradient mềm / vẽ tay có texture.
- Bóng: cùng hue tối đi, ngả tím/xanh (hue shift), hay xám? Cạnh bóng cứng hay mềm? Hướng sáng.
- Highlight: có không, hình gì (chấm, vệt, viền sáng rim light), màu trắng hay màu sáng của mảng.
- Texture/grain/noise, viền glow, outline sáng.

## Màu (đối chiếu số đo)
- Vai trò từng màu trong bảng: nền chính, mảng phụ, bóng, điểm nhấn, nét, da, mắt.
- Điểm nhấn: màu nào, dùng ở đâu, chiếm bao nhiêu (thường < 10%).
- Nền và nhân vật tách nhau bằng gì (độ sáng, độ bão hoà, nét).

## Mức chi tiết
- Chi tiết nhỏ nhất (px) ở cỡ hiển thị trong game; có chi tiết nào sẽ mất khi thu nhỏ không.
- Lặp lại hoa văn/họa tiết đặc trưng (nhưng không chép biểu tượng nhận diện).

## Không khí, chuyển động
- Tâm trạng: vui, nhẹ, u tối, sang trọng…; nhịp: dứt khoát hay mềm.
- Gợi ý cho skill **animate**: khối tròn mềm → squash/stretch mạnh, nhiều nảy; góc cạnh → dứt khoát; vẽ tay → `step: 12`.

---

## Số đo hay gặp theo kiểu style (để đối chiếu)
| Kiểu | Phẳng | Nét viền (% chiều cao) | Bão hoà TB | Ghi chú |
| --- | --- | --- | --- | --- |
| Chibi / casual mobile, màu phẳng | ≥ 85% | 2–4%, nâu/đen đậm | 15–35 | 5–8 màu phủ 90% |
| Cel anime / cartoon TV | 60–85% | 1–2.5%, nét trong nhiều | 20–40 | Bóng 1–2 tầng, thường cùng hue |
| Vector UI / flat design | ≥ 90% | 0 hoặc rất mảnh | 30–60 | Ít màu, độ tương phản cao |
| Vẽ tay / painterly | < 60% | thường không có | tuỳ | Bảng màu dài, nhiều màu pha |
| Pixel art | ~100% | 1 px (rất nhỏ theo %) | tuỳ | So ở kích thước gốc, không làm mượt |

## Viết prompt style cho Codex
- Luôn đính kèm 1–2 ảnh tham khảo (`codex exec --image ref.png …`) **và** khối style ở mục 8: ảnh cho cảm giác, chữ giữ số (màu hex, độ dày nét).
- Phần chủ thể mô tả vật/nhân vật **mới**, bằng hình khối và tỉ lệ của style ("round chibi frog knight, 1:1 head-to-body, mitten hands").
- Không ghi tên hoạ sĩ, hãng, game.
- Sau mỗi 3–5 ảnh, chạy `gamekit style check` trên cả thư mục: model thường trôi dần về màu rực hơn và nét mảnh hơn.
