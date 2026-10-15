---
name: module-plan
description: Dùng ở đầu P2 khi game đủ lớn để dựng song song — chia game thành module, chốt contract và params, viết module-plan.yaml, rồi chạy gamekit fanout để giao mỗi module cho một subagent trên git worktree riêng.
---

# Lập kế hoạch module và chia việc

Chạy song song chỉ an toàn khi **contract được chốt trước**. Agent chính làm toàn bộ skill này tuần tự; subagent chỉ bắt đầu sau `fanout`.

## Khi nào không chia
- Game ít cơ chế, vài file: làm tuần tự (rebuild-game). Ghi lý do vào DECISIONS.md.
- Module dự kiến nhỏ hơn chi phí viết brief + merge.

## Các bước
1. **Đọc** `spec/`, `params/`, `notes/`. Liệt kê cơ chế → nhóm thành module theo **thư mục**, không theo tính năng rải nhiều file.
2. **Contract** trong `src/contracts/`: type state, event, input, API giữa module. Viết đủ để mỗi module code và test độc lập.
3. **Params**: đủ số liệu cho mọi module, có `source`.
4. **Stub**: mỗi module một file export hàm rỗng/throw `not implemented` đúng chữ ký contract, để project build và typecheck được ngay.
5. **module-plan.yaml** (xem `module-plan.example.yaml` trong game, schema `.gamekit/schemas/module-plan.schema.json`):
   - `shared`: `src/contracts/`, `params/`, `package.json`, `package-lock.json`, `game.yaml`, `module-plan.yaml` và mọi file dùng chung khác — chỉ agent chính sửa.
   - Mỗi module: `id`, `wave`, `owns` (thư mục, mỗi file một chủ), `dependsOn` (chỉ module ở đợt trước), `contracts`, `tests`, `brief` (trích spec liên quan + tiêu chí parity cụ thể).
   - Đợt điển hình: 1 = các `core/*` + `view/ui` trên state giả + asset; 2 = `view/scene`, `view/fx`, input; 3 = tích hợp.
   - `maxParallel`: 3–5.
6. `gamekit validate` sạch (kiểm tra trùng sở hữu, phụ thuộc sai đợt, đụng vùng shared) → commit lên `main`.
7. `gamekit fanout --wave 1`: tạo worktree `../<game>.worktrees/<id>` trên nhánh `mod/<id>`, viết `.gamekit/local/BRIEF.md`, symlink `node_modules`.

## Giao việc
- **Claude Code**: trong cùng một lượt, gọi Agent tool cho từng module (song song), prompt: "Làm việc trong thư mục <worktree>. Đọc .gamekit/local/BRIEF.md và làm theo. Dùng TDD cho core/. Trả lời bằng tóm tắt việc đã làm và đề xuất đổi contract nếu có."
- **Codex**: mỗi worktree một session.
- Subagent đề xuất đổi contract → agent chính quyết, sửa trên `main`, rebase/giao lại module bị ảnh hưởng. Subagent không tự sửa vùng shared (`check-ownership` chặn).

Xong đợt → skill **integrate**.
