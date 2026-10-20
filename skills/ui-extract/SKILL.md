---
name: ui-extract
description: Dùng ở pha P1 khi cần ghi lại toàn bộ giao diện của game gốc — chụp mọi màn hình/popup ở từng trạng thái, đo bố cục (độ phân giải tham chiếu, anchor, safe area), vẽ sơ đồ luồng UI, đưa mọi chuỗi hiển thị vào Language/en.json theo key màn.phần-tử, liệt kê ảnh có chữ, font, animation chuyển cảnh — kết quả là notes/ui.md (+ ảnh chụp), đủ cho mục "ui-kit/ hoặc ghi chú UI từng màn" của cổng P1.
---

# Trích giao diện game gốc (P1)

Đầu ra: `notes/ui.md` (mỗi màn một mục, sơ đồ luồng, bảng chuỗi, bảng ảnh có chữ) và ảnh chụp màn hình. Đây là đầu vào cho gameplay-spec (máy trạng thái), asset-inventory (ảnh có chữ) và web-relayout ở P3.

## 1. Liệt kê màn hình
Lấy danh sách từ hai phía: cấu trúc trong game gốc (scene/prefab Unity, prefab Cocos, `.tscn` Godot…) và chơi thật. Đủ mọi màn và popup: loading, menu, chọn level, HUD, pause, settings, shop, thắng, thua, tutorial, thưởng hằng ngày, hộp thoại quảng cáo/IAP, đánh giá, consent. Mỗi màn ghi các trạng thái: bình thường, nút tắt/khoá, danh sách rỗng, giá trị max, chuỗi dài nhất.

## 2. Ảnh chụp
- Tên `<màn>--<trạng thái>.png`, chụp ở độ phân giải tham chiếu, cả dọc và ngang nếu game gốc hỗ trợ.
- `own`: lưu ở `ui-kit/screens/` (không nằm trong `assets/`/`public/` nên không đóng gói). Được chạy game gốc trong emulator/Editor, dùng debug để nhảy tới trạng thái khó gặp.
- `third-party`: lưu ở `reference/ui/` (gitignored), chụp khi chơi bình thường hoặc từ video; không debug, hook hay can thiệp game đang chạy.

## 3. Bố cục
Mỗi màn trong `notes/ui.md`, kèm nguồn (prefab/scene + đường dẫn node, hoặc ảnh chụp + cách đo) và độ tin cậy (`observed` đọc từ prefab, `inferred` đo trên ảnh):
- Độ phân giải tham chiếu và cách co giãn: Unity `CanvasScaler` (`referenceResolution`, `screenMatchMode`, `matchWidthOrHeight`), Cocos `designResolution` + fitWidth/fitHeight, Godot stretch mode/aspect.
- Từng phần tử: anchor (`anchorMin/anchorMax`, `pivot`), vị trí và kích thước theo px tham chiếu, thứ tự lớp, vùng chạm.
- Safe area (tai thỏ, thanh điều hướng): phần tử nào né, né bao nhiêu.
- Số ảnh hưởng gameplay (kích thước sân chơi, vùng chạm điều khiển) vào `params/` có `source`; số thuần trình bày để trong `notes/ui.md`.

## 4. Sơ đồ luồng
Khối `mermaid` `flowchart` trong `notes/ui.md`: nút là màn/popup, cạnh là hành động (key chuỗi của nút) + điều kiện. Đánh dấu chỗ thời gian mô phỏng dừng, chỗ game gốc hiện quảng cáo (gợi ý điểm nghỉ cho P4), nút không có nghĩa trên web (khôi phục mua hàng, rung, đánh giá trên store) để quyết định ở P3 kèm `D-n`. Máy trạng thái trong `spec/gameplay-spec.md` phải khớp sơ đồ này.

## 5. Chuỗi hiển thị → Language/en.json
- Key dạng `màn.phần-tử` như template (`settings.title`, `game.start`): `menu.play`, `shop.buy`, `win.title`. Chuỗi có số dùng tham số `{score}`; số nhiều dùng hậu tố `.one`/`.other`… (`validate` kiểm tham số các ngôn ngữ khớp `en.json`).
- `own`: giữ nguyên chữ gốc. Game gốc có bảng dịch (CSV, I2 Localization, `.po`…): xuất mỗi ngôn ngữ thành `Language/<mã>.json` cùng key, thêm mã vào `languages` trong `game.yaml`.
- `third-party`: tạo key, chữ tạm viết bằng lời của mình, không dùng tên/thương hiệu gốc (`release.forbiddenTerms`); chữ cuối làm ở P3.
- Dữ liệu (level, hội thoại, item) chỉ giữ key, không giữ câu. Code gọi `t('key')`; `validate` báo `t()` trỏ tới key không có.

## 6. Ảnh có chữ, font, animation
- **Ảnh có chữ** (logo, nút in chữ, banner, tutorial): bảng `ảnh · màn · chữ trong ảnh · textKey`. Chuyển sang asset-inventory để xuất vào `assets/i18n/en/` với `text: true`. Game gốc có bản không chữ (PSD nhiều lớp, nền nút riêng) thì ghi lại: dùng nền + chữ qua `t()` dễ dịch hơn.
- **Font** từng loại chữ: họ font, cỡ ở độ phân giải tham chiếu, độ đậm, màu, viền/bóng, căn lề, tự co chữ. Bitmap font chỉ có chữ Latin cần phương án cho ngôn ngữ khác. Giấy phép font: asset-inventory.
- **Animation, chuyển cảnh**: mở/đóng popup, nhấn nút, chuyển màn, đếm số, vòng lặp chờ. Ghi thời lượng, easing, nguồn (clip Animator, lời gọi DOTween/LeanTween, `cc.tween`…) và độ tin cậy. Animation chặn input hoặc ảnh hưởng nhịp chơi thì thời lượng vào `params/`.

## 7. Settings
Ghi các mục Settings của game gốc. Bản web dùng popup của template (`src/view/settings.ts`): popup phải giữ footer bản quyền `gk-settings-footer` (`platform.info.copyright`); mục gốc không có trên web ghi vào bảng ở bước 4.

## 8. Kết thúc
1. `gamekit validate` sạch (key ngôn ngữ, tham số chuỗi), rồi `gamekit gate`. Mục UI của cổng là mục tay (không phải `(bạn)`): kiểm xong thì tick và báo người dùng.
2. Báo: số màn/popup và trạng thái đã chụp, số chuỗi, ảnh có chữ, phần chỉ đo trên ảnh (`inferred`), câu còn mở trong `notes/QUESTIONS.md`.
3. Tiếp: gameplay-spec, asset-inventory nếu chưa xong; P2 runtime-select; P3 web-relayout dùng `notes/ui.md` để dựng bố cục web.
