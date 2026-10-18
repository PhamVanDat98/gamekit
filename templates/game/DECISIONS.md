# Quyết định

Ghi lý do cho mọi lựa chọn quan trọng và **mọi sai khác so với game gốc**. Sai khác chỉ hợp lệ khi có mục ở đây và được người dùng duyệt (`deviation.approved: true` trong params).

Mã quyết định:
- `D-n` (D-1, D-2…): ghi ở file này, chỉ agent chính.
- `D-<mảng>-n` (D-player-1…): khi chia RE/dựng lại theo mảng chạy song song, mỗi mảng ghi quyết định của mình vào `notes/<mảng>/decisions.md`, đánh số riêng — không mảng nào sửa file này, nên không trùng số, không xung đột merge. `validate` chặn mã trùng và mã sai mảng.

Mẫu (chép ra ngoài khối này, đánh số tăng dần):

```markdown
## D-1 Tiêu đề ngắn
- Ngày: YYYY-MM-DD
- Bối cảnh: …
- Quyết định: …
- Sai khác game gốc: có/không — tham số nào, gốc là gì, mới là gì
- Duyệt: chờ / đã duyệt bởi …
```
