---
name: gameplay-spec
description: Dùng cuối P1 để viết spec/gameplay-spec.md từ ghi chú trong notes/ — core loop, cơ chế, điều khiển, level, điểm, kinh tế, màn hình, RNG — mỗi khẳng định có nguồn và độ tin cậy, nối sang params/ và spec/obligations.yaml. Cũng dùng khi cập nhật spec sau khi phát hiện hành vi mới ở P2.
---

# Gameplay spec (P1)

`spec/gameplay-spec.md` là bản mô tả game gốc **bằng hành vi**, đủ để dựng lại mà không cần mở game gốc. Nó là nguồn cho `spec/obligations.yaml` (skill **parity-check**) và `params/`. Spec không đưa ra kết luận mới: mọi khẳng định đến từ `notes/` (skill **re-notes**, **engine-unity**…).

## 1. Luật viết
- Mỗi khẳng định có **nguồn** (`notes/<file>.md#mục`, hoặc file + field trong game gốc) và **độ tin cậy**: `observed` / `derived` / `inferred`. Viết gọn ở cuối dòng: `(notes/enemy.md — observed)`.
- Số không viết trong spec: dẫn tên param, vd `player.speed`. Giá trị nằm trong `params/*.json`, không chép lại.
- Hành vi, không phải code: "đạn bay thẳng, tăng tốc `bullet.accel` mỗi giây", không phải "hàm Update cộng accel × dt".
- Chưa biết thì ghi "Chưa biết" kèm câu hỏi trong `notes/QUESTIONS.md`. Không lấp chỗ trống bằng đoán.
- `third-party`: viết bằng lời của mình; tên nhân vật, vật phẩm gốc chỉ dùng làm nhãn nội bộ.

## 2. Mục lục
```markdown
# Gameplay spec — <tên game>
## 1. Tóm tắt         thể loại, mục tiêu, một ván kéo dài bao lâu
## 2. Core loop       vòng lặp chính, điều kiện thắng/thua
## 3. Điều khiển      input gốc → hành động; web sẽ map ra sao để ở P3
## 4. Thực thể và cơ chế   mỗi cơ chế một mục con: kích hoạt, hành vi, tương tác, biên
## 5. Level và tiến trình  độ khó tăng thế nào, bảng level (→ spec/oracles/)
## 6. Điểm, tiền, kinh tế  công thức, phần thưởng, giá (→ params/)
## 7. Màn hình và luồng    loading, menu, chơi, pause, thua, thắng, settings; chỗ đặt quảng cáo
## 8. Ngẫu nhiên          thuật toán, seed, cái gì random (→ replay test)
## 9. Thời gian           theo frame hay theo giây, fixed step, đơn vị gốc
## 10. Ngoài phạm vi      đã cắt hoặc đổi (link D-n)
## 11. Chưa biết
```
Bỏ mục không áp dụng, đừng để trống.

## 3. Nối sang params, nghĩa vụ, oracle
- Mỗi cơ chế ở mục 4–6, 8 thành **một hoặc vài nghĩa vụ** trong `spec/obligations.yaml`, `source` trỏ về mục spec. Lập danh sách nghĩa vụ theo skill **parity-check**.
- Bảng nhiều điểm (theo level, theo thời gian) → `spec/oracles/*.json`, lấy từ data gốc hoặc trace (`gamekit oracle import`).
- Mỗi param được nhắc trong spec phải có trong `params/` với `source` và `confidence`. `gamekit validate` kiểm tra tham chiếu của nghĩa vụ.

## 4. Kiểm tra trước khi đóng P1
- Đọc lại mục 2 và 4: người chưa chơi game gốc có hình dung được một ván không?
- Mọi cơ chế đã có nghĩa vụ chưa? Mọi số đã có trong `params/` chưa?
- Những khẳng định chỉ dựa trên `inferred`: liệt kê riêng khi báo người dùng.
- `gamekit validate`, rồi `gamekit gate`. Mục "Có `spec/gameplay-spec.md`" của cổng P1 chỉ tick khi spec xong theo các luật trên.

## 5. Khi spec đổi ở P2
Dựng lại mà phát hiện hành vi mới hoặc sai: sửa `notes/` trước (bằng chứng), rồi spec, rồi nghĩa vụ và test. Không sửa spec cho khớp code.
