# Làm asset để chuyển động được (khi tạo bằng AI)

## Vì sao không xin AI một sprite sheet
Model tạo ảnh giỏi **một ảnh đẹp**, dở **nhiều ảnh giống hệt nhau**: xin "sprite sheet đi bộ 8 khung" thì mỗi khung đổi một chút tỉ lệ, màu, nét — nhân vật "nhảy hình" (boiling), tay chân không theo một đường cung nào, timing không chỉnh được. Cách chắc ăn:

> **Một bản vẽ nhân vật → tách thành phần → rig cắt rời → chuyển động bằng key.** Mọi khung là cùng một bản vẽ nên không bao giờ lệch; timing, ease, arc sửa trong JSON.

## Thiết kế nhân vật dễ rig
- Hình khối đơn giản, silhouette rõ; đầu to (cartoon), tay chân dạng ống/giọt; **khớp tròn** (vai, hông, cổ) để xoay không lộ góc.
- Phần tách rõ, mỗi phần một màu chính: đầu, thân, tay trên/dưới (hoặc cả tay), chân, bàn chân, đuôi, tai, mắt, miệng.
- Pose trung tính: đứng thẳng, tay hơi dang (A-pose), nhìn nghiêng hoặc 3/4 — đúng hướng game cần. Game lật trái/phải: dùng `sx: -1` ở root, nên nhân vật không có chi tiết bất đối xứng quan trọng (chữ, logo).
- **Không vẽ bóng đổ, hiệu ứng, chữ vào ảnh**: bóng dưới chân là một phần riêng (ellipse, thu nhỏ khi nhân vật lên cao — secondary action miễn phí); chữ đi qua `t()`.
- Mắt và miệng là phần riêng để biểu cảm không vẽ lại: chớp mắt bằng `eyes.sy` (rẻ nhất) hoặc đổi ảnh (mở / nhắm / hoảng / vui); miệng 3–5 hình.

## Cách tạo
1. **Ảnh tham chiếu** một lần (style đã chọn ở P3): nhân vật toàn thân, nền phẳng/trong suốt, nét và màu phẳng (flat), không bóng đổ.
2. **Tách phần**, chọn một:
   - Tạo lại từng phần từ ảnh tham chiếu (image-to-image / cùng seed / "same character, only the left arm, transparent background"), mỗi phần **vẽ dư** phần bị che ở khớp 10–20% (tay vẽ dài vào trong vai).
   - Cắt từ ảnh toàn thân bằng công cụ tách lớp/xoá nền, rồi vẽ bù phần bị che ở khớp.
   - Vẽ bằng code (SVG/canvas path) khi hình đơn giản: AI viết vector cho hình cartoon đơn giản rất ổn, đổi hình bằng tham số (độ cong miệng, độ mở mắt), sắc nét ở mọi kích thước. Hợp cho UI, vật phẩm, nhân vật dạng khối.
3. **Pivot = khớp**: đo toạ độ khớp trên từng ảnh (vai trên ảnh tay, cổ trên ảnh đầu, chân trên ảnh thân) → `pivot` của part; vị trí khớp trên ảnh cha → `at`.
4. **Ghép rig** theo mẫu `src/view/anim/sample-rig.ts`, rồi trỏ `RIG` trong `src/view/anim/lab.ts` vào nó: thứ tự phần = cha trước con; `z` cho tay xa (âm) / tay gần (dương).
5. **Thử khớp**: ở lab, tạm đặt `rot` ±30° cho từng phần và `stretch` 0.7 / 1.3 cho thân, chụp màn hình: khớp có hở? phần có bị cắt? Hở thì vẽ dư thêm hoặc dời pivot.

## Spec trong `asset-manifest.json`
Mỗi phần một entry `kind: "anim"`:
```json
{ "id": "hero-arm-l", "path": "assets/img/hero/arm-l.png", "kind": "anim", "make": "image-gen",
  "width": 48, "height": 96, "alpha": true, "pivot": [24, 10], "padding": 4, "atlas": "hero",
  "brief": "Tay trái nhân vật chính, thẳng, vẽ dư 12px phía vai (bị thân che). Parent: body, at [30, 40]." }
```
- `pivot` theo px của ảnh @1x; `padding` ≥ 2–4 px trong suốt để lọc ảnh khi phóng không ăn viền.
- Kích thước @1x = kích thước hiển thị lớn nhất (tính cả `stretch` 1.3 và phóng UI).
- Gộp phần của một nhân vật vào một atlas (`atlas`).
- Provenance: ảnh AI tạo → `generated`; phần tạm → `placeholder` (P5 chặn); người dùng cung cấp → `own`/`licensed`.

## Khi buộc phải vẽ từng khung
Nhân vật vẽ tay từng khung: xuất pose từ motion rồi để Codex vẽ lại từng khung theo pose — [frames.md](frames.md). Biến hình (lửa, khói, nước bắn, nổ, hoá phép) không có pose để xuất:
1. Thử procedural trước: particle (vị trí `out`, kích thước co, alpha `in` lúc chết), hình vector biến dạng theo tham số.
2. Cần ảnh: ít khung (4–8), giữ pose bằng `step` 12 (on twos) — ít khung mà vẫn "vẽ tay". Tạo các khung cùng lúc trong **một ảnh** (một lần sinh, chia lưới) thay vì từng ảnh riêng, rồi cắt; kiểm bằng contact sheet (ghép các khung cạnh nhau và xem chúng có cùng tâm, cùng cỡ).
3. Ghép sprite sheet theo `frames: { count, width, height, fps }` trong manifest; `validate` kiểm kích thước.

## Smear (nhoè chuyển động)
Hành động rất nhanh (vung, quất, lao): 1–2 khung kéo dài phần theo hướng chuyển động — `stretch` 1.4–1.6 dọc hướng đi, hoặc một phần "smear" riêng chỉ hiện ở các khung đó (`alpha` 0 → 1 → 0 bằng `hold`). Mắt người đọc thành tốc độ; dùng thay motion blur.
