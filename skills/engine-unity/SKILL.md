---
name: engine-unity
description: Dùng ở pha P1 khi game gốc làm bằng Unity — lấy logic từ project, Mono (ILSpy/dnSpy), IL2CPP (Il2CppDumper + gamekit ghidra) hoặc WebGL, xuất asset/scene/ScriptableObject bằng AssetRipper, đọc giá trị serialize trong prefab vào params, và map khái niệm Unity sang core/view của template.
---

# Phân tích game Unity (P1)

Phương pháp chung (câu hỏi trước, đừng tin decompiler, cách ghi kết luận): skill **re-notes**. Skill này chỉ thêm phần riêng của Unity. Code decompile và output công cụ để trong `decompiled/`, asset xuất ra để trong `reference/` (cả hai gitignored, hook chặn commit).

## 1. Lấy logic theo backend (xem `notes/recon.md`)
| Dạng | Logic | Cách đọc |
| --- | --- | --- |
| Project (`ProjectSettings/ProjectVersion.txt`) | `Assets/**/*.cs` | `own`: mở bằng Unity Editor đúng version, đọc thẳng C#; chạy trong Editor, log giá trị, viết Editor script xuất bảng làm oracle `observed` (script đó không vào repo game) |
| Mono | `Managed/Assembly-CSharp.dll` (+ `-firstpass`, DLL asmdef) | ILSpy / dnSpy, xuất ra `decompiled/ilspy/` |
| IL2CPP | `libil2cpp.so` / `GameAssembly.dll` / `UnityFramework` + `global-metadata.dat` | bước 2 |
| WebGL | `Build/*.wasm` + `Build/*.data` (giải nén `.gz`/`.br` trước) | Il2CppDumper đọc được wasm + metadata; Ghidra cần plugin WebAssembly riêng |

## 2. IL2CPP: tên trước, decompile sau
1. Il2CppDumper (binary + `global-metadata.dat`) → `decompiled/il2cpp/`: `dump.cs` (class, field kèm offset, method kèm RVA — không có thân hàm), `script.json`, `DummyDll/`. Il2CppDumper lỗi với metadata mới hoặc bị mã hoá (4 byte đầu không phải `AF 1B B1 FA`): thử Cpp2IL; vẫn không được → ghi vào `notes/QUESTIONS.md`, báo triage.
2. `npm run gk -- ghidra <apk> --entry lib/arm64-v8a/libil2cpp.so --il2cpp decompiled/il2cpp/script.json --functions 'PlayerController\$\$'`
   - Cần `GHIDRA_HOME` (Ghidra 11+, JDK 21) hoặc `--ghidra-home`. Thiếu `--entry` với file nén thì lệnh liệt kê các thư viện native để chọn. XAPK: `--entry` chỉ tìm trong file nén ngoài cùng — lấy APK con chứa `lib/` ra trước.
   - Lần đầu nhập + phân tích (libil2cpp lớn có thể mất hàng giờ; `--timeout <giây>`). Lần sau cùng tên file chỉ xuất lại: đổi `--functions` thoải mái, `--reanalyze` để phân tích lại. `--dry-run` in lệnh `analyzeHeadless`.
   - `--il2cpp` đọc `script.json` định dạng Il2CppDumper: đặt tên hàm từ `ScriptMethod`, gắn nhãn `ScriptString`, `ScriptMetadata`. IPA: `--entry Payload/<App>.app/Frameworks/UnityFramework.framework/UnityFramework`. `--functions` là regex trên tên đầy đủ (`all` = mọi hàm), tối đa `--max` hàm (mặc định 200).
   - Ra `decompiled/ghidra/<lib>/`: `functions.tsv`, `strings.tsv`, `c/<tên>@<địa chỉ>.c`; game.yaml ghi `ghidra.programs`.
3. Đọc C: `*(float *)(this + 0x2c)` → tra offset `0x2C` trong class đó ở `dump.cs` để biết là field nào. Hằng float đọc tại địa chỉ dữ liệu.

## 3. Asset và dữ liệu: AssetRipper
Xuất project vào `reference/unity/` (scene, prefab, ScriptableObject dạng YAML, texture, audio). Thư mục script do AssetRipper xuất là code decompile: để trong `decompiled/`. `own`: chọn asset cần dùng, chuyển sang định dạng web vào `assets/`/`public/`, nhãn `own`. `third-party`: chỉ là tư liệu. AssetBundle/Addressables (`StreamingAssets/`, `catalog.json`): mở thêm các bundle đó.

**Số liệu lấy từ giá trị serialize**: giá trị trong prefab/scene/ScriptableObject **ghi đè** giá trị khởi tạo trong C#; prefab variant và override trong scene (`m_Modifications`) ghi đè tiếp. Lấy giá trị cuối cùng có hiệu lực. `source` ví dụ: `reference/unity/Assets/Prefabs/Player.prefab: PlayerController.moveSpeed`, `confidence: observed`.

## 4. Map Unity → template
| Unity | Template |
| --- | --- |
| `Update` + `Time.deltaTime` | logic gameplay vào `stepWorld(…, dt)` fixed step trong `src/core/`. `Update` không nhân deltaTime là logic theo frame: ghi fps gốc (`Application.targetFrameRate`; mobile mặc định 30) và đổi đơn vị |
| `FixedUpdate` | fixed step; `Fixed Timestep` trong `ProjectSettings/TimeManager.asset` (mặc định 0.02 s) → `runtime.fixedStepHz` |
| `Time.timeScale`, coroutine `WaitForSeconds` | timer trong state, đếm bằng thời gian mô phỏng; `WaitForSecondsRealtime` chỉ cho UI |
| `Rigidbody2D`, `Physics2D` | gravity trong `Physics2DSettings.asset` × `gravityScale`; tự viết công thức trong core, chỉ dùng thư viện vật lý JS khi kết quả khớp — ghi `DECISIONS.md` |
| `Random` (UnityEngine / System) | `Rng` có seed |
| `PlayerPrefs` | `platform.save.get/set` (bất đồng bộ, chuỗi) |
| `Animator`, `AnimationClip`, `AnimationEvent` | bảng frame (thời điểm, hitbox, event) trong `params/` hoặc `spec/oracles/`; view chỉ phát hình |
| Đơn vị world, `pixelsPerUnit` (`.meta` của texture), `Camera.orthographicSize` | px = unit × PPU; chiều cao nhìn thấy = 2 × size unit. Unity y hướng lên, canvas y hướng xuống |
| Canvas, `CanvasScaler`, `Text`/`TextMeshPro` | bố cục trong `view/`; chuỗi → key trong `Language/en.json`, gọi `t()`; bảng localization gốc (nếu có) chuyển sang `Language/*.json`; ảnh có chữ → `assets/i18n/en/` + `tAsset()` |

## 5. Kết thúc
Ghi `notes/unity.md`: backend, công cụ + version đã dùng, class/hàm chứa từng cơ chế, chỗ khó chuyển sang web. Số vào `params/` có `source` + `confidence`. `third-party`: ghi chú bằng lời của mình, chỉ phân tích file tĩnh, không chạy Editor/debug game. Rồi `npm run gk -- validate`, `npm run gk -- gate`; báo người dùng câu nào trong `notes/QUESTIONS.md` còn mở. Tiếp: **re-notes** để đóng câu hỏi, rồi **gameplay-spec**, **asset-inventory**, **ui-extract**.
