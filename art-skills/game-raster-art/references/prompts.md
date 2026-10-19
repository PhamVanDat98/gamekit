# Mẫu prompt cho image_gen

Viết prompt bằng tiếng Anh. Thay `<…>`. `STYLE` = dòng style trong `art/style/STYLE.md`. `KEY` = màu nền tách (`#FF00FF` hoặc `#00FF00`). Trước khi gọi `image_gen` có tham chiếu: `view_image` từng ảnh, rồi đánh số đúng vai trò.

Mọi prompt asset kết thúc bằng khối ràng buộc này:
```
Background: perfectly flat solid KEY color filling the whole canvas, for chroma key removal.
The subject must not contain KEY or colors close to it.
No ground shadow, no floor, no scenery, no text, no labels, no frame, no watermark, no logos.
Whole subject visible, centered, with wide empty margin on every side.
```

## Ảnh neo style (style tile)
```
Use case: stylized-concept
Asset type: game style tile for <thể loại game>
Primary request: a lineup of game assets in one consistent style, evenly spaced in one row: <nhân vật chính>, <một kẻ địch>, <một vật phẩm>, <một khối nền/platform>
Style/medium: STYLE
Composition/framing: side by side, same scale, same ground line, same camera angle (<side view | 3/4 top-down | isometric>)
+ khối ràng buộc
```
Tạo 2–3 phương án (đổi palette hoặc độ dày viền), đưa người dùng chọn.

## Nhân vật / kẻ địch (sprite đứng yên)
```
Input images: Image 1: style reference
Asset type: 2D game character sprite
Primary request: <mô tả: loài, trang phục, màu chính, tính cách>
Style/medium: match Image 1 exactly — STYLE
Composition/framing: full body, <side view facing right | front view>, neutral idle pose, feet on an invisible ground line
+ khối ràng buộc
```

## Animation (một strip, một lần gọi)
```
Input images: Image 1: approved character (identity reference); Image 2: style reference
Asset type: 2D sprite animation sheet
Primary request: exactly <N> poses of the SAME character from Image 1 in ONE horizontal row, left to right: <tư thế 1>, <tư thế 2>, … (<idle breathing | walk cycle | jump | attack | hit | death>)
Invariants: same character, same size in every pose, same facing direction, same palette, same outline; feet on the same ground line; poses evenly spaced and not touching
Style/medium: match Image 1
+ khối ràng buộc
```
Sau đó `GA anim raw.png --frames <N> …`. Model hay vẽ thừa/thiếu tư thế: `--frames auto` rồi `--pick`. Chu kỳ thường dùng: idle 4, walk 6–8, run 6, jump 4 (lấy đà, bay lên, đỉnh, rơi), attack 4–6, hit 2, death 4–6.

## Vật phẩm / icon
```
Input images: Image 1: style reference
Asset type: game <pickup item | inventory icon | power-up>
Primary request: <vật>, bold readable silhouette, one clear focal shape
Style/medium: match Image 1 — STYLE
Composition/framing: centered, 3/4 view, fills about 70% of the canvas
+ khối ràng buộc
```
Bộ icon: tạo từng cái nhưng cùng prompt khung, rồi `GA fit a.png b.png … --anchor center` để cùng tỉ lệ; xem chung một `GA sheet`.

## UI: nút, khung, thanh
```
Input images: Image 1: style reference
Asset type: game UI <button | panel frame | progress bar | badge>
Primary request: empty <rounded button | panel with ornate corners | horizontal bar frame>, NO text or icons inside, simple flat interior area
Style/medium: match Image 1 — STYLE
Composition/framing: front view, perfectly straight edges, symmetrical
+ khối ràng buộc
```
Trạng thái (hover/pressed/disabled): sửa từ nút đã duyệt — "same button, pressed state: slightly darker, shifted down". Khung 9-slice: góc trang trí, cạnh trơn để kéo giãn; cắt theo `nineSlice` của spec.

## Tile lặp
```
Asset type: seamless tileable game texture
Primary request: <cỏ | đá lát | gạch | cát | nước> seen from <directly above | the side>
Style/medium: STYLE
Constraints: seamless edges on all four sides, even lighting, no focal objects, no vignette, no text, no watermark
```
Không dùng nền key. Sau đó `GA tile … --preview` và xem ảnh 3×3.

## Nền / parallax
```
Input images: Image 1: style reference
Asset type: 2D side-scrolling game background, <far | mid | near> layer
Primary request: <bầu trời và mây | dãy núi | thành phố xa | cây và nhà gần>
Style/medium: match Image 1 — STYLE, lower contrast and saturation than the gameplay sprites
Composition/framing: wide panorama <16:9>, horizon at <1/3 from bottom>, empty center area for gameplay, no characters
Constraints: no text, no watermark
```
Lớp xa: `GA bg --seamless-x`. Lớp gần chỉ có vật ở đáy: thêm khối ràng buộc với KEY, rồi `GA key` + `GA fit --anchor bottom`.

## Hiệu ứng (VFX)
```
Asset type: 2D game effect sprite sheet
Primary request: exactly <N> frames of a <explosion | hit spark | dust puff | coin sparkle | magic burst> in ONE horizontal row, growing then fading
Style/medium: STYLE, bold shapes, readable at small size
+ khối ràng buộc (hiệu ứng phát sáng: nền đen phẳng thay cho KEY, dùng blend cộng trong game)
```
`GA anim raw.png --frames <N> --anchor center --size 64x64 …`.
