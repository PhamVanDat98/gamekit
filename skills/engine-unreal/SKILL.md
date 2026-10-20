---
name: engine-unreal
description: "Dùng ở pha P1 khi gamekit recon báo engine Unreal (UE4/UE5 — .uproject, .pak/.utoc/.ucas, libUE4.so/libUnreal.so) — mở asset bằng FModel/UModel, tách logic Blueprint với C++ native (Ghidra qua gamekit ghidra), lấy số từ DataTable/CurveTable/giá trị mặc định, đổi Tick(DeltaTime) sang fixed step, UMG text sang t(), và ghi những giới hạn 3D khi lên web vào notes/."
---

# Phân tích game Unreal (P1)

Phương pháp chung (câu hỏi trước, ghi kết luận, confidence) theo skill **re-notes**; skill này chỉ thêm phần riêng của Unreal. Ghi chung vào `notes/unreal.md`, chủ đề lớn tách file riêng.

## 1. Có gì trong tay
| Recon thấy | Nghĩa | Làm gì |
| --- | --- | --- |
| `*.uproject` (+ `Source/`, `Content/`) | project gốc (`own`) | mở bằng Unreal Editor đúng bản (`EngineAssociation`, recon ghi vào `engineVersion`); C++ đọc thẳng `Source/<Module>/`, Blueprint xem trong editor |
| `Content/Paks/*.pak` | build cũ (UE4 ≤ 4.25) | FModel / UModel |
| `*.utoc` + `*.ucas` (+ `global.utoc`) | IoStore (UE 4.26+ / UE5) | FModel (UModel không đọc IoStore) |
| `lib/*/libUE4.so`, `libUnreal.so` | APK; pak có thể nằm trong OBB (`main.<ver>.<package>.obb`) | `gamekit recon` đọc được `.obb`; code native nằm trong chính `.so` này |

FModel cần chọn đúng bản UE trong Settings. Pak mã hoá cần **AES key**: `own` lấy từ project của người dùng (`Config/DefaultCrypto.ini`, hoặc Project Settings → Crypto) hoặc hỏi họ. UE5 cook "unversioned properties" cần file mappings `.usmap`; `own` được chạy game của mình để dump. `third-party`: không phá mã hoá, không chèn công cụ vào game đang chạy — thiếu key/mappings thì chỉ dùng phần đọc được và đo từ video (skill **engine-other** § video).

## 2. Blueprint hay C++?
- Asset `BP_*.uasset` (class `*_C`) là Blueprint. FModel xuất ra JSON: **giá trị mặc định** (object `Default__BP_X_C` và component con, vd `CharacterMovementComponent`) đọc rõ — nguồn `observed` tốt nhất. Graph là bytecode Kismet: đọc được nhưng chậm; chỉ đào khi còn câu hỏi cụ thể.
- Import `/Script/<Module>` trong uasset = class native → logic nằm trong binary: `<Game>-Win64-Shipping.exe` hoặc `libUE4.so`.
- Native: `gamekit ghidra <file> [--entry lib/arm64-v8a/libUE4.so]` (Ghidra 11+, `GHIDRA_HOME`; bỏ `--entry` để xem danh sách `.so` trong APK/XAPK). Lần đầu nhập + phân tích (binary UE rất lớn, có thể hàng giờ; `--timeout <giây>` giới hạn phân tích mỗi file), các lần sau chỉ xuất lại; `--reanalyze` để phân tích lại. Kết quả: `decompiled/ghidra/<file>/functions.tsv`, `strings.tsv`, và `c/` cho hàm khớp `--functions <regex>` (tối đa `--max`, mặc định 200). Bản Shipping thường không có symbol: lần từ chuỗi tên UPROPERTY/UFUNCTION trong `strings.tsv` tới hàm dùng chúng. `--dry-run` in lệnh `analyzeHeadless` mà không chạy.

## 3. Số liệu
| Nguồn | Cách đọc | `params` |
| --- | --- | --- |
| DataTable (`DT_*`) | FModel → JSON, mỗi dòng một row | `source`: `Content/…/DT_Enemy.uasset row Goblin.MaxHP`, `observed` |
| CurveTable / CurveFloat / Timeline | key (time, value) + kiểu nội suy (linear/constant/cubic có tangent) | bảng nhiều điểm → `spec/oracles/`; cubic phải tái hiện tangent, đừng thay bằng linear |
| Giá trị mặc định BP / component | JSON của CDO | `MaxWalkSpeed`, `JumpZVelocity`, `GravityScale`… |
| Config | `DefaultGame.ini`, `DefaultEngine.ini` | frame rate cố định, physics |

Đơn vị Unreal: 1 unit = 1 cm, góc theo độ, trục Z hướng lên, hệ tay trái. Ghi `unit` đúng (`cm/s`, `cm/s²`); đổi sang hệ của bản web ở một chỗ duy nhất trong `core/`. Gravity mặc định của project là −980 cm/s², nhân `GravityScale`.

## 4. Thời gian: Tick(DeltaTime) → fixed step
- Logic nhân `DeltaTime` đã tính theo giây: dùng thẳng với `dt` của fixed step.
- Logic **không** nhân `DeltaTime` thì phụ thuộc frame rate: tìm giới hạn fps (`bUseFixedFrameRate`/`FixedFrameRate`, `bSmoothFrameRate`, `t.MaxFPS`; mobile hay khoá 30) và ghi `unit` dạng `cm/frame@30fps`.
- `SetTimer`, Timeline, delay trong BP → giây; `CharacterMovementComponent` tự chia bước (`MaxSimulationTimeStep`, `MaxSimulationIterations`) — ghi lại nếu cần parity chính xác.
- Ngẫu nhiên: `FRandomStream` có seed tái hiện được; `FMath::Rand`/`RandomFloat` thì chỉ so phân phối.

## 5. UI và text
Widget Blueprint (`WBP_*`): TextBlock giữ `FText` (namespace, key, chuỗi gốc). Bản dịch có sẵn ở `Content/Localization/Game/<culture>/Game.locres` (FModel đọc được). `own`: chuyển chuỗi và bản dịch vào `Language/<mã>.json`, view gọi `t('<key>')`; ảnh có chữ vào `assets/i18n/<mã>/` qua `tAsset()`, `text: true` trong `asset-manifest.json`. `third-party`: text viết mới (rename-and-text ở P3). Bố cục từng màn ghi cho skill ui-extract.

## 6. Thực tế 3D trên web
Ghi vào `notes/unreal.md` mục "Khó chuyển sang web" để P2 (runtime-select) quyết, kèm đề xuất `D-n` nếu phải khác bản gốc:
- Renderer: Three.js (`runtime.kind: 3d`, `renderer: three`). Lumen, Nanite, đổ bóng động nhiều đèn, post-process nặng không có sẵn — bake ánh sáng, giảm đèn.
- Mesh/animation: FModel/UModel xuất psk hoặc glTF (tuỳ bản) → chuẩn hoá trong Blender → glTF nén (Draco/meshopt), texture KTX2. Material node graph phải dựng lại gần đúng bằng material chuẩn; Niagara/Cascade dựng lại bằng tay.
- Ngân sách: `budget.initialLoadMB` (mặc định 10), `minFpsMobile` trong `game.yaml`. Ước lượng tổng dung lượng asset sau nén ngay từ P1; asset lớn tải sau từ `public/StreamingAssets/`.
- Âm thanh: USoundWave (ogg/ADPCM, UE5 có thể Bink Audio) hoặc Wwise `.wem` — mỗi loại cần cách xuất riêng, ghi rõ.
- `own`: asset xuất ra vào `assets/`/`public/` với nhãn `own` (`gamekit provenance add … --label own --source <đường dẫn trong pak>`). `third-party`: chỉ để trong `reference/`.

Không commit thứ gì từ `decompiled/`, JSON dump của Blueprint hay code C++ gốc.

## 7. Kết thúc
Cập nhật `notes/QUESTIONS.md` (câu nào bị chặn vì thiếu key/mappings ghi rõ lý do), `params/` đủ `source` + `confidence`, chạy `gamekit validate`. Báo người dùng: bản UE, Blueprint hay native, phần đọc được / phải đo video, ước lượng dung lượng 3D. Tiếp theo: **re-notes** cho từng câu còn mở → gameplay-spec → `gamekit gate`.
