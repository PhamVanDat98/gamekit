---
name: replace-graphics
description: Dùng ở P3 khi làm lại game người khác (third-party) để thay đồ hoạ — chọn cách làm từng asset theo `make` trong asset-manifest.json (image-gen qua Codex không API key, pixel-code, voxel-code, vector cho UI, licensed), rút asset từ khung hình concept để ghép vào game vẫn giống concept, xuất đúng spec, gắn nhãn provenance và kiểm bằng validate.
---

# Thay đồ hoạ (P3, `third-party`)

Đầu vào: style người dùng đã chọn (ghi trong `DECISIONS.md`) và `asset-manifest.json` (mỗi asset có `kind`, kích thước, `frames`, `alpha`, `brief`). Đầu ra: file đúng `path` của spec, nhãn trong `provenance.json`, `gamekit validate` sạch. Asset gốc trong `reference/` chỉ để xem bố cục và kích thước, không tô lại, không trace.

## 1. Chọn cách làm (`make`)
Hai luật (chi tiết và rà soát công cụ: [công cụ](references/art-tools.md)): **không dùng API key** — ảnh tạo bằng `image_gen` của Codex (ngoài Codex: Codex CLI); **agent chỉ tự vẽ bằng code khi là pixel art hoặc voxel**.

| `make` | Hợp với | Công cụ |
| --- | --- | --- |
| `image-gen` | Mọi style ảnh: cartoon, sticker, chibi anime, vẽ tay, 3D, phẳng, neon… — nhân vật, kẻ địch, vật phẩm, icon, logo, nền, hiệu ứng | skill **`game-raster-art`** (`art-skills/`) |
| `pixel-code` | Pixel art | [pxl](references/pxl.md) |
| `voxel-code` | Voxel (khối lập phương, isometric) | skill **`voxel-art`** (`art-skills/`) |
| `vector` | UI dựng trong DOM bằng CSS/SVG đơn giản (nút, khung, thanh) | code UI |
| `licensed` | Gói asset có giấy phép | `provenance add … --label licensed --license …` |

Một game dùng **một** cách chính cho đồ hoạ màn chơi; UI CSS đi kèm được. Ghi lựa chọn vào `DECISIONS.md`.

### Người dùng đưa ảnh mẫu style
Pixel art → `pixel-code`; voxel → `voxel-code`; mọi ảnh mẫu khác → `image-gen`: mô tả ảnh mẫu bằng 6 mục trong `styles.md` của `game-raster-art`, chọn dòng style gần nhất. Ảnh mẫu lấy từ game người khác chỉ để học style (viền, palette, tỉ lệ); không chép nhân vật, bố cục hay chi tiết nhận diện, và không đính kèm nó vào `image_gen`.

## 2. Concept trước, asset rút từ concept
1. Tạo **khung hình concept** — ảnh chụp màn hình giả của chính game, đúng tỉ lệ màn hình, nhân vật/kẻ địch/vật phẩm/HUD đúng cỡ hiển thị (pixel/voxel: một cảnh dựng từ asset thật). Người dùng chọn → `art/style/frame.png`.
2. Asset rút từ khung hình đó (`image-gen`: đính kèm frame làm Image 1 ở mọi lần tạo, nền sửa từ chính frame); không vẽ lại từ mô tả chữ — vẽ lại là nguồn chính của chuyện "concept một kiểu, ghép vào một kiểu".
3. Làm 3–5 asset tiêu biểu trước → **ghép thử vào cảnh** bằng `gameart.py compose` rồi `gameart.py compare` với frame → người dùng xem ảnh so sánh → sửa tới khi khớp, rồi mới làm phần còn lại.
4. Mỗi asset đọc `brief` và tín hiệu gameplay nó mang (nguy hiểm, nhặt được, trạng thái): phải nhận ra được khi tắt tiếng và ở `minDisplayPx`.

## 3. Hậu xử lý
- `image-gen`: theo `game-raster-art` — `key` (tách nền), `fit` (đúng cỡ, cùng tỉ lệ, neo giữa-đáy), `anim` (strip một lần gọi), `split` (tấm nhiều asset), `grade` (khớp màu với frame).
- `pixel-code`/`voxel-code`: xuất đúng cỡ từ công cụ, không co giãn ảnh.
- Không có chữ trong ảnh (`noText`): chữ đi qua `t()`.

## 4. Đưa vào game
- File theo `path` của spec. Nguồn để dựng lại (`.px.js`, `.vox.py`, prompt, `art/style/frame.png`) commit trong `art/`; ảnh nháp, preview để trong `.gamekit/local/`.
- `gamekit provenance add <file|thư mục> --label generated --source <file nguồn hoặc tên công cụ>`; gói mua dùng `licensed`.
- `view/` vẽ đúng tỉ lệ; pixel art và voxel phóng to theo số nguyên, tắt làm mịn (xem [pxl](references/pxl.md)).

## 5. Kết thúc
`gamekit validate` (kích thước, alpha khớp spec) · `npm test` · chạy `npm run dev` xem từng màn · không còn file nhãn `reference` trong `assets/`, `public/`. Báo người dùng để họ tick mục "(bạn)" ở `gates/P3.md`.
