# Gameplay spec — {{TITLE}}

Viết ở cuối P1 từ ghi chú trong `notes/`. Mỗi cơ chế trỏ tới nghĩa vụ (`spec/obligations.yaml`), params và ghi chú.
Điền xong mục nào thì xoá dòng `<!-- TODO … -->` của mục đó; `gamekit re` chặn cổng P1 khi file còn dòng TODO.

## Core loop
<!-- TODO: một vòng chơi: người chơi làm gì, thắng/thua/kết thúc thế nào -->

## Điều khiển của bản gốc
<!-- TODO: thao tác → hành động (chạm, vuốt, nút…); P3 sẽ ánh xạ sang chuột/bàn phím/cảm ứng -->

## Cơ chế
<!-- TODO: mỗi cơ chế một dòng; cơ chế trong spec/inventory.yaml phải có mặt ở đây hoặc được skip -->

| Cơ chế | Hành vi | Nghĩa vụ | Params | Ghi chú |
| --- | --- | --- | --- | --- |

## Level, độ khó, tiến trình
<!-- TODO: số level, cách tăng độ khó (công thức/bảng → spec/oracles/), mở khoá -->

## Điểm, tiền, kinh tế
<!-- TODO -->

## Ngẫu nhiên (RNG)
<!-- TODO: thuật toán, cách seed, cái gì phụ thuộc seed. Nội dung sinh từ seed (level, rơi đồ) phải dùng đúng RNG gốc — skill rebuild-game -->

## Màn hình và luồng UI
<!-- TODO: các màn và chuyển màn -->

## Âm thanh và phản hồi
<!-- TODO -->

## Ngoài phạm vi bản web
<!-- TODO: thứ của bản gốc không làm (server, mua trong app, SDK quảng cáo riêng…), mỗi thứ một D-n trong DECISIONS.md -->
