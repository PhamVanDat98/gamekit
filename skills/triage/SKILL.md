---
name: triage
description: Dùng ở cuối P0 để quyết định có làm game này không — đọc đánh giá khả thi trong notes/recon.md (truy cập logic, số cơ chế, làm rối code, phụ thuộc server), chỉnh số ngày dự kiến trong game.yaml, đề xuất chạy thử (pilot) khi rủi ro, và hỏi người dùng quyết. Dùng lại khi P1 cho thấy game lớn hoặc khó hơn ước lượng, hoặc khi status báo vượt thời gian dự kiến.
---

# Đánh giá khả thi (P0)

Mục tiêu: người dùng quyết **làm / chạy thử / bỏ** dựa trên số liệu, không dựa trên cảm giác.

## 1. Đọc đánh giá của recon
`notes/recon.md`, mục "Đánh giá khả thi", nhân bốn hệ số:

| Hệ số | Giá trị |
| --- | --- |
| Truy cập logic | 1 có source · 2 Unity Mono, Godot, Flash · 2.5–3 JS/Cocos/Construct/GameMaker · 4 Cocos .jsc · 5 IL2CPP, WebGL, chưa rõ · 7 Unreal, native |
| Số cơ chế | ≤15 type: 1 · ≤50: 1.5 · ≤120: 2.5 · ≤250: 4 · hơn: 6 · chưa biết: 2 |
| Làm rối code | ×1.5 khi có |
| Phụ thuộc server | ×1.5 khi có SDK mạng/dữ liệu server |
| Không gian, vật lý | 2D: ×1, rigidbody ×1.3 · 3D do code điều khiển: ×1.5 · 3D rigidbody: ×2.5 (luôn ít nhất "chạy thử") · chưa biết: ×1 |

Điểm < 6: làm được · 6–15: nên chạy thử · ≥ 15: rủi ro cao. Số ngày dự kiến từng pha được ghi vào `budget.plannedDays`. Đây là ước lượng thô.

## 2. Chỉnh theo điều recon không biết
Hỏi hoặc kiểm tra rồi chỉnh `budget.plannedDays` trong `game.yaml`, ghi lý do vào `notes/recon.md` (Ghi chú thêm):
- **Danh mục cơ chế đếm cả code không phải gameplay** (UI, tiện ích, SDK). Nhìn qua `spec/inventory.yaml`: nếu phần lớn là phụ trợ, số cơ chế thật nhỏ hơn.
- **3D**: recon chỉ thấy 2D/3D khi code tham chiếu tới type vật lý/render (IL2CPP: sau khi có dump). 3D + rigidbody nghĩa là va chạm sẽ chỉ khớp kết quả/cảm giác, không khớp từng khung hình (skill port-physics §5) — nói rõ với người dùng **trước khi** họ đồng ý làm. Shader riêng, animation 3D: tăng P2/P3.
- **Nhiều level/nội dung dạng data** (ScriptableObject, JSON level): P1 nhẹ hơn (đọc data), P3 nặng hơn (asset).
- **Server**: phần gameplay chạy trên server không có trong file — phải tự thiết kế lại hoặc bỏ (ghi `D-n`).
- **Mua trong app**: portal web không có; phải quyết thay bằng gì.
- Game làm lại của người khác: P3 có reskin, đã tính trong số ngày.

## 3. Chạy thử (pilot)
Điểm từ 6 trở lên: đề xuất `pilot: true` trong `game.yaml` — đi P1→P2 cho **một** cơ chế chính trước (ví dụ: di chuyển + va chạm của nhân vật), đo thời gian thật, rồi quyết tiếp. Ghi cơ chế chọn chạy thử vào `DECISIONS.md`.

## 4. Người dùng quyết
Trình bày: điểm, các hệ số, rủi ro lớn nhất, số ngày dự kiến, đề xuất (làm / chạy thử / bỏ). Mục "Đồng ý làm game này (bạn)" trong `gates/P0.md` **chỉ người dùng tick**.

## 5. Luật cắt lỗ
`gamekit status` cảnh báo khi một pha vượt số ngày dự kiến. Khi đó quay lại skill này: cập nhật ước lượng bằng số thật (`gamekit re` cho P1: số câu còn mở, tỉ lệ phủ danh mục cơ chế), hỏi người dùng làm tiếp hay dừng.
