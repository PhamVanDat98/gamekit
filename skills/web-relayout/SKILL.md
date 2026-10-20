---
name: web-relayout
description: Dùng ở P3 khi chuyển bản dựng lại thành game web thật sự — điều khiển chuột/bàn phím/cảm ứng, bố cục ngang và dọc, đổi cỡ cửa sổ, devicePixelRatio, safe area, nút chạm đủ to, pause khi mất focus, nén asset — và kiểm bằng gamekit smoke (xem ảnh chụp). Cũng dùng khi smoke báo cuộn trang, canvas tràn hoặc màn hình trống.
---

# Chuyển sang web (P3)

Mục tiêu cổng P3: chơi tốt trên máy tính và điện thoại, cả ngang lẫn dọc; smoke đạt; asset đã nén. Gameplay giữ như game gốc: mọi sai khác vì web (điều khiển cảm ứng, bố cục) phải có `D-n` trong `DECISIONS.md`.

`third-party`: P3 còn có reskin (chọn style, asset-spec, thay hình/âm thanh/text). Các skill đó chưa có trong bản này; làm theo checklist `gates/P3.md`.

## 1. Điều khiển
- Thiết bị → `Action` (`src/contracts/input.ts`) chỉ trong `src/view/input-dom.ts`. `core/` không biết chuột hay phím.
- Máy tính: phím mũi tên/WASD/Space như game gốc trên PC (nếu có), chuột cho menu. Điện thoại: chạm theo vùng, nút ảo, hoặc vuốt. Chọn cách giữ được cảm giác của game gốc; khác thì ghi `D-n`.
- Nhiều action cùng lúc (đi + nhảy) phải chạy được với cả phím và chạm đa điểm.
- `web-guard` (`src/platform/web-guard.ts`) đã chặn phím cuộn trang, pause khi tab ẩn hoặc mất focus. Đừng gỡ.
- Âm thanh chỉ bắt đầu sau tương tác đầu tiên (luật autoplay của trình duyệt).

## 2. Bố cục
| Việc | Cách làm |
| --- | --- |
| Tỉ lệ khung | Letterbox (giữ tỉ lệ gốc, viền đen) đơn giản và giữ đúng gameplay; responsive (mở rộng vùng nhìn) chỉ khi không làm lộ thông tin gameplay. Ghi lựa chọn vào `D-n` |
| Ngang và dọc | Game gốc một hướng: hướng còn lại vẫn phải chơi được (canvas co lại, HUD xếp lại). Không chặn bằng màn "xoay máy" trừ khi người dùng duyệt |
| Đổi cỡ | Nghe `resize`; canvas không bao giờ tràn khung, trang không bao giờ cuộn |
| Độ nét | Kích thước backing store = CSS × `devicePixelRatio` (giới hạn ~2 để giữ FPS) |
| Safe area | `env(safe-area-inset-*)` cho HUD và nút sát mép |
| Nút chạm | ≥ 44px trên điện thoại; nút Settings không đè lên vùng chơi |

Bố cục từng màn lấy từ `notes/ui/` (skill **ui-extract**).

## 3. Asset
- `gamekit assets convert <file|thư mục> --to assets/... --label own`: ảnh → WebP, âm thanh → MP3 (cần ffmpeg). Ảnh WebP to hơn bản gốc thì giữ bản gốc.
- Sprite sheet Unity: `gamekit assets unity-atlas <ảnh.png> --to <atlas.json>`, dùng được với Pixi/Phaser.
- Mọi file mới trong `assets/`, `public/` phải có nhãn provenance. Asset nặng không cần lúc mở game thì tải sau (skill **perf-budget**).

## 4. Vòng kiểm: smoke → xem ảnh → sửa
1. Cấu hình `smoke` trong `game.yaml` cho đúng game: `start` (bước từ màn đầu vào lúc chơi: `click x y` / `tap x y` theo tỉ lệ canvas, `key <Code>`, `wait <ms>`), `keys` (phím bấm ngẫu nhiên khi chơi), `playSec`, `target` (selector canvas, mặc định `canvas`), `settings` (nút Settings, mặc định `.gk-gear`).
2. `gamekit smoke` (hoặc `--only desktop,mobile-portrait,mobile-landscape` khi đang sửa bố cục).
3. **Mở và xem** `.gamekit/smoke/desktop*.png`, `mobile-portrait*.png`, `mobile-landscape*.png`. Smoke chỉ bắt lỗi đo được (cuộn trang, canvas tràn, canvas < 25% màn hình, màn một màu, hình đứng yên, nút Settings < 32px trên điện thoại). Chữ bị cắt, HUD đè nhau, nút khó bấm thì chỉ thấy bằng mắt.
4. Sửa, chạy lại cho tới khi smoke đạt và ảnh trông đúng.

Chi tiết từng lỗi smoke: skill **qa-smoke**.

## 5. Kết thúc
`npm test`, `gamekit smoke`, `gamekit gate`. Báo người dùng kèm đường dẫn ảnh chụp để họ duyệt. Mục "Đã duyệt bố cục và điều khiển trên web (bạn)" **chỉ người dùng tick**, sau khi họ tự chơi `npm run dev` trên máy tính và điện thoại. Chỉ báo những lệnh đã thật sự chạy.
