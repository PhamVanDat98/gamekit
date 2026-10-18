# GameKit trên Codex

- Codex đọc `AGENTS.md` trong thư mục game; file này trỏ tới luật và lệnh GameKit.
- Skill: chép hoặc symlink thư mục `skills/` của plugin vào thư mục skill Codex dùng (tuỳ phiên bản Codex), hoặc mở `SKILL.md` tương ứng khi cần.
- Không có hook: đầu mỗi session chạy `npm run gk -- status`.
- Phân tích / dựng song song: mỗi worktree do `gamekit fanout --plan re --ready` (mảng) hoặc `gamekit fanout --ready` (module) tạo mở một session Codex riêng, nhập: "Đọc .gamekit/local/BRIEF.md và làm theo." `npm run gk -- status` cho biết mảng/module nào xong, đang làm, sẵn sàng.
- Tạo ảnh (P3, dự án con 5): Codex nhận art brief từ `asset-manifest.json`, kết quả quay lại qua hậu xử lý và `validate`.
