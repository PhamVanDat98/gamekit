# Phát triển plugin GameKit

- Script: Node ≥ 20, ESM, chỉ phụ thuộc `yaml` và `ajv`. Thông báo cho người dùng bằng tiếng Việt.
- Mỗi lệnh mới: thêm vào `scripts/gamekit.mjs` (COMMANDS + HELP), có test trong `tests/cli.test.mjs`.
- Template trong `templates/game/`: `{{NAME}}`, `{{TITLE}}`, `{{ENGINE}}`, `{{CREATED}}` được thay khi init. `.gitignore` lưu thành `_gitignore`.
- Skill: frontmatter `name` + `description` (khi nào dùng). Cập nhật `AVAILABLE_SKILLS` trong `scripts/lib/phases.mjs` khi thêm skill.
- Trước khi commit: `npm test`; khi sửa template hoặc smoke/pack, chạy thêm `GK_E2E=1 npm test` (game thật + Chromium) hoặc tạo một game thử và chạy test/typecheck/lint/smoke/pack/release-check của nó.
- Sửa skill: chạy `claude plugin eval . --scaffold --allow-tools Bash Edit Write --no-publish` khi có thể (xem README).
