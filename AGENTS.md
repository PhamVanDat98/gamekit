# Phát triển plugin GameKit

- Script: Node ≥ 20, ESM, chỉ phụ thuộc `yaml` và `ajv`. Thông báo cho người dùng bằng tiếng Việt.
- Mỗi lệnh mới: thêm vào `scripts/gamekit.mjs` (COMMANDS + HELP), có test trong `tests/cli.test.mjs`.
- Template trong `templates/game/`: `{{NAME}}`, `{{TITLE}}`, `{{ENGINE}}`, `{{CREATED}}` được thay khi init. `.gitignore` lưu thành `_gitignore`. Phần riêng một engine: `templates/engines/<engine>/`, chép đè lên khi `init --engine <engine>`.
- Skill: frontmatter `name` + `description` (khi nào dùng). Cập nhật `AVAILABLE_SKILLS` trong `scripts/lib/phases.mjs` khi thêm skill.
- Trước khi commit: `npm test`; khi sửa template, tạo một game thử và chạy test/typecheck/lint/pack/release-check của nó.
