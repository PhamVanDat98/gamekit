---
name: re-notes
description: Dùng ở P1 khi phân tích game gốc để trích logic, số liệu và cơ chế — xác định engine và nơi chứa logic/data, đặt câu hỏi trong notes/QUESTIONS.md, ghi kết luận kèm vị trí và độ tin cậy, đưa số vào params/ có source + confidence. Dùng cả khi kết quả decompile trông vô lý hoặc cần đối chiếu nhiều nguồn.
---

# Ghi chú reverse engineering (P1)

Mục tiêu: hiểu game gốc đủ để viết lại hành vi. Ghi chú nằm trong `notes/`; số liệu vào `params/`; code decompile chỉ nằm trong `decompiled/` (gitignored, hook chặn commit).

Game của người dùng (`source.ownership: own`, mặc định): có source thì đọc thẳng, không cần decompile; mất source (chỉ còn APK/bản build) thì decompile chính game đó, được chạy và debug để đo. Ghi chú chỉ cần nói logic nằm ở đâu và chỗ nào khó chuyển sang web. Làm lại game người khác (`third-party`): ghi chú viết bằng lời của mình, chỉ phân tích file tĩnh.

## 1. Câu hỏi trước, công cụ sau
Mở `notes/QUESTIONS.md`. Biến yêu cầu thành danh sách câu hỏi, mỗi câu ghi rõ cần loại bằng chứng gì: "tốc độ đạn bao nhiêu px/s, tăng theo level thế nào?" → cần hằng số và hàm cập nhật đạn. Mỗi câu có trạng thái: `mở` · `một phần` · `đã trả lời`.

Trước khi mở công cụ, xem lại `notes/` và `params/` đã có gì. Không phân tích lại thứ đã có kết luận.

## 2. Xác định target: logic và data nằm ở đâu
| Engine / dạng build | Logic | Data / asset | Công cụ thường dùng |
| --- | --- | --- | --- |
| Unity Mono | `*_Data/Managed/Assembly-CSharp.dll` (IL, đọc gần như source) | `*.assets`, ScriptableObject | ILSpy / dnSpy; AssetRipper, UABEA |
| Unity IL2CPP | `GameAssembly.dll` / `libil2cpp.so` + `global-metadata.dat` | như Mono | Il2CppDumper / Cpp2IL để lấy tên, rồi Ghidra |
| Unity WebGL | `Build/*.wasm` (+ `*.framework.js`) | `Build/*.data` | như IL2CPP; AssetRipper cho data |
| HTML5, Cocos Creator, Construct, Laya | bundle JS (có thể có source map) | JSON, atlas | đọc bundle, tách module, source map |
| Godot | `.pck` → script `.gd` | `.tres`, `.tscn` | GDRE Tools |
| Flash | `.swf` (ActionScript) | trong swf | JPEXS FFDec |
| Unreal | Blueprint / native trong `.pak` | `.uasset` | FModel / UModel; native: Ghidra |
| Native cũ (C/C++) | exe/dll | file data riêng | Ghidra / IDA |

APK: nhìn `lib/*/` để nhận engine (`libunity.so`, `libil2cpp.so`, `libcocos2djs.so`, `libgodot_android.so`).

Nếu phiên có công cụ MCP reverse engineering (ví dụ rea: `open_binary`, `analyze_function`, `analyze_javascript_application`, `inspect_managed_artifact`), dùng chúng cho bước phân tích tĩnh. Bắt đầu từ bản tóm tắt; chỉ đào sâu khi còn một câu hỏi cụ thể; không chạy lại một phân tích y hệt.

`third-party`: chỉ phân tích file tĩnh của bản mà người dùng có; không can thiệp game đang chạy, không đụng server online.

## 3. Đừng tin decompiler một mình
- Pseudocode có thể **sai chữ ký hàm**: báo hàm không có tham số trong khi lệnh máy đọc tham số trên stack. Đối chiếu với assembly/IL, và xem **chỗ gọi hàm** để biết tham số thật là gì (vd `20 + 30 × tile_x`).
- Đọc hằng số float/double trực tiếp tại địa chỉ dữ liệu, không đoán từ số đã làm tròn trong pseudocode.
- Game cũ thường tính **theo frame**, không theo giây: tốc độ "4" có thể là px/frame ở 30 fps = 120 px/s. Ghi rõ đơn vị gốc và cách đổi trong `params` (`unit`, `source`).
- Để ý fixed-point, phép chia nguyên, làm tròn, tràn số. Chúng tạo ra hành vi người chơi cảm nhận được.
- RNG: ghi thuật toán và cách seed. Đây là thứ cần tái hiện để replay khớp.

## 4. Ghi kết luận
Mỗi kết luận trong `notes/<chủ đề>.md` (`third-party`: viết bằng lời của mình):
- **Kết luận**: hành vi, công thức viết lại.
- **Vị trí**: file + hàm/offset/class.method, hoặc video + mốc thời gian.
- **Độ tin cậy**: `observed` (đọc thẳng), `derived` (suy từ logic), `inferred` (ước lượng).
- **Phạm vi đã tìm**: đã xem những gì. Tìm không thấy chỉ có nghĩa là không thấy trong phạm vi đó, không chứng minh là không có.
- **Còn chưa biết**: ghi lại, đừng lấp bằng phỏng đoán.

Số liệu đưa vào `params/*.json` với `source` trỏ tới vị trí và `confidence`. Giá trị `inferred` phải có `tolerance`; từ P2 `validate` sẽ chặn nếu thiếu. Bảng nhiều điểm (theo level, theo thời gian) đưa vào `spec/oracles/` (xem skill parity-check).

## 5. Đóng pha
Xem lại `notes/QUESTIONS.md`: mỗi câu là `đã trả lời` (kèm link ghi chú), `một phần` hoặc `mở`. Câu chưa xong phải ghi lý do và ảnh hưởng tới bản port. Không nói "phân tích xong" khi còn câu bắt buộc chưa trả lời. Sau đó viết `spec/gameplay-spec.md` từ các ghi chú, chạy `gamekit validate`, rồi `gamekit gate`.
