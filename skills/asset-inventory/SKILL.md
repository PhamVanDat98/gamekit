---
name: asset-inventory
description: Dùng ở P1 khi cần kiểm kê toàn bộ asset của game gốc (ảnh, atlas/sprite sheet, animation, model, âm thanh, font, video, shader) và cách xuất từng loại sang định dạng web — game của người dùng thì xuất vào assets/ với nhãn own, làm lại game người khác thì giữ trong reference/; đánh dấu ảnh có chữ và lời thoại, kiểm giấy phép font và ngân sách tải. Kết quả là notes/assets.md. Cũng dùng khi gate P1 báo thiếu kiểm kê asset.
---

# Kiểm kê asset gốc (P1)

Đầu ra: `notes/assets.md` (bảng kiểm kê + cách xuất). Bắt đầu từ `notes/source-unpack.md` (`gamekit unpack`: file dữ liệu lớn nhất, số bundle, Addressables) và bộ công cụ trích asset trong skill **re-notes** (Unity: AssetRipper, UABEA, xem thêm **engine-unity**; Godot: GDRE Tools; Unreal: FModel; Flash: JPEXS). Bản trích thô luôn để trong `reference/` (gitignored). Bundle tải từ server khi chạy không có trong gói: ghi vào `notes/QUESTIONS.md`.

GameKit chưa có lệnh quét hay chuyển đổi asset: dùng công cụ ngoài, ghi lệnh đã chạy vào `notes/assets.md` để làm lại được.

## 1. Game của ai
- `own`: bản web xuất vào `assets/` (file mà code import từ `src/view/`; khi đóng gói nằm trong `assets/{img,audio,fonts,art}/` của gói) hoặc `public/StreamingAssets/` (chép nguyên, cho dữ liệu tải sau). Rồi `gamekit provenance add <file hoặc thư mục đã xuất…> --label own --source "<game gốc>: <đường dẫn gốc>"`. `public/` chỉ có `Icons/` và `StreamingAssets/`.
- `third-party`: không chép gì vào `assets/`, `public/`. Asset gốc nằm trong `reference/`, gắn `gamekit provenance add reference/… --label reference`. Chúng chỉ là tư liệu; kiểm kê là danh sách cần làm mới ở P3 (kích thước, số frame, pivot, trạng thái). Không mô tả "vẽ lại nhân vật X của game gốc". P2 dùng placeholder (nhãn `placeholder`); `validate`, `release-check` chặn placeholder và reference trong gói.

## 2. Phân nhóm và ưu tiên
Trong `notes/assets.md`, theo màn hình hoặc tính năng:

| Nhóm | Ví dụ | Ưu tiên |
| --- | --- | --- |
| Cần để chơi được (P2) | nhân vật, chướng ngại, nền, UI chính | cao |
| Cảm giác | hiệu ứng, particle, nhạc nền, SFX | vừa |
| Ngoài lề | cutscene, video, phần đã cắt (`D-n`) | thấp hoặc bỏ |

## 3. Mỗi loại xuất thế nào
| Loại gốc | Xuất web | Ghi lại |
| --- | --- | --- |
| Ảnh (PNG, TGA, PSD, texture nén ETC/ASTC/PVR/DDS) | PNG khi cần alpha, WebP/JPEG cho nền đặc | kích thước, alpha, pivot, 9-slice cho khung UI |
| Atlas, sprite sheet (SpriteAtlas, `.plist`, `.atlas`) | PNG atlas + dữ liệu khung (rect, pivot) dạng JSON, hoặc tách từng sprite | tên atlas, padding, `pixelsPerUnit` |
| Animation khung | sprite sheet ngang + số frame, kích thước, fps | fps gốc; thời gian ảnh hưởng gameplay → `params/` |
| Animation xương (Spine, DragonBones), clip Animator | dữ liệu xương + atlas cho runtime web tương ứng, hoặc keyframe → tween trong `view/` | runtime nào, giấy phép runtime |
| Model 3D, material | glTF/GLB, giảm đa giác và cỡ texture nếu cần | số đa giác, texture, hệ trục gốc |
| Âm thanh (WAV, FSB/bank, wem/bnk, CAF) | MP3 hoặc M4A cho mọi trình duyệt; OGG nhỏ hơn nhưng Safari cũ không phát. Bank FMOD/Wwise: tách bằng công cụ như vgmstream | loop point, âm lượng gốc, nhạc hay hiệu ứng |
| Font (TTF/OTF, bitmap `.fnt`) | WOFF2 chỉ gồm glyph cần dùng; bitmap font giữ atlas + `.fnt` | bảng ký tự: bitmap font chỉ có chữ Latin thì không hiện được ngôn ngữ khác |
| Video (MP4, USM của CRI) | MP4 H.264 hoặc WebM trong `public/StreamingAssets/`, hoặc bỏ | thời lượng, có tiếng/chữ không |
| Shader (ShaderLab/HLSL, effect Cocos, Godot shader) | viết lại GLSL ES trong `src/view/` (là code, không phải asset) | hiệu ứng làm gì; `third-party`: viết lại từ mô tả, không chép |

Mỗi dòng trong `notes/assets.md`: file gốc · loại · định dạng gốc → web · đích (`assets/…`, `public/…`, hay chỉ `reference/`) · chữ/lời · nhãn · dung lượng.

`asset-manifest.json` là spec asset mới cho `third-party` ở P3 (cổng P3 yêu cầu), không phải việc của bước này. Game `own` không cần file đó.

## 4. Chữ trong ảnh, lời thoại
Mở từng ảnh, đừng chỉ đoán theo tên file. Ảnh có chữ (logo, nút, banner, tutorial) và âm thanh có lời nói: ghi vào bảng riêng trong `notes/assets.md`, kèm chữ trong ảnh, màn hình, ngôn ngữ gốc đang có. Template chưa có cơ chế asset theo ngôn ngữ; `t()` chỉ áp dụng cho chuỗi. Nếu game phát hành nhiều ngôn ngữ, ghi thành câu hỏi trong `notes/QUESTIONS.md`. Game gốc có bản không chữ (PSD nhiều lớp, nền nút riêng) thì ghi lại: dùng nền + chữ qua `t()` dễ dịch hơn. `third-party`: chữ không in vào ảnh (cổng P3).

## 5. Font và giấy phép
Game của mình không có nghĩa font là của mình. Ghi tên font, nhà cung cấp, giấy phép có cho nhúng web không. Font bên thứ ba được phép: `gamekit provenance add <file> --label licensed --license "<giấy phép>"` (`licensed` bắt buộc `--license`). Không rõ giấy phép: câu hỏi trong `notes/QUESTIONS.md`, hỏi người dùng. `third-party`: không dùng font gốc.

## 6. Ngân sách tải
`budget.initialLoadMB` trong `game.yaml` chỉ tính **tải đầu**: `index.html` ngoài + `loader.js`, `framework.js`, `css/style.css`, `Icons/*` + file `Language/*.json` lớn nhất. Asset import từ code là file riêng, nhưng file nhỏ hơn 4 KB bị Vite nhúng vào `framework.js` theo mặc định; đừng nhét asset lớn vào `framework.js` (base64, import inline).

Ghi tổng dung lượng từng nhóm, trước và sau khi chuyển đổi, dựa trên số đo thật hoặc ghi rõ là ước lượng. Level, video, gói nhạc dùng sau → `public/StreamingAssets/` tải khi cần (không chứa `.js`, `.wasm`, `.html`; `release-check` chặn). Vượt nhiều thì ghi phương án (giảm độ phân giải, cắt nhạc, tải theo level) cho P3.

## 7. Kết thúc
1. `gamekit validate`: mọi file trong `assets/`, `public/` có nhãn. Rồi `gamekit gate`. Mục kiểm kê asset là mục tay: `own` tick khi `notes/assets.md` có kế hoạch cho mọi nhóm; `third-party` kiểm "Asset gốc nằm trong `reference/` và có nhãn `reference`".
2. Báo người dùng: số asset theo loại, đã xuất/còn lại, ảnh có chữ và lời thoại, font chưa rõ giấy phép, asset chưa có cách xuất, dung lượng so với ngân sách.
3. Tiếp: **ui-extract**, **gameplay-spec**, **physics-assess** nếu chưa làm. Nén cho web: P3.
