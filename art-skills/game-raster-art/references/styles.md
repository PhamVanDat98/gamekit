# Style raster cho game

Mỗi style có một **dòng style** (tiếng Anh, chép nguyên văn vào prompt), thể loại hợp, màu nền tách nên dùng và lưu ý. Chọn một style cho cả game; khi đã có ảnh neo, ảnh neo quan trọng hơn dòng style.

Mô tả ảnh mẫu của người dùng bằng 6 mục: **nét viền** (không / mảnh / dày đều / run tay; màu), **cách tô** (phẳng / 2 tông cel / mềm / có chất liệu), **chất liệu** (màu nước, gouache, bút sáp, 3D, pixel), **palette** (tươi / pastel / trầm / neon), **góc nhìn** (ngang / 3/4 trên xuống / thẳng trên xuống / isometric), **tỉ lệ** (chibi 1:1–1:2 đầu/thân, cartoon 1:3, thường 1:6).

## sticker-cartoon — cartoon viền dày + viền trắng sticker
- Dòng style: `cute casual cartoon game art, thick dark brown outline plus a white sticker border around each object, flat cel shading with one shadow tone, soft pastel colors, chunky rounded shapes`
- Hợp: platformer, puzzle, casual mobile, idle. Nền: `pastel hand-painted sky and soft clouds, watercolor texture, lower contrast than the sprites` để vật nổi lên.
- Key: `#FF00FF` (viền trắng tách rất sạch).

## doodle-monster — doodle phẳng viền đen
- Dòng style: `playful doodle cartoon, flat solid colors with no gradients, bold uniform black ink outlines, simple blobby shapes, big expressive eyes, wide open mouths with small fangs, bright saturated palette`
- Hợp: party, casual, trẻ em, match-3, clicker. Đồ phụ: sao, chấm, mây viền đen.
- Key: `#00FF00` nếu nhân vật hồng/tím, còn lại `#FF00FF`.

## chibi-anime — chibi cel-shade
- Dòng style: `polished chibi anime game sprite, big head small body, large shiny eyes, clean lineart, soft cel shading with rim light, vibrant colors, high readability at small size`
- Hợp: RPG, gacha, idle, pet, nhập vai nhẹ. Vật phẩm: viền vàng kim, đá quý phát sáng.
- Key: `#FF00FF`; tránh khi nhân vật mặc hồng → `#00FF00`.

## Pixel art và voxel
Không làm bằng `image_gen`: pixel art dùng skill `pxl-pixel-art` (agent viết code, đúng lưới, đúng palette), voxel dùng skill `voxel-art`. Chỉ khi người dùng muốn model vẽ pixel thì tạo bằng `image_gen` rồi ép lưới bằng `GA pixel … --colors 16`.

## painted-fantasy — vẽ tay gouache/màu nước
- Dòng style: `hand-painted fantasy game art, gouache and watercolor texture, soft brush strokes, warm light from top left, storybook feel, clear silhouette`
- Hợp: phiêu lưu, cốt truyện, puzzle thư giãn, nền và minh hoạ. Sprite nhỏ nên thêm `subtle dark outline` để không chìm vào nền.
- Key: `#00FF00` (màu nước hay ngả hồng ở mép).

## clay-3d — 3D đất sét / đồ chơi
- Dòng style: `cute 3D render game asset, soft clay toy material, rounded bevelled shapes, soft studio lighting from top left, gentle ambient occlusion, pastel colors, orthographic view`
- Hợp: hypercasual, puzzle 3D giả, idle, merge. Ảnh nghiêng 3/4 nên ghi rõ góc để cả bộ cùng phối cảnh.
- Key: `#FF00FF`; yêu cầu `no ground shadow` vì bóng mềm khó tách.

## flat-vector — phẳng hypercasual
- Dòng style: `flat vector game art, geometric shapes, no outlines, two tones per object (base and darker side), bold saturated colors, minimal details, high contrast`
- Hợp: hypercasual, idle, đố vui, runner đơn giản.
- Key: `#FF00FF` (hoặc `#00FF00` nếu palette có hồng).

## neon-arcade — neon phát sáng
- Dòng style: `neon arcade game sprite, glowing bright lines on a dark body, synthwave colors cyan magenta yellow, strong bloom, sharp silhouette`
- Hợp: shooter, space, rhythm. Glow khó tách khỏi nền key: tạo trên **nền đen phẳng**, **không** chạy `key`; trong game vẽ với blend cộng (additive) để đen biến mất. Thân tàu cần tách thì tạo riêng trên nền key, glow là lớp riêng.

## dark-ink — mực tối, bóng dáng
- Dòng style: `dark ink silhouette game art, mostly black shapes with a few glowing accent colors, subtle texture, moody atmosphere, very readable silhouettes`
- Hợp: platformer khám phá, kinh dị nhẹ, puzzle bóng đổ.
- Key: `#FF00FF`; vật đen trên nền hồng tách rất sạch.

## Giữ đồng nhất cả bộ
- Một khung hình concept cho cả game (`art/style/frame.png`), đính kèm làm Image 1 ở mọi lần tạo; nhân vật đã duyệt làm Image 2 cho frame và biến thể của nó.
- Cùng góc nhìn, cùng hướng sáng (trên-trái), cùng độ dày viền trong mọi prompt.
- Cùng `--size`/tỉ lệ cho asset cùng loại (`GA fit` nhiều file một lần dùng chung tỉ lệ).
- Không ghép style: nền painterly với sprite sticker được (khác lớp), nhưng hai nhân vật khác style thì không.
