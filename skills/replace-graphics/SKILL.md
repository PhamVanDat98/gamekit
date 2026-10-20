---
name: replace-graphics
description: Dùng ở pha P3 khi làm lại game người khác (third-party) để làm toàn bộ hình mới theo asset-manifest.json — sinh ảnh bằng gamekit gen image, hoặc làm ở nơi khác (Codex, hoạ sĩ, gói có license) rồi gamekit gen import, UI vector vẽ tay; duyệt bằng gamekit review, gắn nhãn provenance, không còn asset reference. Game của người dùng (own) chỉ dùng khi một asset buộc phải vẽ lại.
---

# Thay đồ hoạ (P3)

Đầu vào: `asset-manifest.json` đã có brief (skill asset-spec, `gamekit assets scan --write`; không còn brief `TODO`) và style đã chọn (`style/style.json`: `art.prompt`, `art.negative`, `palette` được ghép vào mọi prompt). Đầu ra: mỗi asset một file đúng spec, có nhãn, được người dùng duyệt.

**Game của ai.** `third-party`: mọi hình phải mới; ảnh gốc chỉ nằm trong `reference/` (gitignored) và trường `ref` để so sánh. Brief mô tả thiết kế mới, không viết "vẽ lại nhân vật X". `own` (mặc định): giữ hình gốc (nhãn `own`); chỉ vẽ lại khi buộc phải (mất file, độ phân giải quá thấp, ảnh có chữ cần bản ngôn ngữ khác mà game gốc không có). Hỏi người dùng trước, ghi lý do vào `DECISIONS.md`.

## 1. Chọn cách làm cho từng asset (`make`)
| `make` | Cách làm | Nhãn |
| --- | --- | --- |
| `vector` | UI (nút, khung, thanh, icon đơn giản): SVG/CSS viết tay, màu lấy từ `src/view/theme.ts` | `own` |
| `image-gen` | `gamekit gen image` (cần `OPENAI_API_KEY`) | `generated` (tự gắn) |
| `image-gen` không có key | `gamekit gen prompt` → làm ở Codex/ChatGPT/công cụ khác → `gen import` | `generated` |
| `licensed` | gói asset mua/miễn phí: `gen import … --label licensed --license "<loại, URL>" --source "<gói, tác giả>"` | `licensed` |
| `own` | hoạ sĩ của người dùng vẽ: `gen import … --label own --source "<tác giả>"` | `own` |

## 2. Sinh ảnh bằng `gamekit gen image`
1. Xem trước, không tốn phí: `gen image --dry-run` (hoặc `gen prompt [--id a]`). Prompt in ra và lưu ở `.gamekit/local/gen/<id>[.<mã>].txt`. Đọc lại: đúng kích thước, nền trong suốt nếu `alpha`, không nhắc game gốc.
2. Chạy: `gen image` chỉ sinh asset `make: image-gen` **chưa có file**. `--id a,b` chọn cụ thể và ghi đè file đã có. Quá 5 lần gọi API phải thêm `--yes` (báo người dùng số lần gọi trước).
3. Model: mặc định `gpt-image-1.5` (`--model` hoặc biến `GAMEKIT_IMAGE_MODEL`). `gpt-image-2` không làm được nền trong suốt: lệnh dừng nếu có asset `alpha: true`. `--quality` truyền thẳng cho API.
4. Kết quả được ép về đúng spec: `alpha: true` thu vừa khung (không cắt vật thể); 9-slice và `seamless` kéo giãn (cắt sẽ hỏng viền/đường nối); còn lại phủ kín rồi cắt. Sprite sheet (`frames`): model chỉ làm ảnh 1:1, 3:2, 2:3 nên gen xin một lưới khung (vd 4×2) rồi cắt lại thành một hàng đúng spec — kiểm tra các khung cùng nhân vật, cùng tỉ lệ. Ghi PNG (`path` phải là `.png`, kiểm trước khi gọi API), gắn nhãn `generated` kèm model, ghi `gen` vào manifest sau từng file và xoá kết quả duyệt cũ. Ngôn ngữ chưa có bản dịch bị bỏ qua (không sinh ảnh mang chữ tiếng Anh).
5. `third-party`: prompt chứa từ trong `release.forbiddenTerms` bị chặn. Sửa `brief`/`prompt` bằng lời mô tả thiết kế mới, không lách bằng cách viết sai chính tả.

## 3. Ảnh có chữ (logo, nút có chữ, banner)
- Manifest: `text: true`, `textKey` (key trong `Language/en.json`), `path` trong `assets/i18n/en/`. Code lấy bằng `tAsset('ui/title.png')`.
- `gen image` sinh **mỗi ngôn ngữ một bản** trong `assets/i18n/<mã>/` với đúng chuỗi trong `Language/<mã>.json` (`--lang vi` để làm một ngôn ngữ). Vì vậy chốt text trước (skill rename-and-text), đổi text thì sinh lại.
- Model hay viết sai chữ, nhất là chữ không phải Latin: mở từng bản, so với chuỗi gốc. Sai nhiều lần thì dùng nền không chữ + chữ vẽ bằng `t()`.
- Làm ở nơi khác: `gen import <id> <file> --lang <mã>` cho từng ngôn ngữ (mặc định `en`).

## 4. Đưa file làm ở nơi khác vào
`gamekit gen import <id> <file> [--lang <mã>] [--label generated|licensed|own] [--source …] [--license …]`: chỉ nhận PNG, ép về spec, ghi vào `path` của asset, gắn nhãn (mặc định `generated`). `licensed` bắt buộc có `--license` (validate chặn nếu thiếu). File SVG/CSS viết tay: `gamekit provenance add <file> --label own`.

## 5. Duyệt
1. `gamekit review` → `.gamekit/local/review/index.html`: mỗi asset cạnh spec, ảnh gốc (`ref`), nhãn, mọi bản ngôn ngữ, danh sách vấn đề (thiếu file, sai kích thước, chưa nhãn, `placeholder`/`reference`, thiếu bản ngôn ngữ).
2. **Người dùng** đánh dấu OK / Cần sửa và tải `review.json`; agent không tự đánh dấu thay.
3. `gamekit review --apply review.json` → `review` trong `asset-manifest.json` + checklist trong `notes/review.md`.
4. Mục "cần sửa": đưa ghi chú vào `brief`/`prompt`, sinh lại `gen image --id <các id>` (hoặc import lại), duyệt lại cho tới khi không còn mục `fix` (`validate` cảnh báo khi còn).

## 6. Hoàn tất
- Không còn file nhãn `reference` trong `assets/`, `public/` (từ P3 `validate` báo lỗi); `placeholder` phải hết trước P5. Mọi file có nhãn.
- Chạy `gamekit validate` (kích thước, alpha, `text`/`textKey`), `npm run lint`, `npm run typecheck`, `npm test`, `npm run dev` xem trong game, rồi `gamekit gate`.
- Báo người dùng: số asset theo nhãn, số lần gọi API đã dùng, mục còn cần sửa, ảnh có chữ chưa đủ ngôn ngữ. Tiếp theo: skill replace-audio.
