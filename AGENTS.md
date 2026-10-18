# Phát triển plugin GameKit

- Script: Node ≥ 20, ESM, chỉ phụ thuộc `yaml` và `ajv`. Thông báo cho người dùng bằng tiếng Việt.
- Mỗi lệnh mới: thêm vào `scripts/gamekit.mjs` (COMMANDS + HELP), có test trong `tests/` (`cli`, `validate`, `provenance`, `gate`, `parallel`, `build`, `smoke` `.test.mjs` theo mảng; file nhỏ để `node --test` chạy song song).
- Template trong `templates/game/`: `{{NAME}}`, `{{TITLE}}`, `{{ENGINE}}`, `{{CREATED}}` được thay khi init. `.gitignore` lưu thành `_gitignore`.
- Skill: frontmatter `name` + `description` (khi nào dùng). Cập nhật `AVAILABLE_SKILLS` trong `scripts/lib/phases.mjs` khi thêm skill.
- Trước khi commit: `npm test`; khi sửa template, tạo một game thử và chạy test/typecheck/lint/pack/release-check/smoke của nó.
