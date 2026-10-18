# Lấy logic và số liệu bằng Ghidra (headless / MCP)

Dùng khi **không có source**, chỉ còn bản build mà logic đã biên dịch ra mã máy: Unity **IL2CPP** (APK có `libil2cpp.so`, PC có `GameAssembly.dll`, WebGL có `.wasm`), Unreal native, game C/C++. Có source thì không cần file này: Unity dùng `gamekit unity scan` (skill engine-unity).

Unity **Mono** (có `*_Data/Managed/Assembly-CSharp.dll`) cũng không cần Ghidra: IL đọc gần như source. Không giao diện: `ilspycmd -p -o decompiled/managed <…>/Assembly-CSharp.dll`.

## Luật
- `own` (game của người dùng): được decompile, chạy, debug để đo. `third-party`: chỉ phân tích file tĩnh; ghi chú viết bằng lời của mình.
- Mọi thứ sinh ra nằm trong thư mục gitignored: project Ghidra trong `.gamekit/ghidra/`, kết quả decompile và dump trong `decompiled/`. Pre-commit chặn cả hai; không chép pseudocode vào `notes/`, `src/` hay `spec/`.
- Ghi lại trong `game.yaml`, mục `ghidra` (tự do), để phiên sau không phân tích lại:
  ```yaml
  ghidra:
    project: .gamekit/ghidra/mygame
    binary: reference/lib/arm64-v8a/libil2cpp.so
    names: il2cppdumper        # tên hàm/kiểu đã áp từ đâu
    analyzedAt: 2026-10-18
  ```

## 1. Số liệu thường KHÔNG nằm trong code
Game Unity IL2CPP vẫn để giá trị inspector trong file data (`globalgamemanagers`, `level*`, `sharedassets*.assets`, `resources.assets`, AssetBundle). Lấy chúng trước khi mở Ghidra:
1. AssetRipper: mở bản build → Export → *Unity Project* vào `reference/ripped/` (gitignored). AssetRipper phục hồi tên class và field từ metadata nên scene, prefab, ScriptableObject ra YAML có tên.
2. `gamekit unity scan --src reference/ripped` → `notes/unity/REPORT.md`, `params-draft.json` như khi có source. Script là bản rỗng (không có thân hàm, không có giá trị mặc định) — **logic** mới cần Ghidra.

Ghidra dùng cho: công thức, điều kiện, thứ tự, hằng số gõ thẳng trong code, giá trị khởi tạo của field static.

## 2. Gắn tên trước khi đọc (IL2CPP)
Không có tên, Ghidra chỉ thấy `FUN_0123abcd`. Lấy tên từ metadata:
```bash
# Il2CppDumper <binary> <global-metadata.dat> <thư mục ra>
Il2CppDumper reference/lib/arm64-v8a/libil2cpp.so reference/assets/bin/Data/Managed/Metadata/global-metadata.dat decompiled/il2cpp
```
Ra: `dump.cs` (mọi class, field kèm offset, method kèm RVA — không có thân hàm), `script.json` (địa chỉ → tên), `il2cpp.h` (struct), `ghidra.py` / `ghidra_with_struct.py` (script áp tên vào Ghidra), `DummyDll/`. Cpp2IL là lựa chọn thay thế khi Il2CppDumper không đọc được metadata (bản Unity mới, metadata bị che).

`dump.cs` là bản đồ: tìm class/method gameplay (`PlayerController.Update`, `Spawner.Loop`) và RVA của nó trước, chỉ decompile những hàm đó.

## 3. Ghidra headless
```bash
GH=<thư mục Ghidra>/support/analyzeHeadless
mkdir -p .gamekit/ghidra
# Nhập + phân tích một lần (lâu với libil2cpp.so lớn: hàng chục phút)
$GH .gamekit/ghidra mygame -import reference/lib/arm64-v8a/libil2cpp.so -log .gamekit/ghidra/analyze.log
# Áp tên từ Il2CppDumper (script nằm trong decompiled/il2cpp)
$GH .gamekit/ghidra mygame -process libil2cpp.so -noanalysis -scriptPath decompiled/il2cpp -postScript ghidra.py
```
`ghidra.py` hỏi đường dẫn `script.json` bằng `askFile`. Chạy headless thì đặt câu trả lời trong file `.properties` cùng tên script, cạnh script (Ghidra headless đọc câu trả lời `ask*` từ đó); hoặc chạy script này một lần trong giao diện Ghidra. `ghidra_with_struct.py` cần nạp `il2cpp.h` trước (File › Parse C Source) — làm trong giao diện, rồi quay lại headless.

Sau bước này các lệnh sau dùng `-process … -noanalysis` (không phân tích lại), kèm script xuất pseudocode của danh sách hàm cần đọc ra `decompiled/`.

WebGL: cần plugin wasm cho Ghidra; Il2CppDumper đọc được `.wasm` + `global-metadata.dat` (lấy từ file `.data` đã giải nén).

## 4. Ghidra qua MCP
Nếu phiên có MCP server cho Ghidra, dùng nó thay cho script tay. Server khác nhau thì tên tool khác nhau — đọc danh sách tool của phiên. Loại chạy headless không cần mở giao diện; loại plugin (ví dụ GhidraMCP) cần Ghidra đang mở với project đã nạp. Thao tác cần có, theo thứ tự:
1. Mở project `.gamekit/ghidra/<tên>` đã phân tích và áp tên (bước 3) — không nhập lại binary mỗi phiên.
2. Tìm hàm theo tên (`PlayerController$$Update`) hoặc theo RVA trong `dump.cs`.
3. Decompile **một** hàm; đọc thêm hàm nó gọi khi cần.
4. Đọc dữ liệu tại địa chỉ (hằng số float/double, bảng).
5. Xem xref: ai gọi hàm này, ai ghi field này (offset trong `dump.cs`).
6. Đổi tên / thêm comment khi đã hiểu, để lần sau đọc nhanh hơn.

Bắt đầu từ câu hỏi trong `notes/QUESTIONS.md`, không duyệt cả binary. Mỗi câu hỏi → các hàm cần đọc → kết luận ghi vào `notes/` (vị trí = `Class$$Method` + RVA) → số vào `params/` với `confidence`.

## 5. Đọc pseudocode IL2CPP
- Method nhận `this` là tham số đầu và thêm `MethodInfo*` ở cuối: `PlayerController$$Jump(PlayerController_o *this, MethodInfo *method)`. Bỏ qua tham số cuối.
- Field truy cập bằng offset: `*(float *)(this + 0x1c)` — tra offset trong `dump.cs` (`public float speed; // 0x1C`). Áp `il2cpp.h` thì Ghidra hiện thẳng `this->fields.speed`.
- Nhiễu bỏ qua: `il2cpp_codegen_initialize_runtime_metadata`, `il2cpp_runtime_class_init`, `NullCheck`, kiểm tra biên mảng, `sub_…` ném exception.
- Giá trị khởi tạo field static và `static readonly` nằm trong `Class$$.cctor`. `const` được thay thẳng vào chỗ dùng — tìm theo giá trị.
- Hằng số float: pseudocode thường ghi `DAT_…`; đọc giá trị tại địa chỉ đó (4 byte float / 8 byte double), không đoán.
- `Random.Range`, `Mathf.*`, `Time.get_deltaTime` vẫn là lời gọi có tên — ngữ nghĩa giống bảng trong skill engine-unity (`references/pitfalls.md`): khi port dùng `src/core/unity/`.
- Coroutine biên dịch thành class `<Tên>d__N` với `MoveNext`: mỗi `case` của `switch (this->__1__state)` là một đoạn giữa hai `yield`.
- `async`, LINQ, lambda: class sinh tự động `<>c`, `<>c__DisplayClass…` — thân lambda nằm ở đó.

Sau đó áp đúng mục "Đừng tin decompiler một mình" trong SKILL.md: đối chiếu assembly, xem chỗ gọi hàm, ghi `confidence`.
