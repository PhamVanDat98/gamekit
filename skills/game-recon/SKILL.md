---
name: game-recon
description: Dùng ở P0 khi nhận một game gốc ở bất kỳ dạng nào (APK, XAPK/APKS, AAB, OBB, IPA, thư mục Steam/GOG/Epic, exe/.app/Linux, bộ cài, Electron/NW.js, thư mục web, file .swf/.pck/.love, hoặc project source) — lấy đúng bản build, chạy `gamekit recon` để nhận diện container + engine + nơi chứa logic/data, kiểm chứng, kiểm kê asset và viết báo cáo triage cho người dùng quyết làm hay bỏ.
---

# Nhận diện và đánh giá game gốc (P0)

Mục tiêu cổng P0: biết chắc game gốc là gì (dạng phát hành, engine, version, logic/data nằm đâu, chỗ nào bị mã hoá), asset gồm những gì, và người dùng có đủ thông tin để quyết làm hay bỏ.

## 1. Lấy đúng bản build
Hỏi người dùng họ có gì. Game của họ (`own`): **ưu tiên project source**, rồi tới bản build không mã hoá từ máy build — nhanh và chắc hơn mọi thứ dưới đây. Chỉ có bản phát hành thì xem [references/formats.md](references/formats.md) cho từng dạng: lấy APK từ máy (split APK phải lấy đủ bộ), AAB → APK, thư mục Steam, bộ cài, `.dmg`, game web đã tải về.

Đặt bản gốc **ngoài thư mục game** (hoặc trong `reference/`, gitignored), rồi ghi đường dẫn: `gamekit init … --set sourcePath=<đường dẫn>` hoặc sửa `source.path` trong game.yaml. Hook pre-commit chặn file build gốc (`.apk`, `.dll`, `.so`, `.pak`, `.pck`…) và code gốc/decompile (`.cs`, `.java`, `.gd`, `.lua`…) ở mọi chỗ khác.

## 2. Chạy recon
```bash
npm run gk -- recon --write          # mặc định source.path; hoặc: recon <đường dẫn>
```
Recon liệt kê file (mở cả archive lồng nhau: XAPK → APK, IPA, OBB, `.asar`), rồi in: dạng phát hành, cửa hàng/SDK (Steam, GOG, Epic…), engine + biến thể (Unity Mono/IL2CPP/WebGL, Cocos Creator/2d-x Lua…), version khi đọc được, nơi chứa logic và data, công cụ nên dùng, cảnh báo (script mã hoá, OBB, split APK, Hermes, `.pak` AES…). `--write` lưu `notes/recon.md` và điền `source.engine`/`engineVersion` nếu còn trống; engine đã ghi khác kết quả thì chỉ cảnh báo. `--json` cho agent.

Nhiều kết quả engine: cái đầu là khả năng cao nhất; cái sau có thể là thư viện kèm (vd Electron bọc Phaser, Unity kèm plugin native). Không nhận ra engine: xem mục "File lớn nhất" và [references/formats.md](references/formats.md).

## 3. Kiểm chứng — recon chỉ đọc tên file
Recon là gợi ý có bằng chứng, không phải kết luận. Trước khi tick cổng:
- Mở ít nhất một file bằng chứng để xác nhận (header, nội dung), nhất là khi kết quả chỉ dựa vào một file.
- Ghi version engine nếu recon chưa đọc được (Unity: chuỗi kiểu `2021.3.5f1` trong `globalgamemanagers`/`UnityPlayer`; Cocos: `cocos2d-js` header hoặc `CocosEngine`; Unreal: thuộc tính file exe).
- Thử mở bằng công cụ recon gợi ý: đọc được (IL, JS, `.gd`, JSON) hay bị mã hoá/biên dịch native. Đây là yếu tố lớn nhất của chi phí P1.
- Ghi vào mục **Kiểm tra tay** ở cuối `notes/recon.md`: đã xác nhận gì, bằng cách nào, còn nghi gì. Chạy lại `recon --write` giữ nguyên mục này.

## 4. Kiểm kê asset
Trong `notes/recon.md` hoặc `notes/assets.md`: số lượng và dung lượng theo loại (hình, atlas, âm thanh, nhạc, video, font, animation Spine/DragonBones, model 3D, shader), định dạng cần đổi cho web (texture ASTC/ETC/PVR/DDS → PNG/WebP; âm thanh WAV/FSB/Wwise/CRI → OGG/MP3/M4A; video USM/BK2 → MP4/WebM; font bitmap), và tổng dung lượng so với `budget.initialLoadMB`.

## 5. Báo cáo triage: `notes/triage.md`
Viết cho người dùng đọc trong hai phút:
- **Tóm tắt**: game gì, engine, 2D/3D, dạng nhận được.
- **Điểm khả thi** (1–5, mỗi mục một câu lý do): logic đọc được không · asset lấy ra được không · hợp với web không (3D nặng, vật lý, dung lượng, điều khiển cảm ứng/chuột) · phụ thuộc online (server, tài khoản, IAP, multiplayer) · tính năng cửa hàng cần map sang portal (achievement, cloud save, leaderboard, ads).
- **Ước lượng công** theo pha P1–P5 (ngày), ghi vào `budget.plannedDays` trong game.yaml để `status` cảnh báo khi vượt.
- **Rủi ro chính** và cách giảm (vd "metadata IL2CPP mã hoá → xin người dùng project gốc").
- **Đề xuất**: làm / làm với điều kiện / bỏ — kèm lý do. Đây chỉ là đề xuất; người dùng quyết.

`third-party`: thêm rủi ro clone (portal có duyệt game làm lại không) và điền `release.forbiddenTerms`.

## 6. Đóng pha
`gamekit validate`, `gamekit gate`. Mục "Đồng ý làm game này (bạn)" chỉ người dùng tick — trình bày triage và hỏi. Chỉ `gate --advance` khi người dùng đồng ý. Sang P1: skill **re-notes**, bắt đầu từ phần "Logic" và "Công cụ" của recon.
