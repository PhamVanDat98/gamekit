---
name: style-preview
description: Dùng ở pha P3 khi game làm lại (third-party) đã có các phương án style/options/*.json và người dùng cần so để chọn — tạo trang .gamekit/local/preview/style.html bằng gamekit style preview, kiểm tương phản, mọi ngôn ngữ, chuỗi dài nhất, RTL, popup Settings, cỡ điện thoại, rồi trình bày để người dùng tự chọn.
---

# Xem và chọn style (P3, third-party)

Đầu vào: 2–4 file `style/options/<id>.json` (skill **style-direction**). Kết quả: người dùng nói ra `id` họ chọn. **Agent không chọn thay**, không chạy `style choose` khi người dùng chưa nói.

## 1. Tạo trang so sánh
`npm run gk -- style preview` → `.gamekit/local/preview/style.html` (mở bằng trình duyệt). Mỗi phương án là một thẻ gồm:
- ô màu từng `palette` + tỉ lệ tương phản `text/bg`, `text/surface`, `onPrimary/primary`;
- khung giả lập: HUD điểm + nút bánh răng, tiêu đề, nút primary / secondary / disabled, bảng Settings dùng đúng CSS `.gk-settings*` lấy từ `src/view/style.css` (có footer bản quyền), 5 chuỗi dài nhất;
- `art.prompt` / `art.negative`, và ảnh trong `style/options/<id>/` (`png`, `jpg`, `webp`, `gif`) nếu có.

Thanh trên cùng: chọn ngôn ngữ (lấy từ `languages`, chuỗi thật trong `Language/*.json`, thiếu key thì dùng bản en), ô "Chuỗi dài nhất mọi ngôn ngữ". Ngôn ngữ có `_meta.dir: "rtl"` hiển thị phải sang trái. Font chỉ nạp khi file trong `assets/fonts/` tồn tại; thiếu file thì thẻ hiện font hệ thống — báo điều đó, đừng đánh giá font qua bản thay thế. Đã có `style/style.json` mà không còn trong `options/` thì trang vẫn hiện nó, ghi "đang dùng".

## 2. Kiểm gì
| Mục | Cách xem | Đạt khi |
| --- | --- | --- |
| Tương phản | dòng tỉ lệ, cảnh báo của `validate` | text ≥ 4.5:1, chữ trên nút ≥ 3:1 |
| Mọi ngôn ngữ | đổi từng ngôn ngữ | đủ glyph (không ô vuông, không lẫn font dự phòng), dấu không bị cắt |
| Chuỗi dài nhất | bật ô "Chuỗi dài nhất" | nút và tiêu đề không tràn, không cắt chữ |
| RTL | ngôn ngữ `rtl` (nếu có) | thứ tự và căn lề đúng |
| Settings | khung Settings trong thẻ | đọc được, footer bản quyền còn và rõ |
| Cỡ điện thoại | thu cửa sổ về ~390 px hoặc chế độ thiết bị DevTools | chữ HUD, chữ phụ vẫn đọc được |
| Hợp gameplay | so với `spec/gameplay-spec.md` | vật quan trọng nổi trên `bg`, không nhầm với UI |

Ghi lại vấn đề theo từng phương án; sửa được ngay (màu, font) thì sửa file option, chạy lại `style preview`.

## 3. Ảnh concept (tuỳ chọn)
Một hai ảnh cảnh chơi hoặc nhân vật giúp người dùng hình dung. Lưu vào `style/options/<id>/*.png` để trang tự hiện.
- `gamekit gen image` / `gen prompt` làm việc trên mục trong `asset-manifest.json` và ghép phong cách của style **đã chọn** (`style/style.json`), không đọc `style/options/`. Vì vậy với phương án chưa chọn: tự ghép prompt từ `art.prompt` + màu `palette` + `art.negative` của phương án đó, sinh ở công cụ khác (ChatGPT, Codex…) hoặc vẽ tay.
- Cùng một cảnh, cùng bố cục cho mọi phương án để so công bằng. Không đưa ảnh hay tên game gốc vào prompt (`release.forbiddenTerms`).

## 4. Trình bày cho người dùng
1. Đưa đường dẫn trang và tóm tắt mỗi phương án: cảm giác, người chơi, kết quả kiểm ở bước 2 (đạt / vấn đề cụ thể), font nào còn thiếu.
2. Hỏi người dùng chọn một `id` (trong Claude Code dùng AskUserQuestion), hoặc yêu cầu chỉnh/ghép phương án. Có thể nêu nhận xét khách quan, không tự quyết.
3. Người dùng muốn sửa → sửa `style/options/<id>.json`, `npm run gk -- validate`, `style preview` lại.

## 5. Kết thúc
Khi người dùng đã nói `id`: mục "Đã chọn style (bạn)" trong `gates/P3.md` do họ tick, không tự tick. Tiếp theo: **apply-style** (`npm run gk -- style choose <id>`).
