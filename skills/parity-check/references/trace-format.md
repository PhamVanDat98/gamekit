# Trace từ game gốc → bảng oracle

Oracle tốt nhất là số **đo được khi chạy chính game gốc** (`confidence: observed`). Cách làm: ghi trace (trạng thái theo thời gian) trong lúc chơi game gốc, rồi `gamekit oracle import` chọn các dòng thành bảng `spec/oracles/<id>.json`.

Chỉ chạy game gốc để đo khi đó là game của người dùng (`own`). Với `third-party`: chỉ làm khi người dùng đồng ý, và ghi lại thành `D-n` trong `DECISIONS.md` (xem skill parity-check).

## Định dạng trace
Một trong ba dạng, cột tuỳ ý:
- **JSON Lines** (`.jsonl`): mỗi dòng một object. Object lồng nhau được làm phẳng: `{"player": {"x": 3}}` → cột `player.x`.
- **CSV / TSV** có dòng tiêu đề (phân cách `,`, `;` hoặc tab).
- **JSON**: mảng object.

Nên có cột thời gian `t` (giây) và `frame`. Giá trị `null` là đọc không được, dòng đó bị bỏ khi chọn case.

## Ghi trace
| Game gốc | Cách ghi |
| --- | --- |
| Unity, có project | `GkTraceRecorder.cs` (skill engine-unity, `references/`): gắn vào scene, chơi trong Editor, file ở `Application.persistentDataPath` |
| Chạy được trong trình duyệt (HTML5, Cocos web, Construct…) | `gk-trace.js` (thư mục này): dán vào DevTools Console, `gkTrace.start({...})`, chơi, `gkTrace.stop()` |
| Chỉ có bản build, không sửa được | Quay video màn hình 60 fps, đo vị trí theo frame (`confidence: inferred`, bắt buộc `--tolerance`) |
| Bảng số trong data (ScriptableObject, JSON, CSV của game) | Không cần trace: chép bảng, `confidence: observed`, `source` trỏ tới file |

## Dựng oracle
```bash
gamekit oracle import trace.jsonl --to spec/oracles/obstacle-speed.json \
  --in t --out obstacle.speed \
  --source "Editor 2021.3.5f1, scene Level1, GkTraceRecorder mỗi FixedUpdate" \
  --at t=0,5,10,30 --tolerance 0.001
```
- `--in` cột đầu vào (nhiều cột: `--in level,t`), `--out` cột kết quả (nhiều cột → `out` là object).
- Chọn dòng: `--at cột=giá trị,…` lấy dòng gần nhất cho từng mốc (nên có mốc biên); `--every N` mỗi N dòng; mặc định trải đều tối đa `--max` (40) case, luôn giữ dòng đầu và cuối.
- `--source` bắt buộc: bản build, scene, cách ghi. Đây là bằng chứng của oracle.
- `--confidence` mặc định `observed`; `inferred` (đo video) phải có `--tolerance`.
- File đã có thì cần `--force`.

Sau đó trỏ nghĩa vụ tới file (`oracle: spec/oracles/…json`, case `oracle`) và viết test `it.each(oracle.cases)` như `tests/core/world.test.ts`.

## Đối chiếu trace với bản web
Trace phụ thuộc bước thời gian của game gốc. Nếu game gốc chạy theo frame (biến thiên) còn bản web dùng fixed step, so theo `t` và đặt `tolerance` đủ cho sai lệch một bước. Ghi lại quyết định này trong `notes/`.
