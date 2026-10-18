---
name: engine-unity
description: Dùng ở P1 khi game.yaml có source.engine là unity (status gợi ý engine-unity) — biết logic và số liệu của game Unity nằm ở đâu theo từng dạng build (source, mono, il2cpp, webgl), dùng công cụ nào, và các bẫy khi chuyển sang web (Update/FixedUpdate, Time.deltaTime, Physics2D, Animator, ScriptableObject, Random, Mathf.Round). Dùng cả khi đọc C#/IL ra số khác với lúc chơi, hoặc khi cần lấy danh mục cơ chế từ IL2CPP.
---

# Phân tích game Unity (P1)

Dùng cùng skill **re-notes** (vòng hỏi → soi → đọc bằng chứng → ghi). Skill này chỉ nói phần riêng của Unity. Dạng build lấy từ `source.variant` mà `gamekit recon` ghi; chưa có thì chạy skill **game-recon** trước.

## 1. Logic và data nằm ở đâu
| `source.variant` | Logic | Data / số liệu | Asset |
| --- | --- | --- | --- |
| `source` | `Assets/**/*.cs` | prefab, scene (`.unity`), ScriptableObject (`.asset`) — YAML đọc được | `Assets/` |
| `mono` | `*_Data/Managed/Assembly-CSharp.dll` (IL, gần như source) | `*_Data/*.assets`, `level*`, `resources.assets`, AssetBundle | như data |
| `il2cpp` | `GameAssembly.dll` / `lib/*/libil2cpp.so` + `global-metadata.dat` (chỉ tên, không có thân hàm) | như mono | như mono |
| `webgl` | `Build/*.wasm` (IL2CPP biên dịch sang wasm) + metadata trong `Build/*.data` | `Build/*.data` | `Build/*.data` |

**Số liệu gameplay thường không nằm trong code.** Giá trị trường `public`/`[SerializeField]` được đặt trong Inspector và lưu ở prefab/scene/ScriptableObject; giá trị trong C# chỉ là mặc định, prefab ghi đè. Luôn đọc giá trị đã serialize (AssetRipper xuất project ra YAML) trước khi tin số trong code.

## 2. Công cụ
| Việc | Công cụ |
| --- | --- |
| Đọc C# từ Mono | REA `inspect_managed_artifact`; ILSpy / `ilspycmd`, dnSpyEx |
| IL2CPP: lấy tên type/hàm | Il2CppDumper hoặc Cpp2IL → `DummyDll/` (chữ ký, không thân hàm) + `script.json` để đặt tên trong Ghidra/IDA |
| IL2CPP: đọc thân hàm | REA `open_binary`, `analyze_function`, `find_xrefs_to_name` trên `GameAssembly.dll`/`libil2cpp.so` sau khi đã có tên |
| WebGL | REA `inspect_wasm_artifact`; Il2CppDumper có chế độ cho wasm (cần tách `global-metadata.dat` từ `.data` — kiểm chứng với phiên bản đang dùng) |
| Xuất asset, prefab, scene, ScriptableObject | AssetRipper (xuất cả project), UABEA / AssetStudio cho từng file |
| Code làm rối (recon báo) | de4dot trước khi đọc (Mono) |

Ghi code decompile vào `decompiled/` (gitignored). `third-party`: chỉ đọc file tĩnh, ghi chú bằng lời của mình.

## 3. Danh mục cơ chế
- `source`, `mono`: `gamekit recon <bản build | project> --write` lấy type từ `Assembly-CSharp.dll` / `Assets/**/*.cs` (MonoBehaviour, ScriptableObject qua cả lớp cha).
- `il2cpp`, `webgl`: chạy Il2CppDumper/Cpp2IL rồi `gamekit recon <DummyDll/Assembly-CSharp.dll | dump.cs> --write`.
- Bỏ qua bằng `ignore` những namespace UI/SDK; mỗi MonoBehaviour gameplay phải có câu hỏi hoặc nghĩa vụ.

## 4. Quy trình cho một câu hỏi
1. Tìm MonoBehaviour liên quan (tên trong danh mục; REA `trace_feature` hoặc tìm chuỗi/tên trường).
2. Đọc `Awake/Start` (khởi tạo), `Update`/`FixedUpdate`/`LateUpdate` (mỗi frame), coroutine (`IEnumerator`), handler va chạm (`OnCollisionEnter2D`, `OnTriggerEnter2D`).
3. Lấy giá trị trường từ prefab/scene/ScriptableObject đã xuất (mục 1). Ghi `source` dạng `Prefabs/Ball.prefab → Ball.speed` hoặc `Assembly-CSharp.dll Ball.Update`.
4. Đổi đơn vị (mục 5), ghi vào `params/` với `unit`, `confidence`.
5. Bảng theo level/thời gian → `spec/oracles/`; nếu là game của người dùng, sinh bằng Unity Editor: [oracle-harness](../parity-check/references/oracle-harness.md).

## 5. Bẫy khi chuyển sang web
- **Bước thời gian.** `Update` chạy mỗi frame với `Time.deltaTime`; `FixedUpdate` chạy theo `Time.fixedDeltaTime` (mặc định 0.02 s = 50 Hz, xem `ProjectSettings/TimeManager.asset`). Logic trong `FixedUpdate` → đặt `runtime.fixedStepHz` theo giá trị đó, không giữ 60 mặc định của template.
- **Code không nhân `deltaTime`** chạy theo frame: trên di động Unity mặc định 30 fps khi `Application.targetFrameRate` không đặt. Ghi rõ fps gốc khi đổi sang px/s.
- **`Time.timeScale`** ảnh hưởng `deltaTime`, `WaitForSeconds`, `FixedUpdate`; `WaitForSecondsRealtime` thì không. Pause/slow-motion của game gốc hay dùng nó.
- **Đơn vị.** 1 unit = `Pixels Per Unit` của sprite (mặc định 100 px). Camera orthographic: chiều cao nhìn thấy = `2 × orthographicSize` unit. Trục y của Unity hướng lên, canvas hướng xuống.
- **Physics2D là Box2D**: trọng lực trong `ProjectSettings/Physics2DSettings.asset` (mặc định −9.81 unit/s²), `gravityScale`, `drag`, `bounciness` trong PhysicsMaterial2D, ma trận va chạm theo layer. Tái hiện chính xác cần cùng engine (Planck.js là bản JS của Box2D, vẫn có thể lệch phiên bản) hoặc viết công thức riêng nếu game chỉ dùng va chạm đơn giản — quyết ở **runtime-select**, ghi `D-n` nếu lệch.
- **Animator**: state machine, transition có `exit time`, Animation Event gọi hàm code — gameplay có thể nằm trong animation. Đọc controller (`.controller`) và clip đã xuất.
- **Thứ tự chạy**: Awake → OnEnable → Start → Update → LateUpdate; `Script Execution Order` trong ProjectSettings có thể đổi thứ tự giữa các script.
- **Số học C#**: `Mathf.Round`/`RoundToInt` làm tròn về số chẵn khi đúng .5 (2.5 → 2), khác `Math.round` của JS; chia nguyên cắt về 0 (`Math.trunc`, không phải `Math.floor` với số âm); `float` 32-bit — dùng `Math.fround` khi cộng dồn lâu cần khớp.
- **Ngẫu nhiên**: `UnityEngine.Random` (Xorshift128; `Range(int, int)` loại trừ max, `Range(float, float)` gồm max) khác `System.Random` (có `DotNetRandom` trong template). Nội dung sinh từ seed cần nguồn đúng thuật toán + oracle `rng`.
- **PlayerPrefs** → `platform.save`; ghi lại khoá để giữ tiến trình nếu cần.
- **Tween**: DOTween/LeanTween — chép đúng thời lượng và hàm easing.

## 6. Runtime web
2D sprite: canvas/Pixi/Phaser; nhiều physics: cân nhắc Planck.js; 3D: Three.js. Quyết ở skill **runtime-select**, ghi `DECISIONS.md`.
