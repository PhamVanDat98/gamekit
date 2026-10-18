---
name: re-notes
description: Dùng ở P1 khi phân tích game gốc để trích logic, số liệu và cơ chế — đặt câu hỏi trong notes/QUESTIONS.md, soi file bằng REA (MCP) hoặc công cụ theo engine, ghi bước phân tích vào nhật ký RE (gamekit re), kết luận kèm vị trí, độ tin cậy và evidence, đưa số vào params/. Dùng cả khi kết quả decompile trông vô lý, cần đối chiếu nhiều nguồn, hoặc người dùng muốn xem tiến độ phân tích.
---

# Ghi chú reverse engineering (P1)

Mục tiêu: hiểu game gốc đủ để viết lại hành vi. Ghi chú nằm trong `notes/`; số liệu vào `params/`; bước phân tích vào nhật ký `notes/re-log.jsonl`; code decompile chỉ nằm trong `decompiled/` (gitignored, hook chặn commit).

Game của người dùng (`source.ownership: own`, mặc định): có source thì đọc thẳng, không cần decompile; mất source (chỉ còn APK/bản build) thì decompile chính game đó, được chạy và debug để đo. Ghi chú chỉ cần nói logic nằm ở đâu và chỗ nào khó chuyển sang web. Làm lại game người khác (`third-party`): ghi chú viết bằng lời của mình, chỉ phân tích file tĩnh.

## Vòng lặp cho mỗi câu hỏi

```
1. Hỏi            notes/QUESTIONS.md + `gamekit re focus Q#`
2. Soi & lần      REA (mcp__rea__*) — không có thì công cụ theo engine
3. Đọc bằng chứng code / tham chiếu / chưa biết — đối chiếu, đừng tin một nguồn
4. Dùng           kết luận trong notes/, số vào params/ (+ evidence), cập nhật trạng thái câu
   còn câu hỏi tiếp → quay lại 1 (câu mới, hoặc focus lại câu cũ)
```

GameKit giữ vòng ngoài (câu hỏi, ghi chú, params, cổng); REA hoặc công cụ khác lo bước 2. Mỗi bước 2 được ghi vào nhật ký RE, gắn với câu đang làm.

## Theo dõi
- `gamekit re`: câu hỏi theo trạng thái, số bước và evidence mỗi câu, bước gần đây, cảnh báo. `gamekit re --watch` cập nhật trực tiếp; người dùng mở ở terminal thứ hai hoặc task VS Code "GameKit: theo dõi RE". `--json` cho agent.
- Trong Claude Code, hook của plugin tự ghi mỗi lần gọi tool REA (`mcp__rea__*`) và lệnh RE qua Bash (ilspycmd, Il2CppDumper, Cpp2IL, AssetRipper, jadx, apktool, gdre_tools, ffdec, wasm2wat, analyzeHeadless, `rea …`). Hook chỉ ghi tool, đối tượng, evidence id và giới hạn của kết quả; không ghi nội dung trả về.
- Hook nhắc lại trong phiên khi bước chưa gắn câu hỏi, khi lặp y hệt một phân tích trước, hoặc khi kết quả bị cắt/chưa đủ. Làm theo lời nhắc.
- Công cụ GUI (ILSpy, dnSpy, UABEA), đo bằng video, hoặc Codex: ghi tay `gamekit re log "<đã xem gì, thấy gì>" [--kind inspect|note|conclude] [--evidence ev_…]`.
- Báo người dùng tiến độ bằng số từ `gamekit re`, không ước lượng.

## 1. Câu hỏi trước, công cụ sau
Mở `notes/QUESTIONS.md`. Biến yêu cầu thành danh sách câu hỏi, mỗi câu ghi rõ cần loại bằng chứng gì: "tốc độ đạn bao nhiêu px/s, tăng theo level thế nào?" → cần hằng số và hàm cập nhật đạn. Mỗi câu có trạng thái: `mở` · `một phần` · `đã trả lời`.

Trước khi mở công cụ, xem `gamekit re`, `notes/` và `params/` đã có gì. Không phân tích lại thứ đã có kết luận. Rồi `gamekit re focus Q#` cho câu sắp làm.

## 2. Xác định target, chọn công cụ
| Engine / dạng build | Logic | Data / asset | REA | Công cụ khác |
| --- | --- | --- | --- | --- |
| Unity Mono | `*_Data/Managed/Assembly-CSharp.dll` (IL, đọc gần như source) | `*.assets`, ScriptableObject | `inspect_managed_artifact` | ILSpy / dnSpy; AssetRipper, UABEA |
| Unity IL2CPP | `GameAssembly.dll` / `libil2cpp.so` + `global-metadata.dat` | như Mono | `open_binary`, `analyze_function` (Ghidra/IDA/Hopper) sau khi có tên hàm | Il2CppDumper / Cpp2IL để lấy tên |
| Unity WebGL | `Build/*.wasm` (+ `*.framework.js`) | `Build/*.data` | `inspect_wasm_artifact` | như IL2CPP; AssetRipper cho data |
| HTML5, Cocos Creator, Construct, Laya | bundle JS (có thể có source map) | JSON, atlas | `analyze_javascript_application` | đọc bundle, tách module, source map |
| Android APK | Java/Kotlin + `lib/*/` | `assets/`, `res/` | `inspect_android_package`, `search_android_classes`, `inspect_android_method` | jadx, apktool |
| Godot | `.pck` → script `.gd` | `.tres`, `.tscn` | — | GDRE Tools |
| Flash | `.swf` (ActionScript) | trong swf | — | JPEXS FFDec |
| Unreal | Blueprint / native trong `.pak` | `.uasset` | native: `open_binary`, `analyze_function` | FModel / UModel |
| Native cũ (C/C++, DOS) | exe/dll | file data riêng | `open_binary`, `analyze_function`, `find_xrefs_to_name`, `trace_feature` | Ghidra / IDA |

APK: nhìn `lib/*/` để nhận engine (`libunity.so`, `libil2cpp.so`, `libcocos2djs.so`, `libgodot_android.so`).

**REA.** Nếu phiên có tool `mcp__rea__*`, dùng chúng cho bước 2. Dùng đúng tên và schema mà server đang chạy báo; bảng trên chỉ là gợi ý. Bắt đầu từ bản tóm tắt; chỉ đào sâu khi còn một câu hỏi cụ thể. Không có REA: nói với người dùng là có thể cài bằng `npx rea-agents setup` (đổi cấu hình agent, cần họ đồng ý và khởi động lại agent; phân tích native cần Ghidra, IDA hoặc Hopper), rồi tiếp tục bằng công cụ khác chứ không chờ.

**Game làm lại của người khác:** chỉ dùng tool đọc file tĩnh. Không dùng tool chạy hoặc gắn vào game (`capture_*`, `observe_*`, `frida_*`, `adb_*`, `gdb_*`); hook và `gamekit re` sẽ cảnh báo.

Chỉ phân tích file của bản mà người dùng có. Không can thiệp game đang chạy của người khác, không đụng server online.

## 3. Đọc bằng chứng, đừng tin decompiler một mình
- Kết quả REA có `evidence_id`, phần chưa biết và giới hạn (truncated, coverage `unknown`). Kết quả bị cắt hay chưa đủ thì không kết luận "không có" từ nó.
- Pseudocode có thể **sai chữ ký hàm**: báo hàm không có tham số trong khi lệnh máy đọc tham số trên stack. Đối chiếu với assembly/IL, và xem **chỗ gọi hàm** để biết tham số thật là gì (vd `20 + 30 × tile_x`).
- Đọc hằng số float/double trực tiếp tại địa chỉ dữ liệu, không đoán từ số đã làm tròn trong pseudocode.
- Game cũ thường tính **theo frame**, không theo giây: tốc độ "4" có thể là px/frame ở 30 fps = 120 px/s. Ghi rõ đơn vị gốc và cách đổi trong `params` (`unit`, `source`).
- Để ý fixed-point, phép chia nguyên, làm tròn, tràn số. Chúng tạo ra hành vi người chơi cảm nhận được.
- RNG: ghi thuật toán và cách seed. Đây là thứ cần tái hiện để replay khớp.

## 4. Ghi kết luận
Mỗi kết luận trong `notes/<chủ đề>.md` (`third-party`: viết bằng lời của mình):
- **Kết luận**: hành vi, công thức viết lại.
- **Vị trí**: file + hàm/offset/class.method, hoặc video + mốc thời gian.
- **Evidence**: id REA (`ev_…`) nếu có.
- **Độ tin cậy**: `observed` (đọc thẳng), `derived` (suy từ logic), `inferred` (ước lượng).
- **Phạm vi đã tìm**: đã xem những gì. Tìm không thấy chỉ có nghĩa là không thấy trong phạm vi đó, không chứng minh là không có.
- **Còn chưa biết**: ghi lại, đừng lấp bằng phỏng đoán.

Rồi `gamekit re log "<kết luận một dòng>" --kind conclude [--evidence ev_…]` và cập nhật trạng thái + cột kết luận của câu trong `notes/QUESTIONS.md`.

Số liệu đưa vào `params/*.json` với `source` trỏ tới vị trí, `confidence`, và `evidence: ["ev_…"]` khi lấy từ REA. Id trong `evidence` phải có trong nhật ký; `validate` chặn id lạ. Giá trị `inferred` phải có `tolerance`; từ P2 `validate` sẽ chặn nếu thiếu. Bảng nhiều điểm (theo level, theo thời gian) đưa vào `spec/oracles/` (xem skill parity-check), cũng nhận `evidence`.

## 5. Đóng pha
`gamekit re` không còn lỗi: mỗi câu có trạng thái hợp lệ, câu `đã trả lời` có kết luận, evidence trích dẫn có trong nhật ký. Cổng P1 chấm điều này (`{auto: re}`). Câu `một phần` hoặc `mở` phải ghi lý do và ảnh hưởng tới bản port. Không nói "phân tích xong" khi còn câu bắt buộc chưa trả lời. Sau đó viết `spec/gameplay-spec.md` từ các ghi chú, chạy `gamekit validate`, rồi `gamekit gate`.
