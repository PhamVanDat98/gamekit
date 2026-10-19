---
name: voxel-art
description: Dựng asset game voxel bằng code (model là file Python gọi box/sphere/cylinder/layer/mirror) rồi render sprite isometric pixel-perfect 1–4 hướng, strip animation, và xuất .vox để mở trong MagicaVoxel. Dùng khi game chọn style voxel (khối lập phương kiểu Crossy Road, Minecraft, isometric voxel) — đây là một trong hai loại art agent tự vẽ bằng code (cùng pixel art); mọi style khác tạo bằng Codex image_gen.
---

# Voxel art bằng code

`VX` = `python3 <thư mục skill này>/scripts/voxel.py` (cần Pillow). Mở `examples/` trước khi viết model đầu tiên: `crate.vox.py` (hộp rỗng, nẹp), `tree.vox.py` (tầng lá, đốm màu), `knight.vox.py` (nhân vật chibi, mirror).

## Model
```python
PALETTE = {"a": "#b8c4d6", "A": "#7d8aa3", "k": "#23202e"}   # mỗi vật liệu 2–3 tông
SIZE = (12, 10, 18)        # x phải, y từ mặt trước (y = 0 quay về người xem) ra sau, z lên
FRAMES = 1                 # > 1: build(v, frame) được gọi cho từng frame
def build(v, frame=0):
    v.box(2, 2, 2, 6, 7, 7, "a")       # nửa-mở: x 2..5
    v.mirror_x()                        # vẽ nửa trái, chép sang phải
```
API đầy đủ và mẹo: [api.md](references/api.md).

## Quy trình
1. **Chốt thang đo** cho cả game, ghi vào `art/style/STYLE.md`: cỡ voxel trên màn hình (`--px`, mặc định 4 → mỗi voxel rộng 8 px), chiều cao nhân vật chính bằng voxel (vd 16–20), palette chung, có viền ngoài hay không (`--outline "#1b1630"`). Mọi model dùng cùng `--px` để đặt cạnh nhau đúng tỉ lệ; **không bao giờ co giãn** ảnh voxel đã render (mất nét pixel), muốn to hơn thì tăng `--px` hoặc `--scale` số nguyên.
2. **Viết model** `art/voxel/<id>.vox.py`. Hình khối lớn trước (`box`, `ellipsoid`, `cylinder`), rồi khoét (`None`), rồi chi tiết (`set`, `layer`), cuối cùng biến màu bề mặt (`speckle`, `recolor`). Vật đối xứng: vẽ nửa trái + `mirror_x()` rồi thêm chi tiết lệch.
3. **Xem**: `VX sheet art/voxel/*.vox.py --out .gamekit/local/voxel-sheet.png --outline "#1b1630"` → mở ảnh (4 hướng, phóng to). Kiểm: nhận ra ở cỡ thật? mặt trước (hướng 0) đúng? khối có quá phẳng (thiếu tông tối) không?
4. **Xuất**: `VX render art/voxel/hero.vox.py --out assets/gfx/hero.png --canvas 64x80 --outline "#1b1630"`. Nhiều hướng: `--dirs 4` (strip ngang, thứ tự 0–3). Animation: `FRAMES = n` → strip ngang n frame (với `--dirs`: mỗi hàng một hướng).
5. **Sửa tiếp bằng tay** (tuỳ chọn): `VX export art/voxel/hero.vox.py --out art/voxel/hero.vox` → MagicaVoxel.

## Animation
Trong `build(v, frame)` đổi vài khối theo `frame`: nhún = `v.shift(dz=-1, where=lambda x, y, z: z >= 7)` ở frame lẻ; bước chân = đổi chiều cao hai khối chân; xoay vật phẩm = dùng `--dirs 4` làm 4 frame quay. Giữ chân/đế ở z = 0 để đáy các frame thẳng hàng (render đặt đáy-giữa).

## Trong game GameKit
- `make: voxel-code` trong `asset-manifest.json`; `--canvas <width>x<height>` đúng spec (anim: `<frames.width>x<frames.height>`, số frame = `FRAMES` hoặc số hướng).
- Model `.vox.py` commit trong `art/voxel/`; `gamekit provenance add <png> --label generated --source art/voxel/<id>.vox.py`.
- Hiển thị: phóng to theo số nguyên, tắt làm mịn (`image-rendering: pixelated`, `imageSmoothingEnabled = false`), như pixel art.
