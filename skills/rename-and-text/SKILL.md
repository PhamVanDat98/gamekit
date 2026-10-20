---
name: rename-and-text
description: Dùng ở pha P3 khi làm lại game người khác (third-party) để đặt tên game mới, tên mới cho nhân vật, vật phẩm, màn chơi, viết lại mọi chuỗi trong Language/en.json bằng lời mới, dọn tên gốc khỏi key, tên file và metadata — release.forbiddenTerms điền đủ để release-check chặn tên gốc còn sót trong gói.
---

# Đổi tên và viết lại text (P3)

Mục tiêu: người chơi không thấy, và gói build không chứa, tên hay câu chữ của game gốc. Cơ chế gameplay giữ nguyên (luật cứng 1); tên và text là phần phải làm mới.

**Game của ai.** `third-party`: bắt buộc toàn bộ skill này. `own` (mặc định): giữ tên và text gốc — chỉ dùng khi người dùng muốn đổi tên game; khi đó làm bước 2, 4, 5, bỏ `forbiddenTerms`.

## 1. Danh sách tên gốc → `release.forbiddenTerms`
Liệt kê từ `notes/`, `reference/`, trang store của game gốc: tên game, studio/nhà phát hành, nhân vật, vật phẩm, thế giới/màn, thương hiệu, câu khẩu hiệu. Thêm biến thể: viết liền, CamelCase, viết tắt, tên ở các ngôn ngữ game gốc có.
- So khớp là chuỗi con, không phân biệt hoa thường: từ quá chung ("run", "hero") sẽ chặn nhầm — chỉ ghi từ đặc trưng.
- File nhị phân (ảnh, âm thanh, font) chỉ được quét với từ ASCII; tên không phải Latin chỉ bị bắt trong file text.
- Cổng P0 đã đòi danh sách không rỗng; bổ sung khi phát hiện thêm.

## 2. Tên game mới
Đề xuất 3–5 tên kèm lý do; **người dùng chọn**. Nhắc người dùng tự tra trùng tên/nhãn hiệu (agent không kiểm được). Rồi:
- `game.yaml` `title` (trang portal và `manifest.json` dùng trường này); `store/listing.yaml` `title` mọi ngôn ngữ.
- `name` (tên gói zip, namespace save, nằm trong `framework.js`) không được chứa tên gốc. Đổi `name` sau khi đã phát hành sẽ mất save của người chơi — chỉ đổi trước P5.
- `package.json` (`name`, `description`), `index.html`, chuỗi tên game trong `Language/*.json`.

## 3. Tên nhân vật, vật phẩm, màn chơi
- Bảng đối chiếu cũ → mới trong `notes/naming.md` (không đóng gói). Tên mới theo style đã chọn, không phải biến thể của tên gốc (đổi một chữ, dịch nghĩa sát).
- Dữ liệu chỉ giữ key; key, id, enum, tên file, `id` trong `asset-manifest.json`, tham số event analytics cũng không chứa tên gốc — key nằm trong `Language/*.json` và `framework.js` của gói.

## 4. Viết lại `Language/en.json`
- Mọi chuỗi (menu, hướng dẫn, thoại, mô tả vật phẩm, thành tích) viết bằng lời mới, không diễn đạt lại sát câu gốc. Thông tin gameplay giữ đúng (số, điều kiện thắng).
- Giữ nguyên `{tham số}` và dạng số nhiều (`key.one` / `key.other`); key mới thì sửa chỗ gọi `t()` (validate báo `t('…')` không có trong en.json).
- Chuỗi người chơi thấy phải qua `t()` — `npm run lint` chặn chữ viết cứng trong `src/view/`, `src/main.ts`.
- Text đổi thì asset phụ thuộc phải làm lại: ảnh có chữ (`text: true`, skill replace-graphics, `gen image --id …`) và lời thoại (`voice: true`, skill replace-audio, `gen voice --id …`).

## 5. Tên file và metadata
- Tìm từng từ cấm: `grep -rni "<từ>" src Language assets public store game.yaml package.json index.html` (cả tên file: `find assets public -iname "*<từ>*"`).
- Tên file asset giữ nguyên trong gói (Vite chỉ thêm hash): đổi tên, sửa `path` trong manifest và `provenance.json`.
- Metadata trong file: chữ trong PNG/EXIF, tag ID3 của mp3, tên font. Xuất lại sạch hoặc xoá metadata.
- `public/StreamingAssets/` (dữ liệu level…): chỉ key, không chuỗi gốc.

## 6. Hoàn tất
1. `gamekit validate`, `npm run lint`, `npm run typecheck`, `npm test`.
2. `gamekit pack --portal dev-mock` rồi `gamekit release-check`: quét tên file, file text và file nhị phân trong gói, báo từng chỗ còn tên gốc. Sửa đến khi sạch.
3. Báo người dùng: tên mới đã dùng, số chuỗi đã viết lại, từ cấm còn bị bắt (nếu có). Mục cổng P3 "Đồ hoạ, âm thanh, tên và text đã thay mới" chỉ tick khi replace-graphics và replace-audio cũng xong; rồi `gamekit gate`.
4. Bản dịch cũ trong `Language/<mã>.json` không còn khớp en: làm lại theo skill add-i18n.
