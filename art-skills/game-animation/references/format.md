# Định dạng file

## Quy ước chung
- Nhân vật nhìn sang **phải**. Trục `y` hướng xuống; **mặt đất là `y = 0`**, phía trên là số âm.
- Góc tính bằng độ: **0 = chỉ xuống**, **180 = chỉ lên**, **−90 = ra trước** (sang phải), **90 = ra sau**. Xoay dương = theo chiều kim đồng hồ (tay chân buông xuống đánh ra sau; thân đứng thẳng nghiêng tới trước).
- Đơn vị dài tuỳ chọn, chỉ cần thống nhất trong một khung xương (mẫu humanoid: chân dài 2).

## `*.skeleton.json`
```json
{
  "root": [0, -1.97],
  "bones": {
    "torso": {"length": 1.45, "angle": 180, "width": 0.3, "side": "mid"},
    "head":  {"parent": "torso", "at": 1.0, "length": 1.0, "angle": 180, "shape": "circle", "face": true},
    "thigh_front": {"parent": "torso", "at": 0.0, "length": 1, "angle": 0, "side": "front"},
    "shin_front":  {"parent": "thigh_front", "length": 1, "angle": 0, "side": "front"}
  }
}
```
| Trường | Nghĩa |
| --- | --- |
| `root` | vị trí điểm đầu của xương gốc lúc nghỉ `[x, y]` |
| `parent` | xương cha; đúng một xương không có cha (gốc) |
| `length` | độ dài |
| `angle` | hướng **lúc nghỉ, tuyệt đối** (không cộng cha) |
| `at` | gắn ở đâu dọc xương cha: 0 = đầu, 1 = cuối (mặc định 1) |
| `offset` | dời thêm `[dx, dy]` từ điểm gắn (tính ở tư thế nghỉ, xoay theo cha) — vai lệch, mắt, cánh hai bên |
| `side` | `front` (gần người xem, vẽ sau, màu cam-đỏ trong dải tư thế), `back` (xa, vẽ trước, màu xanh), `mid` (thân) |
| `width`, `shape` (`line`/`circle`), `face` (chấm mũi chỉ hướng mặt), `color`, `z` | cách vẽ người que; `z` xếp thứ tự trong cùng `side` |

## `*.anim.json`
```json
{
  "skeleton": "hero.skeleton.json",
  "frames": 8, "fps": 10, "loop": true, "pivot": "bottom",
  "keys": {
    "torso": {"y": [[0, 0], [0.25, -0.08], [0.5, 0], [0.75, -0.08]], "rot": [[0, 4]]},
    "arm_front": {"rot": [[0, 25], [0.5, -25]]}
  },
  "waves": [{"bones": ["tail1", "tail2", "tail3"], "channel": "rot", "amp": 12, "cycles": 1, "phase_step": 0.12}],
  "ik": [{"bones": ["thigh_front", "shin_front"], "knee": "forward",
          "target": [[0, [0.66, 0]], [0.62, [-0.66, 0]], [0.81, [0, -0.3]]],
          "foot": "foot_front", "foot_angle": [[0, -90]]}]
}
```
| Trường | Nghĩa |
| --- | --- |
| `skeleton` | đường dẫn (tương đối với file animation) hoặc khai báo trực tiếp |
| `frames`, `fps` | số frame xuất ra, tốc độ |
| `loop` | `true`: t chạy 0 → 1 rồi nối về 0 (key cuối nội suy sang key đầu); `false`: frame cuối là t = 1 |
| `pivot` | chỉ cho `tween`: `bottom` (đáy giữa sprite) hoặc `center` |
| `keys.<xương>.<kênh>` | danh sách `[t, giá trị]` hoặc `[t, giá trị, "easing"]`, t từ 0 đến 1. Easing áp cho đoạn **bắt đầu** ở key đó: `smooth` (mặc định), `linear`, `in`, `out`, `step` |
| kênh `rot` | độ xoay **thêm** so với tư thế nghỉ; xương con xoay theo cha |
| kênh `x`, `y` | chỉ xương gốc: dời so với `root` |
| kênh `sx`, `sy` | co giãn ảnh bộ phận / sprite (nén–giãn) |
| `waves` | dao động cộng thêm: `amp · decay^i · sin(2π(cycles·t − phase − i·phase_step))` cho xương thứ i trong `bones`. Một xương: lắc; chuỗi xương + `phase_step`: sóng lan (đuôi, rắn, cá, tóc, dây) |
| `ik` | hai xương cha–con với điểm cuối đặt vào `target` (toạ độ thế giới, mặt đất y = 0); `knee`: `forward`/`back` (khớp giữa gập về phía nào); `foot` + `foot_angle`: khoá góc bàn chân (−90 = nằm phẳng hướng tới) |

Key được sắp theo t; một key duy nhất = giá trị cố định. IK ghi đè `rot` của hai xương đó.

## `rig.json` (cho `rig`)
```json
{"parts": {"<tên>": {"file": "parts/x.png", "bone": "<xương>", "pivot": [x, y], "z": 3}}}
```
`bone` mặc định trùng tên phần; `pivot` mặc định ở mép ảnh phía xương bắt đầu; `z` mặc định theo `side` rồi `z` của xương. Ảnh vẽ theo tư thế nghỉ; tỉ lệ pixel/đơn vị tự đo từ ảnh.

## Đầu ra `bake`
`{"fps", "loop", "frames": [{"<xương>": {"x", "y", "angle", "rot", "sx", "sy"}}]}` — `x, y` là điểm đầu xương, `angle` hướng tuyệt đối theo quy ước trên. Game vẽ mỗi ảnh bộ phận tại `x, y`, xoay `angle − angle lúc nghỉ`.
