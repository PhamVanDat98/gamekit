---
name: qa-smoke
description: Dùng từ P3 tới P5 khi cần thấy game chạy thật trong trình duyệt — chạy gamekit smoke (desktop, mobile dọc/ngang, quảng cáo giả lỗi/bỏ qua/chậm/không có, máy yếu), đọc report và xem ảnh chụp, sửa từng loại lỗi, rồi liệt kê phần còn phải kiểm tay. Cũng dùng khi gate báo mục smoke (auto) đỏ.
---

# Smoke test trong trình duyệt (P3–P5)

`gamekit smoke` dựng bản dev-mock từ source hiện tại, mở bằng Chromium headless như người chơi thật, chơi tự động, chụp ảnh và chấm. Cổng P3, P4, P5 có mục `{auto: smoke}`; P5 thêm `{auto: perf}` (skill **perf-budget**).

## 1. Chạy
| Lệnh | Khi nào |
| --- | --- |
| `gamekit smoke` | Đủ 8 kịch bản, khoảng một phút |
| `gamekit smoke --quick` | Chỉ `desktop`, khi đang sửa nhanh |
| `gamekit smoke --only mobile-portrait,ad-fail` | Chỉ vài kịch bản |
| `gamekit smoke --no-perf` | Bỏ `weak-phone` |
| `gamekit smoke --version [V]` | Test gói đã pack `builds/<V>/dev-mock` (bỏ V = bản mới nhất) thay vì dựng từ source |
| `gamekit smoke --json` | In report ra stdout |

Kịch bản: `desktop` (1280×720, kèm Settings và đổi ngôn ngữ), `mobile-portrait` (390×844, cảm ứng), `mobile-landscape` (844×390), `ad-fail`, `ad-skip`, `ad-slow`, `ad-none` (dev-mock `?ad=…`, chơi lâu hơn để qua một vòng), `weak-phone` (CPU 4×, mạng chậm).

Cần trình duyệt: game có `playwright-core` (template có sẵn), máy có Chrome hoặc Edge. Không có thì `npx playwright-core install chromium` trong thư mục game, hoặc đặt `GK_BROWSER=<đường dẫn chrome>`.

## 2. Đọc kết quả
- Terminal liệt kê từng kịch bản, lỗi (✘), cảnh báo (⚠) và đường dẫn ảnh.
- `.gamekit/smoke/report.json`: mỗi kịch bản có `errors`, `platform` (các lệnh dev-mock nhận được: `loadingEnd`, `gameplayStart`, `showAd …`), `layout`, `readyMs`, `fps`, `settings`; cuối là `issues`.
- **Mở ảnh và xem**: `<kịch bản>-ready.png` (vừa tải xong), `<kịch bản>.png` (sau khi chơi), `desktop-settings.png`, `desktop-lang-<mã>.png`, `<kịch bản>-stuck.png` khi kẹt ở loading. Smoke đạt chưa có nghĩa là trông đúng.

## 3. Sửa theo loại lỗi
| Báo | Thường do | Sửa |
| --- | --- | --- |
| `console.error`, `lỗi JS` | Exception trong game | Đọc thông báo, tái hiện bằng `npm run dev` |
| `tải lỗi`, `HTTP 404` | Đường dẫn asset tuyệt đối, file thiếu trong gói | Đường dẫn tương đối; asset nằm trong `assets/` hoặc `public/` |
| Màn loading không tắt | Game không gọi `window.GM_LOADER.ready()` khi khung hình đầu lên, hoặc crash trước đó | Xem ảnh `-stuck`, lỗi console |
| Trang cuộn được / canvas tràn | CSS kích thước cố định, thiếu xử lý resize | Skill **web-relayout** |
| Canvas chiếm < 25% màn hình (cảnh báo) | Letterbox sai hướng | Xem ảnh mobile |
| Màn gần như một màu | Không vẽ gì, vẽ ngoài canvas, WebGL lỗi | Xem ảnh `-ready` |
| Hình không đổi suốt lúc chơi | `smoke.start` không đưa được vào chơi, `smoke.keys` không phải phím game dùng, hoặc game không nhận input | Sửa `smoke` trong `game.yaml`, thử tay |
| Thiếu `platform.loadingEnd()` / `gameplayStart()` | Chưa nối platform (cảnh báo trước P4, lỗi từ P4) | Skill **platform-sdk** |
| Footer Settings sai / không hiện | Popup Settings bị đổi giao diện làm mất footer bản quyền | Giữ `.gk-settings-footer` với `platform.info.copyright` |
| Đổi ngôn ngữ không có tác dụng | Game không đọc `GM_LANG`, text viết cứng | Mọi text qua `t()` |
| `ad-…`: không gặp quảng cáo (cảnh báo) | Chưa hết vòng nào trong thời gian chơi | Tăng `smoke.playSec` hoặc thêm bước vào `smoke.start` |

Sửa xong chạy lại đúng kịch bản đó (`--only`), rồi chạy đủ trước khi chạy `gamekit gate`.

## 4. Phần smoke không kiểm được
Smoke không nghe âm thanh, không cảm nhận độ trễ điều khiển, không biết game có vui hay khó đúng như bản gốc. Liệt kê cho người dùng: âm thanh và nhạc (tắt khi ad, khi tab ẩn), cảm giác điều khiển trên điện thoại thật, playtest trọn một lượt. Mục "(bạn)" trong `gates/*.md` **chỉ người dùng tick**.

## 5. Báo cáo
Số kịch bản đạt / tổng, lỗi còn lại, cảnh báo, đường dẫn ảnh đáng xem. Chỉ báo những lần chạy đã thật sự diễn ra.
