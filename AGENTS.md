# Phát triển plugin GameKit

- Script: Node ≥ 20, ESM, chỉ phụ thuộc `yaml` và `ajv`. Thông báo cho người dùng bằng tiếng Việt.
- Mỗi lệnh mới: thêm vào `scripts/gamekit.mjs` (COMMANDS + HELP), có test trong `tests/cli.test.mjs`.
- Template trong `templates/game/`: `{{NAME}}`, `{{TITLE}}`, `{{ENGINE}}`, `{{CREATED}}` được thay khi init. `.gitignore` lưu thành `_gitignore`.
- Skill: frontmatter `name` + `description` (khi nào dùng; description có ": " thì đặt trong ngoặc kép). Thêm skill vào `PHASE_INFO` (hoặc `ENGINE_SKILLS`) trong `scripts/lib/phases.mjs` — `AVAILABLE_SKILLS` tính từ đó, `tests/skills.test.mjs` kiểm khớp với thư mục `skills/`.
- Trước khi commit: `npm test`; khi sửa template, tạo một game thử và chạy test/typecheck/lint/pack/release-check của nó.
