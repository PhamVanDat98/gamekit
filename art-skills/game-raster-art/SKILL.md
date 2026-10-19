---
name: game-raster-art
description: Tạo asset game raster (nhân vật, kẻ địch, vật phẩm, icon, UI, tile, nền/parallax, hiệu ứng, animation) bằng công cụ tạo ảnh image_gen của Codex rồi hậu xử lý thành file dùng được trong game — tách nền trong suốt, đúng cỡ, cùng tỉ lệ và điểm neo, strip animation, pixel art đúng lưới, tile liền mạch — giữ một style đồng nhất qua ảnh neo style. Dùng khi cần art game dạng ảnh (painterly, cartoon, anime, pixel, 3D render…) cho một game, hoặc khi người dùng đưa ảnh mẫu style và muốn asset giống như vậy.
---

# Art game raster bằng Codex

Tạo ảnh bằng `image_gen` có sẵn của Codex (skill hệ thống `imagegen`, không cần API key). Model không trả đúng cỡ, nền trong suốt hay strip đều nhau, nên mọi ảnh đi qua `gameart.py`.

`GA` = `python3 <thư mục skill này>/scripts/gameart.py` (cần Pillow: `python3 -m pip install pillow`).

## 0. Thư mục
| Gì | Ở đâu |
| --- | --- |
| Ảnh neo style + mô tả style | `art/style/anchor.png`, `art/style/STYLE.md` (commit) |
| Prompt từng asset | `art/prompts/<id>.md` (commit; ghi prompt cuối cùng đã dùng) |
| Ảnh gốc từ model | chép từ `$CODEX_HOME/generated_images/…` sang `art/raw/<id>-v<N>.png` (game GameKit: `.gamekit/local/raw/`) |
| Asset cuối | đường dẫn game dùng (GameKit: `path` trong `asset-manifest.json`) |

Không để asset dự án chỉ nằm trong `$CODEX_HOME`. Không ghi đè bản cũ: tạo `-v2`, `-v3`.

## 1. Chốt style trước khi làm hàng loạt
1. Chọn một style trong [styles.md](references/styles.md) theo thể loại game, hoặc mô tả ảnh mẫu người dùng đưa bằng đúng các mục ở đó (nét viền, cách tô, chất liệu, palette, góc nhìn, tỉ lệ).
2. Tạo **ảnh neo style**: 2–3 phương án "style tile" (nhân vật chính, một kẻ địch, một vật phẩm, một khối nền đặt cạnh nhau trên nền phẳng) theo mẫu trong [prompts.md](references/prompts.md). Người dùng chọn một.
3. Lưu ảnh được chọn thành `art/style/anchor.png`; viết `art/style/STYLE.md`: dòng style (chép nguyên văn vào mọi prompt), palette chính (hex), góc nhìn, tỉ lệ đầu/thân, độ dày viền, màu nền tách (key).
4. Từ đây **mọi** lần tạo ảnh: `view_image art/style/anchor.png` trước, rồi gọi `image_gen` với "Image 1: style reference" và dòng style. Nhân vật đã duyệt cũng thành ảnh tham chiếu cho frame/biến thể của nó.

## 2. Tạo từng asset
- Dùng mẫu prompt theo loại asset trong [prompts.md](references/prompts.md). Một lần gọi `image_gen` = một asset (hoặc một strip animation).
- Nền tách: phẳng `#FF00FF`; vật có hồng/tím/đỏ tươi thì `#00FF00`; vật có xanh lá thì giữ `#FF00FF`. Không bóng đổ xuống sàn, không chữ, không khung, vật nguyên vẹn, cách mép rộng.
- Xem ảnh trả về trước khi xử lý: đúng style neo? đúng góc nhìn? đọc được ở cỡ nhỏ? Sai thì sửa **một** điều trong prompt rồi tạo lại.
- Biến thể (kẻ địch đổi màu, trạng thái nút): sửa từ ảnh đã duyệt ("same subject, only change …") thay vì tạo mới.

## 3. Hậu xử lý
| Loại | Lệnh |
| --- | --- |
| Sprite, vật phẩm, icon, đạo cụ | `GA key raw.png --out tmp.png` → `GA fit tmp.png --out out.png --size 96x96 [--anchor center]` |
| Nhiều asset cùng bộ (cùng tỉ lệ) | `GA fit a.png b.png c.png --out row.png --size 96x96` rồi dùng từng file; hoặc `--each` nếu mỗi cái phải đầy khung |
| Animation (một ảnh có N tư thế xếp ngang) | `GA anim raw.png --frames 6 --size 64x64 --out strip.png --gif .gamekit/local/preview.gif`. Model vẽ sai số tư thế → lệnh báo lỗi; `--frames auto --pick 0,1,2,4,5,6` để chọn. `--anchor slot` giữ độ cao nhảy |
| Pixel art | `GA pixel raw.png --out out.png --size 32x32 --colors 16 [--palette "#hex,…"]` |
| Tile lặp (cỏ, đá, gạch) | `GA tile raw.png --out tile.png --size 64x64 --preview .gamekit/local/tile-3x3.png` — xem ảnh 3×3 |
| Nền, lớp parallax | Lớp xa (trời): `GA bg raw.png --out bg.png --size 1280x720 --seamless-x`. Lớp gần có chỗ trống: tạo trên nền key → `GA key` → `GA fit … --anchor bottom` |
| Kiểm | `GA check out.png --size 96x96 --alpha --key "#ff00ff"` · `GA sheet a.png b.png strip.png --out .gamekit/local/review.png` rồi `view_image` |

`key` đoán màu nền từ viền ảnh; viền còn ám màu → tăng `--soft`, vật bị khoét → giảm `--tol` hoặc tạo lại với màu nền khác.

## 4. Duyệt
- `GA sheet` mọi asset mới (nền ô cờ, sáng, tối) → `view_image`. Hỏi: cùng một tay vẽ không? nhận ra ở cỡ hiển thị nhỏ nhất không? địch/bạn/vật nhặt khác nhau bằng hình, không chỉ màu? animation đứng yên chân, không giật cỡ?
- Đưa người dùng duyệt đợt đầu (3–5 asset) trước khi làm hết.
- Báo cáo mỗi asset: đường dẫn file cuối, file prompt, ảnh raw đã dùng.

## 5. Trong game GameKit (thư mục có `game.yaml`)
- Cỡ lấy từ `asset-manifest.json`: `--size <width>x<height>`; anim: `--size <frames.width>x<frames.height>` và `--frames <frames.count>`; `alpha: true` → bắt buộc `key`. Đặt `make: image-gen`.
- `gamekit provenance add <file> --label generated --source "codex image_gen; art/prompts/<id>.md"`, rồi `gamekit validate`.
- Game làm lại của người khác (`third-party`): **không** đưa asset gốc trong `reference/` vào `image_gen` làm tham chiếu style hay để sửa; chỉ dùng ảnh neo style của chính game mới. Không tên/logo gốc trong prompt.
- Ghi style đã chọn và đường dẫn ảnh neo vào `DECISIONS.md`.
