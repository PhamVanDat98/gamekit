# Kỹ thuật làm art dùng được trong web game

Mỗi mục: làm thế nào, số nên dùng, `gamekit assets` bắt được gì, vẽ trong game bằng gì (`src/view/art.ts`).

## 1. Kích thước chuẩn và mật độ điểm ảnh
- **Khung thiết kế (design resolution)**: chọn một khung gốc cho cả game (theo game gốc, hoặc vd 720×1280 dọc / 1280×720 ngang; template demo dùng 480×720). Mọi `width`/`height` trong `asset-manifest.json` là cỡ **hiển thị @1x** trong khung đó.
- **@2x là mặc định cho sprite và UI**: điện thoại có mật độ điểm ảnh 2–3, ảnh @1x sẽ mờ. Lưu @2x (`"scales": [2]`), nền xa hoặc đã mờ có thể @1x. Đừng vượt quá 2–3× cỡ hiển thị: chỉ tốn dung lượng (`review` báo khi > 3×).
- **Cùng mật độ cho cả bộ**: mọi asset hiện trên màn hình nên có số px chi tiết / px hiển thị gần nhau. Một ảnh bị phóng to sẽ mờ hẳn giữa các ảnh nét — lỗi "chắp vá" hay gặp nhất.
- **Giới hạn texture**: cạnh ≤ 2048 px chạy mọi máy; ≤ 4096 hầu hết máy; lớn hơn thì chia nhỏ. Safari iOS còn giới hạn tổng diện tích canvas (khoảng 16,7 triệu px cho một canvas) — đừng vẽ nền khổng lồ vào một canvas phụ.
- **Kích thước chẵn** cho ảnh @2x (hiện ở @1x không rơi vào nửa pixel). **Bội số của ô tile** cho tile và màn chơi theo lưới.
- **Luỹ thừa của 2** (64, 128, 256…): bắt buộc cho tile lặp và mipmap trên WebGL1; WebGL2, canvas 2D, Pixi không bắt buộc nhưng atlas và mipmap vẫn gọn hơn.
- **Nét viền theo px màn hình**: quyết định một độ dày nét ở @1x (vd 3 px) cho mọi thứ — boss to và đồng xu nhỏ cùng 3 px. Phóng to cả hình có nét sẽ làm nét dày theo; vẽ lại nét thay vì scale.

## 2. Tile và tileset
- **Lặp liền (seamless)**: mép trái khớp mép phải, trên khớp dưới. Kiểm: dịch ảnh nửa ô (offset/wrap) và xem đường nối giữa ảnh. `assets analyze` nhận ra tile lặp; `check` báo lỗi nếu khai báo `seamless` mà mép lệch.
- **Tránh lộ lặp**: không có chi tiết nổi bật duy nhất trong ô (mắt người tìm ra mẫu lặp ngay); 2–4 biến thể cùng mép + lật/xoay ngẫu nhiên; chi tiết lớn (đá, cây) đặt thành sprite riêng phía trên.
- **Cỡ ô**: 16/32 (pixel art), 64/128 (HD). Cả tileset cùng một cỡ.
- **Chuyển tiếp giữa địa hình** (cỏ ↔ đất ↔ hang): cần tile chuyển tiếp — kiểu 9 ô (terrain 3×3), Wang 16 ô, hoặc blob 47 ô (autotile). Không có thì hai tile khác loại đặt cạnh nhau lộ ranh giới (`review` báo "đặt cạnh nhau lộ ranh giới").
- **Tile trong atlas**: chừa 2 px + **extrude** 1–2 px (nhân bản pixel mép ra ngoài) — không thì khi camera ở vị trí lẻ hoặc co giãn sẽ thấy đường kẻ giữa các ô. Làm tròn vị trí camera về pixel nguyên.
- **Isometric**: ô hình thoi tỉ lệ 2:1 (vd 64×32), vẽ từ sau ra trước.
- Vẽ: `drawTiled(ctx, img, x, y, w, h, { offsetX, offsetY })`.

## 3. Kéo giãn: 9-slice, 3-slice, dải
- **9-slice** (khung, popup, nút co giãn): 4 góc giữ nguyên cỡ, 4 cạnh kéo một chiều, giữa kéo hai chiều.
  - Viền (inset) ≥ bán kính bo góc + độ dày nét + phần trang trí góc.
  - **Vùng giữa phải trơn** (một màu, hoặc gradient theo một chiều). Có hoạ tiết thì sẽ bị kéo méo (`check` báo); hoạ tiết lặp thì dùng chế độ lặp thay vì kéo.
  - Cỡ nhỏ nhất của khung = viền trái + phải (nhỏ hơn thì góc bị thu — `nineSlicePieces` tự thu theo tỉ lệ).
  - Lề nội dung (padding chữ, nút bên trong) là thông số riêng, không phải viền 9-slice.
- **3-slice** (thanh máu, nút cao cố định, viên thuốc): 2 đầu giữ nguyên, thân kéo. Thanh tiến trình: khung 3-slice + phần đầy cũng 3-slice, cắt theo phần trăm.
- **Dải 1 chiều** (bầu trời gradient, vignette): một cột/hàng là đủ, kéo tự do — hoặc vẽ bằng code (gradient) thay ảnh.
- **UI bằng DOM**: CSS `border-image-source` + `border-image-slice: <trên> <phải> <dưới> <trái> fill` + `border-width` = viền × scale.
- Vẽ: `drawNineSlice(ctx, img, nineSlice, x, y, w, h, 1 / scale@)`.

## 4. Nền và parallax
- **Nền cuộn ngang**: mép trái khớp mép phải (`seamless: "x"`); rộng ≥ chiều rộng màn hình lớn nhất. Game cuộn dọc: lặp dọc.
- **Nhiều lớp**: xa → gần, hệ số cuộn vd 0.1 / 0.3 / 0.6 / 1 (mặt đất). **Lớp xa nhạt hơn, ít tương phản, ít bão hoà, ngả màu trời** (phối cảnh khí quyển) — vừa tạo chiều sâu vừa để vật chơi nổi lên (`review` báo "nền nổi hơn vật chơi").
- **Nhiều tỉ lệ màn hình**: vẽ vùng an toàn (gameplay, UI quan trọng) cho tỉ lệ hẹp nhất, mở rộng phần nền (bleed) cho màn rộng nhất (vd 4:3 → 21:9). Không kéo méo nền theo tỉ lệ màn hình.
- Vẽ: `drawTiled(…, { offsetX: cameraX * factor })` mỗi lớp.

## 5. Sprite, sheet, pivot
- **Một animation = một cỡ khung** cho mọi khung; **pivot cùng một điểm** (chân cho nhân vật đứng đất, tâm cho đạn/vật bay, góc trên-trái hoặc tâm cho UI). Pivot lệch giữa các khung → nhân vật rung.
- **Chừa ≥ 2 px trống** quanh hình trong mỗi khung (khi co giãn không dính sang khung bên cạnh — `check` báo "khung chạm nhau").
- **Trim**: cắt lề trong suốt thừa để nhẹ, nhưng giữ cỡ gốc và độ lệch trong dữ liệu atlas để pivot không đổi (`analyze` báo khi > 40% ảnh là lề trống).
- **Hitbox không lấy từ hình**: nằm trong `params/` (gameplay).
- **Không in chữ vào ảnh**: chữ đi qua `t()`; số điểm dùng font hoặc bitmap font.

## 6. Atlas
- Gom theo **màn/ngữ cảnh dùng chung** (atlas màn chơi 1, atlas UI chung), không theo loại file — một màn chỉ tải atlas của nó.
- ≤ 2048×2048; padding 2 px; extrude 1 px cho tile; trim bật; xoay tắt (đơn giản cho canvas 2D).
- Alpha nhân trước (premultiplied) khi dùng WebGL; Pixi tự làm.

## 7. Pixel art
- **Lưu ×1**, phóng **số nguyên** (`integerScale`) với **không làm mượt** (`crispPixels`). `analyze` báo khi pixel art bị lưu ở cỡ phóng to.
- **Một cỡ pixel cho cả bộ**: không trộn sprite phóng ×2 với ×3 trên cùng màn (gọi là "mixels" — trông chắp vá ngay).
- Không xoay, không co giãn lẻ, làm tròn vị trí về pixel của khung gốc. Không khử răng cưa (mép cứng) — trộn mép mượt vào bộ pixel art là lạc (`review` báo).

## 8. Alpha và mép
- **Một kiểu mép cho cả bộ**: khử răng cưa (mượt) hoặc cứng (pixel).
- **Viền tối khi co giãn**: pixel trong suốt mang màu đen bị trộn vào mép khi lọc ảnh. Canvas 2D và Pixi nhân alpha trước nên không bị; WebGL tự viết, mipmap tự tạo, công cụ resize không nhân alpha thì bị. Sửa: `gamekit assets bleed` (đổ màu mép ra vùng trong suốt, phần nhìn thấy không đổi).

## 9. Định dạng và dung lượng
| Loại | Định dạng |
| --- | --- |
| Nhân vật, vật phẩm, UI có nét | WebP lossless hoặc PNG; lossy chất lượng cao nếu cần nhẹ (kiểm mép) |
| Nền vẽ tay lớn, mờ, không cần trong suốt | WebP lossy / JPG |
| Pixel art | PNG (lossless, ít màu → rất nhẹ) |
| Icon, UI phẳng đơn giản | SVG hoặc vẽ bằng code |
Tổng dung lượng tải đầu theo `budget` trong `game.yaml` (`release-check`).

## 10. Luật liền mạch (tóm tắt để duyệt)
1. Cùng mật độ điểm ảnh trên màn hình.
2. Cùng độ dày nét theo px màn hình; cùng có hoặc cùng không có nét viền.
3. Cùng một bảng màu (màu mới theo quy tắc của style).
4. Cùng hướng sáng, cùng kiểu đổ bóng.
5. Cùng kiểu mép (mượt / pixel), cùng cỡ pixel nếu là pixel art.
6. Cùng góc nhìn và phối cảnh; tỉ lệ đúng giữa các vật.
7. Nền lùi, vật chơi nổi; UI tách khỏi thế giới nhưng cùng họ.
8. Không mối nối lộ: tile, nền cuộn, khung 9-slice.
