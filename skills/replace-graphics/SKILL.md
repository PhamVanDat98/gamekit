---
name: replace-graphics
description: Dùng ở P3 sau khi đã chốt style (gamekit art lock) và có asset-manifest.json — gọi Codex vẽ asset raster theo style đã chốt (gamekit art gen --assets), kiểm tra kích thước, nền trong suốt, độ nhất quán, xem từng ảnh với concept, gắn nhãn generated, thay vào game và dựng lại bố cục UI theo style.
---

# Thay đồ hoạ bằng asset raster theo style đã chốt (P3)

Điều kiện: `game.yaml` có `art.style` (đã chốt ở **style-preview**) và `asset-manifest.json` đủ spec (id, path, kind, width, height, alpha, frames, nineSlice, minDisplayPx, brief).

## 1. Manifest: cái gì raster, cái gì không
- `make: "image-gen"`: nhân vật, vật thể, nền, tile, icon, khung UI raster (panel, nút; khai `nineSlice` để kéo giãn).
- `make: "vector"`: chữ, số, thanh máu đơn giản, thứ cần sắc nét mọi cỡ: làm bằng CSS/SVG.
- `brief` mô tả thiết kế mới theo style đã chốt, không nhắc tên hay nhân vật của game gốc (lệnh chặn `release.forbiddenTerms`).
- `noText`: mặc định không chữ trong ảnh. Chữ đi qua `t()` và `Language/*.json`.

## 2. Vẽ
`npm run gk -- art gen --assets [--only id,…] [--batch 6] [--jobs 3]`
- Mỗi việc nhận tối đa `--batch` asset, brief ở `art/raw/BRIEF-<n>.md`: style lock, bảng màu, concept đã chọn làm ảnh mẫu, spec kỹ thuật từng asset.
- Codex lưu ảnh model vẽ ra ở `art/raw/` (gitignored), hậu xử lý ra file cuối đúng kích thước tại `path`, ghi prompt và model vào `art/prompts/<id>.json`.
- Claude Code: chạy nền (`run_in_background`), chờ xong.
- Asset đạt kiểm tra tự động được gắn nhãn provenance `generated` (source = model, note = prompt). Asset chưa đạt không được gắn nhãn, nên `validate` và pre-commit vẫn chặn nó.

## 3. Kiểm tra
- Tự động (`art check --assets`): đúng kích thước spec (sprite sheet = khung × số khung), alpha, mép trong suốt với sprite/anim/icon, không phải ảnh một màu, có prompt.
- Bằng mắt, đặt cạnh concept đã chốt:
  - Cùng bảng màu, độ dày viền, hướng sáng, mức chi tiết. Xếp các sprite cạnh nhau: tỉ lệ to nhỏ giữa nhân vật, vật thể, nền hợp lý.
  - Thu về `minDisplayPx`: còn nhận ra được.
  - Sprite sheet: các khung cùng baseline, cùng pivot, chuyển động liền.
  - Tile/texture `seamless`: ghép 2×2 không thấy mép.
  - Hình vừa hitbox trong `params/` (`collider`): phần nhìn thấy không lệch xa vùng va chạm.
  - Không chữ, watermark, lỗi model. `third-party`: không giống asset gốc.
- Hỏng: `art gen --assets --only <id> --note "<góp ý>"`, tối đa 2 lần mỗi asset, sau đó báo người dùng.

## 4. Thay vào game và bố cục UI mới
- Thay placeholder trong `src/view/` bằng asset mới. Bố cục UI làm theo `ui` của style đã chốt (HUD, nút, popup, menu). Bố cục được khác bản gốc, nhưng giữ đủ thông tin gameplay, footer bản quyền trong Settings, chữ qua `t()`.
- `npm run dev`, chụp màn hình ngang và dọc (Playwright có sẵn thì dùng), so với concept màn chơi đã chọn.
- Xoá asset cũ không còn dùng và mục provenance của nó.

## 5. Xong khi
- `npm run gk -- art check --assets` và `npm run gk -- validate` sạch, `npm test` xanh.
- Cổng P3: `asset-manifest.json` khớp spec, đồ hoạ đã thay mới, chữ không in vào ảnh, thông tin gameplay có tín hiệu hình ảnh.
- Báo người dùng: số asset đã vẽ, số lần vẽ lại, asset nào còn yếu, ảnh chụp trong game. Chỉ báo những kiểm tra đã thật sự chạy.
