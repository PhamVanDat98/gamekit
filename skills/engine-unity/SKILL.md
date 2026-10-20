---
name: engine-unity
description: Dùng ở P1 khi game gốc làm bằng Unity (project, bản build Mono, IL2CPP, WebGL, APK) — tìm logic và số liệu, đọc đúng đơn vị và vật lý Unity, xuất sprite sheet và âm thanh sang web, ghi trace từ game gốc bằng GkTraceRecorder để dựng oracle.
---

# Phân tích game Unity (P1)

Đi cùng skill **re-notes** (cách đặt câu hỏi, ghi kết luận, độ tin cậy). Skill này chỉ thêm phần riêng của Unity. Bắt đầu từ `spec/recon.json`: `flavour` cho biết đang ở trường hợp nào.

## 1. Logic nằm ở đâu
| `flavour` | Logic | Công cụ |
| --- | --- | --- |
| `unity-project` | `Assets/**/*.cs` | Unity Editor đúng `source.engineVersion`; đọc thẳng C# |
| `unity-mono` | `*_Data/Managed/Assembly-CSharp.dll` (APK: `assets/bin/Data/Managed/`) | ILSpy hoặc dnSpyEx (đọc IL gần như source) |
| `unity-il2cpp` | `libil2cpp.so` / `GameAssembly.dll` + `global-metadata.dat` | Il2CppDumper hoặc Cpp2IL lấy tên kiểu/hàm, rồi Ghidra |
| `unity-webgl` | `Build/*.wasm`, metadata trong `Build/*.data` | như IL2CPP; AssetRipper đọc `.data` |

Asset và data (mọi dạng build): AssetRipper (xuất cả project) hoặc UABEA (xem từng asset).

### IL2CPP với Ghidra headless
Kết quả decompile và project Ghidra để ngoài repo hoặc trong `.gamekit/ghidra/`, `decompiled/` (đều gitignored, hook chặn commit).
```bash
Il2CppDumper libil2cpp.so global-metadata.dat .gamekit/ghidra/dump
analyzeHeadless .gamekit/ghidra proj -import libil2cpp.so \
  -scriptPath <thư mục Il2CppDumper> -postScript ghidra.py .gamekit/ghidra/dump/script.json
```
`ghidra.py` của Il2CppDumper đặt tên hàm theo `script.json` (đối số của script, thay cho hộp chọn file), nên sau đó tìm được theo tên class C# (`PlayerController$$Update`). Muốn có cả kiểu struct thì dùng `ghidra_with_struct.py` trong Ghidra có giao diện, sau khi nạp `il2cpp_ghidra.h` (File → Parse C Source); bước nạp header này không chạy headless được. `dump.cs` chỉ là chữ ký, đọc để định hướng.

## 2. Số liệu nằm ở đâu
Tìm theo thứ tự này trước khi đào code:
- **ScriptableObject** (`*.asset`): bảng level, vũ khí, kinh tế. Thường là `observed`, chép được nguyên bảng.
- **Serialized field trên prefab và scene**: tốc độ, máu, cooldown. Giá trị trong inspector **ghi đè** giá trị mặc định trong code. Đọc prefab, đừng chỉ đọc khai báo trong `.cs`.
- **ProjectSettings**: `TimeManager.asset` (`Fixed Timestep`, thường 0.02 = 50 Hz, không phải 60), `Physics2DSettings.asset` / `DynamicsManager.asset` (gravity, iterations), `InputManager.asset` (trục, dead zone, sensitivity).
- **Animator / `.anim`**: thời lượng, sự kiện animation gọi hàm gameplay (hitbox mở ở frame nào).
- **Code**: hằng số, công thức, `Random.Range` (Unity dùng Xorshift128; `Range(int, int)` không lấy cận trên).

Ghi vào `params/*.json` với `unit` và `source` trỏ tới asset/prefab/field cụ thể.

## 3. Đơn vị và vật lý
- Unity tính bằng **world unit**. Đổi sang px: `px = unit × pixelsPerUnit` (lấy PPU của sprite, `gamekit assets scan` ghi `unity.ppu`). Nếu camera orthographic: `chiều cao màn hình (unit) = 2 × orthographicSize`. Ghi cách đổi trong `params` (`unit`, `source`).
- Trục Y Unity hướng lên, canvas web hướng xuống.
- `Update` chạy theo frame (`Time.deltaTime`), `FixedUpdate` theo bước cố định. Biết logic nằm ở hàm nào để chọn `runtime.fixedStepHz` và đặt `tolerance`.
- Rigidbody2D (Box2D) có drag, bounciness (Physics Material 2D), interpolation, collision detection. Engine vật lý JS sẽ không khớp từng frame. Ưu tiên tái hiện **hành vi đo được** (quỹ đạo, thời gian rơi) bằng công thức trong `core/`, ghi sai khác thành `D-n`.

## 4. Xuất asset
- Sprite sheet (spriteMode multiple, cắt trong `.meta`): xuất PNG đúng kích thước gốc, rồi `gamekit assets unity-atlas <ảnh.png> --to assets/<…>.json` để ra atlas JSON (Pixi, Phaser đọc được; y đã lật, pivot thành anchor, 9-slice thành borders).
- Nén: `gamekit assets convert <thư mục> --to assets/<…> --label own` (ảnh → webp, âm thanh → mp3). Đổi ảnh sang webp thì tạo lại atlas với `--image <tên>.webp`.
- `third-party`: asset gốc chỉ vào `reference/`, không convert để phát hành (skill **asset-inventory**).

## 5. Đo game gốc bằng trace (chỉ `own`)
Có project Unity thì ghi trạng thái thật thay vì đoán:
1. Chép [`references/GkTraceRecorder.cs`](references/GkTraceRecorder.cs) vào `Assets/` của project gốc (bản sao làm việc, không phải repo game web). Gắn vào một GameObject.
2. Điền `fields`, ví dụ `obstacle.speed = Spawner/ObstacleSpawner.currentSpeed` hoặc `level = static:GameManager.Instance.level`.
3. Chơi trong Editor. File `gk-trace.jsonl` nằm ở `Application.persistentDataPath` (in ra Console).
4. `gamekit oracle import gk-trace.jsonl --to spec/oracles/<id>.json --in t --out obstacle.speed --source "<Editor x.y, scene, cách chơi>" --at t=0,5,10,30`

Định dạng trace và cách chọn dòng: skill **parity-check**. Xong thì gỡ script khỏi project gốc.

`third-party`: không chạy game gốc để đo, trừ khi người dùng đồng ý và có `D-n`. Chỉ phân tích tĩnh, ghi chú bằng lời của mình, không chép code decompile.
