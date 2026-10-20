# GameKit trên Codex

- Codex đọc `AGENTS.md` trong thư mục game; file này trỏ tới luật và lệnh GameKit.
- Skill: chép hoặc symlink thư mục `skills/` của plugin vào thư mục skill Codex dùng (tuỳ phiên bản Codex), hoặc mở `SKILL.md` tương ứng khi cần.
- Không có hook: đầu mỗi session chạy `npm run gk -- status`.
- Dựng song song: mỗi worktree do `gamekit fanout` tạo mở một session Codex riêng, nhập: "Đọc .gamekit/local/BRIEF.md và làm theo."
- Tạo ảnh (P3): `npm run gk -- gen image` nếu có `OPENAI_API_KEY`; không thì `npm run gk -- gen prompt` lấy prompt từ `asset-manifest.json`, tạo ảnh bằng công cụ của Codex hay công cụ khác, rồi `npm run gk -- gen import <id> <file>` (khớp spec, gắn nhãn) và `review`.
