# Mẫu chuyển động UI

Số dưới đây là **mặc định cho game `third-party` hoặc chuyển động mới đã được duyệt**. Game `own` dùng số của bản gốc.

## Nguyên tắc thời lượng
- Phản hồi trực tiếp (nút, chạm): 60–120 ms. Người chơi phải thấy ngay khi bấm.
- Hiện popup / phần tử mới: 180–300 ms, easing ra (`outCubic`, `outBack` cho phong cách vui).
- Đóng / biến mất: nhanh hơn lúc hiện (120–180 ms), easing vào (`inCubic`).
- Chuyển màn: 250–400 ms. Quá 500 ms là người chơi thấy chờ.
- Danh sách (nút menu, ô phần thưởng): lệch nhau 30–50 ms, cả chuỗi không quá 400 ms.
- Một thời điểm chỉ một chuyển động chính; cái phụ nhỏ và ngắn hơn.

## Mẫu
| Điểm chạm | Kích bởi | Chuyển động | Thời lượng | Giảm chuyển động |
| --- | --- | --- | --- | --- |
| Nút bấm | `pointerdown` / `pointerup` | scale 1 → 0,94 → 1 | `press` 80 ms mỗi chiều | đổi màu/độ sáng, không scale |
| Popup hiện | mở popup | nền mờ fade 0 → 0,6; panel scale 0,9 → 1 + fade, `outBack` | `popupIn` 220 ms | chỉ fade |
| Popup đóng | đóng popup | panel scale 1 → 0,95 + fade ra, `inCubic` | `popupOut` 150 ms | chỉ fade |
| Chuyển màn | menu ↔ chơi ↔ kết quả | fade qua màu nền, hoặc trượt cả màn | `screen` 300 ms | fade |
| Điểm tăng | điểm mới khác điểm đang hiện | số đếm lên (`shownScore` tween tới điểm thật) + chữ phóng 1 → 1,2 → 1 | `countUp` 600 ms (ngắn hơn nếu tăng ít) | hiện ngay số cuối |
| "+10", "Combo!" | event ghi điểm | bay lên 30–40 px + fade ra | 500–700 ms | fade tại chỗ |
| Phần thưởng | nhận thưởng, hết màn | các ô hiện lệch nhau (`stagger`), sao nảy `outBack` | ≤ 400 ms cả chuỗi | hiện cùng lúc, fade |
| Không đủ tiền / sai | bấm nút bị chặn | rung ngang 3–4 lần, biên độ 6–8 px, giảm dần | 250–300 ms | đổi màu đỏ ngắn |
| Nút chính đang chờ (Play) | idle > 2 s ở menu | thở: scale 1 ↔ 1,05 | chu kỳ 1,2–1,6 s | đứng yên |
| HUD máu/thanh | giá trị đổi | thanh trước nhảy ngay, thanh "vệt" phía sau đuổi theo | 300–500 ms | chỉ thanh trước |
| Loading | tiến độ tải | thanh chạy tới tiến độ thật, không chạy giả quá tiến độ | theo tải | giữ nguyên |

## Rung / chớp màn hình
Rung camera, chớp trắng khi trúng đòn là **gameplay feel**, không phải UI: game `own` lấy từ bản gốc (thời lượng, biên độ là số trong code gốc → ghi nguồn), không tự thêm. Nếu có: tối đa vài px, dưới 300 ms, không chớp quá 3 lần/giây, tắt khi `prefers-reduced-motion`.

## DOM/CSS
```css
.gk-settings-panel {
  animation: gk-pop-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes gk-pop-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
}
button:active {
  transform: scale(0.94);
  transition: transform 0.08s;
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
Phần tử bị `hidden` thì không chạy animation đóng: muốn animate lúc đóng, thêm class đóng, chờ `animationend` (hoặc hết thời lượng nếu giảm chuyển động) rồi mới đặt `hidden`.

## Canvas
- Giá trị đang tween (`popupScale`, `shownScore`, `bannerY`) là biến của view, truyền vào `renderer.draw(…)`; không ghi vào `world`.
- Scale quanh tâm: `ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); … ctx.restore()`.
- Chữ bay lên: giữ một mảng cố định (pool) các ô, dùng lại ô đã xong thay vì tạo mới.
