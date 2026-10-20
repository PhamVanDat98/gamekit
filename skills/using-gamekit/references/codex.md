# GameKit trên Codex

- Codex đọc `AGENTS.md` trong thư mục game; file này trỏ tới luật và lệnh GameKit.
- Skill: chép hoặc symlink thư mục `skills/` của plugin vào thư mục skill Codex dùng (tuỳ phiên bản Codex), hoặc mở `SKILL.md` tương ứng khi cần.
- Không có hook: đầu mỗi session chạy `npm run gk -- status`.
- Dựng song song: mỗi worktree do `gamekit fanout` tạo mở một session Codex riêng, nhập: "Đọc .gamekit/local/BRIEF.md và làm theo."
- Tạo ảnh (P3, skill `replace-graphics`): Codex nhận art brief từ `asset-manifest.json`; pixel art dùng pxl (`make: pixel-code`), voxel dùng `voxel-art` (`make: voxel-code`), còn lại dùng `game-raster-art` (`make: image-gen`: `image_gen` có sẵn của Codex, không API key, + hậu xử lý `gameart.py`); kết quả qua hậu xử lý và `validate`. Danh sách skill art cho Codex: `skills/replace-graphics/references/art-tools.md`.
- Skill vẽ art của GameKit cho Codex: `cp -r art-skills/game-raster-art art-skills/game-animation art-skills/voxel-art ~/.codex/skills/` + `pip install pillow` (xem `art-skills/README.md`), gọi `$game-raster-art` / `$game-animation` / `$voxel-art`.
