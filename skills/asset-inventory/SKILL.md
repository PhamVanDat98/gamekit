---
name: asset-inventory
description: Dùng ở P1 (và P3) để kiểm kê asset của game gốc — xuất hình, âm thanh, font, animation từ bản build bằng công cụ theo engine, chạy gamekit assets để biết theo loại và dung lượng, định dạng nào phải chuyển cho web, file nào quá nặng, rồi đưa vào game với nhãn provenance. Dùng cả khi release-check báo vượt ngân sách tải hoặc asset chưa nhãn.
---

# Kiểm kê asset (P1)

Với game của người dùng (`own`, mặc định), asset gốc được dùng thẳng trên web; đây thường là khối việc lớn nhất sau logic. Với game làm lại của người khác (`third-party`), asset gốc chỉ là tư liệu để viết spec reskin ở P3.

## 1. Xuất asset từ bản gốc
Xuất vào `reference/export/` (gitignored, không bao giờ commit hay đóng gói):

| Engine | Công cụ |
| --- | --- |
| Unity (mọi dạng build) | AssetRipper (xuất cả project), hoặc UABEA/AssetStudio cho từng file |
| Unity, có project | lấy thẳng trong `Assets/` |
| Godot | GDRE Tools (khôi phục project) |
| Cocos, HTML5, Construct, Laya | file trong `res/`, `assets/`, `images/`, `media/` của bản build; atlas = PNG + `.plist`/`.json`/`.atlas` |
| Flash | JPEXS FFDec (export shapes/sprites/sounds) |
| Unreal | FModel / UModel |
| GameMaker | UndertaleModTool |

Lệnh xuất chạy qua Bash được ghi vào nhật ký RE (`gamekit re`).

## 2. Kiểm kê
```
gamekit assets reference/export --write
```
Báo theo loại (hình, âm thanh, font, video, 3D, data) và dung lượng; nhóm **cần chuyển định dạng** (psd/tga/dds → png/webp, wav/aiff/flac → ogg + m4a, fbx/obj → glb, mov → mp4/webm, ttf/otf → woff2); file **quá lớn** (hình > 1 MB hoặc cạnh > 4096 px, âm thanh > 1,5 MB, khác > 5 MB); định dạng không nhận ra. `--write` ghi `notes/assets.md`.

So tổng dung lượng với `budget.initialLoadMB`: phần cần cho màn đầu phải vừa ngân sách, phần còn lại tải sau.

## 3. Chọn và chuyển
- Chỉ lấy asset gameplay thật sự dùng (đối chiếu `spec/gameplay-spec.md`, scene/prefab). Bản build gốc hay có asset thừa.
- Hình: PNG cho ảnh cần alpha sắc nét, WebP cho ảnh lớn; gộp sprite nhỏ thành atlas. Giữ đúng kích thước gốc trừ khi quá 4096 px.
- Âm thanh: nhạc nền ogg + m4a (Safari), 96–128 kbps; hiệu ứng ngắn có thể giữ chất lượng cao hơn.
- Font: woff2; chỉ giữ bộ ký tự cần (kể cả cho các ngôn ngữ trong `languages`).
- Animation: Spine/DragonBones cần runtime web tương ứng (ghi vào `DECISIONS.md`); animation Unity (Animator) phải viết lại bằng code hoặc xuất thành sprite sheet.
- Công cụ chuyển: ffmpeg (âm thanh, video), cwebp/sharp/squoosh (hình), Blender (3D → glb). Lệnh chuyển ghi vào `notes/assets.md` để làm lại được.

## 4. Đưa vào game và gắn nhãn
- `own`: chép bản đã chuyển vào `assets/` (hoặc `public/` cho file tĩnh) rồi `gamekit provenance add assets/… --label own --source "<file gốc>"`. Gắn nhãn cả thư mục được.
- `third-party`: không chép; dùng `notes/assets.md` làm danh sách cho `asset-spec` ở P3, asset gốc giữ trong `reference/` với nhãn `reference`.
- Chạy lại `gamekit assets` (không tham số = `assets/` + `public/`): không còn ⚠ chuyển định dạng, không còn file chưa nhãn. `gamekit validate` kiểm provenance.
