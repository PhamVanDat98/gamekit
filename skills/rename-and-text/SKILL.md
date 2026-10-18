---
name: rename-and-text
description: Dùng cuối P3 khi làm lại game của người khác — đặt tên game mới, viết lại mọi text hiển thị (UI, hướng dẫn, mô tả) bằng lời mới qua t() và Language/*.json, điền release.forbiddenTerms với tên/thương hiệu/nhân vật gốc để release-check chặn, và dọn tên gốc khỏi code, tên file, metadata. Dùng cả khi release-check báo còn tên game gốc.
---

# Đổi tên và text (P3, game làm lại)

Đầu vào: tên đề xuất trong `style/direction.md`, `release.forbiddenTerms` (đã có từ P0), `Language/en.json`. Đầu ra: tên mới trong `game.yaml` và mọi nơi hiển thị; text mới trong `Language/*.json`; không còn tên gốc trong bản build.

## 1. Tên mới
- Người dùng chọn tên (từ đề xuất hoặc tự đặt). Kiểm: không chứa từ nào trong `forbiddenTerms`, không gần giống (đổi một chữ, dịch nghĩa, viết tắt của tên gốc).
- Gợi ý người dùng tự kiểm tra trùng tên/nhãn hiệu trên các portal và cửa hàng ứng dụng — GameKit không kiểm được việc này.
- Cập nhật `title` trong `game.yaml`, `<title>` trong `index.html`, tên hiển thị trong game (qua `t()`).

## 2. forbiddenTerms đủ rộng
`release.forbiddenTerms` trong `game.yaml` là thứ `gamekit release-check` dùng để quét file text, tên file và chuỗi ASCII trong file nhị phân của bản build. Thêm:
- tên game gốc (mọi cách viết: có/không dấu cách, viết tắt);
- tên nhân vật, địa danh, vật phẩm đặc trưng;
- tên studio/nhà phát hành gốc.

Từ quá chung (vd "ball", "jump") gây báo nhầm — chỉ thêm từ đặc trưng.

## 3. Text mới
- Mọi chữ hiển thị nằm trong `Language/en.json` (bản gốc của mọi bản dịch), gọi bằng `t('key')`; không viết cứng trong `src/`.
- **Viết lại bằng lời mới**, không dịch hay chép câu chữ của game gốc (hướng dẫn, mô tả, lời thoại, tên màn). Giữ đúng ý gameplay (luật chơi phải đúng).
- Thêm key mới cho tên game, credits (ghi công asset CC-BY), mô tả ngắn.
- Các ngôn ngữ khác trong `languages`: dịch từ `en.json` mới; giữ nguyên `{param}`; `gamekit validate` báo key thiếu/thừa.
- Chữ không nằm trong ảnh — nếu còn ảnh có chữ, quay lại **replace-graphics**.

## 4. Dọn tên gốc ngoài phần hiển thị
- Tên biến, file, thư mục, comment, `package.json` (`name`, `description`), event analytics: không chứa tên gốc. `grep -ri "<tên gốc>" src assets public Language index.html package.json`.
- Ghi chú trong `notes/` được nhắc tên gốc (không đóng gói), nhưng code thì không.

## 5. Kiểm
- `gamekit validate`: Language đúng, `t()` key tồn tại.
- `gamekit pack --all && gamekit release-check`: không còn `forbiddenTerms` trong text, tên file, file nhị phân.
- `gamekit smoke`, xem ảnh chụp: tên mới hiển thị, chữ không tràn ở mọi ngôn ngữ dài.
- Báo người dùng để tick mục "Đồ hoạ, âm thanh, tên và text đã thay mới" trong `gates/P3.md` sau khi họ xem.
