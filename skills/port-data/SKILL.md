---
name: port-data
description: Dùng ở P2 khi chuyển dữ liệu nội dung của game gốc sang bản web — level, wave quái, bảng rơi đồ, bảng nâng cấp, cấu hình nằm trong prefab/scene/ScriptableObject/JSON/data file — bằng script chuyển đổi chạy lại được (không chép tay), ra data/*.json có source, kèm test so số lượng và tổng kiểm với bản gốc. Dùng cả khi level trên web khác bản gốc, hoặc khi game gốc có bản cập nhật dữ liệu.
---

# Chuyển dữ liệu game (P2)

Số đơn lẻ (tốc độ, máu, thời gian hồi) nằm trong `params/` — mỗi số một `source`. **Bảng và nội dung** (50 level, mỗi level 30 viên gạch; bảng rơi đồ; cây nâng cấp) không chép tay vào `params/`: viết script chuyển đổi, ra `data/*.json`. Chép tay vài nghìn số là chỗ sai nhiều nhất của một bản port.

## 1. Tìm dữ liệu gốc
Từ ghi chú P1 và skill engine (`engine-<engine>`):
| Nguồn | Dạng thường gặp |
| --- | --- |
| Unity | ScriptableObject `.asset`, prefab/scene (YAML sau khi AssetRipper xuất), JSON/CSV trong `StreamingAssets/`/`Resources/`, mảng `[SerializeField]` |
| Cocos | JSON prefab/scene (dạng nén), `resources/*.json` |
| Godot | `.tres`, `.tscn`, JSON |
| Construct, GameMaker | `data.json`; room trong project/UndertaleModTool |
| HTML5, Flash | JSON/XML trong bản build; mảng hằng trong code |
| Native cũ | file data riêng (định dạng nhị phân tự đặt) — đọc cấu trúc từ code nạp file |

Bản gốc hay có cả **dữ liệu thừa** (level thử, bản cũ): đối chiếu với thứ thật sự được nạp (danh sách scene trong build, code nạp level).

## 2. Script chuyển đổi
- Đặt trong repo game: `scripts/import-<tên>.mjs` (Node, không cần thư viện ngoài nếu được). Đầu vào: đường dẫn trong `reference/` hoặc `source.path` — **không** chép file gốc vào repo. Đầu ra: `data/<tên>.json`.
- File ra luôn có `"source"` (file gốc + script), vd `{ "source": "Assets/Levels/*.asset qua scripts/import-levels.mjs", "levels": [...] }`. `gamekit validate` chặn file `data/` thiếu `source` (TODO được tới trước P2).
- **Chuyển đơn vị trong script**, một chỗ: Unity unit → px (theo Pixels Per Unit), frame → giây, trục y hướng lên → hướng xuống, góc độ → radian. Ghi hằng đổi đơn vị vào `params/` (có source), script đọc từ đó.
- Giữ id/thứ tự gốc (level 1 là level 1). Không "dọn" dữ liệu cho đẹp: giá trị lạ của bản gốc có thể là hành vi người chơi đã quen.
- Script phải **chạy lại được** khi game gốc cập nhật: không sửa tay `data/*.json` sau khi sinh — sửa script.
- Game làm lại của người khác (`third-party`): chỉ chuyển dữ liệu gameplay (số, bố cục level); text và tên trong dữ liệu đi qua `t()`, viết lại ở P3.

## 3. Dùng trong core/
- `src/core/` import JSON (như `params.ts`) và định nghĩa type cho nó trong `src/contracts/`. Dữ liệu vào core là chỉ đọc.
- Kiểm hình dạng dữ liệu một lần lúc nạp (hàm thuần trong `core/`, có test): thiếu trường thì báo lỗi rõ, không chạy với giá trị rỗng.

## 4. Test chuyển đổi
Viết test trước (TDD), gắn thẻ nghĩa vụ `[id:case]` khi có:
- **số lượng**: số level, số phần tử mỗi level đúng như bản gốc (đếm từ file gốc, ghi vào oracle);
- **tổng kiểm**: tổng/max một trường (tổng máu quái level 10, tổng điểm tối đa) khớp oracle tính từ file gốc;
- **mẫu**: vài level cụ thể so từng phần tử với oracle lấy thẳng từ bản gốc (đầu, giữa, cuối, level đặc biệt);
- **đơn vị**: một vật ở toạ độ đã biết trong bản gốc nằm đúng chỗ trên web.

Oracle cho dữ liệu: `spec/oracles/<tên>.json`, `confidence: observed` (đọc thẳng file gốc).

## 5. Xong
`node scripts/import-<tên>.mjs` sinh lại không đổi gì (`git diff` sạch), `gamekit validate`, `npm test`, `gamekit parity`. Ghi lệnh chạy script vào `notes/` để lần sau chạy lại.
