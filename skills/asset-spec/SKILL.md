---
name: asset-spec
description: Dùng ở P3 khi làm lại game của người khác, sau khi người dùng chọn style — viết asset-manifest.json — spec kỹ thuật từng asset mới (kích thước theo params, alpha, khung hình animation, nine-slice, cách làm, brief thiết kế mới) để vẽ/tạo đúng một lần và validate kiểm được file làm ra. Dùng cả khi validate báo asset sai kích thước so với spec.
---

# Spec asset mới (P3, game làm lại)

Đầu vào: hướng style đã chọn (`D-n` trong `DECISIONS.md`, `style/direction.md`), `notes/assets.md` (asset gốc cần thay), `params/` (kích thước logic), `spec/gameplay-spec.md`. Đầu ra: `asset-manifest.json` ở gốc game (schema `.gamekit/schemas/asset-manifest.schema.json`). Cổng P3 kiểm file này có tồn tại; `gamekit validate` kiểm schema và đối chiếu PNG đã làm với spec.

## 1. Một mục cho mỗi asset mới
Đi qua `notes/assets.md`: mỗi asset gốc mà bản web cần → một mục mới (thiết kế mới, không phải bản vẽ lại). Asset gốc không cần → bỏ, ghi lý do trong `notes/assets.md`.

| Field | Bắt buộc | Ghi gì |
| --- | --- | --- |
| `id` | có | tên ổn định, dùng trong code: `player`, `enemy.bat`, `ui.button` |
| `path` | có | file @1x trong `assets/` hoặc `public/`, vd `assets/img/player.png` |
| `kind` | có | `sprite` · `ui` · `anim` · `background` · `tile` · `icon` · `texture` · `model` · `audio` |
| `width`, `height` | có (trừ âm thanh) | px @1x. Sprite gameplay: lấy từ `params/` (vd `player.size`), không đo ảnh gốc |
| `make` | | `vector` (SVG/CSS — mặc định cho UI) · `image-gen` · `own` (người dùng/hoạ sĩ làm) · `licensed` (mua/thư viện) |
| `scales` | | vd `[1, 2]` khi cần bản @2x cho màn hình nét |
| `alpha` | | `true` khi cần nền trong suốt (validate kiểm PNG có kênh alpha) |
| `pivot` | | `[0.5, 1]` = giữa đáy; khớp cách `view/` vẽ |
| `padding` | | px trống quanh hình trong atlas |
| `atlas` | | tên atlas gộp nhiều sprite nhỏ |
| `nineSlice` | | `[left, top, right, bottom]` cho khung/nút co giãn |
| `states` | | `["normal", "pressed", "disabled"]` cho nút |
| `frames` | | animation: `{ count, width, height, fps }` — file là một dải ngang `count × width` |
| `seamless` | | nền/tile lặp không lộ đường nối |
| `collider` | | đường dẫn param hitbox, vd `player.size` — để hoạ sĩ biết vùng va chạm, hình không được lệch khỏi nó |
| `minDisplayPx` | | icon: cỡ nhỏ nhất thật sự hiển thị, để kiểm còn đọc được |
| `noText` | | `true` cho mọi hình: chữ đi qua `t()`, không in vào ảnh |
| `brief` | | mô tả thiết kế **mới** theo style đã chọn |

Âm thanh cũng có mục: `kind: audio`, không cần `width`/`height`, có thể ghi `duration` (giây) và `loop`; chi tiết ở skill **replace-audio**.

## 2. Brief
- Mô tả bằng style mới: hình dạng, màu trong bảng màu đã chọn, cảm xúc, tư thế. Vd: "Cú mèo tròn màu tím than, mắt vàng to, cánh ngắn, nhìn sang phải, viền tối 2 px".
- **Không** viết "vẽ lại nhân vật X của game gốc", không đính kèm ảnh gốc làm mẫu, không nhắc tên game gốc.
- Ghi vai trò gameplay cần đọc được: "kẻ địch — phải khác người chơi về hình dạng, không chỉ màu".

## 3. Kiểm
- `gamekit validate`: schema đúng; PNG đã có thì đúng kích thước (`width × height`, hoặc `frames.width × frames.count` với animation) và có alpha khi `alpha: true`; mỗi `collider` trỏ tới param có thật; không `brief` nào chứa từ trong `release.forbiddenTerms`; `make` khớp nhãn provenance của file (`image-gen` → `generated`, `own` → `own`, `licensed` → `licensed`).
- Tự kiểm: kích thước sprite gameplay khớp params; bản @2x (khi có `scales`) đúng gấp đôi — validate chưa kiểm bản @2x.

Tiếp theo: skill **apply-style** (UI) và **replace-graphics** (hình) — làm song song được.
