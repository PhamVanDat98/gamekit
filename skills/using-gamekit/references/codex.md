# GameKit trên Codex

- Codex đọc `AGENTS.md` trong thư mục game; file này trỏ tới luật và lệnh GameKit.
- Skill: chép hoặc symlink thư mục `skills/` của plugin vào thư mục skill Codex dùng (tuỳ phiên bản Codex), hoặc mở `SKILL.md` tương ứng khi cần.
- Không có hook: đầu mỗi session chạy `npm run gk -- status`.
- Dựng song song: mỗi worktree do `gamekit fanout` tạo mở một session Codex riêng, nhập: "Đọc .gamekit/local/BRIEF.md và làm theo."
- Vẽ ảnh raster (P3): `gamekit art gen` gọi `codex exec --full-auto --skip-git-repo-check "Đọc <brief> và làm theo…"` cho mỗi style (concept) hoặc mỗi lô asset, chạy song song. Brief ở `art/concepts/<style>/BRIEF.md` và `art/raw/BRIEF-<n>.md`; mỗi ảnh kèm file JSON ghi prompt và model.
- Codex cần công cụ tạo ảnh (có sẵn trong bản Codex, hoặc skill/script gọi API ảnh). Cách nào cần mạng thì thêm `-c sandbox_workspace_write.network_access=true`. Đổi lệnh: `art.command` trong `game.yaml` (`{prompt}` là chỗ đặt yêu cầu).
- Codex là agent chính thì vẫn dùng `gamekit art …` như trên. Mở `art/concepts/index.html` để người dùng chọn.
