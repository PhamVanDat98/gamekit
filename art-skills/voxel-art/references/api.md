# API model voxel

Toạ độ nguyên. `x` sang phải, `y` từ mặt trước (0, quay về người xem ở hướng 0) ra sau, `z` lên. Khối nửa-mở: `box(0,0,0, 4,4,4)` phủ x, y, z = 0..3. Màu là khoá trong `PALETTE`; `None` xoá. Ra ngoài `SIZE` thì bỏ qua (không lỗi), nên cắt bằng hình lớn rồi khoét là cách nhanh.

| Hàm | Làm gì |
| --- | --- |
| `v.set(x, y, z, c)` · `v.get(x, y, z)` | một voxel |
| `v.box(x0, y0, z0, x1, y1, z1, c, hollow=False)` | hộp; `hollow=True` chỉ vỏ |
| `v.ellipsoid(cx, cy, cz, rx, ry, rz, c)` · `v.sphere(cx, cy, cz, r, c)` | khối tròn; tâm thường là `.5` (vd 6.5) để đối xứng |
| `v.cylinder(cx, cy, z0, z1, r, c)` | trụ đứng (thân cây, cột, đế) |
| `v.line(x0, y0, z0, x1, y1, z1, c)` | đường voxel (cành, kiếm, dây) |
| `v.layer(z, rows, x0=0, y0=0)` | vẽ một lát ngang bằng chữ: mỗi dòng là một `y` (dòng đầu = mặt trước), ký tự = khoá màu, `.` bỏ qua, `_` xoá |
| `v.mirror_x()` | chép nửa trái (x < SIZE.x/2) sang phải |
| `v.recolor(src, dst, where=None)` | đổi màu, `where(x, y, z)` để giới hạn vùng |
| `v.speckle(src, dst, chance=0.15, seed=1)` | rải tông thứ hai lên một màu (cỏ, đá, lá), có seed nên lặp lại được |
| `v.shift(dx, dy, dz, where=None)` | dời cả model hoặc một phần (animation) |

## Mẹo cho đẹp
- **Mỗi vật liệu 2–3 tông** (sáng, chính, tối) và dùng tông tối cho đáy, khe, mặt dưới; renderer đã tô mặt trên sáng, mặt trái vừa, mặt phải tối, nên tông riêng chỉ để tạo chi tiết.
- **Tỉ lệ chibi** cho nhân vật nhỏ: đầu ≈ 40% chiều cao, mắt là 1 voxel tối cách nhau 2–3 voxel ở mặt trước (y = 0).
- **Bề mặt lớn** (mái, sàn, lá): `speckle` 10–25% tông lân cận; tránh đốm màu tương phản mạnh.
- **Bậc thay cho dốc**: voxel không có mặt nghiêng; dốc là các bậc 1 voxel.
- **Cỡ**: nhân vật 10–20 voxel cao, đạo cụ 4–10, cây 15–25. Model càng to càng tốn và render càng lớn với cùng `--px`.
- **Viền ngoài** (`--outline`) giúp vật nổi trên nền bận; bỏ viền khi game là cảnh isometric liền khối (tile ghép nhau).
- Tile isometric ghép lưới: mọi tile cùng `SIZE` x/y (vd 8×8×h), không viền, `--px` như nhau.
