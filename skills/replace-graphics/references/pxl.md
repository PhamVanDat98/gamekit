# pxl: pixel art bằng code (`make: pixel-code`)

[pxl](https://github.com/crsolver/claude-pxl) (MIT, Node ≥ 22.18, không phụ thuộc gì): agent viết file `.px.js` (palette, sprite dạng lưới ký tự, mirror, outline, palette-swap, anim, sheet), pxl xuất PNG, strip animation, sprite sheet + JSON và ảnh preview phóng to để agent tự xem. Dùng được trên Claude Code và Codex. Không cần API key; cùng file ra cùng ảnh.

## Cài (một lần trên máy, không vào repo game)
- Claude Code: `git clone https://github.com/crsolver/claude-pxl.git ~/.claude/skills/pxl-pixel-art` → có skill `pxl-pixel-art`, đọc nó để biết cú pháp đầy đủ (`SKILL.md`, `reference.md`).
- Codex / agent khác: clone về một chỗ cố định, đọc `SKILL.md` của pxl. Lệnh: `node <pxl>/bin/pxl.js …`.
- Không clone: `npx github:crsolver/claude-pxl build <file>`.

Dưới đây `PXL` = `node <pxl>/bin/pxl.js`.

## Trong một game GameKit
| Việc | Cách |
| --- | --- |
| Nguồn art | `art/<nhóm>.px.js` (vd `art/units.px.js`, `art/tiles.px.js`), **commit**. Một palette chung cho cả game: đặt trong file đầu, các file khác chép đúng `pal(...)` đó hoặc dùng palette có sẵn (`use("endesga32")`) |
| Build | `PXL build art/units.px.js --out .gamekit/local/pxl/units` (thư mục gitignored). Đang sửa: thêm `--only a,b` |
| Xem | Đọc `.gamekit/local/pxl/units/_preview/<tên>.png`; sửa từng pixel thì `PXL ascii art/units.px.js <tên>` (rẻ hơn đọc ảnh). Người dùng muốn xem vẽ trực tiếp: `PXL serve art/units.px.js --out .gamekit/local/pxl/units` chạy nền, đưa họ URL |
| Đưa vào game | Chép đúng file cần dùng sang `path` trong `asset-manifest.json`: `sprites/<tên>.png`, `anims/<tên>.png` (+ `.json` nếu runtime đọc thời lượng frame), `<sheet>.png` + `<sheet>.json`. **Không** chép `_preview/`, `.gif` |
| Nhãn | `gamekit provenance add assets/gfx/units --label generated --source art/units.px.js --note "pxl"` |
| Kiểm | `gamekit validate`: kích thước khớp spec, có alpha |

## Khớp spec trong asset-manifest
- `width`/`height` trong spec là kích thước **sau** outline: `outline: "k"` nới canvas 1px mỗi phía, nên vẽ `w: width-2, h: height-2` (hoặc lưới nhỏ hơn 2px mỗi chiều).
- Anim: pxl xuất strip ngang, khớp `frames` của spec (ảnh rộng `frames.width × frames.count`). `fps` trong `anim(...)` lấy từ spec.
- `states` (vd `idle`, `pressed`): mỗi state một sprite, dùng `base` + `swap`/patch thay vì vẽ lại.
- `noText`: không dùng `text(...)` cho chữ người chơi đọc; chữ đi qua `t()` (pixel font của pxl chỉ dùng cho chữ trang trí như biển hiệu).
- `scales`: pxl xuất @1x. Không xuất @2x riêng; game phóng to theo số nguyên.

## Hiển thị pixel art trên web
- Phóng to theo **số nguyên** và tắt làm mịn: canvas 2D `ctx.imageSmoothingEnabled = false`; CSS `image-rendering: pixelated`; Phaser `pixelArt: true`; Pixi v8 `TextureSource.defaultOptions.scaleMode = 'nearest'`.
- Kích thước thế giới (`params.world`) giữ như game gốc; chỉ đổi tỉ lệ vẽ. Collider theo `collider` của spec, không theo viền ảnh.
- UI (nút, popup, thanh) vẫn ưu tiên `vector` (CSS/SVG) cho sắc nét ở mọi cỡ; có thể dùng font/khung pixel cho hợp style.

## Khi nào không hợp
Style vẽ tay, painterly, 3D render, ảnh có nhiều chi tiết mượt: dùng `image-gen` hoặc `vector`. Sprite lớn (quá ~128px) viết bằng lưới tốn token; dùng primitive (`rect`, `poly`, `grad`) và `stamp` part nhỏ, hoặc đổi cách làm.
