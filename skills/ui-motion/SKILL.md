---
name: ui-motion
description: Dùng ở P3 (hoặc bất cứ khi nào làm UI) khi thêm hoặc chỉnh hiệu ứng chuyển động cho giao diện game — nút bấm, popup, chuyển màn, điểm số đếm lên, phần thưởng, báo lỗi — để game có cảm giác mượt, phản hồi rõ mà không đụng logic gameplay, replay, pause khi có quảng cáo hay hiệu năng.
---

# Chuyển động UI

Chuyển động UI làm game **phản hồi rõ** (bấm là thấy), **dẫn mắt** (popup, phần thưởng) và **nối các màn** cho liền. Nó là lớp trình bày: không bao giờ đổi kết quả của một ván chơi.

## Luật
1. **Chỉ trong `src/view/` và CSS.** `core/` không biết có chuyển động; không thêm field animation vào `WorldState`. Kích chuyển động từ event mà `stepWorld` trả về (vd `gameOver`) hoặc so state trước/sau trong view.
2. **Đồng hồ của view, không phải fixed step.** Tween chạy bằng `dt` thật từ `requestAnimationFrame`, kẹp `dt` (≤ 0,1 s) để quay lại tab không nhảy cóc. Replay test (`worldHash`) phải giữ nguyên trước và sau khi thêm chuyển động.
3. **Không chặn thao tác khi đang chơi.** Input gameplay không chờ animation. Chặn bấm chỉ ở điểm nghỉ (popup kết quả đang hiện, chống bấm xuyên) và không lâu hơn thời gian popup hiện.
4. **Theo pause.** Hai nhóm tween: `scene` (hiệu ứng trong màn chơi) dừng khi `bus.paused`; `ui` (popup, menu Settings) vẫn chạy khi pause vì `menu`. Không có chuyển động nào chạy đè lên quảng cáo: gọi `platform.interstitial()` sau khi animation đóng popup xong.
5. **Giảm chuyển động.** Tôn trọng `prefers-reduced-motion: reduce`: bỏ trượt, phóng to, rung; giữ fade ngắn hoặc hiện ngay. Không nháy sáng quá 3 lần/giây. Thông tin (điểm, máu, phần thưởng) luôn đọc được khi đứng yên — chuyển động chỉ nhấn mạnh, không thay thế.
6. **Rẻ.** DOM: chỉ animate `transform` và `opacity`. Canvas: không cấp phát mới mỗi frame, không tween chồng lên cùng một giá trị (huỷ cái cũ). Không cần thư viện; nếu thêm (GSAP, Lottie, Spine runtime) thì kiểm license và dung lượng, ghi `D-n` trong `DECISIONS.md`. File animation (Lottie JSON, Spine, sprite sheet) là asset → cần nhãn provenance.
7. **Text qua `t()`**, kể cả chữ bay lên ("+10", "Combo!"). Popup Settings đổi chuyển động được, footer bản quyền vẫn phải hiện.

## Game của ai
- **`own`**: chuyển động gốc là một phần cảm giác của game — **giữ thời lượng, easing, thứ tự** như bản gốc. Tìm ở: Unity `*.anim`/Animator, DOTween/LeanTween trong code; Cocos `cc.tween`/Action; Godot `AnimationPlayer`/`Tween`; không có nguồn thì đo từ video (đếm frame). Ghi nguồn cạnh hằng số trong `src/view/motion.ts`. Thêm chuyển động mà bản gốc không có là thay đổi cảm giác game: đề xuất danh sách cho người dùng, làm khi họ đồng ý, ghi `D-n`.
- **`third-party`**: chuyển động thuộc style mới — chọn theo style đã duyệt (vui nhộn: easing nảy `outBack`; tối giản: `outCubic`, ngắn), không mô phỏng lại chuyển động đặc trưng của game gốc.

## Cách làm
1. Kiểm kê điểm chạm UI: nút, popup, chuyển màn, HUD (điểm, máu, tiền), phần thưởng, lỗi/không đủ tiền, loading. Mỗi điểm một dòng: sự kiện kích → chuyển động → thời lượng. Gợi ý thời lượng và mẫu: [references/motion-catalog.md](references/motion-catalog.md).
2. Chép [references/motion.ts](references/motion.ts) vào `src/view/motion.ts` (tween + easing + `DUR` + giảm chuyển động) và [references/motion.test.ts](references/motion.test.ts) vào `tests/view/`. Game `own`: thay `DUR` bằng số đo từ bản gốc.
3. Nối vào vòng lặp trong `src/main.ts`:
   ```ts
   const ui = new Tweens();    // popup, menu: chạy cả khi pause vì menu
   const scene = new Tweens(); // hiệu ứng trong màn chơi: dừng theo game
   // trong frame(now):
   ui.update(elapsed);
   if (!bus.paused) scene.update(elapsed);
   ```
   Renderer nhận giá trị đang tween (vd `popupScale`, `shownScore`) qua tham số, không đọc từ `world`.
4. DOM/CSS (Settings, nút HTML): dùng `transition`/`@keyframes` trên `transform`/`opacity`, kèm khối `@media (prefers-reduced-motion: reduce)`.
5. Kiểm tra:
   - `npm test` (replay vẫn xanh), `npm run typecheck`, `npm run lint`.
   - `npm run dev`: bấm liên tục, mở/đóng Settings giữa lúc popup đang hiện, `?ad=slow` (không chuyển động nào chạy trong lúc ad, game tiếp tục đúng chỗ), chuyển tab rồi quay lại.
   - DevTools → Rendering → *Emulate prefers-reduced-motion: reduce*: không còn trượt/rung, mọi thông tin vẫn hiện.
   - Performance trên máy yếu (CPU throttle 4×): frame không tụt khi nhiều hiệu ứng chạy cùng lúc.
   - Quay màn hình ngắn cho người dùng duyệt (cổng P3: mục chuyển động UI).
