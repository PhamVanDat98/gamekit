---
name: style-preview
description: Dùng ở P3 khi làm lại game của người khác, sau style-direction — dựng bản xem thử cho từng hướng style (một khung hình gameplay + màn Settings, cùng bố cục) để người dùng so và chọn; ghi lựa chọn vào DECISIONS.md. Người dùng là người tick mục "Đã chọn style (bạn)" trong gates/P3.md.
---

# Xem thử và chọn style (P3, game làm lại)

Đầu vào: `style/direction.md` (2–3 hướng). Đầu ra: `style/preview/<hướng>/` (ảnh hoặc trang HTML), mục `D-n` trong `DECISIONS.md` ghi hướng được chọn và lý do.

## 1. Dựng thử, rẻ và giống thật
Mỗi hướng một bản xem thử **cùng một cảnh**, để so công bằng:
- một khung hình gameplay điển hình: người chơi, 2–3 kẻ địch/vật cản, vật nhặt, HUD (điểm, máu…) — đúng kích thước logic trong `params/` và tỉ lệ màn hình của game;
- màn Settings (có footer bản quyền `gk-settings-footer`) và nút chính;
- cả **khung dọc và ngang** nếu game hỗ trợ cả hai.

Cách dựng, từ rẻ đến đắt:
1. HTML/CSS/SVG tĩnh trong `style/preview/<hướng>/index.html` với hình khối + bảng màu + font: đủ để chọn hướng.
2. Vài hình chủ chốt (nhân vật chính, một kẻ địch, nền) bằng công cụ tạo hình nếu phiên có, hoặc phác thảo của hoạ sĩ.
3. Nhánh git thử áp màu/font vào game thật (`npm run dev`) — chỉ khi người dùng muốn thấy chuyển động.

Hình tạo ra cho bản thử là tư liệu, nằm trong `style/preview/` (không nằm trong `assets/` hay `public/`, nên không cần nhãn provenance và không bị đóng gói).

## 2. Kiểm trước khi đưa người dùng
| Kiểm | Cách |
| --- | --- |
| Đọc được | đối tượng gameplay phân biệt được khi chuyển ảnh sang thang xám; chữ/nền tương phản ≥ 4.5:1 |
| Không giống game gốc | đặt cạnh ảnh chụp game gốc (`reference/`): nhân vật, bảng màu, logo, bố cục HUD khác rõ |
| Không chữ trong ảnh | mọi chữ là text HTML/canvas, không nằm trong PNG |
| Vừa màn hình nhỏ | xem ở 390×844 và 844×390 (DevTools); nút ≥ 44 px CSS |

## 3. Người dùng chọn
Trình bày các bản thử cạnh nhau (đường dẫn ảnh/trang), kèm chi phí asset của từng hướng từ `style/direction.md`. Người dùng chọn (hoặc yêu cầu trộn/sửa). Ghi:

```markdown
## D-7 Style: "Vườn đêm" (hướng B)
- Chọn vì: …; bảng màu …; font …
- Bỏ: hướng A (lý do), C (lý do)
```

Mục "Đã chọn style (bạn)" trong `gates/P3.md` **chỉ người dùng tick**.

Tiếp theo: skill **asset-spec**.
