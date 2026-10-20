---
name: asset-inventory
description: Dùng ở pha P1 khi cần kiểm kê toàn bộ asset của game gốc (ảnh, atlas/sprite sheet, animation, âm thanh, font, video, shader) và cách xuất từng loại sang định dạng web — game của người dùng thì xuất vào assets/ với nhãn own, làm lại game người khác thì giữ trong reference/; chạy gamekit assets scan để nháp asset-manifest.json, đánh dấu ảnh có chữ và lời thoại, kiểm giấy phép font và ngân sách tải — kết quả là notes/assets.md.
---

# Kiểm kê asset gốc (P1)

Đầu ra: `notes/assets.md` (bảng kiểm kê + cách xuất) và, khi cần, `asset-manifest.json`. Bắt đầu từ bảng "Kiểm kê" theo loại trong `notes/recon.md` (`gamekit recon <đường dẫn game gốc> --write`) và bộ công cụ trích asset trong `notes/` (skill re-notes: AssetRipper/UABEA cho Unity, GDRE Tools cho Godot, FModel cho Unreal, JPEXS cho Flash…). Bản trích thô luôn để trong `reference/` (gitignored).

## 1. Game của ai
- `own`: xuất bản web vào `assets/` (ảnh, âm thanh, font mà code import từ `src/view/`; Vite đưa vào `assets/{img,audio,fonts,art}/` của gói) hoặc `public/` (chép nguyên: `public/StreamingAssets/` cho dữ liệu tải sau). Rồi `gamekit provenance add <file hoặc thư mục đã xuất…> --label own --source "<game gốc>: <đường dẫn gốc>"` (thư mục được gắn nhãn từng file bên trong). `public/Icons/` vẫn là placeholder tới P3.
- `third-party`: không chép gì vào `assets/`/`public/`. Asset gốc nằm trong `reference/`, gắn `gamekit provenance add reference/… --label reference`. Chúng chỉ là tư liệu cho spec asset mới ở P3; `validate` báo asset `reference` trong thư mục phát hành, hook pre-commit chặn commit.

## 2. Mỗi loại xuất thế nào
| Loại gốc | Xuất web | Ghi lại |
| --- | --- | --- |
| Ảnh (PNG, TGA, PSD, texture nén ETC/ASTC/PVR/DDS) | PNG khi cần alpha, WebP/JPEG cho nền đặc | kích thước, alpha, `scales`, `pivot`, `nineSlice` cho khung UI |
| Atlas, sprite sheet (SpriteAtlas, `.plist`, `.atlas`) | PNG atlas + dữ liệu khung (rect, pivot) dạng JSON, hoặc tách từng sprite | tên atlas (`atlas`), padding |
| Animation khung | sprite sheet ngang + `frames {count, width, height, fps}` | fps gốc; thời gian ảnh hưởng gameplay → `params/` |
| Animation xương (Spine, DragonBones), clip Animator | dữ liệu xương + atlas cho runtime web tương ứng, hoặc keyframe → tween trong `view/` | runtime nào, giấy phép runtime |
| Âm thanh (WAV, FSB/bank, wem/bnk, CAF) | MP3 hoặc M4A cho mọi trình duyệt; OGG nhỏ hơn nhưng Safari cũ không phát. Bank FMOD/Wwise: tách bằng công cụ như vgmstream | loop point, âm lượng gốc, nhạc hay hiệu ứng |
| Font (TTF/OTF, bitmap `.fnt`) | WOFF2; bitmap font giữ atlas + `.fnt` | bảng ký tự: bitmap font chỉ có chữ Latin thì không hiện được ngôn ngữ khác |
| Video (MP4, USM của CRI) | MP4 H.264 hoặc WebM, đặt trong `public/StreamingAssets/` | thời lượng, có tiếng/chữ không |
| Shader (ShaderLab/HLSL, effect Cocos, Godot shader) | viết lại GLSL ES trong `src/view/` (là code, không phải asset) | hiệu ứng làm gì; `third-party`: viết lại từ mô tả, không chép |

Mỗi dòng trong `notes/assets.md`: file gốc · loại · định dạng gốc → web · đích (`assets/…`, `public/…`, hay chỉ `reference/`) · chữ/lời · nhãn · dung lượng.

## 3. Nháp asset-manifest.json
`gamekit assets scan` (mặc định quét `assets/` với `own`, `reference/` với `third-party`; đổi bằng `--from reference|assets`). Chỉ nhận ảnh `png/jpg/webp/gif` và âm thanh `ogg/mp3/wav/m4a/aac`, bỏ qua thư mục con `i18n/` và file đã có trong manifest. Không có `--write` thì chỉ in tối đa 30 file và cảnh báo tên file gợi ý có chữ; `--write` thêm mục `id, kind` (đoán theo tên, phải sửa lại), `path`, `width/height/alpha`, `brief: "TODO: …"`. Với `third-party`, `path` là đích giả định `assets/img/….png` / `assets/audio/….ogg` kèm `ref` trỏ về file gốc.
- Font, video, shader không có `kind` trong schema: chỉ ghi trong `notes/assets.md`.
- `own` không bắt buộc có manifest, nhưng ảnh có chữ và lời thoại phải được khai báo ở đây (`validate` kiểm). Brief chi tiết cho asset mới là việc của asset-spec ở P3 (`third-party`).

## 4. Chữ trong ảnh, lời thoại
Mở từng ảnh, không chỉ tin cảnh báo theo tên file. Ảnh có chữ (logo, nút, banner, tutorial):
- `own`: xuất vào `assets/i18n/en/<đường dẫn>`, mục manifest `text: true` + `textKey` (key trong `Language/en.json` chứa đúng chữ in trong ảnh; thêm key nếu chưa có). Bản ngôn ngữ khác cùng đường dẫn trong `assets/i18n/<mã>/` (thiếu thì game dùng bản en, `validate` chỉ cảnh báo). Code lấy URL bằng `tAsset('<đường dẫn>')`. `assets scan` bỏ qua `i18n/`: thêm các mục này bằng tay.
- `third-party`: sửa mục scan thành `path: assets/i18n/en/…`, `text: true`, `textKey`.
- Âm thanh có lời nói: `voice: true`, `kind: audio`, `path` trong `assets/i18n/en/`, `textKey` = câu thoại. Game gốc có bản lồng tiếng ngôn ngữ khác thì xuất vào `assets/i18n/<mã>/`.
- `validate` báo lỗi: `text: true` ngoài `assets/i18n/en/`, mục có `path` trong `assets/i18n/` mà thiếu `text`/`voice`, `textKey` không có trong `Language/en.json`.

## 5. Font và giấy phép
Game của mình không có nghĩa font là của mình. Ghi tên font, nhà cung cấp, giấy phép có cho nhúng web không. Font bên thứ ba được phép: `--label licensed --license "<giấy phép>"` (`licensed` bắt buộc `--license`). Không rõ giấy phép: câu hỏi trong `notes/QUESTIONS.md`, hỏi người dùng. `third-party`: không dùng font gốc.

## 6. Ngân sách tải
`budget.initialLoadMB` trong `game.yaml` tính `index.html` ngoài + `loader.js`, `framework.js`, `css/style.css`, `Icons/*` + file `Language/*.json` lớn nhất (lib `budget.mjs`, dùng chung cho `pack` và `release-check`). Asset import từ code là file riêng, nhưng file nhỏ hơn 4 KB bị Vite nhúng vào `framework.js` theo mặc định. `budget.timeToPlaySec` (đo bằng `gamekit smoke`) tính mọi thứ game tải trước khi vào chơi. Ghi tổng dung lượng từng nhóm; level, video, gói nhạc dùng sau → `public/StreamingAssets/` tải khi cần (không chứa `.js/.wasm/.html`).

## 7. Kết thúc
1. `gamekit validate`: mọi file trong `assets/`, `public/` có nhãn; manifest hợp lệ. Rồi `gamekit gate` (mục kiểm kê asset là mục tay).
2. Báo người dùng: số asset theo loại, đã xuất/còn lại, ảnh có chữ và lời thoại, font chưa rõ giấy phép, ước lượng dung lượng tải đầu so với ngân sách.
3. Tiếp: ui-extract, gameplay-spec; P2 runtime-select. P3: nén cho web (`own`) hoặc asset-spec (`third-party`).
