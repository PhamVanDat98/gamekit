# Mẫu prompt cho image_gen

Viết prompt bằng tiếng Anh, lưu vào `art/prompts/<id>.md`. Thay `<…>`. `STYLE` = dòng style trong `art/style/STYLE.md`. `KEY` = màu nền tách (`#FF00FF`, hoặc `#00FF00` khi vật có hồng/tím). Ảnh tham chiếu đánh số đúng thứ tự đính kèm: trong Codex `view_image` từng ảnh trước; ngoài Codex `GA gen --prompt-file art/prompts/<id>.md --ref <Image 1> --ref <Image 2> --out art/raw/<id>-v1.png`.

Khối ràng buộc cho mọi asset tách nền (gọi tắt **[KEY-BLOCK]**):
```
Background: perfectly flat solid KEY color filling the whole canvas, for chroma key removal.
The subject must not contain KEY or colors close to it.
No ground shadow, no floor, no scenery, no text, no labels, no frame, no watermark, no logos.
Every subject fully visible with a wide empty margin; subjects never touch each other.
```

## 1. Khung hình concept (style frame)
```
Use case: stylized-concept
Asset type: in-game screenshot mockup of a <thể loại> game, <1280x720 landscape | 720x1280 portrait>
Primary request: a real gameplay moment: <nhân vật chính> <đang làm gì> on <nền/màn chơi>, <2–3 kẻ địch>, <vật phẩm>, HUD with <điểm, máu…> in the corners
Style/medium: STYLE
Composition/framing: <side view | 3/4 top-down | isometric> game camera; sprites at their real on-screen size (hero about <N>% of screen height); clear gameplay readability; HUD inside safe margins
Lighting/mood: one light from the top left, same on every object
Constraints: no real game logos or characters, no watermark; HUD text only as simple placeholder numbers
```
Tạo 2–3 phương án (đổi palette hoặc độ dày viền), đưa người dùng chọn → `art/style/frame.png`.

## 2. Nền từ khung hình
```
Input images: Image 1: approved style frame (edit target)
Primary request: remove every character, enemy, item, effect and HUD element from Image 1 and fill those areas with the background that would be behind them
Invariants: keep the background's composition, colors, lighting and texture exactly; same aspect ratio
Constraints: no text, no watermark
```
Parallax: thêm "split into the <far sky | mid hills | near ground> layer only; everything else flat KEY" + [KEY-BLOCK] cho lớp không phải lớp xa nhất.

## 3. Một tấm nhiều asset rút từ khung hình
```
Input images: Image 1: approved style frame (style and design reference)
Asset type: game sprite sheet for extraction
Primary request: recreate exactly as they appear in Image 1, each one separately: <hero>, <enemy A>, <enemy B>, <coin>, <heart>
Invariants: identical designs, colors, outline thickness and shading to Image 1; same light direction; same relative sizes as in Image 1
Composition/framing: one row (or an evenly spaced grid), left to right in the order listed, generous gaps between subjects, each subject complete
+ [KEY-BLOCK]
```
→ `GA split … --index …`, kiểm thứ tự trong ảnh index, rồi `--names`.

## 4. Một asset rút từ khung hình
```
Input images: Image 1: approved style frame
Asset type: 2D game sprite
Primary request: the <vật> exactly as it appears in Image 1, alone, <side view facing right | front view>, neutral pose
Invariants: identical design, colors, outline thickness, shading and proportions to Image 1
Detail level: readable at <cỡ hiển thị> px — outline at least <2> px at that size, no details smaller than 1/16 of the sprite
+ [KEY-BLOCK]
```
Asset chưa có trong frame (kẻ địch mới): giữ Image 1 làm style, mô tả vật mới, thêm "drawn by the same artist in the same style as Image 1".

## 5. Animation
```
Input images: Image 1: approved style frame (style); Image 2: approved sprite of this character (identity)
Asset type: 2D sprite animation sheet
Primary request: exactly <N> poses of the character in Image 2 in ONE horizontal row, left to right: <tư thế 1>, <tư thế 2>, …
Invariants: same character as Image 2, same size in every pose, same facing direction, same palette and outline; feet on one ground line; poses evenly spaced, not touching
+ [KEY-BLOCK]
```
`GA anim raw.png --frames <N> …`; sai số tư thế → `--frames auto --pick`. Chu kỳ: idle 4, walk 6–8, run 6, jump 4 (lấy đà, bay, đỉnh, rơi), attack 4–6, hit 2, death 4–6.

## 6. Vật phẩm, icon, UI
```
Input images: Image 1: approved style frame
Asset type: game <pickup | inventory icon | UI button | panel frame | progress bar>
Primary request: <vật>; UI pieces EMPTY — no text or icons inside, simple flat interior
Style/medium: match Image 1 — STYLE
Composition/framing: centered, <3/4 view | front view, perfectly straight edges, symmetrical>
+ [KEY-BLOCK]
```
Trạng thái nút (hover/pressed/disabled): sửa từ nút đã duyệt — "same button, pressed state: slightly darker, shifted down".

## 7. Tile lặp
```
Input images: Image 1: approved style frame (match the <ground> texture)
Asset type: seamless tileable game texture
Primary request: <ground material from Image 1> seen from <directly above | the side>
Constraints: seamless edges on all four sides, even lighting, no focal objects, no vignette, no text, no watermark
```
Không dùng KEY. `GA tile … --preview` và xem ảnh 3×3.

## 8. Hiệu ứng
```
Input images: Image 1: approved style frame
Asset type: 2D game effect sprite sheet
Primary request: exactly <N> frames of a <explosion | hit spark | dust puff | coin sparkle> in ONE horizontal row, growing then fading, in the style of Image 1
+ [KEY-BLOCK] (hiệu ứng phát sáng: nền đen phẳng thay cho KEY, dùng blend cộng trong game)
```
`GA anim raw.png --frames <N> --anchor center --size 64x64 …`.
