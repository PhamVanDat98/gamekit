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

## 5. Animation Codex vẽ từng frame (canvas + pose)
Chuẩn bị (cùng `--frames` và `--cell` để các ô khớp nhau):
```bash
GA pose   --anim walk --frames 6 --cell 128x128 --out art/raw/walk-pose.png --gif .gamekit/local/walk-pose.gif
GA canvas --seed assets/gfx/hero.png --frames 6 --cell 128x128 --out art/raw/walk-canvas.png
```
`--anim`: `idle`, `walk`, `run`, `jump`, `attack`, `hit`, hoặc `keys.json` (định dạng như `rig`). Xem GIF của dải tư thế trước: chuyển động sai thì sửa ở đây, đừng mong model tự sửa. Nhân vật đầu to: `--proportions chibi`.
```
Input images: Image 1: edit target — a strip of 6 equal slots; slot 1 already holds the approved character; Image 2: pose guide — one stick figure per slot (orange/red = FRONT arm and leg, blue = BACK arm and leg; the gray dot shows the facing side); Image 3: approved style frame (style only)
Primary request: fill slots 2–6 of Image 1 with the SAME character from slot 1, each slot copying the pose of the matching stick figure in Image 2; keep slot 1 unchanged
Invariants: identical character in every slot — same face, hair, outfit, colors, outline thickness, proportions and size as slot 1; feet on the same ground line as slot 1; each character centered in its slot, nothing crossing into a neighboring slot
Background: keep the flat KEY color of Image 1 everywhere outside the characters
Constraints: no stick figures, guide lines, slot borders, numbers, text, shadows or floor in the output
```
Trong Codex: `view_image` canvas, pose, frame rồi gọi `image_gen` (sửa Image 1). Ngoài Codex: `GA gen --prompt-file art/prompts/hero-walk.md --ref art/raw/walk-canvas.png --ref art/raw/walk-pose.png --ref art/style/frame.png --out art/raw/hero-walk-v1.png`.

Sau đó:
```bash
GA anim raw.png --frames 6 --slots --anchor slot --lock-first assets/gfx/hero.png --size 64x64 --out walk.png --gif .gamekit/local/walk.gif
GA inspect walk.png --frames 6 --ref assets/gfx/hero.png
```
Frame bị `inspect` đánh dấu (hoặc mắt thấy sai chân): sửa **từ sprite đã duyệt**, không từ frame trước — "Image 1: approved character; Image 2: one stick figure. Redraw the character from Image 1 in exactly the pose of Image 2, same size, facing right" + [KEY-BLOCK] → `GA replace walk.png --frames 6 --frame <K> --with fixed-raw.png --out walk.png` (tách nền, khớp cỡ và đường chân với các frame khác) → chạy lại `inspect`.

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

## 9. Bộ phận để rig (animation cắt rời)
```
Input images: Image 1: approved sprite of this character; Image 2: approved style frame
Asset type: cut-out animation parts sheet
Primary request: the character from Image 1, side view facing right, separated into body parts laid out apart in one row: head, torso, front arm, back arm, front leg, back leg<, tail, weapon>
Invariants: identical design, colors, outline and scale to Image 1; each part complete with the hidden area painted in (shoulder and hip ends rounded so they rotate cleanly); arms and legs straight and hanging down
+ [KEY-BLOCK]
```
`GA split parts-raw.png --out-dir parts --index .gamekit/local/parts-index.png --names head,body,arm_front,arm_back,leg_front,leg_back` (theo thứ tự trong ảnh index), rồi viết `rig.json` (SKILL.md §3b) và `GA rig rig.json --anim idle --gif …`. Muốn tay sau/chân sau tối hơn một chút (cho có chiều sâu): thêm "back arm and back leg slightly darker" vào prompt.
