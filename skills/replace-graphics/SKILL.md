---
name: replace-graphics
description: Dùng ở P3 khi làm lại game người khác (third-party) để thay đồ hoạ — chọn cách làm từng asset theo `make` trong asset-manifest.json (vector, pixel-code bằng pxl, image-gen, licensed), giữ một style thống nhất, xuất đúng spec, gắn nhãn provenance và kiểm bằng validate.
---

# Thay đồ hoạ (P3, `third-party`)

Đầu vào: style người dùng đã chọn (ghi trong `DECISIONS.md`) và `asset-manifest.json` (mỗi asset có `kind`, kích thước, `frames`, `alpha`, `brief`). Đầu ra: file đúng `path` của spec, nhãn trong `provenance.json`, `gamekit validate` sạch. Asset gốc trong `reference/` chỉ để xem bố cục và kích thước, không tô lại, không trace.

## 1. Chọn cách làm (`make`)
| `make` | Hợp với | Công cụ | Ghi chú |
| --- | --- | --- | --- |
| `vector` | UI: nút, popup, thanh, icon, bộ icon; logo, icon portal; nhân vật/vật cartoon phẳng viền đen | CSS, SVG viết tay; nhân vật/đạo cụ: skill `svg-game-art` ([5 style](references/vector-cartoon.md)); logo/icon: skill `illustrate` (xem [công cụ](references/art-tools.md)) | Mặc định cho UI. Sắc ở mọi cỡ, không cần ảnh. Kiểm icon ở `minDisplayPx` |
| `pixel-code` | Style pixel art: nhân vật, item, tile, anim, sprite sheet | [pxl](references/pxl.md) | Agent viết code `.px.js`, cùng file ra cùng ảnh, không cần API key. Claude Code và Codex đều dùng được |
| `image-gen` | Style vẽ tay, painterly, nền chi tiết, 3D render; pixel art bằng model chuyên dụng | Codex: skill `imagegen` có sẵn, anim qua `sprite-pipeline` (plugin Game Studio). Claude Code: MCP của dịch vụ người dùng có (xem [công cụ](references/art-tools.md)) | Cần hậu xử lý (mục 3). Kiểm điều khoản thương mại của dịch vụ |
| `licensed` | Gói asset mua/miễn phí có giấy phép | — | `provenance add … --label licensed --license …` |

Một game nên dùng **một** cách chính cho đồ hoạ trong màn chơi để style đồng nhất; UI có thể là `vector` bên cạnh. Style pixel art → `pixel-code` cho mọi sprite/tile/anim. Ghi lựa chọn vào `DECISIONS.md`. Khi đưa người dùng chọn style, nêu cách làm đi kèm (miễn phí/trả phí, cần cài gì) — danh sách ở [công cụ](references/art-tools.md).

### Người dùng đưa ảnh mẫu style
Mỗi skill/công cụ chỉ vẽ được style của nó; chọn sai công cụ thì ảnh ra không giống mẫu dù prompt kỹ. Nhìn ảnh mẫu, gọi tên đặc điểm (viền, cách tô, chất liệu, palette) rồi chọn:

| Ảnh mẫu trông như | Cách làm |
| --- | --- |
| Cartoon phẳng, viền đen dày, màu tươi | `vector`: skill `svg-game-art`, style `doodle` ([cách dùng](references/vector-cartoon.md)) |
| Tô 2 tông, viền tối + viền trắng ngoài kiểu sticker; đạo cụ khối 3/4 | `vector`: `svg-game-art`, style `sticker` |
| Khối hình học không viền (hypercasual) · nét neon phát sáng · giấy cắt chồng lớp | `vector`: `svg-game-art`, style `flat` · `neon` · `paper` |
| Pixel art | `pixel-code` (pxl) |
| Nét nguệch ngoạc, tô gạch chéo kiểu bút sáp | `vector` bằng skill claudedraw — chỉ ra đúng style đó |
| Nền vẽ tay có chất liệu (mây loang, màu nước, ánh sáng), nhân vật tô bóng, viền trắng kiểu sticker | `image-gen` kèm ảnh mẫu làm tham chiếu style, rồi tách nền |

Ảnh mẫu lấy từ game người khác chỉ để học style (viền, palette, tỉ lệ); không chép nhân vật, bố cục hay chi tiết nhận diện.

## 2. Làm theo đợt, duyệt sớm
1. Làm 3–5 asset tiêu biểu trước (nhân vật chính, một kẻ địch, một tile/nền, một nút) → cho người dùng xem cạnh nhau trên nền game → sửa style tới khi họ đồng ý.
2. Chốt palette/khung hình chung từ đợt đầu (pxl: `pal(...)`; image-gen: prompt gốc + ảnh tham chiếu của chính asset đã duyệt) rồi mới làm phần còn lại.
3. Mỗi asset đọc `brief` và tín hiệu gameplay nó mang (nguy hiểm, nhặt được, trạng thái): phải nhận ra được khi tắt tiếng và ở `minDisplayPx`.

## 3. Hậu xử lý cho `image-gen`
- Tách nền thành trong suốt khi spec có `alpha: true`: tạo ảnh trên nền một màu phẳng không có trong vật (vd `#FF00FF`; vật có màu hồng thì dùng `#00FF00`), rồi xoá màu đó (Codex: skill `transparent-visual-assets`). Soi viền xem còn ám màu nền không. Cắt sát rồi đặt vào canvas đúng `width × height` (căn theo `pivot`).
- Anim: tạo **cả strip trong một lần** từ một frame đã duyệt (tạo từng frame riêng sẽ lệch dáng); chuẩn hoá cùng tỉ lệ, cùng điểm neo (thường giữa-đáy); ghép thành strip ngang `frames.width × frames.count`. Codex: skill `sprite-pipeline` làm đúng quy trình này.
- Style pixel từ model tạo ảnh: thu nhỏ về đúng lưới, giảm màu về palette đã chốt. Nếu cần sửa nhiều, làm lại bằng `pixel-code`.
- Không có chữ trong ảnh (`noText`): chữ đi qua `t()`.

## 4. Đưa vào game
- File theo `path` của spec. Nguồn để dựng lại (file `.px.js`, prompt) commit trong `art/`; ảnh nháp, preview để trong `.gamekit/local/`.
- `gamekit provenance add <file|thư mục> --label generated --source <file nguồn hoặc tên công cụ>`; gói mua dùng `licensed`.
- `view/` vẽ đúng tỉ lệ; pixel art phóng to theo số nguyên, tắt làm mịn (xem [pxl](references/pxl.md)).

## 5. Kết thúc
`gamekit validate` (kích thước, alpha khớp spec) · `npm test` · chạy `npm run dev` xem từng màn · không còn file nhãn `reference` trong `assets/`, `public/`. Báo người dùng để họ tick mục "(bạn)" ở `gates/P3.md`.
