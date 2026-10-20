---
name: game-recon
description: Dùng ở pha P0 khi vừa nhận một game gốc (project, bản build, APK/XAPK/IPA, zip) — nhận diện engine, version, scripting backend, chỗ chứa logic/dữ liệu, kiểm kê file bằng `gamekit recon --write`, kiểm tra tay khi recon không chắc; ra notes/recon.md và source.engine/engineVersion/path trong game.yaml.
---

# Nhận diện và kiểm kê game gốc (P0)

Mục tiêu: biết game làm bằng gì, logic và dữ liệu nằm ở đâu, có bao nhiêu nội dung — đủ để triage. Chưa đào logic ở bước này (đó là P1: engine-*, re-notes).

`own` (mặc định): được cài và chạy game gốc để quan sát — chơi qua các màn chính, quay video luồng chơi, ghi lại tính năng online (đăng nhập, IAP, bảng xếp hạng). `third-party`: đọc file tĩnh; được chơi bình thường bản người dùng có và quay màn hình; không debug, hook, sửa bộ nhớ, chặn mạng hay phá mã hoá.

## 1. Đặt game gốc đúng chỗ
- Game gốc nằm **ngoài** thư mục game web (`recon` từ chối đường dẫn bên trong). Có project gốc thì trỏ vào project, không trỏ vào bản build.
- Chưa có game web: chạy `gamekit recon <đường dẫn>` (chỉ in, không ghi) để biết engine, rồi tạo game theo mục "Tạo game mới" của skill using-gamekit (hỏi người dùng từng câu; `--engine <engine> --set sourcePath=<đường dẫn>`, thêm `--third-party` nếu làm lại game người khác).

## 2. Chạy recon
`npm run gk -- recon <đường dẫn> --write` trong thư mục game (bỏ đường dẫn thì dùng `source.path`; `--json` in kết quả thô).
- Đọc thư mục, hoặc `.apk/.xapk/.apks/.aab/.ipa/.zip/.obb` mà không giải nén cả gói. XAPK/APKS: các APK con được giải nén tạm (xoá ngay sau đó) và liệt kê dưới `<tên>.apk!/`; APK con hỏng được ghi lại, không làm dừng recon.
- Ra: engine, version (đọc header file, chỉ file ≤ 64 MB trong file nén), backend Unity (Mono / IL2CPP / IL2CPP WebGL), file logic, file dữ liệu, công cụ gợi ý, kiểm kê theo loại và đuôi.
- `--write`: ghi đè `notes/recon.md`; ghi `source.path`, và `source.engine`/`engineVersion` nếu nhận ra. Engine mới khác engine cũ thì recon cảnh báo — xem lại.

## 3. Khi recon không chắc
| Recon báo | Kiểm tra tay |
| --- | --- |
| `Cũng khớp: …` | Xem `lib/<abi>/*.so` (thư viện lớn nhất thường là engine), thư mục gốc của `assets/`. App Flutter/Android có thể nhúng Unity hoặc Cocos: engine là nơi gameplay chạy. |
| `không nhận ra` / `unknown` | `strings` trên `.so`/exe lớn nhất tìm tên engine ("Unity", "cocos2d", "Godot Engine", "GameMaker"…); `classes*.dex` → jadx. Rồi sửa tay `source.engine` trong game.yaml (giá trị trong schema; engine không có tên riêng → `other`). |
| Không có version | Unity: chuỗi dạng `2021.3.16f1` ở đầu `globalgamemanagers`/`data.unity3d`/`*.assets`. Godot: header `.pck`. Ghi tay `source.engineVersion`. |
| Dữ liệu ít bất thường | Dữ liệu nằm ngoài APK: `.obb` trong XAPK (chạy recon riêng trên file `.obb`), AssetBundle/Addressables tải từ server (game cần mạng — ghi rủi ro cho triage). |

IPA: binary nằm ở `Payload/<App>.app/` (Unity: `Frameworks/UnityFramework.framework/UnityFramework`). IPA tải từ App Store bị mã hoá FairPlay — binary không đọc được; `own` thì dùng bản build từ Xcode/archive của người dùng.

## 4. Bổ sung kiểm kê cho triage
Recon đếm file đóng gói (một `.assets` chứa hàng trăm sprite), chưa đếm nội dung thật. Thêm vào cuối `notes/recon.md` mục **Kiểm tra tay** (chạy lại `--write` sẽ ghi đè — chép mục này ra trước):
- Số màn/scene, số level, chế độ chơi; ngôn ngữ có sẵn.
- Phụ thuộc online: tên DLL/package/class (Photon, Mirror, PlayFab, Firebase, AdMob/AppLovin, IAP), quyền mạng trong manifest.
- 2D hay 3D; điều khiển (chạm nhiều điểm, nghiêng máy, giữ/vuốt); dung lượng hình và âm thanh so với `budget.initialLoadMB`.
- Mỗi mục ghi đã xem ở đâu; không thấy chỉ có nghĩa là không thấy trong phạm vi đó.

Phương pháp RE chung (công cụ theo engine, đừng tin decompiler một mình): skill **re-notes**.

## 5. Kết thúc
1. `npm run gk -- validate`; `npm run gk -- gate` — các mục `field:source.engine`, `field:source.path` phải xanh.
2. Tick mục "Đã nhận diện engine, version và kiểm kê…" trong `gates/P0.md` khi đã kiểm xong (mục "(bạn)" thì không).
3. Báo người dùng: engine + version + backend, logic/dữ liệu ở đâu, dung lượng, điều recon chưa chắc và đã kiểm tay thế nào, điều còn chưa biết.
4. Tiếp: skill **triage**.
