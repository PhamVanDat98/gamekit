---
name: style-analysis
description: Dùng khi người dùng đưa ảnh concept/tham khảo và muốn tạo bộ đồ hoạ mới cùng phong cách — reskin ở P3, hoặc làm thêm asset cho game của mình cho đồng bộ. Đo phong cách bằng `gamekit style analyze` (bảng màu, nét viền, cách tô, sáng/bão hoà), AI nhìn ảnh để điền phần hình khối và tỉ lệ vào art/style/style.md (kèm prompt cho Codex và token màu để vẽ bằng code), rồi chấm từng asset mới bằng `gamekit style check`.
---

# Phân tích phong cách đồ hoạ

Mục tiêu: một **style guide** đủ để vẽ asset **mới** trông cùng một bộ với ảnh tham khảo, và một phép đo để biết asset nào bị lệch. Học phong cách, không sao chép nội dung.

Hai nửa của việc phân tích:
| Phần | Ai làm | Vì sao |
| --- | --- | --- |
| Bảng màu (hex, diện tích), nét viền (có/không, màu, độ dày), cách tô (phẳng / cel / chuyển màu), sáng, bão hoà, nóng/lạnh | `gamekit style analyze` | Mắt người và AI đoán màu và độ dày nét rất sai; model tạo ảnh "trôi" màu sau vài ảnh |
| Ngôn ngữ hình khối, tỉ lệ, mắt/mặt, chất nét, cách đổ bóng, mức chi tiết, không khí | AI nhìn ảnh (mục "(nhìn)") | Số đo toàn cục không thấy được hình dạng |

## Luật
- **Phong cách, không phải nhân vật.** Được lấy: bảng màu, độ dày và màu nét, cách tô, tỉ lệ chung, mức chi tiết. Không lấy: nhân vật, logo, tên, bố cục, chi tiết nhận diện (trang phục đặc trưng, ký hiệu). Prompt và brief mô tả **thiết kế mới**, không viết "vẽ lại X", không gọi tên hoạ sĩ hay thương hiệu.
- Ảnh tham khảo từ game/hoạ sĩ khác (`third-party`): để trong `reference/` (gitignored), không commit, không đóng gói. Concept của chính người dùng: có thể để `art/concepts/`.
- `art/style/` (analysis.json, palette.png, style.md) là dữ liệu mới, được commit.

## Các bước
1. **Gom ảnh**: 3–8 ảnh, độ phân giải gốc, tốt nhất nền trong suốt hoặc nền phẳng. **Tách theo loại** vì bảng màu khác nhau: nhân vật, vật phẩm/icon, UI, nền — mỗi loại một lần analyze (`--out art/style/characters`, `art/style/ui`…). Ảnh cảnh có nền phức tạp vẫn đo được màu, nhưng không đo được nét viền.
2. **PNG**: lệnh chỉ đọc PNG; JPG/WebP đổi trước (`sips -s format png a.jpg --out a.png`, `magick a.jpg a.png`).
3. **Đo**: `npm run gk -- style analyze reference/style/*.png --name "<tên style>"` → `art/style/analysis.json`, `palette.png`, `style.md` (bản nháp; nếu đã có thì ghi `style.draft.md`).
4. **Nhìn**: mở từng ảnh tham khảo và `palette.png`, điền các mục "(nhìn)" trong `style.md` theo [checklist.md](references/checklist.md). Mẫu đã điền: [example-style.md](references/example-style.md). Đối chiếu với số đo, ví dụ:
   - đo ra hai màu cùng hue khác độ sáng → bóng cel cùng hue;
   - nét trong cao → nhiều line art bên trong, không chỉ viền ngoài.

   Số đo và mắt nói khác nhau → ghi cả hai, hỏi người dùng.
5. **Thử một asset**: vẽ một vật/nhân vật **mới** theo style — bằng code (token ở mục 9 của style.md) hoặc Codex (prompt ở mục 8, kèm 1–2 ảnh tham khảo bằng `--image`). Đặt cạnh ảnh tham khảo, chụp so sánh, chạy `npm run gk -- style check <ảnh>`; sửa style.md đến khi khớp.
6. **Người dùng duyệt** style.md + ảnh thử (mục "Đã chọn style (bạn)" ở cổng P3). Không tự tick.
7. **Làm cả bộ**: mỗi asset trong `asset-manifest.json` có `brief` dẫn tới style.md; asset xong chạy `style check` (cả thư mục được), nhãn provenance `generated`. Asset lệch: sửa hoặc vẽ lại, đừng hạ ngưỡng.

## Đọc kết quả `style check`
- **✘ bảng màu < 80%**: có màu không thuộc style; lệnh in các màu lạ kèm diện tích. Pixel pha ở mép giữa hai màu của style được tính là đúng.
- **✘ nét viền**: thiếu/thừa nét, hoặc dày gấp > 1.6× / mỏng < 0.6× so với style (tính theo % chiều cao vật thể, nên vật to nhỏ khác nhau vẫn so được). So các asset cùng loại: icon 64 px và nhân vật 300 px thường có nét khác nhau trong cùng một style; khi đó analyze riêng từng loại.
- **Màu mới có chủ đích** (vật mới cần màu ảnh tham khảo không có, vd ếch xanh lá): chọn màu theo quy tắc của style (độ sáng, độ bão hoà trong khoảng của bảng màu đo; bóng làm theo mục 2), hỏi người dùng, rồi thêm vào `style.extraPalette` trong `analysis.json`: `{ "hex": "#7cc46a", "why": "da ếch — nhân vật mới" }`. Analyze lại không xoá danh sách này.
- **⚠ cách tô / bão hoà / độ sáng / tông nóng-lạnh**: lệch nhưng có thể cố ý (vật phát sáng, đồ hiếm). Ghi lý do hoặc sửa.

## Giới hạn
- Chỉ PNG; ảnh lớn được thu về cạnh dài 1024 px khi đo (lấy mẫu điểm, không làm pha màu).
- Số đo là toàn cục: không biết bàn tay có mấy ngón hay mắt hình gì. Phần đó luôn cần nhìn.
- Pixel art: đo đúng màu và nét, nhưng hãy so ở kích thước gốc (đừng phóng to có làm mượt).
