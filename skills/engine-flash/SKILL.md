---
name: engine-flash
description: Dùng ở pha P1 khi gamekit recon báo Flash hoặc Adobe AIR (.swf, META-INF/AIR/, libCore.so) — xuất ActionScript, hình (SVG/PNG), âm thanh bằng JPEXS FFDec, đổi thời gian tính theo frame (enterFrame ở fps của stage) thành params có unit, lập bảng animation từ timeline MovieClip, và xử lý phần riêng của APK AIR.
---

# Phân tích game Flash / AIR (P1)

Phương pháp chung theo skill **re-notes**; skill này chỉ thêm phần riêng của Flash. Ghi vào `notes/flash.md` và các file chủ đề.

## 1. Tìm file swf
- Web/desktop: file `.swf` chính (recon ghi `engineVersion: SWF <n>` — số phiên bản định dạng; AS3 cần SWF ≥ 9). Game có thể tải thêm swf khác lúc chạy (`Loader`, `loadMovie`): tìm chuỗi `.swf` trong code.
- APK AIR: swf nằm trong `assets/` cùng `assets/META-INF/AIR/application.xml` (id, version, `aspectRatio`, `renderMode`, `fullScreen`). `lib/*/libCore.so` là runtime AIR, **không** chứa logic game — đừng đưa vào Ghidra. Thư viện native khác trong `lib/` + Java là ANE (quảng cáo, mua hàng): ghi lại cho P4 (platform-sdk), không thuộc `core/`.
- `renderMode` direct/gpu thường đi với Starling/Stage3D: atlas (XML + PNG) có thể nằm ngoài swf, trong `assets/`.

## 2. Xuất bằng JPEXS FFDec
GUI để duyệt; CLI để xuất hàng loạt vào `decompiled/flash/` (gitignored):
```
ffdec -export script,image,shape,sprite,sound,frame decompiled/flash <file.swf>
```
Định dạng chọn bằng `-format` (vd `shape:svg`, `sprite:png`). Code bị làm rối (tên lạ, luồng điều khiển rối): bật deobfuscation trong FFDec rồi xuất lại.
- AS3: class trong package, logic trong `DoABC`. AS2: code rải trên frame, button, `onClipEvent(enterFrame)`; dùng `_root`, `_x`, `_y`.
- `own`: được đọc và dịch logic sang TypeScript (viết lại cho `core/`/`view/`). `third-party`: chỉ ghi hành vi bằng lời của mình. Không commit gì từ `decompiled/`.

## 3. Thời gian theo frame
Phần lớn game Flash cập nhật trong `ENTER_FRAME`, mỗi lần một frame ở **fps của stage** (header swf; code có thể đổi bằng `stage.frameRate`). Hằng số vì thế là px/frame:

| Gốc | Ý nghĩa | Ghi vào params |
| --- | --- | --- |
| `x += 4` mỗi enterFrame, fps 24 | 4 px/frame | `"value": 4, "unit": "px/frame@24fps"`, `observed` |
| `vy += 0.8` | 0.8 px/frame² | `"unit": "px/frame²@24fps"` |
| `Timer(500)`, `setInterval`, `getTimer()` | ms thật | `"unit": "ms"` |

Hai cách dựng lại, chọn một và ghi `D-n` trong `DECISIONS.md`:
1. **Giữ đơn vị frame**: `runtime.fixedStepHz` = fps gốc (game.yaml cho phép 10–240) và `FIXED_HZ` trong `src/main.ts` (template đặt cứng 60); view nội suy bằng `alpha` để vẫn mượt. Khớp tuyệt đối, kể cả làm tròn.
2. **Đổi sang giây**: 4 px/frame × 24 = 96 px/s, gia tốc nhân fps². Ghi `derived` và công thức trong `source`. Cẩn thận: va chạm và nhảy có thể lệch vì bước khác.

Toạ độ: y hướng xuống, `rotation` theo độ chiều kim đồng hồ; dữ liệu thô trong swf tính bằng twip (1/20 px), FFDec đã đổi ra px. `Math.random()` không seed được: core dùng `Rng`, parity chỉ so phân phối.

## 4. Timeline MovieClip → bảng animation
Mỗi MovieClip có frame label (`idle`, `run`, `attack`…), `gotoAndPlay`/`gotoAndStop`, `stop()` trong frame script. Lập bảng trong `notes/animation.md` (hoặc `spec/oracles/` nếu dùng cho test):

| clip | label | frame đầu–cuối | lặp | sự kiện gameplay |
| --- | --- | --- | --- | --- |
| Hero | attack | 31–42 | không | gây sát thương ở frame 37 |

Thời lượng = số frame / fps stage. Frame script gây hiệu ứng gameplay (hitbox, sinh đạn, cộng điểm) là số gameplay: vào `params/` với `unit: "frame"`. Clip lồng nhau chạy timeline riêng nhưng cùng fps.

## 5. Asset
- Shape vector → SVG (giữ nét khi phóng) hoặc PNG ở 2× (nhẹ hơn khi nhiều sprite). Kiểm filter (glow, drop shadow), blend mode, color transform: SVG/PNG xuất ra có thể thiếu, cần dựng lại trong view.
- Sprite động → sprite sheet PNG theo frame. Âm thanh `DefineSound` (MP3/ADPCM) → mp3/ogg; nhạc stream trên timeline đồng bộ theo frame.
- Font nhúng: kiểm license trước khi dùng (nhãn `licensed` kèm `--license`).
- Text tĩnh (`DefineText`) trong swf thường là hình: ưu tiên nền không chữ + `t()`; giữ ảnh có chữ thì đặt ở `assets/i18n/en/`, lấy bằng `tAsset()`, `text: true` trong `asset-manifest.json`. Chuỗi trong TextField động và code → `Language/en.json`.
- `own`: asset vào `assets/`/`public/`, `gamekit provenance add … --label own --source <swf>#<id>`. `third-party`: chỉ trong `reference/`.

## 6. Kết thúc
Cập nhật `notes/QUESTIONS.md` và `params/` (mỗi số có `unit`, `source`, `confidence`), ghi lựa chọn đơn vị frame/giây vào `DECISIONS.md`, chạy `gamekit validate`. Báo người dùng: AS2 hay AS3, fps stage, cách đổi thời gian đề xuất (chờ họ duyệt `D-n`), phần chưa rõ. Tiếp theo: **re-notes** → gameplay-spec → `gamekit gate`.
