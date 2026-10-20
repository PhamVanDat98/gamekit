---
name: engine-other
description: Dùng ở pha P1 khi gamekit recon báo engine "other" (GameMaker, Defold, Flutter/Flame) hoặc không nhận ra (Android Java/Kotlin, engine C/C++ tự viết) — chọn đường phân tích (UndertaleModTool, giải game.arcd, Blutter/reFlutter, jadx, Ghidra qua gamekit ghidra), biết khi nào dừng đọc code để đo từ video với confidence inferred + tolerance.
---

# Phân tích engine khác (P1)

Phương pháp chung theo skill **re-notes**; skill này chọn đường đi cho từng loại. Ghi vào `notes/<engine>.md`. Recon báo `không nhận ra`: đọc bảng kiểm kê (đuôi file lớn nhất, `lib/*/`), so với bảng dưới, rồi tự sửa `source.engine` trong `game.yaml`. `own`: **luôn hỏi source/project trước** — có source thì đọc thẳng, bỏ qua mọi bước decompile.

## 1. Chọn đường
| Dấu hiệu | Engine | Logic | Công cụ | Độ khó |
| --- | --- | --- | --- | --- |
| `data.win`, `game.unx/.ios/.droid`, `libyoyo.so` | GameMaker (VM) | GML trong data file | UndertaleModTool | thấp |
| như trên nhưng UTMT không thấy code | GameMaker YYC | đã biên dịch native trong exe/`libyoyo.so` | Ghidra | cao |
| `game.arcd`/`.arci`, `game.projectc`, `libdmengine.so` | Defold | Lua trong archive | giải archive, đọc Lua | trung bình |
| `libflutter.so` + `libapp.so` | Flutter / Flame | Dart AOT trong `libapp.so` | Blutter, reFlutter | cao |
| chỉ `classes*.dex` (có thể kèm `libgdx.so`) | Android Java/Kotlin, libGDX | bytecode | jadx | thấp–trung bình |
| exe/`.so` lớn, file data tự định dạng | engine C/C++ riêng | native | `gamekit ghidra` | cao |

Lưu ý: với Flutter, recon có thể chỉ tới `classes*.dex`/jadx — phần đó chỉ là vỏ Android; logic ở `libapp.so`.

## 2. GameMaker
- UndertaleModTool mở `data.win`: code GML theo object/event (`gml_Object_<obj>_Create_0`, `_Step_0`, `_Alarm_<n>`, `gml_Script_<tên>`), sprite, âm thanh, room. Dùng các script Export trong menu Scripts để xuất hàng loạt vào `decompiled/gamemaker/` (code) và `reference/` (asset `third-party`).
- Thời gian theo **step**: Step event chạy mỗi step ở `room_speed` (GMS1: Speed của room; GMS2: tốc độ game trong Options). `hspeed`, `vspeed`, `gravity`, `friction` là px/step, `alarm[n]` đếm step, `image_speed` theo frame/step. Ghi `unit: "px/step@<fps>"`; khớp nhất là đặt `runtime.fixedStepHz` = tốc độ gốc (chỉ đặt `runtime.fixedStepHz` trong game.yaml — `vite.config.ts` đưa giá trị này vào `FIXED_HZ` của `src/main.ts` lúc build, không sửa `main.ts`).
- Room → dữ liệu level (instance, creation code, tile, view) trong `public/StreamingAssets/`. Va chạm: mask chính xác hay bbox — ghi lại. `random_set_seed` có thì ghi thuật toán và seed.

## 3. Defold
`game.projectc` là cấu hình (kích thước màn, `display.update_frequency`, `physics.scale`, gravity). Archive `game.arcd` theo chỉ mục `game.arci`; entry có thể nén LZ4 hoặc mã hoá; Lua có thể là source hoặc bytecode LuaJIT. `update(self, dt)` theo giây; vật lý Box2D đổi đơn vị bằng `physics.scale`. `third-party`: không phá mã hoá — phần không đọc được thì đo video.

## 4. Flutter / Flame
- Asset dễ: `assets/flutter_assets/` (hình, âm thanh, font, `AssetManifest.json`, map Tiled `.tmx`/JSON) → level và số liệu trong data đọc thẳng.
- Logic khó: `libapp.so` là snapshot Dart AOT, không có bytecode. Blutter (arm64, cần đúng bản Dart) phục hồi tên class/hàm và assembly có chú thích; reFlutter vá `libflutter.so` để quan sát lúc chạy — chỉ với `own`. Có thể thêm `gamekit ghidra <apk> --entry lib/arm64-v8a/libapp.so` (tuỳ chọn `--il2cpp` không dùng được ở đây).
- Flame: `update(double dt)` theo giây; `component.position`, `velocity`.

## 5. Android Java/Kotlin
`jadx -d decompiled/jadx <file.apk>`; `apktool d` nếu cần XML trong `res/`. R8/ProGuard làm rối tên: lần từ chuỗi, API Android/libGDX (`Gdx.graphics.getDeltaTime()`), vòng lặp `SurfaceView`/`onDrawFrame`. `Thread.sleep(33)` trong vòng lặp = logic theo frame ~30 fps.

## 6. C/C++ tự viết: `gamekit ghidra`
`gamekit ghidra <file> [--entry lib/<abi>/<lib>.so]` (cần `GHIDRA_HOME`, Ghidra 11+, JDK 21; APK/XAPK không kèm `--entry` thì in danh sách thư viện native, entry trong split APK viết `<split>.apk!/lib/<abi>/<lib>.so`). Lần đầu nhập + phân tích (lâu, `--timeout <giây>`), các lần sau chỉ xuất lại (`--reanalyze` để làm lại). Đọc `decompiled/ghidra/<file>/strings.tsv` tìm mốc (tên file data, "score", "level"), rồi decompile đúng hàm cần bằng `--functions <regex>` (`--max`, mặc định 200) → `c/<hàm>@<địa chỉ>.c`. `own`: được chạy debugger để đo; `third-party`: chỉ file tĩnh.

Asset và chữ (mọi đường): `own` xuất sang định dạng web vào `assets/`/`public/`, `gamekit provenance add … --label own --source <file gốc>`; `third-party` chỉ trong `reference/`. Chuỗi hiển thị → `Language/en.json` + `t()`; ảnh có chữ → `assets/i18n/en/` qua `tAsset()`, `text: true` trong `asset-manifest.json`; data chỉ giữ key.

## 7. Khi nào chuyển sang đo video
Chuyển khi: code không đọc được (YYC không symbol, Dart sai bản, archive mã hoá ở `third-party`), hoặc chi phí đọc lớn hơn giá trị (game đơn giản, chỉ thiếu vài số). Ghi lý do và phạm vi đã thử trong `notes/`.
1. Quay màn hình ổn định 60 fps (`own`: chạy game của mình; `third-party`: chơi bình thường bản người dùng có), lưu ở `reference/video/`.
2. Tách frame (`ffmpeg -i in.mp4 -vf fps=60 frames/%05d.png`), đo vị trí theo pixel, quy đổi bằng vật có kích thước đã biết.
3. Đo ít nhất 3–5 lần ở các đoạn khác nhau; `value` = trung bình, `tolerance` ≥ độ lệch tương đối lớn nhất (không nhỏ hơn sai số 1 frame/1 px).
4. Ghi `"confidence": "inferred"`, `source`: `video reference/video/run.mp4 00:12.40–00:13.10, 5 lần đo`. Bảng nhiều điểm → `spec/oracles/` với `tolerance`.

## 8. Kết thúc
Cập nhật `notes/QUESTIONS.md` (câu nào chỉ có `inferred` ghi rõ), `params/` đủ `unit` + `source` + `confidence`, `gamekit validate`. Không commit `decompiled/` hay `reference/`. Báo người dùng: engine xác định được, đường đã chọn và lý do, phần đọc từ code / phần đo video. Tiếp theo: **re-notes** → gameplay-spec → `gamekit gate`.
