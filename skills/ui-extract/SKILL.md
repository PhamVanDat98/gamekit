---
name: ui-extract
description: Dùng ở P1 khi cần ghi lại giao diện của game gốc — liệt kê từng màn (menu, HUD, pause, kết thúc, shop…), luồng chuyển màn, thành phần và trạng thái của mỗi màn, text hiển thị, asset UI; ghi vào ui-kit/ và mục "Màn hình và luồng UI" của spec/gameplay-spec.md. Dùng cả khi người dùng hỏi bản web thiếu màn nào so với bản gốc.
---

# Ghi lại UI của game gốc (P1)

Mục tiêu: P2/P3 dựng lại đủ mọi màn và luồng chuyển màn mà không phải mở lại game gốc. Cổng P1 có mục "Có `ui-kit/` hoặc ghi chú UI từng màn".

UI thuộc `src/view/`: chỉ đọc state, không chứa logic gameplay. Một nút của bản gốc làm thay đổi gameplay (mua, hồi sinh, chọn level) → hành vi đó là cơ chế của `core/`, có câu hỏi/nghĩa vụ riêng; ở đây chỉ ghi nút và nó dẫn tới đâu.

## 1. Nguồn
| Có gì | Lấy UI từ đâu |
| --- | --- |
| Project Unity | scene, prefab Canvas (`Assets/**/*.unity`, `*.prefab`), script UI |
| Bản build Unity | AssetRipper xuất scene/prefab; danh mục cơ chế (`spec/inventory.yaml`) có các type UI — đánh dấu `skip: "UI"` sau khi đã ghi ở đây |
| Cocos, Construct, HTML5 | scene/layout JSON trong bản build; chạy bản build trong trình duyệt và chụp |
| Mọi engine | chơi bản gốc và chụp màn (game của người dùng); video gameplay |

Ảnh chụp game gốc để trong `reference/ui/` (gitignored, không commit, không đóng gói).

## 2. Danh sách màn và luồng
Tạo `ui-kit/README.md`:

```
| Màn | Vào từ | Ra tới | Ghi chú |
| --- | --- | --- | --- |
| title | khởi động | play (nút Play), settings | logo, nút Play, âm thanh |
| hud | play | pause, game-over | điểm, máu, nút pause |
| game-over | hud (hết máu) | play (Chơi lại), title | điểm, kỷ lục, rewarded "Hồi sinh" |
```

Rồi chép phần tóm tắt vào mục "Màn hình và luồng UI" của `spec/gameplay-spec.md` (xoá dòng TODO của mục đó).

## 3. Mỗi màn một file
`ui-kit/<màn>.md`:
- **Thành phần**: nút, nhãn, thanh, icon; vị trí tương đối (góc trên trái, giữa dưới…), không cần pixel.
- **Trạng thái**: bật/tắt, khoá/mở, có thông báo, đang tải.
- **Text**: mỗi chuỗi một key dự kiến cho `Language/en.json` (vd `hud.score` → "Score: {score}"); số và tên chèn vào là `{param}`, số đếm dùng dạng số nhiều (skill add-i18n).
- **Asset**: file hình/âm thanh/font của màn (đối chiếu `notes/assets.md`).
- **Hành vi**: nút dẫn tới đâu, animation chuyển màn, âm thanh khi bấm.
- **Chỗ cho portal**: nơi bản gốc gọi quảng cáo (ghi lại để P4 đặt interstitial/rewarded đúng điểm nghỉ), bảng xếp hạng, đăng nhập, mua trong app (web không có — ghi `D-n`).

Game làm lại của người khác: viết bằng lời của mình, không chép ảnh gốc vào repo; tên và text gốc sẽ thay ở P3.

## 4. Thứ web phải thêm
Ghi vào `ui-kit/README.md`, mục "Web":
- popup Settings của template (âm thanh, ngôn ngữ, **footer bản quyền** của portal — bắt buộc giữ);
- hướng dẫn điều khiển cho chuột/bàn phím/cảm ứng (P3, skill web-relayout);
- màn/lời nhắc xoay máy nếu game chỉ hợp một hướng.

## 5. Kiểm
- Mọi màn trong danh sách có file; mọi đường "Ra tới" trỏ tới màn có thật.
- Type UI trong `spec/inventory.yaml` đã `covers` hoặc `skip` (`gamekit re` hết mục chưa xử lý).
- Báo người dùng: số màn, luồng chính, chỗ có quảng cáo/IAP/đăng nhập ở bản gốc và đề xuất cho bản web.
