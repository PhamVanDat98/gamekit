---
name: store-assets
description: Dùng ở P5 trước khi nộp game lên portal — chuẩn bị icon trong gói (public/Icons/web.png, loading.webp) thay ảnh tạm, và bộ nộp của từng portal (thumbnail, ảnh bìa, ảnh chụp, video, tên, mô tả, hướng dẫn, tag) theo yêu cầu của portal đó; gắn nhãn provenance, kiểm bằng validate và release-check. Dùng cả khi release-check báo icon còn placeholder.
---

# Ảnh và thông tin nộp portal (P5)

Hai phần khác nhau:
1. **Icon trong gói build** — GameKit kiểm.
2. **Bộ nộp portal** (thumbnail, mô tả, tag…) — nộp riêng trên trang của portal, không nằm trong gói. GameKit **chưa có** thông số store của portal nào: `portals/<id>/portal.yaml` hiện không khai báo kích thước thumbnail hay độ dài mô tả. Lấy từ tài liệu nộp game của portal hoặc hỏi người dùng; không đoán.

## 1. Icon trong gói
| File | Dùng ở | Yêu cầu GameKit kiểm |
| --- | --- | --- |
| `public/Icons/web.png` | favicon, `<link rel="icon">` | phải là PNG (`validate`) |
| `public/Icons/loading.webp` | key art màn loading (nền mờ + ảnh giữa) | phải là WebP (`validate`) |
| `Icons/domain.webp` | logo portal | thuộc bộ vỏ portal trong plugin, game không sửa |

Template để ảnh tạm có nhãn `placeholder`; `release-check` chặn phát hành khi còn nhãn đó. Thay bằng ảnh thật rồi gắn nhãn:
- game của người dùng: `gamekit provenance add public/Icons/web.png public/Icons/loading.webp --label own` (lấy từ icon/key art của bản gốc);
- game làm lại của người khác: ảnh mới (`generated` hoặc `licensed` + `--license`), không dùng icon gốc, không có tên game gốc trong ảnh.

`web.png` vuông, rõ ở kích thước nhỏ. `loading.webp` là key art nhìn được cả khi bị làm mờ, nhân vật/tên ở giữa (màn loading cắt theo khung).

## 2. Bộ nộp từng portal
Với mỗi portal trong `portals` của `game.yaml` (trừ `dev-mock`), lập `store/<portal>/README.md` (thư mục `store/` không vào gói build):

```
| Mục | Yêu cầu của portal | File / nội dung | Trạng thái |
| --- | --- | --- | --- |
| Thumbnail | <kích thước, định dạng theo tài liệu portal> | store/azgames/thumb.png | xong |
| Mô tả ngắn | <giới hạn ký tự> | … | |
```
Cột "Yêu cầu" ghi nguồn (link tài liệu, hoặc "người dùng cung cấp ngày …"). Chưa biết → hỏi người dùng, để trống chứ không điền số tự nghĩ.

Thường gặp (chỉ để biết hỏi gì, **không phải** yêu cầu của portal cụ thể nào): thumbnail vuông và ngang nhiều cỡ, ảnh chụp trong game, video gameplay ngắn, tên, mô tả ngắn/dài, hướng dẫn điều khiển, danh mục, tag, ngôn ngữ hỗ trợ, hướng màn hình, thiết bị hỗ trợ.

## 3. Làm nội dung
- **Ảnh chụp**: `gamekit smoke` đã chụp `builds/<v>/smoke/{desktop,mobile-portrait,mobile-landscape}.png` — dùng làm nháp; chụp lại cảnh đẹp hơn bằng `npm run preview`.
- **Thumbnail/ảnh bìa**: từ key art (`loading.webp`) hoặc asset gốc của game; chữ trên ảnh dùng đúng tên bản web.
- **Mô tả, hướng dẫn**: tiếng Anh trước; điều khiển lấy từ `game.controls` trong `Language/en.json` (đúng với bản web: chuột, bàn phím, cảm ứng); các ngôn ngữ khác nếu portal hỗ trợ.
- **Tag/danh mục**: theo thể loại thật của game; không nhồi tag.
- Game làm lại của người khác: tên, mô tả, ảnh **không** chứa tên/thương hiệu gốc (`release.forbiddenTerms`).

## 4. Kiểm
- `gamekit validate`: icon đúng định dạng, có nhãn provenance.
- `gamekit pack --all` → `gamekit release-check`: hết lỗi "nhãn placeholder không được phát hành"; không còn tên game gốc.
- Mở màn loading (`npm run preview`, gói `dev-mock`): key art và favicon hiện đúng.
- Mọi dòng trong `store/<portal>/README.md` có file/nội dung và nguồn yêu cầu.

## 5. Báo cáo
Icon đã thay (nhãn), từng portal: mục đã xong, mục thiếu thông số (cần người dùng/tài liệu portal), đường dẫn file để người dùng nộp.
