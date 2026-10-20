---
name: ui-extract
description: Dùng ở P1 khi cần ghi lại giao diện của game gốc trước khi dựng lại — liệt kê từng màn (menu, HUD, popup, game over, shop, settings), bố cục theo tỉ lệ, thành phần, trạng thái, luồng chuyển màn, text và font, điểm chạm. Cũng dùng khi gate P1 báo thiếu ui-kit/ hoặc ghi chú UI.
---

# Trích UI của game gốc (P1)

Mục tiêu cổng P1: có `ui-kit/` hoặc ghi chú UI từng màn. Ghi chú này là đầu vào cho **rebuild-game** (P2) và **web-relayout** (P3). Bản web phải dựng lại được từng màn mà không cần mở game gốc thêm lần nào.

Game của người dùng (`own`): chụp màn hình trực tiếp, được đưa hình gốc vào `ui-kit/`. Làm lại game người khác (`third-party`): ảnh chụp chỉ nằm trong `reference/` (gitignored); ghi chú mô tả **chức năng và bố cục**, không mô tả lại hình vẽ để vẽ theo.

## 1. Danh sách màn và luồng
Liệt kê mọi màn và popup người chơi gặp: loading, menu chính, chọn level, HUD lúc chơi, pause, game over / thắng, shop, settings, tutorial, hộp thoại xác nhận, thưởng (rewarded). Vẽ luồng chuyển trong `notes/ui/flow.md`:

```
menu --Play--> level-select --chọn--> game --chết--> game-over --Retry--> game
                                       game --⏸--> pause --Menu--> menu
```

Đánh dấu chỗ nào có quảng cáo trong game gốc (giữa màn, nút "xem để hồi sinh"). P4 cần đúng các chỗ này, và quảng cáo không được chen vào lúc người chơi đang thao tác.

## 2. Mỗi màn một file `notes/ui/<màn>.md`
| Mục | Ghi gì |
| --- | --- |
| Ảnh | Đường dẫn ảnh chụp (`ui-kit/` cho `own`, `reference/` cho `third-party`), độ phân giải gốc |
| Bố cục | Vị trí và kích thước **theo tỉ lệ màn hình** (vd nút Play: tâm 50%, 72%; rộng 40%), neo theo cạnh nào (góc trên phải, đáy giữa) |
| Thành phần | Nút, nhãn, thanh máu, icon, số đếm, danh sách cuộn; thành phần nào dùng chung giữa các màn |
| Trạng thái | Bình thường / nhấn / khoá / đã mua / thông báo đỏ; animation vào–ra (thời lượng, easing nếu đo được) |
| Text | Từng chuỗi kèm key dự kiến (`menu.play`, `gameover.best`) và tham số (`{score}`) |
| Tương tác | Bấm vào đâu thì đi đâu, phím tắt, vuốt, giữ |
| Font | Tên font, cỡ tương đối, viền/đổ bóng; font bitmap hay TTF |

Số liệu ảnh hưởng gameplay (thời gian đếm ngược, giá trong shop, phần thưởng) đưa vào `params/` có `source`, không chỉ ghi trong ghi chú UI.

## 3. Text đi qua `t()`
Mọi chuỗi hiển thị sẽ nằm trong `Language/en.json` và được gọi bằng `t()`, không viết cứng trong `src/`. Ở P1 chỉ cần danh sách key + bản tiếng Anh. Game gốc có nhiều ngôn ngữ: ghi lại ngôn ngữ nào có và text nằm ở đâu (bảng localization, file CSV).

`third-party`: tên game và tên riêng của game gốc không được đưa vào text (sẽ bị `release-check` chặn qua `release.forbiddenTerms`).

## 4. Điểm chạm và màn hình nhỏ
- Ghi kích thước vùng chạm của từng nút theo tỉ lệ. Nút nhỏ hơn khoảng 44px trên điện thoại phải được làm to hơn ở P3.
- Ghi phần UI nằm sát mép (notch, thanh home) để P3 xử lý safe area.
- Game gốc chỉ có một hướng màn hình: ghi rõ. Bản web vẫn phải chơi được cả ngang và dọc (gate P3).

## 5. Lấy từ asset gốc khi có thể
Có project hoặc bản build: layout thường nằm trong prefab/scene (Unity), `.fire`/`.prefab` (Cocos), `.tscn` (Godot). Đọc vị trí và anchor thật thay vì đo bằng mắt, rồi ghi `source` (file + đường dẫn node). `gamekit assets scan` liệt kê font, sprite sheet UI và atlas.

## 6. Kết thúc
Đối chiếu `notes/ui/flow.md` với danh sách màn: màn nào có trong luồng phải có file ghi chú. Màn chưa xem được (khoá sau level 50, chỉ có khi mua hàng) thì ghi vào `notes/QUESTIONS.md` cùng ảnh hưởng tới bản port. Báo người dùng số màn đã ghi và số màn còn thiếu.
