---
name: perf-budget
description: Dùng ở P5 (và sớm hơn khi đổi runtime hay thêm asset lớn) để đo và giữ ngân sách hiệu năng trong game.yaml — tải đầu, thời gian vào game, FPS trên máy yếu và máy tính — bằng gamekit smoke và release-check, rồi giảm tải khi vượt. Cũng dùng khi gate báo mục perf (auto) đỏ.
---

# Ngân sách hiệu năng (P5)

Ngân sách nằm trong `game.yaml` → `budget`. Cổng P5 có mục `{auto: perf}`; `release-check` kiểm tải đầu. Chỉ báo số đo thật, lấy từ lệnh đã chạy.

## 1. Ngân sách và ai đo
| Khoá | Ý nghĩa | Đo bằng |
| --- | --- | --- |
| `initialLoadMB` | Byte người chơi tải trước khi vào game: `index.html`, `loader.js`, `framework.js`, `css/style.css`, `Icons/`, file ngôn ngữ lớn nhất | `gamekit release-check` (theo gói đã pack) |
| `timeToPlaySec` | Từ lúc mở trang tới khi game gọi `GM_LOADER.ready()` (khung hình đầu) trên máy yếu | `gamekit smoke`, kịch bản `weak-phone` |
| `minFpsMobile` | FPS trung bình khi chơi trên máy yếu | `weak-phone` |
| `minFpsDesktop` | FPS trung bình khi chơi trên máy tính | `desktop` |

"Máy yếu" (`weak-phone`): điện thoại dọc 390×844, CPU chậm 4×, mạng 1.6 Mbps xuống / 150 ms trễ (như Lighthouse mobile).

## 2. Đo
```bash
gamekit smoke                            # đủ kịch bản; perf = desktop + weak-phone
gamekit smoke --only desktop,weak-phone  # chỉ đo hiệu năng
gamekit pack --all && gamekit release-check
```
Đọc `.gamekit/smoke/report.json`, mỗi kịch bản có: `readyMs`, `fps.avg`, `fps.p5`, `heapMB`; `issues` có `cat: "perf"`.

Cách chấm:
- FPS đạt khi trung bình ≥ 90% ngân sách. Trình duyệt headless chạy requestAnimationFrame tối đa khoảng 60, nên ngân sách 60 đạt ở 58–60.
- `fps.p5` (5% khung chậm nhất) dưới nửa ngân sách → cảnh báo giật khung, kể cả khi trung bình đạt.
- `readyMs` của `weak-phone` > `timeToPlaySec` → lỗi.
- Số đo phụ thuộc máy chạy. Nếu kết quả dao động gần ngưỡng, chạy lại 2–3 lần và báo cả khoảng, đừng chọn lần đẹp nhất.

## 3. Giảm khi vượt
| Vượt | Thử theo thứ tự |
| --- | --- |
| Tải đầu / thời gian vào game | Asset không cần ngay thì tải sau màn đầu (không nằm trong `framework.js`); `gamekit assets convert` (WebP, MP3 bitrate thấp hơn cho hiệu ứng); bỏ thư viện to không cần (skill **runtime-select**); import ảnh qua URL thay vì nhúng base64 |
| FPS thấp | Atlas thay cho nhiều ảnh lẻ (giảm draw call); object pool cho đạn/particle; không cấp phát (object, mảng, closure) trong vòng lặp mỗi frame; giới hạn `devicePixelRatio` ~2; vẽ lớp tĩnh một lần (canvas phụ / OffscreenCanvas); bỏ filter, shadow, blur |
| p5 thấp (giật) | Thường là GC hoặc tải asset giữa lúc chơi: preload trước màn, tái sử dụng buffer |
| Heap tăng dần | Rò listener, texture không giải phóng giữa các vòng |

**Không đổi số liệu gameplay để đạt FPS** (số lượng kẻ địch, tốc độ, tần số bước). Nếu buộc phải đổi: ghi `D-n` trong `DECISIONS.md` và chờ người dùng duyệt. Nâng ngân sách cũng là quyết định của người dùng.

## 4. Kết thúc
Chạy lại `gamekit smoke` và `release-check` sau khi sửa. Báo người dùng bảng trước/sau (tải đầu MB, thời gian vào game, FPS trung bình/p5 desktop và weak-phone) kèm máy đã đo.
