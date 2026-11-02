---
name: engine-unity
description: Dùng ở P1 khi game gốc làm bằng Unity (project, hoặc bản build Mono, IL2CPP, WebGL, APK) — biết logic và số liệu nằm ở đâu, đọc IL2CPP bằng Il2CppDumper và Ghidra, lấy giá trị đã serialize trong prefab và ScriptableObject vào params, ánh xạ khái niệm Unity sang core/view của template, ghi trace từ project Unity để dựng oracle. Cũng dùng khi số đọc từ code khác với lúc chơi.
---

# Phân tích game Unity (P1)

Phương pháp chung (câu hỏi trước, đừng tin decompiler, cách ghi kết luận): skill **re-notes**. Skill này chỉ thêm phần riêng của Unity. Đánh giá vật lý: skill **physics-assess**.

Code decompile và đầu ra công cụ để trong `decompiled/` hoặc ngoài repo, asset xuất ra để trong `reference/` (đều gitignored, hook chặn commit).

## 1. Logic nằm ở đâu
Gói APK, XAPK, APKS, OBB: chạy `gamekit unpack <file> --out <thư mục ngoài repo>` trong thư mục game. Dòng **Kiểu build** trong `notes/source-unpack.md` cho biết đang ở trường hợp nào, kèm đường dẫn file logic và metadata.

| Dạng | Logic | Công cụ |
| --- | --- | --- |
| Project (có `ProjectSettings/ProjectVersion.txt`) | `Assets/**/*.cs` | Unity Editor đúng `source.engineVersion`; đọc thẳng C# |
| `mono` | `*_Data/Managed/Assembly-CSharp.dll` (APK: `assets/bin/Data/Managed/`) | ILSpy, dnSpy (IL đọc gần như source) |
| `il2cpp` | `libil2cpp.so` / `GameAssembly.dll` + `global-metadata.dat` | mục 2 |
| WebGL | `Build/*.wasm`, metadata trong `Build/*.data` (giải nén `.gz`/`.br` trước) | như IL2CPP; AssetRipper đọc `.data` |

Asset và dữ liệu, mọi dạng build: AssetRipper (xuất cả project) hoặc UABEA (xem từng asset). Với gói Android, mở cả thư mục `apk/` (và `obb/` nếu có) vì dữ liệu nằm rải ở nhiều gói. Xuất vào `reference/unity/`; phần script AssetRipper xuất ra là code decompile, chuyển sang `decompiled/`.

`unpack` báo có Addressables thì đọc `catalog` để biết bundle nào tải từ server: các bundle đó không có trong gói, ghi vào `notes/QUESTIONS.md` kèm ảnh hưởng tới bản port.

## 2. IL2CPP: tên trước, thân hàm sau
1. Il2CppDumper (binary + `global-metadata.dat`), đầu ra vào `decompiled/il2cpp/`: `dump.cs` (class, field kèm offset, method kèm RVA, không có thân hàm), `script.json`, `DummyDll/`. Lỗi với metadata mới, hoặc `unpack` báo metadata có thể đã bảo vệ (4 byte đầu không phải `AF 1B B1 FA`): thử Cpp2IL. Vẫn không được thì ghi vào `notes/QUESTIONS.md` và báo người dùng.
2. Tìm tên class, hàm trong `dump.cs` theo từng câu hỏi. Chỉ mở Ghidra khi câu hỏi còn cần thân hàm:
   ```bash
   mkdir -p .gamekit/ghidra
   analyzeHeadless .gamekit/ghidra proj -import <libil2cpp.so> \
     -scriptPath <thư mục Il2CppDumper> -postScript ghidra.py decompiled/il2cpp/script.json
   ```
   `ghidra.py` của Il2CppDumper đặt tên hàm theo `script.json`, nên sau đó tìm được theo tên C# (`PlayerController$$Update`). `libil2cpp.so` lớn có thể phân tích mất hàng giờ. Muốn có cả kiểu struct thì dùng `ghidra_with_struct.py` trong Ghidra có giao diện, sau khi nạp `il2cpp_ghidra.h` (File → Parse C Source).
3. Đọc C: `*(float *)(this + 0x2c)` → tra offset `0x2C` của class đó trong `dump.cs` để biết là field nào. Hằng float đọc tại địa chỉ dữ liệu.

Ghi lại lệnh đã chạy và phiên bản công cụ vào `notes/source-unpack.md`.

## 3. Số liệu nằm ở đâu
Tìm theo thứ tự này trước khi đào code:
- **ScriptableObject** (`*.asset`): bảng level, vũ khí, kinh tế. Thường là `observed`, chép được nguyên bảng (nhiều điểm thì vào `spec/oracles/`).
- **Serialized field trên prefab và scene**: tốc độ, máu, cooldown. Giá trị trong prefab, scene **ghi đè** giá trị khởi tạo trong C#; prefab variant và override trong scene (`m_Modifications`) ghi đè tiếp. Lấy giá trị cuối cùng có hiệu lực.
- **ProjectSettings**: `TimeManager.asset` (`Fixed Timestep`, thường 0.02 s = 50 Hz, không phải 60), `Physics2DSettings.asset` / `DynamicsManager.asset` (trọng lực, vòng lặp solver, ma trận layer), `InputManager.asset` (trục, dead zone, sensitivity).
- **Animator, `.anim`**: thời lượng, Animation Event gọi hàm gameplay (hitbox mở ở frame nào).
- **Code**: hằng số, công thức, gọi `Random`.

Ghi vào `params/*.json` với `unit`, `confidence` và `source` trỏ tới đúng asset, ví dụ `reference/unity/Assets/Prefabs/Player.prefab: PlayerController.moveSpeed`.

## 4. Unity sang template
| Unity | Template |
| --- | --- |
| `Update` + `Time.deltaTime` | logic gameplay vào `stepWorld(…, dt)` trong `src/core/`. `Update` không nhân `deltaTime` là logic theo frame: ghi fps gốc (`Application.targetFrameRate`; di động mặc định 30) và đổi đơn vị |
| `FixedUpdate` | bước cố định. `Fixed Timestep` quyết định `sim.fixedStepHz` trong `params/game.json` và `runtime.fixedStepHz` trong `game.yaml`, hai nơi phải khớp |
| `Time.timeScale`, `WaitForSeconds` | timer trong state, đếm bằng thời gian mô phỏng; `WaitForSecondsRealtime` chỉ cho UI |
| `Random` | `Rng` có seed (`src/core/rng.ts`). `Random.Range(0, 3)` với int không ra 3, tức `rng.int(0, 2)`. `Rng` là mulberry32, không cho cùng chuỗi với Xorshift128 của Unity: nội dung phải trùng chuỗi gốc thì viết đúng thuật toán trong `core/` và có oracle |
| `Mathf.Round`, `Mathf.RoundToInt`, `Mathf.Sign` | `roundToInt`, `sign` trong `src/core/mathf.ts` (làm tròn nửa về số chẵn, `sign(0) = 1`); lint cấm `Math.round`, `Math.sign` trong `core/` |
| `(int)x`, chia int | `Math.trunc` (cắt về 0, khác `Math.floor` với số âm). Xem kiểu từng biến: `7 / 2` là 3 khi cả hai là int |
| `GetKey`, `GetKeyDown`, `GetKeyUp` | `actions`, `pressed`, `released` trong `InputFrame` |
| `GetAxis` | có làm mượt theo `sensitivity`, `gravity`: lấy số từ `InputManager.asset` vào `params/` |
| `Destroy`, biến `static`, `DontDestroyOnLoad` | `Destroy` chỉ xoá ở cuối frame: đánh dấu rồi dọn cuối bước. Static sống qua lần chơi lại: đưa vào state và reset rõ ràng |
| Thứ tự `Awake → OnEnable → Start`, Script Execution Order | thứ tự gọi trong `createWorld`, `stepWorld`; nếu kết quả phụ thuộc thứ tự mà không xác định được thì ghi câu hỏi |
| `PlayerPrefs` | `platform.save.get/set` (bất đồng bộ, chuỗi); giữ khoá và giá trị mặc định |
| `Animator`, `AnimationClip`, `AnimationEvent` | bảng frame (thời điểm, hitbox, event) trong `params/` hoặc `spec/oracles/`; `view/` chỉ phát hình |
| Tween (DOTween, LeanTween) | giữ thời lượng, delay, easing; ảnh hưởng gameplay thì vào `core/` |
| World unit, `pixelsPerUnit` (`.meta` của texture), `Camera.orthographicSize` | `core/` giữ đơn vị Unity, `view/` đổi: px = unit × PPU, chiều cao nhìn thấy = 2 × size. Y Unity hướng lên, canvas hướng xuống |
| Canvas, `CanvasScaler`, `Text`, `TextMeshPro` | bố cục trong `view/`, chuỗi qua `t()` (skill **ui-extract**) |

**Vật lý.** `Rigidbody`, `Physics*`, `OnCollision*`, `OnTrigger*`: không tự kết luận ở đây. Kiểm kê và chấm từng cơ chế, chọn thư viện theo skill **physics-assess**. Số liệu vật lý vẫn đưa vào `params/` kèm `source`.

## 5. Đo game gốc bằng trace
Chỉ dùng khi có project Unity và game `own`. Chỉ còn bản build thì không gắn script được; đo bằng cách khác theo skill **re-notes**. `third-party`: chỉ phân tích file tĩnh, chạy game gốc để ghi dữ liệu chỉ khi người dùng đồng ý và ghi thành `D-n`.

1. Chép [`references/GkTraceRecorder.cs`](references/GkTraceRecorder.cs) vào `Assets/` của bản sao làm việc của project gốc, không phải repo game web. Gắn vào một GameObject.
2. Điền `fields`, ví dụ `ball.x = Ball/Transform.position.x` hoặc `level = static:GameManager.Instance.level`.
3. Chơi trong Editor. File `gk-trace.jsonl` nằm ở `Application.persistentDataPath` (đường dẫn in ra Console). Mỗi dòng có `t`, `frame` và các cột đã khai; `Vector2`, `Vector3` ghi thành object `{x,y,z}`.
4. Chọn các dòng cần so rồi viết thành `spec/oracles/<id>.json` theo skill **parity-check**: `source` ghi phiên bản Editor, scene và cách chơi, `confidence: observed`. Quỹ đạo dùng `kind: trajectory`, `stepHz` bằng tần số `FixedUpdate`, `in` là `{ scene, tick }` với tick = `t` × `stepHz`, kèm `toleranceAbs`.

Xong thì gỡ script khỏi project gốc.

## 6. Kết thúc
Ghi `notes/unity.md`: kiểu build, công cụ và phiên bản, class/hàm chứa từng cơ chế, chỗ khó chuyển sang web. `third-party`: ghi chú bằng lời của mình, không chép code decompile. Rồi `gamekit validate`, `gamekit gate`; báo người dùng câu nào trong `notes/QUESTIONS.md` còn mở. Tiếp: **re-notes** để đóng câu hỏi, rồi **gameplay-spec**, **asset-inventory**, **ui-extract**, **physics-assess**.
