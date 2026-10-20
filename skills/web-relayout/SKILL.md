---
name: web-relayout
description: Dùng ở pha P3 khi chuyển một game mobile (của bạn hay làm lại) sang web — bố cục ngang/dọc và đổi cỡ cửa sổ (letterbox hay responsive), safe area, map chuột/bàn phím/cảm ứng vào Action, pause khi mất focus, chữ đọc được trên điện thoại và bản dịch dài; mọi sai khác hành vi gốc ghi D-n chờ người dùng duyệt.
---

# Chuyển bố cục và điều khiển sang web (P3)

Áp cho cả `own` và `third-party`. Gameplay (`src/core/`, `params/`) giữ nguyên; việc nằm ở `src/view/`, `src/view/style.css`, `index.html`. Hành vi người chơi cảm nhận được mà buộc phải khác game gốc → sai khác (bước 6).

## 1. Ghi lại game gốc trước khi sửa
Trong `notes/web-layout.md`: hướng màn hình gốc, độ phân giải thiết kế (`params` `world.width`/`world.height` có `source`), UI neo cạnh nào, mọi thao tác gốc (tap, giữ, vuốt, kéo, đa chạm, nghiêng máy). Đây là chuẩn để so khi người dùng duyệt.

## 2. Chọn cách bố cục
| Cách | Làm thế nào | Khi nào |
| --- | --- | --- |
| Letterbox (mặc định) | Giữ `#game { aspect-ratio }` + `max-width/max-height: 100%`; phần thừa là nền `--gk-bg` của `#stage` | Vùng chơi phải giống hệt gốc (gần như mọi game) |
| Responsive | Canvas theo cỡ `#stage`, vùng nhìn rộng/hẹp theo màn hình, HUD neo cạnh | Chỉ khi letterbox quá nhỏ (vd game dọc trên màn ngang điện thoại) — thấy nhiều/ít thế giới hơn là sai khác |

- `aspect-ratio: 2 / 3` trong `style.css` không đọc từ `params`: đổi `world.width/height` thì sửa CSS cho khớp.
- `Renderer` đặt `canvas.width/height` = cỡ world; muốn nét trên màn DPI cao thì nhân `devicePixelRatio` và `ctx.setTransform` trong `view/` — không đổi toạ độ world.
- Thử cả máy tính ngang, điện thoại dọc và ngang, kéo cỡ cửa sổ liên tục: không vỡ, không cuộn trang, không méo hình. Không chặn bằng màn "xoay máy" nếu game vẫn chơi được.

## 3. Safe area
`index.html` có `viewport-fit=cover`; `#stage` đệm `env(safe-area-inset-*)`. Phần tử `position: absolute` trong `#stage` (vd `.gk-gear` ở `top/right: 10px`) tính từ mép trong viền, **không** tự tránh tai thỏ: cộng `env(safe-area-inset-top/right)` vào vị trí, hoặc đặt trong một khung đã đệm. Nút và HUD không nằm dưới thanh hệ thống.

## 4. Input → `Action`
`core/` chỉ hiểu `Action` trong `src/contracts/input.ts`; thiết bị map ở `src/view/input-dom.ts` (`KEYMAP` + pointer). Thêm hành động mới là đổi contract: chỉ agent chính sửa, kèm test core.
- Dùng Pointer Events (một đường cho chuột, cảm ứng, bút); đa chạm theo `pointerId`; luôn nhả hành động ở `pointerup`/`pointercancel`.
- Bàn phím: phím mũi tên + WASD, Space/Enter cho hành động chính; ghi phím vào `game.controls` trong `Language/*.json`.
- Không có thao tác chỉ dùng hover hay chuột phải (web-guard chặn `contextmenu`); vùng bấm đủ lớn cho ngón tay (khoảng 44 CSS px).
- Nút DOM mới nằm ngoài vùng chơi phải được loại như `.gk-settings, .gk-gear` (`closest(...)`) để không kích hoạt gameplay.
- Ngưỡng vuốt, vùng chết joystick ảnh hưởng cảm giác chơi: đưa vào `params/` có `source`; khác gốc thì là sai khác.

## 5. Focus, pause, âm thanh
Dùng `PauseBus` (`src/platform/pause-bus.ts`), không tự thêm listener riêng. `installWebGuard` đã: pause `hidden` khi ẩn tab, `blur` khi cửa sổ/iframe mất focus, chặn phím cuộn trang, focus canvas khi chạm, chặn menu chuột phải. Vòng lặp chỉ chạy khi `!bus.paused`; âm thanh theo `bus.muted`; mở Settings là lý do `menu`. Âm thanh chỉ bật sau thao tác đầu tiên của người chơi (trình duyệt chặn autoplay).

## 6. Chữ đọc được, bản dịch dài
- Chữ thật hiển thị = cỡ font × (chiều cao canvas trên màn / `world.height`). Ở 390×844 dọc, chữ phụ nên còn ≥ 12 CSS px.
- `fitFont` trong `renderer.ts` thu font tới 10 px cho vừa dòng; chuỗi dài hơn nữa thì xuống dòng hoặc xin bản dịch ngắn hơn, không thu tiếp. Mọi chữ qua `t()`; ảnh có chữ qua `tAsset()`.
- Kiểm mọi ngôn ngữ trong `game.yaml` `languages`, cả RTL (`_meta.dir: "rtl"`).

## 7. Sai khác game gốc
Đổi vùng nhìn, điều khiển (vd joystick ảo thay nghiêng máy), cỡ vùng chạm ảnh hưởng gameplay, tốc độ theo cỡ màn → thêm `deviation: { original, reason, decision: "D-n", approved: false }` vào giá trị trong `params/` + mục `D-n` trong `DECISIONS.md` (mẫu trong file). Chỉ người dùng đặt `approved: true`; `validate` chặn sai khác chưa duyệt.

## 8. Kết thúc
1. `npm test`, `npm run typecheck`, `npm run lint`, `npm run gk -- validate`.
2. `npm run dev`: đổi cỡ cửa sổ, chế độ thiết bị của DevTools (dọc/ngang), chơi bằng chuột, bàn phím, cảm ứng; mở Settings; chuyển tab để thấy pause.
3. Tuỳ chọn: `npm run gk -- pack` rồi `npm run gk -- smoke` (ảnh `phone-portrait`, `phone-landscape`, `lang-<mã>`, `settings` trong `.gamekit/local/smoke/`).
4. `npm run gk -- gate`. Báo người dùng: cách bố cục đã chọn, bảng map điều khiển, các D-n chờ duyệt, những gì chưa thử trên máy thật. Mục "Đã duyệt bố cục và điều khiển trên web (bạn)" chỉ người dùng tick.
5. Tiếp theo: `own` → nén asset, rồi P4 (**platform-sdk**) khi người dùng đồng ý `gate --advance`; `third-party` → **style-direction**.
