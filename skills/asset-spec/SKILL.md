---
name: asset-spec
description: Dùng ở pha P3 khi game làm lại (third-party) cần asset mới, hoặc game của bạn phải làm lại một số asset — biến nháp asset-manifest.json (gamekit assets scan --write) thành spec thật cho từng asset (đường dẫn, loại, cách làm, kích thước @1x, alpha, frame, nine-slice, chữ theo ngôn ngữ, brief thiết kế mới); validate kiểm kích thước và luật i18n, duyệt bằng gamekit review.
---

# Spec asset (P3)

`asset-manifest.json` (schema `.gamekit/schemas/asset-manifest.schema.json`) là danh sách asset game sẽ phát hành, mỗi mục đủ để người vẽ hoặc `gamekit gen` làm ra đúng file. `third-party`: mọi asset là thiết kế mới, bản gốc chỉ là tư liệu trong `reference/`. `own`: dùng khi một số asset gốc phải làm lại (quá nhỏ, in chữ không dịch được…); asset giữ nguyên có `make: own`.

## 1. Nháp
`npm run gk -- assets scan [--from reference|assets]` xem trước (mặc định `reference` cho third-party, `assets` cho own); thêm `--write` để ghi. Scan bỏ qua file đã có trong manifest (theo `path`/`ref`), đặt `id` không trùng, đoán `kind` từ tên, đọc `width`/`height`/`alpha` của ảnh, và với `reference/` đặt `path` = `assets/img/<…>.png` hoặc `assets/audio/<…>.ogg`, `ref` = file gốc. Với `reference/` mọi `brief` là `TODO`; với `assets/` (own) chỉ file có tên gợi ý chữ (logo, button, title…) mới có brief nhắc — mở ảnh ra xem.

## 2. Mỗi mục cần gì
| Trường | Ghi chú |
| --- | --- |
| `id`, `path`, `kind` | `kind`: `sprite ui anim background tile icon texture model audio`. Ảnh không chữ: `assets/img/…`; âm thanh: `assets/audio/…` |
| `make` | `vector` (SVG/CSS — ưu tiên cho UI: nút, panel, thanh), `image-gen` (`gamekit gen image`), `own` (người dùng vẽ/có sẵn), `licensed` (gói asset có giấy phép) |
| `width`, `height` | Bắt buộc trừ audio. Cỡ **@1x** = cỡ vẽ trong toạ độ world, không phải cỡ ảnh gốc |
| `scales` | vd `[1, 2]` khi cần bản nét cho màn DPI cao |
| `alpha` | `true` cho sprite/UI cần nền trong suốt |
| `frames` | `{ count, width, height, fps }`: sheet một hàng, file rộng `width × count` |
| `nineSlice` | `[trái, trên, phải, dưới]` px cho panel/nút co giãn |
| `seamless` | tile, nền lặp |
| `collider` | đường dẫn param, vd `player.hitbox`: hình phải khớp hitbox trong `params/`, không đổi hitbox cho vừa hình |
| `minDisplayPx` | cỡ nhỏ nhất thật sự hiển thị (icon): chi tiết phải đọc được ở cỡ đó |
| `pivot`, `padding`, `atlas`, `states` | khi renderer cần |
| `noText` / `text` + `textKey` | không cùng `true`; xem bước 3 |
| `voice` + `textKey` | lời thoại: `kind: audio`, path trong `assets/i18n/en/` |
| `ref` | file trong `reference/` mà asset thay (third-party) hoặc file gốc đã xuất (own) |
| `brief`, `prompt` | bước 4 |

Font không nằm trong manifest (không có `kind` cho font): xem **style-direction**.

## 3. Chữ trong ảnh
- Ưu tiên ảnh **không chữ** + chữ vẽ bằng `t()`: nền nút (`nineSlice`, hoặc `make: vector`) và nhãn từ `Language/*.json`. Đánh `noText: true`.
- Chỉ khi chữ là một phần hình (logo, tiêu đề vẽ tay): `text: true`, `textKey` (key có trong `Language/en.json`), `path` trong `assets/i18n/en/…`; mỗi ngôn ngữ một bản cùng đường dẫn trong `assets/i18n/<mã>/`, game lấy bằng `tAsset()`. `gen image` sinh mỗi ngôn ngữ một bản đúng chữ trong `Language/<mã>.json`.
- `validate` báo lỗi: `text` mà path ngoài `assets/i18n/en/`; file trong `assets/i18n/` không có `text`/`voice`; `textKey` không có trong `en.json`.

## 4. Brief là thiết kế mới
Brief nói asset **làm gì** trong game, hình khối, silhouette, trạng thái, cần nổi bật hay chìm, đọc được ở cỡ nào — theo style đã chọn. `third-party`: không nhắc tên, nhân vật, thương hiệu game gốc, không viết "vẽ lại X"; `ref` chỉ để biết vai trò và kích thước. `gen` dừng nếu prompt chứa từ trong `release.forbiddenTerms`. `prompt` là phần thêm vào prompt khi sinh; brief vẫn là mô tả chính.

## 5. Làm ra file
- `npm run gk -- gen image [--id a,b] [--lang vi] [--dry-run] [--yes]`: chỉ mục `make: image-gen`, cần `OPENAI_API_KEY`; trên 5 lần gọi API phải có `--yes`; chỉ ghi PNG (đặt `path` đuôi `.png`), tự khớp cỡ spec, ghép `art.prompt` + màu của `style/style.json`.
- `gen prompt [--id a]` in prompt để làm ở công cụ khác; `gen import <id> <file> [--lang vi] [--label …] [--source …] [--license …]` đưa file vào, khớp spec, gắn nhãn. Lời thoại: `gen voice`.
- File làm tay/mua: `npm run gk -- provenance add <file> --label own|licensed [--source …] [--license …]`. Mọi file trong `assets/`, `public/` phải có nhãn.

## 6. Kiểm và duyệt
1. `npm run gk -- validate`: schema, brief còn `TODO`, file có cỡ khác spec (sheet tính `frames.width × count`), cần alpha mà PNG không có, luật i18n.
2. `npm run gk -- review` → `.gamekit/local/review/index.html`: mỗi asset cạnh spec, bản gốc, nhãn, mọi ngôn ngữ. Người dùng đánh OK / cần sửa, tải `review.json`; `npm run gk -- review --apply review.json` ghi vào manifest và `notes/review.md`.
3. Sửa mục `review.status: fix`, review lại tới khi hết.

## 7. Kết thúc
`npm run gk -- gate`. Báo người dùng: số asset theo `make`, ảnh có chữ và ngôn ngữ còn thiếu, mục còn TODO/cần sửa, số lần gọi API dự kiến trước khi chạy `gen` thật. Tiếp theo: **apply-style** (nếu chưa áp), làm/sinh asset, rồi duyệt bằng `gamekit review`.
