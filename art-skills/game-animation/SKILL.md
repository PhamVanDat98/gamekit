---
name: game-animation
description: Animation 2D cho game khai báo bằng dữ liệu, dùng cho mọi loại nhân vật và chuyển động của từng dự án — người, thú bốn chân, chim, cá, rắn, quái, vật thể, hay khung xương tự định nghĩa. Mỗi dự án có khung xương (*.skeleton.json) và animation (*.anim.json) riêng: keyframe có easing, sóng cho đuôi/tóc/cánh/thân, IK hai khúc cho chân đặt lên điểm; người đi/chạy/nhảy lấy từ motion capture thật (BVH) cho tự nhiên. Cùng một file cho ra dải tư thế để model vẽ từng frame, animation cắt rời từ ảnh bộ phận, chuyển động cả sprite, GIF xem thử và dữ liệu cho game tự chạy. Dùng khi cần thiết kế hoặc làm animation cho nhân vật/vật thể game.
---

# Animation game bằng dữ liệu

`AN` = `python3 <thư mục skill này>/scripts/animate.py` (Python 3.9+, Pillow). Định dạng file: [format.md](references/format.md). Cách tự viết animation mới: [authoring.md](references/authoring.md).

## Quy trình cho một dự án
1. **Liệt kê động tác cần** cho từng nhân vật/vật thể (từ gameplay, `asset-manifest.json` nếu là game GameKit): tên, lặp hay một lần, số frame, fps, dùng để làm gì trong game.
2. **Chọn khung xương**: `AN library` xem mẫu (humanoid, humanoid-chibi, quadruped, bird, fish, snake, sprite). Gần giống → `AN new humanoid/walk --out art/anim/hero/` chép mẫu + khung xương về dự án. Khác hẳn (nhện 8 chân, xe, cánh cửa, xúc tu…) → viết `*.skeleton.json` mới theo [format.md](references/format.md).
3. **Viết một câu brief** cho từng động tác trước khi đặt key (lực từ đâu, nhịp chuẩn bị → hành động → theo đà → hồi, tư thế nào phải đọc được) — xem [authoring.md](references/authoring.md).
4. **Lấy chuyển động**:
   - Người đi, chạy, nhảy, động tác đặc biệt (múa, vẫy tay, ngã…): **ưu tiên mocap** — chuyển động thật tự nhiên hơn keyframe tay. Mẫu `humanoid/walk`, `run`, `jump`, `zombie-walk` đã là mocap. Cần động tác khác: tải BVH (nguồn và giấy phép trong [authoring.md](references/authoring.md#mocap)) rồi `AN mocap clip.bvh --cycle --out art/anim/hero/sneak.anim.json` (vòng lặp) hoặc `--once --start <frame> --end <frame>` (một lần); `--skeleton humanoid-chibi.skeleton.json` cho chibi.
   - Còn lại (quái, thú, vật thể, động tác cách điệu): viết/sửa `art/anim/<nhân vật>/<động tác>.anim.json` — tư thế chính trước (keyframe), rồi sóng cho phần mềm (đuôi, tóc, cánh), IK cho chân chạm đất.
5. **Xem và sửa**: `AN preview <anim> --out .gamekit/local/<tên>.gif` → xem GIF **ở tốc độ thật, ít nhất 3 vòng**, rồi dải PNG để soi từng frame; `AN check <anim>` báo chỗ giật. Chuyển động "cứng", "trôi", "như rối" → bảng bệnh → cách sửa trong [authoring.md](references/authoring.md). Đưa người dùng xem GIF người que trước khi tốn công vẽ.
6. **Ra asset** (chọn một):

| Cách | Khi nào | Lệnh |
| --- | --- | --- |
| **tween** — cả sprite đã duyệt chuyển động | Vật thể, quái một khối, vật phẩm, nút: nhún, nảy, lắc, xoay, đập nhịp, rung | `AN tween hero.png --anim art/anim/hero/hop.anim.json --size 96x96 --out assets/gfx/hero-hop.png --gif …` |
| **rig** — ảnh bộ phận gắn vào xương | Nhân vật có tay chân/cánh/đuôi; nhiều động tác dùng chung một bộ ảnh; nét không trôi | `AN rig art/anim/hero/rig.json --anim art/anim/hero/walk.anim.json --size 64x64 --out assets/gfx/hero-walk.png --gif …` |
| **pose** — dải người que gửi model vẽ từng frame | Cần nét vẽ tay khác nhau từng frame (tóc, áo bay, biến hình) | `AN pose art/anim/hero/walk.anim.json --cell 128x128 --out art/raw/walk-pose.png` → skill `game-raster-art` (canvas, `anim --lock-first`, `inspect`) |
| **bake** — dữ liệu xương từng frame | Game tự vẽ bộ phận lúc chạy (nhẹ, mượt ở mọi fps) | `AN bake art/anim/hero/walk.anim.json --out assets/anim/hero-walk.json` |

`rig.json`: mỗi ảnh bộ phận đi theo một xương (cùng tên, hoặc `"bone"`), vẽ đúng tư thế nghỉ của khung xương (tay chân buông thẳng):
```json
{"parts": {"torso": {"file": "parts/torso.png"}, "head": {"file": "parts/head.png"},
           "thigh_front": {"file": "parts/thigh.png"}, "shin_front": {"file": "parts/shin.png"},
           "thigh_back": {"file": "parts/thigh_back.png"}, "shin_back": {"file": "parts/shin_back.png"}}}
```
Khớp xoay mặc định ở mép ảnh phía xương bắt đầu (tay chân buông xuống: giữa mép trên); sai thì thêm `"pivot": [x, y]` (pixel trong ảnh bộ phận). Xương không có ảnh vẫn tính (IK, vị trí con) nhưng không vẽ. Ảnh bộ phận do model vẽ: mẫu §9 trong `game-raster-art/references/prompts.md`.

## Luật
- Một khung xương cho mỗi nhân vật; mọi động tác của nó dùng chung khung đó (đổi khung là đổi mọi animation).
- Animation tại chỗ: nhân vật không trôi ngang — game dời vị trí bằng code; chân chạm đất bằng IK, mặt đất ở `y = 0`.
- `check` sạch trước khi ra asset; người que phải đẹp trước, ảnh thật không cứu được chuyển động sai. `check` sạch chưa chứng minh là đẹp — chỉ mắt xem ở tốc độ thật mới duyệt được.
- Animation lấy từ mocap: ghi nguồn và giấy phép của file BVH vào `art/anim/SOURCES.md` (GameKit: thêm `provenance`).
- Kích thước ra lấy từ spec (GameKit: `frames.width × frames.height`, `frames.count` = `frames` trong file animation, `fps` khớp `frames.fps`).
- File `.skeleton.json`, `.anim.json`, `rig.json` commit trong `art/anim/`; GIF xem thử để trong `.gamekit/local/`.
