---
name: replace-audio
description: Dùng ở P3 khi làm lại game của người khác — thay nhạc nền và hiệu ứng âm thanh gốc bằng âm thanh mới (tự làm, tạo bằng công cụ nếu phiên có, hoặc thư viện có license), nén cho web, gắn nhãn provenance, và bảo đảm mọi thông tin gameplay vẫn có tín hiệu hình ảnh khi tắt tiếng.
---

# Thay âm thanh (P3, game làm lại)

Đầu vào: danh sách âm thanh trong `notes/assets.md` (từ skill **asset-inventory**), style đã chọn (phong cách nhạc trong `style/direction.md`), mục `kind: audio` trong `asset-manifest.json`. Đầu ra: file âm thanh mới trong `assets/`, có nhãn provenance.

## 1. Danh sách
Mỗi âm thanh gốc → một âm thanh mới theo **vai trò**, không theo bản gốc: nhạc menu, nhạc chơi, nhặt đồ, trúng đòn, thua, thắng, bấm nút… Ghi vào `asset-manifest.json` (`kind: audio`, `path`, `make`, `brief`, `loop` cho nhạc nền, `duration` nếu cần; âm thanh không cần `width`/`height`).

## 2. Làm âm thanh
| Nguồn | Nhãn provenance |
| --- | --- |
| tự làm / người dùng, nhạc sĩ làm | `own` |
| công cụ tạo nhạc/hiệu ứng nếu phiên có (`brief` = phong cách, nhịp, cảm xúc) | `generated` + `--source` |
| thư viện (CC0, CC-BY, mua license) | `licensed` + `--license "<tên, link, ghi công nếu cần>"` |

Luật:
- **Không** dùng giai điệu, đoạn nhạc, giọng, hiệu ứng đặc trưng của game gốc; không đưa file gốc làm mẫu cho công cụ hay người làm. Brief mô tả bằng phong cách mới.
- License CC-BY cần ghi công: ghi vào credits của game (text qua `t()`), không chỉ trong provenance.

## 3. Nén cho web
- Nhạc nền: ogg + m4a (Safari), 96–128 kbps, cắt vòng lặp liền (loop không giật).
- Hiệu ứng: ngắn, cắt im lặng đầu/cuối; có thể gộp thành audio sprite.
- Âm lượng đều nhau (chuẩn hoá loudness); nhạc nhỏ hơn hiệu ứng.
- Chỉ nạp trước âm thanh màn đầu; nhạc dài tải sau, vừa `budget.initialLoadMB`.

## 4. Chơi được khi tắt tiếng
Mọi thông tin gameplay mà âm thanh báo (sắp có nguy hiểm, hết giờ, nhặt được đồ, trúng đòn) phải có **tín hiệu hình ảnh** tương ứng: nhấp nháy, biểu tượng, rung màn hình, đổi màu + hình. Người chơi trên portal hay tắt tiếng; cổng P3 có mục này. Đi qua danh sách ở bước 1, ghi tín hiệu hình ảnh cho từng âm thanh mang thông tin.

## 5. Kiểm
- `gamekit assets`: không còn wav/aiff/flac cần chuyển, không file âm thanh > 1,5 MB, đủ nhãn.
- `gamekit validate` (provenance), `gamekit release-check` (không còn file gốc, không tên game gốc trong tên file).
- `npm run dev`: chơi một ván có tiếng, một ván tắt tiếng (Settings → Sound off); ẩn tab thì im, quay lại thì tiếp.
