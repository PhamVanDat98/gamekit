---
name: apply-style
description: Dùng ở pha P3 khi người dùng đã chọn một style cho game làm lại (third-party) — chạy gamekit style choose <id> để sinh style/style.json và src/view/theme.ts, rồi thay màu/font viết cứng trong view và CSS bằng THEME và biến --gk-*, giữ footer bản quyền của Settings, kiểm bằng validate, typecheck, lint, npm run dev.
---

# Áp style đã chọn (P3, third-party)

Chỉ làm sau khi **người dùng** đã nói `id` (skill **style-preview**). Không tự chọn, không tick "Đã chọn style (bạn)".

## 1. Sinh file
`npm run gk -- style choose <id>`:
- kiểm `style/options/<id>.json`: lỗi schema hoặc `id` khác tên file thì dừng; tương phản thấp và **file font thiếu chỉ là cảnh báo** — nhưng sau đó `validate` báo lỗi và `import` font trong `theme.ts` làm hỏng build, nên tải font vào `assets/fonts/` trước;
- ghi `style/style.json` (bản sao của option);
- ghi đè `src/view/theme.ts` từ template: `THEME.palette` (thêm `onPrimary` đen/trắng nếu thiếu), `THEME.fonts.display/body` (chuỗi font kèm `system-ui, sans-serif`), `THEME.shape` (mặc định `radius 12`, `stroke 0`, `shadow soft`), và `import` file font từ `assets/fonts/` vào `FONT_FILES`.

`theme.ts` là file sinh ra: không sửa tay. Muốn đổi style thì sửa `style/options/<id>.json` rồi chạy lại `style choose <id>` (lệnh này đọc từ `options/`, không đọc `style.json`). `validate` cảnh báo khi `theme.ts` khác bản sinh từ `style/style.json`.

## 2. Style đến game thế nào
`main.ts` gọi `await applyTheme()` trước khung hình đầu: đặt biến CSS trên `<html>` và nạp `FontFace` cho từng file font (nạp lỗi thì giữ font dự phòng, game vẫn chạy).

| Token | Biến CSS |
| --- | --- |
| `palette.bg`, `surface`, `primary`, `secondary`, `text`, `muted` | `--gk-bg`, `--gk-surface`, `--gk-primary`, `--gk-secondary`, `--gk-text`, `--gk-muted` |
| `palette.onPrimary`, `danger`, `success` | `--gk-on-primary`, `--gk-danger`, `--gk-success` (hai cái sau chỉ khi style có) |
| `fonts.display`, `fonts.body` | `--gk-font-display`, `--gk-font-body` |
| `shape.radius`, `stroke`, `shadow` | `--gk-radius`, `--gk-stroke` (px), `--gk-shadow` |

## 3. Thay màu và font viết cứng
1. Tìm: `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl|font(-family)?:" src/view src/main.ts` (bỏ qua `theme.ts`).
2. Canvas/Pixi/Phaser: `import { THEME } from './theme'` rồi dùng `THEME.palette.x`, `THEME.fonts.display` (xem `renderer.ts`). CSS: `var(--gk-x, <giá trị dự phòng>)` như `style.css`.
3. Màu có nghĩa gameplay (nguy hiểm, hồi máu) dùng `danger`/`success`, thêm vào option nếu thiếu. Lớp phủ tối kiểu `rgba(0,0,0,.55)` giữ được.
4. Không đổi gì trong `src/core/` hay `params/`: style chỉ là hình.

## 4. Settings và chữ
- Đổi giao diện popup qua các rule `.gk-settings*` trong `style.css`. **Giữ** `footer.gk-settings-footer` với `platform.info.copyright`, hiện ở mọi ngôn ngữ; `release-check` báo lỗi nếu `framework.js` không còn `gk-settings-footer`.
- Font mới thường rộng hơn: xem lại chữ trong canvas (`fitFont` chỉ thu tới 10 px) và nút DOM với chuỗi dài nhất mọi ngôn ngữ. Chữ vẫn qua `t()`; lint chặn chữ viết cứng.
- File font trong `assets/fonts/` phải có nhãn `licensed` trong `provenance.json`.

## 5. Kiểm tra
1. `npm run typecheck`, `npm run lint`, `npm test`.
2. `npm run gk -- validate`: không lỗi style, không cảnh báo `theme.ts` lệch, không thiếu font.
3. `npm run dev`: màn chờ, lúc chơi, game over, Settings (footer còn), từng ngôn ngữ, cỡ điện thoại dọc/ngang. Chụp ảnh để báo.

## 6. Kết thúc
`npm run gk -- gate` (mục "Style đã áp vào game" chấm tự động theo `style/style.json`). Báo người dùng: style đã áp, các chỗ đã thay màu/font, chỗ còn lệch, ảnh chụp. Ảnh mới sinh bằng `gamekit gen image` từ giờ ghép `art.prompt` và bảng màu của style này. Tiếp theo: **asset-spec** (nếu chưa có `asset-manifest.json` đầy đủ), sinh/thay asset, rồi duyệt bằng `npm run gk -- review`.
