---
name: style-direction
description: Dùng ở P3 khi reskin (game third-party, hoặc game của người dùng khi họ muốn làm mới đồ hoạ) — tổng hợp gameplay, UI, ngân sách và gu của người dùng thành 3–5 hướng style art raster khác hẳn nhau, viết art/styles.yaml (style lock, bảng màu, hướng bố cục UI, bộ concept chung) để Codex vẽ concept cho người dùng chọn.
---

# Đề xuất hướng style (P3)

Claude không vẽ được ảnh raster, nhưng xem được ảnh và viết được brief. Skill này biến hiểu biết về game thành **các hướng style có thể so sánh**. Ảnh do bên vẽ ảnh (mặc định Codex) sinh ở skill **style-preview**.

Game `own`: chỉ làm khi người dùng yêu cầu đổi đồ hoạ. Ghi lý do thành `D-n` trong `DECISIONS.md`, và hỏi người dùng sửa mục "Hình… giữ như bản gốc" trong `gates/P3.md`.

## 1. Gom đầu vào
- `spec/gameplay-spec.md`, `params/` (cỡ nhân vật, hitbox, tốc độ: đồ hoạ phải đọc được ở tốc độ đó), danh sách màn hình và UI, `budget.initialLoadMB`, portal, hướng màn hình (ngang/dọc).
- Hỏi người dùng (Claude Code: AskUserQuestion, mỗi lần tối đa 3 câu): người chơi mục tiêu và cảm giác muốn có, style họ thích hoặc ghét (ảnh họ đưa: mở xem), giới hạn (ngân sách, thời gian). Không hỏi lại điều đã có trong spec.
- `third-party`: được xem ảnh trong `reference/` để hiểu **chức năng** từng thứ (cái gì là chướng ngại, cái gì là HUD). Không mô tả lại hình dáng của chúng.

## 2. Chọn các hướng khác hẳn nhau
3–5 hướng, mỗi hướng khác nhau ở ít nhất hai trục: kỹ thuật vẽ (pixel, vẽ tay, cel-shade, giấy cắt, 3D render, painterly…), nhiệt độ màu, ngôn ngữ hình khối (tròn/góc cạnh), mức chi tiết. Không đưa bốn biến thể của cùng một style.

Với mỗi hướng, kiểm tra nó hợp web raster:
- Đọc rõ ở cỡ hiển thị nhỏ nhất (icon 32–48px, nhân vật trên điện thoại): hình khối rõ, tương phản nhân vật/nền.
- Ngân sách tải: style nhiều nền lớn, chi tiết cao thì tốn MB. Pixel art nhẹ nhưng phải scale nearest-neighbour.
- Nhất quán được qua hàng chục asset: model ảnh giữ được style này khi chỉ có prompt và ảnh mẫu không?
- Mọi thông tin gameplay có tín hiệu hình ảnh, không chỉ dựa vào màu (người mù màu, tắt tiếng).

## 3. Viết `art/styles.yaml`
Schema: `.gamekit/schemas/art-styles.schema.json`.

```yaml
concepts:                       # cùng một bộ cho mọi style, để so được với nhau
  - id: hero
    brief: Nhân vật chính, toàn thân, tư thế đặc trưng khi chơi (bay, chạy…)
    size: [1024, 1024]          # tỉ lệ khung; model ảnh thường ra 1024², 1536×1024, 1024×1536
    alpha: true                 # nền trong suốt
  - id: hazard
    brief: Một chướng ngại và một vật phẩm nhặt được, đặt cạnh nhau
    size: [1024, 1024]
    alpha: true
  - id: play-landscape
    brief: Màn chơi đang diễn ra, màn ngang, với bố cục HUD mới (điểm, máu, nút pause)
    size: [1536, 1024]
  - id: menu-portrait
    brief: Màn menu chính trên điện thoại dọc, nút Play to, nút cài đặt
    size: [1024, 1536]
styles:
  - id: paper-cut
    name: Giấy cắt lớp
    pitch: Ấm, đọc rõ ở cỡ nhỏ nhờ viền bóng đổ; ít chi tiết nên ảnh nhẹ
    lock: >-
      flat layered paper cut-out illustration, visible paper grain, soft drop shadows between layers,
      rounded shapes, warm pastel palette, even soft lighting from top-left, clean game art
    palette: ['#F4E9D8', '#E07A5F', '#3D405B', '#81B29A', '#F2CC8F']
    ui: HUD là nhãn giấy dán ở góc trên; nút tròn to ≥ 56px cho cảm ứng; popup như tấm thiệp
    avoid: [photorealism, gradients mesh, thin outlines]
    refs: [sách tranh thiếu nhi kiểu giấy xé, diorama giấy]
```

- `concepts`: 3–5 ảnh, gồm ít nhất một nhân vật/vật thể nền trong suốt và một màn hình có UI. **Bố cục UI được làm mới**: mỗi style có thể đặt HUD, nút, menu khác bản gốc (ghi trong `ui`), miễn là vẫn đủ thông tin gameplay và hợp cả màn ngang lẫn dọc.
- `lock`: tiếng Anh, 20–60 từ: chất liệu/kỹ thuật, nét viền, đổ bóng, ánh sáng, màu, góc nhìn. Không tên game, thương hiệu, nhân vật, không tên hoạ sĩ còn sống.
- `palette`: 4–8 mã hex. `avoid`: thứ model hay làm sai với style này.
- Chữ trong mockup UI chỉ để minh hoạ. Bản thật chữ đi qua `t()`, không in vào ảnh.

## 4. Kiểm tra rồi trình bày
- `npm run gk -- validate`: chặn schema sai, id trùng, tên trong `release.forbiddenTerms`, đường dẫn `reference/`.
- Trình bày cho người dùng một bảng ngắn: tên, một câu pitch, điểm mạnh/rủi ro. Mỗi lượt vẽ tốn hạn mức của Codex: hỏi người dùng muốn vẽ tất cả hay bớt hướng nào.
- Xong → skill **style-preview**.
