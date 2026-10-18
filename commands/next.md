---
description: Làm bước tiếp theo của pipeline GameKit cho game hiện tại
---

1. Chạy `node "${CLAUDE_PLUGIN_ROOT}/scripts/gamekit.mjs" status` trong thư mục game (hoặc `npm run gk -- status` nếu biến CLAUDE_PLUGIN_ROOT không có).
2. Nếu có mục **Việc song song** (game chia mảng `re-plan.yaml` hoặc module `module-plan.yaml`), làm theo thứ tự:
   - "Xong, chờ integrate" → chạy lệnh `integrate … --ready` được gợi ý, báo đơn vị nào merge được, đơn vị nào lỗi và vì sao.
   - "Sẵn sàng, giao được ngay" → chạy `fanout … --ready`, rồi giao **mọi** worktree vừa mở cho subagent **trong cùng một lượt** (Claude Code: nhiều lần gọi Agent tool trong một tin nhắn; Codex: mỗi worktree một session). Prompt: "Làm việc trong thư mục <worktree>. Đọc .gamekit/local/BRIEF.md và làm theo. Trả lời bằng tóm tắt việc đã làm và đề xuất đổi phần dùng chung nếu có."
   - "Đang làm" → không giao lại; chờ subagent báo xong.
3. Không có việc song song: chọn việc đầu tiên còn mở ở cổng của pha hiện tại mà agent được phép làm (bỏ qua việc ghi "(bạn)" — đó là quyết định của người dùng, hỏi họ).
4. Nếu có skill GameKit cho việc đó, dùng skill đó. Skill chưa có trong bản này thì làm theo hướng dẫn chung trong using-gamekit và luật cứng.
5. Xong thì chạy `gamekit gate` và báo kết quả. Chỉ chạy `gamekit gate --advance` khi người dùng đồng ý sang pha sau.

$ARGUMENTS
