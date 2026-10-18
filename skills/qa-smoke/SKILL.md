---
name: qa-smoke
description: Dùng ở P5 trước khi phát hành — đóng gói, chạy gamekit smoke (bản build trong Chromium trên máy tính và điện thoại dọc/ngang, CPU chậm) để đo thời gian vào game, FPS, lỗi console, Settings, so với ngân sách trong game.yaml; đọc ảnh chụp; rồi checklist thử trên máy thật. Dùng cả khi cổng P5 báo smoke đỏ hoặc người dùng hỏi game chạy có mượt không.
---

# Smoke test và hiệu năng (P5)

## 1. Chạy
```
gamekit pack --all
gamekit smoke            # bản mới nhất; --version V cho bản khác; --json cho agent
```
Cần Playwright: `npm i -D playwright-core` trong thư mục game rồi `npx playwright install chromium` (hoặc đã cài toàn cục). Không có thì lệnh báo cách cài — hỏi người dùng trước khi cài.

Smoke mở gói `dev-mock` (cùng code với gói portal, chỉ khác SDK) qua một server tĩnh, ở ba cấu hình: máy tính 1280×720; điện thoại dọc 390×844 và ngang 844×390 với CPU chậm 4×. Mỗi cấu hình:
- **vào được game / thời gian vào game**: tới khi game gọi `loadingEnd`, so với `budget.timeToPlaySec`;
- **bắt đầu chơi**: Space/Enter/nhấp trên máy tính, chạm trên điện thoại, phải thấy `gameplayStart`;
- **FPS** trong 3 giây đang chơi, so với `minFpsDesktop` / `minFpsMobile` (cho phép thấp hơn 10%);
- **lỗi console**, lỗi trang, request hỏng (404…);
- máy tính: **Settings** mở được và có footer bản quyền.

Ảnh chụp và `report.json` trong `builds/<v>/smoke/`. **Xem ảnh** (Read): bố cục vỡ, chữ tràn, nút bị che là lỗi dù mọi mục xanh. Cổng P5 chạy smoke (`{auto: smoke}`).

## 2. Khi đỏ
| Mục | Hay do |
| --- | --- |
| vào được game | lỗi JS lúc tải (xem mục lỗi console), asset 404, game không gọi `platform.loadingEnd()` |
| thời gian vào game | nạp cả game trước màn đầu; asset chưa nén; font/âm thanh lớn — chỉ nạp thứ cần cho màn đầu (`gamekit assets` liệt kê file nặng) |
| bắt đầu chơi | input chưa nối cho chạm (P3, skill web-relayout), hoặc game mở bằng nút khác — khi đó smoke không biết; thử tay và ghi lại |
| FPS | vẽ lại toàn bộ mỗi frame, quá nhiều sprite rời (gộp atlas), tạo object mỗi frame (GC), canvas quá to so với DPR |
| request hỏng | đường dẫn tuyệt đối, file không được đóng gói, tên file khác hoa/thường |

Headless chỉ là ước lượng: FPS trên máy ảo khác máy thật, CPU chậm 4× chỉ mô phỏng phần JS.

## 3. Thử trên máy thật
`npm run preview` → mở `http://<ip-máy>:4173/<v>/dev-mock/<v>/index.html` trên điện thoại cùng mạng. Kiểm: tải lần đầu (xoá cache), chơi hết một ván, xoay màn hình giữa ván, `?ad=slow` và `?ad=fail`, ẩn tab rồi quay lại (game pause, tắt tiếng), Settings đổi ngôn ngữ. Ghi kết quả vào changelog của bản.

## 4. Báo cáo
Báo người dùng: từng cấu hình đạt/không với số đo, ảnh chụp đáng chú ý, những gì **chưa** kiểm (máy thật, iOS, portal thật).
