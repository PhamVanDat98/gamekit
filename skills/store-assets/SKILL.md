---
name: store-assets
description: Dùng ở pha P5 khi chuẩn bị trang game trên portal — viết store/listing.yaml (tên, mô tả, cách chơi, tag cho mọi ngôn ngữ), cắt ảnh store cho từng portal bằng gamekit store từ store/source/ hoặc ảnh smoke, sinh key art nếu cần, kiểm giới hạn của portal. Cũng dùng khi mục store của cổng P5 đỏ.
---

# Ảnh và mô tả trang game (P5)

`npm run gk -- store [--portal p]` (đọc `scripts/store.mjs`, `scripts/lib/store.mjs`):
1. Portal = `portals` trong game.yaml trừ `dev-mock`. Không còn portal nào → lỗi.
2. Chưa có `store/listing.yaml` → tạo khung (giá trị `TODO: …`).
3. Mỗi ảnh portal cần → cắt/co về đúng cỡ, ghi `store/<portal>/<tên>.png`.
4. Kiểm listing và ảnh; lỗi → mã thoát 1. Cổng P5 `{auto: store}` chạy cùng phần kiểm này (không cắt ảnh).

## 1. Giới hạn của portal
Lấy từ khối `store:` trong `portals/<id>/portal.yaml` của plugin. Portal chưa có khối đó (hiện cả `azgames`) → GameKit dùng bộ chung và cảnh báo:
- Ảnh (`store/<portal>/<tên>.png` ← nguồn): `icon` 512×512 ← `icon`; `thumb` 512×384 và `cover` 1280×720 ← `landscape`; `portrait` 720×1280 ← `portrait`.
- Chữ (ký tự, mỗi ngôn ngữ): `title` ≤ 40, `short` ≤ 120, `description` 100–3000, `controls` 10–500; `tags` 3–10 mục.

**Bộ chung này không phải yêu cầu của portal.** Nói rõ với người dùng và hỏi yêu cầu thật (cỡ ảnh, định dạng, độ dài mô tả, danh mục, tag cho phép). Có số thật thì báo người dùng/người bảo trì GameKit thêm `store:` vào `portal.yaml` của plugin — game không tự sửa vỏ portal.

## 2. Viết `store/listing.yaml`
- `title`, `short`, `description`, `controls`: mỗi trường là map `<mã ngôn ngữ>: chuỗi`, `en` bắt buộc (schema), mỗi mã trong `languages` của game nên có (thiếu → cảnh báo, portal hiện bản en). Còn `TODO` → lỗi.
- `controls`: cả máy tính (phím, chuột) và điện thoại (chạm, vuốt), đúng với điều khiển đã làm ở P3.
- `tags`: chữ thường, `a-z 0-9 - và dấu cách`, không trùng. `categories` tuỳ chọn.
- Dùng cùng từ ngữ với `Language/<mã>.json` (tên chế độ chơi, vật phẩm). Bản dịch do agent viết thì ghi là bản nháp, nhờ người dùng hoặc người bản ngữ duyệt.

## 3. Ảnh nguồn
- Đặt PNG trong `store/source/`: `icon.png` (vuông), `landscape.png` (16:9), `portrait.png` (9:16), cỡ ≥ cỡ lớn nhất cần cắt. Ảnh được co phủ kín (`cover`), mép thừa bị cắt — giữ nội dung chính ở giữa.
- Thiếu `landscape`/`portrait` → dùng ảnh smoke mới nhất (`desktop-play.png` 1280×720, `phone-portrait-play.png` 390×844 trong `.gamekit/local/smoke/`). Ảnh dọc smoke bị phóng to lên 720×1280 sẽ mờ: chỉ dùng tạm. `icon` không có ảnh thay thế.
- Key art bằng `gamekit gen` (cần `OPENAI_API_KEY`, dùng style trong `style/style.json` nếu có): thêm mục vào `asset-manifest.json` (vd `id: store-landscape`, `path: store/source/landscape.png`, `kind: background`, `make: image-gen`, `width: 1280`, `height: 720`, `brief`) → `npm run gk -- gen image --id store-landscape` (hoặc `gen prompt --id …` để làm ở công cụ khác, rồi `gen import <id> <file>`); ảnh được gắn nhãn `generated` trong `provenance.json`.
- Ưu tiên ảnh không có chữ (portal tự hiện tiêu đề từ listing). Có chữ thì chỉ là tên game hiện tại.

## 4. `own` và `third-party`
- `own`: dùng tên, hình, nhân vật gốc của người dùng; ảnh chụp từ game là được.
- `third-party`: listing và ảnh **không** có tên, nhân vật, logo, art của game gốc; không dùng file trong `reference/`. `release-check` không quét `store/` — tự kiểm `release.forbiddenTerms` trong `store/listing.yaml` và tên file. Ảnh chụp phải từ bản đã reskin.

## 5. Kết thúc
`npm run gk -- smoke` (nếu cần ảnh chụp) → `npm run gk -- store` hết lỗi → `npm run gk -- gate`. Báo người dùng: portal nào đang dùng bộ chung (cần họ cho yêu cầu thật), ảnh đã tạo trong `store/<portal>/`, ngôn ngữ còn thiếu, bản dịch cần duyệt. Tiếp theo: **release-check**.
