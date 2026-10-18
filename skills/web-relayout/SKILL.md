---
name: web-relayout
description: Dùng ở P3 để chuyển game đã dựng lại sang trải nghiệm web — ánh xạ điều khiển của bản gốc (chạm, vuốt, nút ảo) sang chuột, bàn phím và cảm ứng; bố cục co giãn cho màn hình ngang và dọc, DPR, safe area; âm thanh mở sau thao tác đầu; pause khi ẩn tab; kiểm bằng gamekit smoke và ảnh chụp. Dùng cả khi người dùng báo game hiển thị sai kích thước hoặc không điều khiển được trên điện thoại.
---

# Chuyển sang web (P3)

Logic gameplay đã xong ở P2 và không đổi ở đây. P3 chỉ đụng `src/view/` (vẽ, input thiết bị, bố cục) và `src/main.ts`. Sai khác so với bản gốc vì lý do web (vd điều khiển cảm ứng nhanh hơn) phải có `D-n` + `deviation` trong params, người dùng duyệt.

## 1. Điều khiển
Bảng ánh xạ trong `spec/gameplay-spec.md` (mục điều khiển của bản gốc) → `Action` trong `src/contracts/input.ts`. Mỗi hành động phải làm được bằng **cả ba**: bàn phím, chuột, cảm ứng. `src/view/input-dom.ts` là chỗ ánh xạ.
- Bàn phím: mũi tên + WASD cho hướng, Space/Enter cho hành động chính, Escape cho pause/Settings. Không dùng phím trình duyệt chiếm (Ctrl+W, F5…).
- Chuột: nhấp = chạm; kéo nếu bản gốc kéo. Con trỏ đổi khi hover nút.
- Cảm ứng: dùng Pointer Events (`pointerdown/move/up/cancel`), không dùng `touchstart` riêng. Vùng chạm tối thiểu ~44 px CSS. Vuốt: ngưỡng theo px CSS, không theo px thật. `touch-action: none` trên canvas để trình duyệt không cuộn/zoom.
- Nút ảo (joystick, nút bắn) chỉ hiện khi thiết bị có cảm ứng (`matchMedia('(pointer: coarse)')`), đặt trong vùng ngón cái, không che gameplay.
- Không giữ input khi mất focus: `blur`/`visibilitychange` → nhả mọi phím.

## 2. Bố cục
- Thế giới game có kích thước logic cố định (`params.world.width/height`); canvas co giãn giữ tỉ lệ (letterbox), căn giữa. Vẽ theo `devicePixelRatio` (giới hạn ≤ 2 trên điện thoại để giữ FPS).
- Hỗ trợ **cả ngang và dọc**. Game chỉ hợp một hướng: ở hướng kia vẫn chơi được (thu nhỏ) hoặc hiện lời nhắc xoay máy — không để vỡ. Đổi cỡ cửa sổ/xoay giữa ván không mất state.
- HUD, nút, Settings bám mép theo safe area (`env(safe-area-inset-*)`), không bị tai thỏ/thanh điều hướng che.
- Chữ đi qua `t()`; chừa chỗ cho ngôn ngữ dài hơn tiếng Anh.

## 3. Âm thanh và vòng đời
- AudioContext chỉ mở sau thao tác đầu tiên của người chơi (chính sách autoplay).
- Ẩn tab / mất focus: pause game và tắt tiếng qua `PauseBus` (template đã có `web-guard.ts`); quay lại thì tiếp tục, không tự chạy khi đang có Settings hay ad.
- Không dùng `alert`/`confirm`; không mở tab mới.

## 4. Asset cho web
Game của người dùng: asset gốc đã chuyển định dạng ở P1 (skill asset-inventory). Ở đây nén thêm cho vừa `budget.initialLoadMB`: nạp trước thứ cần cho màn đầu, phần sau tải lười. Game làm lại của người khác: reskin theo các skill style-*/asset-spec.

## 5. Kiểm tra
- `npm run dev`, thử bằng chuột, bàn phím, và chế độ thiết bị di động của DevTools (cảm ứng, xoay).
- `gamekit pack --all && gamekit smoke`: ba cấu hình (máy tính, điện thoại dọc, ngang) vào được game, bắt đầu chơi bằng phím/chạm, FPS đạt. **Xem ảnh chụp** trong `builds/<v>/smoke/`: HUD không bị cắt, nút không che gameplay, letterbox đúng.
- Người dùng duyệt bố cục và điều khiển (mục `(bạn)` trong `gates/P3.md`).
