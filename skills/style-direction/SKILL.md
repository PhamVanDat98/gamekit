---
name: style-direction
description: Dùng đầu P3 khi làm lại game của người khác (source.ownership third-party) — chốt hướng thiết kế mới cho bản reskin (bối cảnh, nhân vật, bảng màu, font, âm thanh) sao cho khác rõ game gốc nhưng giữ nguyên gameplay, rồi đề xuất 2–3 hướng để skill style-preview dựng thử. Không dùng cho game của người dùng (own).
---

# Hướng style mới (P3, game làm lại)

Đầu vào: `spec/gameplay-spec.md`, `notes/assets.md` (danh sách asset gốc cần thay), `params/` (kích thước logic), `release.forbiddenTerms`. Đầu ra: `style/direction.md` với 2–3 hướng, mỗi hướng một mục. Người dùng chọn ở skill **style-preview**.

## Luật
- **Thiết kế mới, không phải vẽ lại.** Không mô tả hướng nào bằng "giống game gốc nhưng…", không nhắc tên, nhân vật, logo, nhạc của game gốc trong brief. Bối cảnh, nhân vật, bảng màu, font đều phải khác rõ.
- **Gameplay không đổi.** Hướng style chỉ đổi vẻ ngoài: không đổi params, `core/`, kích thước va chạm, tốc độ. Hình mới phải vừa kích thước logic trong `params/` (hitbox là con số trong params, không phải ảnh).
- **Đọc được khi chơi.** Thứ người chơi phải phân biệt (người chơi / kẻ địch / vật nhặt / nguy hiểm) cần khác nhau về **hình dạng và độ sáng**, không chỉ màu (người mù màu). Mọi thông tin gameplay phải có tín hiệu hình ảnh, không chỉ âm thanh.
- **Chữ không in vào ảnh** để dịch được (`t()` + `Language/*.json`).

## Mỗi hướng gồm
| Mục | Nội dung |
| --- | --- |
| Ý tưởng | 1–2 câu: bối cảnh, cảm giác (vui nhộn, tối giản, neon…) |
| Vai trò → hình | Mỗi đối tượng gameplay trong spec (người chơi, kẻ địch, vật nhặt, nền…) thành gì trong bối cảnh mới |
| Bảng màu | 5–8 màu hex: nền, chính, phụ, nguy hiểm, thưởng, chữ; độ tương phản chữ/nền ≥ 4.5:1 |
| Font | font chữ có license dùng web (Google Fonts, OFL…), hỗ trợ đủ ký tự của các ngôn ngữ trong `languages` |
| Cách làm asset | vector (SVG/CSS) cho UI; ảnh (vẽ tay, tạo bằng công cụ tạo hình nếu phiên có, hoặc mua license) cho nhân vật/nền — map sang `make` trong asset-manifest: `vector`, `image-gen`, `own`, `licensed` |
| Âm thanh | phong cách nhạc và hiệu ứng, nguồn (tự làm, tạo bằng công cụ, thư viện có license) |
| Tên game | 3–5 tên đề xuất, không chứa `forbiddenTerms` hay từ gần giống |
| Chi phí | số asset phải làm (từ `notes/assets.md`), phần nào khó |

Chọn hướng có số asset hợp với ngân sách P3 (`budget.plannedDays.P3`); hướng tối giản (hình khối + vector) thường rẻ và an toàn nhất.

## Kiểm
- Đọc lại từng hướng: có chỗ nào mô tả bằng tham chiếu tới game gốc? Có tên đề xuất nào trùng `forbiddenTerms` (`gamekit release-check` sẽ chặn sau)?
- `notes/assets.md` có đủ để đếm việc? Chưa có thì chạy skill **asset-inventory** trước.

Tiếp theo: skill **style-preview**.
