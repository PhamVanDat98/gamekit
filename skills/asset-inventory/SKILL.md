---
name: asset-inventory
description: Dùng ở P1 để kiểm kê asset của game gốc (ảnh, sprite sheet, âm thanh, font, video, model, animation) bằng gamekit assets scan, rồi lập kế hoạch đưa sang web — xuất và nén asset của game người dùng với nhãn own, hoặc lập danh sách cần làm mới khi làm lại game người khác — trong ngân sách tải.
---

# Kiểm kê asset (P1)

Đầu ra: `spec/asset-inventory.json` (máy tạo) và `notes/assets.md` (kế hoạch của bạn). P3 dùng cả hai để chuyển asset sang web (`own`) hoặc làm mới (`third-party`).

## 1. Quét
```bash
gamekit assets scan --write          # nguồn mặc định: source.path trong game.yaml
gamekit assets scan <thư mục|.apk> --write
```
Mỗi asset có `kind`, `bytes`, kích thước PNG, `unity` (spriteMode, số sprite, ppu nếu có `.meta`) và `suggest` (nên đổi sang gì). Bản build Unity đóng asset trong bundle: scan chỉ thấy file rời. Khi đó xuất bằng AssetRipper vào thư mục tạm (ngoài repo) rồi scan thư mục đó (skill **engine-unity**).

## 2. Phân nhóm và ưu tiên
Ghi trong `notes/assets.md`, theo màn hình hoặc tính năng:
| Nhóm | Ví dụ | Ưu tiên |
| --- | --- | --- |
| Cần để chơi được (P2) | nhân vật, chướng ngại, nền, UI chính | cao |
| Cảm giác | hiệu ứng, particle, nhạc nền, SFX | vừa |
| Ngoài lề | cutscene, video, màn phụ đã cắt (`D-n`) | thấp hoặc bỏ |

Đánh dấu chỗ khó: Spine/DragonBones (cần runtime web), font bitmap, animation Unity (`.anim`, `.controller`), model 3D, video.

## 3. Kế hoạch theo loại game
**`own`** (mặc định): asset gốc được phát hành.
- Ảnh rời → `gamekit assets convert <thư mục> --to assets/<nhóm> --label own` (webp; `--lossless` cho pixel art).
- Sprite sheet Unity → `gamekit assets unity-atlas <ảnh.png> --to assets/<…>.json`; đổi ảnh sang webp thì chạy lại với `--image <tên>.webp`.
- Âm thanh → `convert` ra mp3 (`--bitrate 96k` cho SFX). `--audio ogg|m4a` khi có lý do, ghi vào `DECISIONS.md`.
- Font TTF/OTF → woff2 chỉ gồm glyph cần dùng (công cụ ngoài, ghi lại cách làm). Model → glb. Video → nén mạnh hoặc bỏ.
- Mọi file trong `assets/`, `public/` phải có nhãn: `--label own` ở lệnh convert, hoặc `gamekit provenance add <file…> --label own`.

**`third-party`**: asset gốc **không** được phát hành.
- Bản gốc chỉ nằm trong `reference/` (gitignored), nhãn `reference`.
- Inventory là danh sách cần làm mới: ghi kích thước, số frame, pivot, trạng thái cho từng asset để P3 lập `asset-manifest.json` (skill asset-spec). Không mô tả "vẽ lại nhân vật X của game gốc".
- P2 dùng placeholder (nhãn `placeholder`); `release-check` chặn placeholder và reference trong gói.

## 4. Ngân sách tải
- `budget.initialLoadMB` (game.yaml) chỉ tính **tải đầu**: outer `index.html` + `loader.js` + `framework.js` + `css/style.css` + `Icons/` + một file `Language/`. Asset import trong code nằm trong `assets/` của gói, tải khi game cần. Đừng nhét asset lớn vào `framework.js` (base64, import inline).
- Ước lượng tổng sau convert: cộng `bytes` theo nhóm, giả định webp ≈ 30–60% PNG, mp3 128k ≈ 1 MB/phút. Nhóm "cần để chơi" nên tải trước khi `GM_LOADER.ready()`; phần còn lại tải sau.
- Vượt nhiều thì ghi phương án (giảm độ phân giải, cắt nhạc, tải theo level) cho P3.

## 5. Đóng phần asset của cổng P1
`own`: mục "Đã kiểm kê asset gốc … và cách xuất sang định dạng web" tick khi `notes/assets.md` có kế hoạch cho mọi nhóm. `third-party`: kiểm "Asset gốc nằm trong `reference/` và có nhãn `reference`". Báo người dùng tổng dung lượng trước/sau dự kiến và những asset chưa có cách xuất.
