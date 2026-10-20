---
name: triage
description: Dùng ở pha P0 sau game-recon, khi cần quyết định có nên port game này không — chấm khả thi từng mảng (công cụ, truy cập logic, phụ thuộc vật lý/mạng/backend, khối lượng nội dung, 2D/3D, giới hạn web), ước lượng số ngày mỗi pha vào budget.plannedDays, liệt kê rủi ro và điều kiện cắt lỗ; ra notes/triage.md để người dùng quyết làm hay bỏ.
---

# Triage: có nên port không (P0)

Đầu vào: `notes/recon.md` (skill **game-recon**), `game.yaml`. `own`: chơi thử game gốc được. Đầu ra: `notes/triage.md`, `budget.plannedDays`. Người dùng quyết; agent không tick "Đồng ý làm game này (bạn)".

## 1. Chấm từng mảng
Thang 0–3: 3 dễ · 2 làm được · 1 khó, tốn công · 0 chặn (không có cách hợp lý). Mỗi điểm kèm bằng chứng từ recon hoặc đã kiểm tra.

| Mảng | 3 | 1 | 0 |
| --- | --- | --- | --- |
| Engine, công cụ | recon nhận ra, có project gốc | engine hiếm, ít công cụ | không nhận ra, không đọc được file |
| Truy cập logic | source gốc; Mono/JS/GDScript đọc gần như source | IL2CPP có metadata (Il2CppDumper + Ghidra); `.jsc`/`.luac` đã tìm được key | IL2CPP metadata bị mã hoá, native stripped không tên, script mã hoá không tìm được key |
| Vật lý | không có, hoặc công thức đơn giản tự viết được | Box2D/PhysX nhiều tương tác, cảm giác phụ thuộc engine | vật lý 3D phức tạp là cốt lõi gameplay |
| Mạng, backend | chơi offline hoàn toàn | IAP, remote config, đăng nhập — thay bằng dữ liệu local | multiplayer realtime, kinh tế do server quyết |
| Nội dung (từ kiểm kê) | ít màn, asset nhỏ | nhiều level/asset, cần nén mạnh | vượt xa `budget.initialLoadMB` dù đã nén |
| 2D / 3D | 2D | 3D đơn giản (Three.js) | 3D nặng, shader riêng |
| Giới hạn web | chuột/chạm dễ map; âm thanh ít | nhiều điểm chạm, nghiêng máy; nhạc nền lớn | điều khiển không chuyển được sang chuột/chạm |

Web: âm thanh chỉ phát sau thao tác đầu tiên của người chơi; mục tiêu `budget.minFpsMobile` trên điện thoại yếu. Có mảng 0 → nói thẳng là chặn, đề xuất bỏ hoặc thu phạm vi.

## 2. Ước lượng công
- Số ngày mỗi pha P0–P5, dựa trên điểm và khối lượng. Ghi cách tính (vd "P1: 12 class gameplay × 0.5 ngày + IL2CPP +3").
- Ghi vào game.yaml (sửa tay; schema chỉ nhận khoá `P0`…`P5`, giá trị số):
  ```yaml
  budget:
    plannedDays: { P0: 1, P1: 5, P2: 8, P3: 3, P4: 1, P5: 2 }
  ```

## 3. Rủi ro và luật cắt lỗ
- Mỗi rủi ro: mô tả, khả năng, ảnh hưởng, cách giảm, dấu hiệu sớm.
- `gamekit status` cảnh báo "Vượt thời gian dự kiến — cân nhắc quay lại triage (luật cắt lỗ)" khi số ngày ở pha hiện tại vượt `plannedDays` của pha đó. Viết trước trong `notes/triage.md` điều kiện dừng: vượt bao nhiêu thì làm gì (ước lượng lại, cắt phạm vi ghi `D-n` trong `DECISIONS.md`, hay bỏ). Khi cảnh báo xuất hiện, quay lại file này, không âm thầm làm tiếp.

## 4. Riêng `third-party`
- **Rủi ro clone**: portal có nhận game làm lại không. Đọc tài liệu/tiêu chuẩn portal người dùng cung cấp (ghi chú trong skill platform-sdk `references/portals/`); không có thì hỏi người dùng, không đoán. Ghi kết luận và nguồn.
- **`release.forbiddenTerms`**: tên game gốc, tên studio/nhà phát hành, tên nhân vật, thương hiệu riêng. `release-check` tìm không phân biệt hoa thường theo chuỗi con, nên tránh từ chung chung dễ khớp nhầm.
- Khối lượng reskin (hình, âm thanh, tên, text) cộng vào P3.

## 5. Viết `notes/triage.md`
Bảng điểm + bằng chứng · ước lượng ngày · rủi ro · điều kiện cắt lỗ · (`third-party`) rủi ro clone + forbiddenTerms · đề xuất: làm / làm với phạm vi thu gọn / bỏ, kèm lý do. Tách điều đã kiểm chứng với điều ước lượng.

## 6. Kết thúc
1. `npm run gk -- validate`, rồi `npm run gk -- gate`.
2. Tick mục "Có báo cáo triage…" (và "Đã đánh giá rủi ro clone…" nếu `third-party`) khi đã viết xong.
3. Báo người dùng: đề xuất, điểm thấp nhất và lý do, tổng ngày, rủi ro lớn nhất. Hỏi họ quyết; chỉ họ tick "Đồng ý làm game này (bạn)". Chỉ chạy `gamekit gate --advance` khi họ đồng ý.
4. Tiếp (P1): skill `engine-<engine>` mà `gamekit status` gợi ý, rồi **re-notes**.
