# Lấy và mở từng dạng game gốc

Phần **nhận diện engine** (dấu hiệu, nơi chứa logic/data, công cụ) do `gamekit recon` in ra; bảng luật nằm trong `scripts/lib/formats.mjs` của plugin — thêm định dạng mới thì thêm luật ở đó, kèm test. File này nói phần recon không làm được: **lấy bản build thế nào** và **mở ra thế nào**.

Game của người dùng (`own`): mọi bước dưới đây chỉ cần khi không còn project gốc. Có project thì dùng project.

## Di động

| Dạng | Lấy | Mở / lưu ý |
| --- | --- | --- |
| APK | Từ máy: `adb shell pm path <package>` → `adb pull` **từng** đường dẫn in ra (nhiều dòng = split APK). Từ máy build: `build/outputs/apk/` | zip; `apktool d` khi cần `AndroidManifest.xml`/resource đọc được |
| Split APK (XAPK, APKS, APKM) | Như trên, hoặc file người dùng tải | zip chứa `base.apk` + `split_config.*.apk` (+ OBB trong XAPK). Recon mở bên trong; phân tích cả bộ: `.so` thường nằm ở split theo ABI |
| AAB | Từ máy build hoặc Play Console | `bundletool build-apks --bundle=x.aab --output=x.apks --mode=universal`, rồi giải `universal.apk` |
| OBB | `Android/obb/<package>/main.<ver>.<package>.obb` trên máy | Unity: zip chứa `assets/bin/Data`; game khác: định dạng riêng |
| IPA | Từ máy build (`.xcarchive` → Export) | zip, logic trong `Payload/*.app/`. IPA từ App Store bị mã hoá FairPlay — chỉ dùng bản build của chính người dùng |

## Desktop

| Dạng | Lấy | Mở / lưu ý |
| --- | --- | --- |
| Steam | Steam → chuột phải game → Manage → Browse local files (`steamapps/common/<Game>`) | exe có thể bọc SteamStub DRM — game của người dùng: lấy bản build không DRM từ máy build/Steamworks depot. Ghi lại tính năng Steamworks dùng (achievement, cloud, leaderboard, DLC) cho P4 |
| GOG, Epic, itch | Thư mục cài đặt của launcher | GOG thường không DRM; Epic có thể kèm EOS |
| Bộ cài (`setup.exe`, `.msi`) | — | Cài vào máy hoặc giải: `innoextract` (Inno Setup), 7-Zip (NSIS, MSI), rồi recon trên thư mục cài |
| exe đơn lẻ | — | Thiếu thư mục đi kèm thì xin cả thư mục. Godot/LÖVE có thể nhúng data cuối exe (recon nhận Godot qua `GDPC` cuối file; LÖVE: mở exe bằng 7-Zip) |
| macOS `.app`, `.dmg` | `.dmg`: mount (macOS) hoặc 7-Zip | Logic: `Contents/MacOS/`, data: `Contents/Resources/` |
| Linux | Thư mục có `*.x86_64` | như Windows |
| Electron / NW.js | Thư mục cài | Game là web bên trong: `resources/app.asar` (`npx @electron/asar extract app.asar out/`), `package.nw` (zip) hoặc thư mục cạnh exe (RPG Maker MV/MZ: `www/`) |

## Web

| Dạng | Lấy | Mở / lưu ý |
| --- | --- | --- |
| Thư mục build web | Thư mục build của người dùng (có `index.html`) | Đọc bundle; có `*.js.map` thì đọc source map trước |
| Game đang chạy trên web | Bản build gốc từ người dùng. Không có thì DevTools → Network lưu từng file (giữ cấu trúc đường dẫn) | `third-party`: chỉ phân tích file tĩnh đã tải, không can thiệp server |
| Unity WebGL | thư mục `Build/` | Giải nén `.br`/`.gz` trước; `.data` là UnityWebData (AssetRipper mở được) |
| Flash `.swf` | file `.swf` | JPEXS FFDec; Ruffle để chạy thử |

## Không hỗ trợ / cần người dùng
- Console (Switch `.nsp/.xci`, PlayStation, Xbox): không phân tích; xin project gốc.
- Bản build mã hoá mà không có khoá (IPA FairPlay, IL2CPP metadata mã hoá, `.pak` AES, `.jsc` không có khoá): với game của người dùng, xin khoá hoặc project; ghi vào rủi ro triage.
- Game cần server để chơi: ghi phần nào chạy ở server (logic, dữ liệu level) — bản web phải có cách thay.

## Khi recon không nhận ra engine
1. Xem mục "File lớn nhất": file data chính thường là file lớn nhất.
2. Đọc vài byte đầu (`xxd file | head`) để thấy magic: `PK` zip, `UnityFS`, `GDPC`, `FWS/CWS/ZWS` swf, `MZ` exe Windows, `\x7fELF` Linux/Android, `\0asm` wasm, `RIFF` âm thanh/ảnh.
3. Tìm chuỗi tên engine: `strings <exe> | grep -iE 'unity|unreal|godot|cocos|gamemaker|defold|love'`.
4. Nhận ra được rồi: thêm luật vào `scripts/lib/formats.mjs` (kèm test trong `tests/cli.test.mjs`) để lần sau recon tự nhận.
