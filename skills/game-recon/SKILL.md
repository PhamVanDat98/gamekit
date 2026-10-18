---
name: game-recon
description: Dùng ở P0 khi bắt đầu một game — nhận diện game gốc (engine, phiên bản, dạng build, nơi chứa logic và data, SDK, dấu hiệu làm rối code) bằng gamekit recon, kiểm chứng kết quả, ghi notes/recon.md, game.yaml và danh mục cơ chế spec/inventory.yaml. Dùng cả khi engine trong game.yaml là unknown, khi có bản build mới của game gốc, hoặc sau khi chạy Il2CppDumper/GDRE để lấy danh mục cơ chế.
---

# Nhận diện game gốc (P0)

Recon quyết định đường đi của cả dự án: công cụ RE nào, khó tới đâu, mất bao lâu. Máy làm phần này chắc hơn đoán, nên luôn chạy script trước rồi mới kết luận.

## 1. Chạy recon
```
gamekit recon <thư mục game gốc | file .apk/.ipa/.zip> --write
```
Không có đường dẫn thì dùng `source.path` trong `game.yaml`. Đưa **bản build** (thư mục chứa `*_Data/`, file APK…) hoặc **project source** (thư mục có `Assets/` + `ProjectSettings/`, `project.godot`…). Có cả hai thì chạy cả hai: source cho logic, bản build cho thứ thực sự phát hành.

`--write` ghi:
- `notes/recon.md`: báo cáo, kèm đánh giá khả thi. Phần dưới "Ghi chú thêm" được giữ khi chạy lại.
- `game.yaml`: `source.engine` (chỉ khi đang `unknown`), `engineVersion`, `variant`, `dimension` (2d/3d), `physics` (rigidbody/kinematic/none), `path`, và `budget.plannedDays` cho pha chưa có số.
- `spec/inventory.yaml`: danh mục type gameplay (khi đọc được), chạy lại chỉ thêm mục mới.

`--json` cho agent đọc.

## 2. Kiểm chứng, đừng chép lại
Recon đọc tên file và header. Nó có thể sai hoặc thiếu:
- Mục **Chưa biết** là thứ recon không tự xác định được. Tự tìm, ghi kết quả vào "Ghi chú thêm".
- Engine ghi trong `game.yaml` khác với recon: recon cảnh báo và không ghi đè. Kiểm tra lại, sửa tay bên đúng.
- SDK **mạng / dữ liệu phía server** nghĩa là một phần gameplay có thể nằm trên server (bảng xếp hạng, nạp level, PvP). Hỏi người dùng phần đó làm thế nào trên web.
- **2D/3D, loại vật lý** đọc từ type mà code của game dùng (Rigidbody, CharacterController, Rigidbody2D, node Godot…). Vật lý chỉ gắn trong prefab/scene mà code không đụng tới thì recon không thấy — mở vài prefab/scene chính để chắc. IL2CPP: chỉ biết sau khi recon trên `dump.cs`/DummyDll.
- Không thấy dấu hiệu làm rối code không có nghĩa là không bị làm rối. Recon chỉ biết vài dấu hiệu phổ biến.

## 3. Danh mục cơ chế khi recon không tự lấy được
- **Unity IL2CPP**: chạy Il2CppDumper (hoặc Cpp2IL) trên `GameAssembly.dll`/`libil2cpp.so` + `global-metadata.dat`, rồi `gamekit recon <DummyDll/Assembly-CSharp.dll> --write` hoặc `gamekit recon <dump.cs> --write`. Lệnh RE chạy qua Bash được ghi vào nhật ký RE.
- **Godot .pck nhúng trong exe / bị mã hoá**: GDRE Tools khôi phục project rồi `gamekit recon <thư mục project> --write`.
- **Construct**: logic nằm trong event sheet (`data.json`). Lập danh mục tay, mỗi sheet/nhóm event một mục.
- **Cocos .jsc**: cần khoá xxtea trong `libcocos2djs.so` trước. Tìm bằng REA (`open_binary`, tìm chuỗi gần `xxtea`), giải mã, rồi chạy recon trên thư mục đã giải mã.

## 4. Xong P0
- Báo người dùng: engine + dạng build, nơi chứa logic, SDK đáng chú ý, rủi ro, điểm khả thi và số ngày dự kiến (skill **triage**).
- `gamekit gate`: mục recon được chấm tự động (`{auto: file:notes/recon.md}`).
