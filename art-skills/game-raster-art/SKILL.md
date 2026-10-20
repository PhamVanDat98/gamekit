---
name: game-raster-art
description: Tạo asset game raster (nhân vật, kẻ địch, vật phẩm, icon, UI, tile, nền/parallax, hiệu ứng, animation) bằng image_gen của Codex — không cần API key — rồi hậu xử lý thành file dùng được trong game: tách nền trong suốt, đúng cỡ, cùng tỉ lệ và điểm neo, ảnh cho animation (sprite, bộ phận để rig, frame Codex vẽ theo dải tư thế — chuyển động do skill game-animation), tile liền mạch. Asset được rút ra từ một khung hình concept đã duyệt để ghép vào game vẫn giống concept. Dùng khi làm art game theo style ảnh (cartoon, sticker, anime, vẽ tay, 3D render, phẳng, neon — pixel art và voxel thì dùng skill vẽ bằng code), hoặc khi người dùng đưa ảnh mẫu style và muốn asset giống như vậy.
---

# Art game raster bằng Codex

`GA` = `python3 <thư mục skill này>/scripts/gameart.py` (cần Pillow: `python3 -m pip install pillow`).

## Luật nguồn ảnh
- **Không dùng API key.** Không gọi `scripts/image_gen.py` của skill `imagegen` (cần `OPENAI_API_KEY`), không dùng dịch vụ cần key/token (Gemini, fal, Replicate, PixelLab, Retro Diffusion, Scenario…).
  - Trong Codex: công cụ `image_gen` có sẵn (đăng nhập ChatGPT).
  - Ngoài Codex (Claude Code, script, CI): `GA gen` — gọi Codex CLI (`codex exec`) trên chính tài khoản ChatGPT đã `codex login`. Cài: `npm i -g @openai/codex` rồi `codex login`.
- **Agent không tự vẽ art bằng code** cho style ảnh: chỉ pixel art (skill `pxl-pixel-art`) và voxel (skill `voxel-art`) được vẽ bằng code. Mọi style khác đi qua `image_gen`/`GA gen`.

## 0. Thư mục
| Gì | Ở đâu |
| --- | --- |
| Khung hình concept đã duyệt + mô tả style | `art/style/frame.png`, `art/style/STYLE.md` (commit) |
| Prompt từng lần tạo | `art/prompts/<id>.md` (commit; prompt cuối cùng đã dùng + ảnh tham chiếu) |
| Ảnh gốc từ model | `art/raw/<id>-v<N>.png` (game GameKit: `.gamekit/local/raw/`); ảnh Codex lưu ở `$CODEX_HOME/generated_images/…` — luôn chép ra |
| Asset cuối | đường dẫn game dùng (GameKit: `path` trong `asset-manifest.json`) |

## 1. Concept là một khung hình trong game, không phải tranh minh hoạ
Concept vẽ kiểu poster (to, ánh sáng điện ảnh, nền bận) rồi tạo từng asset riêng sẽ **luôn lệch**: khác nét viền, khác ánh sáng, khác tỉ lệ, mất chi tiết khi thu nhỏ. Vì vậy:
1. Chọn dòng style trong [styles.md](references/styles.md) (hoặc mô tả ảnh mẫu của người dùng bằng 6 mục ở đó).
2. Tạo **khung hình concept** (style frame) theo mẫu trong [prompts.md](references/prompts.md): một ảnh chụp màn hình giả của chính game, đúng tỉ lệ màn hình (vd 16:9 hoặc 9:16), nhân vật/kẻ địch/vật phẩm/nền/HUD **đúng cỡ hiển thị thật** và đúng góc camera. 2–3 phương án → người dùng chọn → lưu `art/style/frame.png`.
3. Viết `art/style/STYLE.md`: dòng style, palette (lấy màu từ frame), độ dày viền tính theo px ở cỡ hiển thị, hướng sáng, góc nhìn, cỡ hiển thị từng loại asset (đo trên frame).

## 2. Rút asset từ khung hình (đừng vẽ lại từ đầu)
Mọi lần tạo đều đính kèm `art/style/frame.png` là **Image 1** (Codex: `view_image` trước; `GA gen --ref art/style/frame.png`).
- **Nền**: sửa từ frame — "remove every character, item and HUD element from Image 1, keep the background exactly" → `GA bg … --size <màn hình>`. Nền trùng khớp concept vì chính là concept.
- **Nhân vật, kẻ địch, vật phẩm**: "recreate the <vật> exactly as it appears in Image 1 — same design, colors, outline thickness, shading — alone on a flat KEY background". Gom nhóm cùng loại vào **một tấm** (mọi kẻ địch một lần gọi) để chúng cùng một lượt vẽ → `GA split tấm.png --out-dir … --index index.png` (xem `index.png` để biết thứ tự rồi `--names`).
- **Animation**: xem mục 3b — đừng bắt `image_gen` vẽ từng frame.
- Nhắc trong prompt độ dày viền và mức chi tiết ở **cỡ hiển thị**: asset 64 px thì viền ≥ 2 px sau khi thu nhỏ, không chi tiết nhỏ hơn ~1/16 cạnh.

## 3. Hậu xử lý
| Loại | Lệnh |
| --- | --- |
| Sprite, vật phẩm, icon | `GA key raw.png --out k.png` → `GA fit k.png --out out.png --size 96x96 [--anchor center]` |
| Tấm nhiều asset | `GA split sheet.png --out-dir parts --index .gamekit/local/index.png --names hero,slime,bat` |
| Khớp màu với concept | `GA grade parts/hero.png --ref art/style/frame.png --ref-box <x,y,w,h của hero trên frame> --out-dir graded` (`--strength 0.4–1`; luôn chọn vùng của đúng vật đó, so với cả khung hình sẽ kéo vật về màu nền) |
| Pixel art do model vẽ | `GA pixel raw.png --out out.png --size 32x32 --colors 16 [--palette "#hex,…"]` |
| Tile lặp | `GA tile raw.png --out tile.png --size 64x64 --preview .gamekit/local/tile-3x3.png` |
| Nền, parallax | `GA bg raw.png --out bg.png --size 1280x720 [--seamless-x]`; lớp gần có chỗ trống: tạo trên KEY → `GA key` → `GA fit --anchor bottom` |

`key` đoán màu nền từ viền ảnh; viền còn ám màu → tăng `--soft`; vật bị khoét → giảm `--tol` hoặc tạo lại với màu nền khác.

## 3b. Animation
`image_gen` là model ảnh tĩnh: mỗi frame nó **vẽ lại** nhân vật, nên dải nhiều frame bị trôi mặt, trôi cỡ, trôi trang phục. Chuyển động thiết kế bằng skill **`game-animation`** (khung xương + keyframe theo từng dự án, `AN` = `python3 <game-animation>/scripts/animate.py`); skill này lo phần ảnh:

| Cách | Ảnh từ `image_gen` | Chuyển động |
| --- | --- | --- |
| **tween** — vật thể, quái một khối, vật phẩm | một sprite đã duyệt | `AN tween sprite.png --anim <anim.json> --size … --out …` |
| **rig** — nhân vật có tay chân, cánh, đuôi | bộ phận cắt rời vẽ một lần (mẫu §9 prompts.md) → `GA split` | `AN rig rig.json --anim <anim.json> --size … --out …` |
| **Codex vẽ từng frame** — cần nét vẽ tay khác nhau mỗi frame | Codex *sửa* `GA canvas` (frame đã duyệt sẵn ở ô 1) nhìn dải tư thế `AN pose` (mẫu §5 prompts.md) → `GA anim --slots --anchor slot --lock-first` → `GA inspect` → `GA replace` frame hỏng | `AN pose <anim.json> --cell 128x128 --out pose.png` |
| Video (tuỳ chọn, **trả phí**) | agent-sprite-forge `video2dsprite` qua Grok CLI đăng nhập tài khoản có gói trả phí (SuperGrok hoặc X Premium+; video miễn phí đã bị bỏ từ 3/2026), không API key; chưa kiểm được trong GameKit | — |
| Pixel art, voxel | vẽ bằng code: pxl `anim(...)`, voxel-art `FRAMES` | — |

`canvas` và `pose` phải cùng `--frames`/`--cell` để các ô khớp nhau (cùng hình học: ô ~1536 px, đường đất ở 92 % chiều cao).

## 4. Ghép thử và so với concept (bắt buộc trước khi giao)
1. Viết `art/style/layout.json`: vị trí và cỡ từng asset như trong game (số px của game):
   ```json
   {"size": [1280, 720], "items": [
     {"file": "../../assets/gfx/hero.png", "x": 300, "y": 560, "anchor": "bottom"},
     {"file": "../../assets/gfx/slime-idle.png", "frames": 4, "frame": 0, "x": 760, "y": 560}]}
   ```
2. `GA compose --bg assets/gfx/bg.png --layout art/style/layout.json --out .gamekit/local/mock.png`
3. `GA compare art/style/frame.png .gamekit/local/mock.png --out .gamekit/local/compare.png` → `view_image` ảnh so sánh. Lệnh in độ lệch màu ΔE (< 5 giống, > 10 lệch rõ) và trả mã lỗi khi lệch.
4. Lệch thì sửa đúng chỗ: màu → `GA grade`; một asset khác nét/khác tỉ lệ → tạo lại asset đó từ frame; cỡ → sửa `--size` theo số đo trên frame. Đưa người dùng xem ảnh so sánh của đợt đầu (3–5 asset) trước khi làm hết.

## 5. Kiểm từng file
`GA check out.png --size 96x96 --alpha --key "#ff00ff"` · `GA sheet a.png b.png strip.png --out .gamekit/local/review.png` (nền ô cờ / sáng / tối). Báo cáo mỗi asset: file cuối, file prompt, ảnh raw.

## 6. Trong game GameKit (thư mục có `game.yaml`)
- Cỡ lấy từ `asset-manifest.json`: `--size <width>x<height>`; anim `--size <frames.width>x<frames.height>`, `--frames <frames.count>`; `alpha: true` → bắt buộc `key`. `make: image-gen`.
- `gamekit provenance add <file> --label generated --source "codex image_gen; art/prompts/<id>.md"`, rồi `gamekit validate`.
- Game làm lại của người khác (`third-party`): **không** đưa asset gốc trong `reference/` vào `image_gen` làm tham chiếu hay để sửa; chỉ dùng khung hình concept của chính game mới. Không tên/logo gốc trong prompt.
- Ghi style đã chọn và đường dẫn khung hình concept vào `DECISIONS.md`.
