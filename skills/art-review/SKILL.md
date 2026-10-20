---
name: art-review
description: Dùng khi phân tích art gốc của game (P1) hoặc làm/duyệt một bộ art mới (P3) — mỗi asset dùng kỹ thuật gì (tile lặp, 9-slice/3-slice, nền cuộn parallax, sprite sheet, pixel art) và có đúng chuẩn kích thước không; rồi đánh giá TỔNG QUAN cả bộ đặt cạnh nhau có liền mạch không (độ nét, nét viền trên màn hình, màu, ánh sáng, mép, mối nối tile, nền lấn vật chơi) bằng `gamekit assets analyze|check|review` và ảnh tổng quan art/review/overview.png.
---

# Phân tích art và đánh giá tổng quan

Một bộ art "liền mạch" khi đặt mọi thứ cạnh nhau trên màn hình, không có gì trông như dán từ game khác. Phần lớn chỗ lệch là **kỹ thuật**, không phải thẩm mỹ: một ảnh bị phóng to nên mờ giữa các ảnh nét; nét viền 10 px cạnh nét 3 px; tile đặt cạnh nhau lộ ranh giới; khung UI kéo dài méo góc; pixel art lẫn art mượt. Skill này bắt những thứ đó bằng số đo, rồi đưa ra một ảnh tổng quan để người và AI nhìn phần còn lại.

Kỹ thuật làm art dùng được (tile, kéo giãn, chuẩn kích thước, atlas, pixel art, định dạng): [techniques.md](references/techniques.md).

## Khi nào dùng
- **P1, art gốc** (`own`): hiểu game gốc dùng art thế nào để đưa sang web đúng cách — panel nào là 9-slice và viền bao nhiêu px, nền nào cuộn, sheet mấy khung — và ghi vào `asset-manifest.json`.
- **P1, art gốc** (`third-party`): bảng kê kỹ thuật + số đo là spec cho bộ art mới. Art mới phải **cùng kỹ thuật và cùng số đo** (cỡ tile, tỉ lệ viền 9-slice, số khung, pivot) thì code và bố cục không phải đổi.
- **P3 và trước phát hành**: bộ art mới (hoặc art gốc + UI/icon mới làm cho web) có liền mạch không.

## Các bước
1. **Gom PNG** của bộ cần xem (art gốc đã xuất, hoặc art mới). JPG/WebP đổi sang PNG trước.
2. **Kỹ thuật từng asset**: `npm run gk -- assets analyze <thư mục> --manifest`.
   - Mỗi ảnh được nhận ra: tile lặp hai chiều, lặp ngang (nền cuộn), 9-slice/3-slice kèm viền, sprite sheet kèm số khung, pixel art phóng to, sprite cỡ cố định.
   - Lệnh báo thêm: lề trong suốt thừa, hình chạm mép, cạnh vượt giới hạn texture.
   - Gợi ý được ghi vào `asset-manifest.json` (chỉ thêm mục mới).
3. **Sửa manifest bằng tay — bắt buộc**: `width`/`height` là **cỡ hiển thị @1x** trong game, không phải cỡ file. Lấy từ game gốc (dữ liệu scene/prefab, hoặc đo trên ảnh chụp màn hình). File @2x thì thêm `"scales": [2]`. Sửa `kind` khi đoán sai (vd sprite nền trong suốt nhưng là `ui`).
4. **Kiểm khai báo**: `npm run gk -- assets check`. Asset phải dùng được đúng như khai báo:
   - `seamless` → mép khớp, không lộ đường nối;
   - `nineSlice` → vùng kéo trơn, không có hoạ tiết bị méo;
   - `frames` → các khung không chạm nhau.

   Cổng P3 chạy lệnh này (`{auto: assets}`).
5. **Tổng quan**: `npm run gk -- assets review` → `art/review/overview.png`, `review.md`, `review.json`.
   - Có `art/style/analysis.json` (skill **style-analysis**) thì màu được so với style đã duyệt.
   - Không có manifest thì đưa thẳng thư mục, kèm `--scale 0.5` nếu file là @2x.
6. **Nhìn**: mở `overview.png`. Số trên ảnh khớp với cột # trong `review.md`. Ảnh gồm:
   - nền: nền lặp được vẽ hai lần nối nhau;
   - tile: lặp 3×3;
   - **hàng sân khấu**: nhân vật, vật phẩm đứng trên nền chính, đúng tỉ lệ thật với nhau;
   - khung UI: ở cỡ gốc và kéo to.

   Trả lời các câu ở mục "Nhìn tổng quan" (góc nhìn, tỉ lệ, hình khối, ánh sáng, đọc được khi chơi, mối nối), ghi số asset lạc.
7. **Sửa** theo [techniques.md](references/techniques.md), chạy lại 4–5. **Người dùng duyệt** mục "Cả bộ trông như một game" (không tự tick).
8. **Trong game**: vẽ đúng kỹ thuật bằng `src/view/art.ts`:
   - `drawNineSlice` cho khung, thanh;
   - `drawTiled` cho tile và nền cuộn parallax (offset = camera × hệ số lớp);
   - `integerScale` + `crispPixels` cho pixel art.

   UI bằng DOM: CSS `border-image` với cùng viền 9-slice.

## Đọc `review.md`
| Cảnh báo | Nghĩa | Sửa |
| --- | --- | --- |
| mờ / kém nét hơn phần còn lại | Mép chuyển màu qua nhiều pixel: ảnh đã bị phóng to hoặc làm mờ. Độ nét đo bằng "px chi tiết / px hiển thị" | Ảnh gốc lớn hơn, xuất lại @2x, hoặc vẽ lại |
| nét viền trên màn hình X px, cả bộ ~Y px | Nét dày theo **px màn hình**, không theo tỉ lệ asset: boss to và đồng xu nhỏ vẫn cùng một độ dày nét | Vẽ lại nét theo px hiển thị, đừng phóng/thu cả hình có nét |
| có/không nét viền khác phần lớn | Một asset lạc kiểu viền | Thêm/bỏ nét |
| mép răng cưa giữa bộ mép mượt (hoặc ngược lại) | Trộn pixel art với art khử răng cưa | Chọn một kiểu cho cả bộ |
| ánh sáng từ hướng khác | Bóng/sáng ngược với phần lớn | Vẽ lại bóng theo hướng chung |
| màu lạc khỏi bộ | Ít màu gần bảng màu chung (hoặc `art/style`) | Đổi màu theo bảng; màu mới có chủ đích → `extraPalette` (style-analysis) |
| nền nổi ngang/hơn vật chơi | Nền tương phản/bão hoà ≥ nhân vật: người chơi khó thấy vật cần tương tác | Giảm tương phản, bão hoà của nền (xa thì nhạt hơn) |
| tile đặt cạnh nhau lộ ranh giới | Màu mép hai tile lệch | Tile chuyển tiếp (transition/autotile) hoặc chỉnh màu mép |

## Giới hạn
- Chỉ PNG. Cỡ hiển thị lấy từ manifest: sai cỡ thì các so sánh độ nét và nét viền đều sai.
- Ánh sáng chỉ đo được trên sprite có đổ bóng; art màu phẳng không có hướng sáng (đúng, không phải lỗi).
- Ghép sheet không có khoảng trống giữa khung thì lệnh không tự nhận ra: khai báo `frames` bằng tay.
- Số đo không thấy góc nhìn, phối cảnh, ngôn ngữ hình khối: luôn cần bước nhìn ảnh tổng quan.
