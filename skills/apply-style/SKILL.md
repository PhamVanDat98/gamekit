---
name: apply-style
description: Dùng ở P3 khi làm lại game của người khác, sau asset-spec — áp style đã chọn vào giao diện web (bảng màu, font, nút, HUD, màn loading, popup Settings giữ footer bản quyền), chỉ sửa trong src/view/ và CSS, không đụng gameplay. Dùng cả khi giao diện còn màu/font placeholder của template.
---

# Áp style cho giao diện (P3, game làm lại)

Đầu vào: style đã chọn (`D-n`, `style/direction.md`, bản thử trong `style/preview/`), mục `kind: ui` / `icon` trong `asset-manifest.json`. Đầu ra: `src/view/` và `src/view/style.css` theo style mới. Không sửa `src/core/`, `params/`, `src/contracts/`.

## 1. Bảng màu và font
- Gom màu vào một chỗ: biến CSS (`:root { --gk-bg: …; --gk-primary: …; }`) cho DOM, và bảng `COLORS` trong `src/view/renderer.ts` (đã có sẵn, ghi chú "Colours come from the style (P3)") cho canvas. Không rải mã màu khắp nơi.
- Font: tự host file `woff2` trong `assets/` (nhãn `licensed` + `--license`, vd OFL), khai báo `@font-face` với `font-display: swap`. Không nạp font từ CDN ngoài — `release-check` chặn link ngoài chưa khai báo.
- Kiểm font có đủ ký tự cho mọi ngôn ngữ trong `languages` của `game.yaml`.

## 2. UI
- Nút, khung, thanh máu, HUD: ưu tiên CSS/SVG (`make: vector`) — nét ở mọi DPR, nhẹ, đổi màu dễ. Khung co giãn dùng `nineSlice` theo spec.
- Màn loading (`#loader` trong `style.css`) và nút bánh răng: đổi theo style.
- **Popup Settings**: đổi màu/font/khung thoải mái, nhưng **giữ footer bản quyền** (`gk-settings-footer`, hiện `platform.info.copyright`). Portal yêu cầu; `release-check` chặn khi mất.
- Mọi chữ hiển thị đi qua `t()` và `Language/*.json`; không vẽ chữ vào ảnh nút.
- Trạng thái bằng hình, không chỉ màu: nút tắt có thêm biểu tượng/độ mờ, máu thấp có nhấp nháy hoặc biểu tượng.

## 3. Giữ những gì web-relayout đã làm
Vùng chạm ≥ 44 px CSS, safe area, letterbox, focus bàn phím trong Settings (Tab, Escape) — style mới không được làm mất. Xem skill [web-relayout](../web-relayout/SKILL.md).

## 4. Kiểm
- `npm run dev`: xem mọi màn (bắt đầu, chơi, pause, thua/thắng, Settings) ở máy tính và chế độ điện thoại (dọc, ngang).
- `npm run typecheck`, `npm run lint`, `npm test`.
- `gamekit pack --all && gamekit smoke`: mục "Settings + footer bản quyền" xanh; **xem ảnh chụp** trong `builds/<v>/smoke/` — chữ không tràn, tương phản đủ, HUD không che gameplay.
- `gamekit release-check`: không link ngoài, không tên game gốc.
