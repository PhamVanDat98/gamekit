---
name: engine-unreal
description: Dùng ở P1 khi game.yaml có source.engine là unreal (status gợi ý engine-unreal) — đọc .pak bằng FModel (khoá AES, mappings .usmap), lấy DataTable và thuộc tính Blueprint, phân tích code native C++ bằng REA/Ghidra, và các bẫy (Tick với DeltaSeconds, đơn vị cm, physics Chaos/PhysX, 3D). Dùng cả khi cần đánh giá lại khả thi vì game Unreal thường 3D và nặng.
---

# Phân tích game Unreal (P1)

Dùng cùng skill **re-notes**. Unreal hiếm khi hợp để dựng lại thành web game nhỏ: xem lại đánh giá khả thi (skill **triage**) trước khi đi sâu.

## 1. Logic và data nằm ở đâu
| Thứ | Ở đâu |
| --- | --- |
| Asset, Blueprint, DataTable | `*.pak` (UE4/5), có thể kèm `*.utoc/*.ucas` (IoStore, UE5) — có thể mã hoá AES |
| Logic C++ | `*-Shipping.exe` (Windows), `libUE4.so`/`libUnreal.so` (Android) — native, không có symbol |
| Logic Blueprint | bytecode Kismet trong `.uasset` của Blueprint |
| Số liệu | DataTable / CurveTable (bảng, rất tốt cho params và oracle), giá trị mặc định thuộc tính trong Blueprint (CDO) |

## 2. Công cụ
| Việc | Công cụ |
| --- | --- |
| Duyệt và xuất `.pak`, DataTable, thuộc tính | FModel (cần đúng phiên bản UE; khoá AES nếu mã hoá; UE5 thường cần file mappings `.usmap`) |
| Đọc bytecode Blueprint | UAssetGUI hiển thị được Kismet bytecode cho nhiều phiên bản — kiểm chứng với phiên bản game |
| Code C++ native | REA `binary_overview`, `open_binary`, `analyze_function`, `find_xrefs_to_name`; Ghidra/IDA |
| Tìm khoá AES | khoá nằm trong binary — tìm bằng REA/Ghidra; chỉ với game của người dùng hoặc khi có quyền |

`third-party`: chỉ đọc file tĩnh, không gắn vào game đang chạy.

## 3. Danh mục cơ chế
Recon không tự lập. Lập tay: mỗi Blueprint gameplay (Character, Pawn, GameMode, Actor có Tick/event) một mục; DataTable lớn một mục; class C++ đặt tên rõ (từ chuỗi RTTI/reflection) một mục.

## 4. Quy trình cho một câu hỏi
1. Tìm Blueprint/DataTable liên quan trong FModel; số trong DataTable → `params/`/`spec/oracles/` trực tiếp (`confidence: observed`).
2. Hành vi trong Blueprint: đọc graph/bytecode các event `BeginPlay`, `Tick`, `OnComponentHit`…
3. Hành vi trong C++: tìm hàm qua chuỗi tên property/function (Unreal reflection giữ tên) rồi `analyze_function`.
4. `source` dạng `Game.pak → /Game/Data/DT_Enemies (row Goblin.Speed)`. Oracle từ game gốc: [oracle-harness](../parity-check/references/oracle-harness.md) (native: ghi lại khi chạy hoặc giả lập hàm).

## 5. Bẫy khi chuyển sang web
- **Tick(DeltaSeconds)** theo frame; có thể đặt `TickInterval` riêng; physics substepping.
- **Đơn vị cm**, trục Z hướng lên, góc độ (Rotator: Pitch/Yaw/Roll).
- **CharacterMovementComponent** có rất nhiều tham số (MaxWalkSpeed, GravityScale, JumpZVelocity, AirControl…) và logic phức tạp — tái hiện gần đúng, ghi `D-n`.
- Physics PhysX (UE4) / Chaos (UE5) — không khớp được chính xác bằng engine web.
- RNG: `FMath::Rand` (C rand) và `FRandomStream` (có seed, thuật toán riêng — kiểm chứng trong code nếu cần khớp chuỗi).

## 6. Runtime web
3D: Three.js/Babylon.js; 2D (Paper2D): Pixi/Phaser. Quyết ở **runtime-select**.
